# #2008: existing fallback from a blocked room anchor

Issue: https://github.com/woogitsu/lockstate/issues/2008

Diagnosis published first at227d344ee0f44f9fe546ea07aeac9c7d955f78fb: [original actual measurements, initial fixture errors and executed diagnostic](../2026-10-03-rotated-room-interaction-boundary/README.md). Source/test checkpoint ff74cbff27f679fefb5d9cab11d2fc33c9a7e54a. Own isolated worktree `lockstate-blocked-room-anchor-fallback-20261003`. No browser/server/Blender/native execution.

## Accepted narrow rule

ADR0041 decision1, opened at185-188 on this base, states: a prisoner whose chosen action cannot resolve a target falls back to the next-best legal action in the same cycle. No new policy/copy/state is required to use the already implemented own-cell meal.

ActionSystem's generic room candidate now checks current `navigation.getGraph().tileToRegion` membership of the existing room anchor, exactly the destination eligibility read by findRoute (`router.ts:173-174`). Existing NavigationSystem.getGraph (`341-343`) rebuilds only stale geometry through ensureGraph; no new graph/search/API or unrestricted path computation was added. A square wall therefore makes that candidate unresolved before action/target counters are committed, allowing the existing candidate loop to select the cell meal.

Only ActionSystem changes: tileKey import and the new eligibility condition/comment. Room identity, geometry, physical object footprints, dining capacity, destinationTileOf, arrival, own-accommodation resolution and permissions remain unchanged. No per-seat/operator coordinates or arbitrary alternative interior target is introduced. The remaining reachable room interior is still subject to the current anchor contract; this correction restores the existing fallback, not usability of that remaining floor as a new target. It checks local destination eligibility, not global connectivity or a different room-selection policy.

## Genuine bounded regression

[Production regression](../../../tests/integration/room-template-blocked-anchor-fallback.test.ts) makes genuine packed purchases, full completion, encoded V8, actual wall completion, real sentence departure and a subsequent generation identity1048576. No injected world/needs/stock/verdict or fake actor feed.

Actual q1 Canteen physical owners remain tables25,6 and25,9, orientation1, exact object order IDs `room-template-000000000002-2-object-000/001`. The ordinary wall at empty21,6 invalidates only the anchor; independently reachable22,7 proves the doorway remains usable. The adjacent wall21,7 retains valid21,6. Ordinary q1 geometry remains valid.

| Case | Original source | Fixed source |
| --- | --- | --- |
| Anchor wall, live | No meal,225route failures,hunger50800→0 | eat-in-cell,149completed actions,0failures,hunger50800→50800 |
| Anchor wall, encoded V8 Load | Same starvation | Same real cell meal |
| Adjacent wall, live | eat-meal,149completed actions,0failures,hunger50800→50800 | eat-meal, no fallback |
| Adjacent wall, encoded V8 Load | Same real canteen meal | Same real canteen meal |

[Typed baseline](./typed-baseline.txt):2RED/2legal6.03s. [Fixed](./typed-fixed.txt):4GREEN5.37s. Raw original measurement and fixed tuples are archived separately. The fixture initially imported an erased type from a nonexistent guessed module, then strict compilation exposed the decoded optional payload boundary; the final test imports ActionCategory from the actual regime module and uses the same trusted SessionSnapshotBundle cast as existing V8 tests. Neither preparation correction changed a runtime assertion or production rule.

## Real producer-negative and exact restoration

[Executed inert recipe](./mutate-anchor-condition.cjs.txt) disconnects only the actual new production condition. [Negative](./producer-negative.txt):2RED/2legal; both anchor cases again fail actual eat-in-cell. Its finally restores original source bytes. [Restored](./exact-restored.txt):4GREEN4.27s. [Byte proof](./producer-restoration.json): before/after sourceSHA256 `9637d7cb0abccc6873cc4771103e194d73c5bed40ce31f28950b204f31f88ba9`, exactByteRestoration true, negative exit1/restored exit0. Production diff0 after restoration. No mutation active or executable scratch left in repository.

## Bounded neighbors and original rotated controls

[Meal neighbors](./bounded-meal-neighbors.txt):25GREEN/5files4.42s, actual own-cell fallback, furnished canteen preference and contended canteen controls plus new4cases. [Action/navigation neighbors](./bounded-action-navigation.txt):33GREEN/3files1.86s. Application and tools strict TypeScript exit0 after final fixture correction.

[Original selected rotated physical/action probe rerun](./fixed-rotated-interaction.txt), [actual domain tuples](./fixed-rotated-results.json): four q/mirror cases retain twelve genuine completed Canteen/Laundry/Cell rooms,24 live/restored routes, independent physical footprints/sourceOrderIds/capacity, and real eat-meal/laundry-work/sleep/use-toilet. This bounded repeat addresses the exact risk that the new eligibility condition could incorrectly reject ordinary rotated rooms. It is not a new20×8 coverage claim.

No schema, copy, tariffs, CI/workflow, HUD/camera/rendering or model assets change. Hardware/native proof remains root-owned. Exact working-byte manifest preserves actual recipe/log bytes, including original preparation errors in the separate diagnostic record.
Final scoped documentation gate:20GREEN/3files4.25s (research index, source anchors, quotation contracts). No live-anchor correction was required by the actual gate after the four-line source addition; no historical citation or budget was changed.
