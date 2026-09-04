import { describe, expect, it } from 'vitest';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { roomInstanceIdFor } from '../../src/simulation/rooms/zoning';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { wallRoomPerimeter } from '../helpers/room-walls';
import { RoomInstanceRegistry, type RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';
import { buildContentRegistry } from '../../src/content/registry';
import type { RoomCatalogDefinition } from '../../src/content/room-catalog';
import {
  projectRoomDetail,
  projectRoomList,
  type RoomDetailViewModel,
  type RoomListViewModel,
} from '../../src/simulation/presentation/room-projection';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { compareStableIds } from '../../src/simulation/presentation/view-model';
import { placedObjectAt } from '../../src/simulation/objects';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { SCENARIO_SEED } from '../helpers/determinism-scenario';
import { ROOM_NEEDS_ROOMS_LIMIT } from '../../src/ui/hud';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';
import {
  RoomNeedsReader,
  roomNeedsFromProjections,
  unfinishedRoomIds,
} from '../../src/ui/simulation-room-needs';

/**
 * What the Rooms panel is told about the rooms that are not finished.
 *
 * Every view model here is produced by the **real** projections over a real
 * `RoomInstanceRegistry` and the shipped catalogues, never hand-written: a
 * mapping asserted against a fixture of the shape the projection is *hoped* to
 * have proves only that the fixture and the assertion agree, which is the rule
 * `tests/unit/hud-projections.test.ts` states for the layer this reads from.
 * The verdict under test -- `'missing-capability'` -- is therefore the one
 * `projectRoomDetail` really computes from `room.cell`'s authored requirements
 * and the instance's derived capabilities, and a change to that rule fails here
 * rather than being mirrored by a copy in this file.
 */

const CELL = 'room.cell';

/** A zoned cell with whatever objects are standing in it, as the registry holds one. */
function cell(x: number, y: number, capabilities: readonly string[]): RoomInstance {
  return {
    instanceId: roomInstanceIdFor(CELL, { x: tileCoordinate(x), y: tileCoordinate(y) }),
    roomCatalogId: CELL,
    anchorTile: { x: tileCoordinate(x), y: tileCoordinate(y) },
    width: 2,
    height: 3,
    residentCapacity: capabilities.includes('sleep-surface') ? 1 : 0,
    concurrentUseCapacity: 0,
    objectCapabilities: [...capabilities],
  };
}

function registryOf(...instances: readonly RoomInstance[]): { readonly roomInstances: RoomInstanceRegistry } {
  const roomInstances = new RoomInstanceRegistry();
  for (const instance of instances) roomInstances.register(instance);
  return { roomInstances };
}

/**
 * The real list, and the real details for as many rooms as `RoomNeedsReader`
 * would actually have asked about.
 *
 * The `slice` is `read()`'s own budget and not a convenience: that method spends
 * at most `ROOM_NEEDS_ROOMS_LIMIT` detail requests, so handing
 * `roomNeedsFromProjections` details for *every* unfinished room would test it
 * against input the reader never produces. It is a helper mimicking a contract,
 * which is only safe because the contract is asserted separately and against the
 * real class -- "asks for the list with no window of its own, then for the
 * unfinished room by id" below counts the messages the reader really sends.
 * Without that test this helper would be a fixture agreeing with whatever the
 * reader happened to do.
 */
function project(source: { readonly roomInstances: RoomInstanceRegistry }): {
  readonly list: RoomListViewModel;
  readonly details: readonly RoomDetailViewModel[];
} {
  const list = projectRoomList(source);
  const details: RoomDetailViewModel[] = [];
  for (const id of unfinishedRoomIds(list).slice(0, ROOM_NEEDS_ROOMS_LIMIT)) {
    const detail = projectRoomDetail(source, id);
    if (detail !== undefined) details.push(detail);
  }
  return { list, details };
}

describe('what the interface is told a zoned room is missing', () => {
  it('reads the simulation own verdict, and names the object the catalogue does', () => {
    // An empty cell: `room.cell` authors an `object` requirement for a bed and
    // one for a toilet, and nothing is standing in this rectangle.
    const source = registryOf(cell(4, 4, []));
    const { list, details } = project(source);

    // The premise, asserted rather than assumed: the projection really does
    // call this room unfinished, and really does name the objects.
    expect(list.rooms.rows[0]?.requirementSummary.missingCapability).toBe(2);
    expect(
      details[0]?.requirements
        .filter((requirement) => requirement.status === 'missing-capability')
        .map((requirement) => requirement.objectNameKey),
    ).toEqual(['object.bed.name', 'object.toilet.name']);

    const needs = roomNeedsFromProjections(list, details);
    expect(needs.unfinishedRooms).toBe(1);
    expect(needs.totalRooms).toBe(1);
    expect(needs.totalNeeds).toBe(2);
    /*
     * **Both objects**, where this asserted only the bed until #529. The readout
     * named one thing for the whole prison and left "and {count} more" as the
     * entire account of the rest -- and there was no surface anywhere in the
     * application that enumerated them.
     *
     * Neither carries a `missingQuantity`, and that is the *uncounted* path
     * rather than an omission: `project()` above passes no `placedObjects`, so
     * the projection answers from the instance's derived capability list -- the
     * pre-#528 test, which never consults `minQuantity` and so cannot support a
     * subtraction. `toEqual` is exact about extra properties, so a quantity
     * invented here fails this assertion. The counted path is a separate test
     * below over a really furnished canteen, because a suite that only ever ran
     * this path could not see a wrong quantity at all.
     */
    expect(needs.needs).toEqual([
      {
        kind: 'object',
        instanceId: 'room.cell:4:4',
        roomLabelKey: 'room.cell.name',
        tile: { x: 4, y: 4 },
        objectLabelKey: 'object.bed.name',
      },
      {
        kind: 'object',
        instanceId: 'room.cell:4:4',
        roomLabelKey: 'room.cell.name',
        tile: { x: 4, y: 4 },
        objectLabelKey: 'object.toilet.name',
      },
    ]);
  });

  it('says nothing is missing when the simulation says nothing is', () => {
    // The case that decides whether this feature is furniture. A cell with both
    // capabilities standing in it satisfies both `object` requirements, so the
    // verdict is empty -- and the readout has to be empty with it, or the panel
    // grows a permanent block saying all is well.
    const source = registryOf(cell(4, 4, ['sleep-surface', 'sanitation']));
    const { list, details } = project(source);

    expect(list.rooms.rows[0]?.requirementSummary.missingCapability).toBe(0);
    expect(unfinishedRoomIds(list)).toEqual([]);
    expect(details).toEqual([]);

    expect(roomNeedsFromProjections(list, details)).toEqual({
      unfinishedRooms: 0,
      totalRooms: 1,
      totalNeeds: 0,
      needs: [],
    });
  });

  it('counts every unfinished room, and describes the one nearest to finished completely', () => {
    const source = registryOf(cell(2, 2, []), cell(4, 4, ['sleep-surface']), cell(6, 6, ['sleep-surface', 'sanitation']));
    const { list, details } = project(source);

    const needs = roomNeedsFromProjections(list, details);
    // Two rooms are unfinished out of three, and between them they want three
    // things: two in the empty cell and one in the cell with only a bed.
    expect(needs.unfinishedRooms).toBe(2);
    expect(needs.totalRooms).toBe(3);
    expect(needs.totalNeeds).toBe(3);

    /*
     * **The cell at 4,4 and everything it is short**, which is one thing.
     *
     * Two assertions in one, and both are #529's:
     *
     * - `ROOM_NEEDS_ROOMS_LIMIT` rooms are described, not `ROOM_NEEDS_NAMED_LIMIT`
     *   needs. Every entry belongs to a single room, so the panel can head the
     *   list with that room and count its own remainder honestly instead of
     *   subtracting from a prison-wide total.
     * - The room is the one **nearest to finished** -- 4,4 already has its bed
     *   and wants only a toilet -- and not 2,2, which is the lower instance id
     *   and was what the old ascending-id order named. A player reading this is
     *   trying to finish something, and 4,4 is one build away.
     *
     * The old assertion here was `toHaveLength(ROOM_NEEDS_NAMED_LIMIT)` with
     * `needs[0]?.instanceId === 'room.cell:2:2'`, and it passed for both of the
     * reasons this one refuses.
     */
    expect(needs.needs.map((need) => [need.instanceId, need.objectLabelKey])).toEqual([
      ['room.cell:4:4', 'object.toilet.name'],
    ]);
  });

  it('names the room nearest to finished, and moves on when that room is finished', () => {
    /*
     * The behaviour the ordering exists for, over two prisons rather than one
     * assertion about a sort. A player who builds the toilet in 4,4 should see
     * the readout move to the next-cheapest room -- not sit on the same room, and
     * not go back to the one they have been stuck on longest.
     */
    const before = registryOf(cell(2, 2, []), cell(4, 4, ['sleep-surface']));
    const after = registryOf(cell(2, 2, []), cell(4, 4, ['sleep-surface', 'sanitation']));
    const named = (source: { readonly roomInstances: RoomInstanceRegistry }): string | undefined => {
      const { list, details } = project(source);
      return roomNeedsFromProjections(list, details).needs[0]?.instanceId;
    };
    expect(named(before)).toBe('room.cell:4:4');
    expect(named(after)).toBe('room.cell:2:2');
  });

  it('breaks a tie on the projection own comparator, not on registration order', () => {
    /*
     * Two equally unfinished rooms, registered highest-id first and lowest-id
     * first. Which one is named must be a property of the projection rather than
     * of the order the player happened to zone them in, so the readout is the
     * same for the same prison however it was built.
     *
     * **The expected order is computed with the simulation's own
     * `compareStableIds`**, which `unfinishedRoomIds` may not import -- this
     * module is pinned `kind: 'type-only'` against the simulation tree in
     * `ui-orchestration-boundaries.test.ts`, so it carries a second declaration
     * of that comparator. A test is allowed to import both, which is what makes
     * this the place the two are held together, exactly as `MAX_ROOM_SIDE_TILES`
     * is held against `MAX_ZONE_DIMENSION_TILES` in
     * `ui-hud-rooms-panel.test.ts`. The expectation is not a literal: it is the
     * *other* implementation's answer, so the two cannot drift apart silently.
     */
    const backwards = registryOf(cell(9, 9, []), cell(2, 2, []));
    const forwards = registryOf(cell(2, 2, []), cell(9, 9, []));
    const expected = ['room.cell:9:9', 'room.cell:2:2'].sort(compareStableIds);
    expect(expected).toEqual(['room.cell:2:2', 'room.cell:9:9']); // the premise, not the assertion
    for (const source of [backwards, forwards]) {
      expect(unfinishedRoomIds(projectRoomList(source))).toEqual(expected);
    }
  });

  it('carries the shortfall, which is not the quantity the room asks for', () => {
    /*
     * **The test the rest of this file could not have failed.** Every other case
     * here drives a projection with no `placedObjects`, so `satisfyingQuantity`
     * is absent and no quantity is ever computed -- a wrong subtraction, or a
     * `minQuantity` rendered where a shortfall belongs, is invisible to all of
     * them. `docs/AGENT_WORKFLOW.md` §3: ask what a green suite could not see.
     *
     * The prison is #528's own: `room.canteen` authors two dining tables and
     * four benches, and one of each is standing in it. So the two numbers a
     * confusion could pick from are **different on both requirements**:
     *
     *     dining table   asks for 2, holds 1  ->  short 1
     *     bench          asks for 4, holds 1  ->  short 3
     *
     * An implementation reporting `minQuantity` gives 2 and 4; one reporting the
     * count gives 1 and 1; one that subtracts backwards gives -1 and -3. Only
     * the shortfall gives 1 and 3, and it is what the player has to build.
     *
     * Real runtime, real `PlacedObject` rows, real catalogue -- nothing here
     * hand-writes a projection.
     */
    const runtime = createNewSimulationRuntime(SCENARIO_SEED);
    const anchor = { x: tileCoordinate(8), y: tileCoordinate(8) };
    runtime.prisoners.roomInstances.register({
      instanceId: 'room.canteen:8:8',
      roomCatalogId: 'room.canteen',
      anchorTile: anchor,
      width: 6,
      height: 6,
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    for (const [objectId, x, y] of [
      ['object.dining-table', 8, 8],
      ['object.bench', 8, 11],
    ] as const) {
      const placed = runtime.placedObjects.place(
        placedObjectAt(objectId, { x: tileCoordinate(x), y: tileCoordinate(y) }, 0),
      );
      if (!placed) throw new Error(`the fixture's ${objectId} at (${String(x)}, ${String(y)}) must be placeable`);
    }
    runtime.roomCapacity.resolveAll();

    const options = { placedObjects: runtime.placedObjects };
    const list = projectRoomList(runtime.prisoners, {}, options);
    const detail = projectRoomDetail(runtime.prisoners, 'room.canteen:8:8', options);
    if (detail === undefined) throw new Error('the fixture room must project a detail');

    // The premise, asserted rather than assumed: the projection really counted,
    // and the two figures really are the ones above.
    expect(
      detail.requirements
        .filter((requirement) => requirement.type === 'object')
        .map((requirement) => [requirement.objectId, requirement.minQuantity, requirement.satisfyingQuantity]),
    ).toEqual([
      ['object.dining-table', 2, 1],
      ['object.bench', 4, 1],
    ]);

    const needs = roomNeedsFromProjections(list, [detail]);
    expect(needs.needs.map((need) => [need.objectLabelKey, need.missingQuantity])).toEqual([
      ['object.dining-table.name', 1],
      ['object.bench.name', 3],
    ]);
  });

  it('reports no quantity at all when the simulation was given nothing to count', () => {
    /*
     * The same canteen, projected without `placedObjects`. The projection then
     * answers from the instance's derived capability list, which never consulted
     * `minQuantity` -- so there is no subtraction to be made and the readout must
     * carry no numeral rather than a plausible one.
     *
     * This is the state the panel renders with `roomsNeedsObjectUncounted`, and
     * it is asserted here because "absent" and "1" are indistinguishable to a
     * player once a number reaches the screen. `toEqual` on the whole entry is
     * what makes an invented property fail.
     */
    const source = registryOf(cell(4, 4, []));
    const list = projectRoomList(source);
    const detail = projectRoomDetail(source, 'room.cell:4:4');
    if (detail === undefined) throw new Error('the fixture room must project a detail');

    expect(detail.requirements.every((requirement) => requirement.satisfyingQuantity === undefined)).toBe(true);
    for (const need of roomNeedsFromProjections(list, [detail]).needs) {
      expect(need).not.toHaveProperty('missingQuantity');
    }
  });

  it('carries no object key for a requirement the object catalogue cannot name', () => {
    // The only way `projectRoomDetail` reports a requirement as unmet with no
    // `objectNameKey`: the room asks for an object id the catalogue does not
    // define, which is *why* the requirement can never be satisfied. Driven
    // through the real projection with a one-room catalogue rather than by
    // hand, so the branch under test is the projection's own.
    const source = registryOf({
      instanceId: 'room.ghost:0:0',
      roomCatalogId: 'room.ghost',
      anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    const { registry: rooms } = buildContentRegistry<RoomCatalogDefinition>([
      {
        schemaVersion: 1,
        id: 'room.ghost',
        numericId: 900,
        nameKey: 'room.ghost.name',
        category: 'housing',
        requirements: [{ type: 'object', objectId: 'object.nonexistent', minQuantity: 1 }],
      },
    ]);
    const list = projectRoomList(source, {}, { rooms });
    const detail = projectRoomDetail(source, 'room.ghost:0:0', { rooms });
    expect(detail?.requirements[0]?.status).toBe('missing-capability');
    expect(detail?.requirements[0]?.objectNameKey).toBeUndefined();

    const needs = roomNeedsFromProjections(list, detail === undefined ? [] : [detail]);
    expect(needs.needs).toEqual([
      { kind: 'object', instanceId: 'room.ghost:0:0', roomLabelKey: 'room.ghost.name', tile: { x: 0, y: 0 } },
    ]);
    // Absent, not present-and-`undefined`: `exactOptionalPropertyTypes` is on,
    // and the panel branches on the key being there at all.
    expect(Object.hasOwn(needs.needs[0] ?? {}, 'objectLabelKey')).toBe(false);
  });
});

/**
 * **A room nobody can get into is a room that is not finished** -- issue #938.
 *
 * The projection's `access` verdict, carried into the readout as a
 * `kind: 'doorway'` entry. Both halves matter and they are asserted apart:
 * that a doorless room is *counted* as unfinished even when it is short of
 * nothing else, and that when it is short of something else as well, the
 * doorway is named **first**.
 *
 * The ordering is not taste. `ROOM_NEEDS_NAMED_LIMIT` is 4, so a room short of
 * four objects would push the doorway line into the "and 1 more" remainder --
 * and it is the one line that makes the other four pointless, because nothing
 * can be carried into a room nobody can enter.
 *
 * The world and the doors are the real `SparseWorld` and the real
 * `DoorRegistry`, walled through the same helper the integration fixtures use,
 * for this file's own stated reason: a hand-written stand-in for the perimeter
 * would prove only that the stand-in and the assertion agree.
 */
describe('a room with no way into it (#938)', () => {
  const CHUNK_SIZE = 32;

  /** A world owning one chunk, so the edge writes below land somewhere. */
  function ownedWorld(): SparseWorld {
    const world = new SparseWorld(CHUNK_SIZE);
    const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    world.load(origin);
    world.setOwned(origin, true);
    return world;
  }

  /** The list and the details, projected with the perimeter question asked. */
  function projectWithWalls(
    source: { readonly roomInstances: RoomInstanceRegistry },
    world: SparseWorld,
    doors: DoorRegistry,
  ): { readonly list: RoomListViewModel; readonly details: readonly RoomDetailViewModel[] } {
    const options = { perimeter: { edges: world, doors } };
    const list = projectRoomList(source, {}, options);
    const details: RoomDetailViewModel[] = [];
    for (const id of unfinishedRoomIds(list).slice(0, ROOM_NEEDS_ROOMS_LIMIT)) {
      const detail = projectRoomDetail(source, id, options);
      if (detail !== undefined) details.push(detail);
    }
    return { list, details };
  }

  it('counts a furnished room with no door as unfinished, and says a door is what it is short', () => {
    // A cell with both of its objects, so `missingCapability` is 0 and every
    // readout that existed before #938 was silent about it.
    const source = registryOf(cell(4, 4, ['sleep-surface', 'sanitation']));
    const world = ownedWorld();
    wallRoomPerimeter(world, { x: 4, y: 4, width: 2, height: 3 });
    const { list, details } = projectWithWalls(source, world, new DoorRegistry());

    // The premise: the requirement verdict really is clean, so nothing below
    // is riding on an unmet object.
    expect(list.rooms.rows[0]?.requirementSummary.missingCapability).toBe(0);
    expect(list.rooms.rows[0]?.access).toBe('no-way-in');

    const needs = roomNeedsFromProjections(list, details);
    expect(needs).toEqual({
      unfinishedRooms: 1,
      totalRooms: 1,
      totalNeeds: 1,
      needs: [
        {
          kind: 'doorway',
          instanceId: 'room.cell:4:4',
          roomLabelKey: 'room.cell.name',
          tile: { x: 4, y: 4 },
        },
      ],
    });
  });

  it('names the doorway before the objects, because nothing can be carried into a room nobody can enter', () => {
    // An empty cell -- two unmet object requirements -- that is also sealed
    // shut. Three things short, and the order is the assertion.
    const source = registryOf(cell(4, 4, []));
    const world = ownedWorld();
    wallRoomPerimeter(world, { x: 4, y: 4, width: 2, height: 3 });
    const { list, details } = projectWithWalls(source, world, new DoorRegistry());

    const needs = roomNeedsFromProjections(list, details);
    expect(needs.totalNeeds, 'two objects and one door').toBe(3);
    expect(needs.needs.map((need) => need.kind)).toEqual(['doorway', 'object', 'object']);
    expect(needs.needs.map((need) => need.objectLabelKey)).toEqual([
      undefined,
      'object.bed.name',
      'object.toilet.name',
    ]);
  });

  /*
   * **The third state, and it was a surviving mutation.** Making this branch
   * answer `'no-way-in'` instead of absent -- so an instance with no recorded
   * rectangle reported a room nobody can enter -- passed 298 tests across the
   * unit, integration, contract and determinism suites. Nothing pinned it,
   * which is the same shape as #529's optional field: a state no assertion
   * reaches is a state that can be invented.
   *
   * What it would have cost is a readout telling a player to build a door into
   * a room whose walls this projection cannot find, on a V4 save, with no way
   * to act on it.
   */
  it('answers nothing at all for an instance with no rectangle, rather than calling it sealed shut', () => {
    const roomInstances = new RoomInstanceRegistry();
    // A V4 save's shape: registered, and carrying no `width`/`height` at all.
    roomInstances.register({
      instanceId: 'room.cell:9:9',
      roomCatalogId: CELL,
      anchorTile: { x: tileCoordinate(9), y: tileCoordinate(9) },
      residentCapacity: 1,
      concurrentUseCapacity: 0,
      objectCapabilities: ['sleep-surface', 'sanitation'],
    });
    const world = ownedWorld();
    const { list, details } = projectWithWalls({ roomInstances }, world, new DoorRegistry());

    // Absent, not present-and-`undefined`, and not a verdict: the projection
    // has no rectangle to walk and may not answer as though it had.
    expect(Object.hasOwn(list.rooms.rows[0] ?? {}, 'access')).toBe(false);
    expect(roomNeedsFromProjections(list, details)).toEqual({
      unfinishedRooms: 0,
      totalRooms: 1,
      totalNeeds: 0,
      needs: [],
    });
  });

  /*
   * **The prison `tests/browser/app-shell.spec.ts` builds, projected here
   * because that spec cannot be run in this container.**
   *
   * That test walls two `room.cell` rectangles with a `wall-brick` on every
   * perimeter segment and no door, places nothing in either, and asserts what
   * the panel draws. This is the same prison through the same reader, so the
   * figures the spec expects are established somewhere a `vitest` run can
   * reach them: `data-needs` is `totalNeeds`, and the lines drawn are the
   * needs of the one room `ROOM_NEEDS_ROOMS_LIMIT` allows the reader to ask
   * about.
   *
   * It is not a substitute for that spec -- only the assembled page can say
   * whether five lines still sit inside the Rooms panel's unscrolled fold at
   * 900x600 -- and it is not a fixture agreeing with an assertion either:
   * every number here comes out of the real projections over a real world.
   */
  it('reports six things short for two sealed, empty cells, and names one room three lines deep', () => {
    const source = registryOf(cell(4, 4, []), cell(10, 10, []));
    const world = ownedWorld();
    wallRoomPerimeter(world, { x: 4, y: 4, width: 2, height: 3 });
    wallRoomPerimeter(world, { x: 10, y: 10, width: 2, height: 3 });
    const { list, details } = projectWithWalls(source, world, new DoorRegistry());

    const needs = roomNeedsFromProjections(list, details);
    expect(needs.unfinishedRooms, 'both cells are unfinished').toBe(2);
    expect(needs.totalRooms).toBe(2);
    // A door, a bed and a toilet, twice over -- the `data-needs` the panel
    // publishes and `app-shell.spec.ts` reads.
    expect(needs.totalNeeds).toBe(6);
    // And one room's worth of lines, in the order the panel draws them.
    expect(details).toHaveLength(ROOM_NEEDS_ROOMS_LIMIT);
    // `room.cell:10:10` and not `room.cell:4:4`: the two rooms are short the
    // same three things, so the tie breaks on `compareInstanceIds`, which is a
    // code-unit comparison -- `'1' < '4'` -- and is `rows`' own published
    // order rather than a second opinion about it.
    expect(needs.needs.map((need) => need.instanceId)).toEqual([
      'room.cell:10:10',
      'room.cell:10:10',
      'room.cell:10:10',
    ]);
    expect(needs.needs.map((need) => need.kind)).toEqual(['doorway', 'object', 'object']);
  });

  it('says nothing about a room with a door in its wall, which is the sample that refutes the other two', () => {
    const source = registryOf(cell(4, 4, ['sleep-surface', 'sanitation']));
    const world = ownedWorld();
    const doors = new DoorRegistry();
    // The same helper, with a door: it writes what a completed `door-wooden`
    // order writes, on the rectangle's south boundary.
    wallRoomPerimeter(world, { x: 4, y: 4, width: 2, height: 3 }, { doors });
    const { list, details } = projectWithWalls(source, world, doors);

    expect(list.rooms.rows[0]?.access).toBe('doorway');
    expect(roomNeedsFromProjections(list, details)).toEqual({
      unfinishedRooms: 0,
      totalRooms: 1,
      totalNeeds: 0,
      needs: [],
    });
  });
});


// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

class FakeChannel implements ProjectionMessageChannel {
  public readonly sent: MainToWorkerMessage[] = [];
  private handler: ((message: WorkerToMainMessage) => void) | undefined;

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public deliver(message: WorkerToMainMessage): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    this.handler(message);
  }

  public idOf(index: number): string {
    return (this.sent[index] as { messageId: string }).messageId;
  }

  public payloadOf(index: number): Record<string, unknown> {
    return (this.sent[index] as { payload: Record<string, unknown> }).payload;
  }
}

const reply = (replyTo: string, projectionId: string, data: unknown): WorkerToMainMessage =>
  ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `reply-${replyTo}`,
    replyTo,
    kind: 'simulation/projection',
    payload: {
      projectionId,
      tick: 7,
      view: {
        transport: 'structured-clone' as const,
        schemaId: `lockstate.hud-view-model.${projectionId.replace('hud/', '')}`,
        schemaVersion: 1,
        data,
      },
    },
  }) as WorkerToMainMessage;

/** Lets a test act between the two requests one `read()` makes. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('the reader that asks the worker what the rooms are missing', () => {
  it('asks for the list with no window of its own, then for the unfinished room by id', async () => {
    const source = registryOf(cell(4, 4, []));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();

    // No `offset` and no `limit`: the projection's own default window is the
    // right one, and naming a number here would copy a simulation bound onto
    // this side of the boundary.
    expect(channel.payloadOf(0)).toEqual({ projectionId: 'hud/room-list' });
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();

    // The detail request names the instance the *list* said was unfinished --
    // this thread chooses no room of its own.
    expect(channel.payloadOf(1)).toEqual({
      projectionId: 'hud/room-detail',
      target: { kind: 'id', id: 'room.cell:4:4' },
    });
    channel.deliver(reply(channel.idOf(1), 'hud/room-detail', projectRoomDetail(source, 'room.cell:4:4')));

    await expect(pending).resolves.toEqual({
      unfinishedRooms: 1,
      totalRooms: 1,
      totalNeeds: 2,
      // Both of the cell's unmet requirements come back from the one detail
      // request, which is the point of the split between "rooms to ask about"
      // and "lines to draw": one message, the room's whole shopping list.
      needs: [
        {
          kind: 'object',
          instanceId: 'room.cell:4:4',
          roomLabelKey: 'room.cell.name',
          tile: { x: 4, y: 4 },
          objectLabelKey: 'object.bed.name',
        },
        {
          kind: 'object',
          instanceId: 'room.cell:4:4',
          roomLabelKey: 'room.cell.name',
          tile: { x: 4, y: 4 },
          objectLabelKey: 'object.toilet.name',
        },
      ],
    });
  });

  it('asks for no detail at all when every room is finished', async () => {
    // One message, not two. The list already answers "nothing is missing", and
    // a detail request for a room with nothing to report is a round trip spent
    // on a question already answered.
    const source = registryOf(cell(4, 4, ['sleep-surface', 'sanitation']));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));

    await expect(pending).resolves.toEqual({ unfinishedRooms: 0, totalRooms: 1, totalNeeds: 0, needs: [] });
    expect(channel.sent).toHaveLength(1);
  });

  it('refuses to stack a second question on a cadence, and leaves the readout alone', async () => {
    // The counts channel publishes up to twice a second and this rides it, so
    // the answer that matters is what a *second* call does while the first is
    // still out: nothing at all, and `undefined` rather than a throw, because
    // the caller is a listener and not a player pressing something.
    const source = registryOf(cell(4, 4, []));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const first = reader.read();
    await settle();
    await expect(reader.read()).resolves.toBeUndefined();
    expect(channel.sent, 'a second read while one was in flight sent another request').toHaveLength(1);

    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();
    channel.deliver(reply(channel.idOf(1), 'hud/room-detail', projectRoomDetail(source, 'room.cell:4:4')));
    await expect(first).resolves.toBeDefined();

    // And the guard lifts: the next publication really does ask again.
    const second = reader.read();
    await settle();
    expect(channel.sent).toHaveLength(3);
    channel.deliver(reply(channel.idOf(2), 'hud/room-list', list));
    await settle();
    channel.deliver(reply(channel.idOf(3), 'hud/room-detail', projectRoomDetail(source, 'room.cell:4:4')));
    await expect(second).resolves.toBeDefined();
  });

  it('drops a room that went away between the two requests rather than failing the read', async () => {
    // The race `ProjectionReply.view` names: a detail projection asked about a
    // target that no longer exists answers with no view. Unzoning is a gesture
    // the player has, so this is reachable rather than defensive -- and the
    // header's counts still come from the list, which is what the player sees.
    const source = registryOf(cell(4, 4, []));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();
    channel.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-gone',
      replyTo: channel.idOf(1),
      kind: 'simulation/projection',
      payload: { projectionId: 'hud/room-detail', tick: 7 },
    } as WorkerToMainMessage);

    await expect(pending).resolves.toEqual({
      unfinishedRooms: 1,
      totalRooms: 1,
      totalNeeds: 2,
      needs: [],
    });
  });

  it('spends its budget in requests as well as in needs, so a prison of raced rooms is not a burst', async () => {
    /*
     * The bound `RoomNeedsReader.read` states -- "at most `1 +
     * ROOM_NEEDS_NAMED_LIMIT` messages" -- was a statement about *needs named*,
     * and the loop advanced that counter only from a detail that came back with
     * a view. So the two cases the method's own next paragraph calls expected --
     * a room unzoned between the list and the detail, and a room finished
     * between them -- left the counter where it was and the loop asked about the
     * next room, and the next, for as many unfinished rooms as the list held.
     * The real bound was `1 + unfinishedRoomIds(list).length`, on a reader the
     * Rooms tab drives on the counts cadence.
     *
     * Eight unfinished cells, every detail answered the way the race answers.
     * The figures are literals rather than `1 + ROOM_NEEDS_NAMED_LIMIT`: the
     * claim under test is the *shape* of the bound, and an expectation written
     * from the reader's own budget would hold whichever quantity it counted,
     * which is the self-comparison `docs/TESTING.md` names. Before this was
     * pinned the same trace sent 9.
     */
    const source = registryOf(
      cell(0, 0, []),
      cell(4, 0, []),
      cell(8, 0, []),
      cell(12, 0, []),
      cell(0, 4, []),
      cell(4, 4, []),
      cell(8, 4, []),
      cell(12, 4, []),
    );
    const { list } = project(source);
    expect(unfinishedRoomIds(list)).toHaveLength(8);

    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();

    // Answer whatever it asks, until it stops asking. The ceiling is a guard
    // against a loop that never terminates, not part of the claim.
    let answered = 1;
    while (answered < channel.sent.length && answered < 32) {
      channel.deliver({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: `reply-gone-${String(answered)}`,
        replyTo: channel.idOf(answered),
        kind: 'simulation/projection',
        payload: { projectionId: 'hud/room-detail', tick: 7 },
      } as WorkerToMainMessage);
      answered += 1;
      await settle();
    }

    await expect(pending).resolves.toBeDefined();
    // One list and one detail: the panel can name one thing, so the reader
    // spends one question on finding it and reports what it has.
    expect(channel.sent).toHaveLength(2);
  });

  it('rejects when the worker refuses, so the host can take the readout off', async () => {
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-error',
      replyTo: channel.idOf(0),
      kind: 'protocol/error',
      payload: { code: 'invalid-payload', message: 'no' },
    } as WorkerToMainMessage);

    await expect(pending).rejects.toThrow(/invalid-payload/);

    // And the in-flight guard is released by the failure, or one refusal would
    // silence the readout for the rest of the session.
    const again = reader.read();
    await settle();
    expect(channel.sent).toHaveLength(2);
    reader.dispose();
    await expect(again).rejects.toThrow(/disposed/);
  });
});
