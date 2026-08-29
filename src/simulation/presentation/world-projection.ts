import type { RunLengthDecodeContract } from '../codec/run-length';
import { expandRunLengthsInto } from '../codec/run-length';
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

/** Inclusive upper bound on a render layer's value: the only shape this decodes is a `Uint8Array`. */
const RENDER_LAYER_MAX_VALUE = 255;

/**
 * Renders a shared-codec failure as one of the two `RangeError`s this decoder
 * has always thrown -- collapsed the same way the original hand-rolled loop
 * did, so a caller pattern-matching on either message keeps working unchanged.
 */
function renderLayerRleContract(expectedLength: number): RunLengthDecodeContract {
  return {
    maxValue: RENDER_LAYER_MAX_VALUE,
    fail: (failure): never => {
      switch (failure.kind) {
        case 'malformed-run':
        case 'value-out-of-range':
        case 'invalid-length':
        case 'exceeds-capacity':
          throw new RangeError('Invalid render-layer RLE.');
        case 'length-mismatch':
          throw new RangeError('Render-layer RLE length mismatch.');
      }
    },
  };
}

export function decodeRenderLayer(
  rle: TerrainRle,
  expectedLength: number,
): Uint8Array {
  const data = new Uint8Array(expectedLength);
  expandRunLengthsInto(rle, data, renderLayerRleContract(expectedLength));
  return data;
}
