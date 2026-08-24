import type { RenderStructure } from './structures';
import { createTileSample, type WorldRenderView } from './world-view';

/**
 * Everything with height, grouped by the world row it stands on.
 *
 * Depth sorting in a top-down view is per row (see `depth.ts`), so the painter
 * needs "what is on row 12?" rather than "where is wall 47?". Building that
 * index once per snapshot -- instead of per frame, or per pan -- is what makes
 * panning cheap: a pan paints only the rows that newly came into view, and
 * only rows that have something on them exist in the index at all.
 *
 * ### What the build itself costs
 *
 * Exactly `loadedChunkCount * chunkSize * chunkSize` tile reads: every
 * materialised tile once, and nothing else. The figure depends on how much
 * world exists, never on how that world is laid out.
 *
 * That distinction is the whole reason this walk iterates
 * `world.loadedChunkPositions` rather than `world.loadedBounds`. Until issue
 * #204 it scanned the bounding box of the loaded chunks, which is the same
 * thing only while those chunks tile their own box: two 32x32 chunks 40 apart
 * span a box of 1,721,344 tile positions and contain 2,048 tiles, so the box
 * walk issued 1,721,344 reads to index 2,048 tiles -- 840 times the necessary
 * work, all but 2,048 of it on empty positions that read as unloaded and
 * contribute nothing -- and it grew as the square of the world's extent
 * rather than of its contents.
 * `AGENTS.md` boundary 8 says world storage is chunked and must not be
 * treated as one dense matrix; a walk over a bounding box is that matrix,
 * built once per snapshot on the thread that draws.
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

  // Row-major over the materialised chunks, one band of equal `chunkY` at a
  // time. Walking a whole band's row before moving to the next row -- rather
  // than a whole chunk before the next chunk -- is what keeps `edges`
  // ascending in `tileX` within a row, which is the order `paintRow` relies
  // on, and it keeps rows created in ascending `tileY` exactly as the old
  // bounding-box walk did. `loadedChunkPositions` is sorted by
  // `(chunkY, chunkX)`, so the bands are contiguous and already in order.
  const positions = world.loadedChunkPositions;
  const size = world.chunkSize;
  const sample = createTileSample();

  let bandStart = 0;
  while (bandStart < positions.length) {
    const chunkY = positions[bandStart]!.chunkY;
    let bandEnd = bandStart + 1;
    while (bandEnd < positions.length && positions[bandEnd]!.chunkY === chunkY) bandEnd += 1;

    const originTileY = chunkY * size;
    for (let localY = 0; localY < size; localY += 1) {
      const tileY = originTileY + localY;
      for (let inBand = bandStart; inBand < bandEnd; inBand += 1) {
        const originTileX = positions[inBand]!.chunkX * size;
        for (let localX = 0; localX < size; localX += 1) {
          const tileX = originTileX + localX;
          world.readTile(tileX, tileY, sample);
          if (sample.topEdge === 0 && sample.leftEdge === 0) continue;
          rowFor(tileY).edges.push({ tileX, top: sample.topEdge, left: sample.leftEdge });
        }
      }
    }

    bandStart = bandEnd;
  }

  for (const structure of structures) rowFor(structure.tileY).structures.push(structure);

  return rows;
}
