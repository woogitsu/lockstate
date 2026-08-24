-- Bounds the client-writable text and jsonb columns that the four earliest
-- migrations created before this schema adopted a bounding convention
-- (issue #105 finding 4).
--
-- The finding's wording -- "ADR 0013's 4 MiB bound covers only
-- `save_versions.payload`; every other client-writable text/jsonb column is
-- unbounded" -- is accurate but understates the shape. The convention *does*
-- exist and is applied consistently from 20260823090000 onward:
-- `entitlement_events` bounds five text columns at 128 characters (200 for
-- `reason`), `challenge_definitions` bounds `challenge_id` the same way, and
-- both hash columns carry `~ '^[0-9a-f]{16}$'`. What has none of it is the
-- four tables created on 20260822190*, which predate it. This migration
-- brings them up to the same convention rather than inventing a second one.
--
-- Reproduced as `authenticated` before this migration, each probe inside an
-- explicit `begin; ... rollback;` with `select current_user` read back (a
-- `set local role` outside a transaction silently no-ops, which is how the
-- audit in #105 nearly produced a false clean):
--
--   * `user_settings.payload`            8,388,620 bytes accepted
--   * `user_settings.settings_schema_version`  -2147483648 accepted
--   * `profiles.display_name`            1,048,576 characters accepted
--   * `prisons.game_version`             1,048,576 characters accepted
--   * `prisons.display_name`             1,048,576 characters accepted
--   * `save_versions.checksum`             524,288 characters accepted
--                                          through create_save_version()
--   * `challenge_submissions.claimed_metrics`  4,194,316 bytes accepted
--                                          through submit_challenge_evidence()
--
-- Two of those deserve to be read twice.
--
-- **The 4 MiB save bound measures one column, not the row.** Measured: a
-- single accepted `save_versions` row carried 4,194,252 bytes of `payload`
-- *and* 4,194,304 characters of `checksum` -- 8,388,556 bytes of text in a
-- row whose `byte_size` records 4,194,252 against a limit of 4,194,304. The
-- trigger overwrites `p_byte_size` with `octet_length(new.payload::text)`,
-- which is the right thing to do about a lying caller and says nothing about
-- the rest of the row. After this migration `checksum` is 16 characters, so
-- the row's bound is the sum of its columns' bounds rather than one column's.
--
-- **`claimed_metrics` bypasses the evidence bound entirely.** 20260824100000
-- caps `challenge_submissions.evidence` at 8,000,000 bytes. Measured: the
-- same RPC call stored 4,194,316 bytes in `claimed_metrics` beside 58 bytes
-- of `evidence`. A bound a sibling column walks around is the "control that
-- reads as protection" shape this repository keeps finding, so the column is
-- bounded here even though it belongs to a later table -- the fix is a table
-- constraint and touches no function body.
--
-- Every bound below is chosen so that SQL refuses nothing the TypeScript
-- contract can produce. That direction matters: 20260824100000 deliberately
-- capped evidence at 8,000,000 rather than ADR 0013's 4 MiB because
-- `challengeLimitsSchema` already permits more, and a database that refuses
-- what the contract admits is a bug rather than hardening.

-- `profiles.display_name` is nullable and is written by nothing in `src/`
-- today, so the bound is on the Data API's reach rather than on the app's
-- behaviour. 128 characters is what every other bounded text column in this
-- schema uses. `>= 1` refuses the empty string, which would otherwise be a
-- second spelling of "no display name" beside NULL.
alter table public.profiles
  add constraint profiles_display_name_check
  check (display_name is null or (char_length(display_name) >= 1 and char_length(display_name) <= 128));

-- `prisons.display_name` has the same shape and the same reasoning; it is
-- reachable both by a direct UPDATE and through create_prison()'s
-- `p_display_name` argument.
alter table public.prisons
  add constraint prisons_display_name_check
  check (display_name is null or (char_length(display_name) >= 1 and char_length(display_name) <= 128));

-- `prisons.game_version` carries `identifierSchema` values
-- (`src/simulation/protocol/types.ts:44-48`), whose own bound is
-- `.min(1).max(128)`. The length is enforced and the character class is not,
-- deliberately: every id-shaped text column in this schema
-- (`entitlement_events.provider`, `challenge_definitions.challenge_id`, ...)
-- is bounded by `char_length` alone, and copying `identifierSchema`'s regex
-- into SQL would put one rule in two places -- the defect class issues #93
-- and #123 are about -- while adding nothing to the size bound this finding
-- is about.
alter table public.prisons
  add constraint prisons_game_version_check
  check (char_length(game_version) >= 1 and char_length(game_version) <= 128);

-- `save_versions.checksum` accepted 524,288 characters through
-- create_save_version(). Its TypeScript contract is exact rather than merely
-- bounded -- `savePayloadV3Schema` declares
-- `z.string().regex(/^[0-9a-f]{16}$/)` (`src/persistence/save-schema.ts:793`)
-- and `computeSaveChecksum` has never produced anything else -- so the obvious
-- constraint is that same regex, in the form this schema already uses for
-- `challenge_definitions.definition_hash` and
-- `challenge_submissions.evidence_hash`.
--
-- It is a length bound instead, for the reason given two constraints above:
-- copying the regex here would put the save format's checksum shape in a
-- second place, and a later move to a wider digest would then refuse a
-- legitimate save until a migration caught up. What the format pin would buy
-- is narrow -- a client that stores a malformed checksum fails its own next
-- restore, which is self-harm rather than a boundary crossing -- and what this
-- finding is about is size. 64 characters closes the hole completely and
-- leaves room for a sha256 hex digest if the algorithm ever changes.
--
-- Worth recording rather than passing over: suites 001 and 004 seed this
-- column with readable placeholders like `checksum-rev-1`, i.e. values no
-- client could ever produce. The regex would have required rewriting them.
-- That is a fact about the fixtures, not an argument for the weaker bound, and
-- it is left alone here because the length bound admits them unchanged.
alter table public.save_versions
  add constraint save_versions_checksum_length_check
  check (char_length(checksum) >= 1 and char_length(checksum) <= 64);

-- `user_settings.payload` is the column the audit found holding 33 MB. The
-- shipped defaults serialize to 792 bytes (measured: 718 for
-- `DEFAULT_INPUT_SETTINGS` over its 7 keyboard bindings, 47 for
-- `DEFAULT_ACCESSIBILITY_SETTINGS`), and 13 input actions are declared in
-- total, so a payload binding every action with several alternates each still
-- sits in single-digit kilobytes. 64 KiB is ~82x the shipped size and leaves
-- that room; it is also 1/64th of ADR 0013's save bound, which is the right
-- relationship -- settings are not a save, and this table exists precisely so
-- they never ride inside one.
--
-- `octet_length(payload::text)` is the same measure the save-payload trigger
-- uses. It is legal in a CHECK: verified by execution that `jsonb_out` is
-- IMMUTABLE (`pg_proc.provolatile = 'i'`) and that the constraint accepts a
-- small value and refuses an oversized one.
alter table public.user_settings
  add constraint user_settings_payload_bytes_check
  check (octet_length(payload::text) <= 65536);

-- `settings_schema_version` accepted -2147483648. It is bounded as a positive
-- integer rather than pinned to a value, unlike
-- `entitlement_events_schema_version_check`'s `= 1`. The pin is right there
-- because the ledger's schema version is part of ADR 0008's event contract, so
-- a new version needs a migration by design. Nothing says the same of the
-- settings payload, and pinning it would make a client that writes version 2
-- fail on a constraint before the migration admitting version 2 could exist.
alter table public.user_settings
  add constraint user_settings_schema_version_check
  check (settings_schema_version >= 1);

-- `challenge_submissions.challenge_id` is the client-supplied argument to
-- submit_challenge_evidence(). `challenge_definitions.challenge_id` has
-- carried `char_length between 1 and 128` since it was created; this is the
-- identical constraint on the identical vocabulary.
alter table public.challenge_submissions
  add constraint challenge_submissions_challenge_id_check
  check (char_length(challenge_id) >= 1 and char_length(challenge_id) <= 128);

-- `claimed_metrics` is the column that walks around the evidence bound. Its
-- TypeScript contract is `z.record(identifierSchema, z.number().finite())`
-- with at most `MAX_EVIDENCE_METRICS = 64` keys
-- (`src/services/challenges/evidence.ts:45,63,72`), so the largest value the
-- contract can produce is 64 entries of a 128-character key and a number that
-- serializes to at most 24 characters: 64 * 156 + 63 commas + 2 braces =
-- 10,049 bytes. 32 KiB is 3.3x that ceiling, so no admissible metrics record
-- is refused.
alter table public.challenge_submissions
  add constraint challenge_submissions_claimed_metrics_bytes_check
  check (octet_length(claimed_metrics::text) <= 32768);
