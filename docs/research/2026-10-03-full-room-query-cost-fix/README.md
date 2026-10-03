# Full-room eligibility query cost — #2016, 2026-10-03

VERIFIED: own isolated worktree starts at `15f5bedca0`. Successful fresh
all-state searches and complete #2013/#2014 bodies precede the single new
[Issue #2016](https://github.com/woogitsu/lockstate/issues/2016).
Raw searches are in `fresh-dedup.json`; the exact submitted body and related
Issues are retained alongside it.

The minimal actual reproduction is now an ordinary integration test:
`tests/integration/room-selection-query-cost.test.ts`. Real commands/kernel
complete two q1 Showers; their authored two-seat hygiene capacities are filled
using the public typed claim fixture. Before any fix, selection returns no room
but executes two physical queries/two freshness chunk reads. The earlier
availability-first gate performs zero. This is count evidence, not a measured
frame-time regression or fabricated four-prisoner/native action trace.

`tests/unit/room-use-eligibility-order.test.ts` adds zero required-capability,
Infinity with rejected/accepted eligibility, first free blocked/later free and
full-first order controls. Actual unfixed output is **3 RED / 3 legal GREEN**
in [`actual-baseline-red.log`](./actual-baseline-red.log).

Owner scope is exactly `src/simulation/prisoners/room-instance-registry.ts`,
own tests and research/index. Finite capacity and occupancy will precede
eligibility; zero/full will not query physical connectivity. Infinity will
still require eligibility and avoid claim-map reads. Sorted priority, claims,
own accommodation and permission-aware queued routing remain in their owners.
No browser/server starts. Correction and actual producer reorder-omission /
byte-exact restoration evidence are pending at this diagnosis checkpoint.
