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
was latent only because nothing in `src/` calls `admitPrisoner` yet. See
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
explicitly (id, #23 room-catalog id, anchor tile, capacity, the object
capabilities present), with occupancy tracked and `findAvailable` picking
the first (by sorted instance id) instance with free capacity and, if
required, the right capability. This is an explicit, stated scope
assumption (AGENTS.md: "state assumptions when requirements are
underspecified") -- building the real object-placement/instance-discovery
system is construction/rooms work, not this issue's.

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
actual session/scenario still needs to call `admitPrisoner`.

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
