# Native Build Category navigation and world camera ownership

Date: 2026-10-02. Evidence tier: **VERIFIED** by actual built-client Chromium,
opened production source and production mutation.
Tracked finding: [Issue #1970](https://github.com/woogitsu/lockstate/issues/1970).

## Actual filter-camera conflict

Diagnostic `60b1b6c2582d6820302a11bba891d47d3f31796d` is based on the
integrated native View ownership delivery. At 1920×1080, create and pause a
prison, open Build and focus the native Category selector. Exposed paused map
pixels are first confirmed settled. Hold a real ArrowDown without repeat.

The browser's own default changes Everything to Walls and doors (`structure`)
and emits change. Wooden bed disappears, the selected Brick wall remains
visible and selected, and focus stays on Category. After 300 ms, the exposed
map clip changes in oblique at both 100% and 200% interface scale. The real
control is being used to filter building choices, yet it starts world pan.

Initial actual result: world100% green4.9 s; oblique100% red5.3 s and
oblique200% red4.7 s, both at the map-motion assertion. The first world sample
is recorded as measured; it does not establish that world's input consumer
is unaffected. The later producer mutation goes red in all three cases.

There is no renderer replacement, modal dialog, separator resize, synthetic
DOM key/change event or forced option assignment in this route. The retained
actual oblique screenshot was opened and inspected: Category shows Walls and
doors, with the selected wall visible and exposed map pixels outside the HUD.

## Scoped native event ownership

Opened source shows no Category keydown listener before this correction.
SELECT intentionally remains outside text-entry context. Both scene window
listeners pass keydown to their real KeyboardInputAdapter, so the default
option navigation does not itself exclude the world consumer.

Published fix `a89a66450866b724543be273b56d46a1e4731db8` adds only a
Category keydown listener in `src/ui/hud/build-panel.ts`. It stops propagation
for ArrowUp/Down/Left/Right, Home/End and PageUp/PageDown, matching the existing
native View navigation boundary. It does not prevent the browser default.
The global SELECT context policy, keyboard mappings, renderer lifecycle,
camera math, build intent, labels, layout, gameplay and saves are unchanged.

`tests/browser/build-category-native-camera.spec.ts` uses the existing
production-artifact runner and untracked local config at ordinary budgets.
Each case additionally returns to Everything with real ArrowUp, verifies the
bed returns and the selected wall remains, then holds a saved valid KeyJ
camera-up remap with focus still on Category. J matches no native option
label; the existing non-navigation world control still moves the map. Input
settings remain byte-identical, and no PlaceBuildOrder or PlaceRoomTemplate
command is sent. All three cases have this remap; they are not described as
all-default settings.

## Mutation and byte-exact restoration

| Production state | Actual result: world100%, oblique100%, oblique200% |
| --- | --- |
| Initial baseline | 1 green4.9 s; 2 red5.3/4.7 s |
| Corrected rebuilt client | 3 green5.1/6.5/5.9 s |
| New stopPropagation replaced with return, rebuilt | 3 red4.0/5.4/4.7 s |
| Exact producer restored and rebuilt | 3 green5.0/6.6/5.9 s;20.5 s overall |

The mutation preserves native default selection and catalogue filtering. All
three failures occur at the same map-motion assertion after the real filter
change. Exact restored producer SHA-256:
`7E7ABA1090D80441EBAD754720B1751FF27100CAFF2D73D6A0964F302E205375`.
The restored source has zero production diff against the fix checkpoint.

App/tools TypeScript and production build pass. Existing catalogue policy
units are69green; they are pure policy tests and are not claimed as native
event-ownership evidence. No timeout increase or network-abort retry ran.
Every browser process was terminal before explicit exclusive lease release.

## Fresh nonduplicate check and limits

Fresh all-state searches covered build category camera keyboard, category
arrow camera, Category keyboard pan, Build filter arrow, native Category,
Build category navigation camera and Category ArrowDown. Full current bodies
#201, #524, #1967, #1968 and #1969 were read. #524 covers rows' Tab cost;
#1967 covers View navigation during renderer preparation; #1968 covers a
world-origin lost release in View's non-modal popup; #1969 covers acknowledged
resize keys. This case starts a fresh Category navigation key in the same
scene without resizing it. No matching Category-camera report was found.

Acceptance covers local built Chromium at Full HD100% in both renderers and
200% in oblique, native up/down filtering, selected-row retention, one valid
non-navigation remap and no placement side effect. Other native navigation
keys, world200%, lost releases inside Category popups, other controls/engines,
integrated CI and deployment were not established by this finding.
