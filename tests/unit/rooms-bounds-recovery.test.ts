import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import {
  recoverRoomBoundsFromZoningPlane,
  type RecoverableRoomInstance,
} from '../../src/simulation/rooms/bounds-recovery';
import { roomInstanceIdFor } from '../../src/simulation/rooms/zoning';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * `recoverRoomBoundsFromZoningPlane` -- the arithmetic that gives a room
 * instance persisted without a rectangle its rectangle back from the zoning
 * plane the same payload carries (issue #559).
 *
 * ## What these cases are for
 *
 * The end-to-end statement lives in
 * `tests/migrations/save-v4-room-bounds.test.ts`, on a save a shipped V4 build
 * actually wrote. This file is the *shape* of the answer: the configurations
 * the plane alone is ambiguous about, which are the ones an anchor-and-paint
 * scan can get wrong. Two rooms of the same type sharing an edge paint one
 * connected region, so anything that flood-filled would answer with their
 * union; the interesting cases below are all of that family.
 *
 * ## The numbers here are drawn, not computed
 *
 * Every expected rectangle is the rectangle the test itself painted, written
 * out as literals. Nothing asks the production code what it thinks the answer
 * is and then asserts that answer, and no dimension is derived from a constant
 * the code under test also reads.
 *
 * `room.yard` is numericId 9 and `room.common-room` is 10 in
 * `src/content/room-catalog.ts`; the plane is painted with those directly here
 * rather than through `RoomZoningService.zone`, because `zone` enforces
 * minimum sizes and land ownership that have nothing to do with what this
 * function reads, and painting by hand is what lets a case describe a plane a
 * *hand-edited* save could hold as well as one `zone` wrote.
 */

const YARD = 9;
const COMMON_ROOM = 10;

function worldWith(paint: readonly { x: number; y: number; width: number; height: number; value: number }[]): SparseWorld {
  const world = new SparseWorld(32);
  world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  for (const rect of paint) {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        world.setZoning({ x: tileCoordinate(x), y: tileCoordinate(y) }, rect.value);
      }
    }
  }
  return world;
}

/** A boundless row, named the way the save names it, so a test cannot accidentally agree with itself about the id format. */
function boundlessRow(roomCatalogId: string, x: number, y: number): RecoverableRoomInstance {
  const anchorTile = { x: tileCoordinate(x), y: tileCoordinate(y) };
  return { instanceId: roomInstanceIdFor(roomCatalogId, anchorTile), roomCatalogId, anchorTile };
}

describe('recovering a room rectangle from the zoning plane', () => {
  it('recovers the rectangle a single painted room shows', () => {
    const world = worldWith([{ x: 4, y: 4, width: 8, height: 8, value: YARD }]);

    const recovered = recoverRoomBoundsFromZoningPlane(world, [boundlessRow('room.yard', 4, 4)], defaultRoomContentRegistry);

    expect(recovered.get('room.yard:4:4')).toEqual({ width: 8, height: 8 });
  });

  it('recovers a rectangle that is not square, in both orientations', () => {
    const world = worldWith([
      { x: 2, y: 2, width: 16, height: 8, value: YARD },
      { x: 2, y: 12, width: 5, height: 9, value: COMMON_ROOM },
    ]);

    const recovered = recoverRoomBoundsFromZoningPlane(
      world,
      [boundlessRow('room.yard', 2, 2), boundlessRow('room.common-room', 2, 12)],
      defaultRoomContentRegistry,
    );

    expect(recovered.get('room.yard:2:2')).toEqual({ width: 16, height: 8 });
    expect(recovered.get('room.common-room:2:12')).toEqual({ width: 5, height: 9 });
  });

  it('separates two rooms of one type that share a vertical edge', () => {
    // One connected 16x8 region of numericId 9 in the plane, two rooms in the
    // save. A flood fill answers 16x8 twice; the anchors say otherwise.
    const world = worldWith([{ x: 4, y: 4, width: 16, height: 8, value: YARD }]);

    const recovered = recoverRoomBoundsFromZoningPlane(
      world,
      [boundlessRow('room.yard', 4, 4), boundlessRow('room.yard', 12, 4)],
      defaultRoomContentRegistry,
    );

    expect(recovered.get('room.yard:4:4')).toEqual({ width: 8, height: 8 });
    expect(recovered.get('room.yard:12:4')).toEqual({ width: 8, height: 8 });
  });

  it('separates two rooms of one type that share a horizontal edge', () => {
    const world = worldWith([{ x: 4, y: 4, width: 8, height: 16, value: YARD }]);

    const recovered = recoverRoomBoundsFromZoningPlane(
      world,
      [boundlessRow('room.yard', 4, 4), boundlessRow('room.yard', 4, 12)],
      defaultRoomContentRegistry,
    );

    expect(recovered.get('room.yard:4:4')).toEqual({ width: 8, height: 8 });
    expect(recovered.get('room.yard:4:12')).toEqual({ width: 8, height: 8 });
  });

  it('separates a neighbour whose rectangle starts on an earlier row, which no east-west scan alone can', () => {
    /*
     * The case the ascending-y ordering exists for, and the one an
     * anchor-stop alone gets wrong. `east` anchors at (12,2) and reaches down
     * to y=9; `west` anchors at (4,4) and its own row, y=4, runs straight into
     * `east`'s tiles at x=12 -- which are painted, and are *not* an anchor,
     * because `east`'s anchor is two rows higher. Measuring `west` first
     * answers 16 wide. Measuring in ascending y answers 8, because `east` has
     * claimed x=12..19 by then.
     */
    const world = worldWith([
      { x: 4, y: 4, width: 8, height: 8, value: YARD },
      { x: 12, y: 2, width: 8, height: 8, value: YARD },
    ]);

    const recovered = recoverRoomBoundsFromZoningPlane(
      world,
      // Deliberately listed with the later anchor first, so the result cannot
      // come from the payload's own ordering.
      [boundlessRow('room.yard', 4, 4), boundlessRow('room.yard', 12, 2)],
      defaultRoomContentRegistry,
    );

    expect(recovered.get('room.yard:12:2')).toEqual({ width: 8, height: 8 });
    expect(recovered.get('room.yard:4:4')).toEqual({ width: 8, height: 8 });
  });

  it('does not grow one room into a neighbour of a different type', () => {
    const world = worldWith([
      { x: 4, y: 4, width: 8, height: 8, value: YARD },
      { x: 12, y: 4, width: 5, height: 5, value: COMMON_ROOM },
    ]);

    const recovered = recoverRoomBoundsFromZoningPlane(
      world,
      [boundlessRow('room.yard', 4, 4), boundlessRow('room.common-room', 12, 4)],
      defaultRoomContentRegistry,
    );

    expect(recovered.get('room.yard:4:4')).toEqual({ width: 8, height: 8 });
    expect(recovered.get('room.common-room:12:4')).toEqual({ width: 5, height: 5 });
  });

  it('does not grow a boundless room into a neighbour whose rectangle the save does record', () => {
    // A mixed payload: one row upgraded from V4 beside one this build wrote.
    // The recorded rectangle is the authority and is claimed before anything
    // is measured, so the boundless row stops at its edge instead of
    // swallowing it.
    const world = worldWith([{ x: 4, y: 4, width: 16, height: 8, value: YARD }]);
    const recorded: RecoverableRoomInstance = {
      instanceId: 'room.yard:12:4',
      roomCatalogId: 'room.yard',
      anchorTile: { x: tileCoordinate(12), y: tileCoordinate(4) },
      width: 8,
      height: 8,
    };

    const recovered = recoverRoomBoundsFromZoningPlane(world, [boundlessRow('room.yard', 4, 4), recorded], defaultRoomContentRegistry);

    expect(recovered.get('room.yard:4:4')).toEqual({ width: 8, height: 8 });
    // A row that already states its rectangle is never answered for: the save
    // said, and this function does not second-guess it.
    expect(recovered.has('room.yard:12:4')).toBe(false);
  });

  it('does not grow into a recorded neighbour that starts on an earlier row, where no anchor lies on the scan', () => {
    /*
     * The half of the case above that the anchor stop cannot reach, and the
     * reason a recorded rectangle is *claimed* rather than merely skipped.
     * `recorded` anchors at (12,2), so its anchor is not on the boundless
     * room's row at all -- but its tiles are, at x=12..19. Skipping recorded
     * rows instead of claiming them measures the boundless yard as 16 wide,
     * and every tile of that 16x8 is painted, so the whole-rectangle check
     * passes it. Only the claim refuses it.
     *
     * Written after a mutation that dropped the claim survived the case above.
     */
    const world = worldWith([
      { x: 4, y: 4, width: 8, height: 8, value: YARD },
      { x: 12, y: 2, width: 8, height: 8, value: YARD },
    ]);
    const recorded: RecoverableRoomInstance = {
      instanceId: 'room.yard:12:2',
      roomCatalogId: 'room.yard',
      anchorTile: { x: tileCoordinate(12), y: tileCoordinate(2) },
      width: 8,
      height: 8,
    };

    const recovered = recoverRoomBoundsFromZoningPlane(world, [boundlessRow('room.yard', 4, 4), recorded], defaultRoomContentRegistry);

    expect(recovered.get('room.yard:4:4')).toEqual({ width: 8, height: 8 });
    expect(recovered.has('room.yard:12:2')).toBe(false);
  });

  it('recovers nothing for a row whose anchor tile is not painted with its own room type', () => {
    // The honest refusal ADR 0071 decision 2 kept: no rectangle is invented
    // where the plane does not show one, so such an instance keeps the
    // unbounded ceiling rather than being given a guess.
    const world = worldWith([{ x: 4, y: 4, width: 8, height: 8, value: COMMON_ROOM }]);

    const recovered = recoverRoomBoundsFromZoningPlane(world, [boundlessRow('room.yard', 4, 4)], defaultRoomContentRegistry);

    expect(recovered.size).toBe(0);
  });

  it('recovers nothing for a room painted in an L rather than a rectangle', () => {
    /*
     * The two runs measure one row and one column, so on their own they would
     * report the bounding box of an L -- a rectangle covering tiles that are
     * not painted. The whole-rectangle check is what refuses instead, and this
     * is the case that shows it: a save no `zone` could have written gets no
     * answer rather than a wrong one.
     */
    const world = worldWith([
      { x: 4, y: 4, width: 8, height: 3, value: YARD },
      { x: 4, y: 7, width: 3, height: 5, value: YARD },
    ]);

    const recovered = recoverRoomBoundsFromZoningPlane(world, [boundlessRow('room.yard', 4, 4)], defaultRoomContentRegistry);

    expect(recovered.size).toBe(0);
  });

  it('recovers nothing for a row naming a room type this build does not declare', () => {
    const world = worldWith([{ x: 4, y: 4, width: 8, height: 8, value: YARD }]);

    const recovered = recoverRoomBoundsFromZoningPlane(
      world,
      [{ instanceId: 'room.aviary:4:4', roomCatalogId: 'room.aviary', anchorTile: { x: tileCoordinate(4), y: tileCoordinate(4) } }],
      defaultRoomContentRegistry,
    );

    expect(recovered.size).toBe(0);
  });

  it('is a pure function of the plane and the rows: it writes nothing and the answer does not depend on the order they arrive in', () => {
    const paint = [
      { x: 4, y: 4, width: 8, height: 8, value: YARD },
      { x: 12, y: 2, width: 8, height: 8, value: YARD },
      { x: 4, y: 12, width: 5, height: 5, value: COMMON_ROOM },
    ];
    const rows = [boundlessRow('room.yard', 4, 4), boundlessRow('room.yard', 12, 2), boundlessRow('room.common-room', 4, 12)];

    const world = worldWith(paint);
    const before = JSON.stringify(world.snapshot());
    const forward = recoverRoomBoundsFromZoningPlane(world, rows, defaultRoomContentRegistry);
    const reversed = recoverRoomBoundsFromZoningPlane(worldWith(paint), [...rows].reverse(), defaultRoomContentRegistry);

    expect([...forward.entries()].sort()).toEqual([...reversed.entries()].sort());
    expect(forward.size, 'all three rooms must actually be recovered, or this compares two empty maps').toBe(3);
    // The plane is read, never written -- a recovery that materialised a chunk
    // or repainted a tile would change the world a restore was handed.
    expect(JSON.stringify(world.snapshot())).toBe(before);
  });
});
