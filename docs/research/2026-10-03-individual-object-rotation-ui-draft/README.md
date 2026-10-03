# REVIEW DRAFT: individual object rotation interaction

## Decision boundary

**Do not import this draft as production acceptance.** Branch
`codex/individual-object-rotation-ui-draft-20261003` is separate from approved
command checkpoint `f83e2150d3a7c0f6023192312c6e52793fdfd771`.
The coordinator explicitly corrected an earlier interpretation: permission for
orientation fields does not approve new copy or interaction. KeyR remains
`camera.tilt.up`; no action/binding member changes here.

The exact proposed new localization key is `hud.build.rotate-object`:

| Locale | Proposed new copy |
| --- | --- |
| EN | Rotate object |
| PL | Obróć obiekt |

The button also displays the current numeric 0°/90°/180°/270° using existing
number formatting. All other authored copy stays unchanged. The player-string
inventory is generated from this **draft** locale, 597 entries versus 596;
its new entry is not evidence of owner approval.

## Concrete implementation under review

A visible native action button joins the **existing** Build action row while
individual furniture is selected, and is hidden for walls/removal. Existing
Place on map / Stop placing, Remove and Buy controls remain. No new layout row
or production CSS changes. Pointer activation rotates clockwise; ordinary
native Enter/Space activates the same button. This is a four-button proposal,
not a claim that a four-button row fits.

The panel holds current facing, resets it only for a different selected
buildable, formats the rotated selected footprint and map target, and sends
facing through both numeric and canvas routes. The shared object tool swaps
width/height for odd turns, retains 0 omission for legacy placements and
retains the removal 1×1/no-facing command. The actual composition-root
producer forwards optional facing to the approved command.

Both real scenes expose a public refresh operation that cancels an old held
press and repaints the changed footprint without a pointer move. World keeps
the preview anchor; Oblique uses its retained physical screen cursor and
actual projection. The old primary release submits nothing; a fresh press
still places the new facing. This is production scene/input source proof,
not browser acceptance.

## Obtained evidence

- Corrected original UI baseline: 3 RED. A preceding observer attempt used
  TypeScript stripping on a top-level return and is retained separately.
- Actual ObjectTool tests: orientations 1/2/3/0, matching preview and intent,
  same-selection retention, different-selection reset, removal control.
- Actual `main.ts` PlaceObject case is loaded/stripped and executed; nondefault
  facing and the omitted old control are asserted on its actual output.
- Both scene tests use production constructors/create/input listeners and real
  Phaser Camera/Pointer and primary-release dispatcher. Host/art plumbing is
  doubled, and no native canvas result is claimed.
- Omit the actual tool footprint rotation: **2 RED / 1 GREEN**.
- Omit the actual main command facing member: **1 RED / 2 GREEN**.
- Omit the actual stale-release cancellation in both refresh producers:
  **2 RED**. All four files were restored byte-exact; hashes are in receipt.
- Restored focused set: **161 GREEN / 10 files**, including existing object
  tool/Build panel, real mouse-button release, stationary room-template
  neighbours, approved command/V8 test, command reachability and unchanged
  inventory guards.
- Real `pnpm --config.verify-deps-before-run=false typecheck`: root src/tests
  and tools configs exit 0. New native prep directory is included explicitly.
- Actual isolated production build exit 0, Cloudflare output verifier GREEN.
  Compiled subject and source hashes are in `evidence/receipt.json`.
- Native collection only: **2 cases / 1 file**, EN and PL public geometry
  recipes; **no browser/server was started**. Workers 1, retries 0, test 60s,
  expect 10s, inherited artifact server uses `reuseExistingServer:false`.

## Public native recipe and unchanged geometry rules

After the coordinator grants the sole lease, build this exact draft, set
`LOCKSTATE_OBJECT_ROTATION_DRAFT_NATIVE=1` and run the adjacent Playwright config.
This is an opt-in review probe outside the default browser suite, not a gate
skip or a workflow change. It uses the existing public language preference,
New prison/Pause/Build/desk selection and scale cycle. No synthetic events,
private scene reads, command feeds or injected worker replies.

At Full HD 100 and 200%, it saves the actual screenshot and exact action
geometry **before** assertions. Four buttons must retain actual minimum height,
the original row-height equality, 44px minimum width, complete label and panel
containment, and real centre hit testing. It actually clicks Rotate, then Enter,
Space, then clicks to return to 0. The original twenty room cards are checked
in one DOM read: all names equal accessible names, all labels fit, all cards
are center-hittable and entirely between y0 and y1080. No count, floor or time
budget is lowered. Any RED original geometry must stay RED and be reported;
this recipe has no measured outcome yet.

## Incomplete gameplay requirement and next work

The current individual-object target reports an anchor and the renderer paints
a fixed-color footprint. It **does not have a worker collision/preflight
verdict**. The approved command tests prove authoritative complete-footprint
collisions/ownership and exact material cost, but that does not turn this ghost
into a pre-press collision verdict. This draft does not introduce a guessed
main-thread verdict or represent fixed teal as legality.

Before calling #2019 implemented: obtain actual public geometry receipts and
owner choice for the new interaction/copy; implement a real preview verdict
producer through the existing worker boundary; execute actual oriented public
purchase/placement plus whole paused Save/Load and native camera inspection.
The approved command checkpoint is independently integrable now. No source
camera-layout proposal, workflow or save-schema change is part of this draft.

Weakest claim: the visible four-button row is **unmeasured**, and the preview
has no collision verdict. A genuine screenshot/DOM run may reject that row;
until those facts are resolved, this is a tested source draft, not a clickable
recommendation that the owner should approve blindly.
