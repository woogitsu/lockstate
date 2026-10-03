# World construction gesture release belongs to the pressed button

2026-10-03. Read-only original diagnosis on79c00d238469e96902323caab418f66208e9d345.
The actual-source test obtains6 RED /12 controls GREEN. No browser/server was
launched and no producer was changed at this diagnostic checkpoint.

## Executed production path

The genuine WorldScene/ObliqueWorldScene.create callbacks execute, with only
Scene/display/asset plumbing replaced. Real Phaser Camera preRender and actual
Phaser Pointer.down/up/move execute. The actual InputPlugin.processUpEvents
body extracted from the installed engine forwards release to the registered
scene pointerup or pointerupoutside. It emits for a non-owning button too;
InputManager.onMouseUp forwards every mouseup to that body. The real Pointer
remains primaryDown=true/buttons1 after middle up while left is still pressed.

Real BuildTool, ObjectTool and RoomTool emit their normal reports, consumed by
the exact unchanged main PlaceBuildOrder/PlaceObject/ZoneRoom producer bodies.
Actual SimulationCommandSender and initialized SimulationWorkerStateMachine
observe the transmitted packets. No command or verdict is supplied as a mock.

World submits one command early for each of the three tools, both inside and
outside release: square Brick wall11,11; Bed11,11; Yard11,11,1?1. The latter
establishes premature transmission, **not successful minimum-size zoning**.
The source log preserves full packet data with genuine generated UUIDs.

Six identical Angled ownership cases already pass. Six pure middle-pan controls
change the actual camera with no construction commands; a fresh left gesture
still emits its normal report. No stationary template/camera matrix cases are
repeated. This diagnosis concerns World's finishPointer, whose ID-only commit
calls accept any release from the one shared mouse pointer.

## Fresh dedup and bounded proposal

Complete current1950/1907/516 bodies/comments and two all-state search receipts
are retained. Armed middle-pan admission in Angle1950, interrupted template
press1907 and missing-release recovery516 do not cover this World non-owning
button release. The created Issue URL is recorded in issue-created.log.

The granted scoped proposal changes only WorldScene.finishPointer release
ownership. Build/object/room may commit only after their actual primary button
release; a released middle button still ends its own camera pan. Existing touch,
normal primary release, cancel cleanup and pure middle pan remain controls.
Production correction and mutation/restoration will be recorded separately.

Strict diagnostic TypeScript exit0. Initial setup failures (unprovided window
for actual Phaser OS detection and top-level return passed to TS stripping)
were harness errors before any test ran; they are not producer failures. The
final six red assertions observe actual submitted commands while primaryDown
is still true. Native mouse chord compatibility and physical full-HUD placement
remain ROOT's later browser queue and are the weakest unverified claim.
