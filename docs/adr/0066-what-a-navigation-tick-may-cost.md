# ADR 0066: What a navigation tick may cost

> **0066 was assigned centrally**, after this draft returned unnumbered, which
> is the practice `AGENTS.md` records so that two agents drafting at once cannot
> take one number. The draft deliberately carried **no** number: numbers had
> been handed out the same day, and `max + 1` computed against a tree about to
> gain a higher one is the merge-order failure
> `tests/foundation/adr-numbering-contract.test.ts` exists to catch. The
> arithmetic was re-derived from disk at the moment of writing rather than taken
> on trust: with `origin/main` at `e337046` merged into this branch, `docs/adr/`
> holds **0065** as its highest number, so the next free number is 0066 and the
> index's line moves to 0067. That agreed with the number assigned.
>
> **0067 is spoken for** by issue #493 and is not free.
>
> This document pre-commits to renumbering without argument if an unmerged
> branch turns out to hold 0066.

## Status

**Proposed, 2026-08-28.** Decided under the owner's standing mandate
(`AGENTS.md`, "The owner's standing mandate": research, decide, record — rather
than ask). The number is assigned; what stays open is **one question that is
the owner's** and is stated under "Open questions for the owner" below — what
share of a 50 ms tick navigation may have, and on what reference hardware. That
is a player-visible performance promise, which `AGENTS.md`'s fourth exclusion
reserves to the owner, and nothing here decides it.

Decision 4 — suspend-and-resume — is decided and **not implemented**. The
branch that carried this document changed no file under `src/`. What landed
with it is the measurement apparatus and this record.

## Context
See §1–§5 of
[the measurement record](../research/2026-08-28-navigation-tick-budget.md),
which this document was extracted from and which is not background to it: two
of those sections are corrections that this decision rests on. In one sentence: the frontier heap made counted work an
adequate proxy for time, and a navigation tick is still not bounded by its
budget, because the budget bounds one of four terms.

## Decision

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
1, 2 and 4 exactly as they are; §3 and §4 of the measurement record show those
are the larger part of a
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

## Consequences
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

## Open questions for the owner
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

## Alternatives considered
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
