# Operations: jobs, transactional inventory and utility capacity

This document covers `src/simulation/operations/` (issue #25): the shared
substrate prison operations use to move goods and assign labor without
teleporting anything, plus an initial electricity/water capacity model.
Like #22/#23/#24 before it, this builds on already-shipped boundaries
(#14's `EntityStore`, #16's `ConstructionSystem`, #21/#22's `NavigationSystem`,
#23's item catalog) rather than a parallel throwaway implementation.

## Scope: a representative slice, not every production chain

Per the issue's explicit scope, this is one concrete job kind (`CarryItemJob`)
plus the generic lifecycle/assignment machinery around it, not a fully
generic job-kind registry with distinct implementations per production
chain. "Representative flows prove extensibility; definitions remain
data-driven" (architecture notes) means: delivery/storage/kitchen, laundry
and waste all run through the *identical* `JobBoard`/`Container`/`JobSystem`
code, distinguished only by which item ids and containers a scenario wires
up (`tests/unit/operations-representative-flows.test.ts`). Full economy
pricing, final vehicle traffic/exports/farming/workshop production, detailed
HVAC/electrical simulation and advanced staff morale/skills are explicitly
out of scope, per the issue.

## Container: transactional inventory, not raw counters

`inventory.ts`'s `Container` tracks stock and reservation as two separate
maps so a pending transfer can claim a quantity (making it unavailable to
other claimants) without physically removing it until a carrier actually
arrives to take it -- the mechanism the no-teleport rule below depends on:

```
reserve(itemId, qty)        -- claims available stock, stock stays put
withdrawReserved(itemId, qty) -- commits: stock actually leaves, reservation clears
releaseReservation(itemId, qty) -- cancels a claim without touching stock
deposit(itemId, qty)        -- adds stock directly (a drop-off, or scenario seeding)
```

`reserve`/`withdrawReserved` return a typed `InventoryResult`
(`{ ok: true }` or `{ ok: false, error: InventoryError }`, a discriminated
union over `'insufficient-stock'` / `'insufficient-reserved'`) rather than
throwing on an expected contention outcome -- issue #25's "shortages... are
observable and typed." `deposit`/`reserve`/`withdrawReserved` are the
*only* ways stock changes; there is deliberately no direct "subtract stock"
method, so any removal is auditable through the reserve/withdraw pair (see
the laundry flow test, which uses this to model washing dirty stock into
clean stock outside the carry-job substrate). `ContainerRegistry` holds every
registered container by id with deterministic (sorted-id) iteration.

## Jobs: a five-state carry lifecycle over real navigation

`job.ts`'s `CarryItemJob` implements the full lifecycle issue #25 requires:
`available -> reserved(*) -> assigned -> travelling -> performing ->
completed` with `failed`/`cancelled` reachable from any active state.
(`'reserved'` is folded into `'assigned'` here -- a job's inventory
reservation and carrier assignment happen atomically in the same
`claimAvailableJobFor` call, so there is no observable window where a job
holds a reservation but no carrier or vice versa.) Each job has two legs
(`pickup`, `dropoff`).

**Since [ADR 0093](adr/0093-a-carry-is-an-action.md) a carry is an *action*,
and this section's account of who drives it has changed accordingly.** It read:
*"`job-system.ts`'s `JobSystem` (a `SystemRegistration`, scheduled every 5
ticks) drives both identically through
`beginLeg`/`continueTravelling`/`continuePerforming`"*. That class and that
file were **deleted**. A carry is now `action.carry` in `DEFAULT_ACTIONS`, and
what drives it is split in two:

- **`prisoners.actions` (order 250, every 20 ticks) owns the carrier**: it
  chooses the errand, walks both legs through `LocomotionStore`, and dwells at
  each end. So a carrier is a walker like any other, and the prisoner's own
  `actionPhase` -- not the job -- says whether they are travelling or dwelling.
  A live job therefore stays `'assigned'` for its whole active life;
  `'travelling'` and `'performing'` are states only a save written before ADR
  0093 can carry, and `JobBoard.loadSnapshot` normalises the first of them.
- **`carry-executor.ts`'s `CarryJobExecutor` owns the stock**: claim with a
  reservation, commit it on pickup, deposit on drop-off, and give everything
  back on failure or cancellation. It is a plain object `prisoners.actions`
  calls, not a scheduled system.

The four steps below describe the lifecycle in that shape:

1. **Assignment** (`CarryJobExecutor.claimAvailableJobFor`): the
   highest-priority available job (priority descending, then id ascending --
   never Map iteration order) is matched to an idle carrier whose job's source
   container can actually `reserve` the required quantity. **Who asks first is
   `prisoners.actions`' idle scan** -- descending need urgency, ties by
   ascending component index (ADR 0062) -- where it used to be
   `JobWorkerPool.idleWorkers()`' ascending entity id; since #441 an id is
   `(generation, index)` and the two orders differ. A
   job whose source lacks stock **stays `'available'`** rather than
   failing -- issue #25's "backpressure... observable" as a state, not an
   error. This is also the **boundary**: both of a job's container ids are
   looked up here, before anything is reserved, and a job naming an id the
   `ContainerRegistry` does not hold fails immediately with
   `'unknown-source-container'` or `'unknown-destination-container'` --
   holding no reservation, occupying no worker and moving no stock.
2. **Travel** (`beginLeg`/`continueTravelling`): delegates entirely to the
   real `NavigationSystem` (#21/#22) via `requestRoute`/`getResult` --
   never a shortcut or parallel routing implementation. A `permission-denied`/
   `unreachable` outcome fails the job with that reason recorded on
   `job.failReason`.
3. **Performing** (`continuePerforming`): a fixed dwell -- five ticks, held as
   `minDurationTicks` on the `action.carry` row of the action catalogue
   (`src/simulation/prisoners/actions.ts:406-408`) since ADR 0093 moved it there --
   at each leg's destination, then `withdrawReserved` (pickup) or `deposit`
   (dropoff) -- the only points where a job actually touches inventory.
   Both container lookups here are **lenient**, and a missing container fails
   the job with the same named reason the boundary would have given it. They
   were `ContainerRegistry.require`, which throws, and this runs inside a
   scheduled system update where a throw faults the worker rather than
   refusing anything: on the dropoff leg it threw with the withdrawal already
   committed, so one unregistered container id ended the session *and*
   destroyed the stock the carrier was holding. The boundary above does not
   make this redundant and this does not make the boundary redundant -- a job
   restored from a save never passes through `assignAvailableJobs` at all, so
   the boundary cannot see it, and only this recovers a save that already
   carries such a job.

**Cancellation/failure gives back whatever the job was holding, and which
that is depends on the leg.** `JobSystem.failJob` and `JobSystem.cancel` share
one implementation of it, `compensateHeldStock`, so the two paths cannot drift
apart. An active carry job holds exactly one of two things and the leg decides
which:

- On the **pickup** leg it holds the `reserve` made at assignment time, and the
  stock is still physically in the source container. Release the claim.
  `cancel` guards against releasing a reservation a job never made: a job
  cancelled while still `'available'` never reserved anything, and because
  `Container` tracks reservations per *item* (not per job), releasing one anyway
  would silently steal a different job's real reservation for the same item id.
  The leg and state are read *before* `JobBoard.cancel` mutates the state to
  `'cancelled'`, specifically to avoid that bug (found via
  `tests/unit/operations-carry-executor.test.ts`'s dedicated regression test --
  the file was `operations-job-system.test.ts` until ADR 0093 renamed it with
  the class it tests, and its conservation literals moved with the code rather
  than being rewritten).
- On the **dropoff** leg `continuePerforming` has already committed
  `withdrawReserved`. There is no reservation left to release and the quantity
  is in the carrier's hands, in no container at all. It is **deposited back into
  the source container** — see the no-teleport rule's third exception below.

**This paragraph used to describe only the pickup half, and the code matched
it.** `hadReservation = job.leg === 'pickup' && job.state !== 'available'` was
correct about reservations and silent about stock, so a job cancelled or
route-failed past its pickup compensated nothing and the goods it was carrying
ceased to exist — measured on v0.0.112 at 10 bricks in, 6 after, 4 destroyed,
which is the conservation property this substrate exists to provide, inverted.
The asymmetry is the lesson worth keeping: the pickup case had a dedicated
regression test and the symmetric dropoff case had none, so a green suite said
nothing about half of a two-legged mechanism. `docs/adr/0037-goods-in-a-carriers-hands-when-a-carry-job-dies.md`
records the design question the repair had to answer, and
names the two alternatives (a floor stack at the carrier's tile; an accounted
void) that were not taken.

## The no-teleport rule

Every unit of every item that *moves between containers* does so through a
`CarryItemJob`'s two navigation-backed legs -- `deposit` only ever happens at
a job's actual dropoff tile, after `withdrawReserved` actually happened at
its actual pickup tile. There is no direct container-to-container transfer
method anywhere in `inventory.ts`.

There are **three** deliberate exceptions, and none is a transfer:

- `ContainerMaterialsProvider` (below) does not move anything between
  containers -- it only *consumes* stock already sitting in the one container
  it is bound to, exactly like a construction site consuming materials
  already delivered there by ordinary carry jobs.
- **`ProcurementSystem.update` (`simulation/economy/procurement.ts`) calls
  `deposit` at no tile at all**, when a purchased delivery's
  `arrivesAtTick` comes due **and the prison has not built the route**. It is
  not a transfer because there is no source container: the goods are bought
  from outside the prison and materialise on arrival, so there is nothing for a
  carry job's pickup leg to pick up from.

  **This exception stopped being unconditional at
  [ADR 0093](adr/0093-a-carry-is-an-action.md), and the sentence it used to
  carry is kept because the debt it named is what was paid.** It read: *"What
  it *is* missing is the physical route -- ADR 0017 §4 names
  `room.delivery-bay` and `object.loading-dock-door` as the intended
  destination, and until a delivery lands in a bay and a carry job takes it to
  the site, the deposit is scaffolding."* A delivery now lands in a bay and a
  prisoner carries it to the storeroom wherever the player has built and
  furnished both ends (`operations/delivery-route.ts`), so **the deposit is no
  longer scaffolding there**. It stays exactly this exception wherever either
  end is missing or unfurnished, which is ADR 0093 decision 2's graceful
  fallback -- and that is not a hedge: a bay zoned before the first cell is
  furnished would otherwise strand every delivery, because the only carriers
  are prisoners and a prisoner needs a built bed to be admitted. That was
  measured rather than reasoned about; `DeliveryBayCarryRoute`'s header carries
  the prison it was measured on.

  The construction container is still the same object
  `ContainerMaterialsProvider` draws from (`runtime/new-session.ts` wires both
  from one local), and the storeroom is bound to it rather than to a container
  of its own, so the loop closes at the same place it always did -- **but the
  location-blindness now has a cure a player can buy**: where the route
  exists, materials arrive when somebody has carried them, so where the bay and
  the storeroom sit is a choice the player is making.

  **This exception carries much more traffic since #627, and no new call
  site.** ADR 0017 decision 7 -- *"materials are just-in-time by default"* --
  is now implemented, so **every** build order the queue cannot cover raises a
  purchase of its own (`JustInTimeMaterialsService`), where before a purchase
  happened only when a player pressed *Buy*. Nothing new calls `deposit`: the
  goods still arrive through this same `ProcurementSystem.update`, so the list
  of exceptions is unchanged and this one is not a fourth. What changed is how
  much of the prison's building now depends on it, which makes the missing
  physical route -- ADR 0017 §4's bay and dock door -- a larger debt than it
  was rather than a different one. The location-blindness in the sentence above
  is the part that grows: a dragged wall run 400 tiles from anywhere summons
  its bricks out of nothing, at the site, on the press.

- **`CarryJobExecutor.compensateHeldStock` returns a dying job's carried
  quantity to the container it came from**, when a job on the **dropoff** leg is
  cancelled or fails. (It was `JobSystem.compensateHeldStock` until ADR 0093
  deleted that class; the method moved verbatim in behaviour and ADR 0037 holds
  without amendment.) It is not a transfer either: the goods go back to the one container they
  were withdrawn from, so no quantity moves *between* containers — the same
  ground `ContainerMaterialsProvider` stands on, and the same `deposit`-rather-
  than-reservation-reversal reasoning, because `withdrawReserved` already
  committed and the reservation it consumed no longer exists.

  What it *is* missing is the same thing `ProcurementSystem` is missing, and
  more sharply: the return has **no route and no tile**. A carrier that fails two
  tiles short of its destination puts the goods back wherever the source
  container is, which may be the far side of the prison. That is a real erosion
  of this rule rather than a footnote to it, and it is stated here rather than
  smoothed over: it is the cheapest thing that conserves stock without inventing
  a representation for goods sitting on the floor, and no more than that.
  `docs/adr/0037-goods-in-a-carriers-hands-when-a-carry-job-dies.md` is where
  that trade is recorded and accepted; the floor-stack alternative is the one that
  would make this rule true instead of thrice-excepted.

Anything else calling `deposit` outside `operations/` is a fourth exception
and belongs in this list before it is written.

## Construction-material integration (#16)

`construction/materials-provider.ts` defines the seam:

```ts
interface ConstructionMaterialsProvider {
  tryAllocate(requirements): boolean;
  release(allocations): void;
}
const UNLIMITED_MATERIALS_PROVIDER: ConstructionMaterialsProvider = {
  tryAllocate: () => true,
  release: () => {},
};
```

`release` is required, not optional: against a finite stock a cancelled order
that had already allocated would destroy its materials permanently, and
`undo()` goes through `cancelOrder`. A provider that cannot say what it does
on cancellation is not a usable provider.

**Since the owner's ruling 20 of 2026-08-31 that is no longer what every
cancellation does, and the paragraph above is kept because the seam still
exists for its reason.** [ADR 0076](./adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
amendment of that date -- *"Anulowanie zwraca pieniądze zamiast cegieł"* and
*"Pieniądze dopóki ekipa nie zaczęła"* -- has `cancelOrder` give back **money**
for an order in `'assigned'`, and **nothing at all** for one in
`'in-progress'`, whose materials are consumed by the works. Three callers of
`release` are left, and the unbuildable-prison failure above is what it
prevents in every one of them:

- a `'completed'` order being un-built, which ADR 0076 decision B governs and
  ruling 20 does not reach;
- a requirement the procurement catalogue cannot price, which no refund can pay
  for honestly;
- any `ConstructionSystem` with no procurement sink behind it -- a bare system
  rather than a session, with no treasury to pay from, which therefore does what
  it always did.

**The first of those three went on 2026-09-01 and the list is marked rather
than trimmed, because which caller left and when is the record.** The owner's
ruling of that date -- *"Taking a finished object away returns nothing. Not its
materials, not its money."*, [ADR 0076](./adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
amendment of that date -- reverses decision B, so a `'completed'` order releases
nothing either and **two callers are left**: the unpriceable line, and the bare
system with no sink. Both are still exactly what the paragraph above describes,
and the seam is still required for them.

**What that does to the justification at the top of this section is worth
saying plainly.** *"Against a finite stock a cancelled order that had already
allocated would destroy its materials permanently"* was written as the reason
`release` must exist. After two rulings it is no longer a description of any
cancellation a session performs: `'assigned'` converts to money,
`'in-progress'` and `'completed'` destroy the materials **on purpose**, and the
only cancellations that still put stock back are the two above. The sentence is
kept because it is still true of the *seam* -- a provider that could not answer
a release would leave those two with nowhere to go -- and because it is the
argument that got the seam built.

`ConstructionSystem`'s constructor now takes an optional provider
(defaulting to `UNLIMITED_MATERIALS_PROVIDER`, so #16's original behavior
is unchanged for any caller that doesn't pass one). `inventory.ts`'s
`ContainerMaterialsProvider` implements the interface against a real
`Container`: it checks *every* requirement is available before withdrawing
*any* of them, so a shortfall on one item never leaves a build order with
some materials consumed and others missing (`tests/unit/operations-construction-integration.test.ts`
proves the all-or-nothing property directly). A build order genuinely
**waits** in `'materials-pending'`, retried every scheduled tick, until a
session/scenario (typically ordinary carry jobs delivering into the site
container) satisfies it -- issue #25's "construction orders can wait for
and consume delivered materials."

## Utility networks: capacity, not simulation

`utility-network.ts`'s `UtilityNetwork` (one instance per `'electricity'`
or `'water'`) is a capacity-bounded graph, explicitly **not** a detailed
electrical/hydraulic simulation (out of scope, per the issue). Producers and
consumers are nodes; `connect` forms an undirected graph. `evaluate()`
computes per-**connected-component** state: within a component, a
non-failed producer's capacity is allocated to non-failed consumers in
ascending node-id order until exhausted -- deterministic, not
proportional/fair-share, so identical network state always produces
identical allocation. Three typed states cover issue #25's "consumers
respond to capacity/connectivity/failure state": `'powered'`,
`'disabled-no-supply'` (reachable, but the component's aggregate capacity
ran out before reaching this consumer) and `'disabled-failure'` (the node
itself is explicitly marked failed via `setFailed`, regardless of
capacity). Two disconnected components are evaluated fully independently --
a surplus in one never reaches a shortage in the other
(`tests/unit/operations-utility-network.test.ts`). Evaluation is cached and
only recomputed when a structural change (`addNode`/`connect`/`setFailed`)
bumps an internal revision counter -- "capacity networks operate on
explicit graphs/regions and invalidation, not whole-world scans."

## Who carries: the regime, not a registry

**This section described a worker-adapter abstraction that has been deleted**
([ADR 0093](adr/0093-a-carry-is-an-action.md) decision 4), and what it said is
kept below because the *boundary* it described survives with the arrow
reversed.

It read: *"`job-system.ts`'s `JobWorkerAdapter` interface (position get/set,
route context) lets `JobSystem` assign and move workers without depending on
any specific entity/component model ... `prisoners/job-worker-adapter.ts`'s
`PrisonerJobWorkerAdapter` is the one concrete bridge shipped so far ... No
prisoner is registered as a job worker by default."* Both of those files and
both of those types are gone. The last sentence was the finding #600 was opened
about: nothing in `src/` ever registered anybody, so no prisoner was ever in the
labour pool in a session a player could reach.

What replaced it:

- **Eligibility is the regime's.** A prisoner is offered `action.carry` when
  they are idle at a reconsideration, intake is `completed`, and their active
  block allows `work`. Two consequences follow from the schedules rather than
  from any code here: `HIGH_RISK_REGIME` has no `work` block, so a high-risk
  prisoner never carries, and `RIOT_ALLOWED_CATEGORIES` has no `work`, so nobody
  carries during a riot.
- **Busyness is the board's.** `JobBoard.activeJobFor(entityId)` answers which
  errand a prisoner is on, from the job's own `assignedWorkerId`. It is derived
  rather than stored -- `operations.jobWorkers` is still in the save payload,
  written empty and ignored, because removing the key would be a
  `SAVE_SCHEMA_VERSION` bump for two empty arrays.
- **`operations/` still names no entity model.** `CarryJobExecutor` takes a
  `JobBoard` and a `ContainerRegistry` and nothing else; `EntityId` is
  `entity/`'s numeric handle, which `JobBoard` already took. The generality the
  adapter carried -- *"prisoners today, staff later"* -- is not kept, and that
  is deliberate: a guard carrying something would be a guard errand under ADR
  0088's `LocomotionStore`, not an entry in `DEFAULT_ACTIONS`, and keeping an
  abstraction nothing uses would pre-empt that decision.

## Snapshot/restore

`Container`, `ContainerRegistry`, `JobBoard` and `UtilityNetwork` each expose
`getSnapshot`/`loadSnapshot`, covering "queues, reservations, inventories and
networks" together (`JobWorkerPool` was a fifth and was **deleted** by ADR
0093; the fact its snapshot carried is now derived from each job's
`assignedWorkerId`, and `JobBoard.loadSnapshot` rebuilds the index) (`tests/unit/operations-snapshot-restore.test.ts`
proves all of them round-tripping through fresh instances in one scenario,
not just per-class in isolation). Like `PrisonerOperationsRuntime` before
it, a job's `pathRequestId` is meaningless once restored -- it referenced
the *previous* `NavigationSystem` instance's pending-request queue, which a
freshly constructed one never received and would never resolve, leaving the
job stuck in `'travelling'` forever. `JobBoard.loadSnapshot` drops any
restored `'travelling'` job back to `'assigned'` (clearing the stale id) so
`JobSystem.beginLeg` re-requests routing on the next scheduled tick -- the
same convention `PrisonerOperationsRuntime.loadSnapshot` uses for
mid-travel prisoners. **`JobSystem` no longer exists**: ADR 0093 folded the
carry into `ActionSystem` and deleted it
(`src/simulation/prisoners/actions.ts:392`), so the two clauses above that name
`JobSystem` describe the pre-0093 substrate and have not been re-verified
against what replaced it. `JobBoard` and `PrisonerOperationsRuntime` are not
affected: both are still here. The paragraph here used to end *"`JobSystem`'s own
`performingSince` dwell-timer map is intentionally not part of any snapshot
(session-scoped, like `IntakeSystem`'s counters) -- a restored `'performing'`
job simply restarts its dwell timer"*, and **ADR 0093 retired both halves of
that**: `performingSince` is deleted and the dwell timer is the prisoner's
`phaseStartedAtTick`, which the save does carry (decision 5,
`src/simulation/operations/carry-executor.ts:28` and
`src/simulation/prisoners/action-system.ts:775`). A restored carry therefore
resumes its dwell rather than restarting it, and nothing about the wait is
session-scoped any more.

A restored job may name a container the restored session does not hold:
`restoreSessionSystems` registers a container per *container-snapshot* entry
and never consults a job's ids, and a restored job re-enters the lifecycle at
the state it was saved in rather than at assignment. That is the route by
which an unknown container id reaches `continuePerforming` above now that
`assignAvailableJobs` refuses one, and it is why both places check. Such a
job fails cleanly on its next scheduled tick, giving back whatever it held;
if the container that is missing is the **source** of a job already carrying
stock, there is nowhere to give it back to and the quantity is gone -- the
one hole `compensateHeldStock` cannot close, because the destination it would
return goods to is the thing that does not exist.

## Wiring into `SimulationRuntime`

`createNewSimulationRuntime` now constructs a `ContainerRegistry` (seeded
with one well-known `CONSTRUCTION_MATERIALS_CONTAINER_ID` container so
`ConstructionSystem` always has somewhere real to draw from), a `JobBoard`/
`JobWorkerPool`/`JobSystem` (wired to a `PrisonerJobWorkerAdapter` over the
session's `PrisonerOperationsRuntime`), and empty `electricity`/`water`
`UtilityNetwork`s -- all exposed on `SimulationRuntime`. Exactly like
#19/#22/#24 before it: this wires real infrastructure with no fabricated
default content. No stock, no non-construction containers, no registered
job workers and no utility nodes exist until an actual session/scenario
creates them.

## Representative flows

`tests/unit/operations-representative-flows.test.ts` proves all three flows
the acceptance criteria name, through the identical substrate:

- **Delivery -> storage -> kitchen/canteen**: a two-hop food chain, running
  *concurrently* with a construction order's material delivery on the same
  `JobBoard`/`ContainerRegistry`/`JobSystem` -- proving "construction and
  daily operations share the same substrate" (Definition of Done), not two
  parallel implementations. The second hop genuinely waits for the first to
  actually deposit stock (asserted at tick 0, before the first hop
  completes) rather than racing ahead.
- **Laundry**: cell hamper -> laundry (dirty linen) -> clean storage (clean
  linen), with the dirty-to-clean conversion performed directly against the
  laundry `Container` via its reserve/withdraw pair (the conversion itself
  is a regime/session concern outside this substrate, exactly like cooking
  would be outside a food-delivery carry job).
- **Waste**: a collection job, including cancelling one before it ever
  reaches `'travelling'` (reserved only, immediately after assignment) to
  prove reservation release doesn't depend on a job having started moving.

## Scale

`tests/unit/operations-scale.test.ts` runs 300 concurrent carry jobs across
20 workers and a 40-cell block to completion (asserting correctness --
every job completes, inventory is conserved, no leftover reservations --
and reporting wall-clock time to the console as directional evidence, per
`docs/BENCHMARKING.md`'s "no hard timing threshold without repeated
controlled baselines" policy), and evaluates a 501-node utility network
(1 producer, 500 consumers) confirming deterministic ascending-id capacity
allocation and revision-cached evaluation stay correct at that scale.

## What is out of scope here

Full economy/pricing; final vehicle traffic, exports, farming or workshop
production chains; detailed HVAC/CFD or electrical engineering simulation
(the utility model is capacity-graph only); advanced staff morale/skills;
final UI/visual effects (a session UI does now exist -- the HUD and save
panel mounted by `src/main.ts` -- and since `0e70f14` (#367) the Build queue
surfaces an order in `'materials-pending'`, the state this document's
`ContainerMaterialsProvider` produces: `src/ui/hud/view-model.ts:828` carries it,
`src/content/simulation-message-keys.ts:510` labels it "Awaiting Materials" and
`src/rendering/world/structures.ts:31` draws it. Nothing surfaces containers,
jobs or the utility networks. **This clause read "nothing in it surfaces any of
this"**,
matching #19/#22/#24's precedent of shipping the system before the surface); a fully generic job-kind registry (this issue ships one
concrete job kind -- `CarryItemJob` -- plus the reusable lifecycle/
assignment machinery around it, per "representative flows prove
extensibility").
