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

**This section is an ADR draft. It is deliberately not in `docs/adr/`**:
`tests/foundation/adr-numbering-contract.test.ts` requires an ADR to arrive
numbered, indexed in `docs/adr/README.md` and with that file's *Next free
number* line moved, all in one commit, and `AGENTS.md` reserves the number for
central assignment. `max + 1` off `main` reads 0066 as of this commit and other
numbers were handed out the same day, so taking one here would risk exactly the
collision that contract exists to catch. On assignment this section moves
verbatim into `docs/adr/` under the assigned number, with the title "What a
navigation tick may cost", gains its index row, and this record cites it
instead.

### Status
Proposed — pending a centrally assigned number and human approval. Not
accepted.

### Context
See §1–§5 above. In one sentence: the frontier heap made counted work an
adequate proxy for time, and a navigation tick is still not bounded by its
budget, because the budget bounds one of four terms.

### Decision

**1. The per-tick budget stays counted work. It may not be a wall clock.**

Two independent reasons, and the second is the one that would still hold if the
first were negotiable.

*Determinism.* ADR 0009 makes determinism a **product** guarantee, not only an
engineering one: a challenge submission is a command stream plus a seed, and
`verifyChallengeSubmission` rejects it unless a trusted replay reproduces the
same checkpoint hashes and the same final state hash. `PathRequestQueue` decides
per tick which requests resolve, and a resolved route changes actor positions,
which changes the state hash. A budget read off a clock makes that decision a
function of machine speed and ambient load, so two runs of the same stream
diverge and every honest submission is rejected as `checkpoint-hash-mismatch`.
`docs/DETERMINISM.md` allows exactly one reader of real time, `FixedStepClock`,
and only as *pacing*: "The number of ticks is a scheduling decision; nothing
about the value reaches a system, a command payload or any simulation state." A
wall-clock work budget is precisely that prohibited thing.

*Measurement.* Independently of determinism, a wall clock would not deliver the
bound it is proposed for. A clock consulted where the counter is consulted today
— between requests, `path-request-queue.ts:174` — bounds term 3 and leaves terms
1, 2 and 4 exactly as they are; §3 and §4 show those are the larger part of a
deep-queue tick. To bound a tick with a clock you must consult it *inside* a
search, which is both a bigger change and the strongest form of the determinism
hazard.

**ADR 0009 therefore survives intact and is not superseded, narrowed or
qualified by this decision.**

**2. The unit stays a raw expansion.** Weighting an expansion by frontier size
or depth was considered and is rejected on §2: the post-heap unit varies about
2.2× over a 66× range in search size, and weighting could recover part of that
at the cost of a new calibrated constant to keep true — while the tick's actual
bound is wrong by a factor that no weighting touches.

**3. The constant stays at 2,000, and #413's reading that it is "set too high"
does not survive re-measurement.** That reading came from the instrument in §1.
On the term the budget bounds, 2,000 expansions cost 2.6 ms in the drain shapes
and 3.1–6.1 ms in the dearest single-search shape. Lowering it is measured in
§4 as a bad trade: 8–32% off the worst tick for 2–4× the latency. The constant
is not the defect and re-calibrating it is not the fix.

**4. What must change is the budget's *scope*, and the first thing to fix is
term 4.** `processTick` should stop deciding "start this request or not" and
start deciding "spend up to this many expansions". Concretely: a search that
exhausts the tick's remaining budget **suspends** — its frontier heap, closed
set and cost map stay on the pending request — and resumes on the next tick
from exactly the state it left. Nothing is emitted until the search completes.

ADR 0007 rejected the neighbouring idea and its reasoning does not reach this
one. It says *"truncating a search mid-computation would produce a route to
nowhere, which is strictly worse than deferring the whole request to the next
tick."* That is true of truncation and false of suspension: a suspended search
returns no route at all, exactly as a deferred request does today, and the
route it eventually returns is the same route the unsuspended search would have
returned. The frontier heap #413's first half landed is what makes this cheap
and deterministic — its order is total by construction, so the resume point is a
function of counted work and of nothing else.

With term 4 bounded, a tick's search cost becomes `budget + 1` expansion
instead of `budget + one whole request`, and only then does calibrating the
constant against an allowance mean anything.

**5. Term 2 is a scaling defect and should be fixed on its own.** At 5,000
pending the queue spends more time deciding what to do (3.46 ms) than doing it
(2.57–2.97 ms), and the fraction grows with queue depth. The largest part is
computing a flow-field group key for every pending request every tick. The
fingerprint half is a pure function of an immutable `RouteContext` and need not
be recomputed per tick at all.

**6. Term 1 is out of scope here** and is named so it is not mistaken for
something this decision covers: a lazy `buildNavigationGraph` costing 12–17 ms
on the tick after any geometry change is a bigger single cost than everything
else in this document, and it belongs to a separate issue.

### Consequences
- `workBudgetPerTick` keeps its value and its meaning. `docs/NAVIGATION.md` and
  `docs/BENCHMARKING.md` now say what it does and does not bound.
- `navigation.production.yard-crossing` gates decisions 3 and 4:
  `tickOvershootRatio` has a floor, so landing suspension turns it red and
  retiring the finding becomes a decision somebody writes down;
  `workBudgetPerTick` has an equality pin and `ticksToDrain` and
  `maxExpansionsInOneTick` have ceilings either side of it, so re-calibrating
  the constant has to arrive with its cost re-measured.
- Suspension changes `boundedLocalSearch`'s and `runRegionDijkstra`'s
  signatures and adds per-request state to `PathRequestQueue`. It is the
  largest change this decision implies and it is not in the commit that
  proposes it.

### Open questions for the owner
1. **What share of a 50 ms tick may navigation have, and on what reference
   hardware?** #413 says ~3 ms; nothing in the repository derives it, and
   `docs/ARCHITECTURE.md:139` says the budgets are unset. This is a product
   decision about target hardware, which is state this repository cannot read.
   Every number above is reported in milliseconds so the arithmetic re-runs
   against whatever share is chosen.
2. **Nothing here asks for determinism to be traded away.** The question #413's
   comment raised — may the tick budget be non-deterministic — is answered *no*
   above, on evidence, and ADR 0009 stands unamended. That is recorded here
   because the brief that commissioned this work asked for the trade to be
   named if it were needed. It is not.

### Alternatives considered
- **A wall-clock budget, with replay abandoned or made to work another way** (a
  recorded budget in the save, a replay mode that ignores the clock). Rejected:
  see decision 1. A recorded budget would also make a save's replay depend on
  the machine that wrote it, which is a stronger coupling than the one ADR 0038
  accepts.
- **Re-calibrating the constant alone.** Rejected on §4.
- **Weighting the unit.** Rejected on §2.
- **A hard expansion ceiling per request, failing the route above it.**
  Rejected: it bounds the tick but makes a reachable destination report as
  unreachable, which is a gameplay lie and lands in ADR 0041's territory.
  Suspension gets the same bound and tells no lie.
