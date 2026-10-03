# Empty construction order ID at the live command boundary

Measured on published `94a287202d53a3feb292f9d9753bcb4892a5b7f9`, 2026-10-04.

## Original production failure

Actual packed `PlaceBuildOrder` with `orderId: ''` approves a square brick wall at3,3, debits80 and writes `orderRevisions: { '': '1' }`. Actual `PlaceObject` with the same empty ID buys a wooden bench at7,7 in a publicly purchased Yard4,4, debits130 and writes the same invalid key. Ordinary `createSaveEnvelope` then throws on `construction.orders[0].id` and `construction.orderRevisions`. The first executed kernel probe is2RED/2legalGREEN,4.68s; raw source and output are retained below.

This is a malformed live command / restored queue boundary. Current UI producers mint nonempty IDs; no native click, browser or hosted latency claim is made.

## Compatibility and deduplication

Fresh remote search and full Issues#252/#420 were read. #252 explicitly left this field unchanged under the mistaken claim that `z.string().min(1)` was looser than `z.string()`. #420 fixes unknown catalogue definitions. Neither fixes the measured empty construction ID.

Frozen V1–V9 and current V10 save schemas carry queued command payloads as opaque JSON. A legal save can therefore hold both empty-ID commands before dispatch. The regression creates a real kernel queue, stores it in each valid historical envelope with its real checksum, decodes/loads, and verifies the full queued payloads survive unchanged. Existing `SessionCommands` calls `unpackCommand` before any authoritative mutation; rejecting malformed input there consumes the queued request without modifying world, funds, orders, history, owners or ledger. No historical validator, migration, wrapper version or cancellation lookup changes are required.

Original regression run15RED/2GREEN included one fixture error: its cancellation control omitted the existing required `expectedRevision`. Correcting only that control to `'0'` yields14 genuineRED/3legalGREEN,2.46s. Both raw runs are retained. The17 cases cover two real dispatches, two free-form nonempty purchases, two packer guards, all ten saved queue versions and existing empty cancellation idempotence.

## Scope

Parent granted only the current `PlaceBuildOrder` and `PlaceObject` order-ID shape guards in `src/simulation/protocol/commands.ts`, aligned with the existing nonempty saved order ID. No schema, copy, tariff, format or native changes.

## Terminal verification

Issue: https://github.com/woogitsu/lockstate/issues/2027. Published diagnosis `be6072e5cb`, source `6e882a7f8e9f138a6a65566c6750bfa60760dd62` on `codex/build-command-gameplay-fix-20261004`.

- Fixed17GREEN,2.42s; exact restored17GREEN after both independent production omissions.
- Omit only `PlaceBuildOrder.orderId.min(1)`:12RED/5GREEN. Omit only `PlaceObject.orderId.min(1)`:2RED/15GREEN. Historical minimal envelopes have no Yard, so their object requests independently refuse the missing room; the genuine Yard/live object case detects the object guard. That limitation is explicit.
- Mutation execution detached exact source commit to protect it from the shared WIP sweep. Finally restoration SHA256 `593ce1ed2ec7791ef1252bbfe857dde824e1053dfa72cc2004c25e708b51004f`, byte equality true, source diff zero, branch restored.
- Bounded neighboring contracts111GREEN/12files,3.80s: actual worker protocol, command guards, protocol fault recovery, economy build loop, session Save/Load, V1–V5 and V9–V10 migration, unconsumed-command and research-index contracts. Application/tools strict types exit0. Initial TS optional-property mismatch in the test's save/runtime mirror was corrected using the existing explicit validated bundle boundary; no production type changed.
- No full suite, build, browser, native, CI changes or timing claim. Direct private domain callers are not this live protocol boundary; current UI already generates nonempty IDs.

Documentation first ran1RED/19GREEN because the added shape comment moved the existing `expectedRevision` declaration from within the old anchor's tolerance to line81. Swapping only the original94a287 command source bytes made the original quotation gate12GREEN, proving attribution. The narrow approved amendment retains historical `e044a3e8` line77 and adds actual published `6e882a7f8e` line81 with its literal guard. Final source-anchor/quotation/index gate20GREEN/3files,788ms; no budget/scanner changes. Both strict type projects were also rechecked against final restored source.

`raw/mutation-receipt.json` and the retained executed mutation recipe identify both actual producer omissions and exact final restoration. `raw/sha256.json` hashes the preserved raw files; their own attributes disable text normalization.

## Retained evidence

`raw/original-kernel-probe.test.ts.txt` and `raw/executed-regression.test.ts.txt` are inert executed sources. `raw/original-kernel-probe.txt`, `raw/initial-regression-fixture-error.txt`, `raw/original-corrected-fixture.txt` and `raw/fresh-duplicate-search.json` retain the actual results/search. They are not native acceptance.
