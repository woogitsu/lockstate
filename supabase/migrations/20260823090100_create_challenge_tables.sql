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

-- "Public" means every definition that has actually gone live -- not every
-- row in the table.
--
-- The `definition` jsonb is the whole challenge: seed, objectives and
-- scoring. A `using (true)` policy handed that to anyone holding the
-- publishable key, for challenges that had not opened yet, so a visitor
-- could `GET /rest/v1/challenge_definitions?select=*`, solve a future
-- challenge offline at leisure and submit the instant it opened. Nothing
-- else caught it: `submit_challenge_evidence` enforces the submission
-- window, but a read is not a submission.
--
-- Both bounds are checked because they answer different questions.
-- `published_at` is the staging switch (a row can be inserted ahead of
-- time and become visible on schedule); `opens_at` is the fairness one
-- (everybody sees the seed at the same moment). `closes_at` is
-- deliberately NOT a bound: a definition must stay readable after the
-- challenge ends so past results remain independently verifiable against
-- the bytes that were signed.
create policy "challenge_definitions_public_read"
  on public.challenge_definitions for select
  using (published_at <= now() and opens_at <= now());

-- Reachability for both Data API roles, and it has to be granted: since
-- Supabase stopped auto-exposing new `public` tables (see the prisons
-- migration), the policy above on its own reaches nobody.
grant select on public.challenge_definitions to anon, authenticated;

revoke insert, update, delete on public.challenge_definitions from authenticated, anon;

-- Trusted server surface (ADR 0008 zone Z2).
--
-- `service_role` starts with no table privilege whatsoever: Supabase's
-- `alter default privileges ... revoke select, insert, update, delete on
-- tables` names it alongside `anon` and `authenticated`, and its BYPASSRLS
-- attribute decides which *rows* it sees, never whether it may touch the
-- table. Every trusted privilege therefore has to be granted here, one at
-- a time, exactly like the client ones above.
--
-- SELECT: the verifier replays evidence against the definition it was
-- produced under (`src/services/challenges/verification.ts` is handed a
-- `ChallengeDefinition`), and it must be able to read one that the RLS
-- policy above is deliberately hiding from clients.
-- INSERT: publishing a signed definition is a Z2 action -- ADR 0008's
-- authority table reads "Challenge definitions | Z2 published".
-- No UPDATE, no DELETE: the signature covers the stored bytes, so a
-- published definition is immutable and a correction is a new `version`.
grant select, insert on public.challenge_definitions to service_role;

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
  -- SUPERSEDED, and it did not do what this comment claimed. `evidence_hash`
  -- is caller-asserted and nothing checked it, so lying about it produced a
  -- second ranked row for the same run -- executed and demonstrated in issue
  -- #105 finding 1 (three `submitted` rows holding byte-identical evidence
  -- under three fabricated hashes).
  -- 20260824100000_bind_challenge_evidence_to_payload.sql drops this
  -- constraint and replaces it with
  -- `challenge_submissions_unique_evidence_digest` over `evidence_digest`, a
  -- stored generated column the server computes from the payload. The
  -- original intent below is the intent that constraint implements; the
  -- column it named was the wrong one.
  --
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

-- Trusted verifier surface (ADR 0008 zone Z2, ADR 0009 step 6).
--
-- SELECT: the verifier reads pending rows and the evidence attached to
-- them; that is the input to the replay.
-- UPDATE, on exactly the four verdict columns: advancing a submission out
-- of 'pending' is the verifier's entire job, and unlike the entitlement
-- ledger there is no SECURITY DEFINER function that does it, so this is a
-- genuine table write by the trusted role. It is column-scoped for the
-- same reason `prisons` is: a compromised verifier should not be able to
-- re-point a submission at a different account or rewrite the evidence it
-- claims to have replayed. `enforce_challenge_verification_transition`
-- still applies on top, so the verdict is also one-way.
-- No INSERT: submissions enter only through submit_challenge_evidence(),
-- which binds `user_id` to the caller's own JWT subject. A trusted INSERT
-- would be a way to manufacture a submission on someone's behalf.
-- No DELETE: no trusted path removes a submission; account deletion
-- cascades from auth.users.
grant select on public.challenge_submissions to service_role;
grant update (verification_status, rejection_code, ranked_score, verified_at)
  on public.challenge_submissions to service_role;

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
--
-- SUPERSEDED by 20260824100100_harden_submit_challenge_evidence.sql (issue
-- #105 findings 1 and 2), which is the current definition: the version
-- below validates nothing about the payload it files, dedups on the
-- caller's claimed hash, raises `P0001` rather than `42501` when there is
-- no identity, and answers a collision with another account's row by
-- returning that row's `submission_id`. It is left here unedited because
-- migrations are appended rather than rewritten; read the later file for
-- what this function now does.
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
-- `pg_temp` is listed explicitly, and last, in every SECURITY DEFINER
-- function in this schema. Omitting it does not remove it: PostgreSQL
-- searches the temporary schema *first* for relation and type names when
-- it is not named, which is the classic SECURITY DEFINER hijack and what
-- Supabase's own `function_search_path_mutable` linter flags. Every
-- reference below is schema-qualified, so no exploit exists today; this
-- makes that a property of the declaration rather than of the body, and
-- this function is reachable by any anonymously-signed-in user.
set search_path = public, pg_temp
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
--
-- `service_role` is named for the same reason `anon` is: on a legacy
-- auto-exposing project it holds its own default EXECUTE, and this is a
-- player-identity RPC (it reads auth.uid()) that the trusted role has no
-- business calling. Failing on a privilege check is a better boundary than
-- failing on a null subject.
revoke all on function public.submit_challenge_evidence(text, int, text, jsonb, jsonb) from public, anon, service_role;
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

-- `service_role` too: a non-`security_invoker` view runs with its owner's
-- rights, so leaving the trusted role a grant on it would create a second
-- reader of challenge_submissions that the column grants above do not
-- describe. The verifier reads the base table.
revoke all on public.challenge_leaderboard from anon, authenticated, service_role;
