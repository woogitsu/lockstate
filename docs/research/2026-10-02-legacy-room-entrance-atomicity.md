# Wall entrance collisions after Undo, Redo and encoded Save/Load

## Verified scope and missing boundary

The isolated checkout starts at `7ad7cfe1c8`. A fresh read of existing open
[#1661](https://github.com/woogitsu/lockstate/issues/1661) describes a legacy
north-edge wall at a Cell's exterior approach, ignored by room preflight.
The existing rotated-history suite already covers all twenty templates,
four rotations and both mirror states through their completed room Undo/Redo
and encoded saves. Repeating that success matrix would not exercise this
different collision boundary.

The new regression uses actual session commands and the production worker
preflight projection. A legacy edge or whole-square wall is queued or completed, saved, undone, saved,
redone and saved again. Undo makes preflight clear; Redo restores the barrier.
Each of the twenty templates, four rotations and both mirror states is then
submitted against the restored barrier. Yard uses an ordinary interior edge
because it has no doorway; the four-cell row exercises its internal corridor.
The other eighteen plans exercise their entrance boundary. These are saved
barrier history flows, not another claim of completing all twenty rooms here.

Before correction, 72 of the 160 cases fail actual command atomicity: south
and east entrance edges are stored on a tile outside the room rectangle.
A Basic Cell adds eighteen shell orders, changing the count from one to
nineteen, despite the restored blocking wall. North and west edge anchors
are inside the rectangle and were already rejected. The original baseline
passes the other 88 collision cases and four adjacent-edge controls.

The requested whole-square follow-up reproduced another 144 failing cases:
an outside wall square occupies the approach itself in every orientation of
those eighteen single-entrance plans. The rectangle cannot see that square.
The unchanged legacy correction still passes, as do the row/Yard collisions
and all adjacent-square controls. Actual square-wall submission likewise adds
eighteen Basic Cell shell orders against a blocked entrance.

## Scoped correction

Source checkpoint `5ee1c24068` adds `wallEdgeClaims` at
`src/simulation/construction/room-template-coordinator.ts:69` and checks
`standing === WALL_EDGE_NUMERIC_ID` at
`src/simulation/construction/room-template-coordinator.ts:130`.
The separating edge is read at the southern/eastern of its two tiles, with
its exact north/west orientation. A refusal uses existing
`structure-occupied` at the doorway square before any shell submission.
Adjacent exterior edges and passable exterior doors remain legal. The
history rule, save fields, costs and player text are unchanged.

Whole-square occupancy uses `getSquareStructure(approach)` and
`wallSquareClaims` beside
`src/simulation/construction/room-template-coordinator.ts:121`, checking
exactly the approach square rather than every adjacent wall.

The test dispatches the actual rejected placement before comparing complete
construction/history, treasury, world, entities and saved simulation. The
preflight read itself changes no snapshot field. Accepted/rejected commands
necessarily change the kernel command queue, which is excluded from that
gameplay comparison.

## Obtained verification

The complete new suite passes 176 tests: 160 catalogue/orientation/mirror
cases each exercise queued and completed barrier history for both legacy edges
and whole squares, plus four adjacent-edge controls, four passable-door controls
and eight adjacent-square controls. It runs in roughly ten seconds
on this Windows checkout.

On the initial legacy-only 168-test checkpoint, two independent production
mutations prove both edge readers matter:

- suppressing queued wall-edge claims gives 72 failures and 96 passes;
- suppressing the standing-wall condition gives 72 failures and 96 passes.

After adding the square-wall cases, independent queued-square and standing-square
mutations each give 144 failures and 32 passes in the final 176-test suite.

The second mutation passes queued refusal before failing the completed
barrier in each affected case. Both mutations reproduce wrong shell orders,
rather than merely an incorrect preview label. Exact byte restoration of the
coordinator has SHA256
`FF77C64B9603D36AF125346AEA3F7A17BA0685D431688D6E519E15F4E27B5F5C`.

The restored new suite, entrance-history suite, rotated second-tile collision
suite, whole-room placement suite and pending reverse-order furniture approach
suite pass 202 tests in five files. Both TypeScript targets and the production
build pass. No browser, workflow change, CI polling or merge was performed.

The weakest claim is player presentation: this proves authoritative session,
worker projection and persistence behavior, not a new native browser capture
or deployed availability. Existing Issue #1661 remains the defect record;
there is no duplicate Issue.
