# Legacy remaps and angled camera controls

[#1938](https://github.com/woogitsu/lockstate/issues/1938) describes a
version-1 input preference that moves `camera.up` from physical `KeyW` to
`KeyQ`. When the angled camera added rotate-left on `KeyQ`, the old migration
preserved the player's custom action but silently omitted rotate-left. The
player lost a direct keyboard rotation control.

The migration now searches the original default positions of displaced
actions. In this case the newly introduced rotate-left action gets the
vacated `KeyW`, while the player's `camera.up` stays on `KeyQ`. A chain such as
up Q and down W uses the next vacant default position S. The search never
overwrites a saved binding and does not change the version-1 storage shape.
`KeyboardEvent.code` keeps these physical positions consistent between
QWERTY and AZERTY; the browser case sends the AZERTY labels Z and A with
the physical codes W and Q.

The [Full HD production screenshot](legacy-remap-fullhd.png) was captured
after those two physical key actions in the actual angled scene. The test
checks that KeyW changes the paused world's projection, that the custom KeyQ
still moves it, and that loading the migration does not rewrite the saved
preference. The single browser case passed 1/1 on a cold start (44.9 s).
Replacing the production vacated-key search with the previous skip-on-collision
rule made that same case red 1/1 specifically at the KeyW camera turn (7.5 s);
restoring the code returned it to 1/1 green (8.1 s).

The prior `tests/unit/input.test.ts` case was red 1/40 when its expectation
was corrected from “rotate-left is missing” to `KeyW`. With the fix, 42/42
input tests and strict TypeScript passed. A targeted mutation that bypassed
the vacated-key search made three of those 42 tests red; restoring the
production code returned 42/42 green. The browser case is
`tests/browser/oblique-legacy-remap.spec.ts`.
