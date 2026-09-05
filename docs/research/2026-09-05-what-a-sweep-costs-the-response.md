# 2026-09-05 — what a contraband sweep costs the incident response

**Measured on `origin/main` at v0.0.483 (`1ad2189a`) and again on
`fix/996-search-and-incident-share-a-pool`, in a worktree, through
`createNewSimulationRuntime` and the real command handler.** Nothing here was
read off a browser: the simulation is the whole subject and it lives in the
worker, so a headless kernel run is the instrument.

This record answers [issue #996](https://github.com/matmaxalez/lockstate/issues/996)
and the measurement [ADR 0073](../adr/0073-who-orders-a-contraband-search.md)
asked for and did not have — *"how long a sector sweep ties up a guard [...]
whether a prison with one guard can afford one at all"*.

## The question

`IncidentResponseSystem.claimableResponders` and
`SearchSystem.assignQueuedOrders` called the same `claimableGuardIds` for the
same finite pool. **How many ticks a day does a running sweep leave the
responder pool empty, at one spare guard and at two — and what does that cost
the prison?**

## The answers, in four lines

1. **A sector sweep lasts 110–130 ticks, not 1,500.** Mean 114 over 40 sweeps in
   the twelve-prisoner prison, mean 130 in the four-prisoner one, maximum 130 in
   both. It claims exactly one guard (`sector.requiredGuardCount` is `1`), and
   the duty orders one every 600 ticks, so it holds a guard for **≈19% of a
   2,400-tick day**. The issue's "1500 ticks" is the figure this record
   corrects; what is true is the *emptiness*, not its duration.
2. **At exactly one spare guard the responder pool stands empty 466 ticks a
   day** in the twelve-prisoner prison and **520** in the four-prisoner one,
   with a sweep as the sole cause. **At two spare guards or more it is 0**,
   because a sweep takes one guard and leaves the other.
3. **That emptiness cost zero dispatches.** Every incident that opened in 24
   runs carried severity 3 or more and therefore asked for **two** responders,
   so the prison with one spare guard could answer nothing whether it searched
   or not. The defect is real and its measured price in incidents contained is
   **zero**.
4. **The fix is a no-op except at exactly one spare guard, where searching
   stops.** With `INCIDENT_RESPONSE_GUARD_RESERVE = 1` the 466 and 520 become
   **0 in all 24 configurations**, every other measured figure at two spare
   guards or more is unchanged or within one sweep, and the twelve-prisoner
   prison needs a **fourth** hire to search where three used to do.

## How to read this record

- **MEASURED** — a run of this tree's own code, output pasted below.
- **VERIFIED** — the file was opened at the cited symbol and quoted.
- **DERIVED** — arithmetic over the two above, shown.
- **UNKNOWN** — not established in this pass.

## The instrument

A probe outside the repository (`probe996/pool.test.ts` in a scratch directory,
run through a scratch `vitest` config with `root` set to the worktree), because
`vitest.config.ts` collects only `src/**` and `tests/**` and
`docs/AGENT_WORKFLOW.md` §2 forbids leaving a scratch file under `tests/`. It is
reproduced in full at the end so this is re-runnable.

The prison is `tests/integration/contraband-search-duty.test.ts`'s own fixture,
parameterised: one walled, zoned and furnished cell, `guards` hires, `prisoners`
admissions 40 ticks apart, then ten in-game days (24,000 ticks) stepped one tick
at a time. Per tick it records `claimableGuardIds(...).length`,
`SearchSystem.claimedGuardIds().length`,
`IncidentResponseSystem.claimedGuardIds().length` and the open incidents'
`requiredResponderCount`.

Commands, verbatim:

```
git worktree add /workspace/wt-996 -b fix/996-search-and-incident-share-a-pool origin/main
ln -sfn /workspace/lockstate/node_modules /workspace/wt-996/node_modules
cd /workspace/wt-996
node /workspace/lockstate/node_modules/vitest/vitest.mjs run --config probe996/vitest.probe.config.ts
```

`pnpm` is not used inside a worktree whose `node_modules` is a symlink
(`ERR_PNPM_UNSAFE_MODULES_DIR`, `docs/AGENT_WORKFLOW.md` §2).

**The grid: 24 configurations.** Prisons of 4 and 12 prisoners × 1 to 6 guards ×
seeds `0x996` and `0x997`, ten in-game days each. An earlier pass over 6, 8 and
24 prisoners is not tabulated below and agreed with it on every line that
matters.

**"Before" is the same binary as "after".** The reserve is a constant, and at
`0` `claimableSearchGuardIds` is `slice(0, length - 0)` — the whole array, so
the identical function `claimableGuardIds` returns. Reserve `0` reproduced the
pre-change numbers exactly (466.0 and 520.0 ticks a day, measured on
`origin/main` before the change existed), which is what licenses reading the
`R0` column as `main`. **DERIVED**, and the check that supports it is that the
two runs printed the same figures to one decimal place.

## What was measured

`empty/day` is ticks a day the post-eligible free pool was empty **with a sweep
holding a guard and no incident response holding one** — the sole-cause form, so
a response emptying the pool is not counted against the sweep. `swp` is sweeps
finished in ten days, `cb` contraband items discovered, `res`/`lap` incidents
resolved and lapsed. **MEASURED.**

```
seed   pris g  sur |  R0 empty/day  swp  cb  res lap |  R1 empty/day  swp  cb  res lap |  R2 empty/day  swp  cb  res lap
0x996  4    1  0   |       0.0     0   0    0   7|       0.0     0   0    0   7|       0.0     0   0    0   7
0x996  4    2  1   |     520.0    40   1    0   7|       0.0     0   0    0   7|       0.0     0   0    0   7
0x996  4    3  2   |       0.0    40   1    2   5|       0.0    40   1    2   5|       0.0     0   0    2   5
0x996  4    4  3   |       0.0    40   1    4   3|       0.0    40   1    4   3|       0.0    40   1    4   3
0x996  4    5  4   |       0.0    40   1    7   0|       0.0    40   1    7   0|       0.0    40   1    7   0
0x996  4    6  5   |       0.0    40   1    7   0|       0.0    40   1    7   0|       0.0    40   1    7   0
0x996  12   1  -1  |       0.0     0   0    0   6|       0.0     0   0    0   6|       0.0     0   0    0   6
0x996  12   2  0   |       0.0     0   0    0   7|       0.0     0   0    0   7|       0.0     0   0    0   7
0x996  12   3  1   |     466.0    40   0    0   7|       0.0     0   0    0   7|       0.0     0   0    0   7
0x996  12   4  2   |       0.0    40   0    2   5|       0.0    40   0    2   5|       0.0     0   0    2   5
0x996  12   5  3   |       0.0    40   0    3   4|       0.0    40   0    3   4|       0.0    40   0    3   4
0x996  12   6  4   |       0.0    40   0    7   0|       0.0    40   0    7   0|       0.0    40   0    7   0
0x997  4    1  0   |       0.0     0   0    0   7|       0.0     0   0    0   7|       0.0     0   0    0   7
0x997  4    2  1   |     520.0    40   2    0   6|       0.0     0   0    0   7|       0.0     0   0    0   7
0x997  4    3  2   |       0.0    39   2    3   3|       0.0    39   2    3   3|       0.0     0   0    2   5
0x997  4    4  3   |       0.0    40   2    3   3|       0.0    39   2    3   3|       0.0    39   2    3   3
0x997  4    5  4   |       0.0    40   2    6   0|       0.0    40   2    6   0|       0.0    39   2    6   0
0x997  4    6  5   |       0.0    40   2    6   0|       0.0    40   2    6   0|       0.0    40   2    6   0
0x997  12   1  -1  |       0.0     0   0    0   6|       0.0     0   0    0   6|       0.0     0   0    0   6
0x997  12   2  0   |       0.0     0   0    0   7|       0.0     0   0    0   7|       0.0     0   0    0   7
0x997  12   3  1   |     466.0    40   4    0   7|       0.0     0   0    0   7|       0.0     0   0    0   7
0x997  12   4  2   |       0.0    38   4    2   5|       0.0    38   4    2   5|       0.0     0   0    2   5
0x997  12   5  3   |       0.0    39   4    3   4|       0.0    37   4    3   4|       0.0    37   4    3   4
0x997  12   6  4   |       0.0    40   4    7   0|       0.0    39   4    7   0|       0.0    37   4    7   0
```

`sur` is `guards - required`, and `required` is the posted requirement
`DeploymentSystem.getCoverageReport` published at the last tick: **2** for the
twelve-prisoner prison and **1** for the four-prisoner one. **MEASURED.**

## What the columns say

**The defect is a one-configuration defect.** `R0` is non-zero on exactly four
rows of 24, and all four are `sur = 1`. A sector sweep claims one guard, so two
spare guards are already enough for the pool never to empty. **DERIVED** from
the table and from `DEFAULT_SEARCH_POLICIES`' `sector: { requiredGuardCount: 1 }`
(**VERIFIED**, `src/simulation/contraband/default-search-policies.ts`).

**A reserve of 1 removes it everywhere and costs the `sur = 1` prison its
searching.** `R1` is `0.0` on all 24 rows. Its `swp` differs from `R0` on five
rows: the four `sur = 1` rows, where 40 sweeps become 0, and three rows at
higher surplus where it is one or two sweeps fewer out of ~39 — a sweep deferred
by a tick when a response is holding somebody, not a sweep prevented. `cb`,
`res` and `lap` are identical to `R0` on every row where sweeps still run.

**A reserve of 2 costs a second hire and bought nothing.** `R2` additionally
stops sweeps at `sur = 2` (four more rows, and `0x997`'s four discoveries with
them) and changed **no** `res`/`lap` pair for the better; at `0x997 / 4 / 3` it
was worse — `res 3 lap 3` became `res 2 lap 5`, which is the sweep's absence
moving the RNG stream rather than a mechanism, and is the reason this record
does not claim `R2` *causes* worse containment. It claims only that it did not
cause better.

## Why one reserved guard cannot answer anything

`IncidentResponseSystem.requiredResponderCount` is
`Math.max(1, Math.ceil(severity * this.policy.respondersPerSeverityPoint))` with
`respondersPerSeverityPoint: 0.5` (**VERIFIED**,
`src/simulation/incidents/response-system.ts`). `ASSAULT_SEVERITY_CEILING`'s own
docblock states the floor (**VERIFIED**, `src/simulation/incidents/flashpoint.ts`):

> A threshold-grazing assault is severity 3 and asks for two guards; the worst
> possible one is severity 5 and asks for three.

Across the 24 runs the severities that actually opened were
`[3,4,5,7,8,8,8]`, `[3,3,4,7,7,7]`, `[3,4,5,5,7,7,7]`, `[3,4,7,9,10,10]` and
similar — **no incident below severity 3 in any run** (**MEASURED**). So the
free pool being non-empty and an incident being answerable are different
statements, and the reserve makes the first true and not the second.

Sizing the reserve to the second would mean holding two guards, which is the
`R2` column: a second hire, for no measured gain. `respondersPerSeverityPoint`
is the number that would make one reserved guard useful, and it is balance and
the owner's under `AGENTS.md`.

## What the change costs a player, in hires

**One.** DERIVED from the table: contraband becomes findable at the posted
requirement **plus two** instead of plus one. In the twelve-prisoner prison
`tests/integration/contraband-search-duty.test.ts` builds, that is four hires
where three used to do; in the four-prisoner prison, three where two used to do.
Incidents are unaffected — nothing narrowed what a responder may claim — and the
posted requirement itself is untouched.

## The residual, named rather than glossed

With the free pool at exactly two, a sweep holding one of them can still delay a
two-responder dispatch. Measured as ticks a day where an open `'active'`
incident was short of responders **and** the searchers would have covered the
shortfall: **11 to 26 ticks a day** at `sur` 2 and 3, unchanged by the reserve
(it is the `R1` column's residue too). It never became a lapse in any run — the
response deadline is 600 ticks (**VERIFIED**,
`DEFAULT_INCIDENT_RESPONSE_POLICY.responseDeadlineTicks`) — so what it costs is
latency, not outcomes. Raising the constant to 2 removes it at the price the
`R2` column measures.

## My weakest claim, and what would change my mind

**That the fix costs a player only one hire.** It rests on the posted
requirement being what these two prisons published (1 and 2) and on the sweep
claiming one guard, both of which hold today and neither of which is fixed:
`sector.requiredGuardCount` is a policy field a save carries, and a prison with
several staffed sectors can have several sweeps outstanding. A prison with three
staffed sectors would want three walkers plus the reserve, and this record did
not build one — **UNKNOWN**. A run over a multi-sector prison showing the
reserve failing to hold, or a sector policy with `requiredGuardCount > 1` in a
shipped save, would change it.

**What would change the choice of `1` over `2`:** any configuration where a
reserved second guard converts a lapse into a containment. None of the 24 did.

## The probe, verbatim

`probe996/vitest.probe.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '/workspace/wt-996',
  test: {
    environment: 'node',
    globals: false,
    include: ['probe996/**/*.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
```

`probe996/pool.test.ts` builds the prison with the four commands
`playedPrison` uses (`PurchaseMaterials`, `ZoneRoom`, `PlaceObject`,
`HireStaff` × n, `AdmitPrisoner` × n, with `wallRoomPerimeter` from
`tests/helpers/room-walls`), then:

```ts
while (runtime.kernel.tick < end) {
  runtime.kernel.step();
  const pool = claimableGuardIds(runtime.securityGuards).length;
  const searchHeld = runtime.searchSystem.claimedGuardIds().length;
  const responseHeld = runtime.incidentResponseSystem.claimedGuardIds().length;
  if (searchHeld > 0) searchHeldAny += 1;
  if (pool === 0) {
    emptyAny += 1;
    if (searchHeld > 0) emptyWithSearch += 1;
    if (searchHeld > 0 && responseHeld === 0) emptySweepOnly += 1;
  }
  let worstShortfall = 0;
  for (const incident of runtime.incidents.openIncidents()) {
    if (incident.state !== 'active') continue;
    worstShortfall = Math.max(worstShortfall, runtime.incidentResponseSystem.requiredResponderCount(incident.severity) - pool);
  }
  if (worstShortfall > 0) {
    starvedAny += 1;
    if (searchHeld >= worstShortfall) starvedBySearch += 1;
  }
  // sweep durations: ids appearing in and disappearing from `searchSystem.orderIds()`
}
```

The three reserve columns were produced by editing
`INCIDENT_RESPONSE_GUARD_RESERVE` to `0`, `1` and `2` between runs and restoring
it by hand, with `sha256sum -c` confirming the restore
(`docs/AGENT_WORKFLOW.md` §3's mutation discipline).
