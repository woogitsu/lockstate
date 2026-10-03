# Pending ordinary square wall versus a later furniture footprint

Actual source checkpoint9b847445c101e9a8554b5539ea072d79aa42865d,2026-10-03. Own branch codex/pending-square-wall-incoming-object-audit-20261003. Offline packed commands in a genuine runtime; no browser or hosted CI claim.

## Reproduction and legal control

Seed73. PlaceRoomTemplate cell-basic at10,10, genuinely finish shell and both fixtures. Submit ordinary PlaceBuildOrder paid-square wall-brick footprint=square at12,13; it is approved, before any step. Submit later Bed at12,12 through either actual PlaceObject or PlaceBuildOrder. Its anchor is clear; its second square12,13 has no completed square or physical object yet but is claimed by the already-approved square wall. Repeat after createSaveEnvelope→JSON→decodeSaveEnvelope→restoreSimulationRuntime.

Both command entries approve the conflicting Bed. Genuine continuation finishes the wall with50progress/two bricks and the Bed with30progress/one plank; physical object sourceOrderId=later-bed exists at12,12 with canonical orientation0, and world squareStructure12,13 is1. Treasury23390→23325 after Bed admission (65 spent). Thus this is physical overlap, not only a permissive quote or stale row.

Adjacent legal wall11,13 does not intersect Bed12,12–13: all four legal cases finish independently owned furniture. Incoming standalone commands do not expose individual rotation; no unsupported orientation field is injected.

Corrected [admission baseline](./baseline.txt):4RED/4legalGREEN,439ms tests/2.73s total. [Actual completion probe](./completion-probe.txt):4RED/4legalGREEN,470ms/2.77s, retaining eight actual command/history/order/treasury/physical-object tuples and full raw-capture hashes in [actual-command-tuples](./actual-command-tuples.json). The full raw before/after/completed gameplay snapshots remain in this worktree's .local-pending-square directory.

Initial legal coordinate13,13 was on the Cell perimeter; a second attempted legal coordinate12,14 was the existing Toilet. Their four control failures are retained separately as [first](./initial-fixture-errors.txt) and [second](./second-fixture-errors.txt) fixture errors. Both runs also reproduced the four genuine incoming approvals. The corrected legal coordinate is11,13; neither error is attributed to production.

## Existing rule and deduplication

Fresh full #1705 says a wall must refuse standing AND pending furniture; #1651/#1652 concern incoming furniture against completed square geometry. #1976 concerns incoming generic object orders against another object's physical/pending footprint. #514 protects redundant same-definition geometry but explicitly does not equate different buildables; #16 calls for occupancy validation before partial mutation. Fresh searches for pending wall/object and pending square/bed find no separate inverse pending-square/furniture report. This is an existing occupancy boundary, without a new tariff/copy/save/room rule.

System's existing object footprint loop sees completed square geometry and pending room-template ownership, but not ordinary pending square orders. The service's existing claimed-order footprint set scans only object-producing orders, not wall orders. Proposed scope: reject a real incoming object footprint intersecting a nonterminal ordinary square wall order with existing PBO unbuildable/service tile-occupied, before spend/history. Retain exact duplicate reason ordering, legal legacy edges, adjacent squares, cancellation release and valid template-owned furnishing. System/service source lease requested; no production modification or mutation yet. Application TypeScript and diff checks pass. This baseline test is not mutation-verified proof of a correction; source/fixed/negative/restoration gates remain pending.

## First coherent correction and real producer negatives

System's existing incoming object footprint loop now reads nonterminal square claims from its real order map for every requested tile. The service's existing placement claimed-tile set includes nonterminal square wall orders as well as object-producing orders. Both exclude completed/cancelled/failed rows; completed physical square geometry still uses the existing world reader. Existing refusal/duplicate ordering, no new state/wire/schema/copy/tariff/coordinator/session.

[Fixed8GREEN](./fixed.txt),467ms/3.01s. Disconnect ONLY the System pending square producer: [2RED/6GREEN](./system-negative.txt),430ms/2.75s; service remains protective. Disconnect ONLY the service's actual pending-square claim set: [2RED/6GREEN](./placement-negative.txt),451ms/2.68s; System remains protective and the service wrongly registers the failed diagnostic order. Both are actual producer failures, not test substitutions. Both source files restored from captured bytes in finally, [matching hashes](./restore-hashes.json), detached mutation work excluded from branch sweep. [Restored8GREEN](./restored.txt),445ms/2.73s. Broader canonical footprints/release/legacy-edge and neighbouring gates follow this published checkpoint; no terminal broader/native/CI acceptance claim yet.

## Extended footprint, lifecycle and terminal source gates

[28GREEN](./expanded-fixed.txt),1.59s/4.13s, covers both canonical standalone axes: Bed1×2 and Desk2×1 far-only pending square conflicts, live and encodedLoad, with truly completed adjacent controls. Genuine partly-built square/in-progress progress>0 is encoded/loaded and retains its claim. Actual CancelBuildOrder with the current revision releases the square; pending legacy North edge on the Bed's far square remains legal and both the edge and Bed finish normally. First cancellation expansion omitted the required expectedRevision and caused [four strict-schema fixture errors](./expanded-cancel-fixture-errors.txt); corrected command supplies the actual revision without a source/schema change.

On the entire extended test, real System pending-square producer disconnection gives [5RED/23GREEN](./expanded-system-negative.txt),1.44s/3.76s. Real service pending-square producer disconnection gives [5RED/23GREEN](./expanded-placement-negative.txt),1.50s/3.74s. Exact bytes restored in finally; original source hashes match the earlier immutable restore receipt and both committed source files have zero diff. [Restored28GREEN](./expanded-restored.txt),1.47s/3.82s. Every conflicting admission compares immutable gameplay pre/post, allowing only dispatch progress and the existing failed PBO diagnostic row; no treasury/history/world/original-order mutation.

[483 neighbouring tests/13filesGREEN](./neighbours.txt),23.84s/two workers. Exact files are pending-square-wall-incoming-object, completed-square-incoming-object-footprint, pending-template-incoming-object-footprint, template-deferred-history-order, room-template-command-reservation, room-template-session, room-template-redo, room-template-rotated-history, room-template-replacement-order-ownership, build-order-object-collision-boundary, generic-object-footprint-admission, square-wall-object-footprint and object-placement-loop (integration files live under tests/integration; room-template-command-reservation, room-template-session and room-template-redo live under tests/unit). Both application/tools TypeScript GREEN. [Production buildGREEN](./build.txt),6.10s, existing plugin/chunk warnings retained. Source leases released; narrow live-anchor documentation gate closure follows. No browser/hosted CI acceptance.

## Terminal documentation closure

Initial doc gate60GREEN/2RED (24.73s): the new record needed its own index row, and the System reader shifted an ADR0047/ADRindex live quotation beyond the unchanged tolerance. [Original output](./docs-initial.txt) retained. Approved exact live-coordinate correction preserves all prior1651/1990 historical checkpoints. Completion now cites the actual finalizeConstruction declaration; cancellation/orderedOrders/reversal retain their existing quoted fragments at current coordinates. WORLD's existing admits/buildability coordinates and service outside-room coordinates precede the added loops and did not move; they were opened and intentionally need no correction. No guard/budget/tolerance change. [Terminal62GREEN/eightfiles](./docs-terminal.txt),14.61s. Both production sources remain committed/diff0; source/docs leases released.

Exact483-test neighboring paths:

- tests/integration/pending-square-wall-incoming-object.test.ts
- tests/integration/completed-square-incoming-object-footprint.test.ts
- tests/integration/pending-template-incoming-object-footprint.test.ts
- tests/integration/template-deferred-history-order.test.ts
- tests/unit/room-template-command-reservation.test.ts
- tests/unit/room-template-session.test.ts
- tests/unit/room-template-redo.test.ts
- tests/integration/room-template-rotated-history.test.ts
- tests/integration/room-template-replacement-order-ownership.test.ts
- tests/integration/build-order-object-collision-boundary.test.ts
- tests/integration/generic-object-footprint-admission.test.ts
- tests/integration/square-wall-object-footprint.test.ts
- tests/integration/object-placement-loop.test.ts
