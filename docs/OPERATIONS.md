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
reservation and worker assignment happen atomically in the same
`assignAvailableJobs` pass, so there is no observable window where a job
holds a reservation but no worker or vice versa.) Each job has two legs
(`pickup`, `dropoff`); `job-system.ts`'s `JobSystem` (a `SystemRegistration`,
scheduled every 5 ticks) drives both identically through
`beginLeg`/`continueTravelling`/`continuePerforming`:

1. **Assignment** (`assignAvailableJobs`): the highest-priority available
   job (priority descending, then id ascending -- never Map iteration
   order) is matched to the first idle worker (ascending entity id) whose
   job's source container can actually `reserve` the required quantity. A
   job whose source lacks stock **stays `'available'`** rather than
   failing -- issue #25's "backpressure... observable" as a state, not an
   error.
2. **Travel** (`beginLeg`/`continueTravelling`): delegates entirely to the
   real `NavigationSystem` (#21/#22) via `requestRoute`/`getResult` --
   never a shortcut or parallel routing implementation. A `permission-denied`/
   `unreachable` outcome fails the job with that reason recorded on
   `job.failReason`.
3. **Performing** (`continuePerforming`): a fixed dwell (`PICKUP_DROPOFF_DURATION_TICKS`)
   at each leg's destination, then `withdrawReserved` (pickup) or `deposit`
   (dropoff) -- the only points where a job actually touches inventory.

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
  `tests/unit/operations-job-system.test.ts`'s dedicated regression test).
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
proposes the design question the repair had to answer ahead of a decision, and
records the two alternatives (a floor stack at the carrier's tile; an accounted
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
  `arrivesAtTick` comes due. It is not a transfer because there is no source
  container: the goods are bought from outside the prison and materialise on
  arrival, so there is nothing for a carry job's pickup leg to pick up from.
  What it *is* missing is the physical route -- ADR 0017 §4 names
  `room.delivery-bay` and `object.loading-dock-door` as the intended
  destination, and until a delivery lands in a bay and a carry job takes it
  to the site, the deposit is scaffolding. The construction container it
  deposits into is the same object `ContainerMaterialsProvider` draws from
  (`runtime/new-session.ts` wires both from one local), so the loop closes
  today at the cost of being location-blind: a wall 400 tiles away spends the
  same global stock as one next door.

- **`JobSystem.compensateHeldStock` returns a dying job's carried quantity to
  the container it came from**, when a job on the **dropoff** leg is cancelled or
  fails. It is not a transfer either: the goods go back to the one container they
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
  that trade is put to the owner; the floor-stack alternative is the one that
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

## Worker adapters: decoupled from any specific entity model

`job-system.ts`'s `JobWorkerAdapter` interface (position get/set, route
context) lets `JobSystem` assign and move workers without depending on any
specific entity/component model -- exactly the same decoupling pattern
#24's `PrisonerRouteContextResolver` uses for action selection.
`prisoners/job-worker-adapter.ts`'s `PrisonerJobWorkerAdapter` is the one
concrete bridge shipped so far, reading/writing `PrisonerOperationsRuntime`'s
position component and deriving a `RouteContext` from classification/risk
tier. No prisoner is registered as a job worker by default (`JobWorkerPool.register`
is a session/scenario/regime decision, not implicit behavior) -- staff
worker adapters are a future addition using the identical interface.

## Snapshot/restore

`Container`, `ContainerRegistry`, `JobBoard`, `JobWorkerPool` and
`UtilityNetwork` each expose `getSnapshot`/`loadSnapshot`, covering "queues,
reservations, inventories and networks" together (`tests/unit/operations-snapshot-restore.test.ts`
proves all of them round-tripping through fresh instances in one scenario,
not just per-class in isolation). Like `PrisonerOperationsRuntime` before
it, a job's `pathRequestId` is meaningless once restored -- it referenced
the *previous* `NavigationSystem` instance's pending-request queue, which a
freshly constructed one never received and would never resolve, leaving the
job stuck in `'travelling'` forever. `JobBoard.loadSnapshot` drops any
restored `'travelling'` job back to `'assigned'` (clearing the stale id) so
`JobSystem.beginLeg` re-requests routing on the next scheduled tick -- the
same convention `PrisonerOperationsRuntime.loadSnapshot` uses for
mid-travel prisoners. `JobSystem`'s own `performingSince` dwell-timer map is
intentionally *not* part of any snapshot (session-scoped, like
`IntakeSystem`'s counters) -- a restored `'performing'` job simply restarts
its dwell timer, extending the pickup/dropoff wait by at most
`PICKUP_DROPOFF_DURATION_TICKS`, never losing state.

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
panel mounted by `src/main.ts` -- but nothing in it surfaces any of this,
matching #19/#22/#24's precedent of shipping the system before the surface); a fully generic job-kind registry (this issue ships one
concrete job kind -- `CarryItemJob` -- plus the reusable lifecycle/
assignment machinery around it, per "representative flows prove
extensibility").
