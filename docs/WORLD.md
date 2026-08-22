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

## Parcels and land ownership

Parcels are gameplay/economy ownership regions that are decoupled from chunk boundaries:
- Parcels define arbitrary bounding rectangles that can span multiple chunks or partial chunks.
- Tile ownership (`world.isTileOwned(tile)`) returns true if the tile falls within any owned parcel or directly owned chunk.
- Purchase eligibility (`canPurchaseParcel`) and pricing (`getParcelPrice`) are decoupled through pure hooks (`defaultParcelEligibilityHook`, `defaultParcelPricingHook`).

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
