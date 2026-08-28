# ADR 0057: What a riot does to a prisoner's day

## Status

**Proposed, 2026-08-28.** Not self-approved.

It answers
[ADR 0048](./0048-what-a-sectors-occupants-are.md) open question 1 — *"Does a
riot change behaviour, and what would it take? … a riot that changes what
participants do during it needs a way to swap the array, and `findRegimeSchedule`
runs per prisoner per reconsideration, so the shape of that swap is a real
decision"* — and closes the half of
[ADR 0042](./0042-attaching-consequences-to-the-simulation-loop.md) step 2 that
that ADR did not mention.

**The number is provisional** in the ordinary way: numbers are assigned
centrally after drafts return (`AGENTS.md`, *"a number is not reserved until it
appears in `docs/adr/README.md`"*), and 0055 and 0058 were handed to other
agents in the same pass. If 0057 collides, this file, its row in the index and
every citation of it get renumbered together.

## Context

### What the code did, verified rather than inherited

Three facts, each opened before it was cited:

1. **`applyRiotRegimeOverride` had no caller in `src/`.**
   `src/simulation/incidents/riot-regime.ts:52` on `c62ed74`. It was reached
   from two test files — `tests/unit/incident-escape-riot.test.ts` and
   `tests/unit/prisoners-free-association.test.ts`, which is one more than the
   brief for this work said, and the second is the one that measures a rioting
   prisoner's behaviour.
2. **`ActionSystem` held its schedules as `private readonly regimeSchedules`
   with no setter** (`src/simulation/prisoners/action-system.ts:106`), and
   `beginNextAction` resolved from it per prisoner per reconsideration
   (`:413`). A live session had nothing to swap.
3. **The riot's own lifetime was already bounded and already owned.**
   `IncidentTriggerSystem.openRiot` records `participantIds`
   (`src/simulation/incidents/trigger-system.ts:183`);
   `IncidentResponseSystem` transitions the record to `'resolved'` or
   `'lapsed'` and `isPastDeadline` forces the second at
   `responseDeadlineTicks` past the start
   (`src/simulation/incidents/response-system.ts:436`), so no riot can outlive
   600 ticks unanswered.

### What that cost, measured

A prison a player builds and half-finishes: two furnished cells, a furnished
canteen, two prisoners, **no shower room, no yard, no common room, no classroom
and no laundry**, and no guards. It is the "chronic neglect, fully housed" rung
of ADR 0048's ladder, and since ADR 0048 it riots: `needsPressure` 0.3765 plus a
staffing shortfall of 1 at weight 0.3 is 0.676 against a `hotThreshold` of 0.65,
and twelve consecutive hot samples later a severity-7 riot opens at tick 13,300
naming both prisoners.

The control is the same seed, the same rooms, the same objects, the same
admissions and the same ticks, with **two `HireStaff` commands added**. That
drops the staffing term to zero, the score to 0.376, and the prison never riots.
Nothing in guard deployment reaches prisoner action selection.

On `c62ed74`, over the 2,400 ticks from the riot's opening, the two runs
produced the same census, term for term:

| prisoner-ticks, 2 prisoners × 2,400 ticks | rioting | control |
| --- | --- | --- |
| `action.sleep` | 1,200 | 1,200 |
| `action.eat-meal` | 240 | 240 |
| `action.use-toilet` | 360 | 360 |
| `action.free-association` | 1,680 | 1,680 |
| idle | 1,160 | 1,160 |
| travelling | 160 | 160 |

That is what "a riot changes nobody's timetable" was. Responders were
dispatched, the sector went into lockdown, both prisoners were injured when it
lapsed, and in between nobody's day moved by one tick.

## Decision

### 1. A riot replaces its **participants'** timetable, resolved at the point of use

`ActionSystem` gains one injected port,
`PrisonerRegimeOverrideResolver` (`src/simulation/prisoners/regime.ts`):

```ts
(entityId: EntityId, classificationGroupId: string) => RegimeSchedule | undefined
```

`beginNextAction` asks it before `findRegimeSchedule`, and everything downstream
is unchanged — the block still comes from a gapless schedule, the candidates are
still `DEFAULT_ACTIONS` filtered by the block, and the walk is still ADR 0041's.
`createRiotRegimeOverride(incidents)`
(`src/simulation/incidents/riot-regime.ts`) is the one implementation: it
answers `buildRiotRegimeSchedule(group)` while the incident log names this
prisoner in an open riot, and `undefined` otherwise.

Three properties fall out of resolving rather than storing, and they are the
whole reason for the shape:

- **Nothing is persisted and nothing needed to be.** The answer is a pure
  function of `IncidentLog`, which the save already carries in full
  (`session-systems.ts`'s `incidents.log`). `SAVE_SCHEMA_VERSION` stays at 5,
  no field was added, no migration was written, and `src/persistence/` was not
  touched — which mattered, because it was another agent's surface while this
  was written. `tests/integration/riot-regime-loop.test.ts` proves it by
  round-trip rather than by assertion, in both directions: restored mid-riot,
  the participants stay on the riot regime; restored after it lapses, they are
  back on their timetable.
- **There is no lift step to forget.** The override ends because the incident
  is no longer open, which `IncidentLog.transition` establishes once for every
  reader. The alternative needs `IncidentResponseSystem`'s three exits to each
  remember to write the array back, and the care
  `liftLockdownNoOpenIncidentJustifies` already takes over exactly that
  question is the argument against adding a second thing to it.
- **The set is the set the record names.** `participantIds` is what the trigger
  resolved when it fired, so the prisoners whose day changes are the prisoners
  the log says rioted, and a participant id carries its `EntityStore`
  generation so a released prisoner's entry can never match their index's next
  occupant.

### 2. `applyRiotRegimeOverride` is **deleted**, not wired

It swapped whole classification groups. With one derived sector that is the same
set as the participants today and it is the wrong set as soon as a second sector
exists: a riot in one wing would have restricted every general-population
prisoner in the prison, including those nowhere near it. Keeping it beside the
mechanism that shipped would leave two divergent answers to one question in one
file, which is the failure this repository pays for most often, in code rather
than in prose. Its two test callers build the array from
`buildRiotRegimeSchedule` directly, which is all it did.

### 3. The categories are unchanged, and an override **replaces** the day

`RIOT_ALLOWED_CATEGORIES` stays `['free-association', 'recreation']`. The
rejected alternative was to intersect it with whatever block the clock is
running, which reads like the smaller change and is wrong: a `sleep` block
against those two categories intersects to the empty set, and `beginNextAction`
with no legal candidate counts an unmet demand cycle on every reconsideration —
exactly the hole ADR 0042 decision 1 closed by authoring
`action.free-association`. An override replaces the day; it does not narrow it.

### 4. An action already running is not interrupted

The resolver is consulted in `beginNextAction`, which runs only for an `idle`
prisoner, so a prisoner asleep when a riot opens finishes their 200-tick sleep
and cannot start another. This is the cheapest correct behaviour and it is also
the convention the genre uses: RimWorld's schedule is checked when a pawn
finishes what it is doing, not when the schedule changes.

### 5. The membership question is a derived index on `IncidentLog`

`openRiotCountByParticipant`, a fourth index of the same shape as `openIds`,
`openIdsBySectorId` and `lastStartedAtTickBySectorId`: written in `open`,
cleared in `transition` to a terminal state, rebuilt in `loadSnapshot`, never
persisted. It is a **count** rather than a set because two sectors can riot at
once and one prisoner can be an occupant of both — the derived default sector is
the whole prison (ADR 0048) and any other registered sector keeps the post-tile
rule — so with a set, closing the first riot would end the second one's
override.

Only `'riot'` is indexed. Reading a riot's categories onto
`'gang-retaliation'`, the only other type anything in `src/` opens, is a content
decision with no measurement behind it. See open question 2.

## Consequences

### What it moves, side by side

Same prison, same seed, after the change. The **control column has not moved at
all**; that is the point of quoting it.

Over the 611 ticks the riot is actually open, 2 prisoners:

| | rioting | control |
| --- | --- | --- |
| `action.free-association` | 882 | 720 |
| `action.use-toilet` | **0** | 120 |
| idle | 280 | 322 |
| travelling | 40 | 40 |

Over the whole day from the riot's opening:

| | rioting | control (= `c62ed74`'s rioting column) |
| --- | --- | --- |
| `action.sleep` | 1,200 | 1,200 |
| `action.eat-meal` | 240 | 240 |
| `action.use-toilet` | **200** | 360 |
| `action.free-association` | **1,920** | 1,680 |
| idle | **1,080** | 1,160 |

And the consequence that feeds the loop back into itself — mean need deficit
over the population, the quantity `needsPressure` is made of, both runs starting
from the same value:

| | at the riot's opening | 611 ticks later |
| --- | --- | --- |
| rioting | 0.3752 | **0.4542** |
| control | 0.3752 | 0.3497 |

`bladder` is where nearly all of it is: 94 of 255 against the control's 254,
because `action.use-toilet` is `hygiene` and `hygiene` is illegal under a riot.
A prison that riots is measurably closer to rioting again than one that did not,
which is the consequence the loop was missing. Across eight admission offsets on
the same fixture the gap ranges from **0.051 to 0.135**.

### Say the small part plainly

**Sleep and meals did not move in the whole-day census, and that is honest
rather than disappointing.** The riot is open for 610 of the day's 2,400 ticks
and lands at tick-of-day 1,300–1,910, which `GENERAL_POPULATION_REGIME` fills
with `work`/`education` and `recreation` — none of which this prison can
provide, so the base timetable was already resolving to
`action.free-association` there. In this prison the riot's override bites on
exactly one thing: the toilet.

That is a fact about *where the streak lands*, not about the mechanism. A riot
opening over the `[0, 400)` sleep block or the `[1200, 1300)` meal block takes
those instead, and the same override would then be the difference between a
prisoner sleeping and a prisoner not. The general statement the measurements
support is narrower than "a riot upends the day": **a riot removes whatever the
prison could actually have provided during it**, and a neglected prison can
provide little.

### What it does not change

- No persisted state, no `SAVE_SCHEMA_VERSION` bump, no migration, nothing in
  `supabase/migrations/`, nothing in `src/persistence/`.
- No RNG. The resolver draws nothing and reads no clock; it is a map lookup over
  state the save already holds. No named stream is registered, so ADR 0038
  decision 2's absent-stream rule is not engaged.
- No iteration order moves. `EntityQuery.execute` is still ascending index
  order and the resolver is asked per prisoner inside it.
- **No UI, and no locale key.** The regime panel projects each classification
  group's *timetable*, and the timetable is unchanged — the rioters are
  ignoring it, which is a different sentence. The prisoner roster already shows
  each prisoner's current activity and now truthfully shows association. See
  open question 1 for what a player still cannot see.

### What it costs elsewhere

- `tests/integration/contended-canteen-meal-fallback.test.ts` re-measures. Its
  six-prisoner prison riots too, at tick 13,450 (13,500 in the control), 550
  ticks before its watch ends: `action.use-toilet` falls from 920 to 820 (880 to
  800 for the last three) and those ticks plus the idle ones beside them become
  `action.free-association`. **`sleep`, `eat-meal` and `eat-in-cell` are
  unchanged in all six rows**, which is both why the re-baseline is attributable
  to the riot and why that file's subject is untouched.
- `tests/unit/prisoner-release-completeness.test.ts` — the graph walk that finds
  every container mentioning a released prisoner — found the new index, exactly
  as it is built to. Its exemption rule already anticipated this in words
  (*"stated as a rule rather than as a list of paths so it survives the log
  growing a second index"*) and now names both containers.
- `tests/unit/incident-escape-riot.test.ts`'s two `applyRiotRegimeOverride`
  cases became five cases about the resolver, including the two the deleted
  function could not have: the override ending on both terminal transitions, and
  a second open riot keeping it alive.

## Alternatives rejected

- **A setter on `ActionSystem.regimeSchedules`**, written when a riot opens and
  rewritten when it closes. This was the obvious move and it fails three ways at
  once, each recorded under decision 1: unsaved live state, the wrong scope, and
  a lift step down three exits. It is also the one option that makes a save
  taken mid-riot come back *wrong* rather than merely unchanged.
- **Driving the regime off `SectorControlState === 'lockdown'`.** Tempting
  because it is the one relevant thing already persisted
  (`save-schema.ts:657`) and already driven by the response system. Rejected:
  a lockdown is a *staff response* to severity ≥ 6, so a severity-5 riot has
  none, and it lifts when responders contain the incident while the incident is
  still open. It would make the riot's effect on prisoners a function of how the
  prison answered it rather than of the riot.
- **Intersecting the riot categories with the running block** — decision 3.
- **Per-classification-group swap** — decision 2.

## Open questions

1. **A player cannot see that a riot is changing anybody's behaviour.** The
   status strip carries `activeIncidents`
   (`presentation/status-strip-projection.ts:393`) and the roster shows each
   prisoner's activity, so both halves are on screen and nothing joins them:
   nothing says *these* prisoners are rioting, or that the timetable the regime
   panel is showing is not the one they are on. That is a readout, not a
   promise the code fails to keep, so no locale key was added ahead of it —
   `AGENTS.md`'s fourth exclusion. It is the obvious next step and it is
   deliberately not taken here.
2. **Should `'gang-retaliation'` override too?** It is the only other type
   `src/` opens, it also records multiple participants, and it is also a
   disturbance. `RIOT_ALLOWED_CATEGORIES` is authored for a riot and nothing has
   measured what those categories do to a retaliation, so decision 5 scopes the
   index to riots.
3. **Should a riot interrupt an action in flight?** Decision 4 says no. The
   alternative — dropping every participant to `idle` when a riot opens — is one
   line and would make the override bite immediately rather than within one
   action's `minDurationTicks`. It would also need to release use claims
   correctly on a path that has never had to, which is why it is a separate
   decision rather than a detail of this one.
4. **Does the quiet period want to depend on this?** ADR 0048 open question 3
   asks whether a contained riot should buy a longer quiet than a lapsed one.
   The measurement above gives it a second reason to exist: a lapsed riot now
   costs the prison ~0.10 of need deficit and a contained one costs less, so the
   two outcomes already differ in a way the trigger reads. Still not decided.

## What would change my mind

**The weakest claim in this document is that "a riot removes whatever the prison
could actually have provided" is a satisfying amount of consequence.** In the
prison measured it is one need. Every number here is real, and every one is from
prisons this document's author built, on two seeds, with the riot landing in the
afternoon both times because that is where a 12-sample streak lands in this
fixture — not because riots land there.

What would settle it is a player. Failing that, two things would move me:

- **A riot measured across the sleep block.** If overriding a 400-tick sleep
  block turned out to be too punishing — a participant who cannot sleep for the
  whole of a riot, then cannot sleep again until the next block — the right
  answer might be a riot regime that keeps `sleep` legal, which would make
  `RIOT_ALLOWED_CATEGORIES` a balance value rather than the authored constant it
  has been since issue #28.
- **Evidence that the override makes a death spiral.** The quiet period is
  4,800 ticks from a riot's *start* and the riot is at most 610 of them, so
  there are ~4,200 ticks to recover in and needs restore far faster than they
  decay. That is an argument, not a measurement; a prison that riots, is left
  alone, and riots again immediately would refute it.
