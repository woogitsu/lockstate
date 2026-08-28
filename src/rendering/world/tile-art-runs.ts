import type { RowEdge } from './row-index';

/**
 * Turning per-tile art decisions into the fewest drawable pieces.
 *
 * `tile-layer.ts` cannot afford one game object per tile: a 32x32 chunk is
 * 1,024 tiles and a handful of chunks are on screen at once. It already avoids
 * that for flat colour by merging each chunk row into runs of equal fill; these
 * are the same idea for art, and they are here rather than in the painter
 * because they are arithmetic over plain data and the painter is the one part
 * of the renderer the Node test environment cannot reach at all.
 *
 * Both functions are pure and total. Neither knows what a texture is.
 */

/** A rectangle of tiles, inside one chunk, that can be drawn as a single tiling sprite. */
export interface FloorRect<Id extends string = string> {
  readonly spriteId: Id;
  /** Chunk-local tile coordinates of the north-west corner. */
  readonly localX: number;
  readonly localY: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
}

/**
 * Greedy rectangle merge over one chunk's floor art.
 *
 * Maximal horizontal runs first, then a run is absorbed into the rectangle
 * directly above it when that rectangle has the same sprite and exactly the
 * same horizontal span. That is the classic greedy quad merge, and it is chosen
 * over a full optimal decomposition for a reason worth stating: a prison room
 * is a rectangle, so the greedy pass already collapses a whole room into one
 * sprite, and an optimal packer would spend more time than it saves on the
 * shapes this actually sees.
 *
 * Rectangles come back in north-to-south, west-to-east order regardless of the
 * order the merge discovered them, so a caller's draw order -- and any test's
 * expectation -- is a fact about the world rather than about the algorithm.
 */
export function mergeFloorRects<Id extends string>(
  sizeTiles: number,
  spriteAt: (localX: number, localY: number) => Id | undefined,
): readonly FloorRect<Id>[] {
  if (!Number.isSafeInteger(sizeTiles) || sizeTiles < 0) {
    throw new RangeError(`Chunk size must be a non-negative safe integer, received ${sizeTiles}.`);
  }

  const finished: FloorRect<Id>[] = [];
  // Rectangles whose bottom edge is the row just processed, keyed by their span
  // and sprite, so the next row's run can find its predecessor in one lookup.
  let open = new Map<string, { spriteId: Id; localX: number; localY: number; widthTiles: number; heightTiles: number }>();

  for (let localY = 0; localY < sizeTiles; localY += 1) {
    const next = new Map<string, { spriteId: Id; localX: number; localY: number; widthTiles: number; heightTiles: number }>();

    let runStart = 0;
    let runSprite: Id | undefined;
    for (let localX = 0; localX <= sizeTiles; localX += 1) {
      const sprite = localX < sizeTiles ? spriteAt(localX, localY) : undefined;
      if (sprite === runSprite) continue;

      if (runSprite !== undefined) {
        const width = localX - runStart;
        const key = `${runStart}:${width}:${runSprite}`;
        const above = open.get(key);
        if (above !== undefined) {
          above.heightTiles += 1;
          next.set(key, above);
          open.delete(key);
        } else {
          next.set(key, { spriteId: runSprite, localX: runStart, localY, widthTiles: width, heightTiles: 1 });
        }
      }

      runStart = localX;
      runSprite = sprite;
    }

    // Anything not continued by this row is finished.
    for (const rect of open.values()) finished.push(rect);
    open = next;
  }
  for (const rect of open.values()) finished.push(rect);

  finished.sort((a, b) => a.localY - b.localY || a.localX - b.localX);
  return finished;
}

/** A horizontal run of identical north-edge segments, drawable as one tiling sprite. */
export interface EdgeRun {
  /** The value the world's edge layer carries -- a wall, a door, or a later material id. */
  readonly value: number;
  readonly startTileX: number;
  readonly lengthTiles: number;
}

/**
 * Merges a row's north edges into runs of equal value.
 *
 * **Only the north edges.** A west edge is drawn as a bar running north-south,
 * so two west edges on neighbouring tiles of the same row are two bars a whole
 * tile apart, not one longer bar -- merging them would draw a wall across the
 * room. `buildRowIndex` already guarantees `edges` ascends in `tileX`
 * (`world-view.ts` documents why that ordering is load-bearing), which is what
 * lets this walk the list once.
 */
export function mergeTopEdgeRuns(edges: readonly RowEdge[]): readonly EdgeRun[] {
  const runs: EdgeRun[] = [];
  let value = 0;
  let startTileX = 0;
  let length = 0;

  const flush = (): void => {
    if (length > 0) runs.push({ value, startTileX, lengthTiles: length });
    length = 0;
  };

  for (const edge of edges) {
    if (edge.top === 0) {
      flush();
      continue;
    }
    if (length > 0 && edge.top === value && edge.tileX === startTileX + length) {
      length += 1;
      continue;
    }
    flush();
    value = edge.top;
    startTileX = edge.tileX;
    length = 1;
  }
  flush();

  return runs;
}
