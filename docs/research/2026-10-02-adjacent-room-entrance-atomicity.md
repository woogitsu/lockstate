# A later room perimeter across an earlier pending entrance

## Verified issue and current baseline

The isolated checkout starts at root `edc558f7e7`, including the ordinary-wall
reader and both inverse-order entrance fixes. Fresh REST reads opened the full
bodies of #1661, #1696, #1672, #1700 and existing open
[#1692](https://github.com/woogitsu/lockstate/issues/1692). The latter already
records adjacent template perimeters, so no new Issue is needed. The earlier
`347385bf03` patch exists locally but handles only unrotated south entrances.

An actual pending Cell at (10,10) and a second Cell at (10,17) have disjoint
rectangles. The first door's approach at (11,17) is in the second perimeter.
On this current baseline, worker preflight still reports clear. The ordinary
wall reader now stops the blocking square when the second shell is submitted,
but submission has already added failed/cancelled records for part of that
shell. One measured case changes the order count from eighteen to twenty.
This audit does not claim the protected first room is still sealed: the
remaining defect is a false clear verdict and non-atomic complete-plan refusal.

The baseline fails 24 actual-command cases: normal and mirrored Cells, all four
rotations, and fresh pending, saved pending, or saved partially completed
Undo/Redo flows. Eight shifted adjacent-plan controls pass.

## Correction and obtained evidence

Source checkpoint `46ffd344da` reads `incomingWalls` beside
`src/simulation/construction/room-template-coordinator.ts:111` and compares
them with the existing rotated pending doorway approaches. Any intersection
returns existing `structure-occupied` on the incoming wall square before
the first shell order reaches construction. No save, history, player text or
cost rule changes.

The new regression compares the complete saved gameplay before and after the
worker preflight read and actual refused `PlaceRoomTemplate`: orders/history,
treasury, world, simulation and entities. Kernel command queue/sequence changes
are excluded. The adjacent clear controls still queue both plans without
failed/cancelled orders. A representative saved partially completed, undone
and redone mirrored 270-degree first Cell remains furnishable: it finishes
with two fixtures and the production room-detail worker projection reports
`doorway` access.

Emptying the production incoming wall set restores 24 failures while eight
controls remain green. Exact byte restoration of the coordinator has SHA256
`14B79ABCD4DD5140AF5E329DF33FA62C16C091257FCBAAC8DBCCED5C7E8573A4`.
The restored adjacent-plan, later ordinary-wall, entrance-history and completed
template transaction suites pass 95 tests in four files. Both TypeScript
targets and the production build pass.

The earlier owned documentation amendment `2b5d9ac549` is included as dependency
`794421208c` in this isolated branch; its index conflict retained both research
rows. This repeats no new source change and the integration can skip it when
that amendment is already present.

The weakest claim is browser presentation: this establishes real session,
worker projection and encoded persistence behavior without a native browser
capture or deployment claim. No browser, HUD/input/art edit, workflow change,
CI polling or merge was performed.
