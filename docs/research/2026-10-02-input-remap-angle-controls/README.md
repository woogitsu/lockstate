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

The prior `tests/unit/input.test.ts` case was red 1/40 when its expectation
was corrected from “rotate-left is missing” to `KeyW`. With the fix, 42/42
input tests and strict TypeScript passed. A targeted mutation that bypassed
the vacated-key search made three of those 42 tests red; restoring the
production code returned 42/42 green. Full HD production browser acceptance
is in `tests/browser/oblique-legacy-remap.spec.ts`.
