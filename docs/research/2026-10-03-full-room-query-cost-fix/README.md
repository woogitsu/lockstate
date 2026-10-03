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
own tests and research/index. Finite capacity and occupancy now precede
eligibility; zero/full do not query physical connectivity. Infinity still
requires eligibility and avoids claim-map reads. Sorted priority, claims,
own accommodation and permission-aware queued routing remain in their owners.
No browser/server starts.

## Actual correction and source producer proof

The fixed integration asserts **zero physical queries and zero freshness chunk
reads** for the same genuinely built/full two-Shower fixture. The finite zero
capability control also reads no claim map. Both Infinity controls still invoke
eligibility exactly once and read no claim map; rejected Infinity is refused.
The blocked first free room still yields the later eligible free room, while a
full earlier room makes no callback. Literal sorted order and unchanged claims
are independently asserted. Actual fixed tests are **6 GREEN** in
[`actual-fixed-green.log`](./actual-fixed-green.log).

`run-reorder-control.ps1` reads the actual committed unfixed producer from
`c076d1f657`, substitutes only `findAvailableForUse` in the fixed source and
runs the ordinary tests. This real reorder omission produces **3 RED / 3 legal
GREEN**, including the actual two physical/freshness reads. The script restores
the complete original fixed byte buffer in `finally`, checks identical SHA256
`feca15de47b6806c7011cc468e11f4f686f0f4709e0c0423bd5b8352fb07d7ea`, then
actually obtains **6 GREEN** at 12:08:43. Raw outputs are
[`actual-reorder-omission-red.log`](./actual-reorder-omission-red.log) and
[`actual-reorder-exact-restore-green.log`](./actual-reorder-exact-restore-green.log);
[`actual-reorder-restoration.json`](./actual-reorder-restoration.json) records
the same original/restored hash and actual exit statuses.

## Bounded controls and publication boundary

Five normal test files pass **65/65**: the new six cases, existing room registry
contracts, physical invalidation/permission controls and genuine later-working
Shower live/V8 action selection. App and tools strict typechecks exit zero; the
research index contract passes 5/5. The full catalogue and large paired snapshot
audits are not rerun. Existing queue/graph/persistence source is untouched.
The fix does not make every physical query O(1): the existing freshness scan of
loaded chunks remains for candidates that actually have free capability places.
The guarded claim is eliminating that work for zero/full candidates.

Commits are diagnosis `c076d1f657`, producer `01c6dab817`, then own final proof.
The coordinator integrates this chain. #2016 remains open until that delivery;
this source proof makes no native browser, hosted CI or release claim.
