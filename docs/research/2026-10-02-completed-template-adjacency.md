# A later template perimeter beside a completed entrance

## VERIFIED: issue, baseline and present consequence

The isolated checkout starts at published integration `58a014e381`. Fresh
GitHub REST reads opened the complete bodies of #1663, #1692, #1696, #1700,
#1657 and existing [#1703](https://github.com/woogitsu/lockstate/issues/1703).
The latter already describes this completed-room command order, so no new
Issue is needed. The pending-only #1692 fix and the completed ordinary-wall
defense are both present at this checkpoint.

Complete a Basic Cell at (10,10), then request another at (10,17). Its north
perimeter crosses the completed Cell's sole outside entrance approach at
(11,17). The worker preflight reports clear because it compares incoming walls
only with pending plans. Actual `PlaceRoomTemplate` then reaches the existing
ordinary-wall defense: the blocking square fails, earlier shell orders are
cancelled, and the order book grows from twenty to twenty-two records.

This is a false clear verdict and a non-atomic refusal. The current defensive
wall reader prevents the first Cell from becoming sealed; this record does
not repeat the original Issue's permanent-obstruction claim as current fact.

The corrected regression reproduces forty failures: thirty-two combinations
of live completed, encoded completed save, legacy completed save without the
optional gesture ledger, and saved partial Undo/Redo continued to completion
across normal/mirrored four orientations; eight further saved completed
Undo-release/Redo-recovery cases. Nine controls pass: eight shifted neighbours
and an ordinary command-built, zoned Cell whose door has no template producer.

## VERIFIED: correction and mutation evidence

Published source `ac8d6f8f21` changes only complete-plan preflight and adds
`tests/integration/room-template-completed-adjacency.test.ts`. At that source
checkpoint, `src/simulation/construction/room-template-coordinator.ts:115`,
`for (const square of plan.wallSquares)`, reads each incoming opaque square
through existing `claimsRoomDoorApproachTile`. The reader already covers
pending plans and completed template door orders with matching live zoning
and door geometry. Its existing ownership inference stays unchanged, including
compatible older saves without completed metadata and ordinary-room exclusion.

The authoritative worker projection and actual command both refuse with the
existing structure occupancy/build refusal before the first order is submitted.
The regression compares every persisted gameplay field before/after projection
and command: world, orders/history, entities, simulation and treasury. Kernel
command sequence/queue changes are excluded. Real budgeted prisoner and guard
routes through the completed Cell's door succeed before refusal, after refusal
and after encoded reload. No global or animated route claim is made.

Legal shifted neighbours actually finish with two Cells and four fixtures,
including encoded reload. Actual Undo releases the original entrance; the
read-only neighbour preflight becomes clear without destroying Redo. Saved
Redo and genuine completion recover the claim and atomic refusal. The ordinary
command-built Cell control accepts and finishes the adjacent template under
the existing ordinary-room policy.

Disconnecting the production preflight reader with `if (false)` repeats forty
red cases while the nine legal controls remain green. Exact byte restoration
has coordinator SHA256
`57B906BA0878FD1680C82E91E5D6D6540DFE6CCB2D620CD03D903B5EF20A175A`.
The restored nine suites pass 206 tests in 11.55 seconds: completed adjacency,
pending adjacency, completed row wall access, completed furniture access,
completed transactions, contended shower fairness, staff coverage readout,
wall built mid-walk, and Yard/Common Room. Application and tools TypeScript
checks and the production build pass.

## Bound of this evidence

No tariff, cancellation/refund, history, save-format, player-text or doorway
ownership rule changes. No browser, HUD/input/art change, workflow change,
CI polling or merge was performed. The weakest claim is native browser
presentation: this establishes actual session commands, worker projections,
budgeted routes and encoded persistence. A browser showing a different
authoritative verdict on these same saved states would require a separate
UI/worker investigation; it is not measured here.
