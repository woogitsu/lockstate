import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import {
  MAX_RECORDED_ZONING_REFUSALS,
  MAX_ZONE_DIMENSION_TILES,
  RoomZoningService,
  roomInstanceIdFor,
} from '../../src/simulation/rooms/zoning';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * `RoomZoningService` -- the consumer #261 gave the `ZoneRoom` command.
 *
 * The command decoded, dispatched and hit a `break` for as long as it
 * existed, so every assertion here is about a behaviour that had no
 * implementation to be wrong: an instance is registered, the world's zoning
 * plane is painted, and a request the prison cannot honour is refused with a
 * reason rather than half-applied.
 *
 * The command path itself (kernel -> decoder -> router) and the save round
 * trip are in `tests/integration/room-zoning-loop.test.ts`; this file drives
 * the service directly so a refusal can be inspected without a session.
 */

const CHUNK_SIZE = 32;
const CELL = 'room.cell';
/** `room.cell`'s zoning value comes from the content catalog, never from the service. */
const CELL_NUMERIC_ID = defaultRoomContentRegistry.getById(CELL)!.numericId;

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/** One owned, loaded chunk at the origin -- the same starter world `createNewSimulationRuntime` builds. */
function ownedWorld(): SparseWorld {
  const world = new SparseWorld(CHUNK_SIZE);
  const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(origin);
  world.setOwned(origin, true);
  return world;
}

function service(world: SparseWorld, registry = new RoomInstanceRegistry()): {
  readonly zoning: RoomZoningService;
  readonly rooms: RoomInstanceRegistry;
} {
  return { zoning: new RoomZoningService(world, registry), rooms: registry };
}

describe('zoning a room registers a room instance', () => {
  it('registers an instance the room projections can see, and paints the whole rectangle', () => {
    const world = ownedWorld();
    const { zoning, rooms } = service(world);

    const outcome = zoning.zone({ roomCatalogId: CELL, x: 4, y: 6, width: 2, height: 3 }, 10);

    expect(outcome.kind).toBe('zoned');
    if (outcome.kind !== 'zoned') throw new Error('unreachable');
    expect(rooms.allByRoomCatalogId(CELL).map((instance) => instance.instanceId)).toEqual([outcome.instance.instanceId]);
    expect(rooms.getById(outcome.instance.instanceId)?.anchorTile).toEqual(tile(4, 6));

    // Every tile of the rectangle, and only those tiles. A check that only
    // sampled the anchor would pass on a service that painted one tile.
    for (let y = 6; y < 9; y += 1) {
      for (let x = 4; x < 6; x += 1) {
        expect(world.getZoning(tile(x, y)), `tile ${x},${y} must be zoned`).toBe(CELL_NUMERIC_ID);
      }
    }
    expect(world.getZoning(tile(6, 6)), 'the tile past the right edge must be untouched').toBe(0);
    expect(world.getZoning(tile(4, 9)), 'the tile past the bottom edge must be untouched').toBe(0);
    expect(world.getZoning(tile(3, 6)), 'the tile before the left edge must be untouched').toBe(0);
  });

  it('writes the catalog\'s own numeric id, which is what the renderer resolves a tint from', () => {
    const world = ownedWorld();
    const { zoning } = service(world);

    zoning.zone({ roomCatalogId: 'room.yard', x: 0, y: 0, width: 2, height: 2 }, 0);

    const yard = defaultRoomContentRegistry.getById('room.yard')!;
    expect(world.getZoning(tile(0, 0))).toBe(yard.numericId);
    // The value has to round-trip back to the room it came from, because
    // `rendering/world/appearance.ts` tints a tile by
    // `getByNumericId(...)?.category`. A service that stored its own numbering
    // would tint the wrong category or nothing at all.
    expect(defaultRoomContentRegistry.getByNumericId(world.getZoning(tile(0, 0)))?.id).toBe('room.yard');
  });

  it('gives a freshly zoned room no capacity and no object capabilities, because it is empty', () => {
    // Not a placeholder: object placement does not exist (docs/HUD_PROJECTIONS.md
    // gap 13), so a room with no objects accommodates nobody and offers no
    // capability. Pinned so that giving zoning an invented capacity constant
    // is a visible change rather than a quiet one.
    const { zoning } = service(ownedWorld());
    const outcome = zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 4, height: 4 }, 0);
    if (outcome.kind !== 'zoned') throw new Error('the zone must be accepted for this test to mean anything');

    expect(outcome.instance.capacity).toBe(0);
    expect(outcome.instance.objectCapabilities).toEqual([]);
  });
});

describe('the instance id is derived from state, not from history', () => {
  it('gives two differently-built prisons the same id for the same room', () => {
    // The property ADR 0012 is about, asserted rather than assumed: an id
    // minted from a counter would differ here, because the second world zones
    // two other rooms first and refuses a third request before this one.
    const first = service(ownedWorld());
    const second = service(ownedWorld());

    const fromFirst = first.zoning.zone({ roomCatalogId: CELL, x: 12, y: 3, width: 2, height: 3 }, 0);

    second.zoning.zone({ roomCatalogId: 'room.yard', x: 0, y: 20, width: 4, height: 4 }, 0);
    second.zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 1);
    second.zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 2); // refused: overlaps
    const fromSecond = second.zoning.zone({ roomCatalogId: CELL, x: 12, y: 3, width: 2, height: 3 }, 3);

    if (fromFirst.kind !== 'zoned' || fromSecond.kind !== 'zoned') throw new Error('both zones must be accepted');
    expect(fromSecond.instance.instanceId).toBe(fromFirst.instance.instanceId);
    expect(fromFirst.instance.instanceId).toBe(roomInstanceIdFor(CELL, tile(12, 3)));
  });

  it('separates two rooms of the same type that differ in only one coordinate', () => {
    // Both axes are load-bearing. An id built from one of them collides for a
    // column of cells, and a collision is not a cosmetic problem: the second
    // room is refused as a duplicate, or -- if the refusal were absent --
    // `register` throws inside a command dispatch.
    const { zoning, rooms } = service(ownedWorld());
    const first = zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    const below = zoning.zone({ roomCatalogId: CELL, x: 0, y: 4, width: 2, height: 3 }, 1);
    const beside = zoning.zone({ roomCatalogId: CELL, x: 4, y: 0, width: 2, height: 3 }, 2);

    if (first.kind !== 'zoned' || below.kind !== 'zoned' || beside.kind !== 'zoned') {
      throw new Error('all three zones must be accepted');
    }
    expect(new Set([first.instance.instanceId, below.instance.instanceId, beside.instance.instanceId]).size).toBe(3);
    expect(rooms.allByRoomCatalogId(CELL)).toHaveLength(3);
  });

  it('produces an id the save schema and the identifier rule both accept', () => {
    // `save-schema.ts` stores an instance id as `z.string().min(1)`, but a
    // prisoner's `accommodationInstanceId` travels in the same payload and the
    // repository's identifier shape is the stricter one -- an id with a comma
    // or a leading `-` would pass the save and be the odd one out everywhere
    // else. Negative coordinates are the case that decides it.
    expect(roomInstanceIdFor(CELL, tile(-4, -9))).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
  });
});

describe('a zoning request the prison cannot honour is refused, with a reason', () => {
  it('refuses land the player does not own and paints nothing', () => {
    const world = new SparseWorld(CHUNK_SIZE);
    const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    world.load(origin); // loaded but never `setOwned`
    const { zoning, rooms } = service(world);

    const outcome = zoning.zone({ roomCatalogId: CELL, x: 2, y: 2, width: 3, height: 3 }, 7);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'unowned-land', tick: 7 });
    expect(rooms.allByRoomCatalogId(CELL)).toEqual([]);
    expect(world.getZoning(tile(2, 2)), 'a refused zone must leave the plane untouched').toBe(0);
  });

  it('refuses a rectangle that leaves the materialised world, without materialising it', () => {
    const world = ownedWorld();
    const { zoning } = service(world);

    // Starts inside the owned chunk and runs off its right edge. The
    // atomicity claim has teeth here: `SparseWorld.setZoning` loads a chunk
    // that does not exist, so a service that painted as it walked would
    // create chunk (1,0) on the way to refusing.
    const outcome = zoning.zone({ roomCatalogId: CELL, x: 30, y: 0, width: 4, height: 2 }, 0);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'out-of-bounds' });
    expect(world.hasChunk({ x: chunkCoordinate(1), y: chunkCoordinate(0) })).toBe(false);
    expect(world.getZoning(tile(30, 0)), 'the in-bounds part must not be zoned either').toBe(0);
  });

  it('refuses a rectangle overlapping an existing room, on the one tile that overlaps', () => {
    const world = ownedWorld();
    const { zoning, rooms } = service(world);
    zoning.zone({ roomCatalogId: CELL, x: 4, y: 4, width: 4, height: 4 }, 0);

    const outcome = zoning.zone({ roomCatalogId: 'room.canteen', x: 7, y: 7, width: 6, height: 6 }, 1);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'overlaps-existing-room', tile: tile(7, 7) });
    expect(rooms.allByRoomCatalogId('room.canteen')).toEqual([]);
    expect(world.getZoning(tile(12, 12)), 'no part of the refused canteen may be painted').toBe(0);
    expect(world.getZoning(tile(4, 4)), 'the existing room must be intact').toBe(CELL_NUMERIC_ID);
  });

  it('refuses a room type the catalog does not define', () => {
    const { zoning, rooms } = service(ownedWorld());
    const outcome = zoning.zone({ roomCatalogId: 'room.panopticon', x: 0, y: 0, width: 2, height: 2 }, 0);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'unknown-room-type' });
    expect(rooms.allByRoomCatalogId('room.panopticon')).toEqual([]);
  });

  it('refuses an empty or oversized rectangle, which the command schema does not bound', () => {
    const { zoning } = service(ownedWorld());

    expect(zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 0, height: 4 }, 0)).toMatchObject({ reason: 'invalid-area' });
    expect(zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 4, height: -2 }, 0)).toMatchObject({ reason: 'invalid-area' });
    expect(
      zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: MAX_ZONE_DIMENSION_TILES + 1, height: 1 }, 0),
      'an unbounded width would walk the coordinate space inside one tick',
    ).toMatchObject({ reason: 'invalid-area' });
  });

  it('refuses rather than throwing when the registry already holds the anchor\'s instance', () => {
    // The shape a save written before zoning painted the plane has, and the
    // shape a scenario that registers instances directly has: an instance
    // exists at this anchor while the zoning plane says the tile is free.
    // `RoomInstanceRegistry.register` throws on a duplicate id -- correct as a
    // corruption guard, fatal inside a kernel command dispatch.
    const world = ownedWorld();
    const registry = new RoomInstanceRegistry();
    registry.register({
      instanceId: roomInstanceIdFor(CELL, tile(5, 5)),
      roomCatalogId: CELL,
      anchorTile: tile(5, 5),
      capacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
    const { zoning } = service(world, registry);

    const outcome = zoning.zone({ roomCatalogId: CELL, x: 5, y: 5, width: 2, height: 3 }, 4);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'duplicate-instance-id' });
    expect(registry.getById(roomInstanceIdFor(CELL, tile(5, 5)))?.capacity, 'the existing instance must be untouched').toBe(1);
    expect(world.getZoning(tile(5, 5))).toBe(0);
  });
});

describe('a refusal is kept, because it has nowhere else to go', () => {
  it('records the reason, the tick and the request', () => {
    const { zoning } = service(ownedWorld());
    zoning.zone({ roomCatalogId: CELL, x: 40, y: 0, width: 2, height: 2 }, 12);

    expect(zoning.recentRefusals()).toEqual([
      {
        kind: 'refused',
        reason: 'out-of-bounds',
        request: { roomCatalogId: CELL, x: 40, y: 0, width: 2, height: 2 },
        tile: tile(40, 0),
        tick: 12,
      },
    ]);
  });

  it('keeps an accepted zone out of the record, and bounds a player who keeps missing', () => {
    const { zoning } = service(ownedWorld());
    zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 2 }, 0);
    expect(zoning.recentRefusals(), 'an accepted zone is not a refusal').toEqual([]);

    for (let attempt = 0; attempt < MAX_RECORDED_ZONING_REFUSALS + 5; attempt += 1) {
      zoning.zone({ roomCatalogId: 'room.panopticon', x: attempt, y: 0, width: 1, height: 1 }, attempt);
    }

    const kept = zoning.recentRefusals();
    expect(kept).toHaveLength(MAX_RECORDED_ZONING_REFUSALS);
    expect(kept[kept.length - 1]!.tick, 'the newest refusal must survive').toBe(MAX_RECORDED_ZONING_REFUSALS + 4);
    expect(kept[0]!.tick, 'the oldest must be the one dropped').toBe(5);
  });

  it('hands out a copy, so a reader cannot edit the record', () => {
    const { zoning } = service(ownedWorld());
    zoning.zone({ roomCatalogId: 'room.panopticon', x: 0, y: 0, width: 1, height: 1 }, 0);

    (zoning.recentRefusals() as unknown as { length: number }).length = 0;
    expect(zoning.recentRefusals()).toHaveLength(1);
  });
});
