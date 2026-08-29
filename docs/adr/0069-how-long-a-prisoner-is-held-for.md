# ADR 0069: How long a prisoner is held for

> **0069 was assigned centrally**, after this draft returned, which is the
> practice `AGENTS.md` records and the one ADRs 0038, 0065 and 0066 each
> followed. The draft came back **unnumbered** with the arithmetic written out
> rather than guessing: `docs/adr/README.md` read `Next free number: 0069`, the
> maximum on disk was 0068, and `max + 1` is therefore 0069 — but whether a
> higher number is in flight on an unmerged branch is a fact about branches a
> worktree cannot see, which is the failure mode the index's own history has
> been tracking since 0004. The integrator enumerated `docs/adr/` across every
> unmerged remote `agent/*` branch, found nothing above 0068, and assigned the
> number. `max + 1` was **recomputed off disk at commit time** and gave 0069
> again. Because 0069 is the new maximum it moves the `Next free number` line to
> 0070, and the file, its row and that line land in this one commit.

## Status

**Proposed, 2026-08-29. Not self-approved.**

It implements [issue #535](https://github.com/matmaxalez/lockstate/issues/535)
decision 5, which is the owner's own recorded call and states the outcome it
wants in as many words: *"sentences are drawn from a range at admission, with
some clearly longer than 13,600 ticks."* A single longer constant, a
player-chosen sentence and leaving 10,000 alone were each offered and each
rejected. **What that decision does not settle is what this document decides**:
which RNG stream the draw comes from, which side of the worker boundary it
happens on, and what a save has to carry as a result.

The code implementing it is on `agent/sentence-length-variation`. The evidence,
including every measurement quoted below and the options that were not taken, is
[`docs/research/2026-08-29-sentence-length-at-admission.md`](../research/2026-08-29-sentence-length-at-admission.md).

## Context

### What the code did

`src/main.ts` sent `sentenceLengthTicks: 10_000` with every admission the Intake
panel made — 4.167 in-game days. That constant carried its own justification, and
the justification was correct:

> They are constants and not a random draw for the same reason: `Math.random` on
> this thread would make two runs of the same seed produce different prisoners,
> which is exactly what `docs/DETERMINISM.md` forbids.

[ADR 0050](./0050-when-a-sentence-ends.md) flagged the number in its own *What
this does not decide* — *"one number does become load-bearing that was not …
That is left exactly as it is, and flagged"* — because until a sentence could
end, its length decided nothing.

### What the fixed length cost, measured

A whole mechanic had no reachable case. The grant-withholding schedule
([ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md)) withholds
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` per need a prison leaves
unmet, and the needs it can charge for are the two
[ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
decision 1 rules room-gated: `hygiene`, with no shower room or laundry, and
`recreation`, with no yard, common room or classroom.

Stepping the real `NeedsComponent` through the real `decayNeed` at
`NeedsDecaySystem`'s ten-tick cadence, from the `NEED_MAX` an admission resets a
slot to, the first tick at which each reads at or below
`STATE_INCOME_UNMET_NEED_LEVEL` (51):

| need | rate/tick | first unmet tick | in days |
| --- | --- | --- | --- |
| hygiene | 0.02 | **10,180** | 4.24 |
| recreation | 0.015 | **13,570** | 5.65 |

**Crossing the threshold is not the same as being charged for it.**
`StateIncomeSystem` samples once a day, at `DAY_LENGTH_TICKS - 1`, and only for a
prisoner still holding an occupied place — so the sentence must outlast the first
day boundary *after* the crossing, which is **11,999** and **14,399**. A
HUD-admitted prisoner left at ~10,015. Neither boundary was ever reached, in any
prison, at any seed.

The two figures most often quoted for this — 10,200 and 13,600 — are
`204 / rate`. They ignore the ten-tick batching and `NeedsComponent.get`'s
rounding and are 20 and 30 ticks high. The conclusion they were used to draw is
unaffected.

## Decision

### 1. `AdmitPrisoner.sentenceLengthTicks` becomes optional

Omitted, the simulation draws one. Present, the value is used exactly as given
and **never redrawn**.

A widening rather than a removal, and that is load-bearing rather than
conservative. `queuedCommandSchema` carries a command payload as an opaque
`jsonValue` and `admitPrisonerSchema` is what re-validates it on the way out, so
a queued `AdmitPrisoner` in a save written before this change has to keep
parsing or it would fault a restore. Making a required field optional accepts
every payload the required version accepted. Every fixture in `tests/` that
names a length keeps its exact behaviour for the same reason.

The reverse direction is stated rather than discovered: a save written *after*
this change may carry a queued admission with no length, and a build predating
it would refuse that payload. That is
[ADR 0065](./0065-what-happens-to-a-save-this-build-cannot-read.md)'s case, and
it needs no version bump of its own — `SAVE_SCHEMA_VERSION` names the shape of
the envelope, which has not moved, and a pending command has always been a
payload the current build's own schemas judge.

### 2. The draw is made inside the simulation worker, at the `classification` stage

`IntakeSystem.update`, inside `EntityQuery.execute()`'s canonical
ascending-entity-id walk — the same place and the same order the actor name
(`identity.actor-name`, at `reception`) and the risk tier
(`prisoners.classification`, at `classification`) are already drawn in.

**Not on the main thread**, and the argument is the one `main.ts` already made,
extended one step: it rules out a *seeded* main-thread draw too. The seed a
session is reproducible from is `masterSeed`, held in the worker, and
[ADR 0009](./0009-challenge-verification-strategy.md)'s challenge verification
replays a command stream **from a seed**. A main-thread draw would put a number
into the command that the seed does not determine, so two runs of the same seed
and the same gestures would diverge. The command log would still replay — it
carries the value — but "the log replays" is a weaker guarantee than the one the
game sells. `admitPrisonerSchema` had already reached this conclusion for the
other two per-prisoner facts: *"a command that carried a name or a tier would be
the main thread deciding simulation state."* The sentence belongs in that list.

**Not in the command handler either**, and this is the half that is not obvious.
`createSessionCommandHandler`'s `AdmitPrisoner` branch does receive
`SimulationContext`, so `context.rng` is in scope and the draw would have been
deterministic there. It would advance the stream in **command-dispatch order** —
a fact about input — where the `classification` stage advances it in an order
derived from state, which is the property the two draws either side of it are
commented to defend. Both readers of the value are also the next two statements
at the `classification` stage: `classifyPrisoner` against
`LONG_SENTENCE_THRESHOLD_TICKS`, and `sentenceEndTick = context.tick + length`.
And `session-commands.ts` carries *"Nothing here draws"* as a load-bearing
claim; keeping it true is worth more than knowing the value fifteen ticks
earlier.

### 3. From a sixth named stream, `prisoners.sentence`

Never `prisoners.classification`. The two draws happen at the same stage, one
line apart, for the same prisoner, so sharing a stream would have looked
economical — and would have shifted the classification stream by one draw per
admission, changing **every risk tier every seed has ever produced**. Isolation
is what `docs/DETERMINISM.md` asks these streams for, and this is the case it
asks for it in.

With its own stream, and with the drawn range entirely below
`LONG_SENTENCE_THRESHOLD_TICKS` (200,000 — the single place `classifyPrisoner`
reads a sentence), every classification outcome of every existing seed is
**bit-identical** after this change. Measured: `tests/determinism/` 175 passed,
1 skipped, every canonical state hash in `session-replay.test.ts` unmoved.

Registering a stream is **not** a save-format change
([ADR 0038](./0038-what-makes-a-save-compatible.md) §2, #415): a restore merges
the bundle's streams over the runtime's, so a bundle written before
`prisoners.sentence` existed restores with it seeded from its own `masterSeed` —
the state a new session would have given it.
`tests/determinism/save-rng-stream-compatibility.test.ts` had to fail before this
could ship, and did; its stream set and both derived-word tables were extended by
hand, which is that file working exactly as its own comment says it should.

`SAVE_SCHEMA_VERSION` stays **5**. Nothing new is persisted: the drawn value
lands in `PrisonerRecordComponent.sentenceLengthTicks` and `sentenceEndTick`,
both already in the payload, and the stream state is in `rngStates`, already in
the payload.

### 4. The range is data, not architecture

Two constants in `src/simulation/prisoners/sentence.ts`, carrying their
derivation, revisable by the owner without reopening anything above.
[ADR 0017](./0017-money-primary-resource-model.md) decision 5 keeps balance
values out of ADRs and in the code beside their evidence, and this is that split
applied again — the same standing
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` and `DEFAULT_ASSAULT_POLICY`
already have.

**What is proposed there, and it is a proposal: uniform over whole in-game days
in `[2, 16]` — 4,800 to 38,400 ticks, fifteen equally likely values.** Eleven of
the fifteen exceed 13,600, which is the share #535 decision 5 asks for. The
research record carries the derivation of each bound and the end-to-end run that
shows the schedule firing; what belongs here is only that the range is a
*number*, and that this decision does not depend on which number it is.

### 5. `priorIncidents` is untouched and stays 0

`ADMISSION_REQUEST` also hard-codes it. Measured, from
`tests/unit/prisoners-classification.test.ts`'s reachability sweep over every
seed: reachable tiers at `priorIncidents: 0` are `[0, 1]` — at both ends of the
proposed sentence range as well as at the old constant, because the whole range
is below `LONG_SENTENCE_THRESHOLD_TICKS` — and `classificationGroupIdForTier`
answers `'high-risk'` only at tier 3.

**So no admission a player can make has ever produced a high-risk prisoner**, and
`room.solitary-cell`'s accommodation branch is reachable only through
`ClassificationReviewSystem` later revising a tier upward. That is the same
shape of finding as the sentence one and it is deliberately **not** taken here:
#535 decision 5 is about sentences, drawing prior incidents would move risk
tiers — which decide cell sharing, contraband introduction and which regime
timetable a prisoner runs — and holding it at 0 is precisely what buys decision 3
its bit-identical-tiers property. It is filed as
[issue #540](https://github.com/matmaxalez/lockstate/issues/540) and is its own
decision.

## What this does not decide

- **Any balance number.** The range is a proposal; the research record names
  what would change it.
- **Whether a sentence is shown to a player.** Nothing in `src/ui/` renders one
  today, and `projectPrisonerDetail` already carries `sentence.lengthTicks` and
  `sentence.endTick` for whoever builds #535 decision 6's roster readout. **No
  new player-facing copy is added**, which `AGENTS.md`'s fourth exclusion
  requires.
- **`priorIncidents`**, per decision 5. #540 owns it.
- **Whether a prisoner walks out.** ADR 0050 decision 4's slice 2 is untouched:
  discharge is still instantaneous, because the prison still has no outside.
- **What a neglected prison typically loses.** The end-to-end run establishes
  that the withholding case is *reachable*, which is an existence claim and needs
  one witness. It is not a claim about a typical prison, and none is made.

## What must not be broken

- **Determinism.** One draw per admission, from an isolated named stream, inside
  a canonical walk, reading no clock. `tests/determinism/`: 175 passed, 1
  skipped, every canonical state hash unmoved.
- **The stream-set gate.** `save-rng-stream-compatibility.test.ts` must go red
  before a stream can be added. It did.
- **Old saves.** A bundle that omits `prisoners.sentence` restores, and its
  queued admissions keep their own lengths rather than being redrawn.
- **`supabase/migrations/` is not touched, and no save version moves.**

## Consequences

- **A batch of prisoners admitted together no longer leaves together.** Six
  comments in `src/` and `tests/` described that batch behaviour as a property of
  `ADMISSION_REQUEST`'s fixed length; all are corrected in both directions rather
  than overwritten. The `total: 0`-with-history state
  `PrisonerRosterPage.everAdmitted` exists to disambiguate is *more* reachable
  now, not less: prisoners leave one at a time, so the population passes through
  zero whenever the last of them goes.
- **The grant-withholding schedule has a reachable case for the first time.**
  Measured on one furnished cell with no shower room and no yard, seed 535
  drawing 19,200 ticks: the day's grant falls from 300 to 260 at tick 11,999 and
  to 220 at 14,399, 280 of 2,400 withheld over the sentence. The same prison and
  seed at the old 10,000 is paid the full rate on all four boundaries it lives
  through and is empty by 11,999.
- **`new-session.ts`'s flashpoint comment becomes true.** It said
  *"`sentenceLengthTicks` is 0 in every slot until the classification stage
  writes one"*; that stage wrote `sentenceEndTick`, and `submitIntake` had
  already written a length at the dispatch tick, so the only slots reading 0 were
  slots nobody had ever been admitted into. An admission that leaves its length
  to the simulation now does read 0 for about fifteen ticks, so the guard covers
  the window the comment always claimed for it.
- **The mean sentence roughly doubles**, from 10,000 ticks to 21,600. Steady-state
  occupancy for a given admission rate moves with it, and ADR 0050's 200,000-tick
  population harness was **not** re-run at the new range. That is stated as the
  largest gap rather than filled with an assumption.

## What would change my mind

**The weakest claim in this document is not the range — it is that the draw
belongs at the `classification` stage rather than in the command handler.** Both
are deterministic, both cost the save nothing, and the argument for the stage is
about which *kind* of order the stream advances in. If a future producer ever
admits prisoners other than one-per-gesture — a transfer, a scenario loader, a
scripted intake wave — the two orders diverge visibly rather than only in
principle, and that would be the moment to check the choice rather than inherit
it. Nothing about it is expensive to reverse: the draw is four lines and the
stream is registered either way.

**A second, smaller one.** Decision 3 rests on the drawn range staying below
`LONG_SENTENCE_THRESHOLD_TICKS`. If the owner widens the range past 200,000, the
bit-identical-tiers property is gone — and coupling a long sentence to a higher
risk tier is arguably a *good* mechanic. It would be a different decision, taken
deliberately, and this document is where the cost of taking it is written down.
