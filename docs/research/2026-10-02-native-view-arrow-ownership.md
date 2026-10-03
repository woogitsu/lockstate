# Native View option navigation and the old renderer's camera

Date: 2026-10-02. Evidence tier: **VERIFIED** by actual Chromium over the built
client, genuine registry preparation, map pixels, actual producer/consumer
units, and production mutation. Tracked finding:
[Issue #1967](https://github.com/woogitsu/lockstate/issues/1967).

## Observed native event boundary

Diagnostic checkpoint `dd64f981a2b2750dd58c96931c6c6d319d35aebb` and independent
unit checkpoint `a1a0933c92` are based on the restored native room-plan picker
delivery. At 1920×1080 and 100% interface scale, create and pause a prison in
the default world view, then focus the native View select.

The browser first verifies that a 240×240 exposed map clip is settled. A fresh
ArrowDown held on View chooses Angled view through the native default action.
The genuine oblique registry request is held, leaving the existing world
scene playable during preparation while the selector is disabled and busy.
Over 300 ms, the old map pixels move. No world camera key was intended.

This follows the existing source boundary: SELECT is outside text-entry
context, so its native keydown reaches the world keyboard adapter before the
default option change disables the selector. The renderer controller retains
the old scene while catalogue preparation is pending. The same native
selection key therefore starts a held camera pan.

## Scoped correction

Fix checkpoint `39e1befbf4` adds a native navigation listener at
`src/ui/hud/renderer-selection-control.ts:24`. The selector stops propagation
of option navigation keys and preserves their default action. It continues
to await the existing asynchronous replacement and retain the existing focus
handoff, retry and intentional navigation behavior.

Input contexts, bindings, scene lifecycle, camera policy, worker, saves,
player-facing strings and layout remain as before this correction.

## Actual browser and production mutation

`tests/browser/live-view-held-native-arrow.spec.ts` uses the existing artifact
runner, network-changed fixture and an untracked local config, under normal
time budgets. The registry response is delayed and then continued; no
synthetic registry payload, DOM key event or option value assignment replaces
the real browser behavior.

| Production state | Actual result |
| --- | --- |
| Baseline rebuilt at unit checkpoint | 1 red, 3.6 s: old map moves during genuine preparation |
| Fixed rebuilt client | 1 green, 6.6 s |
| New stopPropagation changed to return, preserving native defaults; rebuilt | 1 red, 3.6 s: same old-map motion |
| Exact source restored and rebuilt, with replacement-map settling guard | New case green, 7.7 s |
| Final restored native View regression group | 5/5 green, 51.0 s overall |

The four existing View cases in that final group verify keyboard roundtrip
focus (10.5 s), registry failure and immediate retry (10.4 s), intentional
Tab during loading (10.6 s), and Tab during delayed refusal (8.6 s).

Exact restored SHA-256 of the renderer selection control:
`CE9D0E27F30F14351EA74D8EF3ACD308269571EF361544A5C802B0CFAA62D107`.
The restored file has zero production diff against the fix checkpoint. No
network-abort retry ran.

## Independent input boundary cases

The expanded renderer selection control unit tests execute its actual
listeners, the real KeyboardInputAdapter and real LiveRendererSelection with
held preparation. Their minimal Node DOM propagation bridge respects the
actual listener's stopPropagation. Their assertions independently require
the current scene to stay live, native defaults to remain available, and
ArrowDown to leave that scene's camera inactive during preparation.

Both the default and valid unused KeyJ remap cases fail before the correction
and under its production mutation. Exact restoration returns all 14 related
UI/controller cases green. After activation, fresh world KeyW or remapped
KeyJ still starts and ends the camera action. Those remap results are unit
evidence; the actual browser case uses the default bindings.

The browser separately settles the replaced angled map before its fresh
world-key comparison, so initial replacement painting cannot masquerade as
camera movement. The switch completes, native focus returns, a fresh world
ArrowRight moves the map, and zero room-template placement commands occur.
App/tools TypeScript and production builds pass.

## Nonduplicate check and remaining boundary

Fresh all-state searches covered View ArrowDown camera, renderer preparation
pan and native option navigation camera. Related Issue bodies were read:
#1956 concerns focus after async replacement, #1951 introduced live view
selection, #1943 concerns a world-held arrow moved onto a Build radio, #1918
concerns modal camera context, and #1966 concerns a room-plan popup swallowing
the release of a world-origin KeyE. This case starts a fresh View navigation
key and moves the old scene during preparation.

Evidence covers Chromium at Full HD100% and local built artifacts. Other
native selects, a world-origin key released inside a non-modal View popup,
200% scale, other browser engines, full integrated CI and deployed completion
were not established. The records for session continuity and room completion
remain their own evidence.
