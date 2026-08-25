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
- **8 candidate actions**, **2 classification groups**
  (general-population, high-risk) each with their own regime schedule --
  enough to prove the mechanism (data-driven actions, regime-gated
  eligibility, capacity/permission-aware routing), not a balanced,
  complete content set.
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

Resetting the slot is not a release path. Nothing in `src/` destroys a
prisoner entity today, and a real release still has to free room-instance
occupancy, release the actor identity (ADR 0015), drop the gang-membership
entry and clear the `ComponentBitset` bit. A primitive for each of those
four already exists -- `RoomInstanceRegistry.release`,
`ActorIdentityRegistry.release`, `GangRegistry.removeMember`,
`ComponentBitset.remove` -- and nothing calls any of them for a destroyed
prisoner (#31).

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
none of which the module-load call can see. `DAY_LENGTH_TICKS=2,400` is a
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

## Utility AI: deterministic scoring and selection

`utility-ai.ts`'s `scoreAction` is `sum(need deficit x action's per-tick
effect on that need)` -- an action addressing a more depleted need, or
addressing a need more strongly, scores higher. `selectBestAction` picks
the highest score among *already-filtered-legal* candidates, breaking an
exact tie deterministically by ascending action id -- never by RNG or
iteration order. The one intentional RNG use in this whole slice is
`classification.ts`'s screening-variance draw (issue #24: "deterministic
tie-breaking and named RNG only where explicitly intended"); everything
else here is a pure function of state.

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
phase 1 has landed: `PlacedObjectRegistry` holds the objects,
`RoomCapacityResolver` derives a room's two capacities and its capability list
from the ones inside its rectangle, and nothing authors any of the three.

**Two capacities, not one** (ADR 0028 decision 3).
`findAvailableResidence(roomCatalogId, capability?)` gates on
`residentCapacity` -- the summed footprint width of the sleep surfaces in the
room -- and is what `IntakeSystem` asks before a prisoner *lives* somewhere.
`findAvailableForUse` gates on `concurrentUseCapacity` -- the summed footprint
width of every object -- and is what `ActionSystem` asks before a prisoner
*uses* a room now. A canteen that seats fourteen houses nobody, and the single
field could not say both.

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
  reading.** Every room type whose actions resolve by catalogue id derives
  `concurrentUseCapacity` from the objects in it, and phase 1 ships one object
  (`object.bed`), so a canteen, shower room, common room and classroom all
  derive 0 and their actions were already unreachable. The ceiling becomes
  observable in phase 4, when those objects become placeable.

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
producer. Measured on the merged tree, seed 11: a `room.cell` zoned at its
authored 2x3 minimum registers an instance with `capacity: 0` and no object
capabilities, `hasAccommodationTarget()` answers `true`, the admission is
**accepted**, and the arrival advances `queued -> reception ->
classification -> accommodation-assignment` and is still waiting there at
tick 1,000 with `failedCount: 0` and `accommodationBacklogTicks` at 196. A
prison holding nothing zoned, or holding only a 6x6 canteen, is still refused
-- visibly, as one alert row per press.

**One hole this deliberately does not close.** `hasAccommodationTarget`
answers about *any* classification group, because the group is a
`prisoners.classification` draw made two stages later and asking for it at the
command boundary would either move the draw or duplicate it
(`docs/adr/0028-object-placement-and-derived-room-capacity.md`). So a prison
holding a zoned `room.cell` and no `room.solitary-cell` admits an arrival that
is then classified `high-risk`, whose target is `room.solitary-cell`, and which
lands in the terminal `'failed'` stage. That is measured rather than inferred:
with `priorIncidents: 5` and a 300,000-tick sentence, seeds 1, 4 and 12 reach
tier 3, `failedCount` becomes 1, `counts.prisoners` reads 1 and
`counts.prisonersInIntake` reads 0. It is **not reachable from the Intake
panel**, whose `ADMISSION_REQUEST` sends 0 prior incidents and 10,000 ticks:
that scores 0, the screening variance is `-1 | 0 | +1`, and across 300 seeds
only tiers 0 and 1 occur. Closing it is owed work and is not done here.

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
ascending by entity id**, never `occupantsOf`'s insertion order: live
insertion order is assignment order while a restored session's is ascending
id, so a consumer folding them unsorted diverges across a save, and
`canonical-iteration-contract.test.ts` structurally cannot see that
expression. And the rating is **advisory** -- it ranks and never refuses, so
a full prison behaves exactly as before. Whether a rating is ever recorded
rather than recomputed, whether the player may override one, and how a
cell-scoped risk reaches the sector-scoped trigger system are open questions
in [ADR 0027](./adr/0027-cell-sharing-assessment.md), not settled in code.

None of it changes an outcome today, and that is stated rather than left to be
discovered: 36 of the cell registrations in this tree are `capacity: 1` and a
zoned one is `capacity: 0`, so every *free* instance holds nobody, every rating
is 0, and the tie-break returns exactly what `findAvailable` returned. The two
determinism fixtures that do register a cell above 1 each register only one
instance of that room type, so there is nothing for a ranking to reorder
there either. Occupant-aware allocation becomes observable in a
session on the day room capacity is derived from placed objects
([ADR 0028](./adr/0028-object-placement-and-derived-room-capacity.md)), which is
also the day the tripwire above starts failing.

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

## Action execution: idle -> travelling -> performing, via real navigation

`action-system.ts`'s `ActionSystem` reconsiders each prisoner's action
every 20 ticks (issue #24's "action reconsideration cadence through the
multi-rate scheduler"). All pathfinding is delegated to #21/#22's real
`NavigationSystem` -- never a parallel/mocked routing shortcut. A route
failure (permission-denied, unreachable) returns the prisoner to `'idle'`
and counts as observable unmet demand rather than getting stuck.

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
real object-placement tracking (the reason `RoomInstanceRegistry` exists
as an explicit, minimal bridge instead); UI/save-file integration (a session
UI does now exist -- the HUD and save panel mounted by `src/main.ts` -- but
the only prisoner state it surfaces is the status strip's population counts
(#104) -- no roster, no needs, no actions and no cell assignment reaches a
panel, matching #19/#22's precedent of shipping the system before the
surface; the save-file half was closed later,
by #70).
