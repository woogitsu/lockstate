-- The dedup key for challenge evidence becomes a server-computed digest
-- over the stored payload, and the payload gets a ceiling (issue #105
-- finding 1).
--
-- WHAT WAS WRONG. `challenge_submissions_unique_evidence` in
-- 20260823090100_create_challenge_tables.sql claimed to implement ADR 0008
-- threat T3 ("Resubmitting identical evidence, or replaying someone else's
-- capture, cannot create a second ranked row") over `evidence_hash` -- a
-- column the caller supplies and nothing checks. #105 demonstrated the
-- consequence by execution: three `submitted` rows holding byte-identical
-- evidence under three fabricated hashes, an 8,388,619-byte evidence blob
-- accepted, and `verification.ts` recomputing the hash without ever
-- comparing it to the stored column. All three were reproduced against this
-- schema before the change and refused after it; the transcripts are in the
-- pull request, and the oversized blob measured 8,388,649 bytes there
-- because it was rebuilt rather than copied. A constraint that names a contract
-- and enforces a different one is worse than no constraint, because the
-- name is what a reader trusts.
--
-- NO DATA MIGRATES, and that is a fact about this schema rather than an
-- assumption. `challenge_submissions.challenge_id/challenge_version` is a
-- foreign key into `challenge_definitions`, so a submission cannot exist
-- without a published definition; publishing is a Z2 action and ADR 0008
-- states that the Z2 publisher is deliberately not built. The table is
-- therefore empty everywhere -- on a scratch database, on the hosted
-- staging project (which carries only 20260822190000-20260823100000), and
-- on any future project applying these migrations in order. If it were
-- populated, the constraint swap below would be the destructive part: rows
-- that currently coexist *because* their fabricated hashes differ collide
-- the moment the key is computed from the payload, and that is the whole
-- point of the change.
--
-- EXECUTED against plain PostgreSQL 16.13 + pgTAP 1.3.2 via `pnpm
-- verify:sql`, with each probe inside an explicit transaction block and
-- `select current_user` read back (#105's own note: `set local role`
-- outside a transaction silently no-ops and leaves the session
-- privileged). NOT executed against the real Supabase local stack or a
-- hosted project -- both need resources this change was produced without;
-- see docs/CLOUD_SAVE.md, "What has and has not been executed".

-- --- 1. The ceiling on one stored evidence payload --------------------
--
-- In exactly one function, for the same reason `max_save_payload_bytes()`
-- is: approving a different figure should cost one line, not a migration
-- rewrite.
--
-- WHERE 8,000,000 COMES FROM. It is not a new judgement about how large
-- evidence should be. `challengeLimitsSchema` in
-- src/services/challenges/challenge.ts declares
-- `maxEvidenceBytes: z.number().int().positive().max(8_000_000)`, so no
-- challenge definition can legally admit evidence larger than that;
-- anything bigger is unverifiable under *every* definition that could ever
-- be published, and storing it is pure cost. ADR 0009 step 4 keeps the
-- real budget where it belongs -- in the definition, known before anyone
-- plays, and applied by the verifier. This is a ceiling on abuse, not a
-- budget.
--
-- WHY NOT ADR 0013's 4 MiB. That number bounds `save_versions.payload`,
-- and it is derived from docs/PERSISTENCE.md's measured save envelopes --
-- a different asset with a different size distribution. Reusing it here
-- would make the SQL tier refuse evidence the TypeScript contract
-- explicitly permits, which is a contradiction between two tiers rather
-- than a bound. #105 finding 4 -- that every *other* client-writable
-- text/jsonb column in this schema is unbounded -- is a separate, wider
-- problem and is deliberately not addressed here.
--
-- HOW IT IS MEASURED. `octet_length(evidence::text)`, the same measure
-- `enforce_save_version_size()` uses and the same one the oversized blob
-- was measured with, before and after. It is not the same measure as
-- `measureEvidenceBytes()` in src/services/challenges/evidence.ts, which
-- encodes `canonicalJson` (no space after `:` or `,`) while `jsonb`'s text
-- output has one of each. The SQL figure is therefore slightly *larger*
-- than the TypeScript one for the same payload, which makes this ceiling
-- marginally conservative -- the safe direction, and worth stating rather
-- than leaving for someone to rediscover as a discrepancy.
create or replace function public.max_challenge_evidence_bytes() returns int
language sql immutable parallel safe
as $$ select 8000000 $$;

-- Unlike the three limit helpers in
-- 20260823100000_bound_free_tier_capacity.sql, this one is granted to
-- nobody. Those are readable by a signed-in client because a client cannot
-- learn the save-payload bound any other way, and asking beats spending a
-- 4 MiB upload to find out. Here the client already holds a lower and more
-- authoritative figure: `challenge_definitions.definition` carries the
-- definition's own `limits.maxEvidenceBytes`, which it must read and verify
-- the signature of before playing at all. A grant would publish a second,
-- coarser copy of a bound the client already has, so the only callers are
-- the trigger below and any future writer, both of which reach it as the
-- owning role.
revoke all on function public.max_challenge_evidence_bytes()
  from public, anon, authenticated, service_role;

-- Same placement argument as the save-payload bound: it is a property of
-- the row, so it lives with the row and holds for any future write path
-- (a backfill, an admin tool, a trusted importer) without anyone having to
-- remember it. `submit_challenge_evidence()` is the only writer today and
-- deliberately does not repeat the check -- one enforcement point, on the
-- table, is what makes the bound true of the data rather than true of one
-- caller.
--
-- `LS003`, distinct from `LS001` (save-slot cap) and `LS002` (save payload
-- too large), so a client can tell the three refusals apart: PostgREST
-- surfaces the SQLSTATE as `code`.
--
-- INSERT only. Evidence is immutable once submitted -- there is no client
-- write grant at all, and `enforce_challenge_verification_transition()`
-- refuses a change to `evidence` even for the trusted role -- so an UPDATE
-- can never grow a payload past this bound.
create or replace function public.enforce_challenge_evidence_size()
returns trigger
language plpgsql
-- SECURITY DEFINER, unlike `enforce_save_version_size()`, which is the
-- otherwise-identical trigger next door. The difference is the grant on the
-- limit helper, not the body: `max_save_payload_bytes()` is executable by
-- `authenticated`, so an invoker-rights trigger can call it, while
-- `max_challenge_evidence_bytes()` above is executable by nobody. An
-- invoker-rights trigger calling it would raise `42501 permission denied
-- for function max_challenge_evidence_bytes` for any writer without that
-- grant instead of enforcing the bound. That cannot happen today -- no
-- client role holds INSERT on this table, and the only writer is a SECURITY
-- DEFINER function, so the trigger already runs as the owner -- and it would
-- start happening the moment a future migration grants a write. Definer
-- rights make the bound independent of who is writing, which is exactly
-- why
-- `enforce_prison_slot_capacity()` is SECURITY DEFINER for
-- `account_save_slot_capacity()` in
-- 20260823100000_bound_free_tier_capacity.sql.
--
-- The body reads nothing but NEW and one inlined constant, so definer
-- rights buy it no access to any row it could not already see.
--
-- `pg_temp` explicitly last, as every function in this schema pins it; see
-- submit_challenge_evidence() for why.
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int := public.max_challenge_evidence_bytes();
  v_measured int := octet_length(new.evidence::text);
begin
  if v_measured > v_limit then
    raise exception 'challenge evidence is % bytes; the limit is % bytes', v_measured, v_limit
      using errcode = 'LS003',
            detail = format('evidence_bytes=%s limit=%s', v_measured, v_limit),
            hint = 'Existing submissions are unaffected; only this submission is refused.';
  end if;

  return new;
end;
$$;

-- As with the four trigger functions in
-- 20260824090000_pin_trigger_function_search_path.sql: a function with no
-- explicit ACL is executable by PUBLIC, and Supabase's default privileges
-- only drop the three roles' own grant. Revoked here at birth rather than
-- in a later cleanup migration.
revoke all on function public.enforce_challenge_evidence_size()
  from public, anon, authenticated, service_role;

drop trigger if exists challenge_submissions_enforce_evidence_size on public.challenge_submissions;
create trigger challenge_submissions_enforce_evidence_size
  before insert on public.challenge_submissions
  for each row execute function public.enforce_challenge_evidence_size();

-- --- 2. The dedup key, computed by the server -------------------------
--
-- A STORED GENERATED COLUMN, which is what #105 asks for, and it is the
-- strongest available shape: it cannot be supplied, and it cannot be
-- written afterwards by anyone -- not by a client (which holds no write
-- grant), not by the trusted role (whose UPDATE grant names four verdict
-- columns), and not by the table owner either, because PostgreSQL refuses
-- a direct write to a generated column outright (`428C9`). A
-- trigger-maintained column would have been the fallback if the expression
-- could not be made immutable; it is not needed, and it would have been
-- weaker. Dropping either takes ownership of the table, but a trigger has
-- two ordinary ways to stop running that a generated column has none of --
-- `alter table ... disable trigger`, and a session with
-- `session_replication_role = 'replica'` -- and both are things a bulk load
-- or a restore does routinely.
--
-- WHY `sha256(jsonb_send(evidence))` AND NOT SOMETHING MORE OBVIOUS. A
-- generated expression must be IMMUTABLE, and the obvious spellings are
-- not, or are unsafe:
--
--   * `sha256(convert_to(evidence::text, 'UTF8'))` -- rejected by the
--     server: `ERROR: generation expression is not immutable`.
--     `convert_to(text, name)` is STABLE, because an encoding conversion
--     resolves through conversions that can be redefined. Declaring an
--     IMMUTABLE wrapper around it would be asserting something the catalog
--     denies, which is exactly the kind of paper control this issue is
--     about.
--   * `sha256(evidence::text::bytea)` -- accepted by the planner and a
--     landmine: the text-to-bytea cast runs `byteain`, which interprets
--     backslash escapes. `'{"a":"x\ny"}'::jsonb::text::bytea` raises
--     `22P02 invalid input syntax for type bytea` (verified), so any
--     legitimate payload containing an escaped character in a string
--     would make the insert fail.
--   * `md5(evidence::text)` -- immutable and text-taking, and rejected on
--     merit: MD5 collision resistance is broken in practice, and a dedup
--     key an attacker can collide is a control an attacker can defeat.
--     Two *different* payloads sharing a key would silently be treated as
--     replays of one another.
--
-- `jsonb_send` is the jsonb binary output function: catalog-immutable, and
-- it emits a one-byte format version followed by the jsonb value's
-- canonical text. That gives canonicality for free, because `jsonb` is
-- already a normalized representation -- key order and whitespace are
-- normalized on input and a duplicate key keeps only its last value.
-- Verified on the harness: `{"b":1,"a":2}` and `{"a":2,   "b":1}` produce
-- the same digest.
--
-- The version byte is there because a type's binary format is allowed to
-- change between major PostgreSQL releases, and this column is STORED --
-- `pg_upgrade` carries the stored bytes across rather than recomputing
-- them. If jsonb's send format ever changed, rows written after the upgrade
-- would hash differently from rows written before it, and a duplicate
-- spanning that boundary would stop being caught. That is an operational
-- note for a future major-version upgrade, not a reason to prefer a
-- text-based expression: `evidence::text` carries exactly the same risk,
-- since it is the same rendering with the same freedom to change.
--
-- TWO PROPERTIES OF THIS KEY WORTH KNOWING BEFORE TRUSTING IT.
--
-- First, it does NOT agree with `challengeEvidenceHash()` in
-- src/services/challenges/evidence.ts, and cannot be made to. That is FNV-
-- 1a over `canonicalJson`, which sorts keys lexicographically and renders
-- numbers the way `JSON.stringify` does; `jsonb` sorts keys by length then
-- bytes and stores numbers as `numeric`. Reproducing `canonicalJson` in
-- SQL would mean hand-writing a JSON canonicalizer -- including JavaScript
-- number formatting -- as an immutable function, which is a larger
-- correctness risk than the problem it solves. The consequence is
-- deliberate and is the design: the two hashes have two different jobs.
-- This one is the *key*, computed by the server, used by the unique
-- constraint. The client's `evidence_hash` stays a claim, and the tier that
-- can contradict it is the tier that owns the algorithm -- the verifier,
-- which recomputes it in TypeScript and now compares it (ADR 0009 step 1's
-- fail-closed spirit; see `claimedEvidenceHash` in
-- src/services/challenges/verification.ts). SQL cannot contradict a claim
-- it cannot recompute, and pretending otherwise here would be the same
-- defect one layer down.
--
-- Second, `jsonb` normalizes formatting but not numeric *scale*:
-- `{"a":1}` and `{"a":1.0}` are distinct `numeric` values, so they are
-- distinct digests (verified), while `canonicalJson` renders both as `1`.
-- A submitter who re-encodes one number can therefore still produce a
-- second row for the same run. That residual is narrower than what it
-- replaces -- today any 16 hex characters will do -- but it is real, it is
-- recorded in the pull request for #105 findings 1 and 2, and closing it
-- needs the canonicalizer the paragraph above declines to hand-write.
alter table public.challenge_submissions
  add column if not exists evidence_digest bytea not null
    generated always as (sha256(jsonb_send(evidence))) stored;

-- The swap, in this order, so a re-run of this migration is a no-op rather
-- than an error: drop the constraint this replaces, drop the new one if a
-- previous run created it, then create it.
--
-- `challenge_submissions_unique_evidence` is dropped rather than kept
-- alongside. Keeping it would mean the caller's claim still keys something,
-- so submitting the same evidence twice under two hashes would be refused
-- by the new constraint while submitting *different* evidence twice under
-- one hash would be refused by the old one -- a caller-controlled way to
-- deny an honest submitter their row.
alter table public.challenge_submissions
  drop constraint if exists challenge_submissions_unique_evidence;
alter table public.challenge_submissions
  drop constraint if exists challenge_submissions_unique_evidence_digest;

-- STILL GLOBAL, NOT PER-ACCOUNT, and that is the conservative reading
-- rather than a decision made here. ADR 0008 threat T3 is "replaying
-- someone else's evidence", mitigated by "submissions are account-scoped
-- and deduplicated by evidence hash". A per-account key -- `(challenge_id,
-- challenge_version, user_id, evidence_digest)` -- would not mitigate T3
-- at all: every account could hold its own ranked row for one captured
-- run, which is the threat rather than its mitigation. A global key does
-- mitigate it, and it is also what the constraint being replaced intended,
-- so keeping it global changes nobody's product.
--
-- What the ADRs do NOT settle is the *consequence* of a global key: with
-- one row per run for everybody, the account that submits first holds it,
-- and #105 finding 2 is exactly that ("whoever submits a captured blob
-- first is ranked for it"). The database can bind a row to the account that
-- *submitted* it -- `user_id` is `auth.uid()` and nothing else -- but it
-- cannot know which account *played* the run, because nothing in the
-- evidence says. Closing that needs the producing account inside the
-- signed-over evidence body, which is an ADR 0009 evidence-format
-- amendment and is reported in the pull request for #105 findings 1 and 2
-- rather than decided in this migration.
alter table public.challenge_submissions
  add constraint challenge_submissions_unique_evidence_digest
    unique (challenge_id, challenge_version, evidence_digest);
