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

/**
 * Four owned chunks, 64x64 tiles -- exactly `MAX_ZONE_DIMENSION_TILES` a side,
 * so a rectangle at the cap fits inside the materialised world and a refusal
 * cannot be `out-of-bounds` in disguise.
 */
function sixtyFourTileWorld(): SparseWorld {
  const world = new SparseWorld(CHUNK_SIZE);
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const chunk = { x: chunkCoordinate(x), y: chunkCoordinate(y) };
      world.load(chunk);
      world.setOwned(chunk, true);
    }
  }
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

    // 8x8 because that is `room.yard`'s authored `minimum-size`. It was 2x2
    // while nothing evaluated the requirement; the assertion below is
    // unchanged, and the rectangle is now one the catalogue permits.
    zoning.zone({ roomCatalogId: 'room.yard', x: 0, y: 0, width: 8, height: 8 }, 0);

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

    expect(outcome.instance.residentCapacity).toBe(0);
    expect(outcome.instance.concurrentUseCapacity).toBe(0);
    expect(outcome.instance.objectCapabilities).toEqual([]);
    // And the rectangle *is* recorded, which is the one new persisted field
    // ADR 0028 decision 6 adds: without it "is this tile in this room" has no
    // answer and no capacity rule has a domain.
    expect(outcome.instance.width).toBe(4);
    expect(outcome.instance.height).toBe(4);
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
    // Height 3, not 2: `room.cell` authors a 2x3 minimum and the size check now
    // runs ahead of every per-tile check, so a 4x2 rectangle would be refused
    // for being too small and this test would no longer be about bounds. The
    // rectangle still starts inside the owned chunk and still runs off its
    // right edge, which is the whole of what it is here to prove.
    const outcome = zoning.zone({ roomCatalogId: CELL, x: 30, y: 0, width: 4, height: 3 }, 0);

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

  it('accepts a rectangle exactly MAX_ZONE_DIMENSION_TILES per side, so the cap is inclusive', () => {
    // The sibling of 'accepts the authored minimum exactly': the minimum bound
    // has that assertion and the maximum had none, so turning
    // `request.width > MAX_ZONE_DIMENSION_TILES` into `>=` refused every room
    // of exactly the largest legal width and left the whole suite green. 64x64
    // is the room catalogue's own ceiling, so the largest room content can
    // author has to be zonable.
    //
    // The value is pinned as a literal as well, because the requests below
    // spell the constant under test on both sides of the comparison, and that
    // holds for any value the constant could have.
    expect(MAX_ZONE_DIMENSION_TILES).toBe(64);

    // Both cases start from four owned chunks -- 64x64 tiles -- so a full-length
    // side is inside the materialised world and the outcome is `zoned` rather
    // than the `out-of-bounds` a one-chunk world would answer. A refusal for a
    // different reason would satisfy an assertion written on
    // `reason !== 'invalid-area'`, so the assertion is on acceptance.
    const wide = service(sixtyFourTileWorld()).zoning.zone(
      { roomCatalogId: CELL, x: 0, y: 0, width: MAX_ZONE_DIMENSION_TILES, height: 3 },
      0,
    );
    expect(wide, 'the widest legal room must be zonable').toMatchObject({ kind: 'zoned' });

    // The height half of the same condition, on its own line in `zone` and so
    // its own mutation. A fresh world, because the two rectangles would
    // otherwise overlap at the origin.
    const tall = service(sixtyFourTileWorld()).zoning.zone(
      { roomCatalogId: CELL, x: 0, y: 0, width: 2, height: MAX_ZONE_DIMENSION_TILES },
      0,
    );
    expect(tall, 'the tallest legal room must be zonable').toMatchObject({ kind: 'zoned' });

    // One tile more is still refused, so the pair brackets the bound instead of
    // only pushing it outwards. Refused before any tile is read, so the world
    // it is asked of does not matter.
    const { zoning } = service(sixtyFourTileWorld());
    expect(
      zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: MAX_ZONE_DIMENSION_TILES + 1, height: 3 }, 0),
    ).toMatchObject({ reason: 'invalid-area' });
    expect(
      zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: MAX_ZONE_DIMENSION_TILES + 1 }, 0),
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
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
    const { zoning } = service(world, registry);

    const outcome = zoning.zone({ roomCatalogId: CELL, x: 5, y: 5, width: 2, height: 3 }, 4);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'duplicate-instance-id' });
    expect(registry.getById(roomInstanceIdFor(CELL, tile(5, 5)))?.residentCapacity, 'the existing instance must be untouched').toBe(1);
    expect(world.getZoning(tile(5, 5))).toBe(0);
  });
});

describe('the authored minimum size is enforced, for the first time', () => {
  // Every one of the 18 room definitions carries a `minimum-size` requirement
  // and nothing in `src/` had ever read one, so a 1x1 canteen was a legal room.
  // These are the assertions that say it is not.

  it('refuses a canteen smaller than the 6x6 the catalogue authors', () => {
    const world = ownedWorld();
    const { zoning, rooms } = service(world);

    const outcome = zoning.zone({ roomCatalogId: 'room.canteen', x: 0, y: 0, width: 1, height: 1 }, 3);

    expect(outcome).toMatchObject({ kind: 'refused', reason: 'below-minimum-size', tick: 3 });
    expect(rooms.allByRoomCatalogId('room.canteen'), 'no instance may be registered').toEqual([]);
    expect(world.getZoning(tile(0, 0)), 'the plane must be untouched').toBe(0);
  });

  it('accepts the authored minimum exactly, so the bound is inclusive', () => {
    // The off-by-one that would make a 6x6 canteen unbuildable is a worse
    // failure than the one this check exists to stop, so it is asserted rather
    // than assumed.
    const { zoning } = service(ownedWorld());
    const canteen = defaultRoomContentRegistry.getById('room.canteen')!;
    const minimum = canteen.requirements.find((entry) => entry.type === 'minimum-size');
    if (minimum?.type !== 'minimum-size') throw new Error('room.canteen must author a minimum size');

    const outcome = zoning.zone(
      { roomCatalogId: 'room.canteen', x: 0, y: 0, width: minimum.minWidth, height: minimum.minHeight },
      0,
    );

    expect(outcome.kind).toBe('zoned');
  });

  it('checks both sides, not the area, so a 1x36 canteen is refused', () => {
    // 36 tiles is exactly `minTiles` for a canteen, so a check written as an
    // area comparison alone would accept this. A room is a shape, not a budget.
    const { zoning } = service(ownedWorld());

    expect(
      zoning.zone({ roomCatalogId: 'room.canteen', x: 0, y: 0, width: 1, height: 36 }, 0),
    ).toMatchObject({ reason: 'below-minimum-size' });
  });

  it('refuses for the size before it looks at the land, because the size is what the player can fix', () => {
    // A too-small canteen on land nobody owns is refused for the size. Both
    // refusals are true; the ordering decides which sentence the player reads,
    // and the size is the one they can act on by dragging again. It is also the
    // cheaper answer and cannot materialise a chunk.
    const world = new SparseWorld(CHUNK_SIZE);
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) }); // loaded, never owned
    const { zoning } = service(world);

    expect(
      zoning.zone({ roomCatalogId: 'room.canteen', x: 0, y: 0, width: 2, height: 2 }, 0),
    ).toMatchObject({ reason: 'below-minimum-size' });
  });

  it('reads the requirement from content rather than from a constant of its own', () => {
    // Three different authored minima, so a service holding one hard-coded
    // floor -- or none -- fails here rather than passing by coincidence.
    const { zoning } = service(ownedWorld());

    expect(zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 2 }, 0), 'a cell is 2x3').toMatchObject({
      reason: 'below-minimum-size',
    });
    expect(
      zoning.zone({ roomCatalogId: 'room.holding-cell', x: 10, y: 0, width: 2, height: 2 }, 0),
      'a holding cell is 2x2, so the same rectangle is legal',
    ).toMatchObject({ kind: 'zoned' });
    expect(
      zoning.zone({ roomCatalogId: 'room.yard', x: 0, y: 10, width: 7, height: 8 }, 0),
      'a yard is 8x8',
    ).toMatchObject({ reason: 'below-minimum-size' });
  });
});

describe('a designation can be removed, which is what makes one recoverable', () => {
  // Before `unzone` a zoned room was permanent for the life of the session:
  // `zone` refuses any tile already painted, zoning writes no construction
  // order so `Undo` cannot reach it, and on touch there is no undo key. One
  // stray drag could put up to 4,096 tiles beyond use.

  it('clears the plane, unregisters the instance and frees the tiles for re-zoning', () => {
    const world = ownedWorld();
    const { zoning, rooms } = service(world);
    const zoned = zoning.zone({ roomCatalogId: CELL, x: 4, y: 4, width: 2, height: 3 }, 0);
    if (zoned.kind !== 'zoned') throw new Error('the zone must be accepted for this test to mean anything');

    const removed = zoning.unzone({ x: 4, y: 4, width: 2, height: 3 }, 1);

    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });
    if (removed.kind !== 'unzoned') throw new Error('unreachable');
    expect(removed.removedInstanceIds).toEqual([zoned.instance.instanceId]);
    expect(rooms.allByRoomCatalogId(CELL), 'the registry must not still hold it').toEqual([]);
    expect(rooms.getById(zoned.instance.instanceId)).toBeUndefined();
    for (let y = 4; y < 7; y += 1) {
      for (let x = 4; x < 6; x += 1) {
        expect(world.getZoning(tile(x, y)), `tile ${x},${y} must be cleared`).toBe(0);
      }
    }

    // The point of the whole command: the tiles are usable again. Before this,
    // `overlaps-existing-room` made a mistake permanent.
    const again = zoning.zone({ roomCatalogId: 'room.holding-cell', x: 4, y: 4, width: 2, height: 2 }, 2);
    expect(again.kind).toBe('zoned');
  });

  it('removes the whole room from a drag that clips one corner of it', () => {
    // Stated rather than discovered: each covered tile is grown into its
    // connected same-type run before anything is cleared, because clearing only
    // the covered tiles would leave the plane painted where the registry has no
    // instance -- exactly the state `zone` is careful never to create.
    const world = ownedWorld();
    const { zoning, rooms } = service(world);
    zoning.zone({ roomCatalogId: 'room.canteen', x: 2, y: 2, width: 6, height: 6 }, 0);

    const removed = zoning.unzone({ x: 7, y: 7, width: 1, height: 1 }, 1);

    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 36 });
    expect(rooms.allByRoomCatalogId('room.canteen')).toEqual([]);
    expect(world.getZoning(tile(2, 2)), 'the far corner must be cleared too').toBe(0);
  });

  it('leaves a room of a different type alone, even one sharing an edge', () => {
    // The flood fill grows through the same room *numeric id* and nothing else,
    // so a neighbour of another type is a boundary rather than a casualty.
    const world = ownedWorld();
    const { zoning, rooms } = service(world);
    zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    zoning.zone({ roomCatalogId: 'room.holding-cell', x: 2, y: 0, width: 2, height: 2 }, 0);

    zoning.unzone({ x: 0, y: 0, width: 1, height: 1 }, 1);

    expect(rooms.allByRoomCatalogId(CELL), 'the cell is gone').toEqual([]);
    expect(rooms.allByRoomCatalogId('room.holding-cell'), 'the holding cell is not').toHaveLength(1);
    expect(world.getZoning(tile(2, 0))).not.toBe(0);
  });

  it('refuses an empty rectangle rather than clearing something else', () => {
    const { zoning } = service(ownedWorld());
    expect(zoning.unzone({ x: 0, y: 0, width: 0, height: 4 }, 0)).toMatchObject({ reason: 'invalid-area' });
    expect(
      zoning.unzone({ x: 0, y: 0, width: MAX_ZONE_DIMENSION_TILES + 1, height: 1 }, 0),
      'an unbounded width would walk the coordinate space inside one tick',
    ).toMatchObject({ reason: 'invalid-area' });
  });

  it('accepts a removal rectangle exactly MAX_ZONE_DIMENSION_TILES per side, so the cap is inclusive here too', () => {
    // `unzone` carries its own copy of the same bound, and its own copy of the
    // same hole: `>` -> `>=` on either side survived the suite exactly as it
    // did in `zone`. A player who drags a removal the full 64 tiles must clear
    // the rooms under it rather than be told the area is not a rectangle.
    const wide = service(sixtyFourTileWorld());
    wide.zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    expect(
      wide.zoning.unzone({ x: 0, y: 0, width: MAX_ZONE_DIMENSION_TILES, height: 3 }, 1),
      'the widest legal removal must clear the room it covers',
    ).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });

    const tall = service(sixtyFourTileWorld());
    tall.zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    expect(
      tall.zoning.unzone({ x: 0, y: 0, width: 2, height: MAX_ZONE_DIMENSION_TILES }, 1),
      'the tallest legal removal must clear the room it covers',
    ).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });
  });

  it('refuses a rectangle holding no designation at all, rather than reporting a silent success', () => {
    const { zoning } = service(ownedWorld());
    expect(zoning.unzone({ x: 0, y: 0, width: 4, height: 4 }, 5)).toMatchObject({
      kind: 'refused',
      reason: 'nothing-to-remove',
      tick: 5,
    });
  });

  it('materialises nothing for a rectangle that spills off the edge of the prison', () => {
    // A drag that overshoots still removes what it did cover, and reads no
    // designation from a chunk that does not exist rather than creating one.
    const world = ownedWorld();
    const { zoning } = service(world);
    zoning.zone({ roomCatalogId: CELL, x: 29, y: 0, width: 2, height: 3 }, 0);

    const removed = zoning.unzone({ x: 29, y: 0, width: 8, height: 3 }, 1);

    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });
    expect(world.hasChunk({ x: chunkCoordinate(1), y: chunkCoordinate(0) })).toBe(false);
  });

  it('refuses to strand an occupant, and leaves the room exactly as it was', () => {
    const world = ownedWorld();
    const registry = new RoomInstanceRegistry();
    const { zoning } = service(world, registry);
    const zoned = zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    if (zoned.kind !== 'zoned') throw new Error('the zone must be accepted for this test to mean anything');
    // A zoned room with nothing in it derives `residentCapacity: 0`, so
    // `assign` refuses to fill it. Given a capacity by hand here rather than by
    // placing a bed, so this test stays about `unzone` and not about placement
    // -- `tests/integration/object-placement-loop.test.ts` drives the real
    // route, and this is the same shape a restored save produces.
    registry.unregister(zoned.instance.instanceId);
    registry.register({ ...zoned.instance, residentCapacity: 1, concurrentUseCapacity: 1 });
    registry.assign(zoned.instance.instanceId, 1 as never);

    const removed = zoning.unzone({ x: 0, y: 0, width: 2, height: 3 }, 1);

    expect(removed).toMatchObject({ kind: 'refused', reason: 'room-occupied', tick: 1 });
    expect(registry.getById(zoned.instance.instanceId), 'the instance must survive').toBeDefined();
    expect(world.getZoning(tile(0, 0)), 'and so must its tiles').toBe(CELL_NUMERIC_ID);
  });

  it('refuses to strand a prisoner who is only *using* the room, not living in it', () => {
    // The other half of `unzone`'s occupancy guard since ADR 0029. A prisoner
    // performing an action here holds a concurrent-use claim and a
    // `currentActionTargetInstanceId` naming this instance, which dangles in
    // exactly the way a resident's `accommodationInstanceId` would -- so the
    // guard asks `claimCountOf` and not `occupancyOf`. It must also agree with
    // `RoomInstanceRegistry.unregister`, which throws on the same predicate: if
    // the guard were the narrower of the two, a refusal the player should have
    // seen would be an exception out of `Kernel.step()` instead.
    const world = ownedWorld();
    const registry = new RoomInstanceRegistry();
    const { zoning } = service(world, registry);
    const zoned = zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    if (zoned.kind !== 'zoned') throw new Error('the zone must be accepted for this test to mean anything');
    registry.unregister(zoned.instance.instanceId);
    registry.register({ ...zoned.instance, residentCapacity: 1, concurrentUseCapacity: 1 });
    expect(registry.claimUse(zoned.instance.instanceId, 1 as never)).toBe(true);
    // Nobody *lives* here, so the narrower predicate would have allowed this.
    expect(registry.occupancyOf(zoned.instance.instanceId)).toBe(0);

    const removed = zoning.unzone({ x: 0, y: 0, width: 2, height: 3 }, 1);

    expect(removed).toMatchObject({ kind: 'refused', reason: 'room-occupied', tick: 1 });
    expect(registry.getById(zoned.instance.instanceId), 'the instance must survive').toBeDefined();
    expect(world.getZoning(tile(0, 0)), 'and so must its tiles').toBe(CELL_NUMERIC_ID);

    // Transient, and that is the whole cost of the wider predicate: a use claim
    // lasts one action, so the same drag succeeds once the meal is over.
    registry.releaseUse(zoned.instance.instanceId, 1 as never);
    expect(zoning.unzone({ x: 0, y: 0, width: 2, height: 3 }, 2)).toMatchObject({ kind: 'unzoned' });
  });

  it('is deterministic in what it reports, whichever corner the drag started from', () => {
    const forwards = service(ownedWorld());
    const backwards = service(ownedWorld());
    for (const built of [forwards, backwards]) {
      built.zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
      built.zoning.zone({ roomCatalogId: CELL, x: 4, y: 0, width: 2, height: 3 }, 0);
    }

    const first = forwards.zoning.unzone({ x: 0, y: 0, width: 6, height: 3 }, 1);
    const second = backwards.zoning.unzone({ x: 0, y: 0, width: 6, height: 3 }, 1);

    expect(first).toEqual(second);
    if (first.kind !== 'unzoned') throw new Error('unreachable');
    expect(first.removedInstanceIds, 'sorted, so two runs of the same commands agree').toEqual(
      [...first.removedInstanceIds].sort(),
    );
    expect(first.removedInstanceIds).toHaveLength(2);
  });
});

describe('two adjacent rectangles of one type are two rooms at both ends (#337)', () => {
  /**
   * The half of ADR 0022 consequence 2 that was recorded as unchanged and is
   * now changed. `zone` always made two touching same-type rectangles into two
   * `RoomInstance`s; `unzone` grew each covered tile into its connected
   * *same-type* run and took every instance in it, so clipping one corner of
   * one of two touching cells removed both.
   *
   * The plane still stores a room type per tile and carries no instance id.
   * What resolves a tile to an instance is the instance's own **rectangle**,
   * persisted since ADR 0028 phase 1 and read by `roomInstanceContaining`
   * (`src/simulation/objects/room-capacity.ts`) -- the function object
   * placement already uses for exactly this question. So this costs the save
   * format nothing; see `docs/PERSISTENCE.md`.
   */
  it('removes only the room the drag covers, and leaves its neighbour zoned and registered', () => {
    const world = ownedWorld();
    const { zoning, rooms } = service(world);
    const left = zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    const right = zoning.zone({ roomCatalogId: CELL, x: 2, y: 0, width: 2, height: 3 }, 0);
    if (left.kind !== 'zoned' || right.kind !== 'zoned') throw new Error('both zones must be accepted');

    expect(rooms.allByRoomCatalogId(CELL), 'two instances, not one L-shaped room').toHaveLength(2);

    // One tile of the left cell -- the partial drag that used to take both.
    const removed = zoning.unzone({ x: 0, y: 0, width: 1, height: 1 }, 1);

    // The neighbour first, stated as the player sees it rather than as a count:
    // its instance is still registered under the id it was zoned with, and its
    // rectangle is intact. This is the assertion #337 is about.
    const survivor = rooms.getById(roomInstanceIdFor(CELL, tile(2, 0)));
    expect(survivor, 'the room the drag never touched must survive').toBeDefined();
    expect(survivor).toMatchObject({ anchorTile: tile(2, 0), width: 2, height: 3 });
    expect(rooms.allByRoomCatalogId(CELL).map((instance) => instance.instanceId)).toEqual([
      roomInstanceIdFor(CELL, tile(2, 0)),
    ]);

    // The whole of the left cell and nothing else: 2x3 tiles, one instance.
    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });
    if (removed.kind !== 'unzoned') throw new Error('unreachable');
    expect(removed.removedInstanceIds).toEqual([roomInstanceIdFor(CELL, tile(0, 0))]);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 2; x < 4; x += 1) {
        expect(world.getZoning(tile(x, y)), `the neighbour's tile ${x},${y} must stay painted`).toBe(CELL_NUMERIC_ID);
      }
      for (let x = 0; x < 2; x += 1) {
        expect(world.getZoning(tile(x, y)), `the removed room's tile ${x},${y} must be cleared`).toBe(0);
      }
    }
  });

  it('removes an empty room beside an occupied one, and leaves the occupant assigned to theirs', () => {
    // The stranding half of #337, and the reading that is actually reachable
    // through `unzone` today: the occupancy guard runs over the *whole* flooded
    // region, so a neighbour's resident did not dangle -- it made the empty
    // room unremovable instead. Both readings follow from one cause, and this
    // asserts the consequence a player can see: the drag is honoured, the
    // occupied room is untouched, and its occupant is still assigned to it.
    const world = ownedWorld();
    const registry = new RoomInstanceRegistry();
    const { zoning } = service(world, registry);
    const left = zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    const right = zoning.zone({ roomCatalogId: CELL, x: 2, y: 0, width: 2, height: 3 }, 0);
    if (left.kind !== 'zoned' || right.kind !== 'zoned') throw new Error('both zones must be accepted');

    // Capacity by hand, exactly as the two refusal tests above do it, so this
    // stays a test about `unzone` rather than about object placement --
    // `tests/integration/room-zoning-loop.test.ts` drives the real bed.
    registry.unregister(right.instance.instanceId);
    registry.register({ ...right.instance, residentCapacity: 1, concurrentUseCapacity: 1 });
    expect(registry.assign(right.instance.instanceId, 7 as never)).toBe(true);

    const removed = zoning.unzone({ x: 0, y: 0, width: 2, height: 3 }, 1);

    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });
    if (removed.kind !== 'unzoned') throw new Error('unreachable');
    expect(removed.removedInstanceIds).toEqual([left.instance.instanceId]);

    expect(registry.getById(right.instance.instanceId), 'the occupied room must survive').toBeDefined();
    expect(registry.occupantsOf(right.instance.instanceId), 'and its occupant must still be assigned to it').toEqual([
      7,
    ]);
    expect(registry.occupancyOf(right.instance.instanceId)).toBe(1);
    expect(world.getZoning(tile(2, 0)), 'the occupied room keeps its tiles').toBe(CELL_NUMERIC_ID);
    expect(world.getZoning(tile(0, 0)), 'the empty room loses its own').toBe(0);
  });

  it('still refuses when the drag reaches the occupied room itself', () => {
    // The guard that has to survive the narrowing: an occupied room is refused
    // when the rectangle covers *it*, which is the case
    // `accommodationInstanceId` depends on. A fix that bounded removal to one
    // instance and dropped the occupancy check would pass the two tests above.
    const world = ownedWorld();
    const registry = new RoomInstanceRegistry();
    const { zoning } = service(world, registry);
    const left = zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    const right = zoning.zone({ roomCatalogId: CELL, x: 2, y: 0, width: 2, height: 3 }, 0);
    if (left.kind !== 'zoned' || right.kind !== 'zoned') throw new Error('both zones must be accepted');
    registry.unregister(right.instance.instanceId);
    registry.register({ ...right.instance, residentCapacity: 1, concurrentUseCapacity: 1 });
    registry.assign(right.instance.instanceId, 7 as never);

    // One tile of the occupied cell, and one of the empty one.
    const removed = zoning.unzone({ x: 1, y: 0, width: 2, height: 1 }, 1);

    expect(removed).toMatchObject({ kind: 'refused', reason: 'room-occupied', tick: 1 });
    // And nothing was half-applied: the empty room in the same drag survives.
    expect(registry.getById(left.instance.instanceId)).toBeDefined();
    expect(world.getZoning(tile(0, 0))).toBe(CELL_NUMERIC_ID);
  });

  it('takes both rooms in one drag when the drag covers both', () => {
    // Narrowing removal to an instance must not turn a deliberate wide drag
    // into a single-room removal: `removedInstanceIds` is plural because a
    // rectangle can genuinely cover several rooms, and that is unchanged.
    const world = ownedWorld();
    const { zoning, rooms } = service(world);
    zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
    zoning.zone({ roomCatalogId: CELL, x: 2, y: 0, width: 2, height: 3 }, 0);

    const removed = zoning.unzone({ x: 0, y: 0, width: 4, height: 3 }, 1);

    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 12 });
    if (removed.kind !== 'unzoned') throw new Error('unreachable');
    expect(removed.removedInstanceIds).toEqual(
      [roomInstanceIdFor(CELL, tile(0, 0)), roomInstanceIdFor(CELL, tile(2, 0))].sort(),
    );
    expect(rooms.allByRoomCatalogId(CELL)).toEqual([]);
  });

  it('still clears paint that belongs to no rectangle, without taking the room next to it', () => {
    // The state a restored V4 save produces, beside a room zoned by this build.
    // A V4 room instance records no rectangle and there is no honest default
    // (`roomBoundsOf`, `src/simulation/objects/room-capacity.ts`), so nothing
    // can resolve its tiles to it -- and removal exists precisely so that no
    // designation is permanent, which means those tiles must stay clearable.
    // The flood fill is kept for them, and it has to stop where a real
    // rectangle begins or it is the old defect in a smaller costume.
    const world = ownedWorld();
    const registry = new RoomInstanceRegistry();
    const { zoning } = service(world, registry);
    const modern = zoning.zone({ roomCatalogId: CELL, x: 2, y: 0, width: 2, height: 3 }, 0);
    if (modern.kind !== 'zoned') throw new Error('the zone must be accepted for this test to mean anything');

    // Painted and registered by hand, with no `width`/`height` -- the two keys
    // are omitted rather than set to `undefined`, which is what a V4 row is.
    const legacyId = roomInstanceIdFor(CELL, tile(0, 0));
    registry.register({
      instanceId: legacyId,
      roomCatalogId: CELL,
      anchorTile: tile(0, 0),
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    for (let y = 0; y < 3; y += 1) for (let x = 0; x < 2; x += 1) world.setZoning(tile(x, y), CELL_NUMERIC_ID);

    const removed = zoning.unzone({ x: 0, y: 0, width: 1, height: 1 }, 1);

    // Six tiles: the legacy room's own run, and not the six next door.
    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });
    if (removed.kind !== 'unzoned') throw new Error('unreachable');
    expect(removed.removedInstanceIds, 'the rectangle-less room is removable').toEqual([legacyId]);
    expect(registry.getById(modern.instance.instanceId), 'the room with a rectangle must survive').toBeDefined();
    for (let y = 0; y < 3; y += 1) {
      for (let x = 2; x < 4; x += 1) {
        expect(world.getZoning(tile(x, y)), `the neighbour's tile ${x},${y} must stay painted`).toBe(CELL_NUMERIC_ID);
      }
      for (let x = 0; x < 2; x += 1) {
        expect(world.getZoning(tile(x, y)), `the legacy tile ${x},${y} must be cleared`).toBe(0);
      }
    }
  });

  it('clears only the painted part of a rectangle that overhangs the world, and materialises nothing', () => {
    // A rectangle is bounded at `MAX_ZONE_DIMENSION_TILES` per side and against
    // nothing else, so a save can carry an instance whose recorded rectangle
    // reaches into a chunk that does not exist. `setZoning` *materialises* a
    // chunk, so writing a zero over every tile of the rectangle would grow the
    // world on its way to removing nothing -- the same reason `zone` checks
    // every tile before it writes any.
    const world = ownedWorld();
    const registry = new RoomInstanceRegistry();
    const { zoning } = service(world, registry);
    const overhangingId = roomInstanceIdFor(CELL, tile(30, 0));
    registry.register({
      instanceId: overhangingId,
      roomCatalogId: CELL,
      anchorTile: tile(30, 0),
      width: 4,
      height: 3,
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    // Only the half inside chunk (0,0) is painted, which is all a save could
    // have carried: the plane lives inside the chunks.
    for (let y = 0; y < 3; y += 1) for (let x = 30; x < 32; x += 1) world.setZoning(tile(x, y), CELL_NUMERIC_ID);

    const removed = zoning.unzone({ x: 30, y: 0, width: 1, height: 1 }, 1);

    expect(removed).toMatchObject({ kind: 'unzoned', clearedTiles: 6 });
    expect(world.hasChunk({ x: chunkCoordinate(1), y: chunkCoordinate(0) }), 'no chunk may be grown').toBe(false);
    expect(registry.getById(overhangingId)).toBeUndefined();
  });
});

describe('a refusal is kept, because it has nowhere else to go', () => {
  it('records the reason, the tick and the request', () => {
    const { zoning } = service(ownedWorld());
    // 2x3, `room.cell`'s authored minimum, so this is refused for being outside
    // the map rather than for being too small -- which is the reason the record
    // is asserted to hold. The `tile` field is part of that: a size refusal
    // names no tile, because the size is a fact about the request rather than
    // about anywhere in the world.
    zoning.zone({ roomCatalogId: CELL, x: 40, y: 0, width: 2, height: 3 }, 12);

    expect(zoning.recentRefusals()).toEqual([
      {
        kind: 'refused',
        reason: 'out-of-bounds',
        request: { roomCatalogId: CELL, x: 40, y: 0, width: 2, height: 3 },
        tile: tile(40, 0),
        tick: 12,
      },
    ]);
  });

  it('keeps an accepted zone out of the record, and bounds a player who keeps missing', () => {
    const { zoning } = service(ownedWorld());
    zoning.zone({ roomCatalogId: CELL, x: 0, y: 0, width: 2, height: 3 }, 0);
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
