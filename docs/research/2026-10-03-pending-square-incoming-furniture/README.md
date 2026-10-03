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
