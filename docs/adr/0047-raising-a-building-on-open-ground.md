# ADR 0047: Raising a building on open ground

> **Drafted as `XXXX`; assigned 0047 on landing.** ADR numbers in this
> repository are assigned centrally after parallel drafts return — `AGENTS.md`
> and `docs/AGENT_WORKFLOW.md` §2 both say so, and the author could not
> enumerate open pull requests from a worktree. Five drafts returned in the
> 2026-08-27 pass and were numbered in the order they landed: 0042 and 0043
> into the two gaps README recorded, then 0045, 0046 and this one.

## Status

**Proposed, 2026-08-27. Not self-approved.**

This changes the world model — a new per-chunk storage plane, a new admission
rule on `ZoneRoom`, and a change to which tile a wall order may be built on. It
is the owner's to accept. `docs/AGENT_WORKFLOW.md` §3: *"Propose an ADR rather
than deciding architecture inside implementation code, and never self-approve
one."*

**Decision 6 is separable from the rest and should be read first.** It is a
defect fix that needs no building layer at all, and everything else in this
document depends on it having landed.

## What was asked for

The owner, on being offered two narrow fixes for the edge-of-owned-land
consequence recorded in
[ADR 0045](./0045-must-a-zoned-room-be-enclosed.md) — count an unowned
neighbour as a wall, or make the player buy the adjoining parcel — rejected both
framings and asked for a different world model:

> *"trzeba zmienic to w taki sposob jak to ma prison architekt: dzialka to
> zielen, trawa, i gracz buduje np. fundamenty, stawia sciany itp i cele itp
> musza byc wewnatrz budynku, albo cos w tym rodzaju, zrob research i zaproponuj
> cos madrego fajnego"*

Owned land should be open ground — grass — and the player raises a **building**:
a foundation, then walls, with cells and other rooms living **inside** it.

`AGENTS.md` forbids copying another game's code, assets, text or UI layouts.
What follows treats the mechanic as a design problem and answers it in this
codebase's own terms. The genre convention being named is that a base-building
game separates *raising a structure* from *designating what a part of it is
for*; that convention is prior art and naming it is honest, and none of the
naming, tool layout or wording below is taken from any particular game.

**Prior art actually read, and it was thin.** One web search
(*"base building game design floor tile layer vs room enclosure detection flood
fill indoor"*) returned nothing beyond the well-known convention that grid
builders detect rooms with a flood fill over wall edges —
<https://en.wikipedia.org/wiki/Flood_fill> and a set of engine-forum threads
asking how to do exactly that
(<https://discussions.unity.com/t/room-detection-using-flood-fill-algorithm-like-the-sims/824509>,
<https://devforum.roblox.com/t/detecting-enclosed-rooms/2091197>). That is the
approach this document argues **against** buying, and the search found no
discussion of the alternative it argues for. So the research below is the
codebase, not the web, and this paragraph exists so nobody credits the design to
a source that did not supply it.

---

## Two corrections before the design

`docs/AGENT_WORKFLOW.md` §3: *"Correcting the brief you were given is welcome and
expected."* Both of these change what should be built first.

### Correction 1: a building layer does not dissolve the edge-of-owned-land defect. It inherits it

The brief expects the defect to *fall out* of the building layer. It does not,
and the reason is mechanical rather than a matter of design taste.

The defect is a consequence of where an edge is stored.
`roomPerimeterEnclosure` reads a rectangle's south boundary as the north edge of
the row **below** it (`src/simulation/rooms/enclosure.ts:219-221`) and its east
boundary as the west edge of the column to its **right**
(`src/simulation/rooms/enclosure.ts:230-232`). Those two edges are stored on tiles
outside the rectangle. If the rectangle is flush against the edge of owned land,
those tiles are unowned, and `ConstructionSystem.submitOrder` refuses a wall
there.

**A building has a south boundary too.** Whatever a building is, its southern
wall is stored on the row below its southernmost floor, and its eastern wall on
the column to the right of its easternmost floor. Putting a building layer
between land and rooms moves the refusal from the room to the building and
changes nothing about it. A design that assumed otherwise would ship the same
defect one level up and with a longer explanation.

**What actually causes it is an asymmetry in one predicate, and the asymmetry is
a plain defect.** `submitOrder` asks `canBuildAt(this.world, order.location, …)`
(`src/simulation/construction/system.ts:587`), and `canBuildAt` tests ownership
of the order's own tile and nothing else
(`src/simulation/world/buildability.ts:26`).

(**Two corrections to the sentence above, marked rather than overwritten,
2026-09-15.** *Where:* the `canBuildAt` call this document cited as `:266` is
now inside `admits` (`src/simulation/construction/system.ts:583`), which
`submitOrder` (`:540`) calls once per tile — decision 6 below landed and the
extraction is what landing it looked like. Decision 6's own amendment block
already recorded that move and gave `admits` as `:353`; **that block and this
sentence disagreed for eighteen days because only one of the two was amended**,
and `:353` has since drifted to `:583` as well. *And what it tests:*
`canBuildAt` is no longer ownership "and nothing else" — `buildability.ts:26` is
still the ownership branch exactly, but water and buildable/walkable terrain are
tested below it in the same function. The asymmetry this correction is about is
untouched by either change.) `docs/WORLD.md` states that as a
decision:

> Which tile must be owned for an *edge* order is the order's own tile, not the
> tile across the edge it occupies: every boundary edge of an owned parcel has
> unowned land on the far side, and a prison is a perimeter.

`tests/unit/construction-ownership.test.ts:124` pins it — *"checks the order's
own tile, not the tile across the edge it occupies"* — with a fixture whose
order tile is owned and whose far tile is not.

That rule is **half of the rule its own justification argues for**. Take an owned
parcel spanning rows 5..10:

- Its **north** face is the edge between rows 4 and 5, stored as `topEdge` of
  `(x, 5)`. The order's tile is owned. Approved.
- Its **south** face is the edge between rows 10 and 11, stored as `topEdge` of
  `(x, 11)`. The order's tile is *not* owned. Refused `unowned-land`.

The same physical wall on the same property line is buildable on two of the
four faces and refused on the other two, purely because of which of the two
adjacent tiles the world keeps the slot on. The doc's own reason — *"a prison
is a perimeter"* — argues for the symmetric rule and the code implements the
asymmetric one. **The rule should be: an edge order is permitted when *either*
of the two tiles the edge separates is owned.** That keeps
`construction-ownership.test.ts:124` green (its fixture has one owned side) and
makes the south and east faces of owned land buildable.

That is decision 6, it is roughly one predicate, and **it fixes the
edge-of-owned-land refusal on its own, with no building layer.** Everything else
in this document is a gameplay design; this part is a bug.

### Correction 2: the region query exists, and it is not in `TopologyManager`

ADR 0045 decision 8 records that `TopologyManager` does region detection and
exposes no enclosure query, that its `update()` has no caller, and that the
topological reading of `enclosed` therefore is not implementable today. The
first two claims hold — `TopologyManager.update`
(`src/simulation/rooms/topology.ts:55`) is absent from the `registerSystem`
block, where `navigation` is present (`src/simulation/runtime/new-session.ts:1588`).

**But the same flood fill runs every tick, in navigation, and is registered.**
`buildNavigationGraph` (`src/simulation/navigation/region-graph.ts:99`)
partitions every loaded chunk's tiles into maximal sets connected across
zero-valued edges (`src/simulation/navigation/region-graph.ts:148`), returns
`tileToRegion` and `regionTiles`, caches the result against a geometry
signature, and `NavigationSystem.getGraph()`
(`src/simulation/navigation/navigation-system.ts:163`) hands it out already
rebuilt if stale. `docs/NAVIGATION.md` describes it in the same words
`TopologyManager` would need: *"the world's tiles are partitioned into regions —
maximal sets of tiles connected by plain open boundaries (no wall, no door)"*.

So the repository contains **two flood fills over the same two edge planes, one
of which nobody runs.** That is worth an issue of its own regardless of this
design: `docs/AGENT_WORKFLOW.md` §3 says *"look one module over before
designing"*, and this is the second time in two days that the answer was already
written somewhere else.

What the navigation graph still cannot answer on its own is "is this region
closed", because a region that reaches the frontier of the *loaded* chunk set is
indistinguishable from one bounded by walls — exactly the missing frontier rule
ADR 0045 names. So the correction is not "the query exists, use it"; it is "the
component labelling exists, only the closure predicate is missing, and it is
missing in `navigation/`, not in `rooms/topology.ts`."

**This design does not need either of them**, and that is the point of decision
3.

---

## What the world model is today

Every anchor below was opened.

> **That sentence is true of 2026-08-27 and was never true of any later day,
> and it is corrected here rather than deleted because it is what a reader
> believed.** It is a *global pin*: one declaration covering every `file:line`
> under it. `docs/adr/README.md`'s section on anchor pins records the evidence
> that such a pin is **advisory** — seven commits across six documents moved or
> added anchors below an unchanged pin, one of them re-anchoring three pinned
> ADRs without its message mentioning a pin — so a pin neither freezes the code
> nor is honoured by the editors. This document is one of the six: `689f7d58`
> (2026-09-06) re-anchored below this line, `80b845cd` (2026-09-08) corrected a
> symbol name below it, and neither touched the sentence above.
>
> **Re-read 2026-09-15, every anchor opened.** Of the 39 `file:line` citations
> below this line, **13 still land on what their sentence names** — including
> the whole of *Terrain*, `construction-ownership.test.ts:124` in all three
> places it is cited, `definition.ts:6`, `tile-ownership.ts:61`,
> `edge-picking.ts:46`, `zoning.ts:142`, `fixed-step-clock.ts:29` and
> `simulation-alerts.ts:34` — and the rest have been re-aimed in place, each
> verified by opening it after the edit. **Read the re-aimed ones as of
> 2026-09-15 and the sentence above as of 2026-08-27; neither date covers the
> other.**

### Land

- A new session owns exactly one chunk: `new SparseWorld(32)`, `world.load(...)`,
  `world.setOwned(initialChunk, true)`
  (`src/simulation/runtime/new-session.ts:436-438`). Chunk size 32, so the playable
  world is tiles `0..31` square.
- **Nothing in `src/` can buy land.** `canPurchaseParcel`
  (`src/simulation/world/sparse-world.ts:702`) and `getParcelPrice` (`:711`) have no
  caller outside their own file, `registerParcel`'s only `src/` call site is
  `fromSnapshot` re-registering what a save carried
  (`src/simulation/world/tile-ownership.ts:17` says so and it is still true),
  and no command in `src/simulation/protocol/commands.ts` names a purchase —
  derive the command list with
  `grep -n "z.literal('" src/simulation/protocol/commands.ts`.
  So ADR 0045's *"unzonable until the adjoining parcel is bought"* names a route
  a player cannot take. **The current cost of the defect is therefore bounded and
  small**: the last row and last column of the one owned chunk cannot be *inside*
  an `enclosed` room, though they can carry its wall. That is worth stating,
  because it means decision 6 is a modest fix today and a load-bearing one the
  moment land purchase or a second chunk exists.
- Ownership is a disjunction over owned parcels plus outright chunk ownership,
  with one implementation (`isTileOwnedBy`, `src/simulation/world/tile-ownership.ts:61`),
  called by both `SparseWorld.isTileOwned` (`:680`) and the render view.

### What a chunk stores

`SparseWorld` keeps four parallel `Uint8Array(size*size)` planes per loaded
chunk — `chunkTerrain`, `chunkTopEdge`, `chunkLeftEdge`, `chunkZoning`
(`src/simulation/world/sparse-world.ts:284`–`:287`, allocated on demand through
`ensureStorageMap`, `:585`). All four serialize as optional RLE fields on
`SerializedChunkState` (`:45`), and `decodeChunk`'s `allowedKeys` lists exactly
those four as optional (`:191`). The save boundary mirrors it
(`src/persistence/save-schema.ts:124`–`:127`, `terrain` / `topEdge` / `leftEdge`
/ `zoning`, each `terrainRleSchema.optional()`; this branch wrote `:115`–`:118`
on 2026-09-15 and by 2026-09-16, when it merged `origin/main`, that span was a
blank line and the first three lines of `serializedChunkStateSchema`'s
`x`/`y`/`lifecycle`).

(**One word of that sentence is a re-aim rather than a line move, 2026-09-15.**
The four planes are no longer "allocated together" at a single `ensureStorage`
call the way the old `:770` anchor read: `ensureStorage` still exists (`:378`)
and materialises the chunk, while each plane's array is created lazily by
`ensureStorageMap` on the first write to it. Four planes, same four names, same
RLE serialization; only the moment of allocation moved.)

`getMapValue` answers `0` for a chunk that does not exist (`:564`); `setMapValue`
**materialises** one (`:572`, `this.load(chunk)`). That asymmetry is the whole
mechanism behind ADR 0045's out-of-bounds ordering argument.

### Terrain

Six definitions, including `grass` (`src/simulation/world/terrain.ts:22`) and
`concrete` (`:40`), each with a renderer row
(`src/rendering/world/appearance.ts:66`, `:68`). **Nothing in `src/` writes
terrain**: `grep -rn "setTerrain\|fillTerrain" --include=*.ts src/` returns only
the definitions in `sparse-world.ts` themselves. `getTerrainNumericId` returns
`0` for an absent plane (`src/simulation/world/sparse-world.ts:476`), and `0` is
`dirt`. So the shipped world is dirt everywhere and the terrain layer is a
feature with a reader and no producer.

### Walls, doors and the build queue

- A wall is an edge value. `finalizeConstruction`
  (`src/simulation/construction/system.ts:1917`) writes it through `writeEdge`
  (`:2031`, called at `:1934`), which calls `setTopEdge`/`setLeftEdge` and
  therefore bumps `geometryRevision`.
- `BuildableCategory` is `'wall' | 'object' | 'utility'`
  (`src/simulation/construction/definition.ts:6`). `wall-brick` is the only
  `'wall'`; a door is an `'object'` row carrying `placesDoor`.
- Cancelling a `completed` order reverses its geometry
  (`src/simulation/construction/system.ts:1012`–`:1014`, `revertConstruction` at
  `:1966`), rewriting the edge from any other completed order that still claims
  it rather than clearing it.
- **The crew is one.** `ConstructionSystem.update` runs on
  `intervalTicks: 10` (`:347`), advances a single in-progress order by `+10` per
  scheduled update, and `crewBusy` lets exactly one order be in progress at a
  time.

### Rooms

- `zone` (`src/simulation/rooms/zoning.ts:489`) checks room type → area →
  authored minimum → duplicate anchor (`:538`) → per-tile bounds/ownership/overlap
  (`:554`, `:555`, `:558`) → enclosure (`:611`) → write.
- `roomPerimeterEnclosure` is `2 × (width + height)` edge reads over the
  rectangle's own perimeter, with the south and east sides read off neighbouring
  tiles.
- Objects already require a room: `PlaceObject` refuses `outside-room`
  (`src/simulation/objects/object-placement-service.ts:540`).

### Rendering

`WorldRenderView` decodes the four planes into `ChunkLayers`
(`src/rendering/world/world-view.ts:21`) and fills a caller-owned `TileSample`
(`:36`, built by `createTileSample` at `:48`) carrying `terrainNumericId`, `topEdge`, `leftEdge`, `zoning`, `owned`.
The painter composites a terrain fill and a zoning tint per tile; an unloaded
chunk gets no draw calls at all and the camera background shows through.

### Roadmap

`docs/ROADMAP.md` phase 4 already lists **"floors, walls, doors, fences"**. This
design is not inventing a layer; it is landing a listed one.

---

## Decision

### 1. Owned land is grass, and that is one line

`fillTerrain(initialChunk, 'grass')` beside
`src/simulation/runtime/new-session.ts:436-438`. The definition exists, the
appearance row exists, and RLE makes a uniform chunk one run.

**This is separable and should ship on its own**, because it is the visible half
of what the owner asked for and it costs a line. It also gives the terrain layer
its first producer.

**One consequence to know before taking it.** The implicit default terrain of a
plane that was never written is `0` = `dirt`
(`src/simulation/world/sparse-world.ts:476`). If a later chunk is materialised —
which decision 6 can cause, see its consequences — it arrives dirt, and there is
a visible seam against the grass. Two exits: fill each chunk as it materialises,
or give `SparseWorld` a `defaultTerrainNumericId`, which is a snapshot field and
therefore a bigger decision. **Recommended: the fill.** Do not solve the seam by
renumbering terrain ids; `0` is persisted in every existing save.

### 2. A foundation is a floor value in a fifth per-chunk plane

`SparseWorld` gains `chunkFloor`, a fifth `Uint8Array(size*size)` beside the
four it already declares at `src/simulation/world/sparse-world.ts:284-287`, with
`getFloor`/`setFloor` written exactly like `getZoning`/`setZoning`
(`src/simulation/world/sparse-world.ts:554`, `:558`).
The stored value is a floor material's `numericId` from a small content
catalogue; `0` means bare ground.

**`setFloor` bumps `contentRevision`, not `geometryRevision`.** A floor blocks
nothing and connects nothing, so it must not invalidate the navigation graph:
`isNavigationGraphStale` fingerprints `geometryRevision`
(`src/simulation/navigation/region-graph.ts:204`, over the signature computed at
`:84`), and paving a hall would
otherwise rebuild the region graph for every tile of the slab. This is the same
choice `setZoning` makes and for the same reason.

**Why a plane and not a registry of building rectangles.** Three properties
decide it, and each is checkable:

- **It is already chunked.** `AGENTS.md` boundary 8 forbids a monolithic map
  matrix, and a fifth plane is not one: it is the same sparse, per-chunk,
  RLE-serialized shape the world has used since ADR 0004. A registry of
  building rectangles would be a second, unchunked spatial index that every
  containment query has to scan.
- **It answers "is this tile indoors" in one array read**, so the room rule in
  decision 4 costs one more read inside a loop that already runs. A rectangle
  registry costs a scan; a flood fill costs the whole loaded chunk set.
- **It imposes no shape.** A building can be an L, a courtyard block, a
  corridor with wings. Nothing computes an outline, so nothing has to validate
  one.

**Content shape.** A floor row carries an id, a `numericId` in `1..255`, a name
key, and a `roofed: boolean`. `roofed` is what lets a paved courtyard be
paving rather than a room later (decision 10). The first slice ships one row —
a concrete slab, `roofed: true`. `AGENTS.md` boundary 6: this is a data module,
not a condition chain.

**Cost, stated rather than assumed.** A loaded chunk goes from four planes to
five: 4 KiB → 5 KiB at `chunkSize` 32, and 16 KiB → 20 KiB at the
`WORLD_CHUNK_SIZE_LIMIT` of 64. `docs/WORLD.md` currently says *"a loaded chunk
owns four `size * size` byte planes"* and *"At `64` the worst case is 16 KiB per
loaded chunk"*; both sentences become wrong on the day this lands and both are
part of ADR 0004's bound reasoning. See "What this amends".

### 3. A building is not an entity, and nothing computes one

There is no `Building` record, no id, no registry, no persisted footprint. A
building is what a player sees when a contiguous slab of floor has walls around
it. The simulation never needs the concept, because no rule in this design is
about a *whole* building — every rule is about a tile or a rectangle.

**This is the decision that keeps the design cheap, and it is the one to
challenge first.** The moment a rule says "these two rooms must be in the *same*
building", or "this building's power comes from that generator", the connected
component becomes necessary and the honest answer is to use the labelling
`buildNavigationGraph` already produces rather than to build a third flood fill.
No such rule is authored today: `src/content/room-catalog.ts` has four
requirement kinds and none of them is about a neighbouring room.

**So: this design does not need the region query, and correction 2's finding is
a spare part rather than a dependency.** That is the load-bearing claim of the
whole document and it is named as such in "Weakest claim".

### 4. `zone` refuses an `enclosed` room that is not standing on a roofed floor

A ninth `ZoneRoomRefusalReason`, in the same table-driven vocabulary the eighth
went through: `ZoneRoomRefusalReason` → `ZONE_REFUSAL_REASONS` → `RefusalReason`
→ `REFUSAL_MESSAGE_KEY` → a locale key. Every hop is an exhaustive
`Readonly<Record<…>>`, so the member does not compile until every layer has
decided what the player is told.

(**The chain is real and its last hop's name never existed.** The
`Readonly<Record<RefusalReason, LocalizationKey>>` this arrow means is
`REFUSAL_LABEL_KEYS`, `src/ui/simulation-alerts.ts:34`; the first three hops
are exactly as written. A reader who greps the old name in lower case lands on
`refusalMessageKey` in `src/ui/hud/projection.ts`, which is **not** this hop —
that one is keyed by an `actionId` and a host refusal, a different path with a
similar name. Marked rather than overwritten, per `docs/AGENT_WORKFLOW.md` §4.)

**Name: `no-floor`.** Adjectival and about what the player must *do*, matching
`unowned-land` and `below-minimum-size` rather than the mechanism. `not-indoors`
was the alternative and is rejected because "indoors" is the conclusion, not the
missing thing.

**Where it runs: inside the existing per-tile loop**, after bounds and ownership
and beside the overlap check (`src/simulation/rooms/zoning.ts:554`–`:558`). Not
as a fifth pass. Three reasons, and they agree:

- It is one array read per tile, on tiles the loop already visits, so it is free
  next to the `canBuildAt` call already there.
- It must run after the bounds check, for the reason ADR 0045 decision 3 gives
  about enclosure: `getFloor` would answer `0` for a chunk that does not exist,
  and "pave this tile" is bad advice about a tile that is not there.
- The refusal can carry the first unfloored `tile`, which `ZoneRoomRefusal`
  already has an optional field for and which is exactly what that field is for.

**It fires only for a definition whose `enclosureRequirement` is `'enclosed'`**,
which is a content refusal exactly like `not-enclosed` — derive which rooms with
`grep -c "type: 'enclosed'" src/content/room-catalog.ts` against
`grep -c "type: 'outdoors'"`. A yard is not refused for standing on grass; that
is the point of it.

### 5. Enclosure is unchanged, and ADR 0045 decision 8 stands

`roomPerimeterEnclosure` is not touched, `not-enclosed` is not retired, and
`enclosed` still means *the room's own boundary is closed*. The floor rule is
**additive**: a cell must be both walled and indoors.

**Why both, when one would be simpler.** They answer different questions. Walls
answer *separation* — a cell that shares an open boundary with the next cell is
not a cell, whatever it is standing on. The floor answers *indoors* — a walled
rectangle on open grass is a pen. Collapsing the two would either let two cells
share an open boundary inside one hall, or make an unroofed walled yard an
interior room.

**A route that would dissolve the edge defect and is not taken here.** If
`enclosed` became floor-only, the defect would vanish without decision 6,
because a floor is written on the room's own tiles and those are always owned.
It is recorded rather than taken because it reopens a ruling the owner gave
directly, one day old, and because it costs the separation property above. If
the owner wants it, it is a change to ADR 0045 decision 8 and theirs to make.

### 6. An edge order is permitted when either of the two tiles it separates qualifies

> **Landed as slice 0, issue #448.** This decision — and only this decision —
> is implemented. The rest of this document is still *Proposed* and the Status
> section above still governs it. Three things below are worth reading against
> the code rather than as a plan: the frontier ring in consequence 1 is
> **deferred**, with the reason recorded in `docs/WORLD.md`; the refusal a
> player actually met was `out-of-bounds` rather than `unowned-land`, because
> with one owned chunk the two faces coincide with the edge of the materialised
> world; and the `canBuildAt` line this document cites as
> `src/simulation/construction/system.ts:266` has moved into `admits`
> (`:353`), called from `submitOrder` (`:313`).
>
> **All three of those line numbers have since drifted, and the block above is
> kept rather than renumbered because the reader needs to see a correction rot
> (2026-09-15).** `admits` is at `:583` and its `canBuildAt` call at `:587`;
> `submitOrder` is at `:540` and calls `admits` twice, once per tile of the
> edge (`:560`, `:563`), which is the decision below, in the code. Correction 1
> above, which cites the same original `:266`, was **not** amended when this
> block was written — so this document stated two different things about one
> anchor for eighteen days. It is amended now.

The fix from correction 1, stated as a decision because it changes a rule
`docs/WORLD.md` records and a test pins.

**Ownership.** `submitOrder` approves an edge-geometry order when the order's
tile *or* the tile across the named edge is owned. Non-edge buildables are
unaffected: an object is addressed by a tile and has no far side.
`occupiesTileEdge` (`src/simulation/construction/definition.ts:1005`) is the
predicate that already distinguishes the two.

**Bounds.** The same widening is needed on the out-of-bounds check
(`src/simulation/construction/system.ts:585`), or the south face of the world's
own frontier stays refused before ownership is ever consulted. An edge order is
in bounds when either adjacent tile is in a materialised chunk.

**Two consequences, both real, neither hidden:**

1. **Completing such an order materialises the far chunk.** `writeEdge` →
   `setTopEdge` → `setMapValue` → `load(chunk)`
   (`src/simulation/world/sparse-world.ts:538` → `:572` → `:372`). A fresh 32×32 chunk appears in
   the world, in the snapshot, and — because the render view draws every
   `loaded` chunk — on screen, as a block of unowned ground where there was
   void. That is a **visible** change and it should be a deliberate one.
   The alternative that makes it deliberate is a **frontier ring**: materialise
   the eight chunks around owned land at session start, unowned, so the world
   has a visible edge from the first frame instead of growing one when a wall
   completes. It costs eight chunks of planes and it is the shape land purchase
   will want anyway. Recommended, but separable and not decided here.
2. **`docs/WORLD.md`'s sentence and `tests/unit/construction-ownership.test.ts:124`'s
   title become wrong even though the test stays green.** Its fixture has one
   owned side and passes under either rule; what changes is the claim the title
   makes. Both need the same edit, and a test whose name asserts the opposite of
   the rule is worse than a failing one.

**Why this belongs in a buildings ADR at all**, given correction 1 says it is
independent: because every phase below sits on top of it. A building layer
raised on an asymmetric perimeter rule is a building layer whose south wall
cannot be built.

### 7. Saves: the plane is an optional field, and the rule gates the command

**No `SAVE_SCHEMA_VERSION` bump and no V6.** `floor?: TerrainRle` joins
`terrain`, `topEdge`, `leftEdge` and `zoning` in `SerializedChunkState`
(`src/simulation/world/sparse-world.ts:45`), in `decodeChunk`'s optional list
(`:191`) and in `serializedChunkStateSchema`
(`src/persistence/save-schema.ts:124`–`:127`; the anchor read `:115`–`:118`
until 2026-09-16, as above).

`AGENTS.md` boundary 7 **is** engaged here — unlike ADR 0045 decision 4, this
does add a field to a persistent format — and the three conditions
`docs/PERSISTENCE.md` states under *"Adding an optional field without a version
bump"* are met and should be checked rather than asserted:

- **The field is optional and absent means what the older build did.** A save
  with no `floor` plane is a prison with no floors, which is exactly what every
  prison written before this change was.
- **The key is declared.** Both `allowedKeys` and the Zod object are strict, so
  the key must be added in both or a snapshot carrying it cannot be saved at
  all. This is the half that bit #108.
- **Absence is unambiguous.** There is no value of `floor` that means "we did
  not know about floors", because the plane is absent in that case rather than
  zero-filled.

`WORLD_SNAPSHOT_VERSION` also stays at `1`, on the same grounds and by the same
precedent: `topEdge`, `leftEdge` and `zoning` were all added to that snapshot as
optional planes without moving it (`docs/WORLD.md`'s snapshot bullet records
that it failed to mention them for eleven edits, which is a different defect).

**Forward compatibility breaks, and it already did.** An older build reading a
newer save throws `WorldSnapshotError` from `allowedKeys`, because the decoder
rejects unknown keys. That is the existing contract for all four planes and this
adds a fifth to it; ADR 0038's compatibility rule is about a build reading an
*older* save and says nothing about the other direction.

**Existing zoned rooms are left exactly alone.** A restored prison's cells are
not on floors and stay zoned, occupied and counted; `zone` gates the *command*.
This is ADR 0045 decision 4's answer applied to the same shape of change, and it
is the right one here for one extra reason: **the state converges by play.** A
player can pave under an existing cell and it becomes compliant, which is not
true of, say, a room that violates a size rule.

**Alternative rejected: backfill a floor under every zoned `enclosed` room at
restore.** It looks kind and it is a silent, unrequested, unundoable write into
the player's saved world — paving rooms they never paved, in a material nobody
chose, at a moment (`restoreSessionSystems` step 2) when occupancy is not yet
loaded. It is also a *derivation* being written to disk, which is the shape ADR
0028 decision 6 removed.

**Alternative rejected: persist a `hasFloor` flag on `RoomInstance`.** Derived
from the plane and the rectangle, recomputable at any moment, so persisting it
buys nothing and can only disagree with the world it came from. Same argument
ADR 0045 decision 1 alternative B makes.

### 8. Determinism and serializability

`AGENTS.md` boundaries 2 and 7. A full audit found zero unheld determinism
claims in this corpus; this document does not intend to be the first.

- **No new iteration order.** The floor check runs inside `zone`'s existing
  ascending-y-then-x loop, so the tile a refusal names is a function of the
  request. No `Map` is walked, no `Set` is enumerated, no id is minted.
- **No new RNG stream**, so `deriveXoshiroState`'s registration set is
  unchanged and ADR 0038 decision 2's absence rule is not engaged.
- **The plane serializes through the one run-length codec** the save format
  already uses (`encodeTerrainRle`/`decodeTerrainRle`,
  `src/simulation/world/sparse-world.ts:179`, `:183`), so its round trip is the round
  trip four planes already have, including the `maxValue: 255` rejection.
- **Ordering of writes does not matter.** A floor value is a per-tile
  assignment, not an accumulation, so a slab paved in any order is the same
  slab. Contrast `setZoning`, which has the same property, and contrast the
  build queue, which does not and is already ordered by ascending order id.
- **The one thing an implementer must not do**: read `getFloor` before the
  bounds check. It answers `0` for a chunk that does not exist, which is the
  right value but the wrong diagnosis, and it is the mistake ADR 0045 decision 3
  spends a paragraph on for the edge planes.

### 9. What the player does, from empty grass to a working cell

Written in plain sentences, because a design that is technically sound and
tedious to play has failed.

1. **You start on a square of grass you own.** It has an edge you can see; the
   land beyond it is not yours.
2. **You pour a slab.** Pick the foundation from the build catalogue and drag a
   rectangle — the same drag that already zones a room
   (`src/rendering/build/area-picking.ts`), not a new gesture. The tiles turn to
   concrete as the crew works across them. The slab does not have to be a
   rectangle in the end: drag two and they join.
3. **You wall it in.** Pick the wall and drag along the slab's edges. The
   pointer already picks the edge you meant from where inside the tile you
   clicked (`src/rendering/build/edge-picking.ts`), and a drag is one wall in
   one undo step.
4. **You hang a door** in the wall line, so people can get in. The wall reads as
   closed and navigation reads a way through — that already works.
5. **You subdivide.** Drag more walls inside the slab to cut it into cells. Two
   cells side by side share one wall: the same stored edge is A's east boundary
   and B's west boundary, so subdividing costs one wall per partition, not two.
6. **You zone.** Drag a rectangle inside a walled compartment and pick "Cell".
   It is accepted because the compartment is walled and the tiles are floored.
   If either is missing, you are told which and where, before anything is
   written.
7. **You furnish it.** A bed must stand in a room, which is already the rule.
8. **A prisoner arrives and lives there.**

The loop the owner described, in the order they described it: ground → slab →
walls → rooms inside. Nothing in it is a new gesture; steps 2 and 6 are the same
drag against different tools, and steps 3 and 5 are the same drag against the
same tool.

**The pacing risk, derived rather than guessed.** The clock steps every 50 ms at
speed 1 (`src/simulation/clock/fixed-step-clock.ts:29`), `ConstructionSystem`
runs every ten ticks (`src/simulation/construction/system.ts:347`), and one
order is in progress at a time. So the crew completes **at most one order every
500 ms at speed 1**, or one every 125 ms at speed 4. A 10×10 slab is 100 orders
and therefore **at least 50 seconds of watching at speed 1**; a 20×20 slab is at
least 200. A wall segment is `workRequired: 50` at `+10` per update, so five
updates, so 2.5 s — a 2×3 cell's ten segments is about 25 s at speed 1.

That is the one number in this design that could make it unpleasant, and it is a
property of the **existing** single-crew queue rather than of floors. Three
exits, in the order I would try them: give the foundation a low `workRequired`
so it is one update per tile (it is already the floor of the cost); let the crew
run more than one order concurrently, which is a construction decision with its
own ADR-sized questions about materials; or make a foundation order cover a
rectangle, which changes `BuildOrder`'s tile-addressed shape and I would not.
**Measure before choosing.** Not decided here.

**A cap is required, not optional.** A wall drag is capped at
`MAX_RUN_SEGMENTS` = 64 (`src/rendering/build/edge-picking.ts:46`) precisely so
a careless flick cannot submit hundreds of orders. A zoning drag is
capped by `MAX_ZONE_DIMENSION_TILES` = 64 per side
(`src/simulation/rooms/zoning.ts:142`), which is 4,096 tiles — and `main.ts`
records what a stray one used to cost, *"one stray 64x64 drag could put 4,096
tiles beyond use for the whole session"*. A foundation drag of that size is 4,096
build orders, and it must carry a cap of its own before it ships.

### 10. What is deliberately not decided here

- **Whether `outdoors` becomes enforceable.** ADR 0045 decision 7 declines the
  mirror-image refusal for `room.yard` on two grounds, and the floor's `roofed`
  flag expires the second one — *"`outdoors` is a statement about a roof, and
  there is no roof in this world model at all"* stops being true. Its first
  ground, that a walled exercise yard is an ordinary prison yard, is about walls
  and survives untouched. So a future decision could refuse a yard **on a roofed
  floor** while still accepting a walled one. That is an amendment to ADR 0045
  and it is the owner's.
- **Whether a floor changes movement cost or any other tile property.** A
  concrete slab arguably should walk faster than mud. It would make the floor a
  navigation input and give `setFloor` a reason to bump `geometryRevision` after
  all, which is a different design.
- **Land purchase.** It does not exist and this document does not add it.
- **Whether `TopologyManager` should be deleted or wired.** Correction 2 is
  evidence for an issue, not a decision this ADR is entitled to take.
- **Demolishing a floor.** `revertConstruction` reverses a cancelled order's
  geometry, so cancelling a foundation order clears its tile by the same route
  a wall is cleared — but a *standalone demolition* tool for finished floors is
  the same gap walls already have and is not opened here.

---

## Phasing

Ordered so that each slice is coherent on its own and the owner can stop after
any of them.

| # | Slice | Why here | Unblocks |
| --- | --- | --- | --- |
| **0** ✅ | **The symmetric edge rule** (decision 6, without the frontier ring) — **landed, #448** | It is a defect, it is independent of everything else, and every later phase stands on it | A room flush against the edge of owned land becomes sealable; ADR 0045's recorded consequence is answered |
| 1 | **Grass** (decision 1) | One line, visible, gives the terrain layer a producer | The owner sees the thing they asked to see |
| 2 | **The floor plane** (decision 2), world + snapshot + render view + painter, no rule | Storage and pixels, with nothing gated on them yet, so no fixture moves | Everything below |
| 3 | **The foundation buildable** — a `'floor'` `BuildableCategory`, a `placesFloorId`, a `finalizeConstruction` branch, a `revertConstruction` branch, a catalogue row, an area drag with a cap | The player can now pour concrete | Phase 4 |
| 4 | **The rule** (decision 4): `zone` refuses `no-floor` | Last, because it is the only slice that invalidates fixtures | The design is in force |
| 5 | *(optional, separate decision)* `outdoors` enforced against `roofed` | Amends ADR 0045 decision 7 | — |

**The smallest coherent first slice is phase 0**, and it is not the building
layer. It is roughly one predicate in `submitOrder`, a widening of the bounds
check beside it, one new test per face, an edit to
`tests/unit/construction-ownership.test.ts:124`'s title and to `docs/WORLD.md`'s
sentence. If the owner reads only one part of this document, that is the part
that fixes what they were shown.

**Phase 1 could ship in the same commit as phase 0** and is unrelated to it.

**Phase 4 is where the cost lands.** ADR 0045 measured its own blast radius with
a probe — about 104 tests in 16 files, every one a fixture that zones a room on
open ground. Phase 4 hits *the same fixtures a second time*: a fixture already
being walled for `not-enclosed` will now also need a floor. That is a reason to
land phase 4 close behind whatever walls those fixtures, and it is a number
**I did not measure** — see "What I did not reach".

---

## What this supersedes or amends — for routing, not for editing

Nothing below is edited by this document.

- **[ADR 0045](./0045-must-a-zoned-room-be-enclosed.md), the edge-of-owned-land
  consequence.** 0045 routes it to *"a successor ADR on buildings"*. This is
  that successor and it **declines the routing**: the buildings layer does not
  fix it, decision 6 does, and 0045's Consequences bullet and the paragraph in
  its Status that names the successor both need rewording once decision 6 lands.
  That is an amendment to 0045 and it is the owner's.
- **ADR 0045 decision 8 is not touched.** `enclosed` still means the room's own
  boundary is closed. Decision 5 above says so explicitly so that nobody reads a
  floor requirement as a replacement for a wall requirement.
- **ADR 0045 decision 7** would be amended by phase 5 and by nothing before it.
  Named here so the dependency is visible; not proposed as part of this
  decision.
- **[ADR 0004](./0004-chunk-size-selection.md) and `docs/WORLD.md`'s chunk-cost
  arithmetic.** A loaded chunk owns five planes rather than four from phase 2
  on, so 4 KiB becomes 5 KiB at size 32 and 16 KiB becomes 20 KiB at the size-64
  ceiling. `WORLD_CHUNK_SIZE_LIMIT`'s justification is written in terms of that
  worst case and the number moves 25%. The bound itself does not need to change;
  the sentences do.
- **`docs/WORLD.md`'s edge-ownership sentence** — *"Which tile must be owned for
  an edge order is the order's own tile"* — is superseded by decision 6.
- **[ADR 0028](./0028-object-placement-and-derived-room-capacity.md)** is
  untouched. Its `outside-room` refusal already chains objects → rooms, and this
  extends the chain to rooms → floors without changing the object end of it.
- **[ADR 0022](./0022-room-zoning-surface.md)** is untouched: the zoning gesture
  and its surface do not change, only what `zone` will accept.
- **[ADR 0031](./0031-build-queue-cancellation-surface.md) and
  [ADR 0035](./0035-buildable-catalogue-category-filter.md)** are engaged rather
  than amended. A foundation row is one more row in a catalogue 0031's open
  question 4 was promoted to blocking over, and 0035's filter groups by content
  category — a `'floor'` buildable places no object, so it falls into the
  `hud.build.category.structure` group beside walls and doors, or wants a key of
  its own. A HUD decision, named so it is not discovered late.
- **`docs/ROADMAP.md` phase 4** lists "floors, walls, doors, fences". This is the
  first of the four.

---

## Alternatives considered

**A. A building as an explicit rectangle registry.** A `BuildingFootprint` with
an anchor and a width/height, registered like a `RoomInstance`; rooms must be
contained in one. Rejected: containment is cheap but the registry is a second
spatial index that must be persisted, migrated, kept consistent with a world
that can be demolished under it, and — the decisive part — it forces buildings
to be rectangles, which is exactly the expressiveness a prison layout needs
most. It also invents an entity with an id, and ADR 0012 then applies to how
that id is derived.

**B. A building recognised after the fact from a closed wall loop.** The
flood-fill convention the web search found. Rejected on cost and on
undecidability at the frontier: it needs a component labelling (which exists,
in navigation — correction 2), *plus* a closure predicate, *plus* a rule about
what it means for a region to reach the edge of the materialised world. It also
makes "am I allowed to zone here" depend on a global computation, so the answer
to a local question changes when something far away is demolished. Recorded
because it is the obvious answer and because the reason to decline it is not
obvious.

**C. Count an unowned neighbour as a wall.** The owner rejected this framing
directly. It is also wrong on its own terms: it makes the world's frontier into
a free wall, so a prison built flush against the property line gets two sides
for nothing, and it makes the same rectangle's enclosure answer depend on where
the parcel boundary happens to fall.

**D. Make the player buy the adjoining parcel.** Also rejected by the owner, and
independently impossible: no command in `src/` can buy land.

**E. Floor as a terrain value, with no new plane.** Paint `concrete` into the
terrain plane and call that the foundation. Genuinely tempting — zero new
storage, zero new snapshot field, and the renderer already draws it. Rejected
because it destroys information: the grass under a demolished building cannot be
restored, since the world no longer records what was there. It also conflates a
gameplay state ("this is indoors") with a natural property ("this ground is
rock"), so a rock outcrop could not be floored over and a paved courtyard would
be indistinguishable from a slab. The `roofed` flag has nowhere to live.

**F. Floor-only enclosure, dropping the wall requirement.** Discussed in
decision 5. It dissolves the edge defect for free and reopens a ruling from the
day before. Recorded as the owner's to take.

---

## Consequences

- **Phases 0 and 1 are small and shippable now**; phases 2–4 are a real change
  across world, construction, zoning, persistence, rendering and UI.
- **A fifth plane per loaded chunk**, and two sentences of chunk arithmetic in
  `docs/WORLD.md` become wrong on the day it lands.
- **A ninth zoning refusal**, and with it a new locale key, a new
  `RefusalReason`, and four exhaustive records that will not compile until each
  hop is decided — which is the mechanism working, not a cost.
- **Completing a perimeter wall on the south or east face of owned land
  materialises the chunk beyond it**, which is visible on screen. The frontier
  ring makes that deliberate; without it, land appears when a wall finishes.
- **Every fixture that zones an `enclosed` room needs a floor as well as walls**
  once phase 4 lands.
- **`TopologyManager` is now demonstrably a duplicate** of a live computation in
  `navigation/`. That is an issue this document creates the evidence for and
  does not close.

## What would change this decision

- **A rule about a whole building landing** — power, water, a per-building
  temperature, "these two rooms must be in the same block". Decision 3's "no
  entity, no component" stops holding and the design needs the region labelling
  after all, in which case use navigation's rather than writing a third one.
- **Play showing that pouring a foundation is busywork.** If the slab is
  something the player always wants under every wall, then a foundation is
  implied by walls and should be free, and this whole layer collapses into
  decision 1 plus decision 6. The pacing arithmetic in decision 9 is where that
  would show up first.
- **The owner reopening ADR 0045 decision 8.** Alternative F becomes available
  and phase 0 stops being a prerequisite.

## What I did not reach

- **I did not measure phase 4's fixture blast radius.** ADR 0045 ran a probe and
  reported per-file failure counts; I ran no probe, changed no `src/`, and ran
  neither `tsc` nor `vitest` — this branch contains one new document and nothing
  else. The claim that phase 4 hits the same fixtures as ADR 0045's change is a
  reading of what those fixtures do, not a measurement.
- **I did not open every one of ADR 0045's cited test files.** I read
  `tests/unit/construction-ownership.test.ts` because decision 6 turns on it,
  and I did not read the sixteen files in 0045's table.
- **I did not check the HUD projection surface** beyond the build catalogue's
  category filter. Whether the Rooms panel should warn about a missing floor
  before Confirm is the same pre-confirm question ADR 0045 decision 5 named and
  declined, and it is unanswered for both.
- **I did not benchmark anything.** The pacing figures in decision 9 are derived
  from three constants and are arithmetic, not measurement; the 5 KiB/20 KiB
  plane figures are likewise arithmetic.
- **The `roofed` flag is asserted to be enough** to separate a paved courtyard
  from an interior. I did not work through what a partially roofed structure or
  a multi-storey one would need, because neither exists.

## Weakest claim, and what would change my mind

**Decision 3 — that a building never needs to be a thing the simulation can name
— is the weakest claim in this document**, and everything cheap about the design
rests on it. It is true of the rules that exist today and I verified that by
reading the four requirement kinds in `src/content/room-catalog.ts`. It is a
prediction about the rules that do not exist yet, and prison games acquire
building-scoped rules — power grids, plumbing, fire, temperature, wings — as a
matter of course.

**What would change my mind:** one authored requirement whose subject is a
building rather than a tile or a rectangle. The first one to arrive should be
treated as evidence that this decision was wrong rather than as a special case,
and the response should be to label components with the graph
`buildNavigationGraph` already builds — not to add a `Building` registry, and
not to write a third flood fill.

**The second weakest claim is correction 1's completeness.** I argue the edge
defect is caused by one asymmetric predicate and fixed by widening it. I did not
enumerate every caller that could reproduce the asymmetry elsewhere:
`ObjectPlacementService` and `RoomZoningService` also call `canBuildAt`
(`src/simulation/objects/object-placement-service.ts:526`,
`src/simulation/rooms/zoning.ts:555`), and neither is an edge order, so neither
should change — but "should not" is an argument and not a check.
