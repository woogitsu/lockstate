# ADR 0062: Who gets the room when more prisoners want it than it seats

## Status

**Proposed, 2026-08-28.** Not accepted. This records a decision that has been
*built* — issue #434, on branch `agent/434-contention-fairness` — because
[ADR 0041](./0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
decision 2 named the urgency question as one *"this document should not answer
alone"*, and an answer living only in four code comments is not an answer this
repository can review. The argument below is the whole of the warrant; a reader
who disagrees should treat the choice as open.

**The number was assigned centrally**, after the work returned and before this
file existed, which is the practice `docs/AGENT_WORKFLOW.md` §2 records as the
thing that stopped 0038 and 0034 colliding. 0062 rather than a lower gap because
0058 and 0060 were handed out today and returned unused while 0059 and 0061 are
held by drafts in flight, and `tests/foundation/adr-numbering-contract.test.ts`
requires the index's **Next free number** to be `max + 1`. This document
renumbers without argument if an unmerged branch holds 0062.

## Context

Two accepted decisions point here, and both say the same thing in different
words.

[ADR 0029](./0029-concurrent-room-use-claims.md) **decision 5** chose the
contention rule and named what it permits, in its own words:

> **What it permits, said plainly: a low-index prisoner is systematically
> favoured, and sustained contention can starve a high-index one.** A prisoner
> who is refused retries on the next cycle with a hungrier need, but the need
> raises their score against *their own other options*, never against another
> prisoner — nothing in `selectBestAction` or in the scan compares two
> prisoners. So with demand permanently above capacity, the same prisoners lose
> every time.

ADR 0041 **decision 2** deferred the fix *"on cost and scope, not on merit"* and
listed the three things that had to be settled first: which need decides
urgency, the `O(N log N)` per-cycle cost, and the determinism constraint
[ADR 0020](./0020-deterministic-kernel.md) and ADR 0029 decision 7 put on a
second iteration order. This document settles all three.

### What the code did, and where the order came from

`ActionSystem.update` was a single loop over `EntityQuery.execute()`
(`src/simulation/prisoners/action-system.ts:139-140` at `c00b641`), and
`EntityQuery.execute` walks indices `0..maxActiveIndex`
(`src/simulation/entity/query.ts:40`) — **ascending entity index**. Concurrent-use
claims are taken *during* that walk and each is visible to the next prisoner in
it, at two points: the selection gate
(`RoomInstanceRegistry.findAvailableForUse`,
`src/simulation/prisoners/room-instance-registry.ts:568`, reached from the ranked
walk at `action-system.ts:444`) and the arrival gate
(`RoomInstanceRegistry.claimUse`, `:714`, reached from `action-system.ts:357`).

So the walk's order *was* the contention rule, ascending index never changed,
and the winners' needs were refilled while the losers' were not. ADR 0029 calls
the second half incumbency.

### The measurement, because a fixed order is not the same as a cheated player

Both runs below are the real kernel driven by real commands, on `c00b641`.

**A shower room, which is where the ordering decides a *need*.** 24 prisoners in
one furnished dormitory (24 beds, 24 toilets, so no `own-accommodation` action
is ever scarce), a canteen, and a `room.shower-room` at its authored 3×3 minimum
with two `1×1` shower heads — a derived hygiene ceiling of **two** against
twenty-four. 40,000 ticks. `action.shower` has no `own-accommodation` sibling
and gets none by design
([ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
decision 1), so a lost shower is a need that simply goes unserved.

| | never showered | reached hygiene 0.0 | worst final hygiene | shower ticks, lowest .. highest |
| --- | --- | --- | --- | --- |
| ascending index | **2** (the two highest indices) | 8 | **0.0**, six of them | 0 .. 480 |
| by need urgency | 0 | **0** | **166.4** | 240 .. 400 |

Prisoners 22 and 23 took **zero** showers in 40,000 ticks — not fewer, none —
and afterwards take six each. The lowest hygiene any prisoner touched at any
tick goes from 0.0 to 96.8. Nobody paid for it: the population takes *more*
showers in total (`unmetDemandCycles` 1,364 → 978, `actionsCompleted`
8,758 → 9,114), because ordering the arrivals also stops two prisoners walking
to the same last free head and one of them wasting the trip.

> **Every figure in this shower table is pre-[ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md) too**,
> for the same reason the canteen numbers are (see *Open questions* 1's
> amendment) — this section says so at the top, *"both runs below are the real
> kernel driven by real commands, on `c00b641`"*, and `c00b641` predates the
> walk. **What the table claims is unaffected and its numbers have moved.**
> `tests/integration/contended-shower-fairness.test.ts` was re-measured when the
> walk landed and carries the current ones beside the old, in its own words:
> *"90.4 and 125.2 since ADR 0059, against 96.8 and 166.4 before it … a prisoner
> spends part of the day walking, so a two-head room washes 24 people slightly
> less thoroughly"* — still nowhere near the floor, still zero prisoners who
> never wash. Noted rather than restated here (#435), because the re-measurement
> is that file's and this document should point at it rather than keep a second
> copy that can rot again.

**A canteen, which is the scenario ADR 0029's amendment measured, and which
turns out not to be the sharp case.** 24 prisoners, a six-seat canteen, 30,000
ticks: prisoners 12–23 entered the canteen **zero** times on every one of the
twelve days — and every one of the 24 sat at exactly `36300` stored hunger units
at the moment each meal block opened. Since ADR 0041 a refused prisoner eats in
their cell, so the incumbency there is total and its measured need cost is nil.
See *Open questions* 1; this is not a footnote and it is not fixed.

## Decision

### 1. Urgency is the score of the highest-ranked candidate **the prison can provide**

`needUrgency` (`src/simulation/prisoners/utility-ai.ts`) is `scoreAction` — the
same `deficit × effect` sum `rankActions` already sorts one prisoner's own
options with — applied to the head of that prisoner's ranked candidate list,
skipping candidates this prison has nowhere to perform.

**Why the same number rather than a second notion of urgency.** Two properties
follow from the reuse, and they are the reason for it:

- **Restricted to the prisoners contending for one room, it is exactly the
  deficit of the need that room serves.** Everyone whose best providable
  candidate is `action.eat-meal` is scored `hungerDeficit × 4`; the coefficient
  is then a constant, so ordering them by this orders them by hunger and by
  nothing else. Contention is always per room and per capability, so that
  restriction is the case that matters and the general cross-action comparison
  is not.
- **It is regime-aware for free.** The candidate list handed in has already been
  filtered by the active regime block, so a prisoner cannot rank urgent for a
  need their timetable offers no route to today.

**Why `provided` exists.** Taking the bare head makes the key degenerate
wherever a need has no route at all. A prison with no yard, no common room and
no classroom leaves every prisoner's `recreation` unserved for ever, so
`action.yard-recreation` ranks first for all of them at the same maxed-out
deficit — an urgency read off a want the prison cannot serve is *identical for
everybody*, which collapses straight back onto the tie-break and reinstates the
index order this whole document exists to remove. That is not hypothetical: ADR
0054 decision 1 keeps `recreation` room-gated on purpose, so an early prison is
exactly the case.

### 2. Both gates are ordered, and the measurement is the argument

ADR 0029 decision 2 takes the claim on **arrival**, not at selection, and
`findAvailableForUse` says of itself that it is *"an answer, not a
reservation"* — it can tell six prisoners the same two-seat shower room is free.
So a room reached on foot is won or lost at `claimUse` in `continueTravelling`,
and ordering only the selections fixes nothing.

That is measured rather than reasoned about. **With the idle selections ordered
by urgency and the arrivals left in ascending index, prisoners 22 and 23 were
still on 0 showers across 40,000 ticks — the before-column figure, unchanged to
the tick.** The whole of the improvement in the table above arrived with the
second sort.

`ActionSystem.update` therefore runs three passes:

1. **`performing`, ascending entity index.** Order irrelevant and deliberately
   untouched: a performer either continues or *releases* its claim. Running all
   of them first means every seat freed this cycle is free before anybody
   competes for it.
2. **`travelling`, by descending urgency of the action they walked for**
   (`committedActionUrgency`: `scoreAction` of the action already recorded in
   `actionIndex` — the same reading of the same needs, so the two halves of the
   scan cannot disagree about what urgent means). Arrivals run before selections
   so a prisoner who has already walked to a room is not pre-empted by one who
   decided to go a moment ago.
3. **The idle, by descending `needUrgency`.** The set is exactly the prisoners
   whose phase was `idle` when pass 1 reached them, which is the set the
   single-pass loop called `beginNextAction` for; a prisoner dropped to `idle`
   *by* an earlier pass still waits for the next cycle.

### 3. Ties break by ascending entity index, and the key may not read a claim

The comparator is `right.urgency - left.urgency || left.index - right.index`.

**It is total, and that is the property a fairness rule is easiest to get
wrong.** Two live prisoners cannot share a storage index, so it never answers
`0` for two distinct entries; the sorted result is therefore one unique
permutation of the input, independent of whether the engine's
`Array.prototype.sort` is stable, of which sort algorithm it uses, and of the
order either list happened to be collected in. `docs/DETERMINISM.md` states the
rule this satisfies: *"A tie-break must be total. A comparator that leaves two
elements equal falls back to whatever order the input array happened to be
in."* A comparator stopping at the urgency term would fall back to collection
order, which is ascending index today and would silently become something else
the day the collection loop moved.

**Index rather than entity id**, deliberately: since #441 an id is
`(generation, index)` lexicographic, so a recycled low index sorts *after* a
fresh high one and id order is no longer index order.
`EntityQuery.execute` guarantees index order, ADR 0029 decision 7 commitment 3
already names it as *"a total order derived from state"*, and the rest of this
system already runs in it.

**And the spine of the whole thing: `RoomInstanceRegistry.hasPlaceForUse`
deliberately does not read a use claim.** It asks only whether an instance of
the room type exists with a non-zero ceiling for the capability — the question
that has one answer for the whole cycle. It would have been natural to reuse
`findAvailableForUse` there, and it would have been wrong: **an ordering key
that counted the claims taken earlier in the same scan would be a function of
the scan position it is deciding.** Prisoner A's key would depend on whether
prisoner B had already been served, the sort would stop being a function of
state, and two runs of the same seed could disagree the moment anything
reordered the collection loop. *Who gets it now* stays in
`findAvailableForUse`, which still runs per prisoner in the execution half of
the scan, where a claim taken by an earlier prisoner is supposed to be visible.

The same rule shapes where the work happens: `planIdleSelection` computes the
block, the candidates and the ranked walk for **every** idle prisoner before
**any** of them acts. That is safe precisely because it reads no claim, no
position and no other prisoner.

### 4. Nothing is stored, and no save version moves

Both keys are pure functions of state the save already carries: `NeedsComponent`
(persisted verbatim in stored units), the classification group, the incident
override, the room instances and the tick. No RNG stream is registered, drawn
from or reordered; no `Map` or `Set` is walked. **ADR 0029 decision 6 is
untouched and `SAVE_ENVELOPE_VERSION` does not move** — which is what
distinguishes this from alternatives C and D below.

(**`SAVE_ENVELOPE_VERSION` never existed**, here or in ADR 0029, which is
where this sentence took the name from. The constant is `SAVE_SCHEMA_VERSION`,
`src/persistence/save-schema.ts:37`, already declared and already `5` on the
day this was written. The decision is untouched and the wrong name is kept
rather than overwritten, per `docs/AGENT_WORKFLOW.md` §4.)

## Alternatives, with their real costs

**Aggregate misery — `needsPressure`, the mean deficit over all six needs
([ADR 0048](./0048-what-a-sectors-occupants-are.md)). Rejected, and it is the
closest call.** It is already computed, already persisted-adjacent, and already
the number the simulation uses to decide whether a prison riots — which is
exactly why it is wrong here. It is a *whole-prisoner welfare* number, and the
question at a canteen door is not "who is having the worse life" but "who needs
this seat". Keyed on it, a prisoner at forty on four needs (mean deficit ≈ 179)
outranks a prisoner at hunger 0 with everything else full (mean deficit ≈ 43)
for the last meal seat. **A prisoner at hunger 0 and a prisoner at forty on four
needs are not equally entitled to the canteen, and four moderate deficits must
not outrank one crisis.** Decision 1 says the starving one goes first.

**The single worst need — `NEED_MAX − min(level)`. Rejected**, for a narrower
version of the same reason: it ignores the regime block, so in a meal block a
filthy prisoner with a deficit of 255 would outrank a starving one with 245 for
a canteen seat, over a need the block offers no route to. Decision 1's
regime-awareness is free and this throws it away.

**The raw deficit of the need the contended room serves. Rejected as
unimplementable at the point of ordering**, not on merit. It is what decision 1
*reduces to* for any one contended room, but "the need this room serves" is not
known until a target has been resolved, and resolving a target reads the claims
— which decision 3 forbids the key from doing.

**Ordering the selections only. Rejected by measurement**, see decision 2:
prisoners 22 and 23 stayed on 0 showers.

**C — a round-robin cursor per room instance. Not taken**, and ADR 0041 already
gave the reason: it adds per-room state that collides with ADR 0029 decision 6's
argument for keeping use claims out of the save. It remains the only option that
would rotate contenders who are *identically* needy; see open question 1.

**D — a reservation at selection with an expiry. Not taken.** ADR 0029 decision
2 rejected reservation on its own merits and ADR 0041 called this the heaviest
of its four options. Decision 2 above buys most of what it was for — a prisoner
who has walked somewhere is no longer pre-empted by one who has just decided —
without holding anything.

**0 — leave decision 5 as it stands. No longer defensible**, because the
starvation it predicted is now measured: six prisoners at hygiene 0.0 in a
prison whose player built them a shower room.

## Consequences

- **The contended scan has a second iteration order over the population**, which
  is ADR 0020's territory and is why this is an ADR rather than a commit.
- **Cost, measured rather than assumed.** Worst case — every prisoner idle and
  standing on the contended room's anchor, so the whole population is planned
  and sorted every cycle — per reconsideration cycle, two runs of each:

  | population | before | after |
  | --- | --- | --- |
  | 24 | 0.0684 / 0.0623 ms | 0.1112 / 0.0830 ms |
  | 500 | 0.4587 / 0.4867 ms | 0.5234 / 0.5577 ms |
  | 5,000 (`DEFAULT_PRISONER_CAPACITY`) | 4.4558 / 4.1952 ms | 6.1973 / 5.8507 ms |

  A cycle runs once every 20 ticks, so at capacity scale the delta is about
  **+1.7 ms once a second of simulated time**. #288's finding that navigation
  rather than system count dominates the tick is unchallenged by this.
- **The blast radius is one expected value**, which is itself the interesting
  result. `tests/integration/contended-canteen-meal-fallback.test.ts` keeps its
  per-prisoner action counts *to the tick*, canteen and cell alike; only
  `lowestHunger` moves, from `[175.5, 175.5, 175.5, 177.5, 177.5, 177.5]` to
  177.5 six times. The two levels the first three used to lose were 40 ticks of
  hunger decay — two reconsideration cadences of extra delay caused by scan
  position — and the equality is now pinned as well as the value. No pinned
  fingerprint moved: `tests/unit/prisoners-operations-scenario.test.ts` is
  unchanged.
- **ADR 0029 decision 7 commitment 4 gains the guard it never had.** ADR 0041's
  amendment reported *"a mutation violating it deliberately left the whole suite
  green"*. `tests/unit/prisoners-concurrent-room-use.test.ts` now drives the
  refusal through a registry that refuses `claimUse` and asserts the three
  production writes; moving `actionsStarted += 1` above the claim turns it red.
  **The branch is still unreachable from a fixture that only builds a prison,
  and this change did not make it reachable**: `findAvailableForUse` is
  consulted two statements before `claimUseIfNeeded` and nothing runs in
  between, within one prisoner's turn, whichever prisoner's turn it is.
- **The fix is invisible to a player.** No HUD surface requests the projection
  carrying need levels (#104), so only tests can see it — which was ADR 0041's
  stated reason for waiting, and is overtaken rather than answered here.

## What would change my mind

- **An owner ruling that contention should be first-come-first-served**, or that
  a prisoner's standing in the prison should decide it. Then urgency is the
  wrong key and this becomes a scheduling-policy question rather than a welfare
  one.
- **A need whose deficit is not comparable across prisoners.** The key assumes
  every prisoner's `hunger` deficit means the same thing. A future personal
  trait or a per-prisoner need rate would break that, and the honest fix would
  be to normalise before comparing.
- **Evidence that the sort is hot at capacity.** The numbers above are a
  worst-case microbenchmark; a real prison has most of its population
  mid-action. A profile showing the sort mattering in a real session would push
  toward sorting only the prisoners whose best candidate targets a contended
  room, which is the same decision with a narrower input.

## Open questions

### 1. The canteen residue: what to do when the contenders are measurably identical

**Not decided here, and it is the one thing this document does not fix.**

The issue's title says *"under contention the same prisoners lose the same room
for ever"* and implies the canteen is the sharp case. **The measurement says it
is not.** With a six-seat canteen and 24 prisoners, prisoners 12–23 enter it
zero times on all twelve days **both before and after this change** — byte
identical — because all 24 sit at exactly `36300` stored hunger units when each
meal block opens. `action.eat-in-cell` keeps everybody topped up, so there is no
need difference for the key to read, and the tie-break reproduces the old order.

That is arguably the right answer: with the prisoners measurably identical there
is no state-derived reason to prefer either, and no welfare claim between them.
What remains is that a room the player built is used by only half the
population, for ever, which is a *playability* complaint rather than a
correctness one — and `AGENTS.md` says playability counts as correctness here.

> **Amended 2026-08-28 (#435). The two paragraphs above were measured at
> `c00b641` and are no longer a description of the tree — and the difference is
> not small enough to leave unmarked.** Both were taken before
> [ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md) made a
> prisoner *walk* to the room instead of appearing in it. #435's instrument was
> checked against them first, as its brief required, by rebuilding this prison
> exactly — 24 prisoners admitted **in one tick**, one dormitory with 24 beds
> and 24 toilets, a six-seat canteen, **no shower room**, 30,000 ticks — and
> running it on both trees:
>
> | | `c00b641`, where this was measured | `aefd8fc`, today's `main` |
> | --- | --- | --- |
> | canteen entries per prisoner over twelve days | 19 ×6, 20 ×6, **0 ×12** | 8 ×6, 6 ×6, **3 ×12** |
> | stored hunger when the midday meal block opens | **`36300`**, one value for all 24 | three distinct values |
> | lowest stored hunger anybody reaches | 35,500 | **3,500** (17.5 of `NEED_MAX`) |
> | `unmetDemandCycles` | 192 | 342 |
>
> So: the old numbers reproduce **exactly** on the tree they were taken on —
> `36300` and the twelve zeroes are right, and this document's canteen paragraph
> was sound when written. On today's `main` the residue is **not total** (the
> twelve enter three times each rather than never) and its need cost is **not
> nil** (17.5 of 255 against 179.5 before). It is therefore no longer only a
> playability complaint: prisoners at a canteen that is too small now go
> measurably hungrier than prisoners in a prison with **no canteen at all**,
> which reaches 35,700 — because a cell meal costs a rate and a wasted walk to a
> full canteen costs a meal block.
>
> **Nothing was done about it, deliberately.** #435's scope is the instrument;
> the two options costed below are still the options, and whichever is taken now
> has a welfare argument behind it and not only a fairness one. The
> reconstruction is `tests/integration/contended-canteen-substitution-cost.test.ts`,
> which pins today's numbers; the `c00b641` column was taken by running the same
> scenario in a worktree at that commit and is not reproducible from this branch.
>
> One precision, since this document says *"each meal block"*: at `c00b641` the
> single-value reading is per block rather than one value across the day — all
> 24 read `36300` when the midday block opens, and ~`44300` at the other two.

Two ways to rotate them, with their real costs:

- **Option C, the per-room round-robin cursor** (ADR 0041's rejected
  alternative). Fixes it exactly, and collides with ADR 0029 decision 6: a
  cursor is per-room state, and either it goes in the save — a schema move #288
  prices — or a reload silently resets the rotation, which is a divergence
  between a continuous and a restored session of exactly the kind
  `docs/DETERMINISM.md` enumerates.
- **A tick-derived rotation of the tie-break** — ordering ties by something like
  `(index − f(tick)) mod N` instead of by `index`. **This is a new alternative
  none of ADR 0029, ADR 0041 or this document has costed**, and it is
  attractive because it stores nothing: the tick is already in the save, so the
  order stays a pure function of state, total, and identical on every machine.
  Its costs are real and unmeasured: `N` is the size of a set that varies cycle
  to cycle, so the modulus is arbitrary and a prisoner released changes
  everyone's rotation; and it deliberately introduces churn into an order that
  is otherwise stable, which no other part of this kernel does.

Both need the substitution counter of **#435** to be measurable at all — see
open question 3, which is now closed and gives them one.

### 2. The determinism guard is a regression guard, not a demonstrated tripwire

`tests/determinism/contended-scan-order.test.ts` asserts that a save and restore
of the contended prison hands the shower heads to the same prisoners as a
continuous run over 6,000 further ticks, and that two runs from one seed agree.
**Four mutations were tried against it and all four survived**: perturbing the
urgency key by `actionsStarted % 7` and by `(actionsStarted % 7) * 500`, caching
the key in a module-level `Map` that outlives the runtime, and ordering the
arrivals by the path request id's sequence suffix — the exact hazard
`docs/DETERMINISM.md` names under *"Per-system `requestSequence` counters are
outside snapshots"*.

Recorded here rather than dropped, because #375 is about guards that look like
coverage and are not. **The reason they survived is the determinism argument
itself, and it is worth more than the mutations would have been:** the only
state `ActionSystem` holds that no snapshot carries is its four metric counters
and `requestSequence`, and every one of those is *constant across the prisoners
of a single pass*, because both keys are computed in the collection walk before
any prisoner acts. A counter added to them shifts every entry by the same amount
and cannot reorder anything. There is no per-prisoner unsaved state in this
system to build a divergent key out of.

So the file fails the day something per-prisoner and unsnapshotted is added to
`ActionSystem`, and holds by construction until then. **If that argument is ever
falsified, this open question is where to look.**

One further survivor, in the same spirit: bypassing `needUrgency`'s
providability filter leaves the *integration* fixture green to the tick, because
in that prison the prisoners the recreation plateau flattens are the ones with
no shower claim to press anyway. The filter's only guard is the unit case
*"separates two prisoners whose unservable first choice is identically maxed
out"* in `tests/unit/prisoners-utility-ai.test.ts`.

### 3. Nothing counts a prisoner who was served worse, so the canteen half cannot be watched

**#435.** `unmetDemandCycles` counts a prisoner who did nothing, and in a housed
prison it is 0 whether twelve prisoners are being quietly downgraded from the
canteen to their cell at every meal or nobody is. Measuring the residue in open
question 1 required a test-only per-prisoner, per-action tick counter. The
shower half needed no such instrument, because hygiene has no substitute and the
need level *is* the readout. #435's substitution counter is the production
answer and is the natural first consumer of any decision taken on open question
1.

> **Closed 2026-08-28. The counter exists**, and the paragraph above is kept
> because it is the specification it was built to:
> `ActionMetrics.substitutionCycles` and `contendedSubstitutionCycles`, with the
> per-prisoner breakdown in `SubstitutionRecordComponent`, split on
> `RoomInstanceRegistry.hasPlaceForUse` — the same providability question
> decision 3 above forbids from reading a claim, asked once per idle prisoner
> per cycle and reused rather than asked twice. No save carries it, nothing
> reads it back into a decision, no version moved, and the contended canteen run
> is byte-identical with and without it. The argument for a count rather than a
> score gap, and for the per-prisoner half, is in
> [ADR 0041](./0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
> open question 2's amendment; the run is
> `tests/integration/contended-canteen-substitution-cost.test.ts`.
>
> **One sentence above no longer describes the tree.** *"In a housed prison it
> is 0"* is true of `unmetDemandCycles` in an uncontended prison and false in a
> contended one since
> [ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md): a prisoner
> who walks to a canteen and is turned away at the door counts an unmet cycle
> for the wasted journey. Measured on the reconstruction in *open question 1*'s
> amendment below — 342 unmet cycles with a six-seat canteen, **0** with a
> canteen that seats everybody and **0** with no canteen at all. So the metric
> is not quite blind any more; what it still cannot do is say *who*, which is
> the half this issue was about.
