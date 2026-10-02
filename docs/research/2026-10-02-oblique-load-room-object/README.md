# Held Room and Object gestures across Load

The production Full HD browser case is
`tests/browser/oblique-room-object-load-gesture.spec.ts`. It runs the actual
angled scene, HUD save controls, and simulation worker at 1920×1080. A real
left-button drag remains held while the saved prison is loaded from a
keyboard-activated Load button. After Load, the physical button is released
and the pointer moves again.

**Observed on current production code:** 2/2 cases passed in 22.9 s. The
Room preview readout returned to “Nothing selected”, no pending Designate
appeared, and no `ZoneRoom` command was sent. The Object case sent no
`PlaceObject` to the loaded worker. Both cases then made a fresh gesture:
Rooms reached the normal confirmation control and Object sent exactly one
`PlaceObject`. This distinguishes cancellation from disabling input.

**Production mutation:** removing only `cancelGesture()` from
`ObliqueWorldScene.releaseSessionInput()` made both unchanged browser cases
fail. The Room readout remained at “2 × 3 tiles at 15, 15”; the Object release
sent one `PlaceObject bed-wooden` into the replacement worker. Restoring that
line returned 2/2 green in 22.2 s. The one earlier red run was a test selector
mistake (`rooms` rather than the actual `zones` tab), fixed before this
measurement.

This closes the unmeasured Room and Object half of the held Build/RMB Load
boundary tracked by [#1949](https://github.com/woogitsu/lockstate/issues/1949).
No production change or new issue was needed.
