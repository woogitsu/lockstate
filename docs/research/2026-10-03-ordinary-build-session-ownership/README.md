# Ordinary World construction press crosses New/Load

2026-10-03, subject9081238ae4fb71c3b45800b7d09213025011e2cd.
Source-only World extension of [Issue1949](https://github.com/woogitsu/lockstate/issues/1949).
Original production unchanged at this diagnostic checkpoint. No browser/server.

## Executed pipeline and actual failures

Actual World/Oblique constructor/create handlers use installed Phaser Camera,
Pointer.down/up/move and InputPlugin.processUpEvents dispatch. Unchanged actual main
wall/object command bodies feed SimulationCommandSender, SimulationWorkerChannel,
WorkerPerSessionHost and two distinct initialized WorkerStateMachines. Actual main
onWorkerAvailability and HUD setUnavailable bodies execute; only DOM painting,
Scene/display/texture plumbing is replaced. No session event, worker verdict or
command is invented. Host New/Load actually terminates the outgoing client, initializes
the replacement and returns actual snapshots before/after the old primary release.

Six World cases fail: New and Load for wall/Bed/Rooms. Actual wall old release emits
one square command at11,11 and increases the replacement construction orders0?1.
Bed emits actual PlaceObject11,11; this receipt does not claim successful debit or a
completed Bed. Rooms emits actual stale Yard rectangle report11,11,1?1, which stages
pending explicit confirmation only. No automatic ZoneRoom is emitted.

Cause: actual availability callback calls releaseSessionInput only inside the
Oblique instanceof branch. World construction pointer ownership survives the host
replacement. Its old pointerup therefore observes the still-armed tool and sends
its old construction input into the replacement channel.

## Controls and acceptance limits

Original6red24controls.log:6 RED/24 GREEN, maxWorkers2. Twelve owning-release boundary
cases cover both modes, New/Load and all three tools. Six same-session ordinary held
releases and twelve fresh replacement-session presses are legal controls. Strict
source types pass. Raw UUID packets and before/after order counts are retained.
initial-positive-cardinality-harness-error.log preserves a setup assertion mistake:
normal Oblique wall run is2 squares, not1; that seventh red was a harness error, not
an additional producer defect. Corrected legal cardinality remains exact.

Existing1949 native proof covers Oblique Load camera/wall, not these World paths.
Fresh remote World-gesture and held-Load searches plus full1949 history retained.
Native physical timing, HUD hit targets and screenshot acceptance remain ROOT's
browser queue. Renderer-switch teardown and already-staged Rooms confirmation are
outside this particular reproduced boundary; no defect claim for them.

## Granted correction proposal

A single common construction-only cancellation at actual availability callback,
using the already-approved2004 cancelConstructionGesture port. Dependency2004 must
be explicit. Preserve Oblique releaseSessionInput/reframe and RoomTemplate standDown
(#2002) exactly. No new hover/camera/protocol/save/copy/layout policy. Original source
receipt is published before applying the dependency/correction.
