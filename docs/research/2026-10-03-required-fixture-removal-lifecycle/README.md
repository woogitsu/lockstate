# Required fixtures: actual rotated removal, repair and history

Base986acd75bcf8bae7c761840ec28f5c15555bd40b, own isolated `lockstate-required-fixture-removal-audit-20261003`. Eight bounded read-only scenarios, no production changes. No browser/server/Blender, artificial stock/needs/world/actor feed, source-negative acceptance claim or new policy.

[Actual inert recipe](./run-required-fixture-measurement.cjs.txt), [maker](./make-required-probe.cjs.txt), [raw terminal log](./final-measurement.txt), [complete actual domain tuples](./measured-results.json).

## Literal requirements and gates

Current room-catalog: Cell requires1Bed+1Toilet, Canteen2DiningTables, Laundry2WashingMachines. Worker `hud/room-detail` is invoked through the real PROJECTION_CATALOG with actual physical registry and navigation/perimeter sources. Readiness quantities are not inferred from capability presence or historical completed orders.

Actual room-capacity sums the definition's width per capability, deliberately ignoring orientation: one table supplies3dining, one machine2laundry, one Bed1sleep/resident. Therefore removing one of two machines/tables reduces capacity without removing the capability altogether. `minQuantity` readiness and concurrent-use capacity answer different questions.

The own-accommodation bypass is an existing explicit rule, not this audit's invention. ADR0028 context150-159 states sleep/eat-in-cell/use-toilet work regardless of contents after accommodation is held; decision2 removal subsection440-455 retains residents without their bed and reports missing-capability. ADR0076 at157-162 records the same actual kernel test. No new comfort or eviction rule is imposed here.

## Genuine sequence and independent coordinates

Each scenario builds real Storage5,5 and DeliveryBay12,5 with procurement/worker completion, then actual Canteen20,5, Laundry20,16, Cell5,20, q1normal or q3mirrored. No seed injection or component edits. HireGuard and staged genuine admission establish one actual resident. Source/footprint coordinates are computed from fixed authored dimensions/corners, mirror first then clockwise rotation, independently of production rotation helpers; the selected object's physical owner is checked before removal.

q1 uses public packed RemoveObject; q3 uses packed RemoveWall with the actual required north edge, reaching the existing object-first Demolish arm. Each captures immediate same-tick capacity and worker requirements, then1500ticks of actual admitted actions live and after encoded V8. A supported ordinary PlaceObject normal-orientation purchase is genuinely completed, saved/loaded, undone through public Undo, saved/loaded and redone through public Redo to actual completion. Original completed-template owner remains historical; the repaired physical object must carry the new standalone order ID.

| Removed required object | Immediate capability capacity | Worker satisfying/min quantity | Actual existing accommodated action live/V8 |
| --- | --- | --- | --- |
| Bed |sleep1→0; resident1→0|0/1, missing-capability|sleep remains in held accommodation|
| Toilet |sanitation1→0; resident remains1|0/1, missing-capability|use-toilet remains in held accommodation|
| One of2tables |dining6→3|1/2, missing-capability|eat-meal uses the remaining table capacity|
| One of2machines |laundry4→2|1/2, missing-capability|laundry-work uses the remaining machine capacity|

These outcomes repeat in both q/mirror cases. Rebuild restores original required quantity and capability capacity with satisfied-by-capability; Undo returns the exact shortfall; encoded V8+Redo restores actual standing normal furniture with the new exact sourceOrderId. All eight sequences pass. Counts/statuses, capacity, candidate presence, physical rows/owners, room identity/accommodation and actual performing targets are retained in JSON. Whole-worker snapshot equality is not asserted by this probe.

## Explicit manual repair limitation

PlaceObject and PlaceBuildOrder strict wire schemas do not accept objectOrientation; only authored templates/internal service orders supply it. This audit never manufactures a rotated standalone command.

After removing only one q1/q3 Canteen table, exhaustive normal3×2 footprints within its actual interior find no clear candidate: remaining rotated benches constrain the cleared table pocket to2×3. The [first no-fit run](./no-normal-canteen-fit.txt) and [exact executed source](./no-normal-canteen-fit.cjs.txt) retain that measured boundary, instead of claiming a sole removal can immediately buy a normal replacement.

A separate real optional-bench demolition makes the legal supported repair possible: q1 bench24,6 owner `room-template-000000000002-2-object-002` then normal table23,6; q3mirror bench23,6 with the same original owner then normal table21,6. Dining remains3 until the new table really completes, then6. These extra removals are explicitly recorded; their seating loss is not hidden and the original table pose is not claimed restored. Bed/Toilet/Machine repairs need no extra optional demolition. A user-facing standalone rotation control would be a separate feature/protocol scope, not a capacity/readiness fix inferred here.

## Dedupe and original preparation errors

Fresh issue searches remove/capacity, toilet/removed, toilet/capability and openconstruction/templates were read. #585/ADR0076 already cover occupied bed removal; #326 covers per-capability ceilings; #1031 covers completion timing; #1975 and #1980 cover replacement ownership and render identity. No new Issue for the green behavior. #1687's exact pending Undo/Redo problem already has current `room-template-rotated-history.test.ts:219` coverage; #1664 safe footprint bounds is a different admission boundary, so neither is repackaged as this result.

Initial executable had a missing closing brace: [actual original recipe](./initial-run-required-fixture-measurement.cjs.txt) and [parser error](./initial-measurement.txt), no production RED. Next q3 Demolish attempt omitted the required edge field: [actual recipe](./initial-demolish-edge-fixture.cjs.txt) and [schema error](./initial-demolish-edge-fixture.txt); final actual north-edge command fixes only that fixture shape. The no-normal-Canteen-fit result is a genuine geometry/control limitation, not a parser error or a production regression under an invented rotation interface.

No source was mutated; this is a bounded measurement, not a new regression suite or producer-negative proof. Future production changes require a scoped lease and actual mutation acceptance. Exact working-byte manifest and original executed errors are retained.