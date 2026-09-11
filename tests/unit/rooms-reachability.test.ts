import { describe, expect, it } from 'vitest';

import { DoorRegistry } from '../../src/simulation/navigation/door';
import { buildNavigationGraph, type NavigationGraph } from '../../src/simulation/navigation/region-graph';
import type { TileRectangle } from '../../src/simulation/rooms/enclosure';
import { exteriorSeedRegions, roomAccess, roomReachability } from '../../src/simulation/rooms/reachability';
import { chunkCoordinate, tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * The exterior anchor, as a gate rather than as a printed table.
 *
 * `tests/research/0108-exterior-anchor-falsifier.research.ts` is the instrument
 * that found the rule ADR 0108 shipped with was wrong: it builds seven prisons,
 * scores four candidate seed rules on each and prints the result. **It asserts
 * nothing about which rule won**, by design -- a research file's deliverable is
 * its table -- so on its own it would let the repaired rule regress in silence.
 *
 * This file is the half of it that has to fail. The two scenarios that decided
 * the design are here as assertions:
 *
 * - **S2**, the falsifier ADR 0108 named in its own weakest-claim section and
 *   declined to run: a walled *unzoned* shed in the corner of the loaded area.
 *   Under the ADR's published rule its interior seeds the exterior and the
 *   portal walk vouches, through the shed's own door, for a room nothing can
 *   reach. Wrong in the reassuring direction.
 * - **S6**, which the ADR did not consider: a loaded area walled flush at its
 *   own boundary has no opening anywhere, so a rule made only of S2's repair
 *   seeds nothing and reports *every* room unreachable at once.
 *
 * A rule that answers one and not the other is not the shipped rule, and either
 * of these going green under it would be a defect reaching a player.
 */

const CHUNK = 32;
const ORIGIN = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
const WALL = 7;

function tile(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

function loadedWorld(): SparseWorld {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  return world;
}

/** Walls the whole perimeter of `rect`, in the edge vocabulary the world stores. */
function wallRectangle(world: SparseWorld, rect: TileRectangle): void {
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  for (let x = rect.x; x <= right; x += 1) {
    world.setTopEdge(tile(x, rect.y), WALL);
    world.setTopEdge(tile(x, bottom + 1), WALL);
  }
  for (let y = rect.y; y <= bottom; y += 1) {
    world.setLeftEdge(tile(rect.x, y), WALL);
    world.setLeftEdge(tile(right + 1, y), WALL);
  }
}

function door(doors: DoorRegistry, id: string, position: TilePosition, side: 'left' | 'top'): void {
  doors.register({ id, position, side, state: 'closed', requiredSecurityClearance: 0, costMultiplier: 1 });
}

function graphOf(world: SparseWorld, doors: DoorRegistry): NavigationGraph {
  return buildNavigationGraph(world, doors, [world.getChunk(ORIGIN)!]);
}

function accessOf(world: SparseWorld, doors: DoorRegistry, rooms: readonly TileRectangle[], room: TileRectangle) {
  const reachability = roomReachability(world, doors, graphOf(world, doors), () => rooms);
  return roomAccess(world, doors, reachability, room);
}

describe('the exterior anchor (ADR 0108 decision 1, as amended to R4)', () => {
  /**
   * S2. The corner shed is walled on all four sides -- including the two that
   * lie on the loaded area's own boundary -- and the corridor row between it
   * and the room is sealed at both ends, so the only way into the room is out
   * of the shed, and there is no way into the shed.
   */
  it('does not let a walled UNZONED structure on the frontier vouch for what is behind its door', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    const shed: TileRectangle = { x: 0, y: 0, width: 3, height: 3 };
    const room: TileRectangle = { x: 0, y: 4, width: 3, height: 3 };
    wallRectangle(world, shed);
    wallRectangle(world, room);
    world.setLeftEdge(tile(0, 3), WALL);
    world.setLeftEdge(tile(3, 3), WALL);
    door(doors, 'shed-hatch', tile(1, 3), 'top');
    door(doors, 'room-door', tile(1, 4), 'top');

    // The fixture must be the one this is about: the room's own perimeter is
    // sealed and holds a door, so the verdict turns on reachability alone.
    const graph = graphOf(world, doors);
    expect(graph.portals, 'both doors must be real portals, or nothing below is being tested').toHaveLength(2);

    expect(accessOf(world, doors, [room], room)).toBe('unreachable');

    // And the shed is the reason: its region must not be a seed. Under the
    // rule ADR 0108 published it is one, because the shed is not a zoned room
    // and nothing else excluded it.
    const seeds = exteriorSeedRegions(world, doors, graph, () => [room]);
    const shedRegion = graph.tileToRegion.get('1,1');
    expect(shedRegion, 'the shed interior must be in a region at all').not.toBeUndefined();
    expect([...seeds], 'the shed is sealed, so it is not outside').not.toContain(shedRegion);
  });

  /**
   * S6. Nothing escapes a flush-walled loaded area, so part 1 of the rule finds
   * no seed at all and part 2 has to answer -- with ADR 0108's own published
   * rule, which is right here and wrong in S2.
   */
  it('still calls a room reachable when the whole loaded area is walled flush at its boundary', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    wallRectangle(world, { x: 0, y: 0, width: CHUNK, height: CHUNK });
    const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
    wallRectangle(world, room);
    door(doors, 'room-door', tile(11, 13), 'top');

    expect(accessOf(world, doors, [room], room)).toBe('doorway');
  });

  /**
   * The other half of S6's lesson, and the reason part 2 keeps the ADR's
   * room-rectangle clause rather than seeding the bare ring: in a flush-walled
   * area a sealed room whose own interior lies on the boundary ring would
   * otherwise seed the exterior with itself and report itself reachable. That
   * is the failure ADR 0108's own anchor probe found and repaired, preserved
   * here in the branch where it still bites.
   */
  it('does not let a frontier room vouch for itself when the fallback rule is the one answering', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    wallRectangle(world, { x: 0, y: 0, width: CHUNK, height: CHUNK });
    const room: TileRectangle = { x: 0, y: 0, width: 3, height: 3 };
    wallRectangle(world, room);
    door(doors, 'room-door', tile(1, 3), 'top');
    // The corridor tile outside that door, boxed in: the act-4a state.
    world.setTopEdge(tile(1, 4), WALL);
    world.setLeftEdge(tile(1, 3), WALL);
    world.setLeftEdge(tile(2, 3), WALL);

    expect(accessOf(world, doors, [room], room)).toBe('unreachable');
  });

  it('calls an ordinary sealed room with a door onto open yard reachable', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
    wallRectangle(world, room);
    door(doors, 'room-door', tile(11, 13), 'top');

    expect(accessOf(world, doors, [room], room)).toBe('doorway');
  });

  /**
   * The case #1006 was filed about, at the smallest size that can hold it: the
   * door is there, and the one tile it opens onto is walled in on its other
   * three sides. Today's edge scan answers `'doorway'` for this; that is the
   * defect.
   */
  it('calls a room whose door is walled up from outside unreachable', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
    wallRectangle(world, room);
    door(doors, 'room-door', tile(11, 13), 'top');
    world.setTopEdge(tile(11, 14), WALL);
    world.setLeftEdge(tile(11, 13), WALL);
    world.setLeftEdge(tile(12, 13), WALL);

    expect(accessOf(world, doors, [room], room)).toBe('unreachable');
  });

  /**
   * A prison perimeter wall with one gate is the ordinary shape of a built
   * prison, and it is the case a rule demanding an opening at the *world's*
   * frontier would break: everything inside is reachable through the gate.
   */
  it('reaches through a gate in a prison perimeter wall', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    wallRectangle(world, { x: 2, y: 2, width: CHUNK - 4, height: CHUNK - 4 });
    door(doors, 'main-gate', tile(5, 2), 'top');
    const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
    wallRectangle(world, room);
    door(doors, 'room-door', tile(11, 13), 'top');

    expect(accessOf(world, doors, [room], room)).toBe('doorway');
  });

  /**
   * A locked door is still a portal, which is `buildNavigationGraph`'s own
   * policy -- it records one "regardless of its current lock state" -- so a
   * prison locked up for the night must not report every room unreachable.
   */
  it('walks through a locked door, because navigation does', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    wallRectangle(world, { x: 2, y: 2, width: CHUNK - 4, height: CHUNK - 4 });
    door(doors, 'main-gate', tile(5, 2), 'top');
    const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
    wallRectangle(world, room);
    door(doors, 'room-door', tile(11, 13), 'top');
    doors.setState('main-gate', 'locked');
    expect(doors.getById('main-gate')?.state, 'the fixture must have a locked gate').toBe('locked');

    expect(accessOf(world, doors, [room], room)).toBe('doorway');
  });

  /**
   * Determinism: the answer is a property of the world, not of the order the
   * seeds happened to come out in. Re-deriving the graph and the walk from the
   * same world must give the same verdict every time, and it must not depend on
   * the order the caller hands over the room rectangles -- which reaches the
   * fallback branch's `containsTile` scan.
   */
  it('answers the same for the same world, whatever order the rooms arrive in', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    wallRectangle(world, { x: 0, y: 0, width: CHUNK, height: CHUNK });
    const frontier: TileRectangle = { x: 0, y: 0, width: 3, height: 3 };
    const interior: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
    for (const rect of [frontier, interior]) wallRectangle(world, rect);
    door(doors, 'frontier-door', tile(1, 3), 'top');
    door(doors, 'interior-door', tile(11, 13), 'top');
    // The frontier room's door walled up from outside, so the two rooms give
    // different answers and an order-independent result is worth asserting.
    // Written after the first draft of this case expected `'unreachable'`
    // without boxing that tile in and got `'doorway'` -- correctly, since the
    // door opened straight onto the yard.
    world.setTopEdge(tile(1, 4), WALL);
    world.setLeftEdge(tile(1, 3), WALL);
    world.setLeftEdge(tile(2, 3), WALL);

    const forwards = [frontier, interior];
    const backwards = [interior, frontier];
    for (const rooms of [forwards, backwards]) {
      expect(accessOf(world, doors, rooms, frontier)).toBe('unreachable');
      expect(accessOf(world, doors, rooms, interior)).toBe('doorway');
    }
  });

  /**
   * **`'gap'` is decided before reachability and therefore promises nothing
   * about it**, which is the finding that kept
   * `hud.alert.event.rooms.needs-cleared`'s disclaiming clause alive. A yard is
   * `{ type: 'outdoors' }` in the room catalogue, so `RoomZoningService.zone`
   * accepts any perimeter for one -- and a yard zoned inside a sealed structure
   * reads `'gap'`, counts zero towards `shortfallOf`, and is a room nobody can
   * get into.
   */
  it('answers `gap` for an open rectangle even when nothing can reach it, which is why the checklist does not cover access', () => {
    const world = loadedWorld();
    const doors = new DoorRegistry();
    // A sealed 6x6 shed with nothing leading into it, and a 2x2 rectangle
    // zoned inside it with no walls of its own.
    wallRectangle(world, { x: 10, y: 10, width: 6, height: 6 });
    const yard: TileRectangle = { x: 11, y: 11, width: 2, height: 2 };

    const graph = graphOf(world, doors);
    const reachability = roomReachability(world, doors, graph, () => [yard]);
    expect(reachability.reaches(yard), 'nothing can get into the shed this rectangle sits in').toBe(false);
    expect(roomAccess(world, doors, reachability, yard)).toBe('gap');
  });
});
