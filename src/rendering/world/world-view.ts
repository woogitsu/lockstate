import type { ParcelRect } from '../../simulation/world/parcel';
import { createParcelRect } from '../../simulation/world/parcel';
import type { WorldSnapshotV1 } from '../../simulation/world/sparse-world';
import { decodeTerrainRle } from '../../simulation/world/sparse-world';
import { isTileOwnedBy } from '../../simulation/world/tile-ownership';
import type { TileBounds } from '../tile-metrics';

/**
 * The renderer's read-only view of the world.
 *
 * It is built from a world snapshot the simulation worker produced and it is
 * never written to. That is the point: `AGENTS.md` boundary 1 says rendering
 * is not simulation, so the renderer deliberately does *not* keep a live
 * `SparseWorld` it could mutate. What it keeps is the decoded, tile-addressable
 * projection of one snapshot, replaced wholesale when a newer one arrives.
 *
 * No Phaser and no DOM: this is plain data, unit-testable in Node.
 */

interface ChunkLayers {
  readonly terrain: Uint8Array | undefined;
  readonly topEdge: Uint8Array | undefined;
  readonly leftEdge: Uint8Array | undefined;
  readonly zoning: Uint8Array | undefined;
}

/**
 * A caller-owned tile read-out.
 *
 * `readTile` fills one of these instead of returning a fresh object, because
 * the tile painter reads thousands of tiles per repaint and per-tile garbage
 * is exactly the kind of cost `AGENTS.md`'s performance philosophy calls a
 * contract rather than a cleanup task.
 */
export interface TileSample {
  /** False for tiles in a chunk the simulation has not materialised. */
  loaded: boolean;
  terrainNumericId: number;
  /** Non-zero when a wall segment runs along the tile's north edge. */
  topEdge: number;
  /** Non-zero when a wall segment runs along the tile's west edge. */
  leftEdge: number;
  zoning: number;
  owned: boolean;
}

export function createTileSample(): TileSample {
  return { loaded: false, terrainNumericId: 0, topEdge: 0, leftEdge: 0, zoning: 0, owned: false };
}

function layerKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`;
}

export class WorldRenderView {
  /**
   * One-entry memo for the last chunk looked up. A repaint scans tiles in
   * row-major order, so consecutive reads land in the same chunk far more
   * often than not, and this removes the string key and map probe from the
   * inner loop without any cache-invalidation surface (the view is immutable).
   */
  private memoKey: string | undefined;
  private memoLayers: ChunkLayers | undefined;

  private constructor(
    public readonly chunkSize: number,
    private readonly chunks: ReadonlyMap<string, ChunkLayers>,
    private readonly ownedChunkKeys: ReadonlySet<string>,
    private readonly ownedParcels: readonly ParcelRect[],
    /** Tile bounds of everything materialised, for framing the camera on first sight of a world. */
    public readonly loadedBounds: TileBounds | undefined,
  ) {}

  public static fromSnapshot(snapshot: WorldSnapshotV1): WorldRenderView {
    const size = snapshot.chunkSize;
    if (!Number.isSafeInteger(size) || size <= 0) throw new RangeError('World snapshot chunk size is invalid.');

    const tilesPerChunk = size * size;
    const chunks = new Map<string, ChunkLayers>();
    let bounds: TileBounds | undefined;

    for (const chunk of snapshot.chunks) {
      if (chunk.lifecycle !== 'loaded') continue;
      const key = layerKey(chunk.x, chunk.y);
      chunks.set(key, {
        terrain: chunk.terrain === undefined ? undefined : decodeTerrainRle(chunk.terrain, tilesPerChunk),
        topEdge: chunk.topEdge === undefined ? undefined : decodeTerrainRle(chunk.topEdge, tilesPerChunk),
        leftEdge: chunk.leftEdge === undefined ? undefined : decodeTerrainRle(chunk.leftEdge, tilesPerChunk),
        zoning: chunk.zoning === undefined ? undefined : decodeTerrainRle(chunk.zoning, tilesPerChunk),
      });

      const minTileX = chunk.x * size;
      const minTileY = chunk.y * size;
      bounds =
        bounds === undefined
          ? { minTileX, minTileY, maxTileX: minTileX + size - 1, maxTileY: minTileY + size - 1 }
          : {
              minTileX: Math.min(bounds.minTileX, minTileX),
              minTileY: Math.min(bounds.minTileY, minTileY),
              maxTileX: Math.max(bounds.maxTileX, minTileX + size - 1),
              maxTileY: Math.max(bounds.maxTileY, minTileY + size - 1),
            };
    }

    const ownedChunkKeys = new Set<string>();
    for (const position of snapshot.ownedChunks) ownedChunkKeys.add(layerKey(position.x, position.y));

    const ownedParcelIds = new Set(snapshot.ownedParcels ?? []);
    const ownedParcels: ParcelRect[] = [];
    for (const parcel of snapshot.parcels ?? []) {
      if (!ownedParcelIds.has(parcel.id)) continue;
      ownedParcels.push(createParcelRect(parcel.x, parcel.y, parcel.width, parcel.height));
    }

    return new WorldRenderView(size, chunks, ownedChunkKeys, ownedParcels, bounds);
  }

  /** An empty world: nothing loaded, nothing owned. Used before the first snapshot arrives. */
  public static empty(chunkSize = 32): WorldRenderView {
    return new WorldRenderView(chunkSize, new Map(), new Set(), [], undefined);
  }

  public readTile(tileX: number, tileY: number, out: TileSample): void {
    const size = this.chunkSize;
    const chunkX = Math.floor(tileX / size);
    const chunkY = Math.floor(tileY / size);
    const key = layerKey(chunkX, chunkY);

    let layers: ChunkLayers | undefined;
    if (this.memoKey === key) {
      layers = this.memoLayers;
    } else {
      layers = this.chunks.get(key);
      this.memoKey = key;
      this.memoLayers = layers;
    }

    const index = (tileY - chunkY * size) * size + (tileX - chunkX * size);
    out.loaded = layers !== undefined;
    out.terrainNumericId = layers?.terrain?.[index] ?? 0;
    out.topEdge = layers?.topEdge?.[index] ?? 0;
    out.leftEdge = layers?.leftEdge?.[index] ?? 0;
    out.zoning = layers?.zoning?.[index] ?? 0;
    out.owned = this.isTileOwnedInChunk(tileX, tileY, key);
  }

  public isChunkLoaded(chunkX: number, chunkY: number): boolean {
    return this.chunks.has(layerKey(chunkX, chunkY));
  }

  /**
   * A tile is owned when any owned parcel contains it or its chunk is owned
   * outright, read from the same snapshot fields the simulation owns rather
   * than from any renderer state.
   *
   * The rule is not implemented here: it is `isTileOwnedBy`, in
   * `src/simulation/world`, and `SparseWorld.isTileOwned` calls that same
   * function -- so this cannot answer differently from the simulation, which is
   * what `canBuildAt` consults. It used to be a second implementation of
   * the rule, and the two differed for a tile whose lowest-id covering parcel
   * was unowned while a higher-id parcel covering it was owned -- overlapping
   * bounds being something `registerParcel` permits. They agreed on every
   * other tile (issue #93). `AGENTS.md` boundary 1 is why the shared rule
   * lives on the simulation side rather than here: a renderer answering an
   * ownership question from logic of its own is a second source of truth for
   * game state whether or not it agrees.
   *
   * Coordinates are plain numbers, not `TileCoordinate`. Until issue #93 this
   * method branded them with `tileCoordinate`, which throws `RangeError` for a
   * fractional or unsafe integer -- but it did so only while the view held at
   * least one owned parcel, so it was never a contract a caller could rely on,
   * and `readTile` answers every other field for such an input silently (a
   * fractional tile index misses the layer arrays and reads as 0). Every call
   * site in `src/` derives its coordinates from integer loops over chunk
   * bounds (`rendering/phaser/tile-layer.ts`, `rendering/world/row-index.ts`).
   * The branded, validating entry point for tile ownership is
   * `SparseWorld.isTileOwned`, which takes a `TilePosition`.
   */
  public isTileOwned(
    tileX: number,
    tileY: number,
    chunkX = Math.floor(tileX / this.chunkSize),
    chunkY = Math.floor(tileY / this.chunkSize),
  ): boolean {
    return this.isTileOwnedInChunk(tileX, tileY, layerKey(chunkX, chunkY));
  }

  /**
   * `isTileOwned` for a caller that already holds the chunk key. `readTile`
   * does, so taking the key as a parameter keeps that loop from rebuilding the
   * same string once per tile. Like the layer memo above, that is a shape
   * choice to avoid the work, not a measured optimisation -- no benchmark
   * scenario exercises the render view.
   */
  private isTileOwnedInChunk(tileX: number, tileY: number, chunkKey: string): boolean {
    return isTileOwnedBy(tileX, tileY, this.ownedParcels, this.ownedChunkKeys.has(chunkKey));
  }

  public get loadedChunkCount(): number {
    return this.chunks.size;
  }
}
