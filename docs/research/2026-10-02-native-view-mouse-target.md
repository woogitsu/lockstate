# Native View mouse acquisition and HUD corner opt-ins

Date:2026-10-02. Evidence tier: **VERIFIED** by the built Cloudflare-served
application in Chromium, actual mouse/keyboard input, passive DOM traces,
real worker submissions, opened screenshots and a production CSS mutation.
Tracked as [Issue #1973](https://github.com/woogitsu/lockstate/issues/1973).

## Question and fresh nonduplicate boundary

Does clicking the existing View SELECT acquire its native interaction, or reach
an armed map underneath it? The earlier Bed/Yard endpoint calibration observed
CANVAS within View's displayed bounds; that hit-test alone did not establish
mouse selection or a player-facing construction consequence.

Fresh all-state remote searches covered native View mouse target, View mouse
click/canvas, renderer pointer-events, renderer mouse inaccessible and SELECT
pointer-events. Full current1951/1967/1968/1054/1971 bodies were read.1951
introduced the live renderer selection;1967/1968 accept keyboard ownership and
lost releases;1054 concerns inert corner chrome;1971 concerns canvas-origin
drags and explicitly leaves the View mouse observation pending. No exact report
of this acquisition defect was found.

## Actual unchanged-production baseline

[Prepared diagnostic](https://github.com/woogitsu/lockstate/commit/89c8a1dc19a51419411e29a5b48883e0cafbd7d8)
starts each case from a new paused prison at1920×1080, opens Build and arms
removal. A physical mouse click at the actual visible View centre targets
CANVAS, leaves View unfocused and unchanged, and sends an unintended RemoveWall
to the real worker. Native Home/End+Enter after that click cannot supply the
missing acquisition. No focus(), force-click, selectOption(), synthetic DOM
change or renderer injection drives the test.

| Initial renderer | Scale | View centre | Actual unintended command | Baseline |
|---|---|---|---|---|
| Top-down |100%|(251.5,854)|RemoveWall(4,20,west)|red23.5s|
| Top-down |200%|(423.5,674)|RemoveWall(7,18,north)|red23.5s|
| Angled |100%|(251.5,802)|RemoveWall(6,13,north)|red25.0s|
| Angled |200%|(423.5,599.7734375)|RemoveWall(10,11,north)|red24.3s|

The opened200% top-down screenshot shows no native list and the actual removal
refusal for the empty tile. This proves unintended submission, not successful
removal of an existing wall or financial loss.

## Source sweep and scoped correction

The complete current corner producer in `src/ui/hud/hud.ts` was opened: View is
a direct SELECT child of `.hud__corner`. The HUD root sets pointer-events:none;
the existing actual-control opt-in list omitted this SELECT.

| Current corner interaction | Existing pointer acquisition |
|---|---|
| Zoom out/in | explicit `.hud-zoom__out` / `.hud-zoom__in` opt-ins |
| Minimap collapse/surface | explicit `.ui-panel__toggle` / `.hud-minimap__surface` opt-ins |
| Four optional pose buttons | inherited auto from `.hud-camera-pose` |
| Alerts fold/list | explicit `.ui-section__header` / `.hud-alerts__list` opt-ins |
| Dynamic alert place/dismiss buttons | inherited auto from the scrollable alerts list, also after reparenting |
| View SELECT | inherited none; omitted from opt-ins |

This is a source sweep, not runtime acceptance of every dynamic alert variant.
Minimap canvas/viewport are decorative children of its actual button and
intentionally pointer-transparent. Title/legend chrome stays transparent.

[Published correction](https://github.com/woogitsu/lockstate/commit/dfbe9f31fd8fdc12d66e23c47031d77666f18989)
adds only `.hud__corner > select.hud-build__category` to the existing
pointer-events:auto/touch-action:auto list in `src/ui/hud/hud.css`. It changes
no layout rule, label, controller, focus policy, scene, global SELECT input
policy, gameplay, save or art. The first corrected native group was4/4green,
5.6/5.7/5.2/5.1s, and all four opened native-list screenshots were inspected.

## Native popup automation experiment, recorded separately

A second-mouse-click experiment used those screenshot-calibrated native View
rows. It failed4cases13.3/13.4/14.3/14.2s: first pointerdown reached SELECT,
but the CDP option-row click reached the underlying canvas. This is not counted
as another product defect or as full mouse option-selection acceptance.

The targeted known-working Category control reproduced the same method boundary.
Its opened screenshot pins Walls and doors at(1785.078125,295), with a measured
1920×1080 viewport and DPR1. First pointerdown reaches SELECT; the second
popup-row CDP click reaches the underlying wall-brick BUTTON. Category remains
Everything with no native input/change. The diagnostic returned in3.2s; that
successful observation is not a passed filter-selection acceptance. An earlier
identical absolute View-coordinate comparison clicked outside Category's list
and is excluded from this disambiguation.

[Playwright's maintainer explanation](https://github.com/microsoft/playwright/issues/15626#issuecomment-1183617962)
states that individual native popup-option clicks are unsupported. Combined
with the two current measurements, this supports treating the experiment as
an automation boundary. The accepted regression physically clicks View and
uses genuine native keyboard option choice; it does not substitute a DOM
selection helper. Full physical mouse option-row selection remains unproved.

## Consumer mutation and exact restoration

The final regression `tests/browser/live-view-native-mouse-target.spec.ts`
also verifies that an exposed180×180 map clip actually changes renderer pixels.
Fixed-source baseline4/4green25.9s:5.8/5.7/5.7/5.6s. Removing only the added
production CSS selector and rebuilding gives4/4expected red24.2/23.8/25.6/24.9s:
CANVAS events and the four unintended commands above return. SELECT hit, native
change/focus, zero-command and actual-pixel assertions remain intact.

CSS was restored from the immutable published correction. Its tracked blob is
`blob=8d400f3a31d13411455be96f9b79efc4ff4331fb`, production diff zero; restored
working-byte SHA256 is
`SHA256=7ED0C23632871D06552F35C555359B78B6071EDA36831CA7BC0AD0A923B6D847`.
The rebuilt emitted CSS `index-BtHvjcB7.css` matches the earlier corrected
build. App/tools TypeScript and production build pass. Final exact-restored
4/4green26.1s:6.0/6.2/5.8/5.6s. Each trace records SELECT mouse acquisition,
focus/input/change, actual changed world pixels and no map construction/removal
command. Blank minimap title still resolves to CANVAS. All own browser processes
were terminal, port5402 had zero listeners, and the exclusive lease was explicitly
released before offline documentation. Test60s/expect10s budgets remain unchanged;
no network-abort retry ran. The existing untracked local artifact config selected
the group; no new tracked Playwright configuration was added.

Documentation index, claims and published-commit citation gates:3files/28tests
green25.68s, run serially with the original test budgets. These documentation
checks do not establish integrated application CI.

## Weakest claim and remaining boundary

The weakest claim is classifying the second-click result as automation routing
rather than player behavior. The same observed method on the existing Category
and the primary maintainer explanation support it; physical OS mouse selection
of the actual native rows would settle that boundary directly. It has not been
obtained here, so full mouse option selection is not accepted.

Accepted locally: built Chromium, both renderer directions, Full HD100%/200%,
removal-armed mouse acquisition, native keyboard choice/focus, changed renderer
pixels, zero unintended worker commands and blank-chrome passthrough. Other
engines/viewports, loaded/completed wall removal, full integration CI and
deployment remain outside this evidence.
