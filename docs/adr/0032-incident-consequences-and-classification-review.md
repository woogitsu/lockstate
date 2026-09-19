# ADR 0032: What an incident costs the prisoner who was in it, and how a classification tier moves

## Status

**Accepted, 2026-08-26.** The five decisions are approved as written, unchanged
by the approval, and the five things this document says it does not settle stay
unsettled rather than being approved by implication.

What the approval turns on, so it is not mistaken for a rubber stamp: the
disciplinary record is *derived* from state the V5 payload already carries, so
this decision costs no save version and leaves V6 free for the incident-response
restore; review is an **absolute recomputation** rather than a one-tier step, so
a tier does not depend on how many times the system happened to run; there is no
RNG anywhere in it; and the tier scale and the housing group are two axes with
the group derived, which is the shape #78 asked for. Those four together are why
this is approvable without seeing it played — none of them can drift with a
schedule change.

Not approved, and named here because the ADR names them: the four tiers still
have no vocabulary, so a player sees a number. That is content rather than
mechanism and it does not gate the decision.

This ADR arrives **with the change that implements it**, which is the shape
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md) §2 names as fragile and the same shape
ADR 0029 and ADR 0031 arrived in. That file's rule is that such an ADR gets its
queue entry in the same commit; **this one does not, and the reason is not that
the rule was overlooked.** `docs/adr/STATUS-QUEUE.md` was explicitly out of this
change's scope — it was held by other work in the same hour — so the queue entry
is *owed*, and the pull request that carries this document says so and quotes the
entry it would have added. Whoever holds that file next can paste it.

**On the number.** 0032 was the stated next free number in
[`README.md`](./README.md), and that is a claim about *merged* history rather
than a reservation. The open pull requests were enumerated before it was taken
(2026-08-26): three were open, one of them holding `0030`
(`0030-restoring-an-interrupted-incident-response.md`, the incident-response
restore change) and neither of the other two carrying an ADR at all. So 0032 was
free. **If an unmerged branch turns out to hold 0032, this document renumbers**
— filename, heading, index row and every citation — rather than arguing about
who allocated first. That pre-commitment is why the last collision cost a
`git mv` instead of an argument, and it is made here for the same reason.

## Context

Two issues, and they are one seam.

**Issue #80** records that the consequence loop is open at both ends.
`src/simulation/incidents/` runs triggers, response, escalation, gangs, escape
attempts and sector risk, and resolves incidents to terminal states with
outcomes. `ConfiscationLedger` records every contraband find with the holder's
id. Then nothing happens to the person: `grep -rni 'adjudicat\|sanction\|disciplinar' src/`
returns four hits and all four are comments deferring the question elsewhere. A
prisoner can start a riot, be found with a weapon, attempt escape — and their
situation the next tick is identical to someone who has done none of those
things.

**Issue #78** records the other end. `classifyPrisoner` collapses a four-value
`RiskTier` into a boolean at its last step, and once assigned the tier never
changes. So the facility is organised around a per-person classification that
cannot move, which means there is nothing for a consequence to move.

They are one seam because an incident's most natural consequence *is* a change in
classification, and classification is the thing #78 wants to make move. Building
either alone produces something inert: a disciplinary record nothing reads, or a
review with no evidence to review.

**Three things already exist and nothing joins them.**

- `riskTier` is a populated, persisted per-prisoner field
  (`PrisonerRecordComponent.riskTier`, a `Uint8Array` slot carried in the V5
  payload's `simulation.prisoners.riskTier`).
- `cell-sharing.ts`'s `rateCellSharing` already reads it: its one term is the
  worst classification distance across a cell's live occupants, consulted by
  `RoomInstanceRegistry.findBestAvailable` on the intake allocation path.
- Incidents and contraband finds already fire and already name the prisoner
  involved — `IncidentRecord.participantIds` and
  `ConfiscationEvent.foundAtHolder`, both persisted.

**And the cell-sharing half went live on 2026-08-26.**
[ADR 0027](./0027-cell-sharing-assessment.md) was accepted as a mechanism under
the precondition that co-occupancy was unreachable, because `RoomZoningService`
registered every instance with `capacity: 0`.
[ADR 0028](./0028-object-placement-and-derived-room-capacity.md)'s object
placement ended that: two beds in one zoned 3x3 `room.cell` give
`residentCapacity: 2`, two `AdmitPrisoner` commands are accepted, and
`occupancyOf` is 2. So a classification that *moves* now changes where prisoners
get housed, which it could not do a week ago — and ADR 0027's own Consequences
section named this ADR's subject as the thing that would turn its placement
filter into a feedback loop.

[ADR 0017](./0017-money-primary-resource-model.md) decision 3's consequence
paragraph is the other half of the motive: *"income scales with population, and
so does trouble."* `StateIncomeSystem` built the population half. This is the
trouble half.

## Decision

### 1. A disciplinary record is **derived**, never stored — so no save version moves

A prisoner's disciplinary record is a fold over evidence the save already
carries: `IncidentLog`'s terminal records and `ConfiscationLedger`'s events,
both of them persisted sections of the V5 payload. `buildDisciplinaryIndex`
recomputes it; nothing accumulates it.

This is the decision the rest of the ADR is built on, and it is taken for three
reasons in descending order of force.

- **It is what makes the change fit an existing save.** A recorded record is a
  new persisted per-prisoner section, a schema version and a migration.
  `SAVE_SCHEMA_VERSION` is 5, and **V6 is already contended by open pull request
  #361**, which bumps it to carry the incident response a save was taken during.
  A second, competing V6 is not a thing this change is entitled to create. So the
  alternative was not "recorded costs more" but "recorded is queued behind
  somebody else's branch".
- **It is derivable exactly, with nothing invented.** The one datum a review
  needs that is not on the record is *when the prisoner was classified*, and it
  is recoverable: `IntakeSystem` writes
  `sentenceEndTick = tick + sentenceLengthTicks` at the `'classification'`
  stage, and both operands are persisted, so the difference is that tick.
  `classifiedAtTickOf` is that arithmetic run backwards, and it returns
  `undefined` rather than guessing in the one case it cannot survive — a
  `sentenceLengthTicks` large enough to wrap the `Uint32Array` sum, which
  `admitPrisonerSchema` permits.
- **Derived is the stronger determinism story.** A restore reproduces the record
  rather than remembering it, so there is no second copy to disagree with the
  logs, and no migration that has to invent a history for a save written before
  the feature existed.

**What this deliberately does not settle** is ADR 0027 question 1 in general. A
*cell-sharing rating* recorded at the moment of placement is a different object
from a disciplinary record: it is a snapshot of what was known at a decision, it
is the thing an audit trail exists for, and it is the only form that can become
*stale*. This decision says a **disciplinary** record is derived, and says
nothing about a placement rating. See §*ADR 0027's three questions* below.

### 2. A finding is automatic on a terminal incident, and the discretionary part is deferred

Issue #80 asks the design question outright — *"Is adjudication a player
decision, a staff-role task, or automatic with player override?"* — and asks for
it to be settled first rather than during.

**Decided: a finding is automatic, and it attaches when the incident reaches a
terminal state.** An open incident is an event in progress; charging a prisoner
while guards are still walking towards it would make the consequence arrive
before the thing that caused it has an outcome.

The argument for automatic is not that the alternative is expensive. It is that
**a finding and a sanction are different decisions, and only the second is
discretionary.** In real practice the classification consequence of a finding is
administrative: once a finding stands, the score moves. What a governor decides
is the *sanction* — solitary, loss of association, loss of privileges — and every
one of those is unbuilt (see §*What this does not settle*). So the discretionary
decision is deferred along with the thing it decides, rather than being
manufactured for the one consequence that is not discretionary.

Two honest limits, stated because they bound what this decision is worth.

- **Every participant of a terminal incident carries the finding, and the log
  names participants rather than culprits.** `IncidentTriggerSystem` fills
  `participantIds` from the sector's occupants, so it is "who was there".
  `injuredEntityIds` cannot narrow it and it is worth recording why rather than
  leaving it to be tried: `IncidentResponseSystem.lapse` injures **every**
  participant and its resolved path injures **nobody**, so that list is a
  function of the response and carries no information about culpability at all.
  Identifying a culprit *is* adjudication.
- **A player override needs a command.** `src/simulation/protocol/commands.ts`
  carries nine commands and one of them concerns a prisoner (`AdmitPrisoner`).
  An override needs a new command type, its codec case, a handler branch and a
  decision about whether a review *waits* for a human — and commands sit in the
  kernel's snapshotted pending queue, so a new type touches ADR 0009's
  replay-verification surface. That is the same cost ADR 0027 question 2 prices,
  and it is deferred to the same place.

### 3. The tier scale and the housing group are **two axes**, and the group is derived

Issue #78 asks this directly: *"decide whether person-classification and
room-grade are the same axis or two, and say which."*

**Two.** The person's classification is the four-value `RiskTier`. The housing
group is `CLASSIFICATION_GROUP_IDS`, and a group is a `RegimeSchedule` — a
gapless daily timetable that `assertGaplessSchedule` validates at module load.
The group is **derived** from the tier by one function,
`classificationGroupIdForTier`, called from both the intake draw and the review,
so the two cannot drift about what tier 3 means.

The tier scale stays at four and the group stays at two, and both are deliberate:

- **Four tiers, not five.** `RiskTier` is already four-valued, populated,
  persisted, and already read by `rateCellSharing`. Widening it is a save change
  (the `Uint8Array` slot would hold values the schema's `byteSchema` permits, but
  every consumer's clamp is written against 3) for a granularity the mechanic
  does not yet use.
- **Two groups, not four.** A third group is a third authored timetable **and** a
  message key under `src/content/simulation-message-keys.ts`'s completeness gate.
  That is content work, and #78 is explicit that the tier count "is a design
  decision, not a copy" — so is the regime count, and this change is not the
  place to author three new daily schedules.

`src/content/security-grade-catalog.ts`'s five *room* grades are a third axis
and are untouched here. #78 asks whether person-classification and room-grade are
the same axis; the answer is no, and this ADR does not join them.

### 4. Review is **absolute recomputation** on a fixed schedule, with no RNG

`ClassificationReviewSystem` (`prisoners.classification-review`, order 55) runs
once every `CLASSIFICATION_REVIEW_INTERVAL_TICKS` and rewrites `riskTier` and
`classificationGroupIndex` for every prisoner due a review.

**Absolute, not incremental.** The review returns the tier the evidence supports
*now*; it does not step the recorded tier one notch towards it. The step rule
reads better and is closer to how a real board behaves, and it was rejected on a
determinism argument: it makes the recorded tier a function of **how many times
the review system happened to run**, so two sessions at the same tick with the
same evidence could hold different tiers because one of them was saved and
restored across a scheduled review, or because the interval was retuned between
builds. An absolute recomputation is idempotent — running it twice at one tick
with one evidence set writes the same values — so nothing about the schedule can
leak into the outcome.

**No RNG at all**, and that is a decision rather than an omission. The one draw
in the prisoner slice is `classifyPrisoner`'s screening variance on the
`prisoners.classification` stream. A draw taken in a review would advance that
stream on a tick that has nothing to do with an admission, shifting the
classification of every prisoner admitted afterwards — a review of one prisoner
changing another prisoner's intake is exactly the kind of coupling a named-stream
discipline exists to prevent.

**Four named factors, summing to the score**, so the answer to "why is this
person maximum security" is the object rather than a re-derivation:

| Factor | Range | What it is |
| --- | --- | --- |
| `sentence` | `0..+1` | The same long-sentence term intake applies. |
| `intakeHistory` | `0..+2` | `priorIncidentsAtIntake`, saturating exactly as intake's term does. |
| `findings` | `0..+3` | Authored disciplinary points, capped. |
| `cleanConduct` | `-2..0` | One point back per clean period since the last finding. |

The first two are **the terms intake already weighed, applied unchanged**. A
review that re-decided them would move every prisoner's tier at their first
review for reasons that have nothing to do with conduct.

**Both caps are what stop the loop dead-ending.** With findings capped at 3 and
credit capped at 2, a prisoner who has done everything can still come down to
one tier above their sentence-and-history floor, and a prisoner who has done
nothing cannot fall more than two below it. An uncapped findings term makes a
long record permanently un-redeemable; an uncapped credit makes every
long-serving prisoner minimal-risk regardless of what they did. Issue #80 asks
for exactly this: *"time without a finding must count for something, or the loop
only ratchets one way."*

**Severity is deliberately not a term.** `IncidentRecord.severity` is a `number`
with no integer guarantee anywhere in its production path, and a float inside a
score that decides a persisted `Uint8Array` value is a determinism hazard bought
for no granularity the four-value tier can use. Points are authored per incident
type in `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE`, as data rather than a condition
chain (`AGENTS.md` boundary 6), with integer surcharges for an incident that
lapsed rather than being contained and for an escape attempt that got out.

**Intake classification becomes provisional**, which is the one existing
behaviour this changes. The screening variance stands until the prisoner has
served a full review period, and the first review then reaches the deterministic
assessment. That is what issue #78 describes — classification is not permanent —
and the variance keeps its meaning: it models a screening at the gate being
imprecise, and a full review correcting it is the point of having reviews.

**Timings are candidate values, not locked balance decisions**, the same standing
`regime.ts` gives `DAY_LENGTH_TICKS`. The interval is 24,000 ticks (ten in-game
days) and the clean-conduct credit period is the same. The system fires on the
last tick of each period and a prisoner is due only once they have served a full
period since classification, so a prisoner classified mid-period is first
reviewed at the end of the next one — the end of the first period they served in
its entirety, which is the rule rather than an off-by-one.

### 5. What a moved tier reaches, and what it does not

Three consumers, all already wired, which is what makes this a small change with
real consequences:

- **The regime.** `ActionSystem` reads `classificationGroupIndex` on every
  reconsideration and resolves a `RegimeSchedule` from it, so a prisoner who
  reaches tier 3 moves onto the high-risk timetable — confined to
  sleep/meal/hygiene for 2,200 of the day's 2,400 ticks. Measured through the
  real commands and kernel in `tests/integration/incident-consequence-loop.test.ts`:
  two identical prisons, identical seed, identical commands, differing only in
  one riot record; need levels are equal at tick 40,000 and by tick 70,000 the
  reclassified prisoner's `sleep` need reads 0 against 1,000 and their `safety`
  need 141 against 1,000.
- **Placement.** `rateCellSharing`'s one term is the worst classification
  distance across a cell's live occupants, so a sitting prisoner's tier moving
  changes where the *next* arrival is housed.
- **The published projections.** `projectPrisonerRoster`,
  `projectPrisonerDetail` and `projectStatusStrip`'s `counts.prisonersHighRisk`
  all carry the tier and the group already. That count could previously only ever
  change on an admission.

**What it does not reach is the HUD, and that is a pre-existing gap rather than
one this change opens.** `prisonersHighRisk` crosses the worker boundary on the
status-counts channel and `hudCountsFromWorkerMessage` drops it, because the
strip has no high-risk chip and there is no prisoner roster panel at all. Adding
one means `src/simulation/presentation/**`, `src/ui/hud/**` and
`src/content/default-locale-en.ts`, all of which were out of this change's scope
and two of which were being edited by other work in the same hour. The mechanic
is observable today through the projection channel the worker already publishes;
the chip is owed.

**The chip was paid on 2026-08-31, and this paragraph is kept because it is the
debt it settles.** Issue #703's fourth owner ruling put `prisonersHighRisk` on
the status strip as its second chip and made the Regime panel's four-row roster
sort by descending tier, so a reclassification this ADR's review system performs
now moves a prisoner to the top of a panel a player is looking at. The
`src/content/default-locale-en.ts` edit the paragraph anticipated turned out not
to be needed: the chip's label is
`classification-group.high-risk.name` — the string
`src/content/simulation-message-keys.ts` already authors for this group, which
the Regime panel's own timetable heading already resolves — so the change added
no player-facing string and needed no owner sign-off for one.

## ADR 0027's three questions

ADR 0027 left three open and this change touches all three. Two are answered in
part and one is not answered at all.

1. **Recomputed or recorded?** *Answered for a disciplinary record: recomputed.*
   §1 gives the reasoning and the cost that decided it. **Not answered for a
   cell-sharing rating**, which is what 0027's question is actually about: a
   rating recorded at the moment of placement is a snapshot of what was known at
   a decision, and nothing here records one. `findBestAvailable` still
   recomputes, still stores nothing, and the audit-trail argument 0027 makes for
   recording is untouched. What has changed is that the question is now
   *load-bearing rather than hypothetical* in a second way: a recorded rating can
   go stale, and a tier that moves is what makes it go stale.
2. **Advisory or binding, and who overrides?** *Not answered.* The rating still
   ranks and refuses nothing, and nothing in `src/` returns the non-finite value
   `findBestAvailable` reserves for "not a permissible placement". §2 answers the
   *adjudication* override question the same way and for the same reason — both
   need a command, and the command surface was out of scope — so the two now
   share one blocker rather than two.
3. **How does a cell-scoped risk reach a sector-scoped trigger?** *Not
   answered, and not touched.* There is still no cell-to-sector mapping:
   `RoomInstance` carries an `anchorTile` and no sector field. Nothing here adds
   one, and nothing here needs one — the consequence path runs the other
   direction, from a sector-scoped incident to a per-prisoner record.

## Consequences

- **The loop closes and both directions work.** Behaviour → finding →
  classification → conditions → opportunity for better or worse behaviour, with
  clean time as the return path. Measured: one lapsed riot takes a prisoner from
  tier 0 to tier 3 and the high-risk regime at their next review, then back to
  tier 2 one credit period later and tier 1 at the cap.
- **No save version moves**, and V6 stays free for #361.
- **One new system in the kernel's declared execution order**, which by ADR 0009
  changes what a recorded command stream produces.
  `tests/determinism/kernel-system-order.test.ts` pins the new order and its
  comment records the ADR 0009 retirement step, which is the same finding the
  two previous insertions reached: this repository ships no challenge
  definitions, so there is no stored submission to invalidate.
- **`IncidentLog` gains a reader, and it is a full scan.** ADR 0027 recorded
  that a per-participant query is a scan of every incident ever recorded and
  that this was unaffordable *on a per-tick allocation path*. This is not that
  path: the fold runs once per review period, for the whole population at once,
  not once per prisoner and not per tick. If the log grows to where ten in-game
  days apart is too often, the answer is a per-participant index in
  `IncidentLog`, not a change to any decision here.
- **`ConfiscationLedger.drain` still has no caller**, and now cannot get one
  without a decision. `drain` was written for exactly the consumer this is
  ("#28, not built yet"), and taking it would destroy the evidence the derivation
  reads. Anything that drains the ledger in future has to carry the record
  forward itself, which is decision 1 reversed and a save version with it.
- **A prisoner still in `accommodation-assignment` is reviewed**, and a group
  change there is safe rather than lucky: `DEFAULT_ACCOMMODATION_POLICY` names
  both housing types for both groups, so `resolveExistingTarget` cannot answer
  `undefined` for a prison that could house them under their old group. The
  terminal `'failed'` stage stays unreachable from a review.
- **`'failed'` prisoners are never reviewed**, because the stage is terminal and
  inert (ADR 0028 decision 8): a tier written there could reach neither a regime
  nor a placement.

## What this does not settle

1. **Sanctions.** Issue #80 asks for solitary placement, loss of association and
   loss of privileges, and none of them exists. Solitary is the sharpest: it is
   an intake *destination* and not a sanction destination — `IntakeSystem` routes
   high-risk *arrivals* to `room.solitary-cell`, and **nothing moves an
   already-placed prisoner anywhere.** That operation does not exist in `src/`,
   in either direction, and a sanction that expires needs both. So the honest
   reading of this change is that it delivers the *classification* consequence in
   full and the *sanction* consequence not at all.
2. **The player's decision.** §2 defers adjudication-as-a-decision and the
   override with it, to the same command surface ADR 0027 question 2 needs.
3. **Tier names and bands.** A number has no vocabulary. Naming the four tiers
   means four message keys under the completeness gate and a HUD surface to show
   them on, and it is only worth doing once there is a panel to explain a score
   in — which is #78's "the panel can explain *why*", and is the same gap §5
   records for the strip.
4. **Whether a review should be visible before it happens.** #78 asks for
   "a schedule the player can see". The schedule is a constant and the assessment
   is answerable on demand (`ClassificationReviewSystem.assess`), so both halves
   exist as data; neither is projected.
5. **Programmes and traits.** #30's programme completion and #39's traits are
   both named by #78 as score inputs. The factor list is where they attach and
   the signature does not move, which is the same standing ADR 0027 gives
   `rateCellSharing`'s term list.
