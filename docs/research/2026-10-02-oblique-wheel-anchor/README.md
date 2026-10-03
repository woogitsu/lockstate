# Angled wheel zoom and the Build square under the cursor

This is the measured defect in [#1955](https://github.com/woogitsu/lockstate/issues/1955).
The test runs the production game at 1920×1080 using native browser wheel
input, after changing yaw and elevation with the visible controls. It also
switches Top-down → Angled view in the same session and repeats the check.

Before the fix, the cursor stayed at screen (1410, 760), the minimap viewport
changed as zoom ran, and the Build target moved from **18,22** to **17,21**.
The scene's wheel listener ignored its pointer and `stepCameraZoom` changed
only the zoom factor around the viewport centre. This is distinct from the
older top-down camera-origin defect in #115.

`tests/browser/oblique-wheel-anchor.spec.ts` failed on that target mismatch.
The scene now passes the wheel pointer to a pure ground-anchor transform.
The browser case passed 1/1 in 13.4 s. Removing only the pointer argument from
the production wheel listener made the unchanged case fail again at the same
18,22 → 17,21 mismatch. Restoring it passed 1/1 in 13.6 s. The projection
unit suite passed 10/10 at yaw 37°/217° and elevation 25°/65°; a centre-point
case records the unchanged keyboard/HUD zoom policy. TypeScript build passed.

The new transform changes camera position in memory only. It changes no
simulation command, collision, save data, or renderer selection policy.
