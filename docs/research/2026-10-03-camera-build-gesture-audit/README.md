# World construction gesture release belongs to the pressed button

2026-10-03. Issue [#2001](https://github.com/woogitsu/lockstate/issues/2001).
Original subject: 79c00d238469e96902323caab418f66208e9d345.
No browser/server launched. Native acceptance is pending with ROOT.

## Actual cause and scoped correction

The registered WorldScene create callbacks execute with actual installed Phaser Camera,
Pointer.down/up/move and InputPlugin.processUpEvents body. Only Scene/display/asset
plumbing is replaced. Mouse buttons share a pointer ID. Middle release while left
is held leaves primaryDown=true/buttons1 but still emits pointerup/outside.
The original finishPointer committed construction using only that ID.

Only WorldScene.finishPointer changes. Construction completion requires actual
primary release (button0 and left bit cleared), with existing touch completion.
Middle release ends its own camera pan; primary release cannot end a still-held
middle pan. Escape/blur and multi-touch cancellation retain their normal behavior.
No main/bridge/Oblique/protocol/save/art/copy/layout changes.

## Accurate source acceptance and historical boundary correction

Actual BuildTool/ObjectTool reports use unchanged main command producer bodies,
SimulationCommandSender and initialized SimulationWorkerStateMachine. Original
World prematurely emits actual wall/Bed commands at 11,11. Actual RoomTool prematurely
completes its rectangle. Real Rooms HUD stages confirmation: it does **not**
automatically send ZoneRoom until the player confirms.

The diagnostic commit connected RoomTool directly to the main ZoneRoom adapter.
Its source packet proved that adapter seam, not native automatic zoning.
source-baseline.log and source-baseline-direct-room-adapter-historical.log preserve
that original 6 RED/12 GREEN evidence. The issue body and corrected tests explicitly
remove that overclaim; no room command is fabricated or auto-confirmed now.

| Receipt | Result |
| --- | --- |
| original-correct-room-boundary-6red-24controls.log | Original producer: 6 RED /24 controls GREEN |
| fixed-correct-room-boundary-30green.log | Scoped fix: 30 GREEN |
| primary-release-producer-negative.log | Unique actual guard changed to if(true): 6 RED /24 GREEN |
| final-exact-restored-30green.log | Finally exact-byte restoration: 30 GREEN |
| focused-neighbors.log | 131/131 GREEN, five exact files, maxWorkers2 |
| strict-fixed-types.log | Strict new source/native fixture TypeScript exit0 |
| production-build.log | Production build exit0 |
| native-collection.log | Exactly three native cases collected; none executed |

producer-restoration.json records all four terminal statuses and restored SHA256.
Controls include both renderer directions of mouse chord inside/outside, pure middle
camera motion with no construction, fresh primary release, World Escape/blur,
actual single touch and second-touch cancellation. Moving after both buttons release
also verifies no lingering middle pan. Source tests use maxWorkers2.

Initial missing-window engine initialization and top-level-return TS stripping errors
were harness setup errors before tests ran; not production failures.

## Prepared native acceptance

world-construction-chord-release.spec.ts uses actual game/worker and trusted mouse
mousedown/up (Phaser observes mouseup for each button). FullHD1920x1080 UI100%,
independent unrounded public minimap ground reference, actual canvas hit assertions.
Square wall/Bed: no command during held-left middle release; final left release
produces exact footprint/coordinates. Yard: no premature confirm; final left release
stages legal8x8, explicit native confirm emits exactly one ZoneRoom.
Original budgets/retries retained. Three cases collected and strictly typed;
physical chord compatibility/actual HUD hit targets remain ROOT's native queue.
UI200% and successful completed construction are outside this fixture acceptance.

## Dedup

Complete current #1950/#1907/#516 bodies/comments and two search receipts retained.
Angle middle-pan admission, interrupted template press and missing-release recovery
have different causes. issue-body.md archives initial wording; corrected body and
correction comment preserve the Rooms boundary accurately on the live Issue.
