import type { TerrainRle } from '../world/sparse-world';
import { SparseWorld } from '../world/sparse-world';

export const WORLD_RENDER_SNAPSHOT_SCHEMA_ID = 'lockstate.world-render-snapshot';
export const WORLD_RENDER_SNAPSHOT_SCHEMA_VERSION = 1;

export interface RenderChunk {
  readonly x: number;
  readonly y: number;
  readonly geometryRevision: number;
  readonly contentRevision: number;
  readonly topEdge: TerrainRle;
  readonly leftEdge: TerrainRle;
  readonly zoning: TerrainRle;
}

export interface WorldRenderSnapshot {
  readonly version: typeof WORLD_RENDER_SNAPSHOT_SCHEMA_VERSION;
  readonly chunkSize: number;
  readonly chunks: readonly RenderChunk[];
}

/**
 * Produces a serializable render projection. It intentionally copies no live
 * SparseWorld references across the worker boundary.
 */
export function projectWorldForRendering(world: SparseWorld): WorldRenderSnapshot {
  const snapshot = world.snapshot();

  return {
    version: WORLD_RENDER_SNAPSHOT_SCHEMA_VERSION,
    chunkSize: snapshot.chunkSize,
    chunks: snapshot.chunks
      .filter((chunk) => chunk.lifecycle === 'loaded')
      .map((chunk) => ({
        x: chunk.x,
        y: chunk.y,
        geometryRevision: chunk.geometryRevision,
        contentRevision: chunk.contentRevision,
        topEdge: chunk.topEdge ?? [],
        leftEdge: chunk.leftEdge ?? [],
        zoning: chunk.zoning ?? [],
      })),
  };
}

export function decodeRenderLayer(
  rle: TerrainRle,
  expectedLength: number,
): Uint8Array {
  const data = new Uint8Array(expectedLength);
  let offset = 0;

  for (const [value, count] of rle) {
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 255 ||
      !Number.isSafeInteger(count) ||
      count <= 0 ||
      offset + count > expectedLength
    ) {
      throw new RangeError('Invalid render-layer RLE.');
    }

    data.fill(value, offset, offset + count);
    offset += count;
  }

  if (offset !== expectedLength) {
    throw new RangeError('Render-layer RLE length mismatch.');
  }

  return data;
}
