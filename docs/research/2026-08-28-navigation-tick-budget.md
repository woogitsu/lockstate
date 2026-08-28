# 2026-08-28 — What a navigation tick costs, and what its budget bounds

**Question.** May the per-tick navigation budget be non-deterministic — a wall
clock rather than counted work — given ADR 0009's replay guarantee, the save
format and the named RNG streams? And if it may not, what should the
counted-work budget be calibrated against so that it stands in for wall clock
honestly?

That is the remaining half of [#413](https://github.com/matmaxalez/lockstate/issues/413),
handed to an ADR by its own comment. Everything below was measured at
`21e5f66` (v0.0.156) plus the branch this record lands on, on the shared
container, Node 24.19.0, with other agents working. Evidence tier is
**VERIFIED** throughout unless a claim says otherwise: every number was
obtained by running the thing, and every `file:line` was opened.

---

## 1. Method, and why the previous instrument was misleading

`scripts/report-navigation-cost-model.mjs` (from
[#410](https://github.com/matmaxalez/lockstate/issues/410)) divided **the whole
scenario run** by its expansions and called the quotient "µs per expansion".
Reproduced on this tree before changing it, nine repeats, minimum:

| scenario | profile | expansions | µs/expansion, whole run |
| --- | --- | --- | --- |
| `single-request-budget` | smoke | 4,094 | 1.536 |
| `single-request-budget` | full | 16,290 | 2.306 |
| `meal-rush` | smoke | 16,087 | 2.118 |
| `meal-rush` | full | 51,901 | 3.431 |
| `lockdown-return` | smoke | 19,898 | 1.764 |
| `lockdown-return` | full | 78,997 | 3.099 |

That **does reproduce** what `docs/BENCHMARKING.md` recorded on 2026-08-28
(1.552 / 2.012 / 2.106 / 3.270 / 1.691 / 3.202) to within the run-to-run spread
that document itself describes. The instrument is repeatable. It is measuring
the wrong quantity.

A scenario run also contains, and charges to "expansions":

- one `buildNavigationGraph` rebuild. `NavigationSystem` builds its graph
  lazily (`src/simulation/navigation/navigation-system.ts:113`, called from
  `update` at `:124`), and the constructor built it from an empty chunk list,
  so the first `update` finds it stale and rebuilds. Measured 12–17 ms.
- on every tick, a `PathRequestQueue.processTick` prelude proportional to the
  number of *pending* requests, not to the work done.

So the quotient is an upper bound on the unit, and a loose one. Both this
record and the corrected script measure two things instead: the unit, by timing
one `findRoute` and nothing else; and the tick, by timing one
`NavigationSystem.update` and nothing else, element-wise minimum per tick index
across repeats. The minimum is used for the reason `docs/BENCHMARKING.md`
already gives: preemption is one-sided, so on a shared box the minimum is the
closest available estimate of uncontended cost and its error runs one way.

## 2. The unit is a reasonable proxy for time

One `findRoute` corner-to-corner across one open square region — the shape with
the largest frontier — timed alone, nine repeats, minimum:

| open region | expansions | route ms | µs per expansion |
| --- | --- | --- | --- |
| 32×32 | 987 | 1.35 | **1.370** |
| 64×64 | 4,030 | 6.29 | **1.560** |
| 128×128 | 16,162 | 34.07 | **2.108** |
| 256×256 | 65,200 | 199.89 | **3.066** |

A 66× growth in search size moves the unit **2.2×**. `docs/NAVIGATION.md`
records 1.35 / 1.48 / 1.93 / 2.46 for the same four shapes at `c201547` on a
quieter container — the same 1.8–2.2× shape, and the same conclusion. Before
the frontier heap the same range moved the unit 7.0× (15–20 µs and rising, per
#413's own opening).

In the queue-drain shapes the unit is cheaper still: 2,332 expansions in a
steady tick at 250 pending cost 4.06 ms *including* the prelude, and the
marginal figure derived below is 1.28–1.41 µs.

**So the objection "the budget bounds counted work rather than wall clock" is,
after the heap, an objection to a proxy that is accurate within about 2×.**
That is not nothing, and it is not the reason a navigation tick is unbounded.

## 3. What a tick is actually made of

`NavigationSystem.update` timed on its own, one open 64×64 region, shipped
budget 2,000, element-wise minimum per tick index over nine repeats:

| pending | tick 0 | steady tick | steady expansions | worst tick after 0 | its expansions | prelude at steady |
| --- | --- | --- | --- | --- | --- | --- |
| 250 | 12.43 ms | 4.06 ms | 2,332 | 6.96 ms | 4,026 | 0.42 ms |
| 5,000 | 16.37 ms | 6.79 ms | 2,332 | 9.82 ms | 3,979 | 3.15 ms |

**Two steady ticks, identical counted work, 2.7 ms apart.** Four terms, and
`workBudgetPerTick` bounds one:

1. **The graph rebuild** (`navigation-system.ts:113`). 12–17 ms, paid again
   whenever geometry changes. Not budgeted; no budget value changes it.
   Established as a cause rather than inferred from the shape of tick 0: an
   `update` on an **empty** queue — no requests, so no expansions and no
   prelude — costs 10.11 ms on the yard and 10.01 ms on the prison block the
   first time, and 0.018 / 0.026 ms the second, minimum of nine repeats. The
   whole of the difference is `isNavigationGraphStale` answering yes once.
2. **The per-tick prelude.** `processTick` copies and sorts every pending entry
   (`path-request-queue.ts:152`) and then computes a flow-field group key for
   every pending entry (`:161`) — `tileKey`
   (`src/simulation/world/coordinates.ts:121`, a template-string allocation)
   plus `routeContextFingerprint`
   (`src/simulation/navigation/route-context.ts:52`, which copies, sorts and
   joins the permission list) — including for the ~97% of pending requests the
   tick will never reach. Not budgeted, and it grows with queue depth.
3. **The budgeted search.** The only term the budget bounds.
4. **The overshoot.** `processTick` tests `usedBudget >= params.workBudget`
   *before* a request and never inside one
   (`src/simulation/navigation/path-request-queue.ts:174`), so a tick spends up
   to the budget **plus one whole request**.

Term 2, isolated by running exactly one tick at `workBudget: 1` (so the search
loop resolves one request and does nothing else) against `workBudget: 2_000`,
minimum of nine repeats, on the gated prison-block workloads:

| pending | tick at budget 1 | tick at budget 2,000 |
| --- | --- | --- |
| 250 | 0.42 ms | 3.07 ms |
| 1,000 | 0.86 ms | 3.24 ms |
| 2,500 | 1.68 ms | 4.12 ms |
| 5,000 | 3.46 ms | 5.84 ms |

At 5,000 pending the queue spends **3.46 ms before it does any pathfinding at
all**. Instrumenting `processTick`'s three phases directly (temporary timers,
added and removed by hand) split that at 5,000 pending into 1.11–1.64 ms of
copy-and-sort and 2.23–3.24 ms of group scan, against 2.57–2.97 ms for the
whole budgeted search. **The largest single term in a deep-queue tick is the
flow-field group scan, and no budget touches it.**

Term 4, on the gated `navigation.production.yard-crossing` scenario added with
this record: `tickOvershootRatio` = 2.042 (250 actors) and 2.455 (1,000). A
tick spends two-and-a-half times what it budgeted, deterministically, in
counted work.

## 4. Lowering the constant does not work, measured

Draining the same populations at a sweep of budgets, element-wise minimum per
tick, worst tick over the drain:

| shape | actors | budget 2,000 | 1,000 | 500 |
| --- | --- | --- | --- | --- |
| meal rush | 250 | 13.53 ms | 10.68 ms | 9.20 ms |
| meal rush | 5,000 | 14.33 ms | 13.82 ms | 12.28 ms |
| lockdown return | 250 | 11.02 ms | 10.22 ms | 9.58 ms |
| lockdown return | 5,000 | 14.77 ms | 13.72 ms | 13.44 ms |

| shape | actors | budget 4,000 | 2,000 | 1,200 | 600 |
| --- | --- | --- | --- | --- | --- |
| yard crossing | 250 | 9.07 ms | 5.29 ms | 6.29 ms | 4.85 ms |
| yard crossing | 1,000 | 11.04 ms | 7.30 ms | 6.80 ms | 5.63 ms |

**A 4× cut in the budget buys 8–32% off the worst tick**, because the worst
tick is terms 1, 2 and 4 and only a slice of term 3. Meanwhile it costs latency
and total CPU: at 5,000 actors the meal rush takes 26 ticks at budget 2,000 and
96 at 500, and each of those extra 70 ticks pays term 2 again. Yard drain total
went 531 ms → 559 ms from budget 4,000 → 600 at 1,000 actors.

## 5. What could not be established

- **UNKNOWN — the allowance.** #413 states "a ~3 ms allowance for a 50 ms
  tick". Nothing in this repository derives or records that figure.
  `docs/ARCHITECTURE.md:139` says the opposite is true: *"Exact frame/tick
  budgets will be set after representative benchmark scenarios exist."* Those
  scenarios now exist (#410), so the precondition is met and the figure is
  settable — but what share of a tick navigation may have depends on target
  hardware, which is not in git.
- **UNKNOWN — real workloads.** Every number here is synthetic. The six
  production systems that call `requestRoute` are not driven; ADR 0007's
  "minimal stub actors" scope is still what the evidence rests on. Nobody plays
  this game yet, so no measurement of a real queue depth exists.
- **Weakest claim, and what would change my mind.** That the unit's ~2×
  variation is tolerable. It rests on the four open-region rows in §2, all from
  one machine on one afternoon; a shape whose expansions are 5× dearer than the
  cheapest — a very large region with a heavy door population, say — would make
  weighting the unit worth reconsidering. A measurement of `findRoute` across a
  region with hundreds of portals would settle it, and none was taken.

---

## The decision this record proposes

The decision this record's measurements support is now
[ADR 0066: What a navigation tick may cost](../adr/0066-what-a-navigation-tick-may-cost.md),
where it was moved verbatim on central assignment of the number.

**This record is not superseded by it and should not be read as background.**
Sections 1 to 5 above are the evidence ADR 0066 rests on, and two of them are
corrections that the ADR states as settled and this document states as a
history:

- §1 withdraws *"the shipped budget is set too high"*. That was the brief's
  sharp fact, and it was an instrument artefact: the cost model divides a whole
  scenario run by expansions, so a lazy `buildNavigationGraph` and an
  O(pending) `processTick` prelude were both being charged to the search loop.
  Timing `system.update()` alone puts the same two scenarios at 2.57–2.97 ms
  against a ~3 ms allowance — inside it, not at twice it.
- §4 records that lowering the constant does not work, with the numbers. It is
  why the constant stays 2,000, and it is the alternative a future reader is
  most likely to propose again.

Read this document when you want to know *why* those two things are true, or
what a re-measurement would have to beat. Read the ADR for what was decided.
