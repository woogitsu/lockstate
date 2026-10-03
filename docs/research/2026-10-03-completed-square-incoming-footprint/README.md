### Fresh actual packed reproduction after current ownership/history integration, 2026-10-03

Source checkpointdc80e3b6e5219fd8861cd16ba4d88b79c2ee2f78 (latest published owned gameplay chain). Real seed73 PlaceRoomTemplate→genuine completion→optional encodedV8Load→ordinary PlaceObject or PlaceBuildOrder.

- Normal Cell10,10: incoming canonical Bed12,15, second square12,16 has squareStructure1.
- Mirrored90° Cell10,10: incoming canonical Bed13,12, second square13,13 has squareStructure1.
- In both cases the anchor has squareStructure0; neither anchor nor far square is occupied by another physical object.

Both real command entries admit the conflicting order live and after encodedLoad. Corrected focused baseline8RED/12legalGREEN,955ms tests/3.17s total. Eight free-interior controls complete the independent Bed; four actual legacy-edge controls also complete it beside a standing North edge (no squareStructure). These legal controls must remain valid.

Initial2legacy fixture failures used a bare ZoneRoom Cell without producing a real room; they are retained as fixture errors. Corrected controls first genuinely complete the Cell, then build the legacy edge through actual commands. No production change yet; no browser/CI claim. This remains existing1651, with the ordinary PBO entry additionally measured; no duplicate Issue.

Proposed narrow correction: existing object footprint loops consult completed squareStructure for every occupied tile before admission/material/history mutation. Existing PlaceObject tile-occupied and PBO unbuildable channels, single failed PBO diagnostic-row policy, ownership/provenance, legacy edge rules, save format and tariffs remain. Source leases requested; producer mutation/exact-byte restore and full refusal snapshots follow before any fixed claim.

Weakest claim: these are actual offline kernel/encodedV8 cases, not native pixels or hosted behavior. Incoming standalone Bed uses the canonical1×2 orientation; the commands do not offer independent rotation. The rotated/mirrored supplied pose belongs to the real Cell template. Other footprints require separate targeted controls. Source correction and negative/restoration proof pending at this diagnostic checkpoint.

## Verified correction and producer negatives

Only the two existing footprint loops change: System's full object admission checks squareStructure before its existing pending-template condition; the placement service's existing tile-occupied condition also checks squareStructure. Both use the existing world reader and refusals. Legacy edge geometry is untouched. Coordinator/session/format/copy/tariffs and internal deferred-history membership are unchanged.

[Fixed20GREEN](./fixed.txt),1.00s tests/3.39s total. Real System square-condition disconnection [4RED/16GREEN](./system-negative.txt),1.01s/3.20s. Real service square-condition disconnection [4RED/16GREEN](./placement-negative.txt),1.02s/3.30s: the still-protected System retains a failed diagnostic order while the unguarded service improperly reports/registers it as a placement, so the PlaceObject no-order/history assertions detect the actual consumer mismatch. Both files restored in finally from captured bytes, hashes [System](./system-restore.json) and [placement](./placement-restore.json). [Exact restored20GREEN](./restored.txt),1.01s/3.24s total. Detached mutation branches excluded work from branch-based WIP sweeping.

Refusal compares the complete gameplay snapshot except kernel dispatch progress and the established one failed PBO diagnostic row; funds/material state/old orders/history/zones/world/physical objects are equal. All original order revisions are equal. The refused state is really encoded/loaded and retains both room fixtures and the far square wall; legal interior and actual legacy-edge controls finish their independently owned Bed. No browser/CI claim. Neighbouring completion/history/type/build/documentation gates pending at this checkpoint.

## Terminal neighbouring source gates

[455GREEN across12files](./neighbours.txt),24.89s total/two workers. Exact paths:

- tests/integration/completed-square-incoming-object-footprint.test.ts
- tests/integration/pending-template-incoming-object-footprint.test.ts
- tests/integration/template-deferred-history-order.test.ts
- tests/unit/room-template-command-reservation.test.ts
- tests/unit/room-template-session.test.ts
- tests/unit/room-template-redo.test.ts
- tests/integration/room-template-rotated-history.test.ts
- tests/integration/room-template-replacement-order-ownership.test.ts
- tests/integration/build-order-object-collision-boundary.test.ts
- tests/integration/generic-object-footprint-admission.test.ts
- tests/integration/square-wall-object-footprint.test.ts
- tests/integration/object-placement-loop.test.ts

Both application/toolsTypeScript pass. Production client build passes in6.30s with its existing chunk/plugin warnings. These gates verify legal authored furnishing/history and previous collision/admission/provenance controls; they are not a browser or CI result. Both committed production files have zero worktree diff after restoration. Source leases released. Narrow doc source-anchor closure is separate.

## Terminal live-anchor closure

The initial eight documentation gates passed62tests in21.09s. The approved precision amendment updates only the newly shifted live System/service coordinates (+1), retaining the prior dated coordinates and quotations as historical checkpoints in WORLD/ADR0047/ADRindex. No budget or guard changes. The exact amended [documentation gates](./docs-terminal.txt) pass62tests/eight files in16.78s. Both production files remain byte-restored with zero source diff. No browser or hosted CI was run for this checkpoint.
