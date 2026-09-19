import { describe, expect, it } from 'vitest';

import {
  MAX_ZONE_SIDE_TILES,
  pickTileAtWorld,
  tileRectFromDrag,
  tileRectToRange,
  tileRectsEqual,
} from '../../src/rendering/build/area-picking';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { MAX_ZONE_DIMENSION_TILES } from '../../src/simulation/rooms/zoning';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import type { HudRoomArea, HudRoomGesture } from '../../src/ui/hud';
import { RoomTool } from '../../src/ui/room-tool';

/**
 * The area gesture, from a drag on the world to something the HUD can dispatch.
 *
 * Two layers meet here and neither may know the other: `src/rendering/**` may
 * not submit a command, and the HUD may not import the simulation. So the
 * geometry is a pure function in the renderer, the routing is a class at the
 * composition root, and both are provable with no browser and no DOM --
 * `docs/TESTING.md`'s "use the lowest layer that proves the behavior". The
 * *rendered* half is `tests/browser/ui-shell.spec.ts`'s.
 */

const at = (tileX: number, tileY: number) => ({
  x: (tileX + 0.5) * TILE_SIZE_PX,
  y: (tileY + 0.5) * TILE_SIZE_PX,
});

describe('a drag becomes the rectangle of tiles it covered', () => {
  it('makes a press and release inside one tile a 1x1 rectangle, not an empty one', () => {
    // Both corners are inclusive, which is what makes a tap a real room rather
    // than a zero-area one the simulation would refuse as `invalid-area`.
    expect(tileRectFromDrag(at(6, 9), at(6, 9))).toEqual({ tileX: 6, tileY: 9, width: 1, height: 1 });
    expect(pickTileAtWorld(at(6, 9))).toEqual({ tileX: 6, tileY: 9, width: 1, height: 1 });
  });

  it('gives the same rectangle whichever corner the drag started from', () => {
    // A room has no direction, so asking the player to start at a particular
    // corner would be a rule with nothing behind it. All four diagonals of the
    // same box have to agree.
    const expected = { tileX: 2, tileY: 3, width: 4, height: 3 };
    expect(tileRectFromDrag(at(2, 3), at(5, 5))).toEqual(expected);
    expect(tileRectFromDrag(at(5, 5), at(2, 3))).toEqual(expected);
    expect(tileRectFromDrag(at(5, 3), at(2, 5))).toEqual(expected);
    expect(tileRectFromDrag(at(2, 5), at(5, 3))).toEqual(expected);
  });

  it('keeps both axes, unlike a wall run, which commits to one', () => {
    // `edgeRunFromDrag` has to pick an axis because a wall is one-dimensional.
    // A rectangle is exactly the shape that must not: a check that committed to
    // an axis here would make every room 1 tile wide or 1 tile tall.
    const rect = tileRectFromDrag(at(0, 0), at(7, 3));
    expect(rect.width).toBe(8);
    expect(rect.height).toBe(4);
  });

  it('clamps each side independently and keeps the pressed corner', () => {
    // The tile the player put their finger on is the one they aimed at; the
    // release is wherever the flick ended up. Clamping symmetrically would move
    // the rectangle away from the tile they chose.
    const rect = tileRectFromDrag(at(10, 10), at(10 + MAX_ZONE_SIDE_TILES + 40, 12));
    expect(rect).toEqual({ tileX: 10, tileY: 10, width: MAX_ZONE_SIDE_TILES, height: 3 });

    // And the same dragging the other way: the pressed corner is still 10, so
    // the rectangle runs back from it.
    const backwards = tileRectFromDrag(at(10, 10), at(10 - MAX_ZONE_SIDE_TILES - 40, 12));
    expect(backwards).toEqual({
      tileX: 10 - (MAX_ZONE_SIDE_TILES - 1),
      tileY: 10,
      width: MAX_ZONE_SIDE_TILES,
      height: 3,
    });
  });

  it('clamps to the same number the simulation refuses above', () => {
    // The renderer may not import `src/simulation/**`
    // (`tests/unit/rendering-module-boundaries.test.ts`), so the two constants
    // are two declarations of one bound. A *test* may import both, so this is
    // where they are held together: a drag clamped to this can always be
    // expressed as a command, even when it is refused for some other reason.
    expect(MAX_ZONE_SIDE_TILES).toBe(MAX_ZONE_DIMENSION_TILES);
  });

  it('refuses a non-finite point rather than producing a rectangle nobody drew', () => {
    expect(() => pickTileAtWorld({ x: Number.NaN, y: 0 })).toThrow(RangeError);
    expect(() => tileRectFromDrag({ x: 0, y: 0 }, { x: 0, y: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });

  it('converts to inclusive bounds without an off-by-one', () => {
    expect(tileRectToRange({ tileX: 4, tileY: 6, width: 2, height: 3 })).toEqual({
      minTileX: 4,
      maxTileX: 5,
      minTileY: 6,
      maxTileY: 8,
    });
  });

  it('compares by value, so a stationary pointer does not repaint the preview', () => {
    expect(tileRectsEqual({ tileX: 1, tileY: 1, width: 2, height: 2 }, { tileX: 1, tileY: 1, width: 2, height: 2 })).toBe(true);
    expect(tileRectsEqual({ tileX: 1, tileY: 1, width: 2, height: 2 }, { tileX: 1, tileY: 1, width: 2, height: 3 })).toBe(false);
    expect(tileRectsEqual(undefined, undefined)).toBe(true);
    expect(tileRectsEqual({ tileX: 1, tileY: 1, width: 1, height: 1 }, undefined)).toBe(false);
  });
});

function recorder(): { readonly tool: RoomTool; readonly gestures: readonly HudRoomGesture[] } {
  const gestures: HudRoomGesture[] = [];
  const tool = new RoomTool();
  tool.attachGestures((gesture) => gestures.push(gesture));
  return { tool, gestures };
}

describe('RoomTool routes a gesture without knowing what a command is', () => {
  it('reports a designation with the selected room id, once', () => {
    const { tool, gestures } = recorder();
    tool.setArmed(true, { roomId: 'room.cell', removing: false });

    tool.place({ tileX: 4, tileY: 6, width: 2, height: 3 });

    // One report, not one per tile. A 64x64 designation is one command with one
    // outcome, because the simulation validates every tile before writing any.
    expect(gestures).toEqual([
      { kind: 'designate', roomId: 'room.cell', area: { x: 4, y: 6, width: 2, height: 3 } },
    ]);
  });

  it('reports a removal with no room id at all', () => {
    // Not a simplification of the designation report: a removal names no room
    // type, because what comes out is whatever the rectangle covers. It is what
    // makes removal usable as the recovery it exists to be -- a player fixing a
    // stray drag does not have to first work out what they zoned.
    const { tool, gestures } = recorder();
    tool.setArmed(true, { removing: true });

    tool.place({ tileX: 0, tileY: 0, width: 8, height: 8 });

    expect(gestures).toEqual([{ kind: 'remove', area: { x: 0, y: 0, width: 8, height: 8 } }]);
  });

  it('will not arm to designate without a room type, and will arm to remove without one', () => {
    // The asymmetry is the point of the mode. An armed tool with nothing
    // selected would take over the pointer and refuse every gesture, which
    // reads as a broken world; a removal has nothing to select.
    const designating = new RoomTool();
    designating.setArmed(true, { removing: false });
    expect(designating.isArmed(), 'nothing selected, so nothing to designate').toBe(false);

    const removing = new RoomTool();
    removing.setArmed(true, { removing: true });
    expect(removing.isArmed()).toBe(true);
    expect(removing.isRemoving()).toBe(true);
  });

  it('reports nothing at all while disarmed', () => {
    const { tool, gestures } = recorder();
    tool.setArmed(true, { roomId: 'room.cell', removing: false });
    tool.setArmed(false);

    tool.place({ tileX: 0, tileY: 0, width: 2, height: 3 });

    expect(gestures).toEqual([]);
  });

  it('says it is not removing while disarmed, so the scene cannot draw a removal preview', () => {
    const tool = new RoomTool();
    tool.setArmed(true, { removing: true });
    tool.setArmed(false);
    expect(tool.isRemoving()).toBe(false);
  });

  it('follows a change of room type without being re-armed', () => {
    // The panel repaints the selection while the tool stays armed, so the map
    // must not keep designating whatever was chosen when it was armed.
    const { tool, gestures } = recorder();
    tool.setArmed(true, { roomId: 'room.cell', removing: false });
    tool.setArmed(true, { roomId: 'room.canteen', removing: false });

    tool.place({ tileX: 0, tileY: 0, width: 6, height: 6 });

    expect(gestures[0]).toMatchObject({ kind: 'designate', roomId: 'room.canteen' });
  });

  it('drops a rectangle with no area rather than reporting one the simulation would refuse', () => {
    const { tool, gestures } = recorder();
    tool.setArmed(true, { roomId: 'room.cell', removing: false });

    tool.place({ tileX: 0, tileY: 0, width: 0, height: 3 });

    expect(gestures).toEqual([]);
  });

  it('reports the rectangle to the readout whole, rather than summarising it', () => {
    // `BuildTool.target` summarises a run into its first edge and a count,
    // because a list of sixty-four coordinates is not a readout. A rectangle
    // already *is* the summary, and the two side lengths are what the
    // minimum-size rule is checked against -- so a summary that dropped them
    // would take away the number the player needs.
    const areas: (HudRoomArea | undefined)[] = [];
    const tool = new RoomTool();
    tool.attachReadout((area) => areas.push(area));

    tool.target({ tileX: 3, tileY: 4, width: 6, height: 6 });
    tool.target(undefined);

    expect(areas).toEqual([{ x: 3, y: 4, width: 6, height: 6 }, undefined]);
  });

  it('withdraws its aim when it is disarmed, rather than leaving the last one on the panel', () => {
    // Issue #550, found on the Build panel and swept here: the readout is a
    // claim about where the pointer is aimed, and a disarmed tool has handed
    // the pointer back to the camera. Leaving the last rectangle on the "Area"
    // line would keep a control asserting something false -- and nothing else
    // clears it, because pressing "Draw on map" a second time neither hides the
    // panel (which does clear it) nor produces a rectangle of its own.
    const areas: (HudRoomArea | undefined)[] = [];
    const tool = new RoomTool();
    tool.attachReadout((area) => areas.push(area));
    tool.setArmed(true, { roomId: 'room.cell', removing: false });

    tool.target({ tileX: 3, tileY: 4, width: 6, height: 6 });
    expect(areas.at(-1)).toEqual({ x: 3, y: 4, width: 6, height: 6 });

    tool.setArmed(false, { roomId: 'room.cell', removing: false });

    expect(areas.at(-1), 'a disarmed tool is aimed at nothing').toBeUndefined();
  });

  it('drops a gesture when nothing is attached, which is a page with a world and no interface', () => {
    const tool = new RoomTool();
    tool.setArmed(true, { roomId: 'room.cell', removing: false });
    expect(() => tool.place({ tileX: 0, tileY: 0, width: 2, height: 3 })).not.toThrow();
    expect(() => tool.target(undefined)).not.toThrow();
  });
});

/**
 * `classifyArea`, issue #493.
 *
 * The one place this tool now knows a geometric fact about a room: whether an
 * arbitrary rectangle's own perimeter is walled in, against the newest
 * `WorldRenderView` the scene has handed it. Not a gesture -- neither
 * `attachGestures` nor `attachReadout` fires from any of these -- because this
 * is the query the HUD makes of the tool directly (`HudWorldRoomSource
 * .classifyArea`), for a rectangle that may not have come from a drag at all.
 */
describe('RoomTool answers whether a rectangle is enclosed, for whoever asks', () => {
  const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

  function worldWalledAt(rectangle: { x: number; y: number; width: number; height: number }): WorldRenderView {
    const world = new SparseWorld(8);
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    const right = rectangle.x + rectangle.width - 1;
    const bottom = rectangle.y + rectangle.height - 1;
    for (let x = rectangle.x; x <= right; x += 1) {
      world.setTopEdge(tile(x, rectangle.y), 1);
      world.setTopEdge(tile(x, bottom + 1), 1);
    }
    for (let y = rectangle.y; y <= bottom; y += 1) {
      world.setLeftEdge(tile(rectangle.x, y), 1);
      world.setLeftEdge(tile(right + 1, y), 1);
    }
    return WorldRenderView.fromSnapshot(world.snapshot());
  }

  it('reports open before any world has been handed to it', () => {
    const tool = new RoomTool();
    expect(tool.classifyArea({ x: 0, y: 0, width: 4, height: 3 })).toBe('open');
  });

  it('reports sealed for a rectangle whose own perimeter is fully walled', () => {
    const tool = new RoomTool();
    const area = { x: 1, y: 1, width: 4, height: 3 };
    tool.setWorld(worldWalledAt(area));
    expect(tool.classifyArea(area)).toBe('sealed');
  });

  it('reports open for a rectangle with even one gap in its perimeter', () => {
    const tool = new RoomTool();
    const area = { x: 1, y: 1, width: 4, height: 3 };
    const world = worldWalledAt(area);
    tool.setWorld(world);
    // A rectangle drawn one tile larger on every side is walled nowhere along
    // its own new perimeter -- the walls above belong to the smaller room, not
    // to this one.
    expect(tool.classifyArea({ x: 0, y: 0, width: 6, height: 5 })).toBe('open');
  });

  it('follows the newest world handed to it, replacing rather than merging with the last one', () => {
    const tool = new RoomTool();
    const area = { x: 2, y: 2, width: 3, height: 3 };
    tool.setWorld(worldWalledAt(area));
    expect(tool.classifyArea(area)).toBe('sealed');

    // An empty world arrives -- a fresh session, or a snapshot that has not
    // materialised this land -- and the old answer must not survive it.
    tool.setWorld(WorldRenderView.empty());
    expect(tool.classifyArea(area)).toBe('open');
  });
});
