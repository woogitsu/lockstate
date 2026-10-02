# Removed or rebuilt template furniture persists in the snapshot render feed

Diagnostic source checkpoint: `c4cbefe6d87bbe73f3618a4ab7423d58ee99a2eb`.
Branch: `codex/template-rebuilt-render-identity-20261002`.

## Actual reproduction

Use packed commands in a genuine simulation runtime seeded with 73:

1. Place and complete Basic Cell at 10,10, normally or mirrored with one clockwise quarter turn.
2. Remove its completed Bed through `RemoveObject` at a real occupied tile. The normal second tile is south of the anchor; the rotated second tile is east of it.
3. Capture, encode and decode the actual V8 save, restore the runtime, then deliver its snapshot through the production `SimulationSnapshotFeed` request/reply path.

The physical registry contains no Bed. Its old construction order remains completed, as required by the accepted history rule. The render feed nevertheless contains one built Bed at the old anchor. This paints furniture that no longer occupies or blocks the square.

In the replacement variant, issue `PlaceObject` for an independent normal Bed at the old anchor before capture/load and complete it. The registry contains exactly one physical Bed with `sourceOrderId: replacement-bed` and orientation 0. Both old and replacement orders correctly remain completed. The production render feed contains **two** built Beds. This fails for same-orientation replacement as well as rotated-to-normal replacement, before and after encoded V8 Load.

## Measured baseline

`tests/integration/room-template-rebuilt-render-identity.test.ts`: **6 failures, 2 passing controls**, 503 ms test execution, 4.73 s total on the first run.

- Four replacement cases: original turns 0/1, with turn 1 mirrored, each before and after encoded Load. Expected one model, received two. The physical ownership assertions pass before that failure.
- Two direct far-tile removal cases: turns 0/1 with encoded Load. Expected no model, received one. The physical absence assertion passes before that failure.
- Passing control: genuine completed rotated Bed keeps its orientation, and a newly ordered pending replacement remains a planned ghost.
- Passing control: order-only legacy geometry remains visible when no physical-object snapshot is supplied to the adapter.

Application TypeScript and diff checks pass after supplying the real correlated ready-message envelope. This is a baseline reproduction, **not a production-mutation-verified fix or native pixel proof**. No production source has been edited or mutated; no browser has been launched.

## Cause and proposed narrow boundary

`structuresFromConstruction` renders every completed object order. Its type/anchor map removes a physical object after the first matching order, but does not suppress another completed order or a completed order whose physical object was directly removed. `SimulationSnapshotFeed` supplies this adapter with the genuine placed-object snapshot.

When the physical-object snapshot is present, it must be authoritative for completed object visibility. V8's exact source order can retain the real owner's renderer identity. Missing order history or missing legacy provenance must still allow a physical object to draw once; no renderer ownership inference may change simulation state. An absent physical-object snapshot needs the existing order-only legacy fallback. Pending object orders, walls, doors and all simulation/history/refund/schema/copy rules stay outside this correction.

## Duplicate check

Fresh GitHub reads on 2026-10-02:

- Search for `structuresFromConstruction`: only closed #1027, concerning stale wall/door edge suppression.
- Search for `RemoveObject` plus `render`: #988, #641 and #604; these concern notices, procurement and an older handover.
- Search for `duplicate` plus `furniture`: #1976, #1586 and #604.
- #1658's complete body describes ghost fixture-area coverage and stale mirrored preflight, not completed object visibility.
- #1487's complete body describes conflicting physical saved rows and array ordering, not duplicate construction models.
- #1975 describes exact physical object ownership over old gesture reversal; this defect occurs before reversal even while that physical ownership is correct.

The source-level render discrepancy is distinct. No new format, palette, copy, tariff or removal policy is proposed.
