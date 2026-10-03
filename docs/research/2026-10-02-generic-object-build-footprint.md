# Generic object build orders against saved furniture

Recorded 2026-10-02 against published integration checkpoint `41998ff60f`.
Baseline diagnostic: `b8ec45228dc00f779d2800bd68112dfb10e1c29a`.
Scoped source and regression: `ca785768fd663dcedc4e4b525956e6009071e04f`.
Fresh finding: [Issue1976](https://github.com/woogitsu/lockstate/issues/1976).

## Actual missing command boundary

A genuinely completed Basic Cell at10,10 contains a Bed anchored11,11 whose second square is11,12. After createSaveEnvelope, JSON encoding, decodeSaveEnvelope and restoreSimulationRuntime, packed PlaceObject desk-wooden at11,12 refuses. Packed PlaceBuildOrder with the same definition and square approves instead. The latter reaches ConstructionSystem directly and bypassed ObjectPlacementService's live full-footprint guard.

The initial diagnostic produced2 failures and3 legal controls in35.01 seconds. A separate actual-runtime continuation measured order colliding-desk at11,12 as completed with progress60, assignedWorkerId mock-worker-1 and2 wood planks allocated. Treasury debit was130. Placed objects remained2, and the tile lookup still returned the original object.bed anchored11,11, orientation0. The registry rejected the overlapping new object while construction reported completion. This is a measured local command outcome, not a native browser or hosted-user impact claim. Completion rejection handling itself is not changed by this submission fix.

Fresh search and full bodies distinguish #1705 and PR1834 (incoming whole-square walls against furniture) and #1651 (ordinary PlaceObject against completed square walls). Issue1976 covers an incoming generic object order against another object. The unrelated optional source-order ownership proposal remains awaiting the owner in Issue1975; no field or refusal from that proposal is implemented here.

## Scoped rule and legal controls

Only ConstructionSystem changed. Before approving an object-producing definition, it asks the existing optional objectFootprintClaims callback about every tile of objectFootprintTiles using the incoming order's orientation. That existing reader combines pending object orders and standing registered objects. It returns the existing unbuildable reason; it does not choose a new room, save, history, tariff or copy policy. The existing duplicate check remains before this new guard, and constructors without the reader keep their earlier path.

The final24 actual packed-command cases cover:

- Saved pending and completed Basic Cell Beds at all4 template quarter turns. PlaceObject and PlaceBuildOrder are each aimed at the source Bed's non-anchor tile. Funds, objects, previous order revision and Undo/Redo/current-transaction history stay unchanged on refusal.
- Four pending/completed route pairs where the incoming Desk anchor is free and only its second square collides with the source Bed's second square. A real Yard at2,2 places the Bed at9,9; the incoming Desk at8,10 touches9,10. Both incoming squares have zero zoning and square/top/left structure values, independently excluding other geometry as the cause of refusal.
- A free Desk beside completed saved Cell furniture actually completes. Another low-level free Desk outside room zoning genuinely completes, retaining the current generic command route's room behavior.
- Saved pending/completed ordinary objects can be removed through their second tile and rebuilt with a generic Desk. The pending same-anchor duplicate retains duplicate-order and unchanged funds before removal.

PlaceBuildOrder's packed schema has no objectOrientation field. Source rotation is therefore produced by actual rotated templates, rather than adding an unsupported command field. The coordinator's oriented fixture orders use the same submission function; existing template rotation/history tests were included below.

One extra legal control initially used a finish helper that omitted failed as a terminal state; its deliberately refused duplicate made that helper exhaust its bound. The helper was corrected to include failed before the final successful and mutation runs. That test setup failure is not counted as a game defect.

## Mutation and exact restoration

- Fixed targeted regression:24 passed in3.73 seconds.
- Temporarily disconnecting only the new physical object guard:10 failed /14 legal controls passed in3.60 seconds. The existing PlaceObject guard and free/duplicate/removal controls still passed.
- Restored source bytes were exactly the bytes saved before mutation: SHA256 d489708080b0dee42537f696d0fc5d7def7a1943832bcb134512b33c94dea4d7.
- Exact restored neighboring gate:351 tests in9 files green in26.55 seconds. Files were build-order-object-collision-boundary, construction, construction-geometry, object-placement-loop, room-template-session, room-template-rotated-collision-atomicity, room-template-rotated-history, construction-placement-order and command-success-notices.
- App and tools TypeScript checks and production build passed. Existing build size/plugin timing notices were retained. No browser, workflow, CI or schema edits were made.

The source shift caused three quotation-budget overages in WORLD, ADR0047 and the ADR index. Narrow corrections re-opened actual source fragments and retain prior coordinates explicitly as history; neither budgets nor guard assertions changed. The index's earlier orderedOrders coordinate was already offset at the parent checkpoint, so its amendment states that fact rather than attributing the whole drift to these16 added source lines. Both source-anchor/quotation gates pass15 checks after these corrections. Final source-anchor, quotation, commit-citation and research-index verification passed28 tests in4 files in56.39 seconds.

## Limits and weakest claim

This proves the authoritative submission boundary for already claimed physical furniture in actual saved runtime models. It does not prove every later completion callback failure is prevented if world state changes after an initially legal approval. A distinct legal-command counterexample in that interval would justify a separate completion/lifecycle audit. No claim is made that generic PlaceBuildOrder should enforce PlaceObject's room-membership policy; its free outside-room control deliberately preserves the accepted current behavior.
