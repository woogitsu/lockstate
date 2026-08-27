# ADR 0048: What a sector's occupants are, and what it takes for a prison to riot

## Status

**Proposed, 2026-08-27.** Not self-approved.

It answers [ADR 0042](./0042-attaching-consequences-to-the-simulation-loop.md)
open questions 1 and 2, which that document deliberately left to whoever took
its decision 2, and it is implemented on this branch because the owner directed
step 2 to be taken. ADR 0042 itself is still **Proposed** and says *"Nothing in
`src/` changes on the strength of this document until it does"* — so the thing
that authorises the code here is the instruction to take step 2, not this
document or that one. Both should be accepted or rejected together.

**The number is provisional.** ADR numbers are assigned centrally after drafts
return (`AGENTS.md`), 0048 was the stated next free number on `main` at the time
of writing, and the stated next-free number is a ceiling rather than a
reservation — an unmerged branch cannot be seen from `docs/adr/README.md`. If
0048 collides, renumber this file, its row in `docs/adr/README.md`, and the
eleven citations of it in `src/`, `tests/` and `docs/`
(`grep -rn "0048" src/ tests/ docs/`).

## Context

### Where this starts

ADR 0042's one-sentence subject: *"Lockstate has a built, tested, deterministic
consequence chain running from an incident record to a prisoner's timetable, and
no producer anywhere in `src/` can put a record into the front of it in a prison
a player can build."* Its decision 2 is the producer, and it hands the
implementer the question it declines to answer:

> **What is a sector's occupants?** Step 2 decides it and this document
> deliberately does not: the candidates are tiles within a derived perimeter,
> membership by room instance, or membership by accommodation assignment, and
> they differ in cost and in what a player would expect.

### What the code did, and the one place ADR 0042 is wrong about it

`resolveSectorOccupants` in `src/simulation/runtime/new-session.ts` counted
prisoners standing **exactly on the sector's post tile** — one tile of the 1,024
a new prison owns. `ActionSystem` moves an arriving prisoner onto their target
room's anchor tile (`src/simulation/prisoners/action-system.ts`, the *"Abstracted
arrival"* branch), so a housed prisoner was never an occupant of the only sector
there is.

ADR 0042 reads that as *"`needsPressure` is 0 by construction … at most 0.3,
with zero guards, in every prison that houses anybody"*. **The arithmetic is
right and the conclusion is too strong**, and the difference matters because it
is the difference between "no incident is reachable" and "one degenerate
incident is reachable":

- `IntakeSystem` leaves an arrival it cannot house at the
  `accommodation-assignment` stage, **standing on the arrival tile**, which
  ADR 0036 derived to be the same tile as the post. So an over-admitted prison
  did have occupants, and they were exactly the prisoners with nothing.
- `tests/integration/security-default-sector.test.ts` measured the consequence
  before this change: a riot at tick 15,600 in a prison with one bed and three
  admissions, contained by five hires. `docs/INCIDENTS.md` records the same run.

So the true statement is narrower than ADR 0042's and worse in a different way:
**the trigger fired only for prisoners the prison had failed to house at all,
and only while the player had hired nobody.** Both halves are accidents.
Occupancy tracked homelessness because the arrival tile and the post tile
coincide, and one hire took `staffingShortfall` to zero, capping the score at
`0.5 × needsPressure` against a threshold of `0.6`.

Measured on this tree before the change, at 30 in-game days per prison:

| prison | riots |
| --- | --- |
| 1 bed, 3 prisoners, 0 guards | 49 in 20 days (a riot every ~10 hours) |
| the same prison, 1 guard | 0 |
| 8 beds, 8 prisoners, 1 guard, no toilets/showers/yard | 0 |
| 8 beds, 16 prisoners, any staffing | 0 |

That is the whole of what "nothing can go wrong in the prison" meant: one
pathological corner that riots without stopping, and everything else inert.

### The three candidate answers, and why two of them lose

**Membership by accommodation assignment** — a prisoner is in the sector their
cell is in. Rejected outright: an unhoused prisoner has no accommodation, so
the population under the most stress would be the one population the risk model
cannot see. It also cannot answer for a prison with no rooms, which is every
prison at tick 0.

**Membership by room instance** — a prisoner is in the sector containing the
room they are in. Rejected on two counts. There is no room-to-sector mapping
anywhere in the simulation, and `src/simulation/worker/projection-catalog.ts`
already refuses to invent one in its own words: *"inventing a spatial
containment rule here, in the wiring, would be the worst place in the repository
to decide it."* And it inherits the first candidate's defect in a new shape: a
prisoner standing in the open, between rooms or with nowhere to go, is in no
room and therefore in no sector.

**Tiles within a derived perimeter** — adopted, with the perimeter being the
land the prison owns. See decision 1.

### Occupancy alone makes the game *worse*, which ADR 0042 did not see

ADR 0042 orders occupancy first and its own step 4 (widening `needsPressure`
beyond `safety`) fourth, on the grounds that step 4 *"cannot be measured"*
until step 2 lands. That is true. What it misses is that **step 2 without step 4
is a regression**, and the reason is dilution:

`needsPressure` was the mean `safety` deficit over the occupants.
`action.sleep` restores `safety` at 0.2 a tick against a decay of 0.01, so a
prisoner with a bed sits at ~0 and one without a bed at ~1 — the term measured
homelessness. Widening the occupant set from "the homeless standing on the post
tile" to "everyone in the prison" therefore *divides that same numerator by the
whole population*. Measured: a prison of ten with one homeless prisoner reads
0.1 where the old rule read 1.0. Occupancy alone would have made the trigger
strictly harder to reach in every prison that houses anybody.

So decisions 1 and 2 are one change and are taken together. That is a
correction to ADR 0042's ordering, not a widening of its scope: its step 4 is
this document's decision 2, moved because measurement says it has to be.

## Decision

### 1. A sector's occupants are the prisoners standing inside it, and the derived sector is the prison

`src/simulation/security/sector-occupancy.ts` holds the rule:

- For the derived default sector (`security-sector.prison`), a prisoner is an
  occupant when `world.isTileOwned` answers true for the tile they are standing
  on.
- For any other registered sector, the post-tile rule is unchanged.

**Why owned land and not the chunk grid.** `isTileOwnedBy`
(`src/simulation/world/tile-ownership.ts`, ADR 0019) is the repository's one
definition of "is this tile part of the prison", shared with the renderer
specifically so the two cannot drift (#93). Reading the chunk grid instead would
be a second definition *and* would make a game rule a function of a storage
parameter: `AGENTS.md` boundary 8 makes chunking a storage representation and
ADR 0004 picked 32 by benchmark.

**Why the asymmetry is honest rather than a shortcut.**
`SecuritySectorDefinition` records a grade, a set of governed doors, a post tile
and an optional patrol route. **None of those is an area.** The derived sector
is the one sector whose area is known without anyone drawing it — ADR 0036
derives it from owned land, gives it `grade.general` on the stated grounds that
it *"covers the whole prison"*, and names it `security-sector.prison`. A sector
a scenario registered has an area only that scenario knows.

**The alternative that was measured and rejected: a nearest-post partition.**
Assigning each prisoner on owned land to the sector whose post tile is nearest,
ties broken by ascending sector id, is total, general in the number of sectors,
needs no perimeter and no persisted field, and degrades to "everyone" for the
one sector that exists. It was rejected on blast radius against benefit: it
would silently change the occupancy of every sector four test files register on
a live runtime, including `tests/helpers/determinism-scenario.ts`, in service of
sectors nothing in `src/` can create. It is the right answer on the day a player
can draw a sector, and it should be revisited then.

**Not persisted, and no migration.** Occupancy is derived per sampling point
from positions and ownership the save already carries. `SAVE_SCHEMA_VERSION`
stays 5 and `supabase/migrations/` is untouched.

**Deterministic.** Ascending entity id, from an index-order walk followed by an
explicit sort — the ordering discipline ADR 0042 requires this rule to preserve.
No RNG stream is taken, because nothing here draws.

**Cost**, measured on this tree, per pass over the population:

| prisoners | `resolveSectorOccupants` | `countSectorOccupants` | the post-tile rule it replaces |
| --- | --- | --- | --- |
| 200 | 42 µs | 24 µs | 6 µs |
| 1,000 | 111 µs | 83 µs | 8 µs |
| 5,000 (`DEFAULT_PRISONER_CAPACITY`) | 535 µs | 385 µs | 35 µs |

The list is walked once per sampling point (every 50 ticks) and the count once
per deployment update (every 10). At 200 prisoners that is ~3 µs a tick
amortised; at the 5,000 ceiling ~57 µs a tick, a tenth of a percent of the 50 ms
tick. It builds no index and is not a full-map scan. The honest bound is
`O(sectors × population)`, because the walk is per sector — which is the second
reason the nearest-post partition is a later decision rather than this one.

### 2. `needsPressure` is the mean deficit over all six needs, not `safety` alone

Each occupant's deficit is the mean over `NEED_IDS` in declared order; the
sample is the mean of those. This is ADR 0042's step 4, taken here for the
dilution reason above.

`safety`'s 20× restore surplus (ADR 0042 open question 4) is **not** touched.
The question "should sleeping in a bed make a prisoner feel safe?" is a content
question; widening the set makes it stop being the only question, which is
enough for this step.

What the widened term reads, measured over the last ten in-game days of a
30-day run:

| prison | median `needsPressure` |
| --- | --- |
| 8 furnished cells, shower, canteen, yard, 8 prisoners | 0.10 |
| 8 cells with beds and nothing else, 8 prisoners | 0.41 |
| the same amenities, 16 prisoners for 8 beds | 0.55 |
| the same amenities, 16 prisoners for 4 beds | 0.77 |
| 1 bed, 3 prisoners, no amenities | 0.80 |

That is an ordering a player would recognise, and it is what the thresholds
below were chosen against.

### 3. `requiredGuardCount` scales with occupancy — as a floor that only rises

ADR 0042 open question 2, answered **yes**.
`resolveOccupancyScaledGuardCount(scheduled, occupants)` in
`src/simulation/security/sector-staffing.ts` returns
`max(scheduled, ceil(occupants / 8))`, applied in
`DeploymentSystem.requiredGuardCountFor` — the single place the requirement is
read, so what is enforced and what `getCoverageReport` publishes cannot
disagree.

Two properties are load-bearing:

- **It only ever raises.** A `DeploymentSchedule` is authored data, and a rule
  that replaced it would make the authored number unreadable.
- **A scheduled zero is an exemption and stays zero.**
  `applyDefaultSecuritySector`'s "anything already present wins" is what lets a
  save carry a zero, and `tests/helpers/default-security-sector.ts` relies on it
  for every fixture whose subject is not the default sector.

The first draft of this was a system that rewrote the schedule in place every
fifty ticks. It was wrong, and the test that caught it is
`security-default-sector.test.ts`'s *"keeps a zero-guard requirement the payload
carries"*: a rule that **writes** the requirement cannot also honour an authored
one, because after the first write the authored value is gone. That is recorded
here because the wrong version is the obvious one.

Eight per guard was chosen off the ladder in decision 5. Five was measured and
made the shortfall term fire in prisons whose only fault was that nobody had
hired a second guard yet.

### 4. One incident per sector per quiet period

`DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` is 4,800 ticks — two in-game days —
measured from the previous incident's **start**, so the incident's own life
(≤ 600 ticks of `responseDeadlineTicks`) sits inside the window.

Without it the trigger is a treadmill: `resetStreak` spaces incidents by one
sustained window, and in a prison whose conditions do not improve every sample
after the last one closes is hot again. Measured before it existed: **49 riots
in 20 in-game days** in an over-admitted unguarded starter prison, each a
separate record with its own disciplinary points.

It reads a **derived** index on `IncidentLog`
(`lastIncidentStartedAtTick`), maintained in `open` and rebuilt in
`loadSnapshot`, rather than a persisted field or a scan of `all()` — the log is
never pruned, and a per-sample scan of the full auditable history is what
`openIdsBySectorId` exists to avoid. No save-format change.

A `Math.max` rather than an assignment, because `getSnapshot` replays in **id**
order and `incident.riot.10` sorts before `incident.riot.2`; an assignment would
give a restored session a shorter quiet period than the live one it came from.

### 5. The thresholds, and the ladder they were chosen against

`DEFAULT_SECTOR_RISK_POLICY` becomes
`needsPressureWeight: 1, staffingShortfallWeight: 0.3, contrabandPressureWeight: 0.2, hotThreshold: 0.65, sustainedSamplesRequired: 12`.

Read as sentences: **a sector is hot when its prisoners' needs are on average
about two-thirds unmet, or about a third unmet with nobody guarding them, and it
has to stay that way for a quarter of an in-game day.** The weights sum above 1
and the score clamps, which was already true of the shape; what changed is that
the needs term can now reach the threshold on its own, which is the second half
of #442.

Measured with the implementation, 30 in-game days per prison, seed `0x5EC70`:

| prison | guards | riots | first at | outcome |
| --- | --- | --- | --- | --- |
| 8 furnished cells + shower/canteen/yard, 8 prisoners | 0 | **0** | — | — |
| the same | 1 | **0** | — | — |
| 8 cells, beds only, 8 prisoners | 0 | 8 | 13,300 | all lapsed |
| the same | 1 | **0** | — | — |
| furnished, 16 prisoners for 8 beds | 1 | 12 | 15,800 | all lapsed |
| the same | 2 | **0** | — | — |
| the same | 6 | **0** | — | — |
| furnished, 16 prisoners for 4 beds | 6 | 13 | 13,200 | **all resolved, nobody injured** |
| 1 bed, 3 prisoners, no amenities | 0 | 15 | 5,150 | all lapsed |
| the same | 1 | 13 | 12,800 | all lapsed |

The ladder those rows describe, which is the actual decision:

1. A prison that meets its prisoners' needs never riots, staffed or not.
2. A prison missing toilets, showers and a yard riots **only if it is also
   unguarded** — one hire is the whole of the difference.
3. A prison that outgrows its staffing riots, and hiring to the new requirement
   stops it without a cell being built.
4. Past about three times bed capacity, `needsPressure` alone clears the
   threshold and no number of guards prevents a riot — but guards still buy the
   **outcome**: every one of the 13 riots in the 4-beds-for-16 prison was
   contained with nobody injured, where the understaffed prisons lapsed every
   one.
5. The rate in a prison nobody fixes is one riot every two to two and a half
   in-game days, not one every ten hours.

### 6. A riot needs at least two prisoners

`DEFAULT_MINIMUM_RIOT_PARTICIPANTS` is 2. A riot is a collective act;
`IncidentLog` already carries `'assault'` for what one prisoner does;
`IncidentResponseSystem.lapse` injures every participant and sizes the response
from severity, so a one-participant severity-7 riot is a prisoner rioting
against themselves while four guards are dispatched.

The case became reachable only because of decision 1: the smallest prison a
player can build — one furnished cell, one prisoner, no toilet, shower or yard —
sits at about half its needs unmet for ever, and with no guard hired that clears
the threshold.

It suppresses the **incident**, not the risk: such a sector still samples,
scores and accumulates its streak, and opens a riot on the first sampling point
after a second prisoner arrives.

## Consequences

### What a player can now see, cause and prevent

- **Cause.** Admit more prisoners than you have beds; or build cells with no
  toilets and no yard; or let the population outgrow the guards you hired. All
  three are ordinary gestures through the Intake, Rooms, Build and Security
  panels.
- **Prevent.** Build the rooms; or hire a guard. Both are measured above, and
  the second is a single 80-unit `HireStaff` in a prison holding tens of
  thousands.
- **See.** When a riot opens, the status strip's **Incidents** chip goes from a
  green "Clear" badge to a red "Active" one with a count
  (`src/ui/hud/projection.ts`, `projectStatusMetrics`). The lockdown is real,
  the responders walk, and the participants' `riskTier` moves — which changes
  the shape of their day, because `ActionSystem` resolves the regime schedule
  from `classificationGroupIndex` every cycle.

**And the honest gap: the build-up is not on screen.** Three things a player
would need to see it coming are computed and not rendered, and none of them is
this ADR's to fix:

1. ~~`StaffCoverageRowViewModel` carries `required`/`assigned`/`shortage` per
   sector, and no panel renders it — so the requirement rising from 1 to 2 at
   the ninth prisoner, which is the clearest warning the simulation now
   produces, is invisible.~~ **Closed on this branch, and this paragraph is what
   prompted it.** The Staff panel's first block now says how many guards the
   prison asks for against how many it has, in one of three states — *Covered*,
   *Understaffed*, *Unguarded* — with the number of hires that clears the
   shortage in the sentence under it and the hire control two blocks down.
   `src/ui/simulation-staff-coverage.ts` reads `hud/staff`, which had been
   catalogued and unread since #104 shipped it.

   Three things worth carrying here rather than only in the commit. It renders
   the **summed** `totals` and not the per-sector rows, because
   `applyDefaultSecuritySector` derives exactly one sector for every session a
   player can start, and a per-sector list that always has one row reads as
   "here are your sectors" while being a readout of the only one there is; the
   totals stay true with several, because `projectStaff` sums the per-sector
   shortfalls rather than netting the requirement against the headcount. The
   figures are **carried, not derived**: `required` is
   `DeploymentSystem.requiredGuardCountFor`'s answer, which is decision 3's
   rule, and a HUD that recomputed it would be a second definition of a number
   the deployment system enforces. And *Unguarded* is a separate state from
   *Understaffed* on decision 5's own evidence — a prison missing amenities
   riots **only if it is also unguarded** — rather than a second shade of the
   same warning.

   Measured before it was built, in a 12-cell prison driven through the real
   command path with nobody hired: `required: 1, assigned: 0, shortage: 1` from
   the first admission through the eighth, and `required: 2, assigned: 0,
   shortage: 2` **on the tick the ninth is admitted** — 12,788 ticks before that
   prison's first riot at tick 13,200. What the block deliberately does not say
   is that a riot is coming: the same prison holding twelve with one guard sits
   at a shortage of 1 for 30,000 ticks and never riots, while sixteen with one
   guard riots at 13,400 and stops at two. A shortage is a fact about staffing,
   not a prediction.
2. ~~`HudCountsViewModel.prisonerCapacity` is hard-coded to `0` in
   `src/ui/simulation-counts.ts`, so `occupancyTone`'s over-capacity warning on
   the Prisoners chip can never fire — the one existing signal for the main cause,
   overcrowding, is switched off.~~ **Closed on this branch, and this paragraph
   is what prompted it.** `simulation/status-counts` now carries a thirteenth
   count, `accommodationCapacity` — the summed `residentCapacity` of the room
   instances the session's `AccommodationPolicy` names — and `prisonerCapacity`
   maps straight from it, so the occupancy bar renders and both the `>= 0.9`
   warning and the `> 1` danger badge can fire. Marked rather than deleted
   because item 3 below is still open and the three were listed as one
   shortfall.

   Two things worth carrying here rather than only in the commit. The
   denominator is **not** `roomCapacity`: `object.medical-bed` declares
   `'sleep-surface'`, so a furnished infirmary raises that total while intake
   will never house anybody in one. And it is scoped from the policy rather
   than from `room.cell`, so `room.solitary-cell` counts — which matters to
   decision 5's ladder, because a prison of solitary cells is a prison with
   beds.
3. The `SectorRiskTracker` score is withheld from every projection by decision
   (issue #28's "without exposing all hidden calculations"), which is right for
   the raw number and leaves nothing qualitative in its place.

Until at least the first two land, an incident is something a player can cause
and prevent but cannot watch approaching. That is a real shortfall against
"an incident must be something a player can see coming", and it is recorded here
rather than worked around. **The second has since landed on this branch**, so a
player can now watch the overcrowding rung of decision 5's ladder approach and
still cannot watch the staffing one. **And now the first has too**, so both rungs
a player can act on are on screen and what remains open is item 3: there is still
nothing qualitative in place of the withheld risk score, so a prison whose
*needs* are climbing with its staffing already covered — decision 5's fourth
rung — still gives no warning before the riot. Marked rather than rewritten,
because the sentence before each mark was true when it was written and the
shortfall it names has closed one item at a time.

### What this does not change

- No persisted state, no `SAVE_SCHEMA_VERSION` bump, no migration, nothing in
  `supabase/migrations/`.
- No RNG. Every number here is a pure function of state the kernel already
  holds, so no named stream is registered and ADR 0038 decision 2's
  absent-stream rule is not engaged.
- No iteration order moves. `resolveSectorOccupants` sorts,
  `IncidentTriggerSystem.update` sorts its sector ids, and
  `SectorRiskTracker.getSnapshot` sorts.
- `applyRiotRegimeOverride` still has no caller in `src/`, so a riot still does
  not change what its participants *do* during it. See the open questions.

### What it costs elsewhere

- `tests/integration/security-default-sector.test.ts` re-measures: the riot in
  its fixture opens at tick 4,000 instead of 15,600, at severity 7 instead of 6,
  with all three prisoners as participants instead of the two homeless ones, and
  needs four responders instead of three.
- `tests/unit/incident-trigger.test.ts` and `tests/unit/incident-scale.test.ts`
  had harnesses supplying zero and one occupant respectively; both now supply
  two, because occupancy is a gate rather than only a participant list.
- `tests/integration/incident-consequence-loop.test.ts` needed **no** change,
  and that is a result rather than a relief: its one-prisoner prison would
  otherwise have started rioting under it, which is what decision 6 is for.

## Open questions

1. **Does a riot change behaviour, and what would it take?** `ActionSystem`
   takes its schedule array as `private readonly regimeSchedules` and there is
   no setter anywhere in `src/`, so `applyRiotRegimeOverride` has nothing to
   apply through. This step did not need it — the consequence a riot has today
   runs through `IncidentResponseSystem` and `ClassificationReviewSystem`, and
   the latter moves a prisoner *between* schedules that array already holds — but
   a riot that changes what participants do during it needs a way to swap the
   array, and `findRegimeSchedule` runs per prisoner per reconsideration, so
   the shape of that swap is a real decision. ADR 0042 step 2 does not mention
   it.
2. **When a player can draw a sector, does occupancy become the nearest-post
   partition or the drawn perimeter?** Decision 1 rejects the partition *for
   now*; a drawn perimeter would supersede both.
3. **Should the quiet period depend on the outcome?** A contained riot buying a
   longer quiet than a lapsed one would make containment worth something beyond
   the injuries it prevents. Not taken here because it is a second balance value
   with no measurement behind it yet.
4. **Is `safety`'s 20× restore surplus a bug or a balance value?** ADR 0042
   open question 4, still open. Decision 2 makes it one term of six rather than
   the whole of the model, which lowers the stakes without answering it.
5. **Does `contrabandPressureWeight` stay at 0.2 while its producer does not
   exist?** The term is structurally zero until something calls
   `reportInformantTip`. Left as authored so that wiring the producer changes
   behaviour rather than requiring a second balance pass.

## What would change my mind

**The weakest claim in this document is that the ladder in decision 5 is the
right one, rather than one self-consistent set of numbers among many.** Every
row is measured, but every row is also measured against prisons *this document's
author built*, on one seed, with the room and object catalogues as they stand
today. A canteen with more tables, a second seed, or an authored `work` action
would move `needsPressure` and could move a prison from one rung to another. The
ladder's *shape* — needs cause, staffing amplifies, past a point staffing buys
containment instead of prevention — is the claim worth defending; the constants
are directional and `ADR 0017` decision 5 keeps them out of ADRs on purpose.

What would settle it is a player. Failing that: the same ladder measured across
several seeds and a prison somebody else designed.

Two smaller things would also move me:

- **Evidence that the well-run prison at 0.10 is not robustly clear.** It has a
  6.5× margin to the threshold on this tree. If a plausible furnished prison
  were measured near 0.4, the `hotThreshold` of 0.65 would be too close and the
  false-positive risk would be real.
- **An owner ruling that a prison should be able to riot from chronic neglect
  alone, fully staffed.** Today a prison with beds, food and guards but no
  showers, no yard and no toilets sits at 0.41 and never riots. That is a
  defensible reading of "guards keep order" and it is also the rung most likely
  to be wrong.
