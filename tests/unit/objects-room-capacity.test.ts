import { describe, expect, it } from 'vitest';
import {
  deriveRoomCapacity,
  placedObjectAt,
  PlacedObjectRegistry,
  RoomCapacityResolver,
  roomBoundsOf,
  roomContains,
  roomInstanceContaining,
} from '../../src/simulation/objects';
import { RoomInstanceRegistry, type RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';

/**
 * The rule [ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 2 states, and the property that makes it worth stating: **no number
 * is authored anywhere.**
 *
 * Every figure below is read off a `footprint` in
 * `src/content/object-catalog.ts` -- a bed is 1 wide so it holds one, a dining
 * table is 3 wide so it seats three -- and there is no occupancy field on a room
 * definition, no constant in the resolver and no literal in any content file
 * that says how many a cell holds. The two rejected options in that ADR would
 * both have put one there.
 */

const TILE = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/**
 * `overrides` widens the two optional fields to accept `undefined` explicitly,
 * because `exactOptionalPropertyTypes` is on and "no rectangle" -- the shape a
 * V4 save produces -- is a case two tests below have to be able to construct.
 * The spread then drops the keys, so the instance really has no `width` rather
 * than a `width` holding `undefined`.
 */
function instance(
  overrides: Partial<Omit<RoomInstance, 'width' | 'height'>> & { width?: number | undefined; height?: number | undefined } = {},
): RoomInstance {
  const merged = {
    instanceId: 'cell-1',
    roomCatalogId: 'room.cell',
    anchorTile: TILE(4, 6),
    width: 2 as number | undefined,
    height: 3 as number | undefined,
    residentCapacity: 0,
    concurrentUseCapacity: 0,
    objectCapabilities: [] as readonly string[],
    ...overrides,
  };
  const { width, height, ...rest } = merged;
  return {
    ...rest,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
}

/** A world owning chunk (0,0), so `getZoning` can be painted and read. */
function ownedWorld(): SparseWorld {
  const world = new SparseWorld(32);
  const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(origin);
  world.setOwned(origin, true);
  return world;
}

const CANTEEN_OBJECTS = [
  placedObjectAt('object.dining-table', TILE(0, 0), 0),
  placedObjectAt('object.dining-table', TILE(4, 0), 0),
  placedObjectAt('object.bench', TILE(0, 4), 0),
  placedObjectAt('object.bench', TILE(3, 4), 0),
  placedObjectAt('object.bench', TILE(6, 4), 0),
  placedObjectAt('object.bench', TILE(9, 4), 0),
];

describe('the capacities a set of objects produces', () => {
  it('sums footprint width per capability, and counts only sleep surfaces toward residency', () => {
    // A cell with one bed holds 1, and one actor can use it for the one thing a
    // bed is for. Nothing said so -- `object.bed` is `{ width: 1, height: 2 }`
    // and its capabilities are `['sleep-surface']`.
    expect(deriveRoomCapacity([placedObjectAt('object.bed', TILE(0, 0), 0)])).toEqual({
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['sleep-surface', 1]],
      objectCapabilities: ['sleep-surface'],
    });

    // ADR 0028's worked canteen: two dining tables and four benches. It houses
    // nobody -- neither a table nor a bench is a sleep surface -- and it seats
    // **six** diners, not fourteen.
    //
    // Fourteen is `2*3 + 4*2`, the all-objects total, and it is what that ADR's
    // decision 2 said before its #326 amendment. `object.dining-table` declares
    // `['dining']`; `object.bench` declares `['seating', 'recreation']` and
    // **not** `'dining'`. `action.eat-meal` requires `'dining'`. So the ceiling
    // that gate applies is the tables' `2*3 = 6`, and the benches bound
    // `'seating'` and `'recreation'` at 8 apiece instead. Whether a bench ought
    // to declare `'dining'` -- `room.canteen` requires four of them -- is the
    // content question that amendment names and leaves open; this test pins what
    // the catalogue actually says today.
    expect(deriveRoomCapacity(CANTEEN_OBJECTS)).toEqual({
      residentCapacity: 0,
      concurrentUseCapacity: 14,
      concurrentUseCapacityByCapability: [['dining', 6], ['recreation', 8], ['seating', 8]],
      objectCapabilities: ['dining', 'recreation', 'seating'],
    });
  });

  it('leaves a capability\'s ceiling untouched by objects that do not carry it', () => {
    // **The defect issue #326 measured, as an assertion.** Four toilets and a
    // storage rack in the canteen: five more objects, six more tiles of
    // footprint, and not one more diner. Before the amendment the same room
    // admitted 19 to tables that seat 6, because the ceiling summed every
    // object's width and the gate compared a `'dining'` headcount against it.
    const withClutter = deriveRoomCapacity([
      ...CANTEEN_OBJECTS,
      placedObjectAt('object.toilet', TILE(0, 8), 0),
      placedObjectAt('object.toilet', TILE(1, 8), 0),
      placedObjectAt('object.toilet', TILE(2, 8), 0),
      placedObjectAt('object.toilet', TILE(3, 8), 0),
      placedObjectAt('object.storage-rack', TILE(5, 8), 0),
    ]);

    expect(withClutter.concurrentUseCapacityByCapability).toEqual([
      ['dining', 6],
      ['item-storage', 1],
      ['recreation', 8],
      ['sanitation', 4],
      ['seating', 8],
    ]);
    // And the total moved by exactly the clutter's footprint, 14 -> 19, which is
    // the number that used to be the ceiling. It is still computed and it is
    // still true about objects; nothing gates on it.
    expect(withClutter.concurrentUseCapacity).toBe(19);
    // The toilets did not become beds either: residency still filters on
    // `'sleep-surface'` and this room has none.
    expect(withClutter.residentCapacity).toBe(0);
  });

  it('emits capabilities ascending by code unit, deduplicated', () => {
    // A union has no order, so one is chosen: ascending by code unit, never
    // `localeCompare` (`docs/DETERMINISM.md`). The bed is placed *first*, so
    // first-seen order would be `['sleep-surface', 'sanitation']` and the
    // assertion below is a real reordering rather than a coincidence of the
    // fixture. Two beds, so the shared capability is deduplicated as well.
    const derived = deriveRoomCapacity([
      placedObjectAt('object.bed', TILE(0, 0), 0),
      placedObjectAt('object.toilet', TILE(2, 0), 0),
      placedObjectAt('object.bed', TILE(4, 0), 0),
    ]);
    expect(derived.objectCapabilities).toEqual(['sanitation', 'sleep-surface']);

    /*
     * **The comment that used to stand here asserted what its own numbers
     * falsified.** It read "Two sleep surfaces of width 1 each, and the toilet
     * counts toward neither" above these two assertions -- and the toilet is
     * precisely the difference between 2 and 3. It counted toward
     * `concurrentUseCapacity`, which is what made that figure the wrong ceiling
     * for a `'sleep-surface'` question and is the whole of issue #326.
     *
     * Both numbers below are unchanged, because the total's arithmetic did not
     * change. What the toilet counts toward is now sayable in one line: it has
     * its own ceiling, `'sanitation'` of 1, and it adds nothing to the
     * `'sleep-surface'` ceiling of 2 that the two beds give. Residency and
     * concurrent use come apart on the same set of objects, and so do two
     * concurrent uses of it.
     */
    expect(derived.residentCapacity).toBe(2);
    expect(derived.concurrentUseCapacity).toBe(3);
    expect(derived.concurrentUseCapacityByCapability).toEqual([['sanitation', 1], ['sleep-surface', 2]]);
  });

  it('ignores orientation, because capacity is a property of the object type', () => {
    // A bed turned on its side still sleeps one. The rule reads the
    // *definition's* `footprint.width`, not the rotated extent -- which is why
    // rotating furniture cannot be a way to change a room's occupancy.
    const upright = deriveRoomCapacity([placedObjectAt('object.bed', TILE(0, 0), 0)]);
    const sideways = deriveRoomCapacity([placedObjectAt('object.bed', TILE(0, 0), 1)]);
    expect(sideways).toEqual(upright);
  });

  it('contributes nothing for an object this build no longer declares', () => {
    expect(
      deriveRoomCapacity([
        { placedObjectId: 'object:0:0', objectId: 'object.deleted', anchorTile: TILE(0, 0), orientation: 0 },
        placedObjectAt('object.bed', TILE(2, 0), 0),
      ]),
    ).toMatchObject({
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['sleep-surface', 1]],
    });
  });

  it('is zero for a room with nothing in it, which is what an empty rectangle accommodates', () => {
    expect(deriveRoomCapacity([])).toEqual({
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      concurrentUseCapacityByCapability: [],
      objectCapabilities: [],
    });
  });
});

describe('which room an object belongs to', () => {
  it('is decided by the rectangle containing its anchor tile', () => {
    const cell = instance();
    expect(roomBoundsOf(cell)).toEqual({ x: 4, y: 6, width: 2, height: 3 });
    expect(roomContains(cell, TILE(4, 6))).toBe(true);
    expect(roomContains(cell, TILE(5, 8))).toBe(true);
    expect(roomContains(cell, TILE(6, 8)), 'one past the right edge').toBe(false);
    expect(roomContains(cell, TILE(4, 9)), 'one past the bottom edge').toBe(false);
  });

  it('answers nothing for an instance with no recorded rectangle, rather than guessing one', () => {
    // The shape a V4 save produces. `1x1` would assert a room the player did not
    // zone and `64x64` one that overlaps its neighbours, so absence stays
    // absence and the instance contains nothing.
    const noBounds = instance({ width: undefined, height: undefined });
    expect(roomBoundsOf(noBounds)).toBeUndefined();
    expect(roomContains(noBounds, TILE(4, 6))).toBe(false);
  });

  it('resolves a tile to an instance through the zoning plane and then the rectangle', () => {
    const world = ownedWorld();
    const rooms = new RoomInstanceRegistry();
    const cellNumericId = defaultRoomContentRegistry.getById('room.cell')?.numericId;
    if (cellNumericId === undefined) throw new Error('the catalogue must declare a cell');
    for (let y = 6; y < 9; y += 1) {
      for (let x = 4; x < 6; x += 1) world.setZoning(TILE(x, y), cellNumericId);
    }
    rooms.register(instance());

    expect(roomInstanceContaining(world, rooms, TILE(4, 7))?.instanceId).toBe('cell-1');
    // A tile the plane says is unzoned answers nothing without the rectangle
    // ever being consulted, which is what keeps the query two map reads.
    expect(roomInstanceContaining(world, rooms, TILE(20, 20))).toBeUndefined();
  });

  it('answers nothing for a painted tile whose instance is not registered', () => {
    // The plane and the registry disagreeing -- the shape `zone`'s
    // `duplicate-instance-id` refusal exists to keep out. Answering `undefined`
    // means an object there is attributed to no room rather than to a room that
    // does not exist.
    const world = ownedWorld();
    const cellNumericId = defaultRoomContentRegistry.getById('room.cell')!.numericId;
    world.setZoning(TILE(4, 6), cellNumericId);
    expect(roomInstanceContaining(world, new RoomInstanceRegistry(), TILE(4, 6))).toBeUndefined();
  });
});

describe('the resolver writes what the objects imply, and only when something changed', () => {
  function prison(): {
    readonly world: SparseWorld;
    readonly rooms: RoomInstanceRegistry;
    readonly objects: PlacedObjectRegistry;
    readonly resolver: RoomCapacityResolver;
  } {
    const world = ownedWorld();
    const rooms = new RoomInstanceRegistry();
    const objects = new PlacedObjectRegistry();
    const cellNumericId = defaultRoomContentRegistry.getById('room.cell')!.numericId;
    for (let y = 6; y < 9; y += 1) {
      for (let x = 4; x < 6; x += 1) world.setZoning(TILE(x, y), cellNumericId);
    }
    rooms.register(instance());
    return { world, rooms, objects, resolver: new RoomCapacityResolver(world, rooms, objects) };
  }

  it('is idempotent, so running it twice is harmless', () => {
    const { rooms, objects, resolver } = prison();
    objects.place(placedObjectAt('object.bed', TILE(4, 6), 0));

    resolver.resolveInstance('cell-1');
    const once = rooms.getById('cell-1');
    resolver.resolveInstance('cell-1');

    expect(rooms.getById('cell-1')).toEqual(once);
    expect(once).toMatchObject({ residentCapacity: 1, objectCapabilities: ['sleep-surface'] });
  });

  it('resolves the room containing a tile, and nothing when the tile is in none', () => {
    const { rooms, objects, resolver } = prison();
    objects.place(placedObjectAt('object.bed', TILE(4, 6), 0));

    expect(resolver.resolveContaining(TILE(4, 6))).toBe('cell-1');
    expect(rooms.getById('cell-1')?.residentCapacity).toBe(1);
    // An object standing outside every room changes no capacity, which is the
    // state decision 1 permits structurally and nothing consumes.
    expect(resolver.resolveContaining(TILE(20, 20))).toBeUndefined();
  });

  it('leaves an instance with no rectangle at zero rather than attributing objects to it', () => {
    const world = ownedWorld();
    const rooms = new RoomInstanceRegistry();
    const objects = new PlacedObjectRegistry();
    rooms.register(instance({ width: undefined, height: undefined }));
    objects.place(placedObjectAt('object.bed', TILE(4, 6), 0));

    expect(new RoomCapacityResolver(world, rooms, objects).resolveInstance('cell-1')).toEqual({
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      concurrentUseCapacityByCapability: [],
      objectCapabilities: [],
    });
  });

  it('resolves every registered instance in one call, which is what a restore does', () => {
    const { rooms, objects, resolver } = prison();
    rooms.register(instance({ instanceId: 'cell-2', anchorTile: TILE(10, 10), width: 2, height: 3 }));
    objects.place(placedObjectAt('object.bed', TILE(4, 6), 0));
    objects.place(placedObjectAt('object.bed', TILE(10, 10), 0));
    objects.place(placedObjectAt('object.toilet', TILE(11, 10), 0));

    expect(resolver.resolveAll()).toBe(2);

    expect(rooms.getById('cell-1')).toMatchObject({ residentCapacity: 1, concurrentUseCapacity: 1 });
    expect(rooms.getById('cell-2')).toMatchObject({
      residentCapacity: 1,
      concurrentUseCapacity: 2,
      concurrentUseCapacityByCapability: [['sanitation', 1], ['sleep-surface', 1]],
      objectCapabilities: ['sanitation', 'sleep-surface'],
    });
  });

  it('writes the breakdown onto the instance, and no gate reads the total', () => {
    /*
     * **The hazard the all-objects total leaves behind, as an assertion.**
     * `concurrentUseCapacity` is kept because it is true about objects and
     * because a Rooms-tab readout is owed one (ADR 0028 phase 5) -- but it is
     * nothing's ceiling, and a reader that gated on it would put issue #326
     * straight back. So: a canteen whose total is 14 admits six diners, and its
     * fifteenth object cannot become its fifteenth diner.
     */
    const world = ownedWorld();
    const rooms = new RoomInstanceRegistry();
    const objects = new PlacedObjectRegistry();
    const canteenNumericId = defaultRoomContentRegistry.getById('room.canteen')!.numericId;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) world.setZoning(TILE(x, y), canteenNumericId);
    }
    rooms.register(instance({ instanceId: 'canteen-1', roomCatalogId: 'room.canteen', anchorTile: TILE(0, 0), width: 16, height: 16 }));
    for (const object of CANTEEN_OBJECTS) objects.place(object);

    expect(new RoomCapacityResolver(world, rooms, objects).resolveInstance('canteen-1')).toMatchObject({
      concurrentUseCapacity: 14,
      concurrentUseCapacityByCapability: [['dining', 6], ['recreation', 8], ['seating', 8]],
    });

    const canteen = rooms.getById('canteen-1')!;
    expect(rooms.concurrentUseCapacityFor(canteen, 'dining')).toBe(6);
    let admitted = 0;
    for (let entity = 1; entity <= 14; entity += 1) {
      if (rooms.claimUse('canteen-1', entity as never, 'dining')) admitted += 1;
    }
    expect(admitted, 'six seats, however many objects stand in the room').toBe(6);
    // Not a vacuous refusal: the room is not full of *everything*, only of
    // dining. Its benches still have eight places to sit.
    expect(rooms.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
    expect(rooms.findAvailableForUse('room.canteen', 'seating')?.instanceId).toBe('canteen-1');
  });

  it('answers nothing for an instance that does not exist', () => {
    const { resolver } = prison();
    expect(resolver.resolveInstance('no-such-cell')).toBeUndefined();
  });
});
