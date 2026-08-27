# World chunk, terrain and parcel contract

`src/simulation/world` owns authoritative sparse chunk metadata, terrain layers and parcel ownership used by simulation systems. It imports no renderer, browser persistence or cloud code.

## Coordinates and chunk size

Tile and chunk coordinates are safe integers. Tile-to-chunk conversion uses mathematical floor division, so tile `-1` in a 32-tile chunk is chunk `-1`, local tile `31`. Chunk keys use the stable, locale-independent `x,y` format.

Per [ADR-0004](./adr/0004-chunk-size-selection.md), `32×32` logical tiles (`1024` tiles) is the default production chunk size, backed by benchmarks comparing `16×16`, `32×32` and `64×64` candidates across sparse-edge and dense workloads.

Chunk size is also **bounded above**, at `WORLD_CHUNK_SIZE_LIMIT` (`64`, ADR-0004's largest benchmarked candidate). `chunkSize()` rejects anything larger, and both the `SparseWorld` constructor and `SparseWorld.fromSnapshot` call it, so a live world and a restored one pass through the same limit. The bound exists because the value sizes allocations rather than merely describing them: a loaded chunk owns four `size * size` byte planes, so an unbounded `chunkSize` let a few hundred bytes of snapshot ask for gigabytes (issue #102: a 453-byte save envelope declaring `chunkSize: 20000` decoded cleanly and then allocated 1,526 MiB of `ArrayBuffer`, measured here; at `chunkSize: 500000` the plane is 250 GB and the allocation itself throws a bare `RangeError: Array buffer allocation failed`). At `64` the worst case is 16 KiB per loaded chunk. See "Chunk size is bounded, and why that is a format decision" in [PERSISTENCE.md](./PERSISTENCE.md) for what this means for saves.

## Terrain layers

Terrain definitions are data-driven records with stable string IDs, packed numeric IDs (0..255), and gameplay properties (`buildable`, `walkable`, `movementCost`, `isWater`).

- Loaded chunks store terrain in packed `Uint8Array(chunkSize * chunkSize)` buffers (1 KiB per 32×32 chunk).
- Terrain mutations advance the chunk's `contentRevision` and mark the chunk `dirty`.
- Serialization uses deterministic Run-Length Encoding (RLE) tuples `[numericId, count]` to minimize snapshot size for uniform regions.
- `encodeTerrainRle` / `decodeTerrainRle` are thin wrappers over
  `src/simulation/codec/run-length.ts`, the one run-length codec the save
  format uses — the entity store's liveness ledger goes through the same
  functions (#123 item 3). A world plane is a `Uint8Array`, so it passes
  `maxValue: 255`; the decoder rejects anything outside `0..255` rather than
  letting `fill` coerce it, and it still raises `WorldSnapshotError` because
  the shared codec builds no errors of its own. See
  `docs/PERSISTENCE.md` → "One run-length codec, two planes".

## Wall geometry lives on tile edges

A wall is not a tile. Each loaded chunk carries two more packed
`Uint8Array(chunkSize * chunkSize)` layers beside terrain — `topEdge` and
`leftEdge` — where a non-zero value means "a wall segment runs along this
tile's north (respectively west) boundary". Only two of the four edges are
stored per tile, because the other two already have a home: the south edge of
`(x, y)` *is* the north edge of `(x, y + 1)`, and the east edge of `(x, y)`
*is* the west edge of `(x + 1, y)`. One edge, one slot, so a wall can never be
recorded twice or half-erased.

`setTopEdge` / `setLeftEdge` advance the chunk's **`geometryRevision`** (not
`contentRevision`), which is the signal `TopologyManager` watches to recompute
enclosure. The flood fill crosses any zero edge and stops at any non-zero one,
and the renderer draws an edge wall wherever the value is non-zero; nothing
else reads the value today, so `1` currently means "a wall segment" rather
than a material id.

Writing those layers is `ConstructionSystem`'s job, and only on an order that
completes. A `BuildOrder` therefore carries an optional `edge` (`'north'` or
`'west'`, defaulting to `'north'` — see
`src/simulation/construction/build-order.ts`), and `PlaceBuildOrder` carries
the same field. The field is optional so a session snapshot written before it
existed still restores without a schema bump: no such save can disagree with
the default, because before that change completing an order wrote no geometry
at all.

## Parcels and land ownership

Parcels are gameplay/economy ownership regions that are decoupled from chunk boundaries:
- Parcels define arbitrary bounding rectangles that can span multiple chunks or partial chunks.
- Tile ownership (`world.isTileOwned(tile)`) returns true if the tile falls within any owned parcel or directly owned chunk.
- Purchase eligibility (`canPurchaseParcel`) and pricing (`getParcelPrice`) are decoupled through pure hooks (`defaultParcelEligibilityHook`, `defaultParcelPricingHook`).

### Overlapping parcels, and the one ownership rule

`registerParcel` rejects a duplicate id and nothing else, so parcel bounds may
overlap and a tile may sit under several parcels. **Any** owned parcel
containing the tile is sufficient; an unowned parcel covering the same tile
takes nothing away. Ownership is a disjunction, not a lookup, so it does not
depend on which parcel comes "first".

That half of the rule is settled.
[ADR 0019](./adr/0019-tile-ownership-under-overlapping-parcels.md) records it
and is **Accepted**, so the ownership bullet above is a ratified decision and
not merely a description of what the code does.
`SparseWorld.isTileOwned` used to answer differently in exactly one case: a tile
whose lowest-id covering parcel was unowned while a higher-id parcel covering it
was owned was unowned to the simulation. That case now answers *owned*, which is
the change ADR 0019 asked to be signed off, and issue #120 records the wording
that would have replaced this bullet had it gone the other way.

What does *not* depend on that decision: the rule has exactly one
implementation, `isTileOwnedBy` in `src/simulation/world/tile-ownership.ts`,
and both `SparseWorld.isTileOwned` and the renderer's
`WorldRenderView.isTileOwned` call it. The renderer must not answer this
question from logic of its own — `AGENTS.md` boundary 1, rendering is not
simulation — so a new consumer of tile ownership calls `isTileOwnedBy` instead
of reimplementing it. Before issue #93 the two had separate implementations
that did not always agree, and `WorldRenderView.isTileOwned` feeds
`TileSample.owned` while `SparseWorld.isTileOwned` is what `canBuildAt`
consults, so one question was being answered twice on either side of the same
decision.

Because ownership is a disjunction, no iteration order can change the answer —
not registration order, not a snapshot round trip. `SparseWorld` still collects
the owned parcels in canonical ascending-id order anyway, because
[DETERMINISM.md](./DETERMINISM.md) states that rule for anything feeding
simulation state without an exception. `getParcelAtTile` answers a different
question — *which* parcel is here, first match in ascending-id order — and
genuinely needs that order to stay stable across a round trip. It serves
pricing, selection and UI; it is not the ownership test.

## Buildability

`canBuildAt(world, tile, requirement)` validates construction suitability:
- Verifies land ownership (`requiresOwnedLand`).
- Checks terrain properties (e.g. `requiresBuildableTerrain`, `allowWater`).

It has three production callers, each supplying its own requirement set:
`ConstructionSystem.submitOrder` (`src/simulation/construction/system.ts:353`,
inside `admits`, with `SUBMISSION_REQUIREMENT`), `ObjectPlacementService`
(`src/simulation/objects/object-placement-service.ts:349`,
`PLACEMENT_REQUIREMENT`) and room zoning (`src/simulation/rooms/zoning.ts:423`,
`ZONING_REQUIREMENT`). **This document said "its one production caller" from
`f1d5c30` until this correction**; the second arrived at `041a379` (#269) and
the third at `6cededc` (#320), so the sentence had been wrong for about a
hundred releases. The terrain clause below is scoped to `SUBMISSION_REQUIREMENT`
and does not describe the other two — `zoning.ts:307` records that `canBuildAt`
defaults terrain checks **on**.

`ConstructionSystem.submitOrder` refuses a
build order whose tile the player does not own — the order is `failed` with
`failReason: 'unowned-land'` rather than queued, because ownership is
permission and permission cannot be queued (#215). *Which* tile that is, for an
order that occupies an edge rather than a tile, is the subsection below. That caller passes
`requiresOwnedLand` only: **terrain is deliberately not enforced at
submission**, so a wall may currently be ordered on water or on rock. Turning
either on is its own gameplay decision, and `SUBMISSION_REQUIREMENT` in
`src/simulation/construction/system.ts` is where it would be taken.

### An edge order is judged by both tiles the edge separates

An *edge* order is permitted when **either** of the two tiles the edge
separates qualifies — the ownership test and the bounds test beside it, asked
of both and satisfied by either. The world keeps one slot per edge and keeps it
on the north and west side, so the south face of owned land is addressed as the
north edge of the first unowned row and its east face as the west edge of the
first unowned column; `ConstructionSystem.submitOrder`
(`src/simulation/construction/system.ts:313`) asks `admits` (`:349`) about the
order's own tile and, only if that refuses, about the tile across the named
edge. Non-edge buildables are unaffected — an object is addressed by a tile and
has no far side, which is what `occupiesTileEdge` decides — and the refusal the
player is told about is still the order's own tile's, because that is the tile
they named.

**This paragraph said the opposite until issue #448, and the reason it did is
the durable half.** It read:

> Which tile must be owned for an *edge* order is the order's own tile, not the
> tile across the edge it occupies: every boundary edge of an owned parcel has
> unowned land on the far side, and a prison is a perimeter.

The justification is right, and it is *why* the rule is now symmetric; the rule
it justified was only half of it. Asking the order's own tile alone approved the
north and west faces of owned land and refused the south and east faces — the
same physical wall, on the same property line, decided by which of its two
neighbours the world happened to keep the slot on. Since
[ADR 0045](./adr/0045-must-a-zoned-room-be-enclosed.md) that was a wrong
*refusal* rather than a wrong readout: `roomPerimeterEnclosure` reads a room's
south boundary off the row below it, so a room flush against the edge of owned
land could never be sealed and therefore could never be zoned.
[ADR 0047](./adr/0047-raising-a-building-on-open-ground.md) decision 6 is the
ruling; #448 is where it landed, with the corner cell in
`tests/integration/edge-of-owned-land-room.test.ts` as the case that could not
be built before.

**The refusal a player actually met was `out-of-bounds`, not `unowned-land`.**
No land purchase exists, so a session owns exactly one 32×32 chunk and the
south and east faces of owned land are also the edge of the materialised world
— which the bounds check refuses before ownership is ever consulted. Both
halves had to widen together for the fix to be reachable at all; the
ownership half alone would have changed nothing a player could see.

**Completing such an order materialises the neighbouring chunk, and the
frontier ring that would make that deliberate is deferred.** `writeEdge` →
`setTopEdge` → `setMapValue` loads the chunk it is asked to write into, and
`WorldRenderView` draws every loaded chunk, so walling the south or east face of
the world's frontier puts a fresh 32×32 block of unowned ground on screen where
there was empty background. ADR 0047 decision 6 proposes pre-materialising the
eight chunks around owned land at session start so the world has a visible edge
from the first frame. It is **not** taken here, for three reasons:

- **It changes what a new session's world is**, from one materialised chunk to
  nine — moving the world snapshot every new prison writes, `loadedBounds`, and
  the loaded-chunk set navigation is handed. That is a world-model decision, and
  ADR 0047 is *Proposed*; taking it inside a defect fix would be self-approving
  it (`docs/AGENT_WORKFLOW.md` §3).
- **The fix does not need it.** The ground that appears is unowned and stays
  unowned, so every rule that asks `canBuildAt` for owned land still refuses it
  — a room may not be zoned there, and
  `tests/integration/edge-of-owned-land-room.test.ts` asserts that rather than
  assuming it. Only the wall was ever allowed across the line. What is deferred
  is a presentation guarantee, not a rule.
- **The ring's shape is a question land purchase will answer differently.** A
  ring around *owned land*, recomputed when a parcel is bought, is not the same
  object as a ring around chunk `(0, 0)`, and building the second now is work
  the first would throw away.

## Snapshot schema

`WorldSnapshotV1` contains:
- `version`: snapshot format version (`1`),
- `chunkSize`: chunk dimension (default `32`, at most `WORLD_CHUNK_SIZE_LIMIT`),
- `ownedChunks`: sorted list of owned chunk positions,
- `chunks`: sorted chunk records with revisions and, each optional, the RLE
  terrain plane and the `topEdge`, `leftEdge` and `zoning` planes
  (`src/simulation/world/sparse-world.ts:44-54`). **This bullet named only
  terrain** from `2ef4194` until this correction, through eleven later edits to
  this file, while walls, doors and the zoning plane were all persisted —
  `docs/NAVIGATION.md:78-80` relies on the opposite,
- `parcels`: sorted registered parcel definitions,
- `ownedParcels`: sorted list of owned parcel IDs.

Deserialization rejects unknown versions, duplicate references, unexpected keys and invalid revisions.
