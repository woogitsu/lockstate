# Native View popup and a world-origin camera key release

Date: 2026-10-02. Evidence tier: **VERIFIED** by actual Chromium over the built
client, passive native event capture, map pixels/projected plan, independent
control/adapter units and production mutation. Tracked finding:
[Issue #1968](https://github.com/woogitsu/lockstate/issues/1968).

## Actual boundary

Diagnostic checkpoints `125055977c9c64a741189f356f7ddc368875ed07` and
`9d2aa65df1` include the native View navigation correction. At 1920×1080 and
100% interface scale, create and pause a prison in Angled view, arm Four-cell
row at the remembered mouse hover, and focus an ordinary Build button.

The paused map is settled. A real held KeyE changes exposed map pixels over
300 ms. While keeping it held, focus View, open its actual native option popup
with Space, physically release KeyE inside it, and dismiss with Escape. Leave
Angled selected, so renderer replacement cannot reset the adapter and mask the
boundary. The same map continues rotating after no key is physically held.
The actual baseline fails its map stability assertion: 1 red, 8.1 s.

Passive window capture records KeyE keydown on BUTTON and Escape keyup on
SELECT, both with modal=false. There is no page KeyE keyup. The opened baseline
screenshot shows the real two-option popup and an armed 112-field preview.

## Scoped correction

Published fix `b9d6126fbd` adds View's explicit focus callback at
`src/ui/hud/renderer-selection-control.ts:27`. HUD forwards it to main, whose
current-scene callback calls additive `releaseKeyboardInput()` in both world
scenes. Each method clears only the existing keyboard adapter. It leaves
pointer gestures, remembered hover, armed placement and camera pose intact.

The native navigation propagation guard and defaults remain available. There
is no change to global SELECT input context policy, bindings, simulation,
saves, strings or layout. The same callback handles the existing focus return
after asynchronous selection, without changing its navigation-away rules.

## Actual cases, mutation and exact restoration

`tests/browser/live-view-native-popup-held-key.spec.ts` uses the existing
artifact runner and network-changed fixture under their ordinary budgets.
It exercises default KeyE at Full HD100% and a saved valid unused KeyJ rotation
remap at Full HD200%. Both genuine native popups swallow the respective keyup.
No synthetic DOM key/change or forced option assignment replaces the native
behavior.

In corrected runs, the same map settles after dismissal. The 112 projected
fields, quote and actual worker preflight target remain equal; a fresh world
key still rotates, and zero PlaceRoomTemplate commands occur. Native popup
screenshots were opened and inspected, including the 200% case.

| Production state | Actual result |
| --- | --- |
| Native navigation fix baseline, default KeyE100% | 1 red, 8.1 s: map keeps rotating after popup dismissal |
| Focus ownership fix, original case | 1 green, 9.2 s |
| Corrected scale-specific sampling, default100% and remapped200% | 2 green, 7.9/7.4 s |
| Focus callback invocation replaced by no-op; rebuilt | 2 red, 8.7/7.6 s |
| Exact source restored and rebuilt, final new cases | 2 green, 9.2/7.9 s |
| Final native View group including five existing cases | 7/7 green |

The default100% mutation fails at map motion. The remapped200% mutation fails
at equality of the retained projected footprint: its sampled map clip happened
to remain stationary, so this case establishes continued preview/pose movement
rather than a map-pixel failure. The separate projected-plan assertion prevents
that stationary clip from falsely accepting the mutation.

An earlier 200% setup used the 100% rectangle and failed its world-motion guard
because that rectangle was covered by scaled HUD. It was corrected to use
exposed world sampling before the mutation/restoration evidence above. No
production change was based on that setup failure.

Exact restored producer SHA-256:
`3C2D851E95332F1B429FFFAFA71DC9FEE3CF075294B2396E8FFD6DB5D6FFED75`.
The restored producer has zero production diff against the fix checkpoint.
App/tools TypeScript and production builds pass. No network-abort retry ran.

The five existing final cases verify native navigation during genuine registry
preparation (7.2 s), keyboard roundtrip focus (10.8 s), actual503 retry (10.5 s),
intentional Tab during loading (10.5 s) and Tab during refusal (8.9 s). They
establish preserved native option navigation, retry and focus behavior.

Independent control/adapter units use real KeyboardInputAdapter with default
and remapped held codes. They omit keyup deliberately, focus the real View
control, require the held action to end, then require a fresh action to start
and end normally. The production no-op makes both new cases red while fourteen
existing cases stay green; exact restoration returns all sixteen green.

## Nonduplicate check and limits

Fresh all-state searches covered View popup held camera, select keyup camera,
native View swallowed release and View held KeyE. Full current Issue bodies
#1966/#1967/#1479/#202 were read. #1966 owns a modal plan popup; #1967 starts a
fresh navigation arrow during renderer preparation and explicitly excludes
world-origin lost release; #1479 switches semantic contexts; #202 loses window
focus. This case stays in the same non-modal scene, does not blur the page,
and loses the release inside View itself.

Evidence covers local built Chromium at Full HD100%/200%, one actual custom
remap and armed preview preservation. Other browser engines, other native
select controls, full integrated CI, deployment, save/session continuity and
room completion were not established by this finding.
