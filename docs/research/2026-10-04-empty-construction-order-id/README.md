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

Parent granted only the current `PlaceBuildOrder` and `PlaceObject` order-ID shape guards in `src/simulation/protocol/commands.ts`, aligned with the existing nonempty saved order ID. Fixed/mutated/restored results will be appended after execution. No schema, copy, tariff, format or native changes.

## Retained evidence

`raw/original-kernel-probe.test.ts.txt` and `raw/executed-regression.test.ts.txt` are inert executed sources. `raw/original-kernel-probe.txt`, `raw/initial-regression-fixture-error.txt`, `raw/original-corrected-fixture.txt` and `raw/fresh-duplicate-search.json` retain the actual results/search. They are not native acceptance.
