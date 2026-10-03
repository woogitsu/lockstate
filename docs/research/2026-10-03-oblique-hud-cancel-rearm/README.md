# HUD cancel/re-arm before a frame revives an old angled press

2026-10-03, source458f8eaad142de927f889f78d5adc8ac85eb73d3.
[Issue2004](https://github.com/woogitsu/lockstate/issues/2004).
Original diagnostic retained below; scoped source correction now verified. No browser/server launched.

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

## Rooms extension (before production changes)

The genuine Rooms armButton.onActivate body and actual pressArm reducer feed the
exact main arm-room-tool body and RoomTool. The same false?true transition revives
its old Yard rectangle report10,11,2?1. This stages explicit confirmation only;
no ZoneRoom was auto-submitted. Updated original3red6controls.log records3 RED/6
legal controls across wall/Bed/Rooms; strict-types-expanded.log exits0. Initial
six-case evidence remains archived. Native timing remains unproven.

## Scoped correction and final source evidence

The existing main arm-build-tool and arm-room-tool adapters synchronously call
cancelConstructionGesture only for armed=false. World delegates to its existing
cancelAllGestures; Oblique to its existing cancelGesture. No camera IDs/anchors,
hover, key state, art/depth/mapping, layout, copy, protocol or saved field changes.
False?true before update can no longer revive the old construction press.

The final suite covers both World and Oblique, wall/Bed/Rooms, cancelled old release,
cancel-only then fresh re-arm/primary press, and ordinary placement. Rooms observes
its real report only, preserving explicit confirmation rather than bypassing it.
Three additional controls preserve active World middle pan and Oblique middle/RMB
ownership through HUD disarm/re-arm, with no construction commands.

| Final terminal receipt | Result |
| --- | --- |
| original-expanded6red15controls.log | Exact original three producers:6 RED/15 controls GREEN |
| fixed21green.log | Scoped source:21 GREEN |
| build-disarm-adapter-negative.log | Only actual Build false-adapter call omitted:4 RED/17 GREEN |
| build-disarm-adapter-negative-exact-restored21green.log | Exact restored:21 GREEN |
| room-disarm-adapter-negative.log | Only actual Rooms false-adapter call omitted:2 RED/19 GREEN |
| room-disarm-adapter-negative-exact-restored21green.log | Exact restored:21 GREEN |
| strict-fixed.log | Strict new source fixture types exit0 |
| focused-neighbors.log | Five exact files,113/113 GREEN, maxWorkers2 |
| production-build.log | Real build including application/tools typechecks exit0 |

Both independent guard negatives used unique existing main adapter sites and finally
byte-restored every source. producer-restoration.json records all three original
fixed-source SHA256 hashes and six terminal stages. No temporary producer diff remains.
Native fast activation timing, actual FullHD hit targets and pixel acceptance remain
ROOT's later browser queue; this is not a native success claim.
