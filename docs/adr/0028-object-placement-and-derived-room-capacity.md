# ADR 0028: What a placed object is, and how a room's capacity comes from it

## Status

**Accepted, 2026-08-25.** The eight decisions and the phase order below are
approved as written, unchanged by the approval; phase 1 is unblocked.

The owner was shown three ways to give a room an occupancy — derive it from the
catalogue's existing `requirements` block, author two fields per room type, or
build real object placement — and **chose object placement**. This ADR is the
design for that choice. It does not re-argue it, and it does not quietly
substitute a cheaper option.

A reviewer is being asked to sign off on eight decisions and a phase order. The
eight are listed in §*Decision*; the honest schedule they imply — including how
many phases pass before a prisoner can exist and sleep, and what stays broken
until then — is in §*What this costs, against the options that were rejected*.

**No production code is written by this change.** It is this document, its row
in [`docs/adr/README.md`](./README.md), and one entry in
[`STATUS-QUEUE.md`](./STATUS-QUEUE.md). Object placement is the largest item in
the backlog and must not be improvised inside a feature commit; that is the
reason this exists before any of it.

### The number, stated because three agents have already collided over one

This ADR takes **0028**. `docs/adr/README.md` stated `0024` as next-free, and
that statement is only ever true about `main` — it cannot see unmerged branches.
0024 through 0027 are claimed by open pull requests, so taking the stated
next-free number would have been the fourth collision in this directory's
history, after the 0004 pair (issue #117) and the 0024/0025 pair. The index's
next-free is moved to **0029** in the same commit, because
`tests/foundation/adr-numbering-contract.test.ts` derives it from the highest
number on disk, and 0028 is now that number. Released numbers below it (0018)
stay listed and are deliberately not the next free one.

### What the evidence rests on

**Tier R — this repository.** Every `file:line` below was read on disk at
`f3ffe6d` (v0.0.45) while writing this, or on the named branch where it says so.
This is the tier almost everything load-bearing here sits in, which is different
from ADR 0023 and deliberate: this ADR decides the shape of code in this tree,
not what other games do.

**Tier E — external, and second-hand.** The comparable-game findings are used
in three places and only three: RimWorld's bed-width rule, Prison Architect's
`NumSlots`, and the "degrade, never hard-fail" pattern. They come from the
room-occupancy research memo at docs/research/2026-08-25-room-occupancy.md,
which is **not on `main`** — it is on branch `claude/research-records` at commit
`b87db4e`, unmerged at the time of writing. (Its path is written without
backticks on purpose: `tests/foundation/documentation-links-contract.test.ts`
requires a backticked repository-rooted path to resolve on disk, and this one
does not yet.) That memo re-verified ADR 0023's external quotes and found no
fabrication; it also corrected three things in that draft, and the correction
that matters most here is repeated in §*Context* because this ADR depends on it.

`AGENTS.md` is explicit that research may inform mechanics while Lockstate must
have its own implementation and identity. Nothing below is a formula, table or
layout copied from another game. Two rules are *arithmetically* the same as
rules other games use — a bed holds as many as it is tiles wide, an object seats
as many as it is tiles long — and they are used because they let this tree
derive both numbers from footprints it already ships, so **no capacity is
authored anywhere in this design.**

---

## Context

### The measurement that reframes the whole problem

`RoomZoningService.zone` registers every instance with `capacity: 0` and
`objectCapabilities: []` (`src/simulation/rooms/zoning.ts:252-261`), and the
comment there says why: an empty rectangle accommodates nobody.

**Capacity alone unblocks nothing, and this is the single most important fact
here.** `RoomInstanceRegistry.findAvailable` rejects an instance on *two*
independent counts (`src/simulation/prisoners/room-instance-registry.ts:81-87`):

```
if (this.occupancyOf(instance.instanceId) >= instance.capacity) return false;
if (requiredObjectCapability !== undefined && !instance.objectCapabilities.includes(requiredObjectCapability)) return false;
```

`DEFAULT_ACCOMMODATION_POLICY` asks for `'sleep-surface'`
(`src/simulation/prisoners/intake-system.ts:27-34`), and `objectCapabilities` is
`[]`. So a capacity of 2 written onto `room.cell` changes nothing at all: the
capability half of that predicate still fails and every arrival still accrues
`accommodationBacklogTicks` forever. **Any decision that resolves only capacity
produces no observable behaviour.** ADR 0023's draft frames the question as
being about `capacity` and misses this; the research memo's §6 is where the
correction was recorded.

Two consequences follow that bound everything below.

**The zero switches off most of the needs loop, not only intake.** All five
`room-catalog-id` actions resolve through `findAvailable`
(`src/simulation/prisoners/action-system.ts:211-217`), so `0 >= 0` rejects every
instance and `action.eat-meal`, `action.shower`, `action.yard-recreation`,
`action.common-room-recreation` and `action.classroom-education` are all
unreachable — including the three that require no capability at all
(`src/simulation/prisoners/actions.ts:25-60`).

**But `own-accommodation` never re-checks either gate.**
`resolveTargetInstance` takes the `getById` path for `action.sleep`,
`action.eat-in-cell` and `action.use-toilet`, so once a prisoner *holds* an
accommodation, sleeping, eating in cell and using the toilet work regardless of
what stands in the room — `action.sleep` declares
`requiredObjectCapability: 'sleep-surface'` and `action.use-toilet` declares
`'sanitation'`, and **neither is ever evaluated on that path.** Only
`action.shower` genuinely needs an authored-or-placed capability to work at all.
That asymmetry is load-bearing for the phase order: it means the first bed
placed buys the whole of sleep, bladder and in-cell hunger, not just sleep.

### Two things the single `capacity` field is being asked to be

`RoomInstance.capacity` gates intake's *residency* question ("does this person
live here", via `assign` at `room-instance-registry.ts:93`) and actions'
*concurrent use* question ("can this person use this room now", via
`findAvailable`). Those are different quantities: a canteen that seats fourteen
houses nobody, and a cell that holds one prisoner is not a statement about how
many can stand in it. Prison Architect keeps them apart — its Cell is fixed at
one with the bed a legality requirement rather than a quantity, its Shared Cell
carries an authored "up to 8", its Dormitory uses `min(area ÷ 4, bed slots)`,
and its object `NumSlots` is a separate footprint-derived usage count (tier E,
all verified in shipped game files per the research memo).

**And one of the two jobs is currently not done at all.** Verified: nothing in
`src/simulation/prisoners/action-system.ts` calls `assign`, `release` or
`occupancyOf` — the string does not appear in the file. So the occupant set
counts only prisoners placed there by `IntakeSystem`, which means
`findAvailable`'s capacity check for a canteen compares the canteen's *resident*
count (always zero) against its capacity. **Today that gate is purely a
zero-check**: any capacity of 1 or more admits unlimited simultaneous users.
Splitting the field is therefore not tidying — it is the difference between a
concurrent-use ceiling that exists and one that only looks like it does.

### The intake trap, which is newer than the research memo

PR #306 (branch `claude/admit-prisoner-command`, open, not merged) established
that a roomless admission is a trap: `'failed'` is **terminal**. `INTAKE_STAGES`
is `['queued', 'reception', 'classification', 'accommodation-assignment',
'completed', 'failed']` (`src/simulation/prisoners/components.ts:19`) and **no
branch of `IntakeSystem.update` matches `'failed'`** — verified by reading the
method. Registering a real cell four hundred ticks later leaves the stage where
it was, `ActionSystem` gates on `'completed'`, and nothing in `src/` releases a
prisoner (#31). The record is permanent, inert and undeletable.

#306's answer is to refuse at the command boundary rather than change the stage
machine: `PrisonerOperationsRuntime.requestAdmission` declines with
`no-accommodation` when `IntakeSystem.hasAccommodationTarget()` is false, so the
terminal state is never entered. A zoned cell with `capacity: 0` is deliberately
still *admitted* and then *waits* at `accommodation-assignment`, which is
retryable and counted.

**A residual hole survives that guard, and this ADR verified it rather than
assuming it away.** `hasAccommodationTarget` returns true if **any**
classification group's target has an instance, and its own comment says it must
not predict which group the arrival will be classified into — that draw happens
two stages later on the `prisoners.classification` stream. So a prison holding a
zoned `room.cell` and no `room.solitary-cell` admits an arrival, classifies it
`high-risk`, targets `room.solitary-cell`, finds `allByRoomCatalogId` empty, and
lands in the terminal `'failed'`. **The trap is narrowed by #306, not closed**,
and object placement does not touch it: placement changes a room's capability
and capacity, never whether an instance of a room *type* exists. Decision 8
says what this ADR does about that.

### What already exists, and is waiting for exactly this

This is the part that makes object placement smaller than it sounds.

- **`BuildableCategory` already has `'object'`**, and `door-wooden` already
  *is* one (`src/simulation/construction/definition.ts`). That file states, in
  its own words, that "what is actually missing is a placement model for a door,
  not a different category for one", and that a completed `door-wooden` order
  "changes nothing in the simulation" — it is "the one buildable the registry
  offers that cannot finish meaningfully". So there is a live, shipped defect
  here: the Build panel already offers an object-category row that consumes a
  plank and does nothing, because `edgeNumericIdFor` returns `0` for it and the
  gesture that produced it was edge-typed anyway.
- **The Build catalogue already ranks objects.** `CATEGORY_RANK` is
  `{ wall: 0, object: 1, utility: 2 }` and `buildCatalogue()` sorts by
  `(category rank, id)` (`src/main.ts:275,332-357`). An object buildable needs a
  `BUILDABLE_LABEL_KEY` entry and a locale string, and it lands in a position
  content already chose.
- **The panel already knows the shape distinction the world gesture lacks.**
  `HudBuildableViewModel.occupiesEdge` is `definition.category === 'wall'`
  (`src/main.ts:345`) and `src/ui/hud/build-panel.ts:457` hides the edge chooser
  when it is false. What is missing is on the *renderer* side, which ADR 0022 §4
  already inventoried: `BuildToolPort.place(segments: readonly EdgeTarget[])` is
  edge-typed and `isArmed(): boolean` carries no shape
  (`src/rendering/build/edge-picking.ts:210-217`).
- **The whole economic and timing mechanism exists.** `ConstructionSystem`
  allocates from a `Container` that `ProcurementSystem` fills with money, and
  charges `workRequired` over its `intervalTicks: 10` schedule
  (`src/simulation/construction/system.ts:112,286-330`).
- **Twenty object ids are declared and consumed by nothing.** Verified
  directly: no `'object.*'` single-quoted literal appears anywhere under `src/`
  outside `src/content/`. Seventeen sit in `AWAITING_CONSUMER` and
  `object.loading-dock-door` in `PROTECTED_BY_DECISION`
  (`tests/foundation/unconsumed-content-contract.test.ts`); `object.bed` and
  `object.toilet` are in neither list, because three test files reference them
  and that gate deliberately counts `tests/` as consumption. **The vocabulary
  this design needs already exists**: footprints, capability tags and numeric
  ids for beds, toilets, tables, benches, showers, stoves and the rest
  (`src/content/object-catalog.ts:40-59`). Nothing in this ADR adds a content
  id.

### The one thing that genuinely does not exist

`RoomInstance` is `{ instanceId, roomCatalogId, anchorTile, capacity,
objectCapabilities }` (`room-instance-registry.ts:21-27`) — **an anchor tile and
no width or height.** `zone` receives `width` and `height` and throws them away
(`zoning.ts:203-262`), and the zoning plane stores a room *type* per tile rather
than an instance id, which `zoning.ts`'s header states outright. So "which room
is this tile in" is unanswerable in both directions today, and any rule over a
room's contents or its area needs that answered first. It is the one new
persisted field this design requires, and decision 6 pays for it explicitly.

---

## Decision

### 1. An object is a row in its own registry, addressed by its tile — not an entity, not a tile plane, not a record on the room

**Decided:** a placed object is

```
PlacedObject = {
  placedObjectId: string,        // 'object:<x>:<y>' over the anchor tile
  objectId: string,              // an id from src/content/object-catalog.ts
  anchorTile: TilePosition,
  orientation: 0 | 1 | 2 | 3,
}
```

held in a `PlacedObjectRegistry` alongside a tile → `placedObjectId` index
covering every tile of every footprint, and persisted as its own optional save
section. It carries **no capacity and no capability**: those are looked up in
`defaultObjectRegistry` from `objectId`, exactly as `zone` looks a room
definition up by `roomCatalogId` instead of copying its fields onto the
instance.

The id scheme is `roomInstanceIdFor`'s, deliberately: a pure function of the
anchor tile, never a counter and never `crypto.randomUUID()`. It is unique
because the tile index refuses a placement on any tile a footprint already
covers, so the anchor was free a moment earlier and is occupied afterwards. It
omits the catalogue id (unlike a room instance id) because a tile holds at most
one object, so the tile alone is unique, and "the object at this tile" is what
every lookup wants. **This is neutral on [ADR 0012](./0012-derived-identifier-reproducibility.md)
for the same reason `zoning.ts` is and on the same condition: it is reproducible
from state like a derived value and carried in the save like an allocated
identity, because the state it derives from cannot change while the object
exists. A feature that *moves* an object must settle ADR 0012 first.** Removal
is safe — a removed object's id simply stops existing.

**Room membership is derived, never stored.** An object belongs to the room
instance whose rectangle contains its anchor tile. Because `zone` writes only
axis-aligned rectangles and refuses `overlaps-existing-room`
(`zoning.ts:209-213,239`), rectangles never overlap, so **an object is in
exactly zero or one room.** That closes, for free, the failure mode ADR 0023
named as needing a decision before placement exists: RimWorld counts
`ContainedAndAdjacentThings`, so a bed in a doorway counts for the rooms on both
sides (tier E). Lockstate cannot reach that state, and the reason is a property
of `zone` rather than a rule anyone has to remember.

#### Against a record on the room. Rejected.

It makes an object's existence contingent on a room, and this tree already needs
objects outside rooms: `door-wooden` is an object-category buildable that goes
on a wall line, and ADR 0017 decision 4 names `object.loading-dock-door` as part
of the procurement route on a bay's boundary. It also inverts the dependency —
"which room contains this tile" becomes a *precondition for placing anything*
rather than a query answered afterwards.

**Save consequence, which is the decisive half.** `roomInstanceSchema` is
`.strict()` inside `prisoners.roomInstanceDefinitions`
(`src/persistence/save-schema.ts:370-392`), so the objects become a
variable-length array nested in every room-instance row. Deleting a room then
silently deletes its furniture from the save with no record that it existed, and
an object's identity inherits a room id that ADR 0012 says cannot survive a room
being moved or resized. Reversing that later means reading objects out of one
section and writing them into another, with a migration that must reconstruct
which tile each was on — information the nested shape has no reason to have kept.

#### Against a tile plane. Rejected, and this is the expensive-to-reverse one.

Every world plane today is a `Uint8Array` — `chunkTerrain`, `chunkTopEdge`,
`chunkLeftEdge`, `chunkZoning` (`src/simulation/world/sparse-world.ts:268-271`)
— RLE-encoded per chunk, with a decode contract that validates values against
the *terrain* registry (`:141-169`). `objectDefinitionSchema` bounds `numericId`
at 65,535, so an objects plane is a fifth plane, a `Uint16Array`, a new RLE
contract, and a **`WORLD_SNAPSHOT_VERSION` bump from 1 to 2** (`:30`) — the world
snapshot that sits inside the save payload. That is the save consequence, and it
is the largest of the three.

The functional objection is worse. A plane holds one number per tile, so
`object.dining-table`'s `{ width: 3, height: 2 }` footprint is six tiles that
each say "dining table" with nothing saying they are the *same* table. So
`minQuantity` — the exact thing `docs/HUD_PROJECTIONS.md` gap 13 records as
uncheckable — **stays uncheckable**, per-object state (an owner, damage, an
assignment) has nowhere to live, and orientation needs a second value per tile.
A plane is fast to read and impossible to individuate, which is precisely
backwards for a system whose whole job is counting discrete things.

#### Against an entity. Rejected, and this is the one worth arguing hardest.

It looks right: [ADR 0005](./0005-entity-storage-model.md) already has a
Structure-of-Arrays ECS with generations, and furniture is a thing in the world.

Three reasons it is wrong here.

**Cost model.** ADR 0005 states its own negative: iterating sparse component
combinations requires walking up to `maxActiveIndex`. The runtime allocates
5,000 slots for prisoners and a separate 500-slot store for guards
(`src/simulation/runtime/new-session.ts:156-158`). Furniture is one to two
orders of magnitude more numerous than prisoners and **almost never changes** —
a bed placed on tick 400 is byte-identical on tick 400,000 — so it is the worst
possible tenant for a store whose iteration cost is proportional to its
high-water mark and which every per-tick query pays for.

**It drags an unrelated hard problem into the same commit.** ADR 0005 records
that nothing in `src/` calls `EntityStore.destroy` and no index is ever
recycled, and that the first release path is what separates id order from index
order. A *removable* object would be the first real consumer of index recycling
— so object removal would become the feature that first exercises generation
wrap, inside the placement change. Two hard problems, one commit.

**Save consequence.** An entity's state lives in the encoded entity store
(`EncodedEntityStoreSnapshot`, `src/persistence/entity-codec.ts` via the
`entities` section), so every object rides the prisoner store's codec and the
entity-liveness ledger — the section V1 → V2 already reshaped once
(`docs/PERSISTENCE.md`). Reversing it means unpicking objects from an encoded
store, which is the least legible of the three reversals.

A dedicated registry has the opposite properties: it is a sorted map, its
snapshot is its rows, and its reversal is deleting one optional payload section.
`DoorRegistry` is the precedent in this tree — a registry beside the world for a
thing that occupies space and is not an entity — and `session-systems.ts`
already persists both it and the room-instance definitions the same way.

### 2. How capacity derives from placed objects

For a room instance `R` with catalogue definition `D`:

```
objects(R)          = every placed object whose anchor tile lies inside R's rectangle,
                      in ascending (anchorTile.y, anchorTile.x)
capabilities(R)     = union over objects(R) of catalogue(objectId).capabilities,
                      deduplicated, emitted ascending by code unit
residentCapacity(R) = Σ over objects(R) whose capabilities include 'sleep-surface'
                      of catalogue(objectId).footprint.width
concurrentUse(R)    = Σ over objects(R) of catalogue(objectId).footprint.width
```

**No number is authored anywhere.** `object.bed` is `{ width: 1, height: 2 }`, so
a bed holds one — which is RimWorld's entire accommodation rule, whose whole body
is `return bedSize.x` (tier E). And Prison Architect's `NumSlots` equals the
object's tile length in every row the research memo opened, including the trap
where `BunkBed` carries the same `NumSlots` as a single `Bed` (tier E) — so
`footprint.width` is the right quantity for concurrent use and the wrong one for
residency in exactly the way this split already separates. A cell with one bed
holds 1. A canteen with 2 dining tables and 4 benches seats `2×3 + 4×2 = 14`.
Neither figure was invented and neither is in a content file.

**Orientation is ignored by the capacity rule.** It reads
`catalogue(objectId).footprint.width` — the definition's width, not the rotated
extent — because capacity is a property of the object type and not of how the
player turned it. RimWorld reads `def.size` for the same reason (tier E).
Orientation exists in `PlacedObject` for the footprint the tile index reserves
and for what the renderer draws.

**The resolver is event-driven, never per-tick.** It runs when the set of
objects inside a room's rectangle can have changed, and at exactly three moments:
a completed object build order, an object removal, and `zone` registering a new
instance. A resolver inside a scheduled `update` would make capacity a value
that changes between a `findAvailable` and its `assign` — the failure mode ADR
0023 named. `RoomInstanceRegistry` therefore gains an explicit
`updateDerived(instanceId, …)`; `register` cannot be called twice for an id (it
throws, `room-instance-registry.ts:36-39`), and it should keep throwing.

**A newly zoned room counts objects that were already standing there.** Refusing
to would make the order of two player gestures change the outcome, which is the
same class of defect as iterating a `Map`.

#### A room whose objects are removed while occupied

**Nobody is evicted. Occupancy above capacity is a legal, named state.**

- `assign` already refuses when `occupants.size >= instance.capacity` and
  `findAvailable` already skips a full instance, so an over-capacity room simply
  **stops accepting new occupants**.
- The prisoner already living there keeps their `accommodationInstanceId` and
  keeps sleeping, because `own-accommodation` resolves via `getById` and checks
  neither gate (§*Context*). **Removing the last bed from an occupied cell does
  not homeless anybody.** It stops the room taking a second occupant and makes
  the room's `object` requirement read `'missing-capability'` in the projection.
- That is the "degrade visibly, never hard-fail" answer every game in the
  research sample gives — RimWorld's `SleptOnGround` thought, Prison
  Architect's `FailureAction` per need (tier E) — reached with **no new
  mechanic**, because this tree's `own-accommodation` path already behaves that
  way by accident. The accident is now a decision.

The projection already tolerates the state: `free` is
`Math.max(0, capacity - current)` and `utilization` goes through
`toBoundedValue`, which clamps (`src/simulation/presentation/room-projection.ts:220-225`,
`src/simulation/presentation/view-model.ts:103-112`). There is a second
`view-model.ts` under `src/ui/hud/`, so the path is written in full
deliberately. So an over-capacity room reads as full with zero free
at 100 %. What it cannot yet *say* is "over capacity", and that is a readout owed
to a later phase, not a blocker.

### 3. `capacity` splits into residency and concurrent use

**Decided: yes.** `RoomInstance` carries `residentCapacity` and
`concurrentUseCapacity`, and the two gates become two methods rather than one
method with a mode flag:

- `findAvailableResidence(roomCatalogId, requiredCapability?)` — gates on
  `residentCapacity`. One caller: `IntakeSystem`.
- `findAvailableForUse(roomCatalogId, requiredCapability?)` — gates on
  `concurrentUseCapacity`. One caller: `resolveTargetInstance`'s
  `room-catalog-id` branch.

Two methods rather than a boolean parameter, because the call sites are already
distinct and ADR 0022 §4 quotes `EditHistoryPort`'s own comment making exactly
this argument — "the two answer different questions".

**The occupant set is *not* split.** One set per instance stays, because "who is
inside this room right now" is a fact rather than a role, and the two capacities
are two ceilings on the same count. But §*Context*'s measurement has a
consequence that must be recorded rather than discovered: nothing currently adds
an actor to a non-accommodation room's occupant set, so `concurrentUseCapacity`
is a ceiling on a number that is always zero until `ActionSystem` starts calling
`assign`/`release` around a performed action. **That is a separate change, it is
named in the phase list, and until it lands `concurrentUseCapacity` is a
correct number nothing consumes.** Saying so is better than shipping a gate that
looks enforced and is not — which is the state `findAvailable` is in today.

### 4. Objects are built from purchased materials, on the existing mechanism — and this ADR decides no prices

**Mechanism: an object is a `BuildableDefinition` with `category: 'object'`,
ordered through `ConstructionSystem` exactly as a wall is.** Materials are
allocated from `CONSTRUCTION_MATERIALS_CONTAINER_ID`
(`src/simulation/runtime/new-session.ts:44`), which `ProcurementSystem` fills
with money. An object is therefore **bought the way a wall is bought**: not
purchased directly, but built from procured materials.

Why not a direct purchase: ADR 0017 decision 2 says materials are procured with
money and any supply route into that container is a delivery a purchase caused.
A furniture-specific "buy a bed for N" would be a second faucet into the world
that bypasses the container — the parallel-resource design ADR 0017 exists to
forbid. And the mechanism is not new: `BuildableCategory` already has `'object'`,
`door-wooden` already is one, and `definition.ts` already says the missing piece
is a placement model. **Phase 1 is the placement model that sentence is waiting
for.**

**This ADR decides no prices and no material quantities.** ADR 0017 decision 5
reserves all pricing and balance to #29, and a `materialsRequired` quantity is a
balance value in exactly the sense a `unitPriceMinorUnits` is. The first object
buildable gets a placeholder quantity documented as one at its declaration, in
the shape `src/content/procurement-catalog.ts` already uses for its two prices
("Every number here is a placeholder"). Nothing here says what a bed costs. Note
one existing limit that this inherits rather than creates:
`purchasableMaterialFor` offers a stepper for the **first** priced requirement
only and `src/main.ts:277-320` states that a two-material buildable would get a
control for one of them — so the first object should require one material until
a multi-material buy surface is designed.

**Placing an object costs time, on the same mechanism, and no labour cap is
added.** Measured: `wall-brick` is `workRequired: 50`, `in-progress` advances
`+10` per scheduled tick, and the schedule is `intervalTicks: 10` — so five
progress ticks plus three state transitions is **eight scheduled ticks, about 80
ticks, ≈ 4.0 s at 1×** on the kernel's 50 ms step
(`src/simulation/clock/fixed-step-clock.ts:29`) and ≈ 1.0 s at 4×, plus the
`materials-pending` wait, which is at least
`PROCUREMENT_DELIVERY_DELAY_TICKS` (100 ticks, 5 s) if the container is empty.
There is **no labour cap and no worker**: `order.assignedWorkerId =
'mock-worker-1'` for every order and every order advances every scheduled tick,
so a hundred objects take the same wall-clock time as one. Adding a cap is a
jobs-system decision (#26) that affects walls too, and making furniture the one
buildable that waits for a worker while walls do not would be a rule a player
cannot learn. **Time cost: yes, inherited. Labour cost: not decided here.**

### 5. The gesture is one press on one tile, in the Build catalogue — and the Rooms tab is where a room's resulting state is read

**The gesture.** Select an object row, arm the tool, press one tile, release.
One object, one order, one command. Not a rectangle and not a run: a wall is a
run of edges (`edgeRunFromDrag` commits the drag to one axis,
`edge-picking.ts:162`), a zone is a rectangle, and an object is *a thing at a
place*. A drag placing N beds would need a fill rule, a per-bed orientation and a
per-tile overlap policy, all of which are inventions. Rotation is a key press
while armed, remappable per `docs/INPUT.md`, and a 1×1 object ignores it.

Most of the renderer work is reuse, and ADR 0022 §4 already inventoried it: the
pointer gesture and its modal arbitration (`world-scene.ts:260,277,324,534-599`),
the camera's wheel/middle-drag/two-finger/Escape behaviour, `worldPointOf`,
`worldToTile` and the `TileRange`/`TileBounds` shapes
(`src/rendering/tile-metrics.ts`). What is new is a footprint-rectangle preview
at the hovered tile instead of a run of edge rects — `BuildOverlay` is one
`Phaser.GameObjects.Graphics` whose lifecycle is reusable and whose signature is
not (`src/rendering/phaser/build-overlay.ts:30-39`) — and a `BuildToolPort` that
can say which shape it is armed for.

**Where it lives: the Build catalogue, as the `object`-ranked rows that
`CATEGORY_RANK` already reserves.** This is a *correction* to the framing this
ADR was commissioned under, and the reasons are stated so the correction can be
overruled:

1. **An object placement is a construction order.** Same system, same materials,
   same lifecycle, same refusal route as a wall. Putting it in a different tab
   splits construction across two surfaces and teaches the player that two
   identical mechanisms are different things.
2. **The rows are free.** ADR 0022 measured 18 injected catalogue rows costing
   0 px of body overflow, 0 panel scroll and 0 rail overflow at all five
   viewports, because `.hud-build__list` is `overflow-y: auto` with a two-row
   floor it already occupies. `tests/browser/ui-shell.spec.ts:949` guards the
   mechanism.
3. **The catalogue and the panel already anticipate it.** `CATEGORY_RANK` ranks
   `object` second; `occupiesEdge` already distinguishes an edge tool from a
   non-edge one and already hides the edge chooser for one.
4. **It does not depend on an unpushed branch.** See below.

**The Rooms tab's job is the readout, and it is a different question.** "Which
of my cells has no bed", "this room holds 1 of the 2 it was meant to", "this
canteen seats 14" — a list of rooms with per-room state is exactly the revisit
trigger ADR 0022 recorded for its own rejected alternative B: *"B becomes the
right answer when rooms need listing and lifecycle — occupancy, capacity,
per-room state — rather than one create gesture."* Object placement is what
creates that state. So the Rooms tab is not a surface this ADR invents; it is
the surface ADR 0022 predicted, and it inherits the whole aside box — 338.1 px
with a 291.2 px body at 900×600, against the Build panel's 7.8 px of
always-visible slack (ADR 0022's corrected table).

**Two things stated plainly rather than assumed.**

- **I could not read the Rooms tab branch.** `git ls-remote origin` returns five
  `*room*` branches and `claude/rooms-tab-zoning` is not among them, so it is
  unpushed at the time of writing. This ADR therefore does not decide that
  panel's layout, and it deliberately puts the *gesture* somewhere that does not
  wait on it.
- **A sixth tab is foreclosed.** ADR 0022 measured `.hud-tabs__inner` at
  x = 1.8 … 373.2 at 375×812 with a fifth tab injected — 1.8 px of margin per
  side, and `HUD_TAB_IDS` has four members today
  (`src/ui/hud/hud-state.ts:14`). So there is no third option: the readout goes
  in the Rooms tab or nowhere.

### 6. The save carries placed objects and room bounds; capacity is derived and stops being persisted. This forces V5.

**What must be carried:**

1. **A new optional payload section for placed objects**, one row per object
   (`placedObjectId`, `objectId`, `anchorTile`, `orientation`), emitted sorted —
   see decision 7 for the key.
2. **`width` and `height` on a room instance**, the rectangle `zone` already
   receives and discards. Without it "is this tile in this room" is unanswerable
   and every rule in decision 2 has no domain.

**What must stop being carried:** `capacity` and `objectCapabilities` on a room
instance. Both are now pure functions of (placed objects, room bounds, the two
catalogues), and a persisted derived value can disagree with the state that
produced it. Recomputing at restore makes `snapshot() → restore() → run N ticks`
land on the same state **by construction** rather than by agreement, which is
what `docs/DETERMINISM.md`'s snapshot rule asks for. The cost is a restore
ordering constraint — the objects section and the room bounds must be in place
before the first `findAvailable*` — and that belongs named in
`src/simulation/runtime/restore-session.ts`'s `CURRENT_SAVE_RESTORED_SCOPE`,
not left implicit.

**Does this force V5? Item 1 does not. Items 2 and the removal do.** Measured
against `docs/PERSISTENCE.md`'s own two conditions under "Adding an optional
field without a version bump":

- **Item 1 is the optional-field pattern exactly.** Absence means "no object has
  been placed", which is what every V4 build did, so no migration step is needed
  and none should be added — the same reasoning `migrateSaveEnvelopeV2ToV3`
  gives for its two optional sections. The key still has to be *declared*,
  because every object in the schema is `.strict()`.
- **Item 2 fails the "absence is unambiguous" condition.** A V4 room instance
  genuinely does not record its rectangle and there is no honest default: `1×1`
  asserts a room the player did not zone, `64×64` asserts one that overlaps its
  neighbours. Inventing either is the invented-consequence defect.
- **The removal crosses the line V4 itself crossed.** `capacity` is a *required*
  field in `roomInstanceSchema` (`save-schema.ts:375`); removing it changes the
  shape, and that is the condition `docs/PERSISTENCE.md` names.

**So: V5, and the migration is total and lossless — because of a fact, not an
argument.** `RoomZoningService` is the only thing in `src/` that registers an
instance and it registers `capacity: 0` and `objectCapabilities: []`
unconditionally. **Every room instance any shipped build has ever written
therefore has 0 and `[]`**, so `migrateSaveEnvelopeV4ToV5` drops both fields
knowing exactly what they were, adds no objects section, and the recomputed
values equal the dropped ones. It invents nothing.

**The bounds are the one thing the migration cannot recover, so decide it
rather than leave it.** `width`/`height` are **optional at V5**, and absence
means "this room's rectangle was not recorded". An object inside such a room is
not attributed to it — containment is genuinely unanswerable — so its capacity
stays 0, which is precisely the pre-object-placement behaviour and therefore not
a regression. And the hard case is **unreachable in practice**: `ZoneRoom` is
still in `AWAITING_PRODUCER` in
`tests/foundation/unconsumed-command-contract.test.ts`, so nothing in a shipped
build can zone a room and **no save in existence contains a room instance at
all.** The optional field is written for correctness against a hand-authored
save, not for a player.

Every older fixture in `tests/fixtures/persistence/` stays checked in unchanged
and a V4 → V5 test is added, per `docs/PERSISTENCE.md`'s "Adding a V5 later"
recipe, whose six steps this follows without exception.

**`supabase/migrations/` is untouched.** A save-schema version is a client-side
payload shape; nothing about it reaches the database.

### 7. Determinism

Four commitments, none of which needs a new rule.

1. **Placement order is command order.** A placement is one `PlaceObject`
   command, so it inherits the kernel's `(executeAtTick, sequence)` total order
   (`docs/DETERMINISM.md`, "Command Ordering"). Nothing new is introduced.
2. **Iteration over a room's objects is `(anchorTile.y, anchorTile.x)`
   ascending.** That is a total order derived from state, and it is the same
   canonical order `zone`'s own rectangle walk already uses — "ascending y then
   x … so the tile a refusal names is a function of the request rather than of
   the order this loop happens to be written in" (`zoning.ts:222-224`). It is
   **not** sorted by `placedObjectId`, and that is a trap worth naming: the id
   is a string over two decimal integers, so code-unit order puts `object:10:2`
   before `object:9:2`. The payload array uses the same `(y, x)` key, because a
   walk that feeds a payload puts insertion history into the save and
   `computeSaveChecksum` hashes array order
   (`tests/determinism/canonical-iteration-contract.test.ts`).
3. **A capability lookup stays deterministic by being a sorted array, never a
   `Set`.** `capabilities(R)` is a union, and a union has no order, so it is
   emitted ascending by code unit using `(a < b ? -1 : a > b ? 1 : 0)` — **never
   `localeCompare`**, per `docs/DETERMINISM.md`. `findAvailable*`'s `includes`
   is order-insensitive, so the order matters only to
   `RoomListRowViewModel.objectCapabilities`, which is projected to the HUD; and
   because capabilities are no longer persisted (decision 6) no checksum depends
   on it.
4. **The resolver is idempotent, event-driven and draws nothing.** Recomputation
   from the same objects gives the same numbers, so running it twice is
   harmless; restore recomputes from scratch. **Placement uses no RNG**, so no
   new named stream is registered and no existing stream's sequence moves —
   which is the property that lets every phase below land without disturbing
   `tests/unit/prisoners-operations-scenario.test.ts`'s fingerprint for any
   scenario that places no object. (That fingerprint is a run-to-run comparison,
   not a pinned literal, so nothing is re-baselined either way.)

### 8. `'failed'` stays terminal. A bed placed after a failed admission does not rescue that prisoner.

**Decided, as a decision and not an accident.** Object placement adds **no
branch** to `IntakeSystem.update` and does not make `'failed'` retryable.

Why:

- Making it retryable means the stage machine gains a transition out of a
  terminal state, which changes what a recorded command stream produces for
  every existing scenario, and makes `failedCount` a number that can go down —
  which nothing expects.
- The correct fix is the one #306 already chose one layer up: **refuse at the
  boundary so the terminal state is never entered.** That fix costs nothing here
  and this design does not weaken it.
- And the state object placement actually changes is the *other* one.
  A zoned cell with no bed is `residentCapacity 0` and no `'sleep-surface'`, so
  `findAvailableResidence` returns none and the arrival **waits** at
  `accommodation-assignment` while `accommodationBacklogTicks` counts — which is
  retryable and is #306's explicitly allowed case. **Placing a bed makes that
  find succeed on the next scheduled intake tick, five ticks later, with the
  stage machine untouched.** That is the whole mechanism by which this design
  gets a prisoner into a cell, and it needs zero change to intake.

**The residual hole is named, verified and deliberately not fixed here.**
`hasAccommodationTarget` (PR #306) answers about *any* classification group, so
a prison with a zoned `room.cell` and no `room.solitary-cell` still admits an
arrival who then classifies `high-risk` and lands in the terminal `'failed'`.
That is a defect in the admission guard or in
`DEFAULT_ACCOMMODATION_POLICY`'s lack of a fallback — not in placement, which
changes capability and capacity and never whether an instance of a room *type*
exists. It is owed work; the phase list names where it must be discharged; and
choosing it inside a design document, in a system with a scenario fingerprint,
would be the scope creep `AGENTS.md` forbids.

---

## The phased plan

Every phase is independently shippable and leaves the game working. Each names
the gates it must move, because in this repository a gate moved late is a gate
that failed someone else's build.

### Phase 1 — one object type, real, end to end, and visible

**Ships:** `PlacedObjectRegistry` with its tile index and derived ids; a
`PlaceObject` command with its refusal reasons; one `category: 'object'`
buildable for `object.bed` in `BUILDABLE_REGISTRY` with a placeholder material
requirement and a `BUILDABLE_LABEL_KEY` entry; a non-edge `BuildToolPort` shape
and a footprint-rectangle preview; a tile-press producer in `src/main.ts`; and
the resolver of decision 2 wired at the three moments of decision 2, writing
`residentCapacity`, `concurrentUseCapacity` and `objectCapabilities` through a
new `RoomInstanceRegistry.updateDerived`.

**Visibly changes:** a bed the player placed is drawn in the world, and a zoned
cell's `roomCapacity` on the status strip stops being 0 for the first time
(`src/simulation/presentation/status-strip-projection.ts:150-155`).

**Also fixes a shipped defect:** `door-wooden` stops being a catalogue row that
consumes a plank and does nothing.

**Save:** V5, in this phase, with the whole of decision 6 — the objects section,
the room bounds, the removal of the two derived fields, and the V4 → V5 step.
Doing it here rather than later is deliberate: a phase 1 that shipped placement
without persistence would ship a feature whose result vanishes on reload, and
`AGENTS.md` boundary 7 requires a version and a migration strategy before
release rather than after.

**Gates to move:** `unconsumed-command-contract` (an eighth command arriving
*with* its producer, which is the direction that gate wants);
`unconsumed-content-contract`'s exact-count triple only — `object.bed` holds no
`AWAITING_CONSUMER` entry to delete, so what moves is `unconsumedBySrcOnly` as
it gains its first `src/` consumer; `unconsumed-action-contract` if a capability
name becomes reachable.

**Does not ship:** removal, multiple object types, area rules, the Rooms tab
readout, `ActionSystem` occupancy.

### Phase 2 — **a prisoner exists and sleeps.** This is the milestone.

**Ships:** `object.toilet` as a second buildable, and nothing structural.

**Why this is the phase.** With a bed and a toilet placeable, a zoned `room.cell`
resolves `residentCapacity: 1` and `objectCapabilities: ['sanitation',
'sleep-surface']`, so `findAvailableResidence('room.cell', 'sleep-surface')`
succeeds, `IntakeSystem` completes the admission, and `ActionSystem` starts
selecting actions. Because `own-accommodation` re-checks nothing (§*Context*),
that single completed intake buys **`action.sleep`, `action.use-toilet` and
`action.eat-in-cell` immediately** — sleep, bladder and the faster half of
hunger, three of the six needs, with `safety` trickling from sleep's `+0.2`.

Strictly, phase 1 alone gets a prisoner into a cell and asleep, because
`room.cell` gates on `'sleep-surface'` and nothing checks the toilet. Phase 2 is
named as the milestone because a cell with a bed and no toilet reads
`'missing-capability'` on a requirement the catalogue declares
(`room-catalog.ts:66-71`), and shipping the milestone as a room that is visibly
incomplete is worse than shipping it one phase later as a room that is not.
**If the owner wants the shortest path to a living prisoner, it is phase 1 —
and the honest cost of taking it is a cell the interface reports as unfinished.**

**Save:** no change. **Gates:** `unconsumed-content-contract` counts only.

### Phase 3 — removal, and the "objects removed while occupied" path

**Ships:** a `RemoveObject` command; the resolver's removal branch; and the
verified behaviour of decision 2 — nobody is evicted, the room stops accepting
new occupants, the requirement reads `'missing-capability'`.

Deliberately after phase 2, because a player who can place but not remove has a
working game with an inconvenience, while a player who can remove before
capacity recomputes correctly has a broken one.

**Save:** no change — removal deletes a row from a section that already exists.
**No entity generations are touched**, which is the whole point of decision 1's
rejection of the entity model.

### Phase 4 — the rest of the object catalogue

**Ships:** buildables for the remaining object ids the room catalogue already
requires — shower head, dining table, bench, chair, desk, stove, prep
counter, fridge, bookshelf, and the rest. Content rows and locale strings, no
new mechanism.

> **Correction, 2026-08-26, made while implementing this phase.** This list
> named **sink** among "the object ids the room catalogue already requires",
> and the *Gates* paragraph below says in the same section that `object.sink`
> "is the one entry a room requirement does not reach". Both cannot be true, and
> the Gates paragraph is the one that is: no room definition in
> `src/content/room-catalog.ts` requires a sink. The name is struck from the
> list rather than the sentence from the Gates paragraph, because the list is
> the mistake — this phase's scope is the ids the room catalogue requires, and a
> sink is not one. Nineteen of the twenty declared objects are required by some
> room; the sink is the twentieth.
>
> The consequence is that phase 4 shipped **seventeen** buildable rows and not
> eighteen, and `object.sink` keeps its `AWAITING_CONSUMER` entry — which is the
> only record that no room asks for a sink and that #141 owes the decision of
> which room should. Placing it would have deleted that record to no end.

**What it unblocks:** `action.shower` (the one need that genuinely requires a
placed capability), `action.eat-meal` in a canteen, and the object requirements
of the fifteen room types still unsatisfiable after phase 2. (Counted: 17 of the
18 definitions carry `object` requirements — `room.yard` is the only one that
does not — and phases 1 and 2 satisfy exactly `room.cell` and
`room.solitary-cell`, which require the same bed-and-toilet pair.)
`docs/HUD_PROJECTIONS.md` gap 13 becomes half-answerable — an `object`
requirement can be checked against `minQuantity` for the first time, because
decision 1 individuates objects.

Not one phase per object: they are rows in a data module and the mechanism is
identical, so splitting them would be ceremony.

**Save:** no change. **Gates:** `unconsumed-content-contract`'s counts move
substantially — up to 17 `AWAITING_CONSUMER` object entries and the exact-count
triple. `object.sink` is the one entry a room requirement does not reach, so it
moves only if something places it.

**What it actually moved, measured on the branch that shipped it.** Fourteen
entries were deleted and the triple moved twice as far as the entry count, which
is the distinction that file reports two measures for:
`unconsumedBySrcAndTests` 30 → 16 and `unconsumedBySrcOnly` 49 → 32. Seventeen
ids gained a first `src/` consumer — every row names its object through
`placesObjectId` — but three of them (`object.bench`, `object.dining-table`,
`object.storage-rack`) were already named by a test and so had no entry to
delete, exactly as `object.bed` and `object.toilet` had none in phases 1 and 2.
The fourteenth deletion is `object.loading-dock-door`, and it left
`PROTECTED_BY_DECISION` rather than `AWAITING_CONSUMER`: the stale-entry gate
requires it, and its protection is stronger afterwards, because
`validateBuildableObjectReferences` throws at import if a catalogued id a
buildable names is deleted.

**Two things this phase did not need, and one it could not express.** It needed
**no locale key at all** — `buildableLabelKey` reads an object buildable's label
off the object's own `nameKey` and all twenty already shipped in
`src/content/default-locale-en.ts` — so the "and locale strings" half of *Ships*
above turned out to be already done. And gap 13 stayed *half*-answerable rather
than becoming answered: `requirementStatus` still compares capabilities and
never counts objects, so one chair still satisfies a classroom's requirement for
four. Making it count is a mechanism, not a row, so it is not in a phase whose
whole claim is that it adds no mechanism.

What it could not express is **orientation**. `DEFAULT_PLACEMENT_ORIENTATION` is
`0` for every placement and decision 5's rotate control does not exist, so a
player cannot turn the `3x2` dining table or the `3x1` loading dock door. No room
type is blocked by it — every required object fits its room's authored minimum
unrotated, which
`tests/foundation/object-buildable-cost-contract.test.ts` now checks — so this is
a usability limit rather than a hole, and it is already owed to the phase that
adds the control.

### Phase 5 — the Rooms tab readout

**Ships:** the per-room verdict ADR 0023 §4 argued for and this tree is one step
short of — `requirementStatus` already returns three states per requirement and
`RoomListRowViewModel` already rolls them into counts
(`room-projection.ts:84,113-131`); what is owed is the room-level answer and a
surface for it. Plus "over capacity", which the projection currently cannot say
(decision 2).

Depends on the Rooms tab existing. Sequenced last among the surfaces because it
is a readout: it makes an existing working loop legible rather than making
anything work.

### Phase 6 — concurrent use starts being counted

**Ships:** `ActionSystem` calling `assign`/`release` around a performed action in
a `room-catalog-id` room, so `concurrentUseCapacity` becomes a ceiling on a
non-zero number.

Last, and honestly so: it is the only phase that changes a per-tick system's
behaviour, it changes what a recorded command stream produces, and it is the one
place a scenario fingerprint moves. It is also the phase that owes a decision
this ADR does not take — whether a prisoner in the canteen is released from the
canteen's set when the action ends or when they leave the tile.

### Outside the phases, and owed by someone

The classification-group hole in §*Context* — a `high-risk` arrival admitted
into a prison with cells and no solitary cells still reaches the terminal
`'failed'`. It is not object placement's to fix and it is not fixed by any phase
above. It belongs to PR #306's guard or to `DEFAULT_ACCOMMODATION_POLICY`, and it
should be discharged **before** phase 2, because phase 2 is the first time a
player can actually complete an admission and therefore the first time the
difference between the two outcomes is visible.

---

## What this costs, against the options that were rejected

The owner chose the expensive path knowingly. This is the schedule, not an
optimistic one.

**Phases before a prisoner exists: one, or two for a cell that is not visibly
incomplete.** That is better than the framing suggested and worse than the
cheap options, and the reason it is only one or two is the discovery in
§*Context*: `own-accommodation` re-checks nothing, so the first bed buys three
needs rather than one, and intake needs no modification at all.

**Phase 1 is nonetheless the largest single slice in this plan**, and it is
larger than either rejected option in total:

| | Rejected: derive from `requirements` | Rejected: author two fields | Chosen: object placement |
| --- | --- | --- | --- |
| New content | none | one number + one capability list × 18 rooms | none — footprints already ship |
| Content schema change | none | `roomDefinitionSchema` is `.strict()`; two fields, and `ROOM_CATALOG_SCHEMA_VERSION` in question | none |
| Save-format change | none | none | **V5**: new section, new room-instance fields, two fields removed, a migration |
| New command | none | none | `PlaceObject`, then `RemoveObject` |
| New renderer gesture | none | none | a non-edge tool, a footprint preview, a rotate input |
| Phases to a living prisoner | 1 | 1 | 1–2 |
| Numbers to balance | none | 36 | material quantities only, deferred to #29 |

**What stays broken meanwhile, phase by phase:**

- **Until phase 1 lands:** everything that is broken today. Every room has
  `capacity: 0` and no capabilities, so intake never completes, all five
  `room-catalog-id` actions are unreachable, and PR #306's control refuses every
  press. Object placement's absence is the sole cause.
- **After phase 1, before phase 2:** a prisoner can live and sleep, but their
  cell reports an unmet toilet requirement, and `action.shower`,
  `action.eat-meal`, `action.yard-recreation`, `action.common-room-recreation`
  and `action.classroom-education` are all still unreachable, because the rooms
  they name still contain nothing.
- **After phase 2, before phase 3:** an object cannot be removed. A misplaced bed
  is permanent, which is the same class of complaint as ADR 0022's open question
  1 (a room cannot be un-zoned either), and it is survivable for the same reason.
- **After phase 3, before phase 4:** hygiene is the one need with no route to
  satisfaction, and fifteen room types have no reason to be zoned.
- **After phase 4, before phase 5:** the loop works and the player cannot see
  why. "This cell is missing a toilet" is computable and is not on screen
  anywhere.
- **After phase 5, before phase 6:** one canteen serves an unlimited number of
  prisoners simultaneously. Note that this is **true today** and is not a
  regression this design introduces — `concurrentUseCapacity` makes the ceiling
  correct before anything counts against it, which is the honest order but not a
  satisfying one.

**The honest comparison.** Both rejected options reach a working needs loop in
roughly one slice with no save migration, and the research memo is explicit that
the cheapest working variant — reading capacity and capabilities off the
`requirements` block that already ships — costs "one new piece of logic, no new
content, no save-format change, no numbers to balance". What the owner is buying
by refusing it is the thing that option cannot buy at any price: **the player
furnishes the room.** Under either rejected option every empty rectangle behaves
as though it were fully furnished, which removes exactly the pressure furniture
exists to create and hands the player nothing to look at inside a cell. That is
a product judgement, it has been made, and this plan is what it costs.

**One structural argument in the chosen path's favour, worth recording because
it is not obvious:** the two rejected options are not smaller versions of this
one. Authoring per-room fields writes a number that object placement must later
overrule, and the `requirements`-derived option derives capacity from a
*validation list*, so tuning a requirement for legality reasons silently changes
the population of every saved prison. Object placement has no such coupling: it
derives from what is standing there, and nothing else reads the number.

---

## Consequences

- **A V5 migration ships in phase 1**, and every later phase is additive to it.
  That is the single expensive, hard-to-reverse commitment in this design, and
  decision 6 states exactly what forces it.
- **`RoomInstance` stops being written once.** `zoning.ts`'s "registered once"
  property (`:262`) is replaced by "registered once, derived fields updated on
  object events". The type's own header
  (`room-instance-registry.ts:8-19`) currently states that
  `objectCapabilities` are "stated up front rather than derived from a placement
  system that doesn't exist"; phase 1 falsifies that sentence and owes it an
  edit.
- **`zoning.ts:48-65` is owed an edit in phase 1.** Its claim that capacity comes
  from the objects standing in the room becomes true rather than aspirational;
  what changes is `:60-65`, which says a usable capacity needs a content
  addition and that the choice is a product decision recorded on #261. That
  decision has been taken, and the header should cite this ADR.
- **`docs/HUD_PROJECTIONS.md` gap 13 and gap 11 both narrow, and gap 15 does
  not.** Gap 13's "no system tracks which objects are physically in which room"
  stops being true in phase 1 and `minQuantity` becomes checkable in phase 4;
  gap 11's missing room bounds are filled by decision 6. Gap 15 —
  `RoomInstanceRegistry` has no `all()`, so enumeration fans out over catalogue
  ids — is untouched and stays a limitation.
- **`docs/PRISONER_OPERATIONS.md:162-184` stops being accurate in phase 1**, and
  so does anything asserting that a zoned cell can never free up.
- **Object removal is the first feature in this tree that deletes a placed
  thing**, and decision 1 is what keeps that from also being the first feature
  that recycles an entity index.
- **Nothing here is enforced by a test, and nothing here changes a test.** This
  commit is this document, its index row and one STATUS-QUEUE entry.
  `tests/foundation/adr-numbering-contract.test.ts` gates the number, the
  heading, the status and the index row in both directions, and it is the only
  test whose inputs this commit touches. No gate can assert that an object is a
  registry row rather than an entity; that is held by this document and by the
  row that reports its status.

## What this decision does not settle

Left open deliberately. Inventing an answer would be worse than naming the gap.

1. **Prices, and material quantities.** ADR 0017 decision 5 reserves them to
   #29, and decision 4 above declines them explicitly. The first object
   buildable's `materialsRequired` is a placeholder documented as one.
2. **Whether occupancy is additionally bounded by floor area.** Every game in
   the research sample has a size rule that binds alongside objects, and decision
   6 makes the geometry *available* for the first time by putting `width` and
   `height` on the instance. Whether a `min(area ÷ N, object slots)` rule — Prison
   Architect's Dormitory shape (tier E) — should exist is a separate decision,
   and it is now cheap rather than blocked.
3. **Whether the catalogue's `minimum-size`, `enclosed` and `outdoors`
   requirements start being enforced.** All 18 room definitions carry a
   `minimum-size` block and `zone` evaluates none of them
   (`zoning.ts:203-262`), so `room.cell`'s authored 2×3 minimum is enforced
   nowhere. Decision 6 makes it enforceable. Whether zoning should start
   refusing an undersized room is a separate change, and it would refuse rooms a
   player can zone today.
4. **`room.yard` has no object requirement at all** — `{ type: 'outdoors' }`
   plus `minimum-size`, no furniture — so under decision 2 it resolves to
   `concurrentUseCapacity: 0` for ever and `action.yard-recreation` stays
   unreachable at every phase. This is the one room the object-derived rule
   cannot serve. Either it gets an area-derived figure from its already-authored
   `minTiles: 64` (which is open question 2), or one authored number, or a
   `object.bench` requirement. **Not decided here, and it is the sharpest single
   limitation of this design.**
5. **Whether an object can be placed outside any room.** Decision 1 permits it
   structurally — objects are not owned by rooms — and nothing consumes such an
   object. Whether the *gesture* should refuse it is a surface question, and
   `door-wooden` is the case that argues it should not.
6. **Whether a security door reaches a room as a capability or as a
   requirement.** ADR 0023 left this open and this ADR does not close it.
   `object.loading-dock-door` already reaches a room through the capability path
   (`room.delivery-bay` requires it, and its capability is `'delivery-access'`),
   while `DoorRegistry` is where a door's own state lives. This design changes
   neither.
7. **Where an occupant is released from a `room-catalog-id` room's occupant
   set** — phase 6's own open question, named there.

---

## Amendment, 2026-08-26: `door-wooden` is fixed, and not by phase 1

*This changes **no decision**. The eight decisions and the phase order above are
approved as written and are untouched; what is corrected is a **prediction**
phase 1 made about a row it turned out not to be able to reach, and one example
attached to an open question. An amendment is the form the ADR 0007 amendment
established for exactly this: the record of what was decided stays as accepted,
and what the tree does instead is recorded beside it.*

### The prediction

Phase 1 lists, under *Also fixes a shipped defect*: "`door-wooden` stops being a
catalogue row that consumes a plank and does nothing." It did not, and could
not. `src/simulation/construction/definition.ts` recorded the correction when
phase 1 landed and left the defect open: a placed object under decision 1 is a
row addressed by an **anchor tile** with a footprint of tiles, a door is a fact
about a tile **edge**, and `src/content/object-catalog.ts` declares no wooden
door at all — `object.loading-dock-door` is a three-tile delivery door with a
`'delivery-access'` capability, which is a different thing.

### What closed it instead

A door is **edge geometry plus a `DoorRegistry` row**, and neither half on its
own. `BuildableDefinition.placesDoor` names a security grade, an initial state
and a cost multiplier; `finalizeConstruction` writes `DOOR_EDGE_NUMERIC_ID` into
the world's edge layer *and* hands the edge to a `DoorPlacementSink`, which
`DoorConstructionService` turns into a `DoorDefinition`. Two layers then answer
two different questions, and both answers are right: `TopologyManager` and
`roomPerimeterEnclosure` read the edge layer, so a cell with a door in its wall
line stays a **distinct region** and reads `sealed` — which is what makes a cell
a cell — while `buildNavigationGraph` reads `DoorRegistry` first, so the same
door is a **`Portal`** and the cell is reachable. `docs/NAVIGATION.md`'s
door-placement section is where that is decided and where its four previously
open questions — orientation, removal, identity, access requirements — are
answered.

**Nothing in this design was used to do it**, which is the point of recording it
here rather than quietly. No `PlacedObject` is created, no
`placesObjectId` is added, and `PlaceObject`/`RemoveObject` never see a door. So
a door contributes **nothing** to either derived capacity under decision 2:
`residentCapacity` and `concurrentUseCapacity` both sum over objects standing in
a room's rectangle, and a door is not one. That matters because
`concurrentUseCapacity` currently sums `footprint.width` over *every* object
regardless of capability — an open defect, tracked separately — so a door
written as an object would have silently handed its room another unit of
occupancy.

### Open question 5's example is withdrawn; the question is not

Open question 5 asks whether an object may be placed outside any room, notes
that decision 1 permits it structurally, and cites `door-wooden` as "the case
that argues [the gesture] should not [refuse it]". That example no longer
applies: a door is not placed through `PlaceObject` and never was refused by it.
The question itself is unchanged and still open —
`ObjectPlacementService.place` refuses `outside-room`, and its own header states
the reasoning so it can be overruled.

---

## Amendment, 2026-08-26: the concurrent-use ceiling is scoped to the capability being asked for

*This changes **one rule decision 2 states verbatim** and nothing else. Decisions
1 and 3 through 8 and the phase order stay approved as written; decision 2's
`objects(R)`, `capabilities(R)` and `residentCapacity(R)` lines, its
orientation-blindness, its event-driven resolver and its "nobody is evicted"
answer are all untouched. What is replaced is the single line
`concurrentUse(R) = Σ over objects(R) of catalogue(objectId).footprint.width`.
An amendment is the form the ADR 0007 amendment and this ADR's own `door-wooden`
amendment established: the record of what was decided stays as accepted, and
what the tree does instead is recorded beside it.*

*Issue #326. The amendment above already named this as "an open defect, tracked
separately"; this is the entry that closes it.*

### The rule, restated

For a room instance `R` with catalogue definition `D`, replacing decision 2's
`concurrentUse(R)`:

```
concurrentUse(R, c) = Σ over objects(R) whose capabilities include `c`
                      of catalogue(objectId).footprint.width
concurrentUse(R, -) = unbounded      -- an action that names no capability
```

`findAvailableForUse(roomCatalogId, c)` and `claimUse(instanceId, entityId, c)`
both gate on `concurrentUse(R, c)`, and the headcount they compare against it
counts only the claims taken against `c`.

**Everything decision 2 defends is preserved.** No number is authored anywhere —
every figure is still read off a `footprint` in `src/content/object-catalog.ts`.
It is still orientation-blind, still event-driven through `updateDerived` at the
same three moments, and still recomputed at restore rather than persisted. What
changes is only *which* footprints are summed for *which* question.

### What was measured

The defect: `deriveRoomCapacity` summed `footprint.width` over **every**
recognised object for the one concurrent-use number, while only
`residentCapacity` filtered on a capability. `findAvailableForUse` then checked
two things that did not match each other — the capability had to be present
*somewhere* in the room, and the headcount was compared against that all-objects
total. A capability-specific question answered against a capability-blind
ceiling. One scalar cannot bound two actions that consume different objects.

Measured on `main` at **9d0a125, v0.0.73**, driving the real
`zone → resolveInstance → findAvailableForUse/claimUse` path — after the
`door-wooden` amendment landed, so these are the numbers as they stand and not
as they stood when #326 was filed:

| room and contents | `concurrentUseCapacity` | admitted |
| --- | --- | --- |
| canteen, 2 dining tables + 4 benches, asked for `'dining'` | 14 | 14 |
| the same canteen plus 4 toilets and a storage rack, asked for `'dining'` | 19 | **19** |
| empty 8×8 yard, no capability asked | 0 | **0** |
| 8×8 yard, one toilet | 1 | 1 |
| 8×8 yard, one loading-dock door | 3 | **3** |
| 8×8 yard, four benches | 8 | 8 |

So nineteen diners sat in a canteen whose tables and benches seat fourteen, and
a three-tile delivery door granted three prisoners outdoor exercise while
sixty-four tiles of open ground granted none.

### The floor-space counter-argument was looked for, and the repository argues the other way

The strongest case for the old rule is that a capability-blind ceiling is a
deliberate floor-space abstraction: a room holds N bodies whatever the furniture.
An argument from the absence of that claim would be weak, so it was searched for
across `docs/`, `src/` and `tests/`. It is not there — and two things stronger
than an absence are:

1. **The research memo this ADR rests on considered floor space and rejected
   it.** `docs/research/2026-08-25-room-occupancy.md` §*Option 4 — Decide
   capacity from floor space*: "it makes a bare patch of floor into
   accommodation, which is the least believable of the four". The one place the
   position is written down is the place it is turned down.
2. **The memo's own reading of `NumSlots` is per-object and per-use.** It
   describes the field as "a **usage/footprint slot count**: how many actors can
   stand at the thing at once", and warns that "an implementation that grepped
   for it and wired it into a capacity field would be putting a footprint number
   in an occupancy field". Slots belong to the object and to the use, which is
   what capability scoping restores. Summing them into one room ceiling is a
   step the memo never took: its recommendation was *per room category* — sleep
   surfaces for `category: 'housing'`, all required objects for every other
   category — and that is coherent while a room has one purpose and one scalar.
   It stopped being coherent the moment `findAvailableForUse` took a capability
   argument, and the "every" is a vestige of the per-category rule rather than an
   abstraction anybody argued for.

Note what is *not* claimed here. #326 also reports that the memo's "`NumSlots`
equals the object's tile length in every row" is false of the shipped
`materials.txt` (`RiotVan` 2×5 → 6, `VisitorTable` 3×2 → 4). That file is not in
this tree and the claim was not re-verified, so nothing above rests on it; the
argument stands on the memo's own characterisation of the field, which is in the
tree.

### The correction to #326's arithmetic, and to this ADR's worked example

**#326 says the repair leaves the canteen seating 14. It does not: it seats 6.**
Decision 2's worked example — "a canteen with 2 dining tables and 4 benches
seats `2×3 + 4×2 = 14`" — is arithmetic under the all-objects rule.
`object.dining-table` declares `['dining']`; `object.bench` declares
`['seating', 'recreation']` and **not** `'dining'`. `action.eat-meal` requires
`'dining'`. So the capability-scoped dining ceiling of that canteen is
`2×3 = 6`, and the change to it is 19 → 6, not 19 → 14.

That is stated rather than engineered away. Adding `'dining'` to
`object.bench`'s capabilities would reproduce 14 exactly, and `room.canteen`'s
own requirement block — which requires *both* two dining tables and four benches
— is a real argument that a canteen's benches are where people sit to eat.
**This amendment does not make that change**, for two reasons: it is a content
and balance decision rather than an architectural one, and altering a catalogue
row so that a number comes out the way a prior document said it would is the
inverse of deriving the number. The question is named here and left open, and one
line in `src/content/object-catalog.ts` settles it either way whenever it is
answered. Until then the ADR's "14" survives as what
`RoomInstance.concurrentUseCapacity` still reports, which is a statement about
object footprints and not about diners.

### The yard stops being an exemption and becomes a derivation

An action that names no capability consumes no object, so a rule that sums object
footprints has **no domain** for it — and the honest reading of an undefined
ceiling is "this rule does not bound it", not "it bounds it at zero". Zero is
what the old rule said, and `room.yard` is what it said it about: the only room
type in `src/content/room-catalog.ts` that requires no object at all, and
therefore the only genuinely unbounded room. Nothing is authored to make that
true; it falls out.

Two other `room-catalog-id` actions named no capability and were **not**
unbounded rooms at all, so leaving them unnamed would have handed them the
yard's answer by accident:

- `action.common-room-recreation` now requires `'recreation'`. `room.common-room`
  requires two `object.bench`, and a bench already carries `'recreation'`.
- `action.classroom-education` now requires `'education'`. `room.classroom`
  requires one `object.bookshelf`, which already carries `'education'`.

Both capabilities existed on the objects the rooms already require; the actions
simply did not name them. That is content, and it is the whole of the content in
this change.

### `concurrentUseCapacity` survives as a total, and is nothing's ceiling

`RoomInstance` keeps the scalar and its arithmetic is unchanged, so no figure any
test asserts about it moves. **What changed is that no admission gate reads it.**
It is the summed footprint width of everything standing in a room: true about
objects, false about people — 14 for a canteen that seats 6, and 19 for that
canteen plus four toilets.

It is kept rather than deleted for one honest reason and one practical one. The
honest one: decision 2's own §*A room whose objects are removed while occupied*
and phase 5's owed Rooms-tab readout both want to say something about how much
furniture stands in a room, and this is that number. The practical one: it is the
field ~25 test files register instances with, and removing it would have churned
all of them, including files a concurrent change owns.

That leaves a real hazard, named here so it is not discovered: **projecting this
number as "how many can use this room at once" puts #326 back on screen.** The
declaration in `room-instance-registry.ts` says so at the field, and
`objects-room-capacity.test.ts` pins that no gate reads it — a room whose total
is 19 and whose dining ceiling is 6 admits 6.

### What this costs

- **`claimUse` and `reinstateUseClaim` take a capability, and a claim records
  what it consumes.** Not optional: a canteen's fourteenth diner and its first
  toilet user are different seats, and one pooled count against one pooled
  ceiling would refuse the toilet because lunch was busy. `useOccupancyOf` gains
  an optional capability and counts only matching claims; without one it still
  counts every claim, which is `claimCountOf`'s question and no ceiling's.
- **The claim collection is a `Map<EntityId, capability>` rather than a `Set`.**
  Its scoped count is a linear walk of the actors performing in one room, which
  that room's own ceiling bounds. `tests/determinism/canonical-iteration-contract.test.ts`
  carries the exemption: a count is commutative, and which entity gets which
  seat is decided by the caller's ascending entity-index scan, not by this walk.
- **`RoomInstance.concurrentUseCapacityByCapability` is optional and
  `RoomDerivedCapacity`'s is required.** Every production path resolves an
  instance before any gate is asked — `zone` inside the same command dispatch,
  a restore through `resolveAll` — so a live instance always carries the
  breakdown. Absent means "nobody has resolved this instance's objects", which is
  a hand-built fixture, and such an instance has only its total to offer, so the
  pre-amendment rule applies to it. That fallback is the one place the old
  behaviour survives, it is stated at `concurrentUseCapacityFor`, and no command
  can reach it.
- **ADR 0029's over-capacity property loses its integration-level route, and
  keeps its proof.** `tests/integration/object-removal-loop.test.ts` demonstrated
  "a claim stands above a dropped ceiling and nobody new gets in" by putting a
  *bed* in a yard — legal only because the ceiling was capability-blind, as that
  fixture's own comment said. No placeable buildable supplies a capability any
  `room-catalog-id` action asks for (`bed-wooden` gives `'sleep-surface'`,
  `toilet-brick` gives `'sanitation'`, and both of those actions target
  `own-accommodation`), so until phase 4 makes a dining table placeable the
  property is not reachable through a command. It is proven in
  `tests/unit/prisoners-concurrent-room-use.test.ts` instead, over the real
  `ActionSystem`, and the integration file records where it went.

### What this does not change

`residentCapacity`, `objectCapabilities`, the persistence format (no capacity has
been persisted since decision 6), the resolver's three moments, orientation
blindness, and "nobody is evicted; occupancy above capacity is a legal, named
state". Open questions 1 through 7 are all still open, including 5 as the
`door-wooden` amendment left it.

---

## Amendment, 2026-08-26: the measurement in §4 assumed parallel orders, and no longer holds

*This amends **one measured paragraph in decision 4** and no decision. Decision
4's own ruling is untouched and is not the thing that expired: it says "Adding a
cap is a jobs-system decision (#26) that affects walls too, and making furniture
the one buildable that waits for a worker while walls do not would be a rule a
player cannot learn." That assignment stands, that objection stands, and #26
still owns a labour model. What has expired is the **measurement underneath it**
— a statement about what the tree did on the day this was written, which #348
falsified. An amendment is the form this ADR's own `door-wooden` and
capability-scoping amendments established: the record of what was decided stays
as accepted, and what the tree does instead is recorded beside it.*

*Issue #348. Status is untouched: this ADR remains Accepted, 2026-08-25.*

### What the paragraph said, and which clause moved

Decision 4 measures:

> There is **no labour cap and no worker**: `order.assignedWorkerId =
> 'mock-worker-1'` for every order and every order advances every scheduled
> tick, so a hundred objects take the same wall-clock time as one.

Three clauses, and only the last two moved:

- **"No worker" is unchanged.** `assignedWorkerId` is still `'mock-worker-1'`
  for every order. Nothing models a builder, nothing pathfinds, nothing is
  wired to `staff-role.maintenance-worker`.
- **"Every order advances every scheduled tick" is false.** One order holds the
  crew; a waiting order takes it only when the crew is free, chosen in the
  canonical ascending-id sequence `orderedOrders()` already walks.
- **"A hundred objects take the same wall-clock time as one" is false**, and it
  was the sentence the rest of §4's time-cost reasoning rested on. A single
  order is unaffected — `wall-brick` still finishes on tick 70 — and each
  further one costs +60. A twelve-wall perimeter finishes at 730.

### Why this did not need a new decision, and where the argument is

#348 argues that its rule applies **identically to every buildable**, so it
satisfies decision 4's stated objection — furniture waiting while walls do not
— rather than walking into it, and that what it adds is a queue rather than a
labour model: no crew size, no configurable cap, no role. That is the reasoning
this amendment records rather than ratifies. **The moment crew capacity becomes
a tunable number, or staff roles or builder movement become real, it is
ADR-worthy**, and #26 will have to reconcile with the queue when it lands.

### What this does not touch

Decision 4's material-cost half, its placeholder-quantity rule and its
`purchasableMaterialFor` limit are unchanged. Every other decision, the phase
order and all seven open questions are as the previous two amendments left them.
No save format moves: the rule is derived entirely from `state`, `progress` and
`assignedWorkerId`, which a v0.0.76 save already carries.
