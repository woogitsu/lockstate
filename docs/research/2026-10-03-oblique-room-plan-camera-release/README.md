# Armed room plan and angled camera release: current source is correct

2026-10-03, subject458f8eaad142de927f889f78d5adc8ac85eb73d3.
Read-only production audit. No source fix or new Issue; no browser/server launched.

Eight new registered-source cases combine actual middle/RMB camera input with a
mirrored quarter-turn Cell RoomTemplateTool and installed WorldBridge. The installed
Phaser Pointer.down/up/move and InputPlugin.processUpEvents dispatch execute.
Actual ObliqueWorldScene constructor/create handlers and actual worker preflight,
quote and SimulationCommandSender execute. Scene/DOM/graphics/texture plumbing is
replaced for Node; no fake worker verdict or placement packet is injected.

The cases span canvas/outside-release and logical-to-CSS ratios1/2. Ratio is canvas
coordinate conversion, not proof of accessibility UI200% or browser page zoom.
Initial pose is yaw30/elevation60/zoom1.25. After the owning camera button release,
physical motion cannot revive pan/orbit. Subsequent actual wheel zoom and tilt75
also cannot revive it. Plan stays armed with the same revision and no submitted
construction command. A fresh actual bridge primary press/release emits exactly
one PlaceRoomTemplate with mirrorX=true/quarterTurns1 via actual worker preflight.

| Recorded run | Terminal result |
| --- | --- |
| original15green.log | Eight new plus seven existing gameout controls GREEN |
| stopTurn-cleanup-negative.log | Eight new RED, seven gameout controls GREEN |
| exact-restored15green.log | All15 GREEN after finally byte-exact restoration |
| strict-types.log | Strict new fixture types exit0 |

The unique stopTurn body was temporarily mutated only to omit its existing pan/turn
IDs and anchors cleanup. All eight failures occur at the post-release unchanged
camera assertion. restoration.json records original SHA256 and exact restoration;
final production diff is zero. Every source run uses maxWorkers2.

Current source implements RMB orbit, not Alt+drag; there is no Alt-specific camera
binding to diagnose. Fresh #1950/#1907 and #1982 were read, and a new remote camera
release search is retained. Existing canvas?HUD gameout fix1982 is already present;
this adds the active-plan/real owning-release integration boundary, not another fix.

Acceptance is registered-source only. Trusted native button delivery, actual HUD
hit targets, window exit, completed construction, fit policy and whole-ghost
visual bounds are outside this receipt. The existing native1982 cases remain the
browser evidence for canvas?HUD camera termination; no duplicate native test added.
