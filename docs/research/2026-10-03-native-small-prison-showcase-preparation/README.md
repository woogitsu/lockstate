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

### Opt-in route and limits

[`native-small-prison-showcase.recipe.ts`](../../../tests/browser/native-small-prison-showcase.recipe.ts)
contains five serial cases:

1. New prison → public Storage Room and Delivery Bay → actual completion → paused Save.
2. Load that actual save → rotated four-cell wing → actual completion → paused Save.
3. Load the same prison → Kitchen and Shower room → actual completion → paused Save.
4. Load the same prison → Canteen and outdoor Yard → actual completion → paused Save.
5. Load the same completed prison → three camera captures → real Save/Load → whole paused equality.

The observer posts only production `request-snapshot` / `request-projection`
reads. Every writer is a public UI gesture. Before each new stage, its whole
loaded worker snapshot must equal the previous actual paused save. All 22 fixture
anchors/orientations/owners and all completed template histories are checked.
The same browser snapshot consumer is executed against real kernel captures in
the integration test, including each intermediate phase.

Completion uses actual completed order + template counts; transient zero queued
orders between shell and fixtures cannot pass. A ten-second progress assertion
requires real construction advancement; the zero-order Yard is checked through
its real completed template registration. No sleep replaces an assertion.

The opt-in config generator inherits the canonical artifact config, including
the real production preview server, worker/CSP policy, one browser worker, zero
retries, 60-second cases and ten-second expectations. Only this new 66-order wing
case calls `test.slow()` (180 seconds): its 3,960 actual kernel ticks alone are
49.5 seconds at the public maximum 4× speed, before UI/Load/Save/render overhead.
No old spec or shared limit is changed. The 39-order capacity route and remaining
cases retain 60 seconds. This is a larger scoped player journey, outside routine
CI/source-dev discovery; its `.recipe.ts` suffix is intentional.

### Three captures of the same prison

Full HD 1920×1080, oblique renderer. The last case starts a fresh renderer and
loads the real completed save, so its source-defined initial pose is yaw −45°,
elevation45°, zoom1.25. Use the public Minimap to centre tile15.5,17.5, focus the
unarmed native canvas, press Minus five times (planned zoom0.4096), then centre
again. Camera changes use the existing public HUD buttons:

| Capture | Public gesture from previous capture | Planned camera yaw / elevation |
| --- | --- | --- |
| `whole-315-45` | initial pose | −45° (315°) /45° |
| `whole-45-45` | Rotate camera right ×6 | 45° /45° |
| `whole-135-55` | Rotate camera right ×6; Raise camera angle ×1 | 135° /55° |

Each capture stores the actual canvas PNG, actual Full HD PNG, its canvas hash
and the unchanged whole worker snapshot. All three canvas hashes must differ.
Production camera math confirms planned bounding corners fit the viewport with
a conservative two-tile height allowance. This calculation does not prove HUD
occlusion, texture readability or visual quality; root must open all three
actual Full HD images and inspect the completed prison.

The read-only art observer records terminal canonical PNG bytes and real loader
HTMLImageElement/Blob decode evidence, reusing the existing cot observer. Ten
literal current descriptor/source hashes cover all fixture types, including the
Storage Room's actual timber-rack variant. Native acceptance requires each
descriptor, matching 256×256 PNG body/hash and successful real loader decode.
It does not infer visual style from network presence alone.

The final case compares the **whole** paused snapshot before camera controls,
after every public pose and after real Save now → Load. It also rechecks all
owners, exact cash and the full room-list projection. Snapshots include kernel,
world, construction, entities, every simulation subsystem, identity and seed.
No field is dropped to make equality pass.

### Coordinator run recipe (not run here)

Use the current real production build from the coordinator's integrated tree.
The canonical artifact config refuses to load without built `dist`. Prepare the
ignored opt-in config, then root alone starts the serial native run:

```powershell
node tooling/research/write-small-prison-showcase-config.mjs
node node_modules/@playwright/test/cli.js test --config assets/intermediate/small-prison-showcase/playwright.showcase.artifact.config.ts
```

The port comes from the canonical `LOCKSTATE_ARTIFACT_TEST_PORT` setting. Native
artifacts go to `assets/intermediate/small-prison-showcase/native-results/`.
Opening/running this recipe is the remaining acceptance task, including visual
inspection of the same completed prison in all three frames. The generator was
run here and its emitted config opened; it writes a config and starts no process
other than itself. The browser recipe was typechecked, but never executed here.

Existing specs, shared mapping/palette/schema/workflow are not modified. No
Blender render, browser or server was started by this agent during preparation.
