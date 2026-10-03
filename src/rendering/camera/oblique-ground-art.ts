import { ENVIRONMENT_SPRITES } from '../assets/environment-sprites';
import type { ObliqueGroundTile } from './oblique-world-projection';

export interface ObliqueFloorBatch {
  readonly assetId: string;
  readonly vertices: number[];
  readonly indices: number[];
}

/** Authored overhead floor tiles are planar: project their full UV square
 * onto the exact logical footprint, including intermediate camera angles.
 * No nearest-angle pose approximation, simulation write, or hidden tile scan.
 */
export function obliqueFloorBatches(ground: readonly ObliqueGroundTile[]): ObliqueFloorBatch[] {
  const batches = new Map<string, ObliqueFloorBatch>();
  for (const tile of ground) {
    if (tile.floorSprite === undefined) continue;
    const definition = ENVIRONMENT_SPRITES[tile.floorSprite];
    if (definition.kind !== 'rendered-art') continue;
    let batch = batches.get(definition.renderedArtId);
    if (batch === undefined) {
      batch = { assetId: definition.renderedArtId, vertices: [], indices: [] };
      batches.set(batch.assetId, batch);
    }
    const start = batch.vertices.length / 4;
    // Rendered floors have row0 = world -Y, col0 = world -X.
    for (const [corner, uv] of [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [3, [0, 1]]] as const) {
      const point = tile.quad[corner];
      batch.vertices.push(point.x, point.y, uv[0], uv[1]);
    }
    // Mesh2D's fourth index in each triangle is the texture page.
    batch.indices.push(start, start + 1, start + 2, 0, start, start + 2, start + 3, 0);
  }
  return [...batches.values()];
}
