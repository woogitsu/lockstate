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


## Implemented correction and exact-source evidence

The one common availability-callback call is now
`worldScene.cancelConstructionGesture()`, immediately after existing template
`standDown()`. This uses the existing #2004 construction-only port in both scenes.
The existing Oblique `releaseSessionInput()` and available-session reframe remain
unchanged. No camera, hover, painter order, input mapping, worker protocol or saved
format changes are introduced.

Explicit dependency: #2004 commits4c0178c14916, a2d822e46922 and1bed49eadba3.
They are present in this branch as f484b7ddb9, f12e68159c and ecb27aafdb;
the parent already has their originals and must not cherry-pick those duplicates.
After that dependency and before the new common call, the actual-source boundary
still gives6 RED/24 legal GREEN (`original-after-2004-dependency6red24controls.log`).

The fixture now binds the actually created scene before initial host start,
matching production boot order. This is harness plumbing, not a new defect.
The existing #2002 preflight fixture's previous empty scene stub failed9 cases
because it lacked the now-required cancellation port. That initial failure is
retained in `inherited-2002-missing-port.log`; only its existing scene adapter
received a no-op cancel port. No preflight assertions, worker verdicts, delays,
states or host behavior were changed.

A temporary unique omission of ONLY the new common availability call yields
6 RED/24 legal GREEN. Exact original fixed bytes are restored in `finally`;
`mutation-restoration.json` pins SHA256 and byte equality. The restored own suite
passes30/30. `focused-neighbors.log` passes66/66 across ordinary ownership,
HUD cancellation/re-arm, actual WorkerPerSessionHost and existing #2002 preflight.
Strict fixture types and production build (application and tools TypeScript plus
client/worker bundle) both exit0. Every source run uses maxWorkers2.

This proves source/registered-callback ownership, not native physical timing.
ROOT retains the browser lease; no browser/server or remote CI was run here.
Wall accepted-order, Bed transmission and Rooms report-only boundaries above
remain distinct. Existing native #1949 evidence is not relabeled as these new
World New/Load cases. Physical FullHD acceptance is pending parent integration.
