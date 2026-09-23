# ADR 0050: When a sentence ends

## Status

**Proposed, 2026-08-28.** Not self-approved.

It closes issue #441 — *"a sentence never ends: `sentenceEndTick` is written,
persisted and displayed, and never compared against the clock"* — and it takes
[ADR 0026](./0026-entity-id-lifetime.md) question 2, which that document
accepted as *"the framing and the tripwire, not as an answer"* and routed to
#31. The code implementing it is on this branch, because #441 is the owner's own
issue and states the outcome it wants in as many words: *"The minimum honest
outcome is that the prisoner leaves and their place, bed and accommodation are
freed."* It also says *"the decision belongs in an ADR"*, which is this one.

**It does not answer ADR 0026 questions 1 or 3**, and §*What this does not
decide* says why each is left open and what this change does to its reachability.

**The number is provisional.** ADR numbers are assigned centrally after drafts
return (`AGENTS.md`), and the stated next-free number is a ceiling rather than a
reservation — an unmerged branch cannot be seen from `docs/adr/README.md`. 0049
was already taken on `agent/0042-step3-recurring-debit` when this was written and
0051 was assigned elsewhere in the same pass. If 0050 collides anyway, renumber
this file, its row in `docs/adr/README.md`, and every citation of it
(`grep -rn "0050" src/ tests/ docs/`).

## Context

### What the code did

`IntakeSystem` writes the field at the `classification` stage
(`src/simulation/prisoners/intake-system.ts:379`):

```ts
this.records.sentenceEndTick[index] = context.tick + this.records.sentenceLengthTicks[index]!;
```

Every reader in `src/`, re-derived on this branch's base with
`grep -rn "sentenceEndTick" src/`: the save schema
(`src/persistence/save-schema.ts:367`, `:403`), the capture/restore pair
(`src/simulation/runtime/session-systems.ts:111`, `:339`, `:381`), the HUD
projection (`src/simulation/presentation/prisoner-projection.ts:397`), and
`classifiedAtTickOf`, which subtracts it from `sentenceLengthTicks` to recover
*when* the prisoner arrived
(`src/simulation/prisoners/classification-review-system.ts:57-59`). **Not one
compares it against `context.tick`.**

The consequence is not a missing feature, it is a shape: a prison's population
is a ratchet. Measured on this branch's base (`317f487`) with the real kernel,
the real `ZoneRoom` and `AdmitPrisoner` commands and one admission per in-game
day into a sixteen-bed prison, over 200,000 ticks:

| tick | population | occupied places | treasury |
| --- | --- | --- | --- |
| 5,000 | 18 | 16 | 34,600 |
| 50,000 | 36 | 16 | 121,000 |
| 100,000 | 57 | 16 | 221,800 |
| 200,000 | 99 | 16 | 423,400 |

Ninety-nine admissions, sixteen of them ever housed, `completedCount: 16`,
`accommodationBacklogTicks: 1,646,471`, and occupancy pinned at sixteen for the
whole run because the first sixteen arrivals never leave the beds. Income rises
monotonically; nothing in the session can make the prison smaller.

### Why this is on the boundary the owner keeps

`AGENTS.md` reserves *"anything that reaches a player as a promise the code does
not keep"*. `PrisonerDetailViewModel.sentence.endTick` is exactly that promise —
a date the game shows and never honours. What that reservation forbids is
*changing the promise*; making the code keep it is ordinary work. So the option
#441 offers in its own text — *"stop persisting and displaying a number that
means nothing"* — is deliberately **not** taken here, and would need the owner.

### Why it needs an ADR rather than a commit message

Because it changes the population dynamics every other system is measured
against, and because ADR 0026 says its questions *"get taken"* at the release
path rather than before it.

## Decision

### 1. A sentence ends by discharge: the prisoner leaves and the entity is destroyed

`PrisonerDischargeSystem` (`src/simulation/prisoners/discharge-system.ts`) walks
`EntityQuery.execute()` and releases every living prisoner whose
`sentenceEndTick` the clock has reached.

**Destroyed rather than retained-and-marked.** A `'discharged'` intake stage
would have been the smaller diff and it is the wrong answer: the slot would never
return to the free list, so a prison would fill permanently and
`requestAdmission` would refuse `population-full` for ever — swapping a ratchet
on the population for a ratchet on the allocator. Every reader of prisoner state
in `src/` already gates on `EntityStore.isIndexAlive` or `isAlive`
(`prisoner-projection.ts:284` and `:307`, `sector-occupancy.ts:138` and `:164`,
`render-actors-keyframe.ts`, `actors-from-snapshot.ts`), so destruction is the
form the existing code is already written for.

**Two guards decide who is due**, and both are in `isSentenceComplete`:

- **The intake stage.** `sentenceEndTick` reads 0 in every slot before the
  `classification` stage writes it, and 0 is in the past at every tick above it,
  so an ungated comparison releases every arrival on the first scheduled tick.
  The sentence-bearing stages are `accommodation-assignment`, `completed` and
  `failed`. **`failed` is included on purpose**, which is a deliberate
  difference from `ClassificationReviewSystem`'s `REVIEWABLE_STAGES`: a tier
  written at `failed` can reach nothing, but a `failed` record is a person the
  prison is holding and counting, and their sentence runs. `IntakeSystem`
  described such a record as *"a permanent, undeletable, inert record"*; this is
  what stops it being permanent.
- **The `Uint32` wrap.** `sentenceEndTick` is a `Uint32Array` slot and
  `sentenceLengthTicks` may be `MAX_SENTENCE_LENGTH_TICKS` (`0xffff_ffff`), so
  the sum wraps and the stored end tick is then *behind* the clock. Without this
  guard the longest sentence in the game would be the shortest.
  `classifiedAtTickOf` already detects it — *"a wrapped sum is strictly less than
  the sentence length it was added to"* — and is reused rather than
  reimplemented, so a prisoner whose clock cannot be read is neither reviewed nor
  released. Pinned in `tests/unit/prisoners-discharge-system.test.ts`.

**Order 65, every 20 ticks.** After `prisoners.needs-decay` (60) and before
`navigation` (150), `prisoners.actions` (250) and `operations.jobs` (260), so
nothing hands a departing prisoner a route, an action or a haulage job on the
tick they leave. The cadence matches `prisoners.actions`, which is the finest
resolution at which a prisoner is observed doing anything; a departure can
therefore be late by at most one reconsideration cycle, and never by the ten
in-game days a review-interval cadence would have allowed. Cost is one
`Uint32Array` read and two integer comparisons per living prisoner per interval
— at `DEFAULT_PRISONER_CAPACITY` (5,000) the same walk three other prisoner
systems already perform on their own cadences, with a smaller body.

### 2. What release drops, and the mechanism that keeps the list complete

This is ADR 0026 question 2. That document is explicit that the decision is *not*
"should release drop these" — *"obviously it should"* — but **what keeps the list
complete**, because a hand-written list is the failure mode #111 produced once.

`releasePrisoner` (`src/simulation/prisoners/release.ts`) drops, in this order
and for the reasons recorded there: the pending path request (cancelled *and* its
resolved result cleared); both of `RoomInstanceRegistry`'s entity-keyed ledgers,
through a new `releaseEntity` that asks the ledgers rather than the cold state's
two instance pointers; the cold state's three maps; the actor identity; the gang
membership; the job labour pool; the component bit; and finally the entity.

Two things make that list more than a list:

- **`PrisonerReleaseSurfaces` names every store as a required field**, so a store
  cannot be dropped from the path by deleting one line.
- **`tests/unit/prisoner-release-completeness.test.ts` is the actual gate.** It
  does not read the release path at all. It walks the real session's object graph
  by reflection, collects every `Map` key, `Set` member, array element and
  numeric property that mentions one living prisoner's `EntityId`, releases them,
  and requires that nothing mentions them afterwards. A nineteenth store fails
  there whether or not anybody remembered `release.ts`, and it fails naming its
  own path. This is the ADR 0026 option-C answer with the *"reflection-based
  accounting"* that option asked for.

  The target prisoner's id is forced to `(7 << 20) | 0` — 7,340,032 — by
  recycling index 0 seven times first, because a fresh prison issues `EntityId`
  0 and a graph search for the number 0 finds every zeroed counter in the
  session.

**One family of mention is deliberately kept**: `IncidentLog.records`'
`participantIds` and `outcome.injuredEntityIds`. A log of what happened goes on
having happened; rewriting it on a departure would falsify the record and change
`buildDisciplinaryIndex`'s arithmetic for everyone else in that incident. That
retention is safe because the log is only ever read *by id*, and a recycled index
carries a new generation — which used to be safe only until the generation
wrapped, i.e. until ADR 0026 question 1 was answered. **It now is (2026-08-29,
#169, option A):** a slot is retired rather than recycled past its last
generation, so the generation this retention leans on can never repeat.

**Release deliberately does not reset the component arrays.** Those are reset
when an index is *allocated* (`admitPrisoner`, the #111 fix), and stating the
defaults in a second place is how two copies come to disagree. A freed slot
therefore keeps its previous occupant's record until reuse, exactly as an
unallocated slot above the high-water mark always has.

### 3. No save-format change, and it is measured rather than asserted

`SAVE_SCHEMA_VERSION` stays 5. Nothing new is persisted: the entity store's
snapshot has always carried `alive`, `freeIndices`, `freeCount` and
`generations` (`save-schema.ts:288-292`, the population-shaped V2 ledger), the
component payload is already the allocated prefix rather than the live
population, room occupancy is already snapshotted and use claims are already
derived rather than saved (ADR 0029). The discharge metric is unpersisted, the
same standing `IntakeMetrics` and `ClassificationReviewMetrics` have.

`tests/integration/sentence-end-release.test.ts` proves it by round-tripping a
save taken **after** a release through `createSaveEnvelope` → JSON →
`decodeSaveEnvelope` (`migrated: false`) → `restoreSimulationRuntime`, and then
admitting again to show the freed index comes back on the far side. A second case
saves *before* a release, steps both arms past it, and requires
`carriedScopeState` and the whole prisoner snapshot to agree.

### 4. The prisoner vanishes, and that is slice 1

**They do not walk out, because there is nowhere to walk to.** No room-catalog
entry is a gate or a reception exit, no `ActionDefinition` targets one, and
`world.setOwned` has a single call site at session creation so the prison has no
outside. Building a departure walk means authoring a room type, an action (which
must be *appended* to `DEFAULT_ACTIONS`, because `actionIndex` is a persisted
positional index — ADR 0042 records that), a terminal action phase and a
render-side exit. Comparable management sims do walk their departures, and it
reads better; inventing a fake destination to get there would be worse than
saying so.

So: instantaneous discharge, recorded as the first slice. Slice 2 needs a
`room.reception`-style instance the player has zoned, an appended
`action.leave-prison` targeting it, and a `leaving` state between `completed` and
release. Nothing here forecloses it — `PrisonerDischargeSystem.due()` already
separates *who is due* from *what happens to them*.

### 5. What the player sees, and what is not built

The population count falls, the roster loses the row, `projectPrisonerDetail`
answers `undefined`, occupancy falls and with it the per-prisoner-day income
line — all of which are existing projections telling the truth, because every one
of them is already gated on liveness. **No new UI is added**, and none is needed
for the loop to be honest.

## What this does not decide

- ~~ADR 0026 question 1 — generation exhaustion — stays open, and this change
  makes it reachable.~~ **Answered, 2026-08-29 (#169): option A is taken.**
  This bullet used to record that this change made the wrap reachable in
  ordinary play (true, and still the reason the decision could not wait) and
  that option A was priced but not taken. It has since been taken:
  `EntityStore.destroy` (`src/simulation/entity/entity-store.ts`) retires a
  slot that dies at generation 4,095 instead of recycling it, so the
  recurrence this bullet described can no longer happen at any recycle count,
  and `actor-identity.test.ts`'s pin was re-baselined as this bullet said it
  would need to be. See ADR 0026's own "Amendment, 2026-08-29" for the
  argument and the RED/GREEN evidence. **This is no longer the one thing on
  this branch a reviewer needs to decide.**
- **ADR 0026 question 3 — may `submitIntake` be called for an already-admitted
  prisoner — stays open.** Release does not create a caller for it; the
  "one prisoner, two beds" state that question measured is now recoverable rather
  than permanent, because `releaseEntity` drops the prisoner from *every*
  instance, but nothing here decides whether re-intake should exist.
- **Phase 9, in full.** Parole boards, reoffending, a release ceremony, an
  inspector reacting to a discharge rate, reputation consequences and the intake
  pressure that would make a discharge feel like relief are `docs/ROADMAP.md`
  Phase 9 and #31. None is built and none should be inferred from this.
- **Any balance number.** ADR 0017 decision 5 keeps balance out of ADRs and this
  changes nothing there. One number does become load-bearing that was not:
  `ADMISSION_REQUEST` in `src/main.ts` asks for `sentenceLengthTicks: 10_000`,
  which is about four in-game days, so a prisoner the Intake panel admits now
  leaves within one sitting. That is left exactly as it is, and flagged.
- **Staff.** No path in `src/` dismisses a guard, so the staff `EntityStore` is
  still never recycled. `guard-release.ts` and `commands.ts` both already record
  that firing destroys an entity and needs its own decision; this ADR is about
  prisoners and does not take it.

## What must not be broken

- **Determinism.** Discharge draws nothing, registers no named stream (so ADR
  0038 §2 and #415 are untouched), reads no clock but `context.tick`, and walks
  `EntityQuery.execute()`'s ascending entity index. Every step of the release is
  a keyed delete, which commutes, so the outcome does not depend on the order
  even though the order is canonical. `RoomInstanceRegistry.releaseEntity` walks
  two `Map`s in insertion order; the deletions are independent and the two
  existing exemptions in
  `tests/determinism/canonical-iteration-contract.test.ts` are extended to cover
  the second caller rather than a third exemption being added.
- **`EntityQuery.execute`'s ordering guarantee.** Its own comment already
  anticipated this: *"the moment a release path exists, a recycled slot at a low
  index sorts after a fresh slot at a higher one"*. That moment has arrived, the
  comment is updated to say so, and the guarantee it gives — ascending *index*
  order, a total order derived from state — is unaffected.
- **Occupant ordering.** `RoomInstanceRegistry.occupantsOf` was made to sort by
  #132 precisely because a release-then-reassign leaves the backing `Set` in an
  order no single assignment sequence could produce, and
  `tests/determinism/room-occupant-ordering.test.ts` already drives that history.
  This change makes that history reachable in play; nothing about it needed to
  move.
- **`supabase/migrations/` is not touched, and no save version moves.**

## Consequences

- **The population is no longer monotonic.** The same 200,000-tick harness, on
  this branch: peak 24, trough 8, oscillating 8–9 thereafter; 99 admissions, 90
  discharges, `completedCount: 99` (against 16 before, because beds now free up),
  `accommodationBacklogTicks: 14,768` (against 1,646,471, a 111× reduction),
  `maxActiveIndex: 23` for 115 lifetime prisoners — indices are being recycled.
  Occupancy and the income line both fall as well as rise, which is the first
  downward force in this economy.
- **The `'failed'` stage stops being permanent**, which weakens — but does not
  remove — the argument behind `requestAdmission`'s `no-accommodation` refusal.
  A prisoner who does nothing for the length of their sentence is still not what
  the player asked for, so the refusal stands and its comment is corrected rather
  than deleted.
- **Two shared test fixtures now hold longer sentences.**
  `tests/helpers/determinism-scenario.ts` admitted 900/4,000/2,200/600-tick
  sentences, so its whole population walked out inside two in-game days and
  `economy-state-income-persistence.test.ts` began measuring a per-prisoner-day
  income line against a halving population. They are multiplied by forty, which
  keeps every ratio and crosses no classification threshold, so no draw, tier,
  housing decision or iteration order in `tests/determinism/` moves.
  `incident-consequence-loop.test.ts` and `hud-projections-scale.test.ts` needed
  the same treatment for the same reason, each recorded in the file.
- **Six comments in `src/` asserted that nothing releases a prisoner** and are
  corrected in both directions rather than overwritten
  (`entity-store.ts`, `query.ts`, `hiring.ts`, `intake-system.ts` ×2,
  `prisoner-operations-runtime.ts` ×2, `main.ts`), as are two in `tests/`.
  `docs/PRISONER_OPERATIONS.md`'s *"Resetting the slot is not a release path"*
  paragraph named four uncalled primitives; all four are now called.
- **ADR 0026's *"Still latent, re-verified at v0.0.88"* paragraph is no longer
  true**, and that document carries a dated amendment pointing here rather than
  being rewritten.
- **ADR 0042's step 5** said release *"cannot start until ADR 0026 is answered"*.
  Question 2 is answered here and questions 1 and 3 are argued to be separable;
  ADR 0042 is still **Proposed** and this does not accept it.

## What would change my mind

~~**The weakest claim in this document is that ADR 0026 question 1 can be left
open.**~~ **Settled, 2026-08-29 (#169), and by the stronger route.** This
section used to rest an argument on option C alone — that no stale prisoner id
survives long enough for a wrap to reconnect it, because every store that could
hold one is emptied at release — and named the holder it could not enumerate
(a queued command, a cached projection, a future transfer record) as the thing
that would break it. Option A closes that gap structurally instead of by
enumeration: `EntityStore.destroy` now retires a slot at generation 4,095
rather than recycling it, so the id cannot repeat *at all*, which means no
holder anywhere — enumerated or not — can ever collide with a later occupant's
id. The cheap experiment this paragraph proposed (drive one index through
4,096 releases and report what the ninth store does) is no longer the
interesting question, because there is no tenth id to reconnect.

Two smaller things would move me:

- **An owner ruling that a sentence should not end**, in which case the
  projection and the persisted field go instead of the comparison, and this
  document is replaced by a much shorter one.
- **Evidence that discharge is hot.** `RoomInstanceRegistry.releaseEntity` walks
  every registered instance twice per departure. At the 200,000-tick harness's
  scale it is unmeasurable (200,000 ticks in 746 ms, against 2,860 ms on the base
  tree, which was slower for an unrelated reason: 83 prisoners permanently
  retried `accommodation-assignment` on every intake tick). At
  `DEFAULT_PRISONER_CAPACITY` with a cell per prisoner and a high turnover it
  becomes a reverse-index question, and that is a different decision with the
  same effect.
