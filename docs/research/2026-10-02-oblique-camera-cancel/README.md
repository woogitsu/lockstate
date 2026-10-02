# Angled camera cancellation at Full HD

The [production screenshot](after-blur-fullhd.png) is captured after a
right-button camera turn, a `window.blur`, and further mouse movement without
another press. The paused map stays at the same pose; the browser test compares
the complete canvas bytes immediately after blur with the canvas after that
movement. The same case checks a canvas `pointercancel` separately.

This is the pointer lifecycle defect in [#1935](https://github.com/woogitsu/lockstate/issues/1935),
distinct from held keyboard keys in #202. `ObliqueWorldScene` had retained the
turn pointer across blur. It now clears active camera and build gestures on
blur, `pointercancel`, and lost pointer capture, and stops turning when that
pointer leaves the canvas.

The Full HD browser case is `tests/browser/oblique-camera-cancel.spec.ts`.
Removing just the production turn-pointer reset makes the unchanged browser
assertion fail at “RMB turn must stop on window blur”; restoring it returns
the test to green. The test does not raise its time budget or compare a static
scene without moving the pointer.
