# Room preview across prison sessions

Issue [#1947](https://github.com/woogitsu/lockstate/issues/1947) records a fitted room-plan preview retained when the simulation worker is replaced. The camera is a page object, while New prison and Load create a new worker for the next session. The preview's locked origin belongs to the outgoing session.

## Actual game evidence

At 1920×1080 on `/?renderer=oblique`, the player paused a new prison, armed a 112-square Four-cell row and hovered near the upper playfield, activating the approved fit/pan preview. Keyboard focus and Enter activated Save now and then Load while the mouse remained on the map. Save alone preserved the armed [preview](before-session-boundary-fullhd.png). Load replaced the worker; the production fix disarmed the old plan and hid the ghost. Re-arming the plan and starting New prison also hid it, with no `PlaceRoomTemplate` command sent. The [after-session screenshot](after-session-boundary-fullhd.png) records the new prison without an armed preview.

The focused browser case passed 1/1 in 47.3 seconds including 32.6 seconds of cold Vite prewarming. Removing only the new `roomTemplateTool?.standDown()` call from the worker-availability callback made the same case fail 1/1: after Load the ghost stayed visible with `data-ready=clear` for the unchanged 10-second expectation. Restoring the call passed 1/1 in 17.7 seconds. Strict TypeScript and 22 focused session/template tests also passed.

The callback disarms on successful replacement and failed worker claim. In the latter case the old worker has already stopped, so an armed plan would have no session to submit to. This fix changes no save format and does not reset camera yaw, tilt, or zoom; those are separate camera behavior.
