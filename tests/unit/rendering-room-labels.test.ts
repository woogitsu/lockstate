import { describe, expect, it } from 'vitest';
import { ROOM_LABEL_MARGIN_PX, roomLabelFits } from '../../src/rendering/world/appearance';
import { planRoomLabels, type RoomLabelPlacement } from '../../src/rendering/world/room-labels';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * Where a room's name goes, and whether it is allowed to be written at all.
 *
 * Every world below is a real `SparseWorld`, zoned through the simulation's own
 * `setZoning` and snapshotted the way the worker snapshots it, then projected by
 * the production `WorldRenderView.fromSnapshot`. A fixture that assembled the
 * zoning layer itself could agree with a planner that read it wrongly, which is
 * the reason `rendering-world-view.test.ts` gives for the same arrangement.
 *
 * The claims split cleanly by tier and both tiers are here:
 *
 * - **`planRoomLabels`** is arithmetic over a decoded world: where the name
 *   goes, one name per contiguous zoned region, and that a chunk boundary is
 *   not visible in the answer. Node can settle all of it.
 * - **`roomLabelFits`** is the zoom rule, in the only form Node can hold it:
 *   given a measured text width, does the name fit the room at this zoom. What
 *   Node cannot supply is the width itself, which needs a browser laying out a
 *   real font -- `tests/browser/room-label.spec.ts` measures that and this file
 *   deliberately does not pretend to.
 */

const CHUNK_SIZE = 8;

function zone(
  regions: readonly { readonly zoning: number; readonly tiles: readonly (readonly [number, number])[] }[],
  chunks: readonly (readonly [number, number])[] = [[0, 0]],
): WorldRenderView {
  const world = new SparseWorld(CHUNK_SIZE);
  for (const [chunkX, chunkY] of chunks) {
    world.load({ x: chunkCoordinate(chunkX), y: chunkCoordinate(chunkY) });
  }
  for (const region of regions) {
    for (const [tileX, tileY] of region.tiles) {
      world.setZoning({ x: tileCoordinate(tileX), y: tileCoordinate(tileY) }, region.zoning);
    }
  }
  return WorldRenderView.fromSnapshot(world.snapshot());
}

/** Every tile of an inclusive rectangle. */
function rect(minX: number, minY: number, maxX: number, maxY: number): readonly (readonly [number, number])[] {
  const tiles: (readonly [number, number])[] = [];
  for (let tileY = minY; tileY <= maxY; tileY += 1) {
    for (let tileX = minX; tileX <= maxX; tileX += 1) tiles.push([tileX, tileY]);
  }
  return tiles;
}

describe('planning where a room name goes', () => {
  it('names nothing in a world with no zoning', () => {
    expect(planRoomLabels(zone([]))).toEqual([]);
    expect(planRoomLabels(WorldRenderView.empty())).toEqual([]);
  });

  it('centres one name on a rectangular room and reports the span it has to fit', () => {
    // A 4-wide, 3-tall room at tiles x 1..4, y 2..4.
    const placements = planRoomLabels(zone([{ zoning: 5, tiles: rect(1, 2, 4, 4) }]));

    expect(placements).toHaveLength(1);
    const placement = placements[0] as RoomLabelPlacement;
    expect(placement.zoningNumericId).toBe(5);
    // The room spans x 1..5 and y 2..5 in tile-edge coordinates, so its centre
    // is (3, 3.5) -- an exact centre, not a row's midpoint.
    expect(placement.centreTileX).toBe(3);
    expect(placement.centreTileY).toBe(3.5);
    expect(placement.spanTiles).toBe(4);
    expect(placement.spanRows).toBe(3);
    expect(placement.tileCount).toBe(12);
  });

  it('centres a name on an even-height room exactly, not half a tile off', () => {
    // Four rows, so no single row is the middle one. The vertical growth step
    // is what makes this exact: the anchor row is 3 or 4 and the rectangle it
    // grows into is the whole room.
    const placements = planRoomLabels(zone([{ zoning: 1, tiles: rect(2, 2, 5, 5) }]));

    expect(placements).toHaveLength(1);
    expect((placements[0] as RoomLabelPlacement).centreTileY).toBe(4);
    expect((placements[0] as RoomLabelPlacement).spanRows).toBe(4);
  });

  it('gives two rooms of different types their own names', () => {
    const placements = planRoomLabels(
      zone([
        { zoning: 4, tiles: rect(0, 0, 2, 2) },
        { zoning: 5, tiles: rect(4, 4, 6, 6) },
      ]),
    );

    expect(placements.map((placement) => placement.zoningNumericId)).toEqual([4, 5]);
    // North to south, then west to east: a fact about the world rather than
    // about the order the fill discovered them in.
    expect(placements.map((placement) => placement.centreTileY)).toEqual([1.5, 5.5]);
  });

  it('gives two adjacent rooms of the SAME type one name, and it is true of every tile under it', () => {
    /*
     * This is the honest limit of a label keyed by the zoning layer, and it is
     * recorded as an assertion rather than as a comment. The renderer is handed
     * a room *catalogue* id per tile and no instance identity at all, so two
     * Cells sharing a wall are one 4-connected region and get one name. ADR
     * 0098 decision 1 sets the requirement at room *types*, not instances, and
     * a single `Cell` written across both is true of every tile it covers --
     * which is what `AGENTS.md` reservation 4 requires of it.
     */
    const placements = planRoomLabels(zone([{ zoning: 1, tiles: [...rect(1, 1, 2, 3), ...rect(3, 1, 4, 3)] }]));

    expect(placements).toHaveLength(1);
    const placement = placements[0] as RoomLabelPlacement;
    expect(placement.spanTiles).toBe(4);
    expect(placement.tileCount).toBe(12);
  });

  it('separates two same-type rooms that touch only at a corner', () => {
    // 4-connected, not 8: a name written between them would sit on the floor
    // of neither.
    const placements = planRoomLabels(zone([{ zoning: 2, tiles: [...rect(0, 0, 1, 1), ...rect(2, 2, 3, 3)] }]));

    expect(placements).toHaveLength(2);
    expect(placements.map((placement) => placement.tileCount)).toEqual([4, 4]);
  });

  it('writes ONE name on a room that crosses a chunk boundary', () => {
    /*
     * ADR 0098 option C priced a mark per merged floor run and named the cost:
     * *"rooms crossing a chunk boundary get more than one glyph, which is a
     * visible artefact and not a subtle one"*. This is the test that the region
     * walk does not pay it. The room runs x 6..9 with a chunk size of 8, so it
     * straddles chunks (0,0) and (1,0), and `mergeFloorRects` -- which is
     * per-chunk by construction -- would answer two rectangles for it.
     */
    const placements = planRoomLabels(zone([{ zoning: 7, tiles: rect(6, 1, 9, 3) }], [
      [0, 0],
      [1, 0],
    ]));

    expect(placements).toHaveLength(1);
    const placement = placements[0] as RoomLabelPlacement;
    expect(placement.spanTiles).toBe(4);
    expect(placement.centreTileX).toBe(8);
    expect(placement.tileCount).toBe(12);
  });

  it('anchors an L-shaped region inside itself, over its own widest arm', () => {
    /*
     * The case a centroid gets wrong. This L is a 6x2 arm at y 1..2 plus a 2x4
     * stem hanging off its west end at y 3..6, so the region's centre of mass
     * sits around (2.6, 3.1) -- inside, here, but the anchor still has to be a
     * rectangle the text fits in, and the arm is the only 6-wide run.
     */
    const placements = planRoomLabels(zone([{ zoning: 3, tiles: [...rect(1, 1, 6, 2), ...rect(1, 3, 2, 6)] }]));

    expect(placements).toHaveLength(1);
    const placement = placements[0] as RoomLabelPlacement;
    expect(placement.spanTiles).toBe(6);
    expect(placement.spanRows).toBe(2);
    // Centred on the arm: x 1..7 and y 1..3 in tile-edge coordinates.
    expect(placement.centreTileX).toBe(4);
    expect(placement.centreTileY).toBe(2);
  });

  it('keeps the name over the region when the bounding box centre is not in it', () => {
    /*
     * A U: two 2-tall towers joined along their southern row, so the bounding
     * box centre tile (3, 2) carries no zoning at all. A planner that used the
     * box would write the name on the courtyard between the two arms.
     */
    const placements = planRoomLabels(
      zone([{ zoning: 6, tiles: [...rect(1, 1, 2, 3), ...rect(4, 1, 5, 3), ...rect(1, 4, 5, 4)] }]),
    );

    expect(placements).toHaveLength(1);
    const placement = placements[0] as RoomLabelPlacement;
    // The joining row is the only 5-wide run, so that is where the name goes.
    expect(placement.spanTiles).toBe(5);
    expect(placement.centreTileY).toBe(4.5);
    expect(placement.centreTileX).toBe(3.5);
  });

  it('does not walk into a chunk the simulation has not materialised', () => {
    // Zoning is written into chunk (0,0) only; the eastern neighbour is never
    // loaded, so the fill must stop at the boundary rather than reading zeros
    // out of an absent layer and calling them a room.
    const placements = planRoomLabels(zone([{ zoning: 1, tiles: rect(6, 0, 7, 1) }]));

    expect(placements).toHaveLength(1);
    expect((placements[0] as RoomLabelPlacement).tileCount).toBe(4);
    expect((placements[0] as RoomLabelPlacement).centreTileX).toBe(7);
  });
});

describe('whether a room name may be written at this zoom', () => {
  /*
   * `ZOOM_BOUNDS` in `src/rendering/scene/world-scene.ts` is 0.2 to 3.0 and
   * `TILE_SIZE_PX` is 64, so one tile is 12.8 screen pixels at the far end and
   * 192 at the near end. These are the numbers the rule is made of.
   */
  const fits = (textWidthPx: number, spanTiles: number, zoom: number): boolean =>
    roomLabelFits(textWidthPx, spanTiles, TILE_SIZE_PX, zoom);

  it('admits a name that fits the room with its margins, and refuses one a pixel too wide', () => {
    // A 4-tile room at zoom 1 is 256 px wide; the margins take 8 of them.
    expect(fits(256 - 2 * ROOM_LABEL_MARGIN_PX, 4, 1)).toBe(true);
    expect(fits(256 - 2 * ROOM_LABEL_MARGIN_PX + 1, 4, 1)).toBe(false);
  });

  it('refuses at 0.2 what it admits at 1.0 for the same room and the same name', () => {
    // 60 px is about what a nine-character room name measures at 13 px in
    // Chromium (the browser spec has the real figures). A 4x4 room holds it
    // comfortably at zoom 1 and cannot hold it at all zoomed right out.
    expect(fits(60, 4, 1)).toBe(true);
    expect(fits(60, 4, 0.2)).toBe(false);
    // The same name needs a much bigger room to survive 0.2: 4 tiles is 51.2
    // px there, and 6 is 76.8.
    expect(fits(60, 6, 0.2)).toBe(true);
  });

  it('keeps admitting at 3.0 everything it admitted at 1.0', () => {
    for (const spanTiles of [1, 2, 4, 8, 16]) {
      for (const width of [20, 60, 120]) {
        if (!fits(width, spanTiles, 1)) continue;
        expect(fits(width, spanTiles, 3)).toBe(true);
      }
    }
  });

  it('refuses rather than throwing on a degenerate measurement', () => {
    expect(fits(0, 4, 1)).toBe(false);
    expect(fits(60, 0, 1)).toBe(false);
    expect(fits(60, 4, 0)).toBe(false);
    expect(fits(Number.NaN, 4, 1)).toBe(false);
    expect(fits(60, 4, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
