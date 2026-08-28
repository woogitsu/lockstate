# ADR 0041: What happens when a prisoner's chosen action has nowhere to go

## Status

**Accepted, 2026-08-26 — by the owner's explicit delegation. The owner did not
read this document.** The owner's instruction was *"rób tak żeby było dobrze,
działaj autonomicznie, rób research i sam decyduj"* ("make it good, act
autonomously, do the research and decide yourself"). **That is a real approval of
the judgement delegated and not of the text.** What was delegated is that someone
research and decide, not this option over the alternatives. The argument below is
the whole of the warrant, and **a reader who disagrees should treat the decision
as open** — the same standing ADRs 0034 through 0040 carry.

**The number was assigned centrally** after the research returned. This document
renumbers without argument if an unmerged branch holds 0041.

## Context

ADR 0029 decision 5 accepted an unfairness rather than solving it, on two stated
grounds: that a fix would be a per-tick ordering decision over the whole
population (ADR 0020's territory), and that **"it is also not yet observable"**.
Its revisit condition was *"when phase 4 makes canteens and shower rooms real,
the readout that shows a starving need is what should trigger this"*.

ADR 0029's amendment of 2026-08-26 records that both consequences it rested on
were false, that phase 4 shipped at `b097e70` (#384), and that the revisit
condition **cannot fire on its own terms** — it is anchored on a need readout no
HUD surface requests. It also carries the measurement. What follows is what that
measurement, plus one further reading, decides.

### What the code does today

`ActionSystem.beginNextAction` (`src/simulation/prisoners/action-system.ts:316-332`)
does three things in order:

1. `DEFAULT_ACTIONS.filter(...)` by **regime category only** (`:320`) — not by
   whether the action's target can resolve.
2. `selectBestAction(this.needs, index, legalActions)` (`:322`) returns **one**
   answer. It scores `deficit × effect` (`utility-ai.ts:16-24`) with **no
   availability term**.
3. `const target = this.resolveTargetInstance(entityId, chosen); if (target ===
   undefined) { this.unmetDemandCycles += 1; return; }` (`:328-332`).

**There is no second candidate.** A prisoner whose best action cannot resolve a
target does nothing that cycle and reconsiders from the same state next cycle,
which produces the same answer.

### The consequence, and it is larger than contention

`action.eat-meal` targets `room.canteen` and gains `hunger: 4` per tick;
`action.eat-in-cell` targets `own-accommodation` and gains `hunger: 3`
(`src/simulation/prisoners/actions.ts:48-54`). Both are category `meal`. On the
same need with the same deficit, **`eat-meal` outscores `eat-in-cell` always**.

So `eat-meal` is chosen whether or not a canteen exists, and when none does, the
prisoner returns at step 3 and eats nothing. **A prison of cells with no canteen
starves every prisoner, permanently** — and that is not an edge case, it is the
ordinary state of every prison before its first canteen is built.

**`action.eat-in-cell` has therefore never executed, in any configuration.** Four
independent lines converge on that:

- The reading above: nothing can select it while `eat-meal` is legal, and
  `eat-meal` is legal in the same regime blocks.
- ADR 0029's amendment run — 24 prisoners, 24,000 ticks, a canteen seating six —
  reports `actions ever performed by anybody: ["action.eat-meal", "action.sleep",
  "action.use-toilet"]`. Eighteen prisoners ate nothing and **not one of them
  fell back to a cell meal**, though every one of them had a bed and therefore an
  `own-accommodation` target.
- `tests/integration/furnished-prison-loop.test.ts:410` asserts
  `expect(performingTicks['action.eat-in-cell']).toBeUndefined()` outright, and
  calls it "the interesting absence".
- The repository's own cell-only measurement, arithmetically. New prisoners start
  at `NEED_MAX` (`needs.ts:103`, `reset` sets every need to the scaled maximum)
  and hunger decays at `0.05` per tick (`needs.ts:52`).
  `tests/integration/furnished-cell-loop.test.ts:296-298` measures hunger at
  **25.0** at tick 4,800 in a prison with **no canteen**. 255 − 25.0 = 230
  levels, which is exactly 4,600 ticks of pure decay — admission at tick 200 and
  **not one tick of eating**. A single `eat-in-cell` block is `minDurationTicks:
  40` × 3 = 120 levels; there is no room in that number for even one.

**That last one is a defect in a comment, and it is the reason this went
unnoticed for so long.** `furnished-cell-loop.test.ts:298` explains the 25.0 by
saying *"hunger is nearly exhausted because `action.eat-in-cell` gains 3 a tick
against a canteen's 4"* — attributing the number to a mechanism that never ran.
That file records no per-action performing ticks, so nothing in it could have
caught the difference. A measurement explained by a mechanism nobody checked had
run is the same shape this repository keeps finding, one layer further in.

### Why nothing surfaces any of it

`hunger` has no consumer. Grepping `src/` for it returns the save schema, a
migration note, a locale label and the decay table. **`safety` is the only need
with a downstream reader** (`new-session.ts:616` → `IncidentTriggerSystem`).
Nothing kills, disciplines or reports a starving prisoner, and no HUD surface
requests the projection that carries need levels. The starvation is total and
currently invisible — which is why it is a decision about correctness rather than
an incident.

## Decision

**1. A prisoner whose chosen action cannot resolve a target falls back to the
next-best legal action in the same cycle.** `beginNextAction` ranks the legal
candidates and walks them in order until one resolves, instead of taking
`selectBestAction`'s single answer and giving up.

**2. Ordering the contended scan by need urgency is the tracked successor, not
part of this decision.** It is recorded here as the answer to ADR 0029 decision
5's fairness half and is deliberately not taken now — see below.
**Tracked as issue #434**, which carries the three obstacles this document named:
which need decides urgency, the `O(N log N)` per-cycle cost, and the determinism
constraint ADR 0020 and ADR 0029 decision 7 put on a second iteration order.

> **Amended 2026-08-28. Decision 2 has been taken, so "is deliberately not taken
> now" is no longer a description of the tree.** `ActionSystem.update` runs three
> passes: `performing` in ascending entity index, then the arrivals and then the
> idle selections, both ordered by descending need urgency with ascending entity
> index as the tie-break. The sentence is marked rather than rewritten because
> what it recorded — that ADR 0041 bought its fix *without* touching ADR 0020's
> territory — is still a true statement about ADR 0041, and is the reason this
> was a separate change.
>
> Three things a reader of the paragraph above now needs, and the third is not
> what this document predicted:
>
> - **Which need decides urgency is answered, and the answer is owed its own
>   ADR.** The key is `needUrgency` (`src/simulation/prisoners/utility-ai.ts`):
>   the `scoreAction` of the highest-ranked candidate *the prison can actually
>   provide*, which is the deficit of the need at stake rather than an aggregate
>   of the prisoner's misery. The argument is written at that function and in the
>   commit; **the ADR recording it has not been written, because ADR numbers are
>   assigned centrally and none had been assigned when the work landed.** Until
>   it exists, this bullet and that docblock are the whole of the warrant, and a
>   reader who disagrees should treat the choice as open.
> - **The `O(N log N)` cost was measured rather than assumed.** Worst case —
>   every prisoner idle and standing on the contended room's anchor, so the whole
>   population is planned and sorted every cycle — the reconsideration cycle
>   goes from 0.062-0.068 ms to 0.083-0.111 ms at 24 prisoners, 0.46-0.49 ms to
>   0.52-0.56 ms at 500, and 4.20-4.46 ms to 5.85-6.20 ms at
>   `DEFAULT_PRISONER_CAPACITY`-scale 5,000. A cycle runs once every 20 ticks, so
>   the 5,000-prisoner delta is about +1.7 ms once a second of simulated time.
> - **It fixes less of the canteen than this document's Consequences imply, and
>   more of the shower.** Where the contending prisoners are in *identical* need
>   states the key has nothing to separate them by and the tie-break reproduces
>   the old order exactly — and a canteen is that case, because
>   `action.eat-in-cell` keeps everyone's hunger topped up. Measured at
>   `c00b641`: 24 prisoners against a six-seat canteen all sit at the same stored
>   hunger unit as each meal block opens, and prisoners 12-23 enter the canteen
>   zero times both before and after. `action.shower` has no cell-side sibling
>   (ADR 0054 decision 1), so it is where the ordering decides a *need*: the two
>   highest-index prisoners go from 0 showers in 40,000 ticks to six each, and
>   the worst hygiene anyone touches goes from 0.0 to 96.8.
>   `tests/integration/contended-shower-fairness.test.ts` is the run.

## Alternatives, with their real costs

**A — the in-cycle fallback (decided).** Fixes the starvation, in the base case
and the contended one alike. **No new state, no new iteration order, no RNG, no
save key**, so ADR 0029 decision 7's four determinism commitments hold unchanged
and no persisted shape moves. It does not fix fairness: under contention the same
six still get the better meal for ever. It does nothing for `action.shower`,
`action.classroom-education` or `action.common-room-recreation`, which have no
`own-accommodation` sibling in `DEFAULT_ACTIONS` at all — those still starve
under contention, and only B helps them.

> **Amended 2026-08-26, after this was built. Two sentences above are wrong, and
> the base case is stronger than this document claimed.**
>
> **"It does nothing for `action.shower` …" runs two things together.** It is
> true of the *need*: `action.shower` has no `own-accommodation` sibling and
> hygiene is still unserved. It is false of the *prisoner*, who stops standing
> still. Measured in `tests/integration/furnished-cell-loop.test.ts`, the regime's
> three hygiene blocks used to be spent idle after `action.shower` failed to
> resolve; under the fallback the prisoner takes `action.use-toilet` instead and
> **bladder moves 212.6 → 247.8**. The same cause moved four counts in
> `furnished-prison-loop.test.ts`. Only B fixes the hygiene *need*; the fallback
> already fixes the wasted cycle.
>
> **The starvation is not a contention effect, and this document framed it partly
> as one.** The first per-action measurement in a cell-only prison — the thing
> the "what would change my mind" section below said nobody had run — shows a
> prisoner **entirely alone**, with no contention of any kind and
> `routeFailures: 0`, eating nothing across 24,000 ticks and sitting at hunger
> 0.0 for 18,902 of them. Contention was where this was noticed, not what caused
> it. After the fix the same prisoner performs 1,600 ticks / 40 completions of
> `action.eat-in-cell` and never falls below hunger 179.5, while the canteen
> control still shows `eat-in-cell` at 0/0 — a fallback, not a replacement.
>
> **One test had pinned the defect as a feature**, which is worth recording
> because it is the shape this repository keeps finding.
> `tests/integration/incident-consequence-loop.test.ts` asserted `hardSleep === 0`
> and called it the mechanic — *"a prisoner on the restricted timetable stops
> resting"*. It was not the timetable. The high-risk regime allows `meal` for
> 2,200 of 2,400 ticks a day, so that prisoner selected `action.eat-meal` on
> essentially every reconsideration, failed, and started nothing at all. Measured
> after the fix, the direction reverses: reclassified `[973, 1000, 0, 965, 1000,
> 0]` against clean `[867, 1000, 0, 847, 1000, 0]`.
>
> **One commitment is preserved and unguarded, reported rather than claimed.**
> ADR 0029 decision 7 commitment 4 — a refused claim mutates nothing — is held in
> the code, but a mutation that violates it deliberately left the whole suite
> green. The branch is unreachable in the current single-threaded ascending scan:
> `findAvailableForUse` is consulted two statements earlier and each claim is
> visible to the next prisoner in the same walk, so a prisoner reaching
> `claimUseIfNeeded` is never refused — the losers are refused at the *selection*
> gate instead. It is defence in depth against a case a parallel scan would make
> reachable, and nothing in the suite would catch its removal.

Its blast radius is real and must be paid deliberately: it moves
`tests/unit/prisoners-operations-scenario.test.ts`'s fingerprint, and
`tests/integration/furnished-prison-loop.test.ts:410` **asserts `eat-in-cell` is
absent on purpose**. That assertion is not to be deleted quietly — it should be
inverted with the reason written beside it, because what it pinned was a defect
observed and mistaken for behaviour.

**The product objection, and why it does not survive.** A fallback makes a
canteen a *preference* rather than a *requirement*, which is a game-design change
and not obviously the owner's intent. It does not survive because the
alternative is not "a canteen is required" — it is "prisoners never eat". A
requirement the game never enforces, never reports and never resolves is not a
design, and `action.eat-in-cell` exists in the content catalogue precisely to be
the answer when no canteen stands. This restores authored content to
reachability rather than adding a concept.

**B — order the contended scan by need urgency (tracked successor).** Fixes both
starvation and fairness and generalises to every contended room. But it is
exactly the per-tick, population-wide ordering decision ADR 0029 decision 5
declined; it adds a second iteration order over the population at `O(N log N)`
per cycle; and it forces a question this document should not answer alone —
urgency by *which* need, when a prisoner is hungry and filthy at once. **Deferred
on cost and scope, not on merit**, and it is the right decision to take when a
need readout ships, because that is when the unfairness becomes visible to a
player.

**C — a round-robin cursor per room instance.** Fairness without a need model,
but it adds per-room state that collides with ADR 0029 decision 6's argument for
keeping use claims out of the save. Not taken.

**D — a reservation at selection, with an expiry.** Fixes incumbency — the
measured mechanism by which the losing set never reopens — but not index order,
and it is the heaviest of the four. Not taken.

**0 — leave decision 5 as it stands.** Its stated justification ("not yet
observable") is measured false, and the base case does not involve contention at
all, so this option no longer describes a defensible position.

## Consequences

- `action.eat-in-cell` becomes reachable content for the first time.
- A prison with no canteen feeds its prisoners, at the lower rate the content
  already authors.
- Under contention the losers eat a worse meal instead of nothing. **The
  unfairness ADR 0029 decision 5 accepted is unchanged**, and stays open as B.
  *B was taken on 2026-08-28 (issue #434); see the amendment under Decision 2 for
  what it did and did not close.*
- `furnished-prison-loop.test.ts:410`'s deliberate absence assertion inverts, and
  `furnished-cell-loop.test.ts:298`'s explanatory comment must be corrected: its
  number was pure decay, not a weaker meal.
- Determinism is unaffected by construction — same population order, same
  candidate order, no new randomness — and must be shown so, not asserted.

## What would change my mind

- ~~**A measurement showing `eat-in-cell` does execute somewhere today.**~~
  **Discharged.** This was the document's stated weakest claim: four converging
  readings and one arithmetic fit, with nobody having run a cell-only prison with
  per-action counters. It has since been run, at 1, 4 and 24 prisoners over
  24,000 ticks with no canteen zoned: `action.eat-in-cell` is 0 ticks and 0
  completions for every prisoner, and `actions ever performed by anybody` is
  `["action.sleep","action.use-toilet"]`. The claim held, and the single-prisoner
  case made the base half **stronger** than argued here rather than weaker — see
  the amendment above.
- **An owner ruling that a canteen is meant to be a hard requirement**, with
  starvation as a designed pressure. Then A is wrong and the honest fix is a
  readout plus a consequence for `hunger`, and `action.eat-in-cell` should be
  deleted from the catalogue rather than made reachable.
- **Evidence that walking the candidate list is hot.** `DEFAULT_ACTIONS` is small
  and the walk stops at the first resolution, so I expect this to be free; a
  benchmark showing otherwise would push toward filtering candidates by
  resolvability before scoring, which is the same decision with a different
  implementation.

## Open questions

**All three are now tracked, so none of them is waiting on this document to be
re-read.** 1 and 3 are one issue because answering either answers the other:
#436. 2 is #435.

> **Amended 2026-08-28. Questions 1 and 3 are no longer open, and the paragraph
> above is now only half true.** It says all three are *tracked*; two of them
> have since been *answered*, by
> [ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md),
> which took #436 and #440 together and shipped at `2e3b166`. The sentence is
> marked rather than rewritten because the reason it was written — that a reader
> of this document should not have to re-derive where the questions went — is
> exactly why it now has to say where they went *to*.
>
> - **Question 1 is answered by ADR 0054 decision 4: the walk stays unbounded.**
>   An action fulfilling nothing scores exactly 0, so `action.free-association`
>   ranks last and the walk cannot reach it while anything better resolves. What
>   was wanted was a terminal, not a limit. `ActionSystem.beginNextAction`'s
>   docblock carries the answer.
> - **Question 3 is answered by ADR 0054 decision 1: `hygiene` and `recreation`
>   are room-gated by design, and get no cell-side siblings.** That is the
>   *opposite* of the answer this document gave for `hunger` one day earlier, and
>   ADR 0054 says at length why the difference is not inconsistency: ADR 0048
>   gave an unmet need a downstream reader in between, so the "requirement the
>   game never enforces" this document refused no longer describes the state.
>   Read ADR 0054's amendment before relying on that sentence — the enforcement
>   is measurably narrower than its main text claims.
> - Question 2 is still open and still #435.

1. **Should a fallback be bounded?** Walking the whole list means a prisoner
   always does *something* if anything resolves. Whether that is right, or
   whether some actions should be all-or-nothing, is not decided here.
2. **What should `unmetDemandCycles` count now?** It currently counts a
   prisoner who did nothing. After A it should probably count a prisoner who got
   a worse action than the one they wanted, which is a different and more useful
   number — and the readout B waits on is the natural consumer.
3. **Do `action.shower` and the two recreation actions want cell-side
   siblings**, or is their contention B's to fix? They have no fallback at all
   today, so A leaves them exactly as they are.
