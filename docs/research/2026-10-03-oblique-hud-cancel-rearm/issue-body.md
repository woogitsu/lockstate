## Registered-source reproduction; native acceptance pending

At458f8eaad142de927f889f78d5adc8ac85eb73d3, the angled scene retains a construction gesture across the HUD's Stop placing followed by immediate re-arming before its next update. Releasing the old still-held left button then submits construction without a fresh primary press.

Exact current Build panel armButton.onActivate and main arm-build-tool callback bodies execute, with real BuildTool/ObjectTool, registered ObliqueWorldScene callbacks, installed Phaser Pointer/InputPlugin release dispatch and initialized SimulationCommandSender/SimulationWorkerStateMachine. The panel transition sequence is armed true?false?true. Original six-case source suite gets2 RED/4 controls GREEN: old wall drag submits two genuine square PlaceBuildOrder packets10,11 and11,11; old Bed press submits PlaceObject11,11. Actual UUID command packets are retained in the raw log. Cancel alone and a fresh re-armed primary press work.

Cause: cancellation is only observed by the scene's next update checking current isArmed(). False followed by true before that update is invisible; finish/commit sees the retained gesture and the currently armed tool. The HUD's real cancellation happened while the old primary pointer remained down.

Expected: Stop placing invalidates the unfinished gesture immediately; re-arming needs a fresh primary press. Preserve normal placement, camera ownership, hover/readout and existing explicit Rooms confirmation. No schema/copy/layout/worker policy change is requested.

Source evidence only: callback bodies are executed with DOM painting replaced; this is not a native button timing proof. Actual FullHD keyboard/control timing is pending ROOT's browser queue. No producer source changed at diagnosis. Test: tests/unit/oblique-hud-cancel-rearm.test.ts; receipt: docs/research/2026-10-03-oblique-hud-cancel-rearm/.

Fresh all-state re-arm/cancel searches and full #959/#1907 reads distinguish ordinary HUD re-arm before a frame from Escape arming behavior and RoomTemplate bridge selection/revision ownership.
