-- Bounds the five text/jsonb columns that only the trusted tier can write
-- (issue #189, the remainder named as a deliberate exclusion in #186).
--
-- #105 finding 4 says "client-writable", and 20260824101000 bounded exactly
-- those. These five are reachable only through a `SECURITY DEFINER` function or
-- a `service_role` grant, so an oversized value here needs a bug in the trusted
-- tier or a compromised key rather than a hostile client. Defence in depth, and
-- worth saying so rather than dressing it up: `entitlements` holds no grant for
-- either client role, `challenge_definitions` is empty because the Z2 publisher
-- ADR 0008 deliberately does not build does not exist, and `rejection_code` is
-- written by the verifier's own four-column UPDATE grant.
--
-- **Why this needs no ADR, where #163 does.** The objection is that ADR 0008
-- treats `service_role` as trusted, so constraining it is an authority
-- question -- which is why #163 (`service_role` can TRUNCATE the append-only
-- ledger) was filed for a decision instead of fixed. The difference:
-- `TRUNCATE` *removes an authority* ADR 0008 may have meant the trusted tier
-- to have, while a size bound *asserts an invariant the trusted tier's own
-- contract already satisfies*. This schema already does the latter --
-- `entitlement_events` is written only by `record_entitlement_event()`, a
-- `SECURITY DEFINER` function, and has carried five `char_length` bounds since
-- 20260823090000. This migration follows that precedent rather than setting a
-- new one.
--
-- Two of the five columns *look* bounded and are not, which is why the
-- inventory behind this was read constraint by constraint rather than by
-- matching column names against constraint text:
--
--   * `challenge_definitions.definition` -- a `LIKE '%definition%'` scan
--     matches `challenge_definitions_definition_hash_check`, a regex on a
--     different column.
--   * `challenge_submissions.rejection_code` -- `..._rejected_has_code`
--     requires a rejected row to *have* a code and says nothing about length.
--
-- `challenge_submissions.evidence_digest` is deliberately not here: it is a
-- stored generated column, `sha256(jsonb_send(evidence))`, so it is exactly 32
-- bytes by construction.
--
-- Every ceiling is derived from the TypeScript contract that produces the
-- value, so SQL refuses nothing a legitimate writer can send -- the same
-- direction 20260824100000 took when it capped evidence at 8,000,000 rather
-- than at ADR 0013's 4 MiB.

-- `entitlements.key`: the convention every id-shaped text column here uses.
--
-- It could be *pinned* instead. The only key the code writes is
-- `SAVE_SLOTS_ENTITLEMENT_KEY = 'save-slots'`
-- (`src/services/entitlements/client.ts:50`), and its sibling
-- `entitlement_events.capability` already carries `check (capability =
-- 'save-slots')`, so extending that pin would follow an existing constraint
-- rather than copy a TypeScript rule. What stops it: **nothing in this schema
-- states that `entitlements.key` and `entitlement_events.capability` are the
-- same vocabulary.** If they are, the pin is right and the two constraints
-- should reference each other; if `entitlements` is meant to project several
-- capability kinds while the ledger records one, the pin breaks on the second
-- capability. That is a question for whoever knows, recorded in #189 rather
-- than guessed here. The length closes the size hole either way.
alter table public.entitlements
  add constraint entitlements_key_check
  check (char_length(key) >= 1 and char_length(key) <= 128);

-- `entitlements.value`: `entitlementRowValueSchema`
-- (`src/services/entitlements/client.ts:43-48`) is `.strict()` over two
-- integers, so the whole legitimate value is
-- `{"grantedSaveSlots":N,"ledgerRevision":N}` -- about 60 bytes. 4 KiB is ~68x
-- that.
alter table public.entitlements
  add constraint entitlements_value_bytes_check
  check (octet_length(value::text) <= 4096);

-- `challenge_definitions.definition`: `challengeDefinitionSchema`
-- (`src/services/challenges/challenge.ts:52-81`) is dominated by its two
-- `z.array(identifierSchema).min(1).max(64)` allow-lists -- 2 * 64 * 131 is
-- about 16.8 KB -- plus the objective, limits and hashes, so about 17.5 KB is
-- the largest value the contract can produce. 64 KiB is ~3.7x that.
alter table public.challenge_definitions
  add constraint challenge_definitions_definition_bytes_check
  check (octet_length(definition::text) <= 65536);

-- `challenge_definitions.signature`: `challengeSignatureSchema` (`:85-92`) is
-- `{algorithm:'ed25519', keyId: identifierSchema, value: z.string().max(512)}`
-- -- about 700 bytes at most. 4 KiB is ~5.8x that.
alter table public.challenge_definitions
  add constraint challenge_definitions_signature_bytes_check
  check (octet_length(signature::text) <= 4096);

-- `challenge_submissions.rejection_code`: `ChallengeRejectionCode`
-- (`src/services/challenges/verification.ts:21-43`) is a closed union of 23
-- members whose longest are 27 characters (`content-version-not-allowed`,
-- `command-stream-out-of-order`).
--
-- A length, not an `IN (...)` list, for the reason 20260824101000 gave
-- `game_version` a length rather than `identifierSchema`'s regex: 23 members
-- copied into SQL is one rule in two places, and every future rejection code
-- would then need a migration before the verifier could emit it.
-- `verification_status` *is* enumerated in SQL, correctly -- those four values
-- are the database's own state machine, whereas a rejection code is the
-- verifier's vocabulary passing through.
alter table public.challenge_submissions
  add constraint challenge_submissions_rejection_code_check
  check (rejection_code is null or (char_length(rejection_code) >= 1 and char_length(rejection_code) <= 128));
