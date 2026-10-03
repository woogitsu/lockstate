# Native room-plan rotation popup and a released world camera key

Date: 2026-10-02. Evidence tier: **VERIFIED** through an actual built artifact,
native Chromium keyboard controls, opened screenshot, worker requests, and
production mutation. Tracked finding: [Issue #1966](https://github.com/woogitsu/lockstate/issues/1966).

## Observed boundary

The isolated baseline uses `d4aa0672132be2acb1da1f23600354dc8be42f07` plus the
diagnostic checkpoint `bd5f095a10fea99b89333010baf1a7b747fdffd4`. At 1920×1080,
100% UI scale and angled view, a genuine world KeyE hold rotates the map. Enter
opens Room plans while that key remains held. The modal suppresses camera
movement. Native keyboard card selection chooses Four-cell row; Space on
Room plan rotation (clockwise) opens the real four-option popup, visually
confirmed in the retained screenshot.

Releasing KeyE inside that popup does not deliver keyup to the page. First
Escape dismisses the popup and leaves the catalogue open and select focused.
Window capture sees exactly these relevant events before the second Escape:

```json
[
  { "type": "keydown", "code": "KeyE", "target": "BUTTON", "modal": false },
  { "type": "keyup", "code": "Escape", "target": "SELECT", "modal": true }
]
```

Second Escape closes the catalogue and restores its opener. A 240×240 exposed
map screenshot changes over the next 300 ms although the physical KeyE was
released. This is the actual failing assertion; the popup's first Escape and
the catalogue's second Escape both already behave correctly.

## Scoped correction

Fix checkpoint `52dd1fdaf7` changes `src/input/keyboard.ts:60`. On an activity
poll with modal context, held codes whose bindings are excluded by that modal
are removed. A popup-consumed physical release can therefore never resume the
old world action after closure. This uses registered bindings and preserves
remapping, active modal bindings, and fresh world camera keys.

The current Room plans Escape handler is unchanged. No scene, camera framing,
art, worker, save field, layout rule or player-facing string is changed.
Non-modal input behavior is outside this correction.

## Red, mutation and exact restoration

`tests/browser/room-plan-native-picker.spec.ts` runs the actual built client
through the existing artifact suite and an untracked local config. It uses
the repository's network-changed fixture and normal time budgets.

| Production state | Actual browser outcome |
| --- | --- |
| Baseline without modal held-code release | 1 red, 7.3 s: post-close map motion |
| Fixed artifact | 1 green, 10.8 s |
| New modal deletion changed to membership check, rebuilt | 1 red, 7.4 s: same post-close map motion |
| Exact source restored and artifact rebuilt | 1 green, 10.6 s; 13.6 s overall |

Exact restored SHA-256 of `src/input/keyboard.ts`:
`DB2E14724716DBB6933BA6AD53A06A40196CB774D4DBE5E3A8367D215D47218E`.
The mutation leaves normal keyup deletion intact and specifically disables
the newly introduced modal ownership release. No network-changed retry ran.

The corrected adapter, existing input behavior and input module boundaries
pass 56 unit cases. The same production mutation also makes both new modal
cases red, including the valid unused KeyJ remap; exact restoration returns
the six modal cases green. App/tools TypeScript and production builds pass.

## Accepted interactions and nonduplicate check

The browser case also proves a fresh world KeyE still rotates, repeated native
keyboard catalogue open/close retains 180° and horizontal mirror, and Place
on map arms from remembered hover without another physical map movement.
The ghost has all 112 polygons, genuine clear preflight, a worker request for
`cell-row-four` with quarterTurns2/mirrorXtrue, and the full Brick112/Wood8
catalogue quote of 5,000. It emits zero PlaceRoomTemplate commands. A later
world Escape still cancels the ghost.

Fresh all-state REST searches covered native popup, camera held, select keyup,
and native popup camera. Full relevant Issue bodies were opened: #1918 covers
camera input behind an already opened modal, #1965 covers native dialog
Escape also cancelling placement, #1943 covers radio arrow ownership, #1949
covers prison Load, and #1479 covers semantic action changes at a text-entry
context switch. The observed native popup swallows the physical release of an
already started world key and revives that same action only after closure.

## Not established

This record covers Chromium at Full HD100%, local built artifacts and the
specific native catalogue sequence. It does not establish 200% scale, other
browsers, all native popup kinds, the text-entry issue #1479, actual room
completion, Save/Load, integrated CI or deployed availability.
