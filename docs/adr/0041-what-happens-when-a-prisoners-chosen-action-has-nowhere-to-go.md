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

## Alternatives, with their real costs

**A — the in-cycle fallback (decided).** Fixes the starvation, in the base case
and the contended one alike. **No new state, no new iteration order, no RNG, no
save key**, so ADR 0029 decision 7's four determinism commitments hold unchanged
and no persisted shape moves. It does not fix fairness: under contention the same
six still get the better meal for ever. It does nothing for `action.shower`,
`action.classroom-education` or `action.common-room-recreation`, which have no
`own-accommodation` sibling in `DEFAULT_ACTIONS` at all — those still starve
under contention, and only B helps them.

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
- `furnished-prison-loop.test.ts:410`'s deliberate absence assertion inverts, and
  `furnished-cell-loop.test.ts:298`'s explanatory comment must be corrected: its
  number was pure decay, not a weaker meal.
- Determinism is unaffected by construction — same population order, same
  candidate order, no new randomness — and must be shown so, not asserted.

## What would change my mind

- **A measurement showing `eat-in-cell` does execute somewhere today.** My case is
  four converging readings and one arithmetic fit; I did **not** run a cell-only
  prison with per-action counters, because the existing probe would not build
  without a canteen and the fix was not worth the detour. If it does execute, the
  base-case half of this decision collapses and only the contention half remains,
  which is B's territory rather than A's.
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
