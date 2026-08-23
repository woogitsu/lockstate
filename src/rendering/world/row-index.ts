import type { RenderStructure } from './structures';
import { createTileSample, type WorldRenderView } from './world-view';

/**
 * Everything with height, grouped by the world row it stands on.
 *
 * Depth sorting in a top-down view is per row (see `depth.ts`), so the painter
 * needs "what is on row 12?" rather than "where is wall 47?". Building that
 * index once per snapshot -- instead of per frame, or per pan -- is what keeps
 * the cost of scrolling around a large prison bounded: panning only paints the
 * rows that newly came into view, and only rows that have something on them
 * exist at all.
 *
 * Pure and Phaser-free: it reads an immutable world view and an immutable
 * structure list, and returns plain data.
 */

/** A wall segment stored on a tile's own edges by the world's `topEdge`/`leftEdge` layers. */
export interface RowEdge {
  readonly tileX: number;
  /** Non-zero when a wall runs along the tile's north edge. */
  readonly top: number;
  /** Non-zero when a wall runs along the tile's west edge. */
  readonly left: number;
}

export interface RowContent {
  readonly tileY: number;
  readonly structures: readonly RenderStructure[];
  readonly edges: readonly RowEdge[];
}

/**
 * Rows are keyed by tile Y. `structures` keeps the order it arrived in, which
 * `structuresFromConstruction` already made deterministic.
 */
export function buildRowIndex(
  world: WorldRenderView,
  structures: readonly RenderStructure[],
): ReadonlyMap<number, RowContent> {
  const rows = new Map<number, { tileY: number; structures: RenderStructure[]; edges: RowEdge[] }>();

  const rowFor = (tileY: number): { tileY: number; structures: RenderStructure[]; edges: RowEdge[] } => {
    let row = rows.get(tileY);
    if (row === undefined) {
      row = { tileY, structures: [], edges: [] };
      rows.set(tileY, row);
    }
    return row;
  };

  const bounds = world.loadedBounds;
  if (bounds !== undefined) {
    const sample = createTileSample();
    for (let tileY = bounds.minTileY; tileY <= bounds.maxTileY; tileY += 1) {
      for (let tileX = bounds.minTileX; tileX <= bounds.maxTileX; tileX += 1) {
        world.readTile(tileX, tileY, sample);
        if (sample.topEdge === 0 && sample.leftEdge === 0) continue;
        rowFor(tileY).edges.push({ tileX, top: sample.topEdge, left: sample.leftEdge });
      }
    }
  }

  for (const structure of structures) rowFor(structure.tileY).structures.push(structure);

  return rows;
}
