# Acknowledged HUD resize keys and world camera ownership

Date: 2026-10-02. Evidence tier: **VERIFIED** by actual built-client Chromium,
real control/adapter units, source inspection and production mutation.
Tracked finding: [Issue #1969](https://github.com/woogitsu/lockstate/issues/1969).

## Actual two-renderer failure

Diagnostic `5738e02afbbf67bcabf64e7a67beced0a72ffe27` and independent unit
checkpoint `92a7a2606d` are based on the exact restored native View delivery.
At 1920×1080/100%, create and pause a prison in each renderer, focus the native
inspector separator, and use its existing Home control to reach its minimum.
Exposed map pixels are settled before resizing.

One native ArrowLeft keydown increases aria-valuenow by the existing 10 px
step. Wait 300 ms for the requested layout change, capture map pixels and the
rail bounding box, then wait another 300 ms while keeping the key held without
repeat. The aria value and actual rail box remain equal, but map pixels change.
Both actual cases fail at this fixed-width map-motion assertion: world 4.8 s,
oblique 6.1 s. The retained actual oblique screenshot was opened and inspected.

The comparison starts after the width change and requires constant panel
geometry throughout it, separating continued camera movement from layout
repainting. Real keys reach the assembled production control and live scene;
no synthetic DOM events or forced HUD state replace that route.

## Existing acceptance and scoped correction

The full current closed #1159 body requires keyboard parity and states that no
gesture on a panel reaches the world. The existing assembled HUD keyboard
case checks panel sizes. The primitive browser keyboard case checks placed
runs/objects and canvas pointer presses; it does not measure camera motion.

The opened source shows preventDefault after an acknowledged controller
outcome in `src/ui/primitives/resize-separator.ts`. The window keyboard
listeners in both scenes consume that event through KeyboardInputAdapter
without filtering defaultPrevented; held camera action is polled each frame.

Published fix `f04c853d05` adds only stopPropagation at
`src/ui/primitives/resize-separator.ts:581`, beside the existing preventDefault.
The earlier none-outcome return remains. Unhandled keys retain their world
owner; bounds, steps, copy, layout, contexts, remaps, scene geometry, tools,
gameplay and saves are unchanged by this correction.

## Mutation and exact restoration

`tests/browser/hud-separator-held-arrow.spec.ts` runs both actual scenes through
the existing artifact runner and untracked local config at ordinary budgets.
Each corrected case additionally holds unhandled cross-axis ArrowDown on the
same separator: width stays constant and the real map moves. Release settles
it, and a fresh ArrowRight on an ordinary world button still pans.

| Production state | Actual result, world/oblique |
| --- | --- |
| Baseline before scoped correction | 2 red, 4.8/6.1 s |
| Corrected rebuilt client | 2 green, 7.0/8.9 s |
| New stopPropagation removed, rebuilt | 2 red, 4.6/6.1 s |
| Exact source restored and rebuilt | 2 green, 7.1/9.2 s; 19.6 s overall |

Both mutation failures are at the same map-motion assertion after the
acknowledged resize has settled and panel geometry stays constant.

Exact restored producer SHA-256:
`B92F683F6A99EBAC64FB4C636EA99C8BEE874CEC927EB9EF9040B09AC863F1E4`.
The restored source has zero production diff against the fix checkpoint.
App/tools TypeScript and production builds pass. No timeout increase or
network-abort retry ran. Every browser process was terminal before lease
release to the next agent.

The independent Node cases execute the real separator listener before the real
keyboard adapter, using a minimal DOM propagation bridge. The acknowledged
ArrowLeft case requires a real 300→310 keyboard resize, native prevention and
an inactive camera.left action. The unhandled ArrowDown case requires no
resize/prevention and an active camera.down action. Both preserve fresh world
KeyW start/end behavior. Corrected related units: 42 green. Removing the new
producer line makes the acknowledged case red while 41 others stay green;
exact restoration returns all 42 green.

## Nonduplicate check and limits

Fresh all-state searches covered separator camera arrow, keyboard resize pan,
separator ArrowLeft map/pan, resize preventDefault camera, acknowledged
separator key and resize held arrow map. Returned records were the broad
closed #1159/#200/#201/#10 and an unrelated #604 handover. The full current
#1159 body was read; #200 introduced arrow camera bindings. No matching
acknowledged separator camera finding was identified.

Acceptance covers local built Chromium at Full HD100%, both renderers, an
acknowledged inspector resize, and preserved unhandled/fresh world arrows.
Keys producing none at size limits, other separators/keys, 200%, touch/pointer
gestures, other engines, integrated CI and deployment were not established by
this finding. The correction does not broaden those existing boundaries.
