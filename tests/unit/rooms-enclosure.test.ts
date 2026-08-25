import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { roomPerimeterEnclosure } from '../../src/simulation/rooms/enclosure';
import { enclosureRequirement, minimumSizeRequirement } from '../../src/simulation/rooms/requirements';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { RoomZoningService } from '../../src/simulation/rooms/zoning';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * The `enclosed`/`outdoors` requirement, evaluated for the first time.
 *
 * `RoomRequirement.type` has included both since #17 and all 18 room
 * definitions carry one of them; nothing in `src/` had ever read either, so a
 * cell zoned in the middle of open ground was accepted in silence.
 *
 * What is asserted here is deliberately the *narrow* predicate:
 * `roomPerimeterEnclosure` answers whether this rectangle's own perimeter is
 * walled, which is a real property of the world read from the two edge layers.
 * It is not a region-enclosure query, and the tests say so rather than
 * pretending otherwise -- see `src/simulation/rooms/enclosure.ts`, and the
 * final block below, which pins the gap as a gap.
 */

const CHUNK_SIZE = 32;
const WALL = 7;

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function ownedWorld(): SparseWorld {
  const world = new SparseWorld(CHUNK_SIZE);
  const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(origin);
  world.setOwned(origin, true);
  return world;
}

/** Walls the whole perimeter of an inclusive rectangle, on the two edges the world stores. */
function wallPerimeter(
  world: SparseWorld,
  rectangle: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): void {
  const right = rectangle.x + rectangle.width - 1;
  const bottom = rectangle.y + rectangle.height - 1;
  for (let x = rectangle.x; x <= right; x += 1) {
    world.setTopEdge(tile(x, rectangle.y), WALL);
    world.setTopEdge(tile(x, bottom + 1), WALL);
  }
  for (let y = rectangle.y; y <= bottom; y += 1) {
    world.setLeftEdge(tile(rectangle.x, y), WALL);
    world.setLeftEdge(tile(right + 1, y), WALL);
  }
}

describe('a rectangle whose own perimeter is walled reads as sealed', () => {
  it('answers sealed for a fully walled rectangle', () => {
    const world = ownedWorld();
    const rectangle = { x: 4, y: 4, width: 3, height: 2 };
    wallPerimeter(world, rectangle);

    expect(roomPerimeterEnclosure(world, rectangle)).toEqual({ enclosure: 'sealed' });
  });

  it('names the first gap in a fixed order, so the answer is a function of the rectangle', () => {
    // The order is north row west to east, then south, then west column, then
    // east. Two gaps are opened and the north one has to be the one reported,
    // whichever order the walls were written in.
    const world = ownedWorld();
    const rectangle = { x: 0, y: 0, width: 4, height: 4 };
    wallPerimeter(world, rectangle);
    world.setLeftEdge(tile(0, 2), 0); // a west gap
    world.setTopEdge(tile(2, 0), 0); // and a north gap, later in the wall order

    expect(roomPerimeterEnclosure(world, rectangle)).toEqual({
      enclosure: 'open',
      gap: { tile: tile(2, 0), edge: 'north' },
    });
  });

  it('reads the south boundary as the north edge of the row below, and the east as the west of the column right', () => {
    // The world stores only north and west edges, so a rectangle's south and
    // east boundaries live on its *neighbours*. A check that looked for a south
    // or east slot would find nothing and call every rectangle open.
    const world = ownedWorld();
    const rectangle = { x: 5, y: 5, width: 2, height: 2 };
    wallPerimeter(world, rectangle);

    world.setTopEdge(tile(5, 7), 0);
    expect(roomPerimeterEnclosure(world, rectangle)).toEqual({
      enclosure: 'open',
      gap: { tile: tile(5, 7), edge: 'north' },
    });

    world.setTopEdge(tile(5, 7), WALL);
    world.setLeftEdge(tile(7, 6), 0);
    expect(roomPerimeterEnclosure(world, rectangle)).toEqual({
      enclosure: 'open',
      gap: { tile: tile(7, 6), edge: 'west' },
    });
  });

  it('reads open ground as open, which is the state a new prison is entirely in', () => {
    expect(roomPerimeterEnclosure(ownedWorld(), { x: 2, y: 2, width: 6, height: 6 })).toMatchObject({
      enclosure: 'open',
    });
  });

  it('materialises nothing, so evaluating a rectangle cannot grow the world', () => {
    // `SparseWorld.getTopEdge`/`getLeftEdge` answer 0 for a chunk that does not
    // exist, unlike `setZoning`, which loads one. A check that wrote or probed
    // through a setter would create chunk (1,0) here.
    const world = ownedWorld();

    expect(roomPerimeterEnclosure(world, { x: 30, y: 0, width: 4, height: 4 })).toMatchObject({
      enclosure: 'open',
    });
    expect(world.hasChunk({ x: chunkCoordinate(1), y: chunkCoordinate(0) })).toBe(false);
  });

  it('reports a rectangle with no area as open, without inspecting anything', () => {
    const world = ownedWorld();
    expect(roomPerimeterEnclosure(world, { x: 0, y: 0, width: 0, height: 4 })).toEqual({ enclosure: 'open' });
    expect(roomPerimeterEnclosure(world, { x: 0, y: 0, width: 4, height: -1 })).toEqual({ enclosure: 'open' });
  });
});

describe('the answer is reported on an accepted designation and refuses nothing', () => {
  it('accepts a cell drawn in open ground, and says it is open against an enclosed requirement', () => {
    // The behaviour the Rooms panel's warning line is built on, and the reason
    // it is a warning: a room drawn in open ground *succeeds*. It used to
    // succeed silently, which is the whole defect -- the player was told
    // nothing about a requirement the content authors and the simulation had
    // never read.
    const world = ownedWorld();
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    const outcome = zoning.zone({ roomCatalogId: 'room.cell', x: 4, y: 4, width: 2, height: 3 }, 9);

    expect(outcome.kind).toBe('zoned');
    if (outcome.kind !== 'zoned') throw new Error('unreachable');
    expect(outcome.enclosure).toBe('open');
    expect(outcome.enclosureRequirement).toBe('enclosed');
    expect(zoning.lastNotice).toEqual({ sequence: 1, tick: 9, enclosure: 'open', requirement: 'enclosed' });
  });

  it('reports sealed for the same cell inside its own walls', () => {
    const world = ownedWorld();
    wallPerimeter(world, { x: 4, y: 4, width: 2, height: 3 });
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    const outcome = zoning.zone({ roomCatalogId: 'room.cell', x: 4, y: 4, width: 2, height: 3 }, 0);

    if (outcome.kind !== 'zoned') throw new Error('the zone must be accepted for this test to mean anything');
    expect(outcome.enclosure).toBe('sealed');
  });

  it('reports the yard as outdoors, so the requirement is read and not assumed', () => {
    // 17 of the 18 rooms are `enclosed`; a function returning a constant would
    // pass every other assertion in this file. `room.yard` is the one that says
    // otherwise, and it is correct when it is open.
    const world = ownedWorld();
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    const outcome = zoning.zone({ roomCatalogId: 'room.yard', x: 0, y: 0, width: 8, height: 8 }, 0);

    if (outcome.kind !== 'zoned') throw new Error('the zone must be accepted for this test to mean anything');
    expect(outcome.enclosureRequirement).toBe('outdoors');
    expect(outcome.enclosure).toBe('open');
  });

  it('counts designations rather than ticks, and carries no notice before the first one', () => {
    const world = ownedWorld();
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    expect(zoning.lastNotice, 'a session that has zoned nothing reports nothing').toBeUndefined();

    zoning.zone({ roomCatalogId: 'room.cell', x: 0, y: 0, width: 2, height: 3 }, 3);
    zoning.zone({ roomCatalogId: 'room.cell', x: 0, y: 0, width: 2, height: 3 }, 4); // refused: duplicate anchor
    zoning.zone({ roomCatalogId: 'room.cell', x: 4, y: 0, width: 2, height: 3 }, 5);

    // Two accepted designations, so the sequence is 2 and not 3: a refusal is
    // not a designation, and the notice's ordinal is what lets the main thread
    // tell a republished notice from a new one.
    expect(zoning.lastNotice).toEqual({ sequence: 2, tick: 5, enclosure: 'open', requirement: 'enclosed' });
  });
});

describe('the requirement readers are a pure read of authored content', () => {
  it('answers undefined for a definition that authors no minimum, rather than inventing 1x1', () => {
    // No shipped room is in this state, and that is the point of asserting it
    // on a literal: a reader that defaulted to 1x1 would be indistinguishable
    // from one that read content, for every room in the catalogue.
    expect(
      minimumSizeRequirement({
        schemaVersion: 1,
        id: 'room.test',
        numericId: 200,
        nameKey: 'room.test.name',
        category: 'utility',
        requirements: [],
      }),
    ).toBeUndefined();
  });

  it("answers 'none' for a definition carrying neither enclosure requirement", () => {
    expect(
      enclosureRequirement({
        schemaVersion: 1,
        id: 'room.test',
        numericId: 200,
        nameKey: 'room.test.name',
        category: 'utility',
        requirements: [],
      }),
    ).toBe('none');
  });

  it('reads all 18 shipped rooms, and finds exactly one outdoors', () => {
    // The measurement the panel's copy and the ADR both rest on, computed
    // rather than quoted.
    const all = defaultRoomContentRegistry.all();
    expect(all).toHaveLength(18);
    const byRequirement = all.map((definition) => enclosureRequirement(definition));
    expect(byRequirement.filter((value) => value === 'outdoors')).toHaveLength(1);
    expect(byRequirement.filter((value) => value === 'enclosed')).toHaveLength(17);
    expect(byRequirement.filter((value) => value === 'none')).toHaveLength(0);
    // And every one authors a minimum size, which is what makes the refusal in
    // `rooms-zoning.test.ts` reachable for any room a player can pick.
    for (const definition of all) {
      expect(minimumSizeRequirement(definition), `${definition.id} must author a minimum size`).toBeDefined();
    }
  });
});

describe('what enclosure detection does not yet answer', () => {
  it('reports a room drawn inside a larger sealed building as open, which is a false negative', () => {
    // Pinned as a *limitation*, not as correct behaviour. The perimeter check
    // is narrower than enclosure: this room is topologically indoors and reads
    // `open`, because its own boundary carries no wall. That is exactly why
    // nothing refuses on the answer -- refusing here would block a legitimate
    // designation -- and it is the gap a region-level query would close.
    //
    // `TopologyManager` does region *detection* and exposes no enclosure query;
    // its own comment says the mapping "would be used later to query if a
    // global room is enclosed", and `TopologyManager.update()` has no caller in
    // `src/` at all, so `getTopologyId` answers 0 for every tile in a running
    // session. Closing this needs that query built and a rule about the
    // materialised world's frontier, which nobody has written.
    const world = ownedWorld();
    wallPerimeter(world, { x: 0, y: 0, width: 12, height: 12 }); // the building
    const inner = { x: 4, y: 4, width: 3, height: 3 }; // a room inside it, no partitions

    expect(roomPerimeterEnclosure(world, inner)).toMatchObject({ enclosure: 'open' });
    expect(
      roomPerimeterEnclosure(world, { x: 0, y: 0, width: 12, height: 12 }),
      'the building itself is sealed, so the check is not simply broken',
    ).toEqual({ enclosure: 'sealed' });
  });
});
