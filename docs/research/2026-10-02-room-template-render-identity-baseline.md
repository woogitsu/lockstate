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

## Implemented correction and exact verification

Confirmed issue: [#1980](https://github.com/woogitsu/lockstate/issues/1980).
The original baseline is published at `907fdc95f94101fb09ed1d0087d1170a0f7fd030`;
its measurements and baseline-only limitations above describe that checkpoint.
The correction is published at `db50d61ce09d79eb479d3ea9dec9aa2eae0c1add`.

The sole production edit is `src/rendering/world/structures.ts`. A supplied
physical registry now supplies completed furniture geometry exactly once per
physical row. A completed order supplies display identity only when its exact
recorded source ID also matches completed state, object type and anchor. An
absent registry retains order-only fallback. Pending furniture, walls and doors
keep their existing path.

Ownerless legacy rows remain drawable. One matching completed order preserves
the established display ID; ambiguous matches retain the physical row's own
ID. This is a read-only display choice: the adapter assigns no simulation
ownership. Known but invalid provenance does not fall back to an unrelated
historical order. Order indexes keep the adapter linear in orders plus physical
rows, including ambiguous legacy history.

The expanded regression has **16 cases**:

- The original six actual packed-command removal/replacement reproductions.
- Genuine completed rotated furniture and a pending fixture ghost.
- Undefined registry fallback versus an explicitly empty physical registry.
- Walls, doors and pending furniture retained independently of completed object
  visibility.
- Two genuine encoded V7 replacement loads with ambiguous ownerless history,
  including rotated-to-normal replacement; one legacy single-match control.
- Three adapter controls for missing, wrong-type and wrong-anchor recorded
  owners. They retain the physical row's identity, anchor and facing.
- Rendering of ambiguous legacy state leaves the full captured session snapshot
  unchanged. The four genuine replacement cases retain the independent new
  order ID across normal/rotated placement and encoded V8 Load.

Two deliberate negatives changed the **real production adapter**, separately:

| Production disconnection | Negative result | Exact restored result |
| --- | --- | --- |
| Admit completed object orders despite a supplied physical registry | 14 failed, 2 passed; 857 ms tests, 3.37 s total | 16 passed; 894 ms tests, 3.43 s total |
| Resolve the first historical matching order instead of the recorded exact source ID | 6 failed, 10 passed; 880 ms tests, 3.42 s total | 16 passed; 872 ms tests, 3.42 s total |

Each restoration wrote the original bytes back and independently checked
SHA-256 equality:
`233d1486be34a5d5aaf74f181e727f522b3a32aaecc4565bd37f2fd04d8cf1c5`.
The registry negative retains the undefined-registry fallback and ordinary
wall/door/pending-fixture controls. The owner negative retains legacy controls
while exposing wrong identity on genuine independent replacements.

The final restored run combined this regression with
`object-art-orientation.test.ts`, `rendering-world-view.test.ts` and
`rendering-feed.test.ts`: **115 passed, 4 files**, 861 ms tests, 2.86 s total.
Application and tools TypeScript checks and the production build passed. The tests exercise the
production snapshot feed and adapter; **native pixel acceptance remains
unperformed** because another agent holds the exclusive browser lease. No
browser was launched and no schema, history, copy or simulation source changed.

## Historical native preparation checkpoint (aab9739; execution then pending)

`tests/browser/room-template-rebuilt-render-identity.spec.ts` prepares genuine
Full HD dev/source acceptance. It imports the existing completed-logistics save
produced by real scheduled worker commands, then uses player controls to place
and complete a Basic cell at `(20,20)`, clockwise quarter turn 1. The current
worker produces its Bed at `(24,21)`, orientation 1. An offline fixture probe
first rejected the test author's stale `(22,21)` assumption; the corrected
packed-command path then passed, 258 ms test execution, 2.81 s total. No game
defect is claimed from that initial fixture expectation failure.

The existing numeric removal control produces genuine `RemoveObject`; ordinary
Bed placement produces a separate normal-orientation `PlaceObject` at that same
anchor. The UI does not offer individual furniture rotation, so no synthetic
rotation control or injected rotated order is used. The fixture then saves and
loads through the player's real persistence controls.

A test-only observer appends a read-only function to the fetched Vite main
module. It reads the actual live scene's frame, last projection and existing
solid-image map/pool, including texture key, identity, count and pose. It never
replaces the feed, worker state, render frame, projection or images. Footprint
corners are checked independently from the observed camera pose and the known
physical 2x1/1x2 rectangles. Actual canvas buffers record removal, rebuilt
pixels and paused Load continuity in the expected occupied volume. Worker
snapshots and submitted command receipts retain both completed order IDs and
the one exact physical owner. Failure hooks preserve real worker/scene evidence.

This is **prepared dev/source coverage**, not built-artifact acceptance.
Native execution, native pixel calibration and the real-adapter browser
negative/restoration remain pending the explicit exclusive browser lease.
The existing 16-case offline adapter mutation proof above remains verified;
it does not substitute for the pending native result. No browser, retries,
timeout/config changes or production observer hook has been introduced.

## Native acceptance completed on 2026-10-02

Corrected consumer checkpoint: `ae27a45d0e5437c677867ddad191e7c39c7ceb85`.
The preceding pending statements describe the historical preparation checkpoint,
not the final result. The [immutable native receipt](./2026-10-02-room-template-render-identity-native/native-evidence.json)
retains actual worker snapshots, command receipts, render identity, projection,
image keys/counts, source hashes, stage timings and PNG hashes.

Three early native failures were **fixture errors**, not production defects:

1. A nonexistent authored `45:45` key was expected instead of the actual cot
   catalogue's `30:40` selection (47.7 s).
2. One stale `tileX:22` assertion survived the earlier anchor correction; the
   actual Bed anchor is `(24,21)` (38.5 s).
3. A false camera-centre persistence assumption after Load failed at 59.85 s;
   Load correctly resets the centre. A genuine player minimap reframe is required.
   Recorded stages were rotated capture 38.54 s, removed capture 43.81 s,
   rebuilt capture 53.31 s, confirmed Save 55.20 s, confirmed Load 57.53 s,
   and loaded capture 59.85 s. No camera production change was made.

The entire fixture was then audited against actual packed/V8/projection tuples.
The corrected test uses two distinct serial player lifecycles: build/remove/
independently rebuild/Save, then a new page reopening the **same actual saved
IndexedDB state**, Load/Pause/minimap reframe. It retains the first lifecycle's
real PNG and physical/order ownership captures. Neither state nor feed is
injected or replaced. The original 60 s test and 10 s assertion budgets, one
worker and no retries remain unchanged.

| Actual run | Result | Lifecycle timings |
| --- | --- | --- |
| Corrected native consumer | 2 passed | 57.0 s / 9.3 s |
| Disconnect completed-history suppression in the real adapter | 1 failed; dependent saved lifecycle did not run | 39.5 s |
| Restore exact adapter bytes | 2 passed | 57.4 s / 9.3 s |

The negative exposed **two actual drawn images while the physical registry
still held one Bed**, expected image count 1. Its dependent lifecycle is not
claimed as a pass or failure. Restored source SHA-256 is exactly the recorded
`233d1486be34a5d5aaf74f181e727f522b3a32aaecc4565bd37f2fd04d8cf1c5`.

The final restored run retained actual image counts **1 ? 0 ? 1 ? 1**.
Actual commands were `PlaceRoomTemplate` at `(20,20)`, quarter turn 1;
`RemoveObject` at `(24,21)`; then independent `PlaceObject` Bed at `(24,21)`.
The reopened lifecycle submitted no new gameplay commands. Both historical and
replacement orders remained completed, with one exact replacement physical
owner preserved through V8 Save/Load. The original rotated Bed is 2x1; the
normal replacement is 1x2. Consumed texture keys were respectively
`oblique:furniture.cell.cot.single:30:40` and
`oblique:furniture.cell.cot.single:300:40`, independently checked against the
actual authored catalogue and real camera pose.

Real Full HD canvas captures recorded **9,203 changed pixels on removal**,
**10,779 on rebuild**, and **0 after paused/reframed Load**, using the same
captured area and RGB threshold. Exact captures are retained:

- [Actual rotated Bed](./2026-10-02-room-template-render-identity-native/actual-rotated-bed.png)
- [Bed absent after direct removal](./2026-10-02-room-template-render-identity-native/actual-bed-removed.png)
- [Independent normal rebuild](./2026-10-02-room-template-render-identity-native/actual-independent-normal-bed.png)
- [Same rebuild after genuine Load](./2026-10-02-room-template-render-identity-native/actual-independent-normal-bed-loaded.png)
- [Actual negative with duplicated images](./2026-10-02-room-template-render-identity-native/failed-actual-player-fullhd.png)

This proves **dev/source native acceptance**, including actual canvas pixels and
live scene consumers; it is not a built-artifact claim. Test-only observation
remains read-only and no production observer was introduced. The terminal
runner released port 5317; no listener or process referencing this worktree
remained. The exclusive browser lease was explicitly released to the parent.
