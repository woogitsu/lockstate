# Stationary room-plan preflight during actual running simulation

2026-10-03; subject125903b07381d09a5eb259282d8c6bcf7953f0ab with production #2007. No production change, Issue, browser or server.

## Measured result

All four source cases pass: World/Angled times normal empty-prison guard / actual patrol. Each advances the real worker FixedStepClock/kernel by1200ticks over60seconds and receives572 real encoded delta publications. The actual feed/main ghost adapter/RoomTemplateTool/bridge read those publications; the pointer stays stationary and the q1 BasicCell remains blocked at its independent ground origin.

| At simulated time | Frame revision | Actual preflight count above settled baseline | Actual deltas |
| --- | --- | --- | --- |
| 0s | 2 | 0 | 0 |
| 29s | 2 | 0 | 277 |
| 30s | 3 | 1 | 286 |
| 59s | 3 | 1 | 562 |
| 60s | 4 | 2 | 572 |

The two queries coincide with the existing30-second consistency snapshots, not each tick or actor publication. `applyDelta` keeps geometry revision unchanged unless its authoritative world marker changes; `applySnapshot` increments the frame revision on the existing consistency pull. This is bounded refresh, not a reproduced chatter defect.

Normal app setup uses an actual packed HireStaff command. The default sector correctly leaves this guard unassigned in the empty prison (#533). A separate motion control registers a real supported scenario sector/schedule before capturing and restoring the actual worker snapshot. PatrolSystem/NavigationSystem move its real guard through86 distinct published/extrapolated positions. This proves actor-motion immunity through production systems; it does not claim the player can currently author that sector through HUD. No fabricated actor/delta/frame/verdict is used.

Completed q1 Cell has20orders/twofixtures/zone. Running preserves exact world/construction/objects/templates, submits zero domain commands and retains the real quote20orders,35brick,2wood-plank,1530minor units. Actual public main Undo then Redo each cause exactly one extra stationary preflight: completed world becomes cancelled/clear, then pending same-origin q1 becomes blocked. Those are the only domain commands.

## Setup corrections and boundaries

`initial-actual-running.log` and `closer-actual-guard-running.log` retain two failed motion assumptions each. Moving the hire closer did not make the correctly unassigned default guard walk. Those are observer/setup errors, not production regressions. The final four cases retain default idle behavior and add the separate real patrol control.

Source harness executes actual main installed callback, bridge and worker ports with minimal DOM/repaint plumbing and real Phaser World Camera. Timer advancement invokes registered actual interval callbacks; it does not manufacture simulation ticks or measured frames. Four cases cover FullHD1920x1080 source geometry with UI-scale2 and stationary q1 Cell only. No native runtime/performance speed claim is made.60seconds simulated time is not wall-clock execution time.

## Verification

- Exact fixture:4/4GREEN; raw `recorded-baseline.log`, machine receipts `actual-running-four-cases.jsonl`.
- Strict fixture TypeScript: exit0.
- Unique actual `SimulationSnapshotFeed.applyDelta` world-marker guard changed temporarily to `if(true)`:4/4RED with20 assertion failures. Actual query deltas become277/286/562/572 at29/30/59/60seconds, versus0/1/1/2. Real1200tick, idle/patrol, unchanged world, literal quote, public Undo/Redo and their +1 refresh controls still execute and pass: counts use soft assertions solely so all independent legal controls finish before the suite reports RED.
- Entire producer bytes restored in `finally`, SHA256 retained in `producer-exact-restoration.json`; detached frozen subject98e1e69af1 during mutation, then original branch resumed. Exact-restored fixture4/4GREEN.
- Final strict fixture TypeScript and canonical research index results are retained alongside raw source outputs. No feed/main/bridge production diff survives.

Command: `node node_modules/vitest/vitest.mjs run tests/unit/ui-template-running-world-revision.test.ts --maxWorkers=2`; optional TEMPLATE_RUNNING_AUDIT_RECEIPT writes measured JSON lines without changing the assertions.

The first index command named a nonexistent unit file and exited1 without executing tests (`index-initial.log`); the real `tests/foundation/research-index-contract.test.ts` passed5/5. This command-selection error is separate from the guard-motion setup errors and producer RED.
