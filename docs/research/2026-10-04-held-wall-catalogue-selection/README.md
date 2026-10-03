# Held wall drag survives a catalogue change to Door

## Original current-source reproduction

At `1c9ae8c61ff209708e96426feceb18e18ecf2414`, press and hold a square-wall gesture, activate the actual Door catalogue row before releasing the old primary button, then release. Both World and Angled consumers submit a genuine `PlaceBuildOrder` for `door-wooden` from the unfinished wall press. No fresh primary press occurred after the choice changed.

The existing `tests/unit/oblique-hud-cancel-rearm.test.ts` now runs the exact catalogue `onActivate`, its actual shared `reportArmed` closure and the exact `main.ts` arm callback. It uses real BuildTool/ObjectTool, registered scene callbacks, installed Phaser Pointer and InputPlugin release code, SimulationCommandSender and SimulationWorkerStateMachine. DOM paint/art loading are substituted; this is source/worker evidence, not a native pointer/keyboard timing claim. No planted world, stock, verdict or command is used.

Original bounded27-case suite: **2RED/25GREEN,3.26s**. Existing21 cancel/rearm/camera controls remain GREEN. New legal controls prove same Wall reselection preserves the held gesture and selecting Door before a genuinely fresh press still sends Door. The two failures retain actual submitted command packets. They prove stale command submission, not successful Door construction or a measured debit.

## Cause and deduplication

The panel remains armed while changing selected catalogue definition. `main.ts` immediately cancels a gesture on explicit disarm, and the object arm refresh cancels its old press, but the still-armed BuildTool Wall→Door branch changes definition and square/edge mode without withdrawing its retained gesture. Release reads the new definition.

Fresh all-state remote door/selection/gesture search and full open#1907/#2004 bodies were read. #1907 protects RoomTemplate bridge selection ownership; #2004 protects explicit Stop/re-arm. This ordinary catalogue change invokes neither existing boundary. Search and original raw output are retained.

## Authorized scope

Parent granted only `src/main.ts` existing `arm-build-tool` callback. Cancel its construction gesture when an already armed BuildTool changes to a different selected definition, preserving same-selection gestures and independent camera ownership. No Fit, cursor, layout, copy, protocol, format, tariff or native changes. Fixed/negative/restored evidence follows after execution.
