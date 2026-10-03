# HUD cancel/re-arm before a frame revives an old angled press

2026-10-03, source458f8eaad142de927f889f78d5adc8ac85eb73d3.
[Issue2004](https://github.com/woogitsu/lockstate/issues/2004).
Diagnostic checkpoint only: production unchanged; no browser/server launched.

## Executed path

The test extracts the unique current Build armButton.onActivate body, retaining its
real closure-state toggles, and the exact current main arm-build-tool body. Only HUD
painting is replaced, not the callback decisions. Those actual bodies drive real
BuildTool/ObjectTool; registered ObliqueScene handlers use the installed Phaser
Pointer.down/up/move and InputPlugin.processUpEvents dispatch. Real command producer
bodies and SimulationCommandSender feed an initialized SimulationWorkerStateMachine.
No gesture, command or worker verdict is fabricated.

Arm callback(true), old primarydown/drag, callback(false), callback(true), old
primaryup with no intervening Scene.update. Pointer remains primaryDown=true before
release. Both tests fail: wall emits actual square orders10,11 and11,11; Bed emits
PlaceObject11,11. Full UUID packet data is retained in original2red4controls.log.
The scene observes disarming only on its later update; the false state has already
been replaced by true, so its old gesture remains owned by the same pointer ID.

Four legal controls pass: cancel without re-arm does not emit; re-arm followed by a
fresh primary press works; ordinary armed primary release works for both tools.
Strict-types.log exit0. Test invocation uses exact file and maxWorkers2.

## Boundaries and proposed correction

Source-level timing reproduction only: the HUD callback bodies execute, but no actual
DOM button was mounted or activated natively. Native fast keyboard/control timing is
pending ROOT. No debit/completed construction or Rooms automatic ZoneRoom claim.
No owner rule change: an explicit Stop placing must invalidate an unfinished press;
re-arming requires its own primary press. Camera state and hover should remain.

Proposed narrow correction: invalidate construction ownership synchronously when the
public arming adapter turns a tool off, or retain tool-arming revision in the gesture.
Production lease has been requested from ROOT; none has been used at this checkpoint.
No protocol/save/copy/layout changes are proposed.

Fresh all-state re-arm/cancel searches and complete959/1907 bodies/comments retained.
959 is Escape arming behavior;1907 is RoomTemplate bridge revision/interrupt ownership.
This finding concerns ordinary Build/Object HUD cancellation invisible before the
next renderer update. It does not duplicate the stationary camera endpoint refresh,
which current paintGesturePreview already computes correctly.
