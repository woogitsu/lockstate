# Small prison: literal built-client showcase preparation

Date: 2026-10-03. Source baseline: `5008b18920edce057bd4d21446ddfcac1ac8586e`.

## Evidence and status

**VERIFIED / actual kernel:** normal typed `PlaceRoomTemplate` commands in a
fresh session (seed 73), real staged BuildOrders, procurement, material hauling,
builder completion and room registration. No objects, cash, stock, world or
snapshots are inserted. The stopped whole session survives the production save
envelope encoder, JSON transport, decoder and runtime restore exactly.

**NATIVE PENDING:** the browser recipe is prepared for the coordinator's serial
built-client run. No browser/server/build was started by this agent. No native
pass, screenshot, visual acceptance or deployed result is claimed here.

## Exact public room plans, in this order

Origin is the top-left world tile; sizes and inclusive ranges include full square
walls. Clockwise quarter turns are selected through the public room-plan dialog.
The fresh owned parcel is `[0,31] × [0,31]`; the layout's union bounding box is
`[3,27] × [5,29]` (25 × 25). The rectangles do not overlap.

| Public plan | Origin | Turn | Footprint / inclusive range | Catalogue cost | Orders | Cash after completion |
| --- | --- | --- | --- | ---: | ---: | ---: |
| Storage Room | 5,5 | 0 | 5×5; x5–9 y5–9 | 1,395 | 18 | 23,605 |
| Delivery Bay | 12,5 | 0 | 6×6; x12–17 y5–10 | 1,780 | 21 | 21,825 |
| Four-cell row | 3,13 | 1 | 16×7; x3–18 y13–19 | 5,000 | 66 | 16,825 |
| Kitchen | 20,5 | 0 | 6×6; x20–25 y5–10 | 1,785 | 23 | 15,040 |
| Shower room | 20,12 | 0 | 5×5; x20–24 y12–16 | 1,345 | 18 | 13,695 |
| Canteen | 20,19 | 0 | 8×8; x20–27 y19–26 | 3,135 | 34 | 10,560 |
| Yard | 10,22 | 0 | 8×8; x10–17 y22–29 | 0 | 0 | 10,560 |

Total: **14,440 / 25,000**, 309 bricks and 32 wood planks, **180 completed
orders** (149 square walls, nine doors, 22 fixtures). Ten actual rooms: four Cells,
Storage Room, Delivery Bay, Kitchen, Shower Room, Canteen and Yard. Seven public
template gestures own all orders and persist completed template history.

The horizontal wing retains the authored two-tile corridor at x10–11, y13–19.
Cells occupy x4–8 and x13–17, with two banks at y14–15 and y17–18. Cell capacities
are 1 each, total 4; this is the default basic-cell layout rotated once, with its
whole two-tile beds also rotated. Literal fixture anchors, orientations and
BuildOrder owners are in
[`native-small-prison-showcase-plan.ts`](../../../tests/fixtures/native-small-prison-showcase-plan.ts).

## Kernel findings

The production kernel finished the seven successive plans in 11,981 ticks:
1,251 + 1,520 + 3,960 + 1,600 + 1,260 + 2,380 + 10. This is simulation time,
not a browser wall-clock prediction. No pending deliveries or template jobs
remain. All indoor room-list access values are `doorway`; Yard is `gap`.
Every room has zero missing object capabilities. The room requirements still
include unevaluated non-object requirements; this result is not a claim that all
operational/staffing/security requirements are fulfilled.

There are zero residents and zero staff. No admission, payroll or income is
needed to create this visual construction showcase. Yard is the actual outdoor
zoning plan: it adds no fence, fixtures or construction cost. This is not a
claim of a secure perimeter, working prison services or a populated scenario.

Production negative controls and exact restorations are recorded in
[`production-controls.json`](./production-controls.json), with their real RED
outputs and the restored GREEN output alongside it. No production mutation is
committed.

## Planned native acceptance

Reuse the existing player capacity/build approach: public New prison, Pause,
Build → Room plans, the literal origins/rotations above, Fast forward, actual
completion, Pause and Save now. Later serial stages consume the prior real
IndexedDB save; none insert a prebuilt fixture. The final capture uses that same
completed prison at three public HUD camera poses and compares the entire paused
worker snapshot before/after camera controls and Save/Load.

Only the coordinator starts the built-client browser run. A follow-up checkpoint
adds the opt-in recipe/helper and precise capture instructions. Existing specs,
shared mapping/palette/schema/workflow and browser limits are not modified.
