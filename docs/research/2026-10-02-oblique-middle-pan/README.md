# Middle-button pan in the angled game — 2026-10-02

Issue [#1950](https://github.com/woogitsu/lockstate/issues/1950). The production Full HD browser case opens `?renderer=oblique`, creates and pauses a prison, arms Brick wall in Build, expands the minimap, and physically drags the middle mouse button across the canvas.

## Evidence

- **Before:** the minimap viewport remained `left: 2.38975%; top: 2.38975%; width: 95.2205%; height: 95.2205%`. The browser test failed because the middle drag did not pan the camera (5.7 s test).
- **After:** 2/2 production browser cases passed in a 16.8 s suite. The first case shows the camera moving with Build still armed and checks that the page did not scroll. [Full HD world after pan](./middle-pan-build-fullhd.png).
- **Load boundary:** the second case holds the middle button through keyboard Load. The replacement prison remains still after further pointer movement. Removing only the two middle-pan reset assignments from `releaseSessionInput()` made this case fail (viewport changed from `left 2.38975%, top 2.38975%` to `left 1.00055%, top 0%`); restoring them gave 2/2 green again.
- **Movement mutation:** disabling only the scene's middle-pointer movement branch made the first browser case red while the Load case remained green; restoring it returned to green.
- **Ground anchor:** the pure projection test checks six yaw/elevation combinations, including a 20° low angle. The grabbed world ground point remains under the moved cursor to eight decimal places. This does not claim independent browser proof of exact world coordinates, only the projection contract.

The implementation prevents default middle-click autoscroll, keeps middle-pan separate from right-button turn and left-button Build, and clears it on pointer release/out/cancel, window blur and session replacement. No save format or simulation state changed.
