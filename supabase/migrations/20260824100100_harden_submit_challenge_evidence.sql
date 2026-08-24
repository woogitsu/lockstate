-- `submit_challenge_evidence()` is brought up to the shape ADR 0008 §3 asks
-- of every Z2 entry point (issue #105 findings 1 and 2). Three changes: it
-- fails closed on identity the way `create_prison()` does -- the check was
-- always there, the SQLSTATE was not -- it validates the payload it is
-- filing instead of taking the caller's word for what the payload is, and
-- it answers a duplicate from the caller's own account differently from a
-- collision with somebody else's row.
--
-- The table half of the same work is
-- 20260824100000_bind_challenge_evidence_to_payload.sql: the server-
-- computed `evidence_digest`, the unique constraint over it, and the
-- payload ceiling. That file is the enforcement; this one is the front
-- door, the same division as `enforce_prison_slot_capacity()` and
-- `create_prison()` in 20260823100000_bound_free_tier_capacity.sql. Every
-- refusal below is *also* refused by the table if a future writer skips
-- this function -- except the two cross-field checks, which are noted as
-- such where they appear.
--
-- WHAT #105 DEMONSTRATED, and which line answers it:
--   * three `submitted` rows holding byte-identical evidence under three
--     fabricated hashes -> the dedup lookup below keys on
--     `evidence_digest`, and the unique constraint refuses the insert even
--     if this lookup is ever removed;
--   * an 8,388,619-byte evidence blob accepted (8,388,649 as reproduced
--     here) -> `LS003` from
--     `enforce_challenge_evidence_size()`, raised through this function;
--   * evidence whose own `challengeId` disagreed with the row it was filed
--     under -> the cross-field checks below.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`, with every role-switched probe inside an explicit
-- transaction block and `select current_user` read back. NOT executed
-- against the real Supabase local stack or a hosted project; see
-- docs/CLOUD_SAVE.md, "What has and has not been executed".

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
-- `pg_temp` is listed explicitly, and last, in every SECURITY DEFINER
-- function in this schema; the original of this function carries the full
-- argument for why, and supabase/tests/005_function_security_declarations.test.sql
-- is what fails if it is ever dropped or reordered.
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  -- Computed here from the same expression as the generated column, so the
  -- lookup below and the constraint agree by construction. If they ever
  -- disagreed, the insert would raise `23505` instead of returning a
  -- status -- a worse answer, but never a wrong row.
  v_digest bytea := sha256(jsonb_send(p_evidence));
  v_existing_id uuid;
  v_existing_user uuid;
  v_submission_id uuid;
  v_definition record;
begin
  -- Spelled exactly like `create_prison()`, including the SQLSTATE. It
  -- used to raise a bare `P0001`, which is what a validation failure
  -- raises, so "no identity" and "bad input" were indistinguishable to a
  -- caller. `42501` is the answer `create_prison()` and
  -- `create_save_version()` give, and #105 records that fail-closed shape
  -- as the thing this schema gets right; there is no reason for the one
  -- reachable-by-anyone RPC to be the exception.
  --
  -- There is no `p_user_id` parameter, and adding one would be the bug:
  -- the submitting account is the JWT subject and nothing else, so there is
  -- no argument to forge (ADR 0008 §3 step 1).
  if v_user_id is null then
    raise exception 'an authenticated identity is required to submit challenge evidence'
      using errcode = '42501';
  end if;

  -- --- Validate (ADR 0008 §3 step 3) ----------------------------------
  --
  -- This is deliberately NOT a re-implementation of
  -- `challengeEvidenceSchema` in SQL. The strict parse that rejects unknown
  -- fields is ADR 0009 step 1 and belongs to the verifier, which owns the
  -- schema; a second copy here would be a second contract, and the two
  -- would drift. What is checked here is the part the verifier structurally
  -- cannot check: that the payload agrees with the row it is being filed
  -- under. The verifier is handed a definition and compares the evidence to
  -- *that*, so a submission whose `challenge_id` column disagrees with its
  -- own body is a row the verifier will happily verify against the wrong
  -- definition -- #105's third demonstration, reproduced here as evidence
  -- naming `challenge.somewhere-else` version 99 stored under
  -- `challenge.probe` version 1.
  --
  -- These two checks have no counterpart on the table, and that is a
  -- choice. A CHECK constraint *could* express them -- `evidence ->>
  -- 'challengeId' = challenge_id` is a single-row predicate, which is the
  -- test ADR 0013 uses to decide where an invariant belongs -- and it is
  -- not used because these two field names are part of a *versioned client
  -- format* (`challengeEvidenceSchema`, `CHALLENGE_EVIDENCE_SCHEMA_VERSION`
  -- in src/services/challenges/evidence.ts), not of this table. Freezing
  -- them into the table would mean an evidence schema bump that moves or
  -- renames either field cannot be deployed without a constraint migration
  -- that every historical row must also satisfy. The payload ceiling in
  -- 20260824100000 is on the table precisely because it looks at no field
  -- at all. So these are the one class of refusal here that a future writer
  -- bypassing this function would not inherit, and that is said out loud
  -- rather than left for a reader to notice.
  --
  -- `is distinct from` rather than `<>` throughout, for the reason
  -- `create_save_version()` spells out: a NULL operand makes `<>` evaluate
  -- to UNKNOWN, the `if` does not fire, and the check silently passes.
  -- `jsonb_typeof(null)` is NULL, so a null `p_evidence` walks straight past
  -- a `<>` spelling of any of them.
  --
  -- This first check is for the error message, not for the refusal: every
  -- non-object payload -- an array, a scalar, a JSON null, an SQL NULL --
  -- also fails the `challengeId` check below, because `->` on a non-object
  -- yields NULL and that comparison is NULL-safe too. Measured, not
  -- assumed: rewriting this line's `is distinct from` as `<>` leaves the
  -- pgTAP suite green, and the pull request for #105 findings 1 and 2
  -- reports that as a surviving mutation rather than papering over it.
  -- It is kept because "challenge evidence must be a JSON object, not
  -- array" is a better answer to a broken client than "names challenge
  -- <missing>", and because a future edit to the checks below should not
  -- silently make a non-object payload a fall-through.
  if jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'challenge evidence must be a JSON object, not %', coalesce(jsonb_typeof(p_evidence), 'null');
  end if;

  if jsonb_typeof(p_evidence -> 'challengeId') is distinct from 'string'
     or p_evidence ->> 'challengeId' is distinct from p_challenge_id then
    raise exception 'challenge evidence names challenge %, but is being filed under %',
      coalesce(p_evidence ->> 'challengeId', '<missing>'), coalesce(p_challenge_id, '<null>');
  end if;

  -- Compared as a number rather than as text, so `1.0` is accepted as
  -- version 1 instead of being read as the string '1.0' and refused
  -- (verified: `"challengeVersion":1.0` submits).
  --
  -- The type check is first so the `::numeric` cast is never reached for a
  -- string or a boolean. That relies on `or` short-circuiting, which
  -- PostgreSQL does here but does not promise -- measured, both
  -- `"challengeVersion":"abc"` and `"challengeVersion":true` reach this
  -- message rather than `22P02` from the cast, and suite 002 asserts the
  -- string case so a future change of that behaviour shows up as a failing
  -- assertion rather than as a confusing error. Either way the row is
  -- refused; only the message differs.
  if jsonb_typeof(p_evidence -> 'challengeVersion') is distinct from 'number'
     or (p_evidence ->> 'challengeVersion')::numeric is distinct from p_challenge_version::numeric then
    raise exception 'challenge evidence names version %, but is being filed under version %',
      coalesce(p_evidence ->> 'challengeVersion', '<missing>'), coalesce(p_challenge_version::text, '<null>');
  end if;

  -- The client's `evidence_hash` is NOT checked here, and that is a
  -- limitation stated rather than an omission. It is FNV-1a over
  -- `canonicalJson` (src/simulation/determinism/canonical.ts), which this
  -- tier cannot recompute without hand-writing a JSON canonicalizer
  -- including JavaScript number formatting -- see the digest commentary in
  -- 20260824100000. So the claim is stored, keys nothing, and is
  -- contradicted where the algorithm lives: the verifier recomputes it and
  -- now compares (`claimedEvidenceHash`,
  -- src/services/challenges/verification.ts), rejecting with
  -- `evidence-hash-mismatch`. The column's `^[0-9a-f]{16}$` CHECK is the
  -- only thing this tier can say about it, and it already says it.

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

  -- --- Deduplicate (ADR 0008 §3 step 4) -------------------------------
  --
  -- "Look, then insert" is a race, the same one
  -- `enforce_prison_slot_capacity()` documents: two concurrent calls both
  -- find nothing and one of them then hits `23505` instead of being told
  -- `duplicate`. The advisory lock is keyed on the dedup key itself, so it
  -- serializes only submissions of *the same evidence for the same
  -- challenge* and leaves every other submission unaffected. It was not
  -- needed before this migration for a bad reason: fabricated hashes
  -- essentially never collided, so the constraint essentially never fired.
  --
  -- Like the rest of this schema's concurrency, the lock's behaviour is
  -- reasoned from the lock and not demonstrated by parallel sessions --
  -- #105's residual-risk section says so about the existing advisory locks
  -- and it is equally true of this one.
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
    -- id returned is the caller's own row, which they can read under
    -- `challenge_submissions_select_own`.
    if v_existing_user = v_user_id then
      return query select 'duplicate'::text, v_existing_id;
      return;
    end if;

    -- Someone else's row. The old code returned `duplicate` together with
    -- *their* `submission_id`, which is the identifier of a row RLS
    -- deliberately hides from this caller -- so the one path that was
    -- supposed to bind a submission to an account handed an account
    -- another account's primary key. #105 finding 2, demonstrated: Bob
    -- submitted a blob captured from Alice, and Alice's own submission
    -- came back `duplicate` carrying Bob's `submission_id`.
    --
    -- `conflict` with a null id is the same discriminated-status shape
    -- `create_prison()` uses for `at_slot_limit`/`slot_taken`: an expected,
    -- actionable outcome the client must tell apart from "something broke",
    -- and there is no fourth status to break an exhaustive switch -- no
    -- TypeScript caller of this RPC exists yet (there is no
    -- `SupabaseChallengeClient`), which is the moment to add it.
    --
    -- WHAT IT DISCLOSES, on purpose and bounded: that this exact evidence
    -- is already recorded, to a caller who already holds the exact bytes.
    -- It says nothing about whose row it is. The alternative -- refusing
    -- with no distinction -- would make an honest resubmission after a lost
    -- response indistinguishable from a rejected replay. It does NOT
    -- widen #105 finding 9 (this function is an existence oracle for
    -- unpublished definitions), which is untouched and out of scope here.
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

-- The privileges are unchanged and are restated rather than assumed:
-- `create or replace function` preserves the existing ACL, but this schema
-- spells every function privilege out at the point the function is
-- defined, and a reader of this file should not have to open the original
-- migration to learn who may call it. `anon` and `service_role` are named
-- as well as PUBLIC because a revoke from PUBLIC does not take away a
-- role's own default grant on a project created before Supabase stopped
-- auto-exposing new entities in `public`.
revoke all on function public.submit_challenge_evidence(text, int, text, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.submit_challenge_evidence(text, int, text, jsonb, jsonb) to authenticated;
