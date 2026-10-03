# Room-template quarter-turn geometry checkpoint

Existing issue: [#1586](https://github.com/woogitsu/lockstate/issues/1586). Fresh remote searches for template rotation and room-plan rotation returned #1586, whose player flow already requires rotate/mirror where relevant. No duplicate Issue was created.

## Current missing path

RoomTemplateTool, RoomTemplatePlacementRequest and the native plan catalogue only carry mirrorX. The existing keyboard/camera rotation changes the view, not the plan's orientation. Therefore an authored 7×16 cell row cannot become a 16×7 row. The current 20-plan keyboard tests prove mirroring and rearming, not quarter-turn placement.

## Prepared pure geometry

Source checkpoint `2ac767283f` adds the dormant `rotateRoomTemplateGeometry` function. It rotates an existing normal or mirrored plan in integer clockwise quarter turns around its unchanged top-left world origin; negative turns apply the inverse. It transforms wall squares, door squares and orderTile hints, every zone rectangle and every complete fixture rectangle. Odd turns swap plan and fixture dimensions. Geometry-only quarterTurns metadata retains whole-plan and fixture orientation for a future adapter. The source plan is not mutated and unsafe swapped coordinate bounds are rejected.

This module has no production consumer. Its richer output is not a placement or save schema. Treating it as an existing RoomTemplatePlan and discarding orientation/fixture extents would recreate the bug; integration must explicitly use the richer geometry.

## Evidence

- New rotation suite: 43 passed, including all 20 plans normal/mirrored through four successive turns and inverse transforms; every fixture remains inside one zone and outside walls/other fixtures.
- Independent concrete Basic cell expectation: the two-tile bed becomes x14,y21,width2,height1 at origin10,20; the 4×7 shell becomes 7×4 and its south door moves to x10,y21.
- North-bank door orderTile offsets rotate with the doorway.
- Meaningful mutation treating rectangle anchors as one-square points: 38 of 43 tests fail. Restoring the full rectangle transform returns green.
- Rotation and existing catalogue suites: 87 passed. TypeScript build passed.
- No browser, worker protocol, persistent field or player-string change.

## Integration work still owed

1. Define authoritative orientation for rectangular objects; currently placement assumes their unrotated catalogue dimensions. Renderer facing, occupancy, preflight and completed state must agree.
2. Resolve door-edge/orderTile orientation explicitly; transforming its coordinate is only the geometric input to that adapter.
3. Review room minimum-size validation for rotated rectangles (a 2×5 interior becomes 5×2); no validation rule is silently weakened here.
4. Thread orientation through explicit worker commands and versioned pending/history state only after the coordinator verifies existing owner authorization or obtains a specific decision.
5. Add accessible UI controls using approved copy; prove all orientations in actual Full HD preview, exact placement, collision refusal, Undo/Redo and Save/Load.

This checkpoint does not claim playable room rotation or publication to main.
## Construction adapter and executable integration plan

Checkpoint `b7c194acf5` adds dormant `roomTemplateConstructionGeometry`. It emits exact full-square wall descriptors, canonical north/west doorway descriptors and fixture anchors with orientation. Its descriptor is deliberately not a command or save schema. Tests use the existing worker `objectFootprintTiles` reader over every normal/mirrored plan at all four orientations and compare every reserved tile with the geometric rectangle.

The doorway adapter rotates the original north edge to east/south/west. East uses west on the adjacent x+1 tile; south uses north on y+1. This is existing BuildEdge storage, so doors need no new persistent edge vocabulary. A concrete Basic cell at origin10,20 has canonical doorway orders (11,26,north), (11,21,west), (12,21,north), (16,22,west) across the four orientations.

Adapter tests pass 21 cases; combined rotation/adapter passes 64. Mutating every fixture descriptor to orientation0 fails 15 adapter cases; restoration returns all64 green. No production validation path has been replaced by this dormant adapter.

### Fields already sufficient

| Existing representation | Reuse |
| --- | --- |
| BuildOrder location and edge north/west | All rotated doorway boundary positions |
| BuildOrder footprint square | Rotated occupied wall squares |
| PlacedObject orientation0..3, current strict placed-object save schema | Completed rotated object facing and occupied extents |
| orientedFootprint/objectFootprintTiles | Exact odd-turn width/height swap and reservation tiles |
| Room zone x/y/width/height | Rotated axis-aligned zone rectangles |
| Object catalogue capacity by authored width | Keep capacity invariant under orientation, as room-capacity explicitly requires |

### Actual missing state and contract

`PlaceObject` currently rejects any orientation key through its strict schema. `ObjectPlacementService.place`, its pending-order tile reader, and completion all use DEFAULT_PLACEMENT_ORIENTATION0. ConstructionSystem's completion callback currently supplies only objectId and anchor. BuildOrder and its strict saved schema have no object orientation. A completed PlacedObject can carry a rotation today, but an unfinished queued order cannot retain it through Save/Load.

`PlaceRoomTemplate` has only templateId/origin/mirrorX. The strict roomTemplateRequestV7Schema used by pending/undone/completed has only those fields plus sequence. Consequently no existing request field can preserve an independently chosen quarter turn. Reinterpreting mirrorX, edge or footprint would corrupt existing meanings.

Recommended concrete addition for coordinator/owner review: optional quarterTurns0..3 on template requests (including queued command and room-template pending/undone/completed snapshots), and optional objectOrientation0..3 on BuildOrder (including construction/transaction saved order copies). Absent means0 for older records. Completed PlacedObject reuses its existing orientation field; no new catalogue IDs or duplicate object definitions are needed. These are proposed format additions, not implemented or self-approved here. The coordinator must obtain the exact necessary owner approval before crossing the save-format reservation.

A derived order-orientation lookup from template history could avoid the second saved key but creates an order-to-history dependency across standalone orders, cancelled templates and completed Undo/Redo. Prefer the build order itself as the durable source of its future occupancy and facing.

### Integration sequence

1. Approve the exact optional state additions and corresponding player control wording; retain absent0 compatibility and validate strict0..3 domains.
2. Extend worker template preflight and command port in one coherent change. Derive rotated geometry once, then use this adapter for wall/door/object expansion. Quote remains unchanged because counts/materials do not depend on orientation.
3. Carry objectOrientation through createBuildOrder, pending-order claims, same-square duplicate comparison, construction completion sink and object registry. Use the same objectFootprintTiles reader for both preflight and final occupancy. Undo/Redo must retain it in every order snapshot.
4. Carry quarterTurns through template request history and snapshot restore; derive pending plans from the saved request, never from UI selection or renderer pose.
5. Verify existing room minimum-size semantics before changing any validator: the Basic cell becomes5×2, while room requirements currently express minWidth/minHeight. If orientation-independent minimum dimensions require a new gameplay rule, propose that specific choice to the owner rather than silently accepting it.
6. Add actual UI quarter-turn control, fit-revision refresh and exact fixture footprint preview; preserve the approved origin lock until physical movement. Camera yaw remains independent of template rotation.
7. Prove pending and completed Save/Load, collision refusal, partial-build Undo/Redo and real Full HD preview→click for all four orientations. The current geometry/adapter proofs are prerequisites, not delivery of those runtime paths.


## Safe final bounds and independent preview checkpoint

The isolated follow-up adds a dormant content preview DTO using the transformed
wall, door, floor and complete fixture tile extents. It exposes dimensions,
orientation and fixture count without adding a control, command or save field.
It is preparation for integration after the owner answers the two draft decisions;
it is not an enabled quarter-turn feature in the running game.

A new boundary regression found a real defect in the prepared geometry: a valid
180-degree basic-cell footprint at `MAX_SAFE_INTEGER - 4` was rejected because
rotation validated an unused intermediate 90-degree extent. The original source
failed this regression (1 red / 43 green). Direct local transforms now validate
only the requested final footprint; no unsafe transient world-coordinate sums are
needed. Final rotated coordinates and canonical door descriptors are checked for
all 20 plans at both signed safe-integer limits, including inverse rotation.

The preview test independently rotates each individual authored occupied tile
and compares the complete role-tagged tile set for every plan, both mirrors and
all four orientations. Replacing complete fixture rectangles with 1x1 anchors
made 16 of its 21 cases fail. Restoring the source gave 109 passing cases across
rotation, construction descriptor, preview and catalogue suites; TypeScript also
passed. No browser was started and no production default was activated.
