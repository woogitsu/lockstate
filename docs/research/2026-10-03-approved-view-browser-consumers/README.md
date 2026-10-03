# Explicit public prerequisites after the approved View disclosure

## Observed scope

**VERIFIED, source comparison:** base `01d6aa666373fec181b3f474210aea4fa8de51e3`
contains the approved default-closed View/Widok panel. Existing native consumers
that act on its SELECT or camera buttons must open that panel publicly first.
`tests/browser/public-camera-controls.ts` is an explicit caller prerequisite,
not a fixture hook. It clicks View/Widok only when the real panel is hidden,
then checks visible state and `aria-expanded=true`. It chooses no renderer,
camera pose or game state.

The first pushed checkpoint is `44475e77bc00c4584199782a45e4e0beb1a0b438`.
This follow-up covers the actual remaining routes, including canonical poses
after Load, live native SELECT consumers, scene picking and demand-profile
camera steps. Keyboard-only focus still uses physical Tab and Enter to open
View. Held key/pointer routes open before the measured hold or gesture.
The production and integrated-square screenshot baselines are captured after
opening, so opening the panel cannot itself satisfy a camera-change check.
The north-door failure cleanup gains no new UI action. A value-only history
observer that never operates hidden controls is unchanged.

## Retained controls and measured checks

**VERIFIED, read-only source proof:** [guard-preservation.json](./guard-preservation.json)
records 49 existing browser consumers, with 49 original bodies preserved after
removing only the enumerated public prerequisites. The precise comparison also
accounts for the same native SELECT moving from `.hud__corner` to
`.hud-camera-panel`, and braces needed for the q1-only bookshelf prerequisite.
Original pixel, cost, owner, whole Save/Load, camera-step, pointer/key and budget
assertions remain. This is a source proof, not native acceptance.

The executed command at the original published checkpoint was:

```powershell
node docs/research/2026-10-03-approved-view-browser-consumers/guard-preservation.mjs
pnpm --config.verify-deps-before-run=false typecheck
```

The exact historical executable is retained as inert
[guard-preservation.mjs.txt](./guard-preservation.mjs.txt). It is evidence of the
49-consumer checkpoint, not an ongoing typed repository tool or a claim that
later independent consumer edits still match that historical base.

**VERIFIED, executed:** app and tools typecheck exit 0; raw output is retained in
[typecheck.txt](./typecheck.txt). No browser, build, server or native collection
was run in this migration. The existing real-build guard remains intact.
No production code was changed or mutated by this consumer-only checkpoint;
it makes no producer-negative or native-pass claim.

## Separately published Laundry helper

The current isolated base does not contain `laundry-linen-rack/native-evidence.ts`.
[laundry-linen-opener.patch](./laundry-linen-opener.patch) was generated from the
actual published file in `088a436cf5fe150c2ca5e0d4606770229bef87ba` and adds only
the helper import plus its explicit call in `recordLaundryCanonical`, after
the actual loaded-owner assertion. All original 7 right / 3 lower / 2 raise
steps and whole-state guards remain. This patch was not applied or typechecked
against an absent file here; the integrator must check/apply it after the real
Laundry import and run the integrated gates.

**Weakest claim / next gate:** source preservation and strict types do not
establish that every real page opens the panel at the intended moment. The root
owns the sole browser/build lease and must run the real integrated native
consumers. No timeout, assertion, floor, panel default or visible copy changed.

## Public Room-plans coordinates before the existing reachability sweep

**VERIFIED, hosted raw log read:** source1 job `111250456875`, run
`37138459762`, head `30568432f5f4a681849002962a87bfa8134ddc4a` reported the five
original `every control can actually be pressed` failures at 1280×720,
1440×900, 1024×768, 900×600 and 375×812. The exact first five failure blocks
are retained in [coordinates-hosted-original.json](./coordinates-hosted-original.json).
The full raw source1 log remains in the separately published triage commit
[`796be15055302b3cde5ec720bda0afd62a55ef08`](https://github.com/woogitsu/lockstate/commit/796be15055302b3cde5ec720bda0afd62a55ef08).
Its SHA256 is `da630cc1efa23805f86abd9eeee9838a69956c7fd5e8b290258b0680b1a7a2fe`.
The reporter names X/Y hit by the modal and Place outside the viewport. Trace
and error-context files were named by the raw log; neither was inspected here.

**VERIFIED, production and consumer source read:** the actual
`room-template-preview.ts` appends X/Y/Place inside a native
`details.hud-template__coordinates` without an `open` attribute. The consumer
previously measured its descendants without publicly opening that disclosure;
a nonzero descendant GBCR is insufficient to establish reachability while
details is closed. This is a missing visited state, not proof that the product
needs a changed layout.

`everyControlAt` now checks the actual disclosure starts closed for each plan,
checks its existing localized summary, publicly clicks it and checks open,
then runs the complete original modal inventory and hit checks. It publicly
closes and checks closed before the next choice. The patch adds 11 lines and
removes zero original lines; no exemption, counting guard, hit sample, floor,
viewport, timeout or production source changes. App and tools types exit 0,
with raw [coordinates-typecheck.txt](./coordinates-typecheck.txt).

**UNKNOWN, native pending:** these five original hosted failures remain the
retained RED evidence. This source-only correction was not run in a browser,
and no GREEN native outcome is asserted. The current camera disclosure itself
also needs an explicit visited state if the integrated full-inventory sweep
reports its default-closed controls; this checkpoint makes no measurement or
geometry claim about that additional state.

### Follow-up: explicit desktop View inventory

**VERIFIED, source read and strict types:** the subsequent app-shell patch now
visits View explicitly at the four existing desktop sweep widths. It asserts
default-closed, publicly opens, remembers the actual SELECT value, selects
Angled to expose its real pose buttons, records the complete panel inventory
and applies the original full measurement and hit-test checks to that panel.
It then restores the original renderer and publicly closes View before
continuing the ordinary shell states. No original body line or floor is
removed. Like the existing Layout-menu visit, the open-state covering claim is
about the floating panel's own controls; the unchanged ordinary states still
require the whole shell uncovered. [view-inventory-typecheck.txt](./view-inventory-typecheck.txt)
records app/tools exit 0. There was no browser run.

**UNKNOWN, remaining phone accounting:** the same accepted production CSS
has `.hud-camera-panel { display: none; }` below 720px and hides its trigger's
corner at that width. The 375px sweep cannot operate that disclosure publicly.
This patch preserves the original exact mobile exemptions and final inventory
assertions, so it does not manufacture phone reachability or a native pass.
Any new never-laid-out phone entries must be examined against the real
integrated DOM before deciding an observer update or a product-policy change.
