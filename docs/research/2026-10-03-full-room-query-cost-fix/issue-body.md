## Confirmed source regression

Baseline `15f5bedca0b1e41efacf45118e8676b462a6a98a` includes the #2013 eligible-instance scan and #2014 cached physical components. Their integration calls `isEligible(instance)` before checking capability capacity and use occupancy in `RoomInstanceRegistry.findAvailableForUse`.

The minimal ordinary integration test actually completes two q1 Shower plans with the real seed-73 command packer/kernel and construction. Each genuinely authored room has two hygiene seats. Four ordinary public `claimUse` calls fill them, as a typed registry claim fixture; no fabricated actor actions or path verdicts are injected.

With physical labels already warm:

| Selection route | Result | Physical queries | Freshness chunk reads |
| --- | --- | --- | --- |
| Earlier availability-first gate | no room | 0 | 0 |
| Current callback-first gate | no room | 2 | 2 |

Real baseline `tests/integration/room-selection-query-cost.test.ts` is RED: expected zero queries, observed two. Two additional zero-capability/full-first unit subjects are RED; both Infinity eligibility controls and the first-free-but-blocked/later-free control stay GREEN. Full output is retained in this branch's `docs/research/2026-10-03-full-room-query-cost-fix/actual-baseline-red.log`.

Physical component label lookup is O(1) after generation, but the public query calls `ensureGraph()` and scans C loaded chunks. For R ordinary full room candidates, the new predicate-first order adds R×C freshness reads to selection returning no room. This is a call-count regression, not a measured frame-time or queue-budget failure. No synchronous route search is introduced by the query itself.

## Narrow correction

Compute the capability ceiling first. Reject finite zero/full capacity before querying eligibility. Infinity must still satisfy eligibility but must not read the concurrent claim map. Preserve sorted room order, capability-specific ceilings, claims, own accommodation and permission-aware queued routing. Scope is one registry producer and small ordinary source tests; no schema, UI, browser/server or navigation budget change.

## Fresh deduplication

Successful all-state searches for `isEligible`, `full room query`, `eligibility capacity`, `freshness`, `saturated room` and `room query cost`, plus complete #2013/#2014 bodies, did not expose this capacity-before-connectivity cost case. #2013/#2014 concern unusable first rooms hiding a later room; this issue concerns unnecessary graph freshness work even when no candidate has free capacity. They are related fixes, not the same defect.
