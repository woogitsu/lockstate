# Draft decision: the Build catalogue and playfield at 375×812 (#899)

**Status:** Option 1 accepted by the owner on 2026-09-24; implementation and browser evidence pending. No ADR number is reserved.
**Scope:** Initial Build-panel layout on a phone. This draft changes no UI, input, copy, supported-viewport policy, or accepted ADR.

## The decision still open

Should a player at 375×812 have a usable playfield **while browsing the Build catalogue, before arming a tool**? If yes, what should yield space: the catalogue on arrival, a user-controlled overlay, or another part of the HUD? If no, what minimum viewport and player-visible explanation should the product promise? The owner must choose that player-facing contract before an implementation is selected.

Issue [#899](https://github.com/woogitsu/lockstate/issues/899) measured 96/1173 (8.2%) reachable canvas samples at this size on its earlier baseline and found no free 64×64 square. Its unqualified title describes the **pre-arm** state on current `main`, but [PR #1383](https://github.com/woogitsu/lockstate/pull/1383) makes the **armed** state different. Its narrower #517 fix folds Build only if the panel covers the canvas centre when a Build placement or removal tool is armed, retains the tool, and focuses the visible disclosure. It neither changes catalogue arrival nor decides the supported viewport.

## Current comparison

Measured 2026-09-24 on `origin/main` `430906af605e19851be83ba52f981a66988fc74f` and PR #1383 head `f7998b2813bc8072816b8f4a51b647e672d37b89`. One temporary Playwright spec, copied without change between isolated checkouts, started a new prison at 375×812, opened Build, sampled `document.elementFromPoint` on a 16 px screen grid, then selected and armed `wall-brick` and repeated the scan. A 64×64 candidate was scanned every 8 px and accepted only when its 5×5 sample points hit the canvas. Both one-test runs passed; the temporary spec was removed afterward.

| Version and moment | Canvas-hit samples | Share of 1173 | Full sampled 64×64 square | Build panel |
| --- | ---: | ---: | --- | --- |
| `main`, Build opened | 85 | 7.25% | none | open, x=8, y=301, 359×429 px |
| `main`, wall armed | 85 | 7.25% | none | still open |
| PR #1383, Build opened | 85 | 7.25% | none | open, x=8, y=301, 359×429 px |
| PR #1383, wall armed | 407 | 34.70% | x=8, y=448 | folded, x=8, y=683, 359×47 px |

Thus PR #1383 adds 322/1173 samples, or 27.45 percentage points, **after arming**; it does not alter the arrival measurement. The 7.25% current figure supersedes the issue's historical 8.2% for these exact trees and method. The sample share is not exact pixel area; the square test samples a candidate rather than proving every pixel inside it is unobstructed. This is a mouse hit-test of canvas access, not itself a touch-gesture test. PR #1383 separately includes a real touch-placement browser test for its armed flow.

Reproduction command in each checkout, with a unique `LOCKSTATE_BROWSER_TEST_PORT`, was `node node_modules/@playwright/test/cli.js test -c tests/browser/playwright.config.ts tests/browser/measure-899-temp.spec.ts --workers=1 --reporter=line`. The temporary spec used `openApp`, `tab(page, 'build')`, and `armBuildable(page, 'wall-brick')` from `playtest-harness.ts`. Screenshots retained locally as `C:/Users/matma/Documents/Rozwój gier/{main,pr1383}-{before,armed}.png`; they are evidence from the measured builds, not proposed artwork or committed product assets.

## Existing constraints

- [ADR 0022](../0022-room-zoning-surface.md) chose a separate Rooms/Zones surface and a rectangle gesture on the world. Its later phone measurement says the Rooms panel folds **after arming** so the world becomes available. It does not decide Build's initial catalogue footprint. Its five-tab and panel-fold budget evidence prevents assuming another permanent tab or always-visible block fits.
- `AGENTS.md` architectural boundary 10 requires remappable, QWERTY/AZERTY and touch/pointer interaction. A mouse-only workaround cannot discharge the phone case. #899 cites ADR 0010 as if it were an input decision; the current [ADR 0010](../0010-telemetry-and-diagnostics-privacy.md) is about telemetry/privacy, so that citation should not carry this decision.
- The existing Build catalogue is needed to choose a tool before the arm control can free the map. A design must preserve a clear way to choose, arm, switch, stop, and re-open the catalogue without stranding keyboard focus or touch users.

## Options for the owner

1. **Support 375×812 with a map-first mobile Build drawer.** On entering Build at a measured small viewport, show the map and a compact disclosure; open the catalogue as a temporary overlay for choosing an item, then return to the map when the tool is armed. This resolves pre-arm playfield access, but hides the list and price information on arrival and adds an explicit open/close step. It must preserve discoverability of the Build tab and selected tool.
2. **Support 375×812 with a player-controlled overlay.** Keep the catalogue visible on arrival, but provide an obvious, always-reachable collapse/reopen affordance before arming; persist its state only if separately decided. This preserves first-glance catalogue information and permits map access, but does not make the initial screen itself playable until the player understands the control. It may not satisfy #899's strongest reading without an in-product cue.
3. **Set a minimum playable viewport larger than 375×812.** Show a clear, owner-approved explanation and supported-size route rather than a tiny apparent playfield. This avoids a new mobile layout but excludes this phone size; a minimum must be established by measurement across orientations, browser chrome, and zoom, not guessed from width alone. It is a product support decision, not a silent CSS cutoff.

Tap-to-place or a zoomed-out interaction would be a separate input design; neither creates space for browsing the catalogue on its own.

## Owner ruling, 2026-09-24

The owner was offered these exact Polish option labels and selected the first:

1. **„Mapa najpierw: mobilny wysuwany katalog Build (zalecane)”** — selected.
2. **„Katalog najpierw: ręczne zwijanie i otwieranie”** — declined.
3. **„Określ minimalny wspierany rozmiar ekranu”** — declined.

This was a selection from options written by the agent, not a free-form design specification typed by the owner. That weaker provenance matters: the ruling chooses map-first arrival at 375×812 and a mobile catalogue that can be opened to select/arm a tool; it does not authorize an invented new player-visible sentence, a general minimum-viewport rule, or a changed desktop layout. The implementation must verify those details in the real browser and return with evidence. The earlier research table and losing options remain above so the decision can be audited.

## Browser acceptance criteria for the chosen option

1. Test a fresh prison at 375×812 **before and after** opening Build, selecting an item, arming placement and removal, placing by real touch, reopening the catalogue, switching tools, and stopping the tool. Assert the actual hit target with `elementFromPoint`, not only CSS visibility or `data-collapsed`.
2. If 375×812 is supported, require a demonstrable unobstructed 64×64 interaction square at the stage the chosen contract promises, and measure the 16 px-grid canvas share at each stage against this baseline. Probe the square interior or perform the gesture rather than relying solely on the sampled 5×5 square test.
3. Verify focus, disclosure state, keyboard activation, screen-reader name/state, and that the selected tool remains correct through folding and reopening. Check touch and mouse/pointer separately.
4. Repeat at 375×812, effective narrow viewports under browser zoom, 720×450, 900×600, and 1024×600; ensure desktop Build does not unexpectedly fold and other HUD panels or save controls remain reachable. Run existing #517 and Rooms/Zones phone tests.
5. If a minimum viewport is chosen, verify that the explanation is readable, translated in EN/PL, and shown before an unusable interaction; test the first supported size on both sides of the boundary.

Keep #899 open until the initial-state contract and its browser evidence are settled. The measured post-arm improvement from PR #1383 stands independently of this ruling.
