-- `submit_challenge_evidence()` stops answering the question RLS refuses
-- to answer: whether an unpublished challenge definition exists (issue
-- #105 finding 9).
--
-- WHAT WAS WRONG, by execution, as `authenticated` inside an explicit
-- transaction block with `select current_user` read back. Three definitions
-- were staged -- one hidden by both bounds of
-- `challenge_definitions_public_read` (published and opening tomorrow), one
-- hidden by the `published_at` bound alone (already open, publishes
-- tomorrow), one visible and closed -- and the RPC was called for each,
-- plus for a challenge id that does not exist at all:
--
--   (a) no such definition                      -> P0001 'unknown challenge challenge.no-such-thing version 1'
--   (b) exists, unpublished and unopened        -> P0001 'challenge challenge.sealed version 1 is not open for submissions'
--   (c) exists, open but unpublished            -> status = 'submitted'
--   (d) visible challenge, non-existent version -> P0001 'unknown challenge challenge.finished version 2'
--   (e) visible, closed definition              -> P0001 'challenge challenge.finished version 1 is not open for submissions'
--
-- (a) against (b) is the finding: two different answers, so a caller that
-- cannot see a row can still ask whether it exists, one guessed id at a
-- time, through a function `anon` cannot call but any anonymously-signed-in
-- identity can. What leaks is not the definition -- the seed, objectives
-- and scoring stay unreadable -- but its existence and version numbering,
-- which is precisely the "a challenge is coming, and it is called this"
-- fact the `published_at` bound exists to hold back.
--
-- (c) IS MORE THAN AN ORACLE AND IS NOT IN #105's WORDING, so it is
-- recorded here rather than folded in silently: this function read the
-- definition table as its owner and enforced only `opens_at`/`closes_at`,
-- so a definition that had opened but had NOT been published accepted
-- submissions. A row went in, keyed and ranked, against a definition no
-- client was allowed to read. `published_at` was a read-side switch with no
-- write-side counterpart.
--
-- WHAT THIS CHANGES. The lookup now applies the read policy's own
-- predicate, so "not there" and "there but not yours to know about"
-- become one answer, produced by one `raise` statement -- not two
-- statements that happen to share a wording, which is a comment away from
-- drifting apart. Cases (a) through (d) all become:
--
--   P0001 'challenge % version % is not available for submissions'
--
-- WHAT IS DELIBERATELY STILL DISTINGUISHABLE, and why that is not the
-- finding reappearing. Case (e) -- a definition that IS published and HAS
-- opened, but whose window has closed -- keeps its own message. Reaching
-- that branch now requires satisfying `published_at <= now() and opens_at
-- <= now()`, which is exactly `challenge_definitions_public_read`, and both
-- `anon` and `authenticated` hold SELECT on the table. So the closed
-- message is only ever produced for a row the caller can read for itself,
-- `closes_at` column included: it discloses nothing the caller could not
-- have SELECTed a moment earlier. That is the tension #105 finding 9 sets
-- up, resolved in favour of telling a legitimate client something useful
-- exactly where telling it costs nothing.
--
-- WHAT A LEGITIMATE CLIENT CAN STILL LEARN, stated as the contract rather
-- than left to be inferred: for a definition it can read -- which is every
-- definition it could have played -- whether the submission window is
-- still open, whether its evidence duplicates its own earlier submission
-- (`duplicate`), whether the same evidence is already recorded by somebody
-- (`conflict`, no id -- 20260824100100), and every validation refusal
-- about the payload it sent. For anything it cannot read, one answer,
-- identical whether or not the definition exists.
--
-- WHY NOT A DISTINCT SQLSTATE for the merged refusal. Every other
-- validation refusal in this function raises `P0001`, and giving this one
-- an `LS0xx` of its own would hand a prober a machine-readable marker for
-- the branch whose whole purpose is to be uninformative. `LS001`-`LS003`
-- exist because a *legitimate* client has to act differently on them.
--
-- WHY THE PREDICATE IS DUPLICATED FROM THE POLICY rather than shared. The
-- policy is enforced against the *caller*; this function is SECURITY
-- DEFINER and runs as the table owner, who is exempt from RLS, so there is
-- no way to make the row-visibility rule apply to itself here. A
-- `security_invoker` view would not help either: inside a definer function
-- the invoker *is* the owner. The duplication is therefore structural, and
-- it is guarded rather than trusted --
-- supabase/tests/002_entitlement_ledger_and_challenges.test.sql now
-- asserts the policy's expression as the catalog renders it, so a future
-- migration that widens or narrows the read policy fails the gate here and
-- has to come back to this function.
--
-- Nothing else about the function changes: the identity check, the payload
-- validation, the digest dedup, the advisory lock and the three statuses
-- are 20260824100100's, reproduced unedited so this file is the whole
-- current definition rather than a diff a reader has to apply.
--
-- NO DATA MIGRATES: this is a function body. Existing submissions are
-- untouched, and `challenge_submissions` is empty everywhere for the reason
-- 20260824100000 sets out (its foreign key requires a published
-- definition, and the Z2 publisher is deliberately not built).
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`. NOT executed against the real Supabase local stack or a
-- hosted project; see docs/CLOUD_SAVE.md, "What has and has not been
-- executed".

create or replace function public.submit_challenge_evidence(
  p_challenge_id text,
  p_challenge_version int,
  p_evidence_hash text,
  p_evidence jsonb,
  p_claimed_metrics jsonb
) returns table (
  status text, -- 'submitted' | 'duplicate' | 'conflict'
  submission_id uuid
)
language plpgsql
security definer
-- `pg_temp` explicitly last, as in every SECURITY DEFINER function in this
-- schema; 20260823090100 carries the full argument and
-- supabase/tests/005_function_security_declarations.test.sql is what fails
-- if it is dropped or reordered.
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  -- The same expression as the generated column, so the lookup below and
  -- the unique constraint agree by construction (20260824100000).
  v_digest bytea := sha256(jsonb_send(p_evidence));
  v_existing_id uuid;
  v_existing_user uuid;
  v_submission_id uuid;
  v_definition record;
begin
  -- Fail closed on identity, with the SQLSTATE `create_prison()` and
  -- `create_save_version()` use, so "no identity" and "bad input" are
  -- distinguishable to a caller (issue #105 finding 1's migration).
  if v_user_id is null then
    raise exception 'an authenticated identity is required to submit challenge evidence'
      using errcode = '42501';
  end if;

  -- --- Validate (ADR 0008 §3 step 3) ----------------------------------
  --
  -- Unchanged from 20260824100100, including the reasoning: this is not a
  -- SQL re-implementation of `challengeEvidenceSchema` (that is the
  -- verifier's, ADR 0009 step 1), only the part the verifier structurally
  -- cannot check -- that the payload agrees with the row it is filed
  -- under. `is distinct from` throughout, because a NULL operand makes
  -- `<>` evaluate to UNKNOWN and the check silently pass.
  --
  -- The object check is a message-quality check rather than an independent
  -- control -- every non-object payload also fails the `challengeId` check
  -- below, which is NULL-safe -- and 20260824100100 records that as a
  -- surviving mutation rather than implying otherwise.
  if jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'challenge evidence must be a JSON object, not %', coalesce(jsonb_typeof(p_evidence), 'null');
  end if;

  if jsonb_typeof(p_evidence -> 'challengeId') is distinct from 'string'
     or p_evidence ->> 'challengeId' is distinct from p_challenge_id then
    raise exception 'challenge evidence names challenge %, but is being filed under %',
      coalesce(p_evidence ->> 'challengeId', '<missing>'), coalesce(p_challenge_id, '<null>');
  end if;

  -- Compared as a number so `1.0` is version 1; the type check is first so
  -- the `::numeric` cast is never reached for a string or a boolean.
  if jsonb_typeof(p_evidence -> 'challengeVersion') is distinct from 'number'
     or (p_evidence ->> 'challengeVersion')::numeric is distinct from p_challenge_version::numeric then
    raise exception 'challenge evidence names version %, but is being filed under version %',
      coalesce(p_evidence ->> 'challengeVersion', '<missing>'), coalesce(p_challenge_version::text, '<null>');
  end if;

  -- The client's `evidence_hash` is still not checked here and still keys
  -- nothing: it is FNV-1a over `canonicalJson`, which this tier cannot
  -- recompute (see 20260824100000). The verifier contradicts it
  -- (`evidence-hash-mismatch`, src/services/challenges/verification.ts).

  -- --- Resolve the definition, through the read policy's own eyes ------
  --
  -- THE TWO ADDED PREDICATES ARE THE FIX FOR #105 FINDING 9.
  -- `challenge_definitions_public_read` is `published_at <= now() and
  -- opens_at <= now()`; this function is SECURITY DEFINER and therefore
  -- exempt from it, so the predicate is applied by hand. A definition this
  -- caller could not have read is a definition this function must behave as
  -- if it had never heard of -- both for the answer it gives (below) and
  -- for the row it would otherwise accept.
  --
  -- `opens_at` doing double duty is why the old `now() < opens_at` check is
  -- gone rather than kept alongside: an unopened definition is hidden, so
  -- it is refused by the merged branch, and a second check would have been
  -- unreachable code that a reader would nonetheless trust.
  select closes_at into v_definition
  from public.challenge_definitions
  where challenge_id = p_challenge_id
    and version = p_challenge_version
    and published_at <= now()
    and opens_at <= now();

  -- ONE `raise` FOR BOTH CASES, deliberately: "no such definition" and
  -- "a definition exists that you are not allowed to know about" must be
  -- indistinguishable, and the way to make two answers identical forever
  -- is for there to be one answer. The message says nothing about
  -- existence in either direction and echoes back only what the caller
  -- itself supplied.
  if not found then
    raise exception 'challenge % version % is not available for submissions', p_challenge_id, p_challenge_version;
  end if;

  -- Reachable only for a row the caller can SELECT for itself (see this
  -- file's header), so naming the closed window discloses nothing. A
  -- closed challenge should also not accumulate storage the verifier will
  -- only reject.
  if now() >= v_definition.closes_at then
    raise exception 'challenge % version % is closed for submissions', p_challenge_id, p_challenge_version;
  end if;

  -- --- Deduplicate (ADR 0008 §3 step 4) -------------------------------
  --
  -- Unchanged from 20260824100100: the advisory lock is keyed on the dedup
  -- key itself, so it serializes only submissions of the same evidence for
  -- the same challenge, and "look, then insert" stops being a race that
  -- returns `23505` instead of a status.
  perform pg_advisory_xact_lock(
    hashtextextended(p_challenge_id || ':' || p_challenge_version::text || ':' || encode(v_digest, 'hex'), 0)
  );

  select s.submission_id, s.user_id into v_existing_id, v_existing_user
  from public.challenge_submissions s
  where s.challenge_id = p_challenge_id
    and s.challenge_version = p_challenge_version
    and s.evidence_digest = v_digest;

  if v_existing_id is not null then
    -- The caller's own earlier submission: an idempotent replay, and the
    -- id returned is a row they can read under
    -- `challenge_submissions_select_own`.
    if v_existing_user = v_user_id then
      return query select 'duplicate'::text, v_existing_id;
      return;
    end if;

    -- Somebody else's row: `conflict` with no id, so no account is handed
    -- another account's primary key (#105 finding 2). What it discloses is
    -- bounded and intentional -- that this exact evidence is already
    -- recorded, to a caller who already holds the exact bytes -- and it
    -- says nothing about whose row it is.
    return query select 'conflict'::text, null::uuid;
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

-- Privileges restated rather than assumed, as everywhere else in this
-- schema: `create or replace function` preserves the ACL, and a reader of
-- this file should not have to open two earlier migrations to learn who may
-- call it. Unchanged: `authenticated` only. `anon` and `service_role` are
-- named alongside PUBLIC because a revoke from PUBLIC does not remove a
-- role's own default grant on a project created before Supabase stopped
-- auto-exposing new entities in `public`.
revoke all on function public.submit_challenge_evidence(text, int, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.submit_challenge_evidence(text, int, text, jsonb, jsonb) to authenticated;
