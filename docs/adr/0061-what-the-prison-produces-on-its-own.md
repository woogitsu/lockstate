# ADR 0061: What the prison produces on its own

## Status

**Proposed, 2026-08-28.** Not accepted. This records a decision that has been
*built* — issue #442's remaining children, on branch
`agent/442-incident-producers` — because the alternative is an incident model
that lives in five source comments and cannot be argued with. The reasoning
below is the whole of the warrant, and a reader who disagrees with any of it
should treat that decision as open.

**The number was assigned centrally**, before this file existed, which is the
practice `docs/AGENT_WORKFLOW.md` §2 records as the thing that stopped 0034 and
0038 colliding. This document renumbers without argument — file, index row and
every citation together — if an unmerged branch turns out to hold 0061.

## Context

### Three of four incident types had no producer, and the fourth had nothing to feed on

Verified on `3bfb799` before anything was written:

1. **`'assault'` and `'escape-attempt'` were declared, projected and never
   created.** `IncidentType` names all four
   (`src/simulation/incidents/incident.ts:6`), `INCIDENT_TYPES` in
   `src/simulation/presentation/incident-projection.ts:134` counts all four,
   `simulation-message-keys.ts` labels all four, and
   `DISCIPLINARY_POINTS_BY_INCIDENT_TYPE`
   (`src/simulation/prisoners/disciplinary-record.ts:46-51`) prices all four —
   giving an escape attempt 3 points to an assault's 2, with a reason. The only
   two `IncidentLog.open` calls in `src/` are `openRiot`
   (`src/simulation/incidents/trigger-system.ts:183` at the time) and
   `tryOpenRetaliation` (`:206`), and the second needs `GangRegistry` entries
   nothing writes.
2. **The contraband substrate was complete, wired and empty.**
   `src/simulation/contraband/` is seven modules and 971 lines — confiscation,
   informants, intelligence, item, search policy, search system — plus a Zod
   catalogue of five categories, a projection, and eight message-key entries.
   `ContrabandRegistry.introduce` had **no caller in `src/`**. `SearchSystem`
   ran its 10-tick schedule over an empty queue for the life of every session.
3. **`new-session.ts` said why, and said it as a convention:** *"no contraband
   instances, no intelligence, no informants and no search policies until a
   session/scenario introduces them — same 'no fabricated default content'
   convention as everything above."* There is no session or scenario format in
   this repository, so nothing was ever going to be that session.

### What that cost, in the one number somebody had measured

Issue #477, filed the same week: eight prisoners, eight furnished cells, no
shower room and no yard, twenty in-game days.

| guards | peak sector risk | riots |
| --- | --- | --- |
| 1 | 0.4824 | 0 |
| 0 | 0.7979 | 3 |

`hotThreshold` is 0.65. In a **staffed** prison the sector risk score *is*
`needsPressure` — `staffingShortfall` is 0 and `contrabandPressure` is
structurally 0 — and a housed prisoner has four of six needs served from their
own cell, so two needs pinned at zero cap the score near 0.48 and can never
reach the line. #477's words: *"a player who never builds a shower room or a
yard, and who hires one guard, pays nothing at all for it — for ever."*

So the reachable incident model was one type, in prisons that were understaffed
or unhoused, and nothing else could ever happen anywhere.

### Two anticipated routes that this repository cannot currently build

Both were followed before being rejected, because each looks like the obvious
answer:

- **Contraband through deliveries.** `SearchScope` declares `'delivery'`,
  `ContrabandHolderKind` declares `'container'`, and `new-session.ts` keeps a
  `searchContainerLocations` map for exactly that scope. `ProcurementSystem`'s
  own header records why it cannot be used: `room.delivery-bay` and
  `object.loading-dock-door` "are declared content that no session instantiates
  (#141), so there is no bay to deliver to", and a delivery therefore "lands
  directly in the container construction draws from". `locateSearchTarget`
  throws for a container with no registered location — so contraband introduced
  on the anticipated route would be unreachable by the system built to find it.
- **Escape through the perimeter.** `resolveEscapeOpportunity`
  (`src/simulation/incidents/escape.ts:76`) scores exploitable perimeter doors
  and completed tunnels, and is called from one unit test.
  [ADR 0036](./0036-a-derived-default-security-sector.md) gives the derived
  sector **no doors**, on the stated grounds that a perimeter "is the one thing
  a derivation cannot know", and `TunnelRegistry.start` has no caller in `src/`.
  So that function scores 0 for every prison in this repository and will until
  somebody draws a perimeter.

## Decision

### 1. Contraband enters with the people the player admits, and leaves with them

At the `classification` stage of intake — where the arrival's `RiskTier` is
written — one draw on a named stream decides whether they are concealing
something, and a second decides what. `IntakeSystem` takes it as an **optional
injected port**, exactly as it already takes `ActorIdentityMinter`; the rule
lives in `src/simulation/contraband/introduction.ts` and the composition root
supplies only the registry and the catalogue.

**Why this is not fabricated default content, which is the objection the
convention above raises.** A session that admits nobody holds no contraband, for
ever, exactly as before. Every item that exists was brought in by one arrival
the player chose to admit; `provenance.sourceId` names that arrival; and both
halves of the draw are functions of the classification the player's own
`AdmitPrisoner` figures produced. The convention forbids content the code
invents at session start. This is a consequence of a command — the same category
as a build order producing a wall.

**Who the player admits decides how often and how bad.** The chance rises with
the tier (0.10 at tier 0, 0.40 at tier 3) and so does the band of the catalogue
they can draw from: the eligible set is the `2 + tier` least severe entries in
`severity` order, so only an arrival classified high risk can bring a weapon in.
That is a prefix of an authored ordering rather than a second weight table, so
adding a category to `contraband-catalog.ts` places it by its own `severity`.

**Item ids are derived, not allocated** ([ADR 0012](./0012-derived-identifier-reproducibility.md)
category 2): `contraband.intake.<entityId>.<tick>`. Nothing joins the save
payload, and a restored session mints exactly what a continuous one did.

**And contraband leaves with its holder.** `ContrabandState` gains a third
member, `'departed'`, and `PrisonerReleaseSurfaces` gains the port that produces
it. A prisoner who is discharged, or who gets out through decision 5, takes what
they were concealing. The record and its movement log survive — a departure is
not a deletion, and issue #27 asks for provenance "sufficient for debugging and
evidence".

**Rejected: introducing at `reception` instead of `classification`.** The tier is
what decides both halves and it does not exist one stage earlier.

**Rejected: a fixed rule instead of a draw** ("priors ≥ 2 always carries"). It is
deterministic without a stream, and it makes the answer knowable from the
command, which turns admissions into arithmetic rather than a risk.

### 2. `'assault'` reads one prisoner where the riot reads the average

`SectorRiskSample.needsPressure` is a mean over the sector's occupants
([ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 2). Eight housed
prisoners at 0.48 and one homeless prisoner at 0.95 average to 0.53 — so a
prison that is adequate for almost everybody and intolerable for one person
produces nothing at all. The assault score substitutes the individual's own
deficit for the mean and their own holdings for the sector's suspicion:

```
assault = needDeficit × 1 + contrabandSeverity × 0.4 + staffingShortfall × 0.3
```

**Three of those four numbers are the sector policy's**, copied deliberately:
`needsPressureWeight` is 1, `staffingShortfallWeight` is 0.3, and the threshold
is `hotThreshold`'s 0.65. A prison has one weight for what unmet need is worth
and one line for "this is bad", and two sets of dials somebody has to keep in
step is how they come to disagree.
`tests/unit/incident-flashpoint.test.ts` asserts the equality so the copy cannot
drift.

An assault names **two** participants — the top two of the ranking — because
`IncidentResponseSystem.lapse` injures every participant, so a one-participant
assault is a prisoner assaulting themselves. It carries the culpability limit
`buildDisciplinaryIndex` already documents and does not widen it: there is no
culprit field anywhere in `src/`, and identifying one is adjudication (#80).

**Its severity is scaled into `1..5`, below `lockdownSeverityThreshold`.**
Severity is an *input* — `IncidentResponseSystem` sizes the response from it and
locks the sector down at 6 — so scoring a fight on the riot's 0-10 scale says two
untrue things: that it needs five guards, and that it justifies sealing every
door. Measured before the ceiling existed: a four-cell prison holding sixteen
prisoners with six guards produced eleven assaults at severities 7-10 and lapsed
nine of them, while containing every riot in the same run.

### 3. The assault defers to the riot structurally, not by having a higher bar

`IncidentTriggerSystem.tryOpenAssault` refuses to open one in a sector whose hot
streak is non-zero.

This is the decision in this document most likely to be argued with, so here is
what happened without it. With the same weights and the same line, **any prison
whose mean is hot has individuals who are hot** — and the riot needs twelve
consecutive hot samples where the assault needs none. The assault therefore
fired first and took the sector's one open incident slot every single time.
Measured: `tests/integration/riot-regime-loop.test.ts`'s two-prisoner neglected
prison produced an assault at tick 13,250 instead of the riot the whole of
[ADR 0057](./0057-what-a-riot-does-to-a-prisoners-day.md) is about.

Raising the assault's threshold above `hotThreshold` was tried first and is the
wrong shape: it makes the separation a matter of degree, so it holds for the
prisons somebody measured and fails for the next one. The gate holds for every
prison and says something true in one sentence: **a riot is what a prison does
when its conditions are collectively bad; an assault is what happens in a prison
that is not having one.**

The cost is stated rather than hidden: a prison in permanent collective unrest
produces riots and almost no assaults. That is the intended reading, and it is
also why the assault reaches exactly the prisons #477 is about — the ones whose
sector score never crosses the line.

### 4. `'escape-attempt'` is gated on who the prison is holding, and on what it failed to find

Two hard preconditions, then a score:

- **Classified high risk** (`riskTier >= 3`, which is exactly where
  `classificationGroupIdForTier` starts answering `'high-risk'`).
- **Concealing something.**

```
escape = sentenceRemaining × 0.3 + contrabandSeverity × 0.35 + staffingShortfall × 0.35   (threshold 0.6)
```

Both gates were measured into existence. As weights, a tier-3 prisoner scored
0.95 carrying nothing in an unguarded prison, and escapes fired in a *well-run*
prison and in ADR 0057's half-built one, deleting the subjects of measurements
about something else. As gates the rule is one sentence: **a prison loses the
people it was told to worry about, with the help of something it failed to
find.**

The means gate is also the only honest shape available. This model has no
perimeter to walk through (see Context), so an escape with no means is the one
part of this the state genuinely cannot support, and asserting it anyway would
be the dice-roll-in-a-costume issue #442 warns about.

An escape attempt names **one** participant. A list would make it several people
gone at once on a single roll.

The feedback loop this opens is emergent rather than designed here, and it is
the strongest argument for reading the tier: `ClassificationReviewSystem` raises
a tier from disciplinary findings every 24,000 ticks, so a prison that riots and
brawls for ten in-game days manufactures its own escape risks out of prisoners
who arrived as nobody in particular.

### 5. A prisoner who gets out is gone

`IncidentResponseSystem.lapse` has written `escaped: incident.type ===
'escape-attempt'` since #28, and it had never once been true in a running prison
because nothing produced that type. The moment there is a producer it can be —
and an incidents panel reading *escaped: yes* beside a prisoner still asleep in
their cell is precisely `AGENTS.md`'s fourth exclusion, a promise the code does
not keep.

So the producer and the departure ship together. `lapse` calls an injected port,
and the session wires it to `PrisonerOperationsRuntime.releasePrisoner` — the
same door a sentence ending uses ([ADR 0050](./0050-when-a-sentence-ends.md)),
so an escape frees the same bed, gives back the same name, drops the same gang
membership and takes the same contraband out of the prison.

Nothing about *why* they left is recorded on the prisoner, because ADR 0050
decision 4 and issue #31 own that. The incident log is where the reason lives,
and it keeps it.

### 6. The quiet period is asked per incident type

`IncidentLog` gains a fifth derived index, `lastIncidentStartedAtTick(sectorId,
type)`, rebuilt in `loadSnapshot` exactly as the four around it are — **no save
field, no version bump**. Read sector-wide by three producers, the first to fire
would silence the other two for its whole window, so a prison that assaulted
every in-game day would stop rioting. The windows are 4,800 ticks for a riot
(unchanged), 2,400 for an assault and 12,000 for an escape attempt, in
proportion to what each one costs.

**One open incident per sector stays shared across all types.**
`IncidentResponseSystem` claims responders from one pool and locks the sector
down by sector id, so two open records in one sector would be two responses
fighting over one lockdown. The cost is that an assault can delay a riot by at
most `responseDeadlineTicks`, and that is the whole of it.

### 7. `contrabandPressure` stays structurally zero, deliberately

ADR 0048 open question 5 asks whether `contrabandPressureWeight` should stay at
0.2 "while its producer does not exist", and left it "so that wiring the
producer changes behaviour rather than requiring a second balance pass". This
document declines that invitation, and it is the one place where it does the
smaller thing on purpose.

A producer was built and then removed: a `ContrabandObservationSystem` writing
decaying, sector-scoped `'observation'` intelligence from what prisoners were
holding. Measured, it added about **0.12** to every prison's sector score,
including a well-run one, and moved #477's staffed row from 0.4824 to roughly
0.60 — five hundredths under a threshold that issue is actively arguing about.
Three things were wrong with that:

1. It re-tunes the riot model sideways while #477 is open, invalidating the only
   two numbers that issue has.
2. It is a risk the player has no lever against, because ordering a search is
   the owner's half (open question 1).
3. It makes contraband a permanent property of every population rather than an
   event.

Contraband still matters — it is a term in both new producers, and it is what
turns chronic neglect into an assault in a staffed prison. It simply does not
raise the *sector's* score yet. Whoever takes #477 inherits the question with
its evidence intact.

## Consequences

### What a player can now cause, prevent and lose

Seven prisons, twelve and a half in-game days each, seed `0x0cc0`, measured on
this branch against `3bfb799` with nothing else changed:

| prison | peak risk (before) | riots (before) | assaults | escapes |
| --- | --- | --- | --- | --- |
| well run, 8 cells / 8 prisoners, 1 guard | 0.1869 (0.1869) | 0 (0) | 0 | 0 |
| well run, 0 guards | 0.4869 (0.4869) | 0 (0) | 12 | 0 |
| beds only, 0 guards | 0.7979 (0.7979) | 4 (4) | 10 | 0 |
| beds only, 1 guard | 0.4824 (0.4824) | 0 (0) | 8 | 0 |
| 8 cells / 16 prisoners, 1 guard | 0.7457 (0.7457) | 4 (4) | 7 | 0 |
| 8 cells / 16 prisoners, 2 guards | 0.5908 (0.5908) | 0 (0) | 10 | 0 |
| 4 cells / 16 prisoners, 6 guards | 0.7950 (0.7950) | 4 (4) | 3 | 0 |

Every peak and every riot count is unchanged. Read down the new columns:

- **A prison that is doing everything right still has nothing happen in it**,
  which is the case a producer is easiest to get wrong.
- **The same prison with no guards at all has fights**, because somebody drew a
  weapon at intake and nobody is watching. One hire ends them.
- **A staffed prison that neglects two of six needs now pays for it** — eight
  assaults where #477 measured nothing — without any weight in the risk policy
  moving.
- **A fully staffed prison that never housed half its population pays most**,
  and needs no contraband to do it: being unhoused is enough on its own.
- **A prison that contains its riots contains its assaults too.** The 6-guard
  row resolved all 13 of its incidents with 43 responders dispatched.

Escapes appear in none of those rows because none of them admits anybody the
prison was warned about. The pair that does is in
`tests/integration/incident-trigger-reachability.test.ts`: the *well-run* prison
above, with `priorIncidents: 2` on every admission, loses **two of its eight
prisoners** with no guards and **none** with one.

### What it costs elsewhere

- **A save written before this restores unchanged.** The new
  `contraband.introduction` stream is merged over rather than replacing what the
  runtime derived (#415), so a bundle that omits it is re-seeded from its own
  `masterSeed`; the repository's own V1 fixture is exercised for exactly this in
  `tests/determinism/save-rng-stream-compatibility.test.ts`. The `'departed'`
  enum widening is an ADR 0038 §1 optional-shaped change and
  `SAVE_SCHEMA_VERSION` stays 5.
- **A fifth named stream changes what a recorded command stream reproduces**,
  which is the ADR 0009 obligation `kernel-system-order.test.ts` documents. The
  retirement it asks for was looked for and there is still nothing to retire:
  this repository ships no challenge definitions, so no stored submission exists
  to invalidate.
- **Four riot fixtures now name the type they are about.** They asserted
  `incidents.all()` and meant "the riots", because a riot was the only thing
  `src/` could produce. No tick, severity, participant list or response figure in
  them moved.
- **`incident.riot.1` is no longer the first riot.** `nextIncidentId` mints from
  one sequence shared by every type, so two tests that looked riots up by literal
  id look them up by type now.

## Open questions

1. **A player cannot order a search, so contraband can be found by nothing.**
   `SearchSystem` is complete — it claims real guards, walks them through the
   real navigation system, dwells, and runs a deterministic detection check —
   and `submitOrder` has no production caller, `searchPolicies` is empty in
   every session, and there is no command type. So the prison now holds
   contraband it has no way to look for. **This is the owner's half**, twice
   over: it is a player-facing gesture, and the policies are content that
   decides how much a search costs. It is also the missing lever that decision 7
   turns on — with a search order, wiring `contrabandPressure` becomes a
   mechanic the player can answer instead of a tax.
2. **Nothing on screen says who is fighting, or that anybody is.** ADR 0057 open
   question 1 already records that nothing says which prisoners are rioting;
   this widens the same gap to two more types and to the contraband behind them.
   No locale key was added ahead of it — `AGENTS.md`'s fourth exclusion — and the
   labels these types need already exist and are now, for the first time,
   reachable.
3. **An assault charges both participants.** `IncidentRecord` has no culprit
   field, so `buildDisciplinaryIndex` credits the pair. Issue #80 owns
   adjudication and it needs a command type.
4. **Should the pair be a cell-sharing pair?** `rateCellSharing` (#79) is the
   authored metric for two prisoners who go together badly, and it is exactly
   what an assault should read. It is not read here because a shared cell needs
   two beds in one room and no fixture or default builds one, so the mechanic
   would fire nowhere. It is the obvious refinement the moment multi-occupancy
   is ordinary.
5. **`'gang-retaliation'` still has no producer**, and is now the only member of
   the union without one. It needs `GangRegistry` entries nothing in `src/`
   writes, which is a relationship model (#39) rather than a trigger.
6. **Does an escape deserve a reputation consequence?** Losing a prisoner costs
   the state income their place was earning and nothing else. Inspections,
   reoffending and external pressure are #31 and `docs/ROADMAP.md` Phase 9.

## What would change my mind

**The weakest claim in this document is that the ladder in the Consequences
table is the right one rather than one self-consistent set of numbers among
many.** Every row is measured, and every row is measured on **one seed**, in
prisons this document's author built, against the room and object catalogues as
they stand. The *shape* is the claim worth defending — needs cause, contraband
escalates, staffing amplifies and contains, and who you admit decides what you
lose — not the constants, which ADR 0017 decision 5 keeps out of ADRs on purpose.

Three things would move me:

- **A second seed disagreeing about the well-run prison.** If a plausible
  furnished, staffed prison produced assaults on some seed, the threshold is too
  low and decision 2's copied 0.65 is the first thing to question.
- **A player finding twelve assaults in twelve days a nuisance rather than a
  stake.** That is the rate an unguarded prison with a weapon in it produces, and
  it is set by one directional constant
  (`DEFAULT_SECTOR_QUIET_TICKS_AFTER_ASSAULT`) that nothing but taste chose.
- **An owner ruling that losing a prisoner is too much consequence for a slice
  with no perimeter.** Decision 5 is the largest thing in this document and the
  hardest to walk back: it deletes an entity. If the answer is that an escape
  attempt should be recoverable — recaptured, or never successful until there is
  something to escape *through* — then decision 4's producer should wait for the
  perimeter rather than shipping ahead of it.
