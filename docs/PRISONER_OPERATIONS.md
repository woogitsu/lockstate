# Prisoner operations: intake, needs, regime and utility-AI action selection

This document covers `src/simulation/prisoners/`: issue #24's first
meaningful gameplay slice -- a representative prisoner lifecycle from
intake through daily action selection, built entirely on top of already-
shipped production boundaries (#14's `EntityStore`, #17/#23's room/object
catalogs, #21/#22's navigation and work-budget scheduling). No parallel
throwaway implementation of any of those exists here.

## Scope: a representative slice, not the final system

Per the issue's explicit scope, this is deliberately bounded:

- **6 core needs** (hunger, sleep, hygiene, bladder, safety, recreation),
  not the full eventual need catalog.
- **10 candidate actions**, **2 classification groups**
  (general-population, high-risk) each with their own regime schedule --
  enough to prove the mechanism (data-driven actions, regime-gated
  eligibility, capacity/permission-aware routing), not a balanced,
  complete content set. It was eight for the whole of issue #24's life; the
  ninth is `action.free-association`, appended for
  [ADR 0042](./adr/0042-attaching-consequences-to-the-simulation-loop.md)
  decision 1, and the tenth is `action.laundry-work`, appended for
  [ADR 0054](./adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
  decision 3 (see *Actions* below for why appending is the load-bearing word).
  **All seven `ACTION_CATEGORIES` now have content.**
  `tests/unit/prisoners-action-catalog.test.ts` carried the seventh, `work`,
  with the reason it did not until ADR 0054 authored it, and its
  `CATEGORIES_WITH_NO_ACTION` map is now empty rather than deleted -- the
  three assertions over it are what fail if a category is ever added without
  content again.
- Final personality/trait depth (#39), full violence/contraband/security
  systems (#26-28), advanced crowd steering and final need-catalog balance
  are all explicitly out of scope here.

## Component layout: hot SoA data, cold metadata (ADR 0005)

`components.ts` follows the existing entity-storage ADR's split:

- **Hot, per-tick-relevant, fixed-width numeric fields** as flat typed
  arrays -- `PrisonerRecordComponent` (sentence/risk/classification/intake
  stage), `NeedsComponent` (needs.ts, one `Uint16Array` per need, holding
  the level scaled by `NEED_SCALE`),
  `CurrentActionComponent` (action index/phase/timing), `PositionComponent`
  (tile-space, integer).
- **Cold, rarely-mutated, string-keyed metadata** as a small wrapper class
  over plain `Map`s -- `PrisonerColdState` holds accommodation assignment
  and the current action's travel target/path-request id, exactly the
  "separate hot typed-array component data from cold/rare metadata"
  architecture note.

All entities share one `EntityStore` (spawned via
`PrisonerOperationsRuntime.admitPrisoner`) and one `ComponentBitset`/
`EntityQuery`, matching #14's existing query machinery rather than
reinventing ad-hoc iteration -- this is the **first production wiring** of
`EntityStore` to spawn real gameplay entities (previously only exercised
by #22's benchmark-only stub actors).

### Slot defaults, and where they are pinned

Every one of those components exposes `reset(index)`, restoring one slot to
the values an *unoccupied* slot holds, and `admitPrisoner` calls all four
before it writes the arrival's own fields. It has to: `EntityStore.spawn`
recycles a freed index and nothing clears a component array on destroy, so
without the resets thirteen of the eighteen per-slot arrays handed a new
arrival the previous occupant's needs, classification and action plan
(#111). The three typed-array components state each default once, in a
`SlotDefault` list that drives both the constructor's initial fill and
`reset`; `NeedsComponent` instead loops `NEED_IDS` in both places, so a
seventh need is covered without a second edit either way.

Two of those defaults carry meaning rather than merely being zero:
`currentAction.actionIndex` is `-1`, the "no action selected" sentinel
`prisoner-projection.ts` tests with `actionIndex >= 0` when deciding whether
to show an action at all, and every need starts at `NEED_MAX`. Both the
reset coverage and the default *values* are pinned in
`tests/unit/prisoner-slot-recycling.test.ts`, which discovers each
component's arrays by reflection, so a nineteenth array fails until someone
states what it reads as when unoccupied.

Resetting the slot is not a release path, and it is still not one -- but the
paragraph that used to stand here said *"Nothing in `src/` destroys a prisoner
entity today"* and named four uncalled primitives, and that has been false since
#441. Both directions are marked rather than overwritten, because the
distinction the old sentence drew is the one that still matters: **a slot is
reset when it is allocated, and a prisoner is released when their sentence
ends, and those are two different events in two different files.**

What release now does is `releasePrisoner`
(`src/simulation/prisoners/release.ts`), reached from
`PrisonerDischargeSystem` or from `PrisonerOperationsRuntime.releasePrisoner`.
It frees room-instance residency and any concurrent-use claim, cancels an
in-flight path request, drops the cold state, releases the actor identity
(ADR 0015), drops the gang membership, unregisters the prisoner from the job
labour pool, clears the `ComponentBitset` bit and destroys the entity -- in
that order, for the reasons that function records. See
[ADR 0050](adr/0050-when-a-sentence-ends.md).

It deliberately does **not** reset the component arrays. That stays where
`admitPrisoner` does it, so the defaults are stated once; a freed slot therefore
keeps its previous occupant's record until the index is reused, and every reader
in `src/` walks `0..maxActiveIndex` behind an `isIndexAlive` guard.

## The end of a sentence (#441, ADR 0050)

`IntakeSystem` writes `sentenceEndTick = tick + sentenceLengthTicks` at the
`classification` stage. Until #441 nothing compared it against the clock, so the
stage machine's `completed` really was the end of the lifecycle and a prison's
population could only rise.

`PrisonerDischargeSystem` (`discharge-system.ts`, order 65, every 20 ticks) now
walks `EntityQuery.execute()` and releases every prisoner whose sentence has
ended. Two guards decide who that is:

- **The stage.** `sentenceEndTick` reads 0 before classification, and 0 is in
  the past, so only `accommodation-assignment`, `completed` and `failed` are
  considered. `failed` is included on purpose: that record was previously
  terminal and undeletable, and its sentence runs like anybody else's.
- **The `Uint32` wrap.** `classifiedAtTickOf` already detects a
  `sentenceEndTick` whose sum overflowed (it is then strictly less than the
  sentence length). Such a prisoner is neither reviewed nor released -- without
  the guard the longest sentence in the game would be the shortest.

Order 65 puts the release after `prisoners.needs-decay` and before
`navigation`, `prisoners.actions` and `operations.jobs`, so nothing hands a
departing prisoner a route, an action or a job on the tick they leave. The
20-tick cadence matches `prisoners.actions`, which bounds how late a departure
can be by one reconsideration cycle.

**The prisoner vanishes rather than walking out**, and that is slice 1 rather
than the finished shape: there is no gate, no reception exit and no action that
targets one. ADR 0050 decision 4 records what slice 2 needs.

## Needs and decay

`needs.ts` defines each need's per-tick decay rate as data (`NEED_DECAY_PER_TICK`),
not an if-chain. `NeedsDecaySystem` (`needs-system.ts`) is a
`SystemRegistration` scheduled every 10 ticks, decaying every prisoner's
every need by exactly that batch's elapsed ticks in one call.

Levels are **stored scaled** by `NEED_SCALE` (200) rather than as whole
0-255 levels, and `decayNeed` works in those stored units. Every rate is a
whole number of stored units per tick at that scale, so decay is exactly
linear in `ticksElapsed`: the same total of ticks gives the same level however
it is split across calls, which makes `schedule.intervalTicks` a scheduling
choice rather than a balance one.

That was not true before #259. Levels were whole numbers in a `Uint8Array`
and `decayNeed` rounded per call, so the ten-tick interval produced a step of
at most `0.5` for five of the six needs -- and `Math.round(n - d) === n` for
any integer `n` and any such `d`. Those five needs never decayed at all, at
any level, so the utility AI had only `bladder`'s deficit to score with. It
was latent only because nothing in `src/` could admit a prisoner at the time
(#261 step 4 has since wired the command, the handler branch and the Intake
panel that produces it). See
`needs.ts`'s `NEED_SCALE` comment for why 200, `docs/PERSISTENCE.md`'s V4
section for the save-format consequence, and
`tests/unit/prisoners-needs.test.ts` plus
`tests/unit/prisoners-needs-decay-system.test.ts` for what pins it.

## Regime: schedule blocks by classification group

`regime.ts` defines `RegimeSchedule`s as data: a list of `(startTickOfDay,
endTickOfDay, allowedCategories)` blocks that must cover every tick of a
`DAY_LENGTH_TICKS`-tick day exactly once (`assertGaplessSchedule` checks
this at module load for the two defaults -- an undefined tick-of-day would
leave action selection with no legal category at all). The check is
exported, because schedules also arrive from elsewhere: `riot-regime.ts`
builds one at runtime, and both `PrisonerOperationsRuntime`'s constructor
options and `projectStatusStrip`'s source accept a caller-supplied array,
none of which the module-load call can see. Since
[ADR 0057](./adr/0057-what-a-riot-does-to-a-prisoners-day.md) the runtime-built
one really reaches action selection: `beginNextAction` asks an injected
`PrisonerRegimeOverrideResolver` for a schedule to use *in place of* the
prisoner's classification group's, and a riot's implementation answers one for
every prisoner the incident log names in an open riot. The array the system was
constructed with is unchanged and has no setter; the override is resolved per
idle prisoner and stored nowhere. `DAY_LENGTH_TICKS=2,400` is a
deliberately short in-game day (not literal 24h/86,400 ticks at 20 Hz) so
a full regime cycle is fast to simulate and test -- a candidate value, not
a locked balance decision. Two representative schedules exist:
general-population (a full daily rhythm: sleep, meals, work/education,
recreation, free association) and high-risk (confined to sleep/meal/hygiene
for 2,200 of the day's 2,400 ticks -- ~92% -- with one brief 200-tick
supervised recreation block).

## Actions: data-driven candidates, not a condition chain

`actions.ts`'s `ActionDefinition`s are pure data: a category (gating them
against a regime block), per-tick need effects, a target (the prisoner's
own accommodation, or a #23 room-catalog id), an optional required
#23 object *capability* tag, and a minimum performance duration. Adding a
new action is one more entry here -- never a new branch in
`utility-ai.ts` or `action-system.ts`.

**Append it. `DEFAULT_ACTIONS` is a save format as well as a catalogue.**
`CurrentActionComponent.actionIndex` is a *positional* index into that array
and `src/persistence/save-schema.ts` carries the integer verbatim, with no id
anywhere near it -- unlike the `needs` object six lines above it in the same
schema, which is keyed by name and whose comment says why. An entry inserted
anywhere but the end shifts every index above it and silently reinterprets
every in-flight action in every existing save: a prisoner who was showering
resumes doing something else, at the same phase and the same tick stamp, with
no decode failure and no `SAVE_SCHEMA_VERSION` mismatch to notice it by.
Appending moves no existing index, so it needs no migration and no version
bump, which is the only reason a catalogue entry is a content change here
rather than a persistence one --
[ADR 0042](./adr/0042-attaching-consequences-to-the-simulation-loop.md)
decision 1 corrects issue #440 on exactly this point.
`tests/unit/prisoners-action-catalog.test.ts` is the gate; this paragraph is
the reason.

**Six of the ten actions target a zoned room, and a regime block whose every
category is served only by those is a block the prisoner stands through.**
`assertGaplessSchedule` answers "does every tick fall in a block" and cannot
answer "does every block leave a housed prisoner something to start"; four of
the two schedules' thirteen blocks failed the second question until
[ADR 0054](./adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
added `'free-association'` to them. Measured on the real kernel, one prisoner,
ten in-game days, a prison of cells and nothing else: **1,442 of 2,400 ticks a
day idle and 560 unmet demand cycles before, 610 and 0 after** -- the 610 being
`ActionSystem`'s twenty-tick reconsideration cadence, which a fully furnished
prison also pays. `hygiene` and `recreation` are still served by nothing in
that prison, deliberately: ADR 0054 decision 1 rules them room-gated by design,
because ADR 0048 makes an unmet need the thing a riot is built out of and a
yard costs no objects at all.

**How much of that riot the neglect is actually paying for was measured on
2026-08-28 and is less than the sentence above implies.** The escape is real —
one 8x8 yard, no objects, takes `recreation` from a floor of 0 to a floor of
233.55, and a shower room with its two heads takes `hygiene` to 212.4 — but the
*pressure* only crosses `DEFAULT_SECTOR_RISK_POLICY`'s `hotThreshold` of 0.65
when the prison is also understaffed. Two needs at zero across eight prisoners
in eight furnished cells peaks at `needsPressure` **0.4824** and produces **no
riot at all** while one guard stands the post; the same prison with no guard
peaks at 0.7979 and riots three times in twenty in-game days
(`tests/integration/room-gated-needs.test.ts`). So a well-staffed prison of
cells leaves both needs on the floor for ever with no consequence anywhere, and
ADR 0054's own amendment records that this is the ruling's open edge rather than
its intent. What it does **not** license is a cell-side sibling: measured at a
quarter and at a sixteenth of a shower's rate, either one removes the unguarded
prison's riot entirely, because `selectBestAction` drives any available route
toward satiation and a low rate sets recovery speed rather than a floor.

**`action.free-association` is the catalogue's one entry with no need effect,
and that is deliberate.** `scoreAction` sums `deficit x effect`, so an action
with no effects scores exactly 0 -- the floor, since no authored effect is
negative -- and it can therefore never displace a candidate addressing a need
that is even slightly unmet. It is reached when nothing better resolves, and
in an exact 0-0 tie where every legal alternative is already at `NEED_MAX`. It
targets `own-accommodation` and names no capability, because an entry that
exists to close a hole has to resolve wherever the hole opens and a
`room-catalog-id` target would need the very room whose absence opens it.
`ActionSystem.continuePerforming` does not stamp `needFulfilledLastTick` while
it runs: that field reaches the HUD verbatim through
`projectPrisonerDetail`, and a "need fulfilled at tick N" that no need was
fulfilled at is a sentence the simulation would not be keeping.

## Utility AI: deterministic scoring and selection

`utility-ai.ts`'s `scoreAction` is `sum(need deficit x action's per-tick
effect on that need)` -- an action addressing a more depleted need, or
addressing a need more strongly, scores higher. `rankActions` orders the
*already-filtered-legal* candidates by descending score, breaking an exact
tie deterministically by ascending action id -- never by RNG or iteration
order. Action ids are unique, so that comparator never answers `0` and the
ranking is a **total order derived from state**, which is what
[ADR 0029](./adr/0029-concurrent-room-use-claims.md) decision 7 commitment 3
requires. `selectBestAction` is its head, derived rather than restated.

**Scoring has no availability term, and cannot have one -- it is a pure
function of needs.** So the ranking says what a prisoner *wants* and
`ActionSystem.beginNextAction` says what they can *have*: it walks the ranked
candidates and starts the first one whose target resolves, **in the same
reconsideration cycle**
([ADR 0041](./adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
decision 1). Before that walk it took one
answer and gave up, which made every
lower-ranked candidate unreachable in that cycle -- and in the next, since
nothing about the prisoner's state had changed in between. `action.eat-meal`
scores strictly above `action.eat-in-cell` on the same need in the same `meal`
category, so a prison with no canteen chose the canteen for ever and fed
nobody: measured at 0 performing ticks of `action.eat-in-cell` and hunger
pinned at the floor, at 1, 4 and 24 prisoners alike, so it was never a
contention effect. `tests/integration/cell-only-meal-fallback.test.ts` is the
run. Ordering the *contended* scan by need urgency is
[ADR 0041](./adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
decision 2 and
is deliberately not done -- ADR 0029 decision 5's unfairness is unchanged, and
under contention a loser now eats a worse meal rather than nothing, which is
measured in `tests/integration/contended-canteen-meal-fallback.test.ts`.

The one intentional RNG use in this whole slice is
`classification.ts`'s screening-variance draw (issue #24: "deterministic
tie-breaking and named RNG only where explicitly intended"); everything
else here is a pure function of state.

**That is still one draw and not two, and it stayed one deliberately.**
`ClassificationReviewSystem` rewrites the very field that draw produces
(see *Classification: a tier that moves* below) and takes no draw of its
own. A draw there would advance `prisoners.classification` on a tick that
has nothing to do with an admission, so reviewing one prisoner would shift
the classification of every prisoner admitted afterwards -- one population's
conduct leaking into another's intake, which is the coupling a named-stream
discipline exists to prevent. `tests/unit/prisoners-classification-review.test.ts`
runs the review on a kernel with **no streams registered at all**, so any
draw throws rather than merely being noticed.

## Room instances: the minimal, real bridge #17/#23 don't provide

#23's content catalog does not track individual *placed* room instances or
which objects sit in which room, and real object-placement tracking doesn't
exist yet. #17's `RoomSystem` didn't either -- it validated an ad-hoc
topology/zoning pair with a mocked body, and #123 item 2 deleted it, leaving
`requirementStatus` in `room-projection.ts` as the one evaluator.
`room-instance-registry.ts`'s
`RoomInstanceRegistry` is the minimal, real (not mocked) layer this issue
needs to make cell/room assignment meaningful: instances are registered
explicitly (id, #23 room-catalog id, anchor tile, the zoned rectangle), with
occupancy tracked and the two `findAvailable*` methods picking the first (by
sorted instance id) instance with free capacity of the kind being asked about
and, if required, the right capability.

**The capacity is no longer registered, and that used to be a stated scope
assumption.** This paragraph read "instances are registered explicitly (id,
room-catalog id, anchor tile, capacity, the object capabilities present)" and
went on to call building the real object-placement system "construction/rooms
work, not this issue's". That work is
[ADR 0028](adr/0028-object-placement-and-derived-room-capacity.md) and its
phases 1 and 2 have landed: `PlacedObjectRegistry` holds the objects,
`RoomCapacityResolver` derives a room's two capacities and its capability list
from the ones inside its rectangle, and nothing authors any of the three.

**Two capacities, not one** (ADR 0028 decision 3).
`findAvailableResidence(roomCatalogId, capability?)` gates on
`residentCapacity` -- the summed footprint width of the sleep surfaces in the
room -- and is what `IntakeSystem` asks before a prisoner *lives* somewhere.
`findAvailableForUse(roomCatalogId, capability?)` gates on that capability's own
ceiling -- the summed footprint width of the objects in the room that carry it --
and is what `ActionSystem` asks before a prisoner *uses* a room now. A canteen
seats diners and houses nobody, and the single field could not say both.

**The use ceiling is scoped to the capability being asked for**, which is ADR
0028's #326 amendment and not its decision 2 as originally written. That rule
summed `footprint.width` over *every* object for one scalar, while
`findAvailableForUse` asked a capability-specific question against it. Measured
at `9d0a125` on the real gate: ADR 0028's worked canteen plus four toilets and a
storage rack admitted **19** diners to tables that seat 6, and an empty 8x8 yard
-- the smallest the zoning gate permits -- admitted **nobody**, while the same
yard holding one three-tile loading-dock door admitted three. Two consequences
worth stating here:

- **An action naming no capability has no object-derived ceiling.** A rule that
  sums object footprints has no domain for a use that consumes no object, and
  `room.yard` is the one room type in `src/content/room-catalog.ts` that requires
  no object -- so it is the one unbounded room, by derivation rather than by
  exemption. `action.common-room-recreation` and `action.classroom-education`
  named no capability and were *not* unbounded rooms, so they now name the
  `'recreation'` and `'education'` their required benches and bookshelf already
  carried.
- **`RoomInstance.concurrentUseCapacity` is still the all-objects total and is
  nothing's ceiling.** True about objects, false about people: 14 for a canteen
  that seats 6. A readout of concurrent use reads
  `concurrentUseCapacityByCapability`, one number per thing the room can be used
  for.

**And the concurrent-use ceiling now binds** (ADR 0028 phase 6,
[ADR 0029](adr/0029-concurrent-room-use-claims.md)). This paragraph used to end
by recording the limit that came with the split: nothing in `src/` added an
actor to a non-accommodation room's occupant set, so `concurrentUseCapacity`
was "a correct ceiling on a number that is always zero". Measured on that code,
through `tests/unit/prisoners-concurrent-room-use.test.ts`'s fixture: 40
prisoners entered a canteen whose `concurrentUseCapacity` was 1, in one
reconsideration tick, because `findAvailableForUse` compared the canteen's
*resident* count -- permanently zero -- against its concurrent-use capacity.
Any capacity above zero admitted an unlimited number of simultaneous users.

`ActionSystem` now claims a place when a prisoner starts performing an action
in a `room-catalog-id` room and releases it when the action ends or is
abandoned, and `findAvailableForUse` gates on that count. Three things follow
that are worth stating here rather than leaving to be discovered:

- **A claim carries its kind.** There are two claim collections, not one
  occupant set, so `occupancyOf` and `totalOccupancy` still mean *residency* --
  which is why no room projection and no income figure moved. `StateIncomeSystem`
  pays per residency slot and a prisoner at lunch earns one prisoner-day, not
  two; `src/simulation/economy/income.ts` had named that exact condition as one
  that had to be settled before this landed.
- **Contention is decided by ascending entity index**, which is
  `EntityQuery.execute`'s order and therefore the order the reconsideration scan
  already runs in. There is no queue and no rotation: when more prisoners want a
  room than it seats, the ones later in the scan are refused, counted in
  `unmetDemandCycles`, and retry on the next cycle.
- **Nothing a player can build is affected yet, and that is the honest
  reading.** Every room type whose actions resolve by catalogue id derives its
  ceiling from the objects in it. **This paragraph used to read "the two
  placeable buildables supply `'sleep-surface'` (`bed-wooden`) and
  `'sanitation'` (`toilet-brick`)" and concluded that a canteen, shower room,
  common room and classroom all derive 0, so those actions are unreachable until
  phase 4 makes the objects placeable.** Phase 4 shipped at `b097e70` (#384,
  v0.0.98): `src/simulation/construction/definition.ts` now declares nineteen
  rows carrying a `placesObjectId`, dining tables, benches and shower heads among
  them, and that same file works the canteen arithmetic this paragraph said was
  not yet observable (`:386-397`). The ceiling is observable now. Before the #326 amendment this was *not*
  the case and the difference was an accident: a bed or a toilet standing in a
  common room gave its capability-blind ceiling a value, so
  `action.common-room-recreation` became reachable off furniture that has
  nothing to do with recreation.

**Who registers an instance (#261).** For as long as `ZoneRoom` had a no-op
consumer, nothing in `src/` registered one except the *restore* path -- so
the only rooms a session could hold were rooms no session had a way to
create, and the status strip's `Rooms` count was structurally zero.
`src/simulation/rooms/zoning.ts`'s `RoomZoningService`, routed from
`runtime/session-commands.ts`, is the registrar for a live session: it paints
the world's per-tile zoning plane with the room catalog's `numericId` and
registers one instance anchored at the zoned rectangle's top-left tile, or
refuses the request (unowned land, an overlap, an unknown room type, a
rectangle below the room's authored minimum) with a reason it keeps in a
bounded window. It registers that instance with **zero capacity and no object
capabilities and then resolves it immediately**, so a rectangle drawn around a
bed that was already standing there is zoned with that bed's capacity rather
than with zero.

**A zoned cell with nothing in it still resolves to zero, and that is now a
state the player can leave.** This section used to say the zero meant "a zoned
cell is a *matching* instance that can never free up, so
`accommodation-assignment` keeps retrying against it rather than failing
fast", and that the rule's justification -- a real prison holds an arriving
prisoner because capacity may return -- "does not hold for a room with no beds
in it". It holds now: capacity *does* return, when the player places a bed, and
the arrival completes on the next scheduled intake tick with no change to the
stage machine at all. The retrying wait is the correct behaviour for the
in-between state rather than a permanent trap.

**What a placement costs and how long it takes.** An object is a
`BuildableDefinition` with a `placesObjectId`, ordered through
`ConstructionSystem` exactly as a wall is (ADR 0028 decision 4): it waits for
materials `ProcurementSystem` delivered, advances on the construction
schedule, and the object appears when the order completes. Measured on a fresh
session: buy one plank at tick 1, zone at tick 2, place at tick 3, and the bed
is standing at tick 150 -- 100 ticks of delivery delay plus three progress
ticks on a ten-tick schedule.

**A cell can now hold both the objects its catalogue entry requires, and that
changes the room's report rather than the prisoner's behaviour.** ADR 0028
phase 2 added one `BUILDABLE_REGISTRY` row for `object.toilet` and no mechanism
at all. Measured on a fresh session
(`tests/integration/furnished-cell-loop.test.ts`): buy one plank and one brick,
zone the 2x3 cell, place a bed at (4,6) and a toilet at (5,6), and at tick 200
the instance reads `residentCapacity: 1`, `concurrentUseCapacity: 2` and
`objectCapabilities: ['sanitation', 'sleep-surface']`, with both of
`room.cell`'s `object` requirements `'satisfied-by-capability'` where the toilet
read `'missing-capability'` before. Admit at tick 200 and the arrival is
`completed` and housed by tick 240, treasury 24,895 rising to 25,195 at tick
2,400 and 25,495 at 4,800.

**The needs loop is byte-for-byte unchanged by the toilet, and this is worth
knowing before reading the phase order as a promise about behaviour.** Every
need level of the housed prisoner is identical at ticks 240, 400, 1,200, 2,400
and 4,800 in a cell with a bed and a toilet and in a cell with only a bed --
because `action.sleep`, `action.eat-in-cell` and `action.use-toilet` all resolve
through `own-accommodation`, which re-checks neither the capacity nor the
capability gate, so a prisoner in a toiletless cell was already using a toilet.
None of the five `room-catalog-id` actions becomes reachable either: they name
canteen, shower room, yard, common room and classroom, and a cell is none of
them.

**An object can now be taken away again, and the room it stood in is not
repaired behind the player's back.** ADR 0028 phase 3 adds a `RemoveObject`
command carrying one tile: the object covering that tile is deleted from
`PlacedObjectRegistry`, the resolver re-derives the room the object's *anchor*
was in, and nothing else moves. A press on a tile with neither a standing object
nor an object still being built is refused as
`remove-object.nothing-to-remove`. Measured on a fresh session
(`tests/integration/object-removal-loop.test.ts`): a cell reading
`residentCapacity: 1`, `concurrentUseCapacity: 2` and
`['sanitation', 'sleep-surface']` reads `0`, `1` and `['sanitation']` the tick
after the bed is removed, and the tile accepts a new bed immediately.

Three consequences are worth stating here rather than leaving to be discovered.

- **A removal reverses no order and refunds nothing.** The order that built the
  object stays `completed`; the materials became an object and do not un-become
  one. What a removal *can* cancel is an order still building something on that
  tile, and that half does give the materials back, because nothing was built
  with them. Without it a bed ordered against money the player did not have
  claimed its tile for the session -- the order sits in `materials-pending`,
  `PlaceObject` refuses `tile-occupied` against orders in flight, and no gesture
  could reach it.
- **A removal is not itself undoable.** It writes no construction order, so
  there is nothing for `Undo` to pop; the object has to be built again. Making a
  removal undoable means putting something on the undo stack that is not an
  order, which is `EditHistoryPort`'s question rather than this phase's.
- **It is reachable without a keyboard, which is the whole reason the phase
  exists.** `Undo` is bound to `KeyZ` and nothing else, so before this a
  misplaced object was permanent for the session on a touch device -- the same
  trap the Rooms tab shipped with (#312) and fixed in a follow-up (#317). The
  Build panel gains a `Remove` toggle beside `Place on map`, which arms the
  object tool to remove; one press on a tile then removes. The numeric fields
  under it dispatch the same command, so the keyboard route arrives with the
  gesture rather than after it.

**Removing an object from a room that is occupied or in use evicts nobody, and
the claim count is allowed to stand above the new capacity.** This is ADR 0028
decision 2 for residency and the same answer extended to the concurrent-use
claims ADR 0029 added *after* that decision was written -- so it is worth
recording as one rule over two collections rather than as two rules:

- **Residency.** `assign` refuses at `occupants.size >= residentCapacity` and
  `findAvailableResidence` skips a full instance, so the room stops taking new
  residents. The prisoner already living there keeps their
  `accommodationInstanceId` and keeps sleeping, because `own-accommodation`
  resolves by id and re-checks neither gate. Measured: remove the bed from an
  occupied cell and the prisoner is still `completed`, still housed, still
  performing `action.sleep` in that cell 2,500 ticks later, while the cell's
  `object` requirement reads `'missing-capability'` and a second cell is what
  `findAvailableResidence` now answers with.
- **Concurrent use.** `claimUse` refuses at
  `useOccupancyOf(instanceId, capability) >= concurrentUseCapacityFor(instance, capability)`,
  and `findAvailableForUse` skips on that same comparison, so the room stops
  taking new users **of the thing whose objects went** while the prisoners
  already performing there finish. Their claims drain through `ActionSystem`'s
  three release sites, none of which consults a capacity -- which is what makes
  a dropped capacity unable to leak a claim -- and `releaseUse` is total, so it
  cannot double-release one either.

  *This bullet said `claims.size >= concurrentUseCapacity` until now, and
  **neither half of that expression is in the code**. `claims.size` counts every
  claim on the instance whatever it consumes, which is `claimCountOf`'s question
  and not any ceiling's; `concurrentUseCapacity` is the all-objects total the
  "Two capacities, not one" section above calls **"still the all-objects total
  and is nothing's ceiling"** -- so the two halves of this document already
  contradicted each other. The sentence was
  **true when it landed** at `955756f` (#328) -- `claimUse` really did read
  `claims.size >= instance.concurrentUseCapacity` there, and took no capability
  argument at all -- and became false at `8a5fdcc` (#335), which scoped the
  ceiling to the capability being asked for.*

  **Measured on a canteen, because a yard can no longer demonstrate a ceiling
  at all.** A canteen seating two, with two prisoners performing
  `action.eat-meal` in it, has every object removed: the `'dining'` breakdown
  goes with them, both claims stand rather than being released, and
  `findAvailableForUse('room.canteen', 'dining')` answers nothing while a fresh
  claimant's `claimUse` is refused -- then `totalUseClaims` is back to 0 once
  the two `minDurationTicks: 40` meals end. That is
  `tests/unit/prisoners-concurrent-room-use.test.ts`'s *"lowers a ceiling under
  a standing claim without evicting anybody, and shuts the door behind it"*.

  *The yard the previous version of this bullet measured on cannot show any of
  it since #326.* `action.yard-recreation` names no capability, so
  `concurrentUseCapacityFor(instance, undefined)` is `+Infinity` by case 1 --
  `room.yard` is the one genuinely unbounded room. Probed on a resolved yard
  registered at `concurrentUseCapacity: 1`: three `claimUse` calls all return
  `true`, and after driving the capacity 1 to 0 `findAvailableForUse` **still**
  returns the instance and a fourth `claimUse` **still** returns `true`, for
  `totalUseClaims: 4`. A room type with no ceiling is the wrong place to
  demonstrate one biting.

**The two alternatives were considered and are worse, for the same reason.**
Releasing the claims at the removal would leave prisoners performing in a room
they no longer hold, which under-counts real use and lets the next prisoner in
over the true ceiling -- the exact failure ADR 0029 exists to remove,
reintroduced from the other end. Refusing the removal while claims are held would
contradict decision 2 for residency outright (a cell with a prisoner in it could
never have its bed taken back) and, for use, would make the control fail for as
long as lunch lasts with nothing on screen saying when it would start working.
`reinstateUseClaim` is the evidence this was already the intended reading: it
deliberately ignores the ceiling so a restore can reproduce a claim count above
it, and it says so citing decision 2. **`unregister` still refuses above zero
claims of either kind**, so a removal opens no route to dropping an instance
somebody is holding: `unzone` answers `room-occupied` exactly as before.

**The save does not move.** A removal deletes a row from the optional objects
section phase 1 added, and neither capacity nor the capability list is persisted,
so a restored over-capacity room is the resolver reaching the same answer from
the same objects rather than a remembered figure.

**Both halves of that are reachable, and the difference between them is where
#261 step 4 drew its line.** An `AdmitPrisoner` command exists,
`createSessionCommandHandler` routes it, and the Intake panel on the Overview
tab produces it -- so a prisoner can be admitted, and the retrying wait above
is exactly the state a zoned cell puts them in. What cannot happen is the
*other* branch: the boundary refuses an admission when no room instance of any
accommodation target exists, rather than allowing the terminal `'failed'` that
branch produces, because `'failed'` is matched by no stage below and is
therefore unrecoverable even after a room is zoned. See
`PrisonerOperationsRuntime.requestAdmission` and
`IntakeSystem.hasAccommodationTarget`.

Which of the two a press meets is now a fact about the prison rather than
about the application, because the Rooms tab (#312) gave `ZoneRoom` a
producer. Measured on the merged tree, seed 11, with the cell **unfurnished**:
a `room.cell` zoned at its authored 2x3 minimum registers an instance with
`capacity: 0` and no object capabilities, `hasAccommodationTarget()` answers
`true`, the admission is **accepted**, and the arrival advances
`queued -> reception -> classification -> accommodation-assignment` and is
still waiting there at tick 1,000 with `failedCount: 0` and
`accommodationBacklogTicks` at 196. A prison holding nothing zoned, or holding
only a 6x6 canteen, is still refused -- visibly, as one alert row per press.

**With the cell furnished, the wait ends.** Capacity comes from the objects
standing in the room since ADR 0028 phase 1
(`src/simulation/objects/room-capacity.ts`), so this paragraph's `capacity: 0`
is the value of an *empty* rectangle and not of every rectangle. Re-measured
through the real commands and the real kernel: a `bed-wooden` built inside the
zoned cell leaves the instance at `residentCapacity: 1` with
`objectCapabilities: ['sleep-surface']`, and the arrival reaches `completed`
and occupies it -- `tests/integration/object-placement-loop.test.ts` asserts
that outcome in literals, along with the 300 minor units of state income the
occupied place then earns on the day's last tick.

**The hole that used to be here is closed, and it was wider than it was
recorded as being.** ADR 0028 decision 8 named a residual gap and left it as
owed work: `hasAccommodationTarget` answered about *any* classification group,
while the `accommodation-assignment` stage asked about *the* group the
`prisoners.classification` draw returned two stages later, so the guard and the
stage could disagree about the same prison. The ADR recorded one direction of
that disagreement -- a zoned `room.cell`, no `room.solitary-cell`, an arrival
classified `high-risk`, the terminal `'failed'` stage -- and recorded it as not
reachable from the Intake panel. That much was right, and is provable rather
than sampled: `classifyPrisoner` makes exactly one `nextInt(3)` draw, so
`ADMISSION_REQUEST`'s 0 prior incidents and 10,000 ticks have three possible
outcomes in total and all three clamp to tier 0 or 1.

**The mirror direction was reachable, and certain rather than improbable.** A
prison holding a zoned `room.solitary-cell` and no `room.cell` passed the same
guard on high-risk's behalf, and every arrival the panel produces is
`general-population` -- by the same arithmetic, and just as certainly -- so it
resolved `room.cell`, found no instance, and was stranded in the terminal stage
while the status strip counted it as a prisoner. Measured before the fix:
2,000 of 2,000 seeds, no refusal recorded, `failedCount: 1`. The Rooms tab
(#312) offers all 18 catalogued room types, so zoning a solitary cell before an
ordinary one is an ordinary first move. The same trap was also in this
repository's own determinism scenario, whose second arrival classifies
`high-risk` into a prison of ordinary cells: on `origin/main` that arrival sat
at `'failed'` with `failedCount: 1`, and the state-income test described it as
one of four prisoners who "does not get" a place.

**What closes it is one question asked in one place.**
`IntakeSystem.resolveExistingTarget` is the first room type in a classification
group's preference order of which the prison holds any instance, and both the
boundary guard and the accommodation stage now call it -- so they cannot
disagree. The guard asks it for *every* group rather than for some group, which
is the only form that is true whatever the draw returns, and
`DEFAULT_ACCOMMODATION_POLICY` names both housing types for both groups so that
"every group" is satisfied by any prison holding either. The property this
buys, asserted exhaustively over every subset of the accommodation room types
crossed with every classification group in
`tests/unit/prisoners-intake-system.test.ts`: **if
`hasAccommodationTarget()` is true, no classification outcome can reach
`'failed'`.**

Two things it deliberately does not do. `'failed'` **stays terminal** -- no
branch is added to `IntakeSystem.update` and `failedCount` still cannot go down
(ADR 0028 decision 8) -- and the fallback fires only for a room type the prison
holds **no instance of at all**, never for one that merely has no free place.
A full preferred room stays a *wait* on that room, which keeps #306's
distinction between "refused, and retrying cannot help" and "admitted, and
waiting" intact in both directions. A prison holding both types is
indistinguishable from before: high-risk still goes to solitary, everyone else
to an ordinary cell.

**The wider request shapes, for the record.** `admitPrisonerSchema` permits
`priorIncidents` up to 255 and a sentence up to `0xffff_ffff`, which is far
wider than the panel's constants, and high-risk needs only two prior incidents
(or one plus a sentence at or over 200,000 ticks). A queued command is
persisted in the save envelope as an unvalidated `jsonValue` and re-dispatched
verbatim on restore, so that shape is a carrier that exists today rather than a
hypothetical future producer -- measured: `priorIncidents: 5` with a
300,000-tick sentence reached the terminal stage in 191 of 300 seeds before the
fix, and in none after it. `priorIncidents` saturates rather than overflowing:
`submitIntake` clamps to 255 and the classifier's term is `min(2, max(0, n))`.

**Who is already in the cell (#79).** `findAvailable` asks three questions
-- room type, an occupancy *count*, an object capability -- and never asks
who the arrival would be sharing with, so with shared cells a
maximum-security prisoner and a minimal-risk one land together whenever that
cell happens to sort first. `findBestAvailable` is the same query with the
current occupants handed to a rating function: lowest rating wins, ties go
to the lowest instance id, a non-finite rating means "not a permissible
placement" and skips the instance, and the scan **stops at the first
candidate rated 0** -- 0 is the contractual floor, an empty room rates 0, so
on the common path the scan exits at the same candidate `findAvailable`'s
`.find` would have, which is what keeps the performance note below true.
`IntakeSystem` passes
`cell-sharing.ts`'s `rateCellSharing`, a pure function whose one term is the
worst classification distance (`|arrival.riskTier - occupant.riskTier|`)
across the live occupants -- the only one of #79's four named inputs that is
both populated and reachable from intake today.

Two properties of that are load-bearing. **Occupants are handed over sorted
ascending by entity id**, never a `Set`'s insertion order: live insertion
order is assignment order while a restored session's is ascending id, so a
consumer folding them unsorted diverges across a save, and
`canonical-iteration-contract.test.ts` structurally cannot see that
expression. `occupantsOf` sorts too since the same argument was applied to
the accessor itself (`tests/determinism/room-occupant-ordering.test.ts`);
`findBestAvailable` keeps its own sort rather than calling it, so that this
per-tick scan and a HUD projection do not share a cost centre. And the
rating is **advisory** -- it ranks and never refuses, so a full prison
behaves exactly as before. Whether a rating is ever recorded
rather than recomputed, whether the player may override one, and how a
cell-scoped risk reaches the sector-scoped trigger system are open questions
in [ADR 0027](./adr/0027-cell-sharing-assessment.md), not settled in code.

**Two of those three moved, and it is worth being precise about which.**
[ADR 0032](adr/0032-incident-consequences-and-classification-review.md)
decides that a *disciplinary* record is derived rather than stored, and gives
the reasoning and the cost -- but a **cell-sharing rating** is a different
object, a snapshot of what was known at one placement decision, and nothing
records one: `findBestAvailable` still recomputes and still stores nothing,
so 0027 question 1 is untouched where it is actually asked. 0032 answers
0027 question 2's *adjudication* half the same way 0027 answers its
placement half -- deferred, because both need a command type -- so the two
now share one blocker rather than two. Question 3 is neither answered nor
touched: there is still no cell-to-sector mapping.

What *did* change under this rating is its input. `riskTier` moves now, so
the distance term is measuring a quantity that varies over a session rather
than one fixed at the gate -- which is the mutability 0027's Consequences
section named as the thing that turns a placement filter into a feedback
loop.

**This paragraph used to say none of it changed an outcome today. It does now.**
What it said was accurate when written: 36 of the cell registrations in this tree
are `capacity: 1` and a zoned one was `capacity: 0`, so every *free* instance
held nobody, every rating was 0, and the tie-break returned exactly what
`findAvailable` returned; and the two determinism fixtures that do register a
cell above 1 each register only one instance of that room type, so there was
nothing for a ranking to reorder there either. It named the condition that would
end that -- the day room capacity is derived from placed objects
([ADR 0028](./adr/0028-object-placement-and-derived-room-capacity.md)) -- and
said that day was also the day a tripwire in
`tests/unit/prisoners-intake-system.test.ts` would start failing.

**ADR 0028 shipped, the tripwire did not fire, and co-occupancy is reachable.**
The tripwire could not fire: it zones an empty rectangle, and an empty rectangle
holds nobody both before and after ADR 0028, so the value it pinned never moved
(the test now records that at length, as the lesson for the next one). Measured
through the real commands and the real kernel, seed 11: two `bed-wooden` in one
zoned 3x3 `room.cell` leave the instance at `residentCapacity: 2`, two
`AdmitPrisoner` commands are accepted with no refusal, and
`occupancyOf('room.cell:3:3')` is **2** with `completedCount: 2` and
`failedCount: 0`.

So `rateCellSharing` ranks real occupants in a shipped session now, and every
test of it still registers its instances by hand. That coverage gap is a
separate finding rather than something this document can close, and
[ADR 0027](./adr/0027-cell-sharing-assessment.md)'s status carries the same
correction.

**Performance note:** `allByRoomCatalogId`/`findAvailable` are a per-tick,
potentially-thousands-of-instances hot path (every pending intake and every
action reconsideration queries them). They are grouped by room-catalog id
and the sorted result is cached, invalidated only for the affected room
type on `register` -- an earlier version re-filtered and re-sorted *every*
registered instance of *every* room type on every single call, which was
fine at small scale but caused severe super-linear slowdown once actor/cell
counts reached the thousands (measured directly while building this
issue's actor-tier tests, before the fix landed).

## Intake: a deterministic per-tick stage machine

`intake-system.ts`'s `IntakeSystem` advances each pending prisoner by at
most one stage per scheduled tick (every 5 ticks), in ascending entity-id
order (`EntityQuery`, never Map/Set order): `queued -> reception ->
classification -> accommodation-assignment -> completed`.
`accommodation-assignment` is **retry-able, not a hard failure** while any
matching room instance could still free up (a real prison holds an
arriving prisoner rather than rejecting them) -- it only becomes
`'failed'` when *no instance of the required room type exists in the
registry at all*, a structural gap retrying can never fix. Backlog is
tracked (`accommodationBacklogTicks`) as the architecture's required
"observable unmet demand, not hidden success."

## Classification: a tier that moves, and what an incident costs (#78, #80)

`classifyPrisoner`'s tier used to be written once, at the
`'classification'` stage, and never again -- a four-value `RiskTier`
collapsing into a boolean at its last step and then standing for the rest
of the session. [ADR 0032](adr/0032-incident-consequences-and-classification-review.md)
makes it move, and makes an incident the thing that moves it.

**A disciplinary record is derived, not stored, and that is what lets this
change fit an existing save.** `disciplinary-record.ts`'s
`buildDisciplinaryIndex` folds two logs the save already carries --
`IncidentLog`'s terminal records and `ConfiscationLedger`'s events -- into
authored integer points per prisoner. Nothing accumulates and no schema
moves, which was not a preference: `SAVE_SCHEMA_VERSION` is 5 and V6 was
already contended by another branch, so a *recorded* record would have been
queued behind it rather than merely more expensive.

The one datum a review needs that no field holds is *when the prisoner was
classified*, and it is recoverable rather than guessed.
`IntakeSystem` writes `sentenceEndTick = tick + sentenceLengthTicks` at the
`'classification'` stage and both operands are persisted, so
`classifiedAtTickOf` is that arithmetic run backwards. It answers
`undefined` for the one case it cannot survive -- a sentence long enough to
wrap the `Uint32Array` sum, which `admitPrisonerSchema` permits -- and such
a prisoner is never reviewed, because inventing a classification tick would
move their tier on somebody else's clock.

**What counts as a finding, and the two limits worth knowing before reading
the mechanic as more than it is.** A finding attaches when an incident
reaches a terminal state (`'resolved'` or `'lapsed'`), and it attaches to
**every participant**. `IncidentTriggerSystem` fills `participantIds` from
the sector's occupants, so the list is "who was there" and not "who did
it", and the injured list cannot narrow it: `IncidentResponseSystem.lapse`
injures every participant and its resolved path injures nobody, so
`injuredEntityIds` is a function of the response and carries no information
about culpability at all. Identifying a culprit *is* adjudication, which
issue #80 asks to be a player decision and ADR 0032 defers because it needs
a command type. And a contraband find is charged to the prisoner it was
found **on**; a stash found in a cell is charged to nobody, because a cell
stash has no owner in the model and splitting it across the occupants would
invent one.

**`prisoners.classification-review` (order 55) is an absolute recomputation,
not a step.** It runs once every `CLASSIFICATION_REVIEW_INTERVAL_TICKS` and
rewrites `riskTier` and `classificationGroupIndex` -- both existing,
already-persisted slots -- from four named factors that sum to the score:
the same long-sentence and prior-incident terms intake already weighed, a
capped findings term, and a capped clean-conduct credit that runs from the
last finding or from classification for a prisoner who has never had one.
The alternative considered was "move at most one tier per review", which
reads better and was rejected on determinism: it makes the tier a function
of how many times the system happened to run, so a save restored across a
scheduled review could hold a different tier at the same tick with the same
evidence. An absolute recomputation is idempotent, so nothing about the
schedule can reach the outcome.

Both caps are what stop the loop dead-ending in either direction, which is
issue #80's "time without a finding must count for something, or the loop
only ratchets one way". `IncidentRecord.severity` is deliberately **not** a
term: it is a `number` with no integer guarantee anywhere in its production
path, and a float inside a score that decides a persisted `Uint8Array` slot
buys no granularity a four-value tier can use.

**The tier scale and the housing group are two axes**, which is the question
issue #78 asks outright. The tier is the four-value `RiskTier`; the group is
`CLASSIFICATION_GROUP_IDS`, and a group *is* a `RegimeSchedule` --
so a third group means authoring another gapless daily timetable and a
message key under `simulation-message-keys.ts`'s completeness gate.
`classificationGroupIdForTier` is the one definition of what tier 3 means,
called from both the intake draw and the review, so the two cannot drift.

**Intake classification is now provisional**, and that is the one existing
behaviour this changed. The screening draw stands until the prisoner has
served a full review period; the first review then reaches the deterministic
assessment. The variance keeps its meaning -- it models a screening at the
gate being imprecise -- and a review correcting it is the point of having
reviews.

**What a moved tier reaches, measured rather than asserted.** Three
consumers, all already wired:

- **The regime**, which is the half a player watches. `ActionSystem` reads
  `classificationGroupIndex` on every reconsideration, so a prisoner who
  reaches tier 3 moves onto the high-risk timetable -- sleep/meal/hygiene for
  2,200 of the day's 2,400 ticks. Measured through the real commands and
  kernel in `tests/integration/incident-consequence-loop.test.ts`: two
  identical prisons, identical seed, identical commands, differing only in
  one riot record, have equal need levels at tick 40,000; by tick 70,000 the
  reclassified prisoner's `sleep` need reads 0 against 1,000 and their
  `safety` need 141 against 1,000.
- **Placement**, through `rateCellSharing`. Its one term is the worst
  classification distance across a cell's live occupants, so a sitting
  prisoner's tier moving changes where the *next* arrival is housed. ADR 0027
  named exactly this as the thing that would turn its placement filter into
  the feedback loop #79 asked for.
- **The published projections.** `projectPrisonerRoster`,
  `projectPrisonerDetail` and `projectStatusStrip`'s
  `counts.prisonersHighRisk` all carry the tier and the group already; that
  count could previously only ever change on an admission.

**What it does not reach is a HUD panel, and that gap is older than this
change.** `prisonersHighRisk` crosses the worker boundary on the
status-counts channel and `hudCountsFromWorkerMessage` drops it, because the
strip has no high-risk chip and there is no prisoner roster panel at all --
the same "shipping the system before the surface" state the *out of scope*
section at the end of this document records.

**And nothing relocates a prisoner, which is why this is the classification
consequence and not the sanction.** `room.solitary-cell` is an intake
destination: `DEFAULT_ACCOMMODATION_POLICY` sends high-risk *arrivals*
there, and a prisoner who is reclassified to high-risk while already housed
**stays where they are**. Moving an already-placed prisoner does not exist in
`src/` in either direction, and a sanction that expires needs both. So a
player who sees somebody in solitary still cannot tell "arrived high-risk"
from "did something", because only the first is possible.

## Action execution: idle -> travelling -> performing, via real navigation

`action-system.ts`'s `ActionSystem` reconsiders each prisoner's action
every 20 ticks (issue #24's "action reconsideration cadence through the
multi-rate scheduler"). All pathfinding is delegated to #21/#22's real
`NavigationSystem` -- never a parallel/mocked routing shortcut. A route
failure (permission-denied, unreachable) returns the prisoner to `'idle'`
and counts as observable unmet demand rather than getting stuck.

**A room removed from under a walk does the same, and until now it did
neither.** `RoomZoningService.unzone` refuses on `claimCountOf > 0`, and by
[ADR 0029](./adr/0029-concurrent-room-use-claims.md) decision 2 a traveller
holds no claim -- so a canteen somebody is *eating in* cannot be un-zoned and a
canteen somebody is *walking to* can. `continueTravelling`'s vanished-instance
exit used to set the phase back to `'idle'` and return, leaving
`currentActionTargetInstanceId` naming the removed room and counting nothing.
That target is not transient: `beginNextAction` overwrites it only when some
candidate resolves, and `projectPrisonerDetail` publishes it as
`targetRoomInstanceId` whatever the phase, so the HUD named a room the player
had already demolished. Measured through the real commands -- prisoner
`'travelling'` to `room.canteen:8:8` with `claimCountOf` 0, `UnzoneRoom`
accepted with no refusal, and twenty ticks later `staleTarget
"room.canteen:8:8", canteenExists false, unmetDemandCycles 14 -> 14`. Both
exits back to `'idle'` now clear the target, and the vanished-instance one
counts the unmet cycle, which is the convention `continuePerforming` already
followed for the same two conditions.
`tests/integration/unzoned-target-mid-journey.test.ts` is the run.

**Abstracted arrival, by explicit design.** On a resolved route, a
prisoner's tile position updates directly to the destination -- there is
no tile-by-tile locomotion simulation. This mirrors #21/#22's own explicit
scope boundary ("actor movement/rendering... out of scope for both");
implementing real per-tick locomotion belongs to a future
rendering/movement system, not this issue.

## Snapshot/restore

`PrisonerOperationsRuntime.getSnapshot`/`loadSnapshot` cover every piece
of dynamic prisoner state this issue owns: entity allocation, records,
needs, current-action state, position, cold accommodation/target metadata
and room-instance occupancy. `NavigationSystem`'s own pending path-request
queue and caches are **not** included -- exactly like #22's route/flow-field
caches are not part of any save today. A prisoner mid-`'travelling'` at
snapshot time is reset to `'idle'` on restore rather than resuming its
exact in-flight request (which referenced the *previous* `NavigationSystem`
instance's queue and could never resolve against a fresh one); the next
reconsideration cycle re-selects and re-requests instead. This is why
`tests/unit/prisoners-operations-scenario.test.ts` proves two properties
separately: **restoring the same snapshot twice and continuing produces
identical outcomes** (restore-then-continue is itself fully deterministic
-- the real guarantee that matters for reloading a save), and **a restored
run stays within the same bounds as an uninterrupted one** (no corruption,
every prisoner still completes intake, needs stay in range) -- not bit-
identical equality to a never-interrupted run, which the in-flight-travel
reset makes an unnecessarily strong claim.

## Wiring into `SimulationRuntime`

`createNewSimulationRuntime` (`src/simulation/runtime/new-session.ts`) now
constructs a `PrisonerOperationsRuntime` alongside `NavigationSystem`,
registers all three prisoner systems on the session's `Kernel`, and seeds
the `Kernel`'s `NamedRngStreams` with `PRISONER_CLASSIFICATION_RNG_STREAM`
(via a new `masterSeed` parameter, defaulting to `0`) -- the runtime's
first named RNG stream consumer. No prisoner is admitted by default;
`createNewSimulationRuntime` wires the *infrastructure*, exactly like
#19/#22 before it wire theirs without fabricating default content -- an
actual session, scenario or `AdmitPrisoner` command still has to ask for one.

**Where an arrival stands.** Nothing here derives a reception point, so the
tile an admitted prisoner is placed on comes from the caller:
`admitPrisoner`'s `originTile`, carried by `AdmitPrisoner` as `x`/`y` and
filled by `src/main.ts` from the same `STARTING_ORIGIN_TILE` the Build
panel's numeric fields start at -- the middle of the one chunk a new prison
owns. A reception room, a door the arrival walks through, or any other
derived arrival point would be a feature to build rather than a default to
inherit.

## Actor-tier performance

Directional-only measurement (not a committed benchmark or threshold,
same caveat as `docs/NAVIGATION.md`), from
`tests/unit/prisoners-actor-tier-scale.test.ts` on this development
container -- a fixed, realistic-scale 300-cell prison (not one cell per
prisoner; see that test file's own doc comment for why), 800 ticks per
tier:

| Actors | Wall time |
| --- | --- |
| 250 | ~243 ms |
| 1,000 | ~391 ms |
| 2,500 | ~728 ms |
| 5,000 | ~1,350 ms |

Scaling is close to linear in actor count, consistent with needs
decay/utility scoring being O(1) per prisoner per scheduled cycle and
`RoomInstanceRegistry` lookups being O(instances of that specific room
type) after the caching fix above. This intentionally does **not**
re-benchmark navigation throughput at scale -- see
`docs/adr/0007-navigation-work-budgets-and-flow-fields.md` and
`docs/NAVIGATION.md`'s actor-tier table for that, already covering
250-5,000 actors converging on shared vs. distinct destinations.

## What is out of scope here

Full violence/gangs/contraband/rehabilitation systems (#27/#28/#30); final
personality/trait depth (#39); advanced crowd steering; tile-by-tile
locomotion/rendering; the complete final need/action catalog and balance;
**"real object-placement tracking" was listed here as out of scope and is
removed, because it shipped**: `PlacedObjectRegistry` and `RemoveObject` are
described by this same document at `:178-180` and `:315-325`, so the exclusion
contradicted the body above it from `6cededc` (#320, v0.0.61) onward. `RoomInstanceRegistry`
remains the explicit, minimal bridge it was built as;
UI/save-file integration (a session
UI does now exist -- the HUD and save panel mounted by `src/main.ts` -- and it
surfaces the status strip's population counts and, since `a613d04` (#383), the
Intake panel's six stage counts and two group counts, which
`src/ui/simulation-intake.ts:162` reads from the `hud/prisoner-population`
projection -- no roster, no needs, no actions and no cell assignment reaches a
panel, matching #19/#22's precedent of shipping the system before the
surface; the save-file half was closed later,
by #70).
