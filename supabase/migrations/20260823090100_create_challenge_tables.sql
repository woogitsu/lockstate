-- Signed challenge definitions and evidence submissions (issue #36,
-- ADR 0009). The client can play, verify a definition's signature and
-- submit evidence; it can never mark its own result verified, never write
-- a score, and never see another account's submission.
--
-- EXECUTED against the real Supabase local stack (`supabase db reset &&
-- supabase test db`) and against plain PostgreSQL via `pnpm verify:sql`,
-- covered by supabase/tests/002_entitlement_ledger_and_challenges.test.sql
-- and supabase/tests/003_data_api_grants.test.sql. See
-- docs/TRUSTED_SERVICES.md for what each of those does and does not prove.

-- Published, signed definitions. Public read: the definition is meant to
-- be verifiable offline by anyone, which is precisely why it is signed.
create table if not exists public.challenge_definitions (
  challenge_id text not null check (char_length(challenge_id) between 1 and 128),
  version int not null check (version >= 1),
  -- The exact JSON that was signed. Stored whole rather than as columns so
  -- the canonical bytes the signature covers are never reassembled -- and
  -- possibly altered -- by this schema.
  definition jsonb not null,
  definition_hash text not null check (definition_hash ~ '^[0-9a-f]{16}$'),
  signature jsonb not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  published_at timestamptz not null default now(),
  primary key (challenge_id, version),
  constraint challenge_definitions_window check (closes_at > opens_at)
);

alter table public.challenge_definitions enable row level security;

create policy "challenge_definitions_public_read"
  on public.challenge_definitions for select
  using (true);

-- "Public read" means both Data API roles, and it has to be granted: since
-- Supabase stopped auto-exposing new `public` tables (see the prisons
-- migration), a `using (true)` policy on its own reaches nobody.
grant select on public.challenge_definitions to anon, authenticated;

revoke insert, update, delete on public.challenge_definitions from authenticated, anon;

-- Submissions. `verification_status` starts at 'pending' and is advanced
-- only by the trusted verifier running with the service role; there is no
-- client write grant at all, so the column cannot be set from a browser
-- (ADR 0009 "the tier is server-assigned").
create table if not exists public.challenge_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id text not null,
  challenge_version int not null,
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{16}$'),
  evidence jsonb not null,
  claimed_metrics jsonb not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'unverified', 'rejected')),
  rejection_code text,
  -- Only ever the replay's own score; null until verification succeeds.
  ranked_score double precision,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  foreign key (challenge_id, challenge_version)
    references public.challenge_definitions (challenge_id, version),
  -- Resubmitting identical evidence, or replaying someone else's capture,
  -- cannot create a second ranked row (ADR 0008 threat T3).
  constraint challenge_submissions_unique_evidence unique (challenge_id, challenge_version, evidence_hash),
  constraint challenge_submissions_verified_has_score
    check (verification_status <> 'verified' or ranked_score is not null),
  constraint challenge_submissions_rejected_has_code
    check (verification_status <> 'rejected' or rejection_code is not null)
);

create index if not exists challenge_submissions_ranking_idx
  on public.challenge_submissions (challenge_id, challenge_version, ranked_score)
  where verification_status = 'verified';

alter table public.challenge_submissions enable row level security;

create policy "challenge_submissions_select_own"
  on public.challenge_submissions for select
  using (auth.uid() = user_id);

-- A player may read their own submissions; that read needs the grant for
-- the same reason as every other table here.
grant select on public.challenge_submissions to authenticated;

revoke insert, update, delete on public.challenge_submissions from authenticated, anon;

-- Verification is a one-way door out of 'pending'. Re-verifying a settled
-- submission would let a later, differently-configured verifier silently
-- rewrite a published result; a re-run must create a new submission.
create or replace function public.enforce_challenge_verification_transition()
returns trigger
language plpgsql
as $$
begin
  if old.verification_status <> 'pending' and new.verification_status <> old.verification_status then
    raise exception 'challenge submission % is already %, and cannot be re-verified', old.submission_id, old.verification_status;
  end if;
  if new.evidence_hash <> old.evidence_hash or new.evidence <> old.evidence then
    raise exception 'challenge evidence is immutable once submitted (%).', old.submission_id;
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_submissions_verification_transition on public.challenge_submissions;
create trigger challenge_submissions_verification_transition
  before update on public.challenge_submissions
  for each row execute function public.enforce_challenge_verification_transition();

-- The only client write path: records evidence as 'pending' for the
-- authenticated caller. `SECURITY DEFINER` bypasses RLS, so the
-- `auth.uid()` check below is the actual authorization control
-- (same rule as create_save_version, docs/CLOUD_SAVE.md).
create or replace function public.submit_challenge_evidence(
  p_challenge_id text,
  p_challenge_version int,
  p_evidence_hash text,
  p_evidence jsonb,
  p_claimed_metrics jsonb
) returns table (
  status text, -- 'submitted' | 'duplicate'
  submission_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_submission_id uuid;
  v_definition record;
begin
  if v_user_id is null then
    raise exception 'submit_challenge_evidence requires an authenticated caller';
  end if;

  select opens_at, closes_at into v_definition
  from public.challenge_definitions
  where challenge_id = p_challenge_id
    and version = p_challenge_version;

  if not found then
    raise exception 'unknown challenge % version %', p_challenge_id, p_challenge_version;
  end if;

  -- The submission window is enforced here as well as in the verifier: a
  -- closed challenge should not accumulate storage it will only reject.
  if now() < v_definition.opens_at or now() >= v_definition.closes_at then
    raise exception 'challenge % version % is not open for submissions', p_challenge_id, p_challenge_version;
  end if;

  select s.submission_id into v_existing
  from public.challenge_submissions s
  where s.challenge_id = p_challenge_id
    and s.challenge_version = p_challenge_version
    and s.evidence_hash = p_evidence_hash;

  if v_existing is not null then
    return query select 'duplicate'::text, v_existing;
    return;
  end if;

  insert into public.challenge_submissions (
    user_id, challenge_id, challenge_version, evidence_hash, evidence, claimed_metrics
  ) values (
    v_user_id, p_challenge_id, p_challenge_version, p_evidence_hash, p_evidence, p_claimed_metrics
  )
  returning challenge_submissions.submission_id into v_submission_id;

  return query select 'submitted'::text, v_submission_id;
end;
$$;

-- Explicit revoke-then-grant, matching create_save_version(): a function's
-- default PUBLIC EXECUTE is not something to rely on for a write path.
-- Supabase's `alter default privileges ... revoke execute on functions`
-- only drops the roles' *own* grant and leaves PUBLIC's built-in EXECUTE
-- intact, so without this `anon` can call this RPC too -- it fails on the
-- `auth.uid() is null` check above rather than on a privilege check, which
-- is a weaker place for the boundary to sit.
revoke all on function public.submit_challenge_evidence(text, int, text, jsonb, jsonb) from public, anon;
grant execute on function public.submit_challenge_evidence(text, int, text, jsonb, jsonb) to authenticated;

-- Public ranking surface. Deliberately exposes no account identity: what a
-- leaderboard row may reveal about a player is a privacy decision, not a
-- technical one, and ADR 0009 gates public ranking on making it
-- explicitly. Until then this view is verified scores only, and the view
-- (not the base table) is what any public read would target.
create or replace view public.challenge_leaderboard as
select
  challenge_id,
  challenge_version,
  ranked_score,
  verified_at
from public.challenge_submissions
where verification_status = 'verified'
  and ranked_score is not null;

revoke all on public.challenge_leaderboard from anon, authenticated;
