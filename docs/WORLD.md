# World chunk, terrain and parcel contract

`src/simulation/world` owns authoritative sparse chunk metadata, terrain layers and parcel ownership used by simulation systems. It imports no renderer, browser persistence or cloud code.

## Coordinates and chunk size

Tile and chunk coordinates are safe integers. Tile-to-chunk conversion uses mathematical floor division, so tile `-1` in a 32-tile chunk is chunk `-1`, local tile `31`. Chunk keys use the stable, locale-independent `x,y` format.

Per [ADR-0004](./adr/0004-chunk-size-selection.md), `32×32` logical tiles (`1024` tiles) is the default production chunk size, backed by benchmarks comparing `16×16`, `32×32` and `64×64` candidates across sparse-edge and dense workloads.

## Terrain layers

Terrain definitions are data-driven records with stable string IDs, packed numeric IDs (0..255), and gameplay properties (`buildable`, `walkable`, `movementCost`, `isWater`).

- Loaded chunks store terrain in packed `Uint8Array(chunkSize * chunkSize)` buffers (1 KiB per 32×32 chunk).
- Terrain mutations advance the chunk's `contentRevision` and mark the chunk `dirty`.
- Serialization uses deterministic Run-Length Encoding (RLE) tuples `[numericId, count]` to minimize snapshot size for uniform regions.

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

**That half of the rule is not settled.**
[ADR 0019](./adr/0019-tile-ownership-under-overlapping-parcels.md) records it and
is *Proposed — pending human approval*, so the ownership bullet above and the
paragraph above describe what the code does today, not a ratified decision.
`SparseWorld.isTileOwned` used to answer differently in exactly one case: a tile
whose lowest-id covering parcel was unowned while a higher-id parcel covering it
was owned was unowned to the simulation. If ADR 0019 is rejected, that case
returns to the old answer and this section is rewritten; issue #120 records the
replacement wording for the bullet above.

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

## Snapshot schema

`WorldSnapshotV1` contains:
- `version`: snapshot format version (`1`),
- `chunkSize`: chunk dimension (default `32`),
- `ownedChunks`: sorted list of owned chunk positions,
- `chunks`: sorted chunk records with revisions and optional RLE terrain,
- `parcels`: sorted registered parcel definitions,
- `ownedParcels`: sorted list of owned parcel IDs.

Deserialization rejects unknown versions, duplicate references, unexpected keys and invalid revisions.
