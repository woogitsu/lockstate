import { createTileSample, type WorldRenderView } from './world-view';

/**
 * Where a room's *name* goes on the map, and how much room the name has.
 *
 * ## What this is for, and what it deliberately is not
 *
 * The owner's ruling of 2026-09-06 on room legibility was
 * *"Nazwa tekstem na mapie"* -- the name, as text on the map -- and this module
 * is the arithmetic half of it. It answers one question: given the world the
 * renderer is currently drawing, at which points should a room type's name be
 * written, and how wide is the space each name has to fit into?
 *
 * It says nothing about fonts, sizes, colours or zoom. Those are the drawing
 * half (`src/rendering/phaser/room-label-layer.ts`), and they need a browser to
 * measure; everything here is integer arithmetic over a decoded world and is
 * unit-testable in Node, which is the same split `tile-art-runs.ts` states for
 * itself.
 *
 * ## Why a *region* rather than a room instance, which is the load-bearing choice
 *
 * The renderer has no room-instance identity. `TileSample`'s whole vocabulary is
 * six fields and `zoning` is the room **catalogue** numeric id, so two adjacent
 * cells are indistinguishable to the painter; a room's rectangle lives on the
 * simulation side (`RoomInstance.anchorTile`, `width`, `height` in
 * `src/simulation/prisoners/room-instance-registry.ts`). ADR 0098 decision 1
 * states the requirement this serves in exactly those terms: the map is
 * required to distinguish room **types**, not room instances.
 *
 * So what this module finds is a **4-connected region of tiles carrying one
 * zoning id**, and one name per region. Two Cells sharing a wall are one region
 * and get one label reading `Cell`. That label is *true of every tile under
 * it*, which is the property that matters -- `AGENTS.md` reservation 4 permits
 * us to choose the words and still requires the sentence to be true -- and it
 * is a weaker claim than "this is one room", which the renderer is in no
 * position to make.
 *
 * ## Why not per tile, and why not per merged floor run
 *
 * ADR 0098 option C priced exactly two shapes for a mark inside a room and this
 * is a third that it did not consider. A mark per tile is *"ugly in a large
 * room"* and a mark per `mergeFloorRects` rectangle is nearly free to place but
 * *"rooms crossing a chunk boundary get more than one glyph, which is a visible
 * artefact and not a subtle one"* (both verbatim from that option). A region
 * walk crosses chunk boundaries by construction -- the flood fill follows the
 * zoning id, not the chunk grid -- so it produces one name for a room however
 * the world happens to be chunked, and the artefact does not arise.
 *
 * ## Cost
 *
 * Every materialised tile is read a bounded number of times: once by the outer
 * scan, and once per 4-neighbour probe by the fill, so at most five reads per
 * tile and no read outside `world.loadedChunkPositions`. That is the same
 * quantity `buildRowIndex` is bounded by and for the same reason (issue #204):
 * it tracks how much world exists, never how far apart its pieces sit. The
 * caller runs it once per render *revision*, not once per frame.
 *
 * Pure, total and Phaser-free.
 */

/** One name to write, and the space it has. */
export interface RoomLabelPlacement {
  /** The zoning numeric id every tile in the region carries. Never 0. */
  readonly zoningNumericId: number;
  /**
   * Where the name is centred, in fractional tile coordinates.
   *
   * The centre of the widest rectangle the region contains (see
   * `planRoomLabels`), so a name drawn centred on this point and no wider than
   * `spanTiles` lies entirely over tiles that carry `zoningNumericId`.
   */
  readonly centreTileX: number;
  readonly centreTileY: number;
  /** Width of that rectangle, in tiles: what the name has to fit into. */
  readonly spanTiles: number;
  /** Height of that rectangle, in tiles. */
  readonly spanRows: number;
  /** Tiles in the whole region, which may be larger than `spanTiles * spanRows`. */
  readonly tileCount: number;
}

/** A maximal horizontal run of region tiles on one row. */
interface RowRun {
  readonly tileY: number;
  readonly startTileX: number;
  readonly lengthTiles: number;
}

/**
 * One name per contiguous zoned region of the world the renderer is drawing.
 *
 * ### How a region's anchor is chosen
 *
 * A region is not necessarily a rectangle -- two same-type rooms sharing a wall
 * are one L-shaped, T-shaped or worse region -- so a centroid is not usable: an
 * L's centroid can sit on tiles the region does not contain, and a name written
 * there would be a name over some other room's floor.
 *
 * What is used instead is the region's **widest inscribed rectangle along its
 * widest row**, in three steps:
 *
 * 1. Take every maximal horizontal run of region tiles. The longest one is the
 *    widest continuous span the region has anywhere, which is the most space a
 *    single line of text can be given.
 * 2. Among the longest runs, take the one whose row is closest to the region's
 *    vertical middle -- so a plain 3x5 room is labelled across its middle and
 *    not along its northern edge. Ties break to the smaller row, then to the
 *    smaller start, so the answer is a fact about the world and not about the
 *    iteration order.
 * 3. Grow that run vertically while whole rows still cover its full span. For a
 *    rectangular room that recovers the entire room, so the anchor is its exact
 *    centre; for an L it recovers the arm the run lies in.
 *
 * The result is an axis-aligned rectangle of region tiles, centred on, and
 * therefore a truthful backing for, the name written over it.
 *
 * ### Order
 *
 * North to south, then west to east, by anchor. The walk order that discovered
 * the regions does not reach the output.
 */
export function planRoomLabels(world: WorldRenderView): readonly RoomLabelPlacement[] {
  const size = world.chunkSize;
  const sample = createTileSample();
  /** Chunk-keyed visit marks, allocated only for chunks the fill actually enters. */
  const visited = new Map<string, Uint8Array>();

  const zoningAt = (tileX: number, tileY: number): number => {
    world.readTile(tileX, tileY, sample);
    return sample.loaded ? sample.zoning : 0;
  };

  const chunkKeyOf = (tileX: number, tileY: number): string =>
    `${Math.floor(tileX / size)},${Math.floor(tileY / size)}`;

  const visitIndex = (tileX: number, tileY: number): number => {
    const localX = tileX - Math.floor(tileX / size) * size;
    const localY = tileY - Math.floor(tileY / size) * size;
    return localY * size + localX;
  };

  const isVisited = (tileX: number, tileY: number): boolean =>
    (visited.get(chunkKeyOf(tileX, tileY))?.[visitIndex(tileX, tileY)] ?? 0) === 1;

  const markVisited = (tileX: number, tileY: number): void => {
    const key = chunkKeyOf(tileX, tileY);
    let marks = visited.get(key);
    if (marks === undefined) {
      marks = new Uint8Array(size * size);
      visited.set(key, marks);
    }
    marks[visitIndex(tileX, tileY)] = 1;
  };

  const placements: RoomLabelPlacement[] = [];

  for (const chunk of world.loadedChunkPositions) {
    const originTileX = chunk.chunkX * size;
    const originTileY = chunk.chunkY * size;
    for (let localY = 0; localY < size; localY += 1) {
      for (let localX = 0; localX < size; localX += 1) {
        const tileX = originTileX + localX;
        const tileY = originTileY + localY;
        const zoning = zoningAt(tileX, tileY);
        if (zoning === 0) continue;
        if (isVisited(tileX, tileY)) continue;
        const placement = fillRegion(tileX, tileY, zoning);
        if (placement !== undefined) placements.push(placement);
      }
    }
  }

  placements.sort((a, b) => a.centreTileY - b.centreTileY || a.centreTileX - b.centreTileX);
  return placements;

  /**
   * Flood fill over 4-neighbours carrying the same zoning id, collecting the
   * region's tiles by row.
   *
   * 4-connected rather than 8: two rooms of one type touching only at a corner
   * are two places a player reads separately, and one name written between them
   * would sit on the tile of neither.
   */
  function fillRegion(startTileX: number, startTileY: number, zoning: number): RoomLabelPlacement | undefined {
    const rows = new Map<number, number[]>();
    const queue: number[] = [startTileX, startTileY];
    markVisited(startTileX, startTileY);
    let tileCount = 0;

    while (queue.length > 0) {
      // Two pops, because the queue is a flat pair list rather than a list of
      // objects: a fill over a large prison is the one walk here that touches
      // every zoned tile, and an object per tile is the per-tile garbage
      // `TileSample`'s docblock refuses for the same reason.
      const tileY = queue.pop() as number;
      const tileX = queue.pop() as number;
      tileCount += 1;
      const xs = rows.get(tileY);
      if (xs === undefined) rows.set(tileY, [tileX]);
      else xs.push(tileX);

      const neighbours = [tileX + 1, tileY, tileX - 1, tileY, tileX, tileY + 1, tileX, tileY - 1];
      for (let index = 0; index < neighbours.length; index += 2) {
        const nextX = neighbours[index] as number;
        const nextY = neighbours[index + 1] as number;
        if (isVisited(nextX, nextY)) continue;
        if (zoningAt(nextX, nextY) !== zoning) continue;
        markVisited(nextX, nextY);
        queue.push(nextX, nextY);
      }
    }

    const runs: RowRun[] = [];
    const rowKeys = [...rows.keys()].sort((a, b) => a - b);
    let minTileY = Number.POSITIVE_INFINITY;
    let maxTileY = Number.NEGATIVE_INFINITY;
    for (const tileY of rowKeys) {
      minTileY = Math.min(minTileY, tileY);
      maxTileY = Math.max(maxTileY, tileY);
      const xs = (rows.get(tileY) as number[]).slice().sort((a, b) => a - b);
      let runStart = xs[0] as number;
      let previous = runStart;
      for (let index = 1; index <= xs.length; index += 1) {
        const next = index < xs.length ? (xs[index] as number) : undefined;
        if (next === previous + 1) {
          previous = next;
          continue;
        }
        runs.push({ tileY, startTileX: runStart, lengthTiles: previous - runStart + 1 });
        if (next === undefined) break;
        runStart = next;
        previous = next;
      }
    }
    if (runs.length === 0) return undefined;

    // The region's vertical middle, in the same fractional tile units the
    // anchor is reported in, so "closest to the middle" compares like with
    // like rather than comparing a row index against a centre.
    const verticalMiddle = (minTileY + maxTileY + 1) / 2;
    let anchor = runs[0] as RowRun;
    let anchorDistance = Math.abs(anchor.tileY + 0.5 - verticalMiddle);
    for (const run of runs) {
      const distance = Math.abs(run.tileY + 0.5 - verticalMiddle);
      const better =
        run.lengthTiles > anchor.lengthTiles ||
        (run.lengthTiles === anchor.lengthTiles &&
          (distance < anchorDistance ||
            (distance === anchorDistance &&
              (run.tileY < anchor.tileY || (run.tileY === anchor.tileY && run.startTileX < anchor.startTileX)))));
      if (!better) continue;
      anchor = run;
      anchorDistance = distance;
    }

    const covers = (tileY: number): boolean => {
      const xs = rows.get(tileY);
      if (xs === undefined) return false;
      // A row covers the span when it holds every column of it. The row's own
      // tiles are a set, so a membership count is enough and no sort is needed.
      let held = 0;
      for (const x of xs) {
        if (x >= anchor.startTileX && x < anchor.startTileX + anchor.lengthTiles) held += 1;
      }
      return held === anchor.lengthTiles;
    };

    let top = anchor.tileY;
    let bottom = anchor.tileY;
    while (covers(top - 1)) top -= 1;
    while (covers(bottom + 1)) bottom += 1;

    return {
      zoningNumericId: zoning,
      centreTileX: anchor.startTileX + anchor.lengthTiles / 2,
      centreTileY: (top + bottom + 1) / 2,
      spanTiles: anchor.lengthTiles,
      spanRows: bottom - top + 1,
      tileCount,
    };
  }
}
