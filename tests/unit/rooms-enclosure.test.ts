import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { DOOR_EDGE_NUMERIC_ID } from '../../src/simulation/construction/definition';
import { DoorConstructionService } from '../../src/simulation/construction/door-construction';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { roomPerimeterAccess, roomPerimeterEnclosure, type RoomDoorReader } from '../../src/simulation/rooms/enclosure';
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
 * What is asserted here is `roomPerimeterEnclosure`: whether this rectangle's
 * own perimeter is walled, read from the two edge layers.
 *
 * **The second describe block used to be called "the answer is reported on an
 * accepted designation and refuses nothing", and it is now the opposite.** The
 * owner ruled that `roomPerimeterEnclosure` is not to stay advisory and that
 * `zone` must refuse an open room (issue #446's third open question; the ADR
 * "Must a zoned room be enclosed" is the decision). What that ruling settles is
 * also the *meaning* of `enclosed`: it is "this room's own boundary is closed"
 * rather than "this room is topologically indoors", and against that question
 * this predicate is exact rather than narrow. The final block below used to pin
 * the difference as a false negative; it now pins it as the rule.
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

  it('finds a gap at the last tile of every side, not only inside one', () => {
    // Three of the four perimeter loops had nothing asserting that their end
    // bound is inclusive: the fixture above varies *which side* the gap is on
    // and never *where along the side*, so `x <= right` -> `x < right` on the
    // north row, on the south row, and `y <= bottom` -> `y < bottom` on the
    // west column all survived the suite. A room whose only gap sits at the
    // last index of one of those sides read `sealed`, and the Rooms panel's
    // `hud.rooms.enclosure-open-required` warning never appeared.
    //
    // Width and height are deliberately different (3 and 2, so `right` is 6
    // and `bottom` is 5). With a square the row bound and the column bound are
    // the same number, and a gap at the last column is also at the last row --
    // so a surviving row mutation is masked by the intact column loop finding
    // the same tile's other edge, and the case proves neither.
    const rectangle = { x: 4, y: 4, width: 3, height: 2 };
    const walled = (): SparseWorld => {
      const world = ownedWorld();
      wallPerimeter(world, rectangle);
      expect(
        roomPerimeterEnclosure(world, rectangle),
        'each case must start from a rectangle with no gap at all',
      ).toEqual({ enclosure: 'sealed' });
      return world;
    };

    // North row, last tile: x = right = 6, on tile (6, 4)'s own north edge.
    const north = walled();
    north.setTopEdge(tile(6, 4), 0);
    expect(roomPerimeterEnclosure(north, rectangle)).toEqual({
      enclosure: 'open',
      gap: { tile: tile(6, 4), edge: 'north' },
    });

    // South row, last tile: x = right = 6, stored as the north edge of the row
    // below, y = bottom + 1 = 6.
    const south = walled();
    south.setTopEdge(tile(6, 6), 0);
    expect(roomPerimeterEnclosure(south, rectangle)).toEqual({
      enclosure: 'open',
      gap: { tile: tile(6, 6), edge: 'north' },
    });

    // West column, last tile: y = bottom = 5, on tile (4, 5)'s own west edge.
    const west = walled();
    west.setLeftEdge(tile(4, 5), 0);
    expect(roomPerimeterEnclosure(west, rectangle)).toEqual({
      enclosure: 'open',
      gap: { tile: tile(4, 5), edge: 'west' },
    });

    // East column, last tile: y = bottom = 5, stored as the west edge of the
    // column to the right, x = right + 1 = 7. This loop was already killed by
    // the case below, which happens to put its east gap on the last row; it is
    // pinned here on purpose so that case can move without silently unguarding
    // the fourth loop.
    const east = walled();
    east.setLeftEdge(tile(7, 5), 0);
    expect(roomPerimeterEnclosure(east, rectangle)).toEqual({
      enclosure: 'open',
      gap: { tile: tile(7, 5), edge: 'west' },
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

describe('an enclosed room whose perimeter is open is refused', () => {
  /*
   * ## The assertion that reversed, quoted before it is replaced
   *
   * This block opened with a case called *'accepts a cell drawn in open
   * ground, and says it is open against an enclosed requirement'*, whose body
   * was:
   *
   *     const outcome = zoning.zone({ roomCatalogId: 'room.cell', x: 4, y: 4, width: 2, height: 3 }, 9);
   *     expect(outcome.kind).toBe('zoned');
   *     ...
   *     expect(outcome.enclosure).toBe('open');
   *     expect(zoning.lastNotice).toEqual({ sequence: 1, tick: 9, enclosure: 'open', requirement: 'enclosed' });
   *
   * under a comment reading *"a room drawn in open ground **succeeds**. It used
   * to succeed silently, which is the whole defect -- the player was told
   * nothing about a requirement the content authors and the simulation had
   * never read."*
   *
   * **That test was right when it was written and is wrong now**, and the
   * difference is a ruling rather than a bug. It was right because `zone`'s
   * contract said the enclosure answer is reported and never enforced, and
   * because the reason given for that -- the predicate is narrower than
   * topological enclosure -- was true under the reading of `enclosed` then in
   * force. The owner has since ruled that `zone` must refuse an open room, and
   * with it that `enclosed` means "this room's own boundary is closed". Under
   * that reading the same call must be refused, so the assertion is inverted
   * here rather than deleted, and the old text is quoted above so a reader can
   * see which of the two statements the codebase is making.
   */
  it('refuses a cell drawn in open ground, naming the requirement it fails', () => {
    const world = ownedWorld();
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    const outcome = zoning.zone({ roomCatalogId: 'room.cell', x: 4, y: 4, width: 2, height: 3 }, 9);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'not-enclosed', tick: 9 });
  });

  it('writes nothing at all when it refuses: no paint, no instance, no notice', () => {
    // The property `zone` has always had for its other seven refusals, extended
    // to the eighth. It matters more here than elsewhere: this check is the
    // last one before the write, so a refusal returned from the wrong place
    // would leave a painted plane with no instance -- the one inconsistency
    // this service is careful never to create.
    const world = ownedWorld();
    const rooms = new RoomInstanceRegistry();
    const zoning = new RoomZoningService(world, rooms);

    zoning.zone({ roomCatalogId: 'room.cell', x: 4, y: 4, width: 2, height: 3 }, 0);

    expect(world.getZoning(tile(4, 4)), 'the anchor tile must be unpainted').toBe(0);
    expect(world.getZoning(tile(5, 6)), 'and so must the far corner').toBe(0);
    expect(rooms.allByRoomCatalogId('room.cell')).toEqual([]);
    expect(zoning.lastNotice, 'a refusal is not a designation').toBeUndefined();
    expect(zoning.recentRefusals().map((refusal) => refusal.reason)).toEqual(['not-enclosed']);
  });

  it('names the first perimeter gap by tile *and* edge, because a tile alone is ambiguous', () => {
    // The world stores a north edge and a west edge per tile, so `tile(4, 4)`
    // does not say which wall is missing. Both halves are asserted, and the
    // fixture is chosen so they disagree with each other: the gap is opened on
    // tile (5, 4)'s *north* edge, and tile (5, 4)'s *west* edge is walled. A
    // refusal that carried the wrong edge, or dropped it, fails here; one that
    // carried the wrong tile fails too, because (5, 4) is not the anchor.
    const world = ownedWorld();
    const rectangle = { x: 4, y: 4, width: 3, height: 2 };
    wallPerimeter(world, rectangle);
    world.setTopEdge(tile(5, 4), 0);

    const outcome = new RoomZoningService(world, new RoomInstanceRegistry()).zone(
      { roomCatalogId: 'room.holding-cell', ...rectangle },
      0,
    );

    expect(outcome).toMatchObject({
      kind: 'refused',
      reason: 'not-enclosed',
      tile: tile(5, 4),
      edge: 'north',
    });
    // And a west gap, so `edge` cannot be a constant. Resealing the north gap
    // and opening tile (4, 5)'s west edge moves the answer to the third of the
    // four perimeter loops: a refusal hard-coding `'north'`, or dropping the
    // field, fails one of these two halves whichever way it is written.
    world.setTopEdge(tile(5, 4), WALL);
    world.setLeftEdge(tile(4, 5), 0);

    expect(
      new RoomZoningService(world, new RoomInstanceRegistry()).zone(
        { roomCatalogId: 'room.holding-cell', ...rectangle },
        1,
      ),
    ).toMatchObject({ reason: 'not-enclosed', tile: tile(4, 5), edge: 'west' });
  });

  it('accepts the same cell once its perimeter is walled', () => {
    // The other side of the refusal, and the reason the rule is a rule rather
    // than a wall: the player can satisfy it. Same room, same rectangle, same
    // world plus ten wall segments.
    const world = ownedWorld();
    const rectangle = { x: 4, y: 4, width: 2, height: 3 };
    wallPerimeter(world, rectangle);
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    const outcome = zoning.zone({ roomCatalogId: 'room.cell', ...rectangle }, 9);

    expect(outcome).toMatchObject({ kind: 'zoned', enclosure: 'sealed', enclosureRequirement: 'enclosed' });
    expect(zoning.lastNotice).toEqual({ sequence: 1, tick: 9, enclosure: 'sealed', requirement: 'enclosed' });
  });

  it('refuses on the requirement and not on the answer: an open yard is still accepted', () => {
    // The scoping assertion, and the one that fails if somebody simplifies the
    // condition to `enclosure === 'open'`. `room.yard` is the single shipped
    // room authoring `outdoors`, a yard on open ground reads `open`, and it is
    // *correct*: `sealed` is a statement about walls and `outdoors` is a
    // statement about a roof, which this world does not model. The same
    // rectangle, drawn as a cell, is refused two lines down.
    const world = ownedWorld();
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    expect(
      zoning.zone({ roomCatalogId: 'room.yard', x: 0, y: 0, width: 8, height: 8 }, 0),
      'the one outdoors room must not be caught by an enclosed room\'s rule',
    ).toMatchObject({ kind: 'zoned', enclosure: 'open', enclosureRequirement: 'outdoors' });

    expect(
      zoning.zone({ roomCatalogId: 'room.canteen', x: 10, y: 0, width: 6, height: 6 }, 1),
      'while an enclosed room over equally open ground is refused',
    ).toMatchObject({ kind: 'refused', reason: 'not-enclosed' });
  });

  it('lets every cheaper refusal win: bounds, ownership and overlap are all decided first', () => {
    /*
     * The order of the checks, asserted rather than left to the comment that
     * states it. Each case below is *both* open and something else, so a
     * `not-enclosed` answer would mean enclosure had been moved ahead of that
     * check.
     *
     * The bounds case is the one that is about correctness rather than about
     * advice. `roomPerimeterEnclosure` reads the north edge of the row below
     * the rectangle and the west edge of the column to its right, and
     * `getTopEdge`/`getLeftEdge` answer 0 for a chunk that does not exist -- so
     * a rectangle reaching outside the materialised world always reads `open`,
     * and would be diagnosed with a gap on a tile that is not there.
     */
    const world = ownedWorld();

    // Out of bounds: chunk (1,0) does not exist, and the rectangle is open too.
    expect(
      new RoomZoningService(world, new RoomInstanceRegistry()).zone(
        { roomCatalogId: 'room.cell', x: 30, y: 0, width: 4, height: 3 },
        0,
      ),
    ).toMatchObject({ reason: 'out-of-bounds' });

    // Unowned: a loaded chunk the player does not own, and open.
    const unowned = new SparseWorld(CHUNK_SIZE);
    unowned.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    expect(
      new RoomZoningService(unowned, new RoomInstanceRegistry()).zone(
        { roomCatalogId: 'room.cell', x: 0, y: 0, width: 2, height: 3 },
        0,
      ),
    ).toMatchObject({ reason: 'unowned-land' });

    // Overlapping: a sealed room is zoned first, then a second rectangle that
    // covers one of its tiles and is itself open.
    const overlapped = ownedWorld();
    wallPerimeter(overlapped, { x: 0, y: 0, width: 2, height: 3 });
    const zoning = new RoomZoningService(overlapped, new RoomInstanceRegistry());
    expect(zoning.zone({ roomCatalogId: 'room.cell', x: 0, y: 0, width: 2, height: 3 }, 0).kind).toBe('zoned');
    expect(
      zoning.zone({ roomCatalogId: 'room.cell', x: 1, y: 2, width: 2, height: 3 }, 1),
    ).toMatchObject({ reason: 'overlaps-existing-room' });
  });

  it('counts designations rather than ticks, and carries no notice before the first one', () => {
    // Unchanged in what it asserts and changed in its fixture: the two rooms it
    // zones are walled first, because an unwalled cell is now refused and this
    // case is about the *ordinal*, not about enclosure. The middle call is
    // still a refusal -- a duplicate anchor -- so the sequence still has a
    // refusal to skip over, which is the whole point of it.
    const world = ownedWorld();
    wallPerimeter(world, { x: 0, y: 0, width: 2, height: 3 });
    wallPerimeter(world, { x: 4, y: 0, width: 2, height: 3 });
    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());

    expect(zoning.lastNotice, 'a session that has zoned nothing reports nothing').toBeUndefined();

    zoning.zone({ roomCatalogId: 'room.cell', x: 0, y: 0, width: 2, height: 3 }, 3);
    zoning.zone({ roomCatalogId: 'room.cell', x: 0, y: 0, width: 2, height: 3 }, 4); // refused: duplicate anchor
    zoning.zone({ roomCatalogId: 'room.cell', x: 4, y: 0, width: 2, height: 3 }, 5);

    // Two accepted designations, so the sequence is 2 and not 3: a refusal is
    // not a designation, and the notice's ordinal is what lets the main thread
    // tell a republished notice from a new one.
    expect(zoning.lastNotice).toEqual({ sequence: 2, tick: 5, enclosure: 'sealed', requirement: 'enclosed' });
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

describe('what the ruling costs: an open-plan room inside a sealed hall', () => {
  it('refuses a room drawn inside a larger sealed building, which is the rule and not a defect', () => {
    /*
     * **This case used to be called 'reports a room drawn inside a larger
     * sealed building as open, which is a false negative'**, and its comment
     * pinned the answer as *"a limitation, not correct behaviour ... exactly
     * why nothing refuses on the answer -- refusing here would block a
     * legitimate designation -- and it is the gap a region-level query would
     * close."*
     *
     * The world's answer is unchanged; what changed is what it means. Under
     * `enclosed` = "this room's own boundary is closed" this room is not an
     * enclosed room, and `zone` refuses it. So the case is kept, its geometry
     * is kept, and it now pins the *cost of the ruling* -- every room must be
     * walled -- instead of pinning a defect. Adjacent rooms may share a wall,
     * so that is subdivision rather than double-walling.
     *
     * `TopologyManager` is still the thing a topological reading would need:
     * it does region *detection*, exposes no enclosure query, and its
     * `update()` has no caller in `src/` at all, so `getTopologyId` answers 0
     * for every tile in a running session. Nothing waits on it any more, and
     * it is what a future *widening* would be built on.
     */
    const world = ownedWorld();
    const building = { x: 0, y: 0, width: 12, height: 12 };
    wallPerimeter(world, building);
    const inner = { x: 4, y: 4, width: 3, height: 3 }; // a room inside it, no partitions

    expect(roomPerimeterEnclosure(world, inner)).toMatchObject({ enclosure: 'open' });
    expect(
      roomPerimeterEnclosure(world, building),
      'the building itself is sealed, so the check is not simply broken',
    ).toEqual({ enclosure: 'sealed' });

    const zoning = new RoomZoningService(world, new RoomInstanceRegistry());
    expect(
      zoning.zone({ roomCatalogId: 'room.holding-cell', ...inner }, 0),
      'topologically indoors is not the question any more',
    ).toMatchObject({ kind: 'refused', reason: 'not-enclosed' });

    // And the way out of it, so the cost is bounded rather than absolute:
    // partition the inner room and the same rectangle is accepted.
    wallPerimeter(world, inner);
    expect(
      new RoomZoningService(world, new RoomInstanceRegistry()).zone(
        { roomCatalogId: 'room.holding-cell', ...inner },
        1,
      ),
    ).toMatchObject({ kind: 'zoned', enclosure: 'sealed' });
  });
});

/**
 * **Whether anybody can get in, which `RoomEnclosure` cannot answer** -- issue
 * #938.
 *
 * `roomPerimeterEnclosure` above answers `'sealed'` for two rooms that behave
 * completely differently, and the module's own header has said so since a
 * completed door order began writing `DOOR_EDGE_NUMERIC_ID` into the same edge
 * layer a wall writes into: *"a `'sealed'` answer no longer implies \"no way
 * in\""*. What #938 measured is that `'sealed'` was the only thing a player was
 * ever told -- `hud.rooms.enclosure-sealed`, "Walled in on every side",
 * rendered identically for a working shower room and one nobody could enter --
 * and `tests/integration/dead-room-no-doorway.test.ts` is the behavioural half
 * of that measurement.
 *
 * This block is the predicate. Three states, and the door is written the way a
 * completed `door-wooden` order writes it -- `DoorConstructionService` for the
 * registration and `DOOR_EDGE_NUMERIC_ID` into the edge layer -- through the
 * same service `finalizeConstruction` calls, so the fixture cannot register a
 * door the construction path would not have.
 */
describe('whether anything can cross a room perimeter (#938)', () => {
  /** A registry with a door where a completed `door-wooden` order would have put one. */
  function doorAt(world: SparseWorld, position: { readonly x: number; readonly y: number }, side: 'left' | 'top'): DoorRegistry {
    const doors = new DoorRegistry();
    expect(
      // `BuildEdge`'s spelling of the same two edges the registry keys as
      // `'top'`/`'left'`; `doorSideForBuildEdge` inside the service is what
      // maps between them, and going through it is what keeps this fixture on
      // the construction path rather than beside it.
      new DoorConstructionService(doors).onDoorOrderCompleted(
        'door-wooden',
        tile(position.x, position.y),
        side === 'top' ? 'north' : 'west',
      ),
      'the fixture must register the door it says it registers',
    ).toBe(true);
    if (side === 'top') world.setTopEdge(tile(position.x, position.y), DOOR_EDGE_NUMERIC_ID);
    else world.setLeftEdge(tile(position.x, position.y), DOOR_EDGE_NUMERIC_ID);
    return doors;
  }

  it('answers `gap` for a perimeter with a hole in it, without reading a door at all', () => {
    const world = ownedWorld();
    const room = { x: 4, y: 4, width: 3, height: 3 };
    wallPerimeter(world, room);
    // One segment of the south boundary taken back out: the north edge of the
    // row below, which is where the world stores it.
    world.setTopEdge(tile(4, 7), 0);

    expect(roomPerimeterEnclosure(world, room), 'the two answers must agree about the gap').toMatchObject({
      enclosure: 'open',
    });
    // A registry that throws if it is consulted, which is the assertion: an
    // open perimeter is crossable whatever the doors say, so the door read is
    // not merely unnecessary here, it must not happen.
    const refuses: RoomDoorReader = {
      getByEdge() {
        throw new Error('a rectangle with a gap in its perimeter must not need a door read');
      },
    };
    expect(roomPerimeterAccess(world, refuses, room)).toBe('gap');
  });

  it('answers `no-way-in` for a sealed perimeter with no door anywhere on it', () => {
    const world = ownedWorld();
    const room = { x: 4, y: 4, width: 3, height: 3 };
    wallPerimeter(world, room);

    expect(roomPerimeterEnclosure(world, room)).toEqual({ enclosure: 'sealed' });
    expect(roomPerimeterAccess(world, new DoorRegistry(), room)).toBe('no-way-in');
  });

  /*
   * **Every one of the `2 * (width + height)` perimeter edges, one at a time.**
   *
   * A single door on one side would pass against an implementation that walked
   * only that side, and against one that walked three sides out of four. The
   * cheapest thing this test can be wrong about is which edges belong to the
   * rectangle -- the south boundary is the row below's north edge and the east
   * boundary is the column to the right's west edge, which is the mistake
   * `wallRoomPerimeter`'s own header records two fixtures having made -- so the
   * assertion is over the whole set rather than a sample of it.
   */
  it('answers `doorway` for a door on any one of the twelve perimeter edges of a 3x3', () => {
    const room = { x: 4, y: 4, width: 3, height: 3 };
    const perimeter: readonly { readonly x: number; readonly y: number; readonly side: 'left' | 'top' }[] = [
      // North boundary: each tile's own north edge.
      { x: 4, y: 4, side: 'top' },
      { x: 5, y: 4, side: 'top' },
      { x: 6, y: 4, side: 'top' },
      // South boundary: the north edge of the row below.
      { x: 4, y: 7, side: 'top' },
      { x: 5, y: 7, side: 'top' },
      { x: 6, y: 7, side: 'top' },
      // West boundary: each tile's own west edge.
      { x: 4, y: 4, side: 'left' },
      { x: 4, y: 5, side: 'left' },
      { x: 4, y: 6, side: 'left' },
      // East boundary: the west edge of the column to the right.
      { x: 7, y: 4, side: 'left' },
      { x: 7, y: 5, side: 'left' },
      { x: 7, y: 6, side: 'left' },
    ];
    expect(perimeter, 'a 3x3 has 2 * (3 + 3) perimeter edges').toHaveLength(12);

    for (const edge of perimeter) {
      const world = ownedWorld();
      wallPerimeter(world, room);
      const doors = doorAt(world, edge, edge.side);
      expect(
        roomPerimeterEnclosure(world, room),
        `a door at ${String(edge.x)},${String(edge.y)} ${edge.side} keeps the perimeter sealed`,
      ).toEqual({ enclosure: 'sealed' });
      expect(
        roomPerimeterAccess(world, doors, room),
        `a door at ${String(edge.x)},${String(edge.y)} ${edge.side} is a way in`,
      ).toBe('doorway');
    }
  });

  it('reads no door outside the perimeter, so a neighbouring room’s door is not a way into this one', () => {
    const world = ownedWorld();
    const room = { x: 4, y: 4, width: 3, height: 3 };
    wallPerimeter(world, room);
    // One tile further out on every side than any edge of `room`: the north
    // edge of the row two below its bottom, which belongs to whatever is down
    // there and not to this rectangle.
    const doors = doorAt(world, { x: 4, y: 8 }, 'top');

    expect(roomPerimeterAccess(world, doors, room)).toBe('no-way-in');
  });

  /*
   * A locked door is still a door to this question, and that is the same policy
   * `buildNavigationGraph` applies -- it records a portal for a door
   * "regardless of its current lock state", and permission is checked later at
   * traversal time. A room whose only door is locked is a room with a way in
   * that some actors may not use, which is a different fact from a room with no
   * way in at all.
   */
  it('counts a locked door as a way in, because navigation does', () => {
    const world = ownedWorld();
    const room = { x: 4, y: 4, width: 3, height: 3 };
    wallPerimeter(world, room);
    const doors = doorAt(world, { x: 4, y: 7 }, 'top');
    const door = doors.getByEdge(tile(4, 7), 'top');
    expect(door, 'the fixture must have a door to lock').not.toBeUndefined();
    doors.setState(door!.id, 'locked');
    expect(doors.getById(door!.id)?.state).toBe('locked');

    expect(roomPerimeterAccess(world, doors, room)).toBe('doorway');
  });
});
