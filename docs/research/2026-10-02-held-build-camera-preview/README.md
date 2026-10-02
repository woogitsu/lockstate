# Held Build preview after camera zoom

This extends the stationary-cursor camera case in #1914 to an active Build drag.
The production Full HD test is `tests/browser/oblique-held-build-pose.spec.ts`.

At 1920×1080, hold a square Build drag from screen (800, 540) to (1380, 540).
The HUD previews six occupied squares. Press the keyboard zoom-in action twice
without moving the mouse. The minimap viewport changes, but before the fix the
ghost and HUD still preview six squares. Move the cursor by one pixel: the
preview changes to five squares. Releasing then sends five `PlaceBuildOrder`
commands, so the committed footprint disagreed with the preview.

`ObliqueWorldScene` now reprojects the held endpoint from the last screen
cursor when painting a preview. The pressed world square stays fixed. Keyboard
pan and viewport/framing changes also repaint the preview. Mouse-wheel zoom
retains its existing cursor-anchored behavior; keyboard/HUD zoom remains
centered.

Evidence on the production app: baseline red with the six-versus-five mismatch;
fixed test green (1/1, 13.2 s); removing only the endpoint reprojection block
red again (1/1, same mismatch); restored green (1/1, 12.1 s). TypeScript
`--noEmit` passed. This case observes the actual worker command tee rather
than injecting a simulated build order.
