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