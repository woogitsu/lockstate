# Mixed mouse buttons in the angled Build view

This record covers [#1954](https://github.com/woogitsu/lockstate/issues/1954).
The production Full HD browser test is
`tests/browser/oblique-mixed-buttons.spec.ts`, using one worker and the
repository's unchanged time budgets.

With Build armed, holding RMB to turn the camera and pressing LMB on the same
canvas pointer sent **four `PlaceBuildOrder` commands** on the baseline scene.
The test observed actual commands posted to the simulation worker. It also
checked the camera kept turning after LMB release while RMB remained held.

The scene now assigns one gesture owner per pointer: LMB cannot start Build
while RMB owns the turn, and button release checks the active button bit before
ending either gesture. The opposite order keeps an existing Build drag until
LMB release; an unrelated RMB release cannot commit it. Both browser cases
passed after the fix (18.3 s total). Removing only the new turn-owner guard
made the first case fail again with four Build commands while the second
remained green. Restoring the guard returned the scene to the previously
verified green implementation. TypeScript project build passed.

This is an input ownership correction. It changes neither the worker command
format nor collision, save data, camera pose persistence, or HUD controls.
