-- Constrains the three scalar columns that had no check at all, and makes
-- `ranked_score` finite (issue #191).
--
-- 20260824101000 and 20260824120000 bounded every text/jsonb column, and
-- `supabase/tests/007_column_bound_coverage.test.sql` made that coverage a
-- rule. Neither covered the numeric and timestamp columns, and that scope
-- limit was named in #190 rather than left implied: an integer cannot be
-- unbounded in the storage-exhaustion sense, but it can hold nonsense.
--
-- The precedent that this is not hypothetical:
-- `user_settings.settings_schema_version` accepted **-2147483648** until
-- 20260824101000, in a table created on 20260822190400 with `not null` and no
-- check.
--
-- Three columns had no check of any kind. One of them is more interesting than
-- a range.

-- `save_versions.save_schema_version` is written through
-- create_save_version() from the client's `envelope.saveSchemaVersion`, whose
-- contract is `schemaVersionSchema = z.number().int().positive()`
-- (`src/simulation/protocol/types.ts:52`). So a client could store `-5` or `0`
-- on a row whose payload is a perfectly valid V3 save.
--
-- Bounded, not pinned to `SAVE_SCHEMA_VERSION` (currently 3,
-- `src/persistence/save-schema.ts:25`). The column records the schema version
-- of the payload as stored, and a V1 or V2 row is legitimate history that the
-- migration chain still reads, so a pin would refuse the past as well as the
-- future. This is the same reasoning 20260824101000 gave for bounding
-- `settings_schema_version` rather than pinning it, and the opposite of
-- `entitlement_events_schema_version_check`'s `= 1` -- which is right there
-- because the ledger's schema version is part of ADR 0008's event contract, so
-- a new version needs a migration by design.
--
-- LATENT, and worth saying why: nothing reads this column back for dispatch.
-- The migration chain is driven by the version inside the envelope, not by the
-- row. It becomes live the moment any code trusts the column instead of the
-- payload -- which is exactly what a column with this name invites.
alter table public.save_versions
  add constraint save_versions_save_schema_version_check
  check (save_schema_version >= 1);

-- `challenge_submissions.challenge_version`: the identical constraint
-- `challenge_definitions_version_check` already places on the same vocabulary.
-- submit_challenge_evidence()'s cross-field check (20260824100100) already
-- ensures a stored row's value matched a real definition at write time -- but
-- that invariant lives in the function, not in the schema, so a second writer
-- would not inherit it.
alter table public.challenge_submissions
  add constraint challenge_submissions_challenge_version_check
  check (challenge_version >= 1);

-- `challenge_submissions.ranked_score` is `double precision`, so its domain
-- includes `NaN`, `Infinity` and `-Infinity`.
--
-- **Why that is not merely untidy.** `challenge_submissions_ranking_idx` is on
-- `(challenge_id, challenge_version, ranked_score)`, and PostgreSQL orders
-- `NaN` as **greater than every other float value** -- greater than
-- `Infinity`. Measured:
--
--   select v from (values ('NaN'::float8),(100),(5),('Infinity'::float8),
--                         ('-Infinity'::float8)) t(v) order by v desc;
--    -->  NaN, Infinity, 100, 5, -Infinity
--
-- So a single `NaN` takes permanent first place on the ranking surface, by the
-- access path the index exists to serve.
--
-- **LATENT, and precisely why.** `public.challenge_leaderboard` has every
-- grant revoked from `anon`, `authenticated` *and* `service_role`, because ADR
-- 0009 gates public ranking on a privacy decision that has not been made. So
-- nothing can read the ranking yet. What makes this live is granting that
-- read -- a decision already queued rather than a hypothetical one -- and the
-- index is already the intended path.
--
-- **This check is not redundant with the TypeScript side, which is the part
-- worth noticing.** `claimedMetrics` -- the client's *claim* -- is
-- `z.record(identifierSchema, z.number().finite())`
-- (`src/services/challenges/evidence.ts:63`). But `ranked_score` is written
-- from the verifier's own computed outcome:
-- `outcome.metrics[definition.objective.metricId]`
-- (`src/services/challenges/verification.ts:285`), and `metrics` is typed
-- `Readonly<Record<string, number>>` (`:50`, `:77`) with no finiteness
-- validation anywhere on that path. `NaN` is a `number`, and the only guard
-- there is `=== undefined`. So the claim is checked for finiteness and the
-- computed score is not; this constraint is the sole finiteness check on the
-- path that actually writes the column. Tightening the TypeScript side needs a
-- rejection code for "the replay produced a non-finite metric", which is a
-- contract decision and is reported in #191 rather than made here.
--
-- Spelled as two strict comparisons rather than with a helper: PostgreSQL has
-- no `isfinite` for `double precision`, and because `NaN` compares greater
-- than everything, `NaN < 'Infinity'` is false -- so this single predicate
-- excludes `NaN`, `Infinity` and `-Infinity` together. Verified by execution
-- rather than reasoned: `'NaN' > '-Infinity' and 'NaN' < 'Infinity'` is false,
-- and so is the same expression for `'Infinity'`.
alter table public.challenge_submissions
  add constraint challenge_submissions_ranked_score_finite
  check (ranked_score is null
         or (ranked_score > '-Infinity'::float8 and ranked_score < 'Infinity'::float8));
