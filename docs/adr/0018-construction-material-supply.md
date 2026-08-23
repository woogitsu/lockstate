# ADR 0018: How construction materials enter a prison

## Status

**Proposed — pending human approval.** Not accepted.

What a reviewer is being asked to sign off on, separated from what is
already true:

| | What | State |
| --- | --- | --- |
| **True today** | A build order waits in `'materials-pending'` until a real `Container` can satisfy it | Shipped in #16/#25. Not re-litigated here. |
| **True today** | The runtime fabricates no default content | Existing convention, stated in `src/simulation/runtime/new-session.ts` for containers, jobs, utilities, sectors, schedules, contraband and incidents alike. This ADR keeps it. |
| **Decided here** | Materials enter through a **scenario's declared starting stock**, applied by the session layer, not by the runtime | The subject of this ADR. |
| **Decided here** | Buildable material ids are item-catalog ids | An engineering correction; see §3. |
| **Decided here** | Cancelling an order returns the materials it consumed | Follows from materials being finite; see §4. |
| **PROPOSED** | 600 × `item.brick`, 120 × `item.wood-plank` in the starter scenario | **Implemented with the proposed figures**, in one data literal, so approving different numbers is a one-line change. |
| **Explicitly not decided** | Deliveries, shipments, supply orders, or any renewable source | Deferred to issue #29's economy. See "Alternatives considered". |

## Context

### The loop cannot close

`createNewSimulationRuntime` constructs one `Container` under the
well-known id `CONSTRUCTION_MATERIALS_CONTAINER_ID`, registers it, and
hands a `ContainerMaterialsProvider` over it to `ConstructionSystem`
(`src/simulation/runtime/new-session.ts`). That container starts empty, and
nothing in the shipped codebase ever puts anything into it.

`ConstructionSystem.update` (`src/simulation/construction/system.ts`) moves
an order `approved -> materials-pending`, then calls
`materialsProvider.tryAllocate(def.materialsRequired)` on every scheduled
tick. `ContainerMaterialsProvider.tryAllocate`
(`src/simulation/operations/inventory.ts`) returns `false` when the
container lacks the stock. The order stays `'materials-pending'` and is
retried forever.

So in a real session — the one a player gets from "New prison", via
`WorkerStateMachine.handleInitialize` or `InProcessSessionHost.startNew` —
**every build order the player places is permanently stuck at the second of
seven states.** No wall is ever built, no geometry is ever written, no room
is ever enclosed. The game's core loop does not complete.

This is not a defect in any one file. Every part named above behaves as
documented. What is absent is a *route by which materials enter the
prison*, and no ADR, issue or document defines one.

### What already exists, and what it is not

- `room.delivery-bay` and `object.loading-dock-door` exist in the content
  catalogs (`src/content/room-catalog.ts`, `src/content/object-catalog.ts`).
  They are room and object *definitions*: a shape a player can zone and an
  object they can eventually place. Neither carries any behaviour, and
  nothing in `src/simulation/` reads either id.
- `docs/OPERATIONS.md` describes a delivery flow, and
  `tests/unit/operations-representative-flows.test.ts` exercises one. Read
  closely, that flow is *carriage*, not supply: a test deposits stock into
  a container it named `delivery-bay-0` and a `CarryItemJob` moves it. The
  substrate can move materials that already exist. It has no answer for
  where the first unit comes from.
- `Container.deposit`'s own documentation already names the intended
  source: "a delivery job's final drop-off, **or scenario/session
  seeding**". `docs/OPERATIONS.md` says an order waits "until a
  session/scenario ... satisfies it". `new-session.ts` says utilities stay
  empty "until a session/scenario places real generators/consumers".
- There is no scenario layer. `src/simulation/runtime/` has `new-session`
  and `restore-session` and nothing between them. Issue #33 owns a
  "scenario framework" and is open and unstarted.
- Issue #29 owns the economy and is open. **There is no money anywhere in
  this repository**, deliberately. `staff-role-catalog.ts`'s `wageBand` is
  a data field no system reads.

### A vocabulary split that would make any supply route unreliable

`BUILDABLE_REGISTRY` (`src/simulation/construction/definition.ts`) declared
its requirements against item ids `'brick'` and `'wood-plank'`.
`src/content/item-catalog.ts` declares `'item.brick'` and
`'item.wood-plank'`. The two never met, because nothing had ever supplied a
material through the catalog. `tests/unit/operations-construction-integration.test.ts`
records the split in a comment rather than treating it as a defect, which
was reasonable while no supply route existed.

It stops being reasonable the moment one does. A supply declaration naming
`'item.brick'` and a requirement naming `'brick'` produce exactly the
observable behaviour this ADR exists to remove — an order stuck in
`'materials-pending'` forever — with no error anywhere.

## Decision

### 1. A scenario declares starting stock; the session layer applies it

A new content module, `src/content/scenario-catalog.ts`, defines a
zod-validated `ScenarioDefinition` whose only substantive field today is:

```ts
readonly startingStock: readonly { containerId, itemId, quantity }[];
```

One definition ships: `scenario.starter`.

`applyScenario(runtime, definition)`
(`src/simulation/runtime/apply-scenario.ts`) walks that list in declared
order and `deposit`s each entry into the named container, registering the
container first if it does not already exist.

`createNewSimulationRuntime` is **unchanged**. It still fabricates nothing.
Seeding is a separate, named, individually testable call that the two
session entry points make:

- `WorkerStateMachine.handleInitialize`, on the `kind: 'new'` branch;
- `InProcessSessionHost.startNew`.

A restored session does not apply a scenario: the stock a scenario
deposited is ordinary container state, already carried by
`ContainerRegistry.getSnapshot` and rebuilt by
`restore-session.ts`/`session-systems.ts` (which registers containers by id
from the snapshot before loading it). Applying the scenario again on
restore would silently duplicate a player's remaining stock.

`deposit` is the sanctioned mechanism, not an exception carved out for
this: `docs/OPERATIONS.md`'s no-teleport rule governs transfers *between*
containers, and `Container.deposit`'s documented uses already include
scenario seeding. Nothing here moves anything from anywhere.

### 2. Starting quantities — **PROPOSED: 600 bricks, 120 wood planks**

Derivation, so the figures are arguable rather than arbitrary. The only
two buildables that exist are `wall-brick` (2 × `item.brick`) and
`door-wooden` (1 × `item.wood-plank`).

- The starter world is one owned 32×32 chunk (`new-session.ts`). A
  perimeter around most of it is ~120 edge segments; a first cell block of
  ten cells plus a corridor is ~120 more. At 2 bricks per segment that is
  ~480 bricks, so **600** leaves a modest margin without being so large
  that running out is unreachable.
- **120** planks is one door per two wall segments of the same build,
  which is far more doors than such a prison needs. Doors are the cheaper
  and rarer placement, and a plank shortage blocking a door while bricks
  remain would be an arbitrary-feeling wall rather than a designed
  constraint.

The numbers live in the single `scenario.starter` literal and nowhere else.

**These are directional starting values, not a balance decision.** No
balance pass has happened on this project, and this ADR is not one.

### 3. Buildable material ids are item-catalog ids

`BUILDABLE_REGISTRY`'s requirements now name `'item.brick'` and
`'item.wood-plank'`, and `validateScenarioItemReferences` /
`validateBuildableItemReferences` fail at import time on an id no item
catalog entry declares. One vocabulary, checked, in both directions.

This is not a save-compatibility break in practice. `materialsAllocated` is
the only place a save carries a material id, and it is written only by a
successful `tryAllocate` — which, in every session any build of this
repository has ever produced, has never succeeded, because the container
has always been empty. No existing save can contain the old ids.

`BUILDABLE_REGISTRY` remains a hand-written `Map` in `src/simulation/`
rather than moving into `src/content/`. Turning buildables into a proper
validated catalog is real work with its own issue-shaped scope; doing it
inside this change would be the scope creep `AGENTS.md` forbids. What is
fixed here is only the id vocabulary, which the supply route depends on.

### 4. Cancelling an order returns the materials it consumed

`ConstructionMaterialsProvider` gains `release(allocations)`.
`UNLIMITED_MATERIALS_PROVIDER.release` is a no-op;
`ContainerMaterialsProvider.release` deposits back into its container.
`ConstructionSystem.cancelOrder` calls it with the order's
`materialsAllocated` and clears the field — replacing the `// TODO: release
materials` that has stood since #16.

This is not an optional extra. `cancelOrder` is what `undo()` delegates to,
and the build panel's undo is a normal thing a player does. While materials
were infinite, losing them on cancel was invisible. The moment they are
finite and non-renewable, an undo that silently destroys stock is a
one-way ratchet toward an unplayable prison, reachable by ordinary play
with no feedback.

### 5. No delivery mechanism, and no protocol change

Nothing here schedules a shipment, moves a vehicle, or reads
`room.delivery-bay`. Nothing is added to the worker protocol: the `new`
initialization source still carries only a `masterSeed`, and the starter
scenario is the session layer's choice. See "Alternatives considered" for
why both are deliberate.

## Alternatives considered

- **A delivery system: shipments arrive at a delivery bay and stock a
  container.** Rejected *now*, and this is the closest call in the ADR.
  Richer, and the direction the catalogs already point. But a delivery has
  to be *refusable* to mean anything, and with no economy (#29) there is
  nothing to refuse it with: no money, no budget, no supplier relationship,
  no capacity. A supply order that always succeeds is
  `UNLIMITED_MATERIALS_PROVIDER` with a delay in front of it — the same
  absence of a constraint, wearing the costume of one. That is precisely
  the kind of decorative lie this project has decided not to ship. When
  #29 gives a delivery something to cost, `startingStock` becomes the
  opening balance of a system that also has inflow, and this decision is a
  step on that path rather than something to unwind.
- **Introduce a token/credit resource so deliveries can be constrained.**
  Rejected. That is money with the word filed off, and it pre-empts #29's
  design inside an implementation change.
- **Seed the container inside `createNewSimulationRuntime`.** Rejected. It
  is fewer lines and it is the one thing the file's own comments rule out.
  It would also make the stock invisible to any future scenario that wanted
  different stock, since it would arrive before the scenario could be
  consulted, and it would apply on the restore path too (see §1).
- **Revert `ConstructionSystem` to `UNLIMITED_MATERIALS_PROVIDER`.**
  Rejected. It closes the loop in one line by deleting the mechanic. #25's
  acceptance criterion — "construction orders can wait for and consume
  delivered materials" — is shipped, tested and worth keeping; the missing
  half is a supply, not the demand.
- **Make orders that cannot be satisfied fail rather than wait.** Rejected.
  `'materials-pending'` as a *waiting* state is #25's explicit "backpressure
  is observable as a state, not an error" design, and a player who queues a
  wall before the bricks arrive should get the wall, not a rejection.
- **Add `scenarioId` to the worker protocol's `new` initialization
  source.** Rejected for now. ADR 0003 permits an additive optional field,
  but there is exactly one scenario; a selector over a set of one is
  protocol surface invented ahead of its use. When #33 ships a second
  scenario this is the natural place to put the choice, and it is an
  additive change then.
- **Put the scenario catalog behind `ContentRegistry`/`numericId` like the
  room, object and item catalogs.** Rejected. `numericId` exists so a
  definition can be encoded compactly into world layers and snapshots;
  nothing encodes a scenario anywhere — a save records the scenario's
  *effects* (container stock) and not its identity. Minting a numeric id
  nothing reads would be a field that looks load-bearing and is not.

## Consequences

- A build order placed in a real session now completes.
  `tests/integration/construction-material-loop.test.ts` drives
  `InProcessSessionHost` — the real host, the real runtime, the real
  command queue — and watches a wall reach `'completed'` and write world
  geometry.
- **Starting stock is finite and nothing replenishes it.** A player who
  builds enough eventually cannot build any more, and the game gives them
  no way to get more and no explanation. This is a real, reachable dead
  end. It is smaller than the current one (today *nothing* can be built,
  ever) but it is not zero, and this ADR should not be read as claiming the
  supply problem is solved. It is bounded and deferred to #29.
- **Nothing surfaces the shortage to the player.** The HUD projects build
  orders and their states (`src/simulation/presentation/`), so a stuck
  order is visible as "Awaiting Materials", but no panel shows how much
  stock remains or that it has run out. A player who exhausts the starter
  stock sees orders that simply never progress — the same symptom as
  today's bug, with a different cause. A materials readout is the obvious
  next piece of work and is deliberately not in this change.
- Undo now returns materials. A player can therefore cycle
  place → complete → undo indefinitely at no material cost. That is correct
  (undo means the build did not happen) but it does mean undo is a full
  refund with no waste, which a future demolition/salvage model may want to
  revisit.
- `src/content/scenario-catalog.ts` is a scenario framework in the smallest
  possible sense: one field, one definition. Issue #33 will extend it, and
  should treat it as a starting point rather than as a settled shape. In
  particular it has no notion of a scenario's *goal*, difficulty, starting
  population or starting geometry.
- Anything a scenario declares is content, so a mistyped item id is a
  startup error rather than a silently stuck build order. The cost is that
  `src/content/index.ts` now runs one more import-time cross-check.
- No RNG stream is claimed, drawn from or reordered, and no iteration order
  changes: `applyScenario` walks a declared array and deposits into a
  registry that already sorts by id. Determinism (ADR 0009,
  `docs/DETERMINISM.md`) is unaffected, and a session seeded from the same
  scenario and seed is identical to any other.
