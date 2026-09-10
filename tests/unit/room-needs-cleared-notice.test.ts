import { describe, expect, it } from 'vitest';
import { SimulationEventLog } from '../../src/simulation/events';
import type { SimulationContext } from '../../src/simulation/kernel/system';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { placedObjectAt, PlacedObjectRegistry } from '../../src/simulation/objects';
import type { RoomDoorReader } from '../../src/simulation/rooms/enclosure';
import { RoomNeedsClearedNoticeSystem } from '../../src/simulation/rooms/room-needs-cleared-notice';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * `RoomNeedsClearedNoticeSystem` -- issue #1006 finding 3's one-off
 * confirmation that a room stopped being short of anything the Rooms panel's
 * `NOT READY` block checks for.
 *
 * `room.holding-cell` is the fixture room type throughout: `enclosed`, a
 * 2x2 minimum, and exactly one `object` requirement (`object.bench`,
 * `minQuantity: 1`) -- one contributor to `shortfallOf` per side
 * (capability, doorway), each isolated in its own describe block by holding
 * the other constant.
 *
 * Instances are registered directly on `RoomInstanceRegistry`, not through
 * `RoomZoningService.zone` -- the same shortcut
 * `economy-insolvency-rung-system.test.ts` takes, and for the same reason:
 * this file is about the *notice*, not about zoning's own refusal rules, and
 * a hand-registered instance is real registry state rather than a stub.
 */

const CHUNK_SIZE = 32;
const TILE = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function context(tick: number): SimulationContext {
  return { tick } as SimulationContext;
}

/** One loaded chunk at the origin, every edge open. `wall2x2` closes the fixture room's own perimeter on top of it. */
function ownedWorld(): SparseWorld {
  const world = new SparseWorld(CHUNK_SIZE);
  world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
  return world;
}

/** Walls the 2x2 rectangle at the origin on every side, the minimum size `room.holding-cell` accepts. */
function wall2x2(world: SparseWorld): void {
  const WALL = 7;
  for (const x of [0, 1]) {
    world.setTopEdge(TILE(x, 0), WALL); // north boundary
    world.setTopEdge(TILE(x, 2), WALL); // south boundary
  }
  for (const y of [0, 1]) {
    world.setLeftEdge(TILE(0, y), WALL); // west boundary
    world.setLeftEdge(TILE(2, y), WALL); // east boundary
  }
}

/** A door reader that is either present on every edge or absent from all of them -- enough to hold the doorway side of `shortfallOf` constant while a test varies the other. */
function constantDoorReader(present: boolean): RoomDoorReader {
  return { getByEdge: () => (present ? {} : undefined) };
}

/** A door reader whose answer can be flipped after construction, isolating the doorway-side crossing from the object side. */
function toggledDoorReader(): { reader: RoomDoorReader; setPresent: (value: boolean) => void } {
  let present = false;
  return {
    reader: { getByEdge: () => (present ? {} : undefined) },
    setPresent: (value: boolean) => {
      present = value;
    },
  };
}

function registerHoldingCell(roomInstances: RoomInstanceRegistry, instanceId: string): void {
  roomInstances.register({
    instanceId,
    roomCatalogId: 'room.holding-cell',
    anchorTile: TILE(0, 0),
    width: 2,
    height: 2,
    residentCapacity: 0,
    concurrentUseCapacity: 0,
    objectCapabilities: [],
  });
}

describe('RoomNeedsClearedNoticeSystem: the object-capability side of shortfallOf, doorway held constant', () => {
  it('fires once, the day the missing bench is placed, and not again while it stays placed', () => {
    const roomInstances = new RoomInstanceRegistry();
    registerHoldingCell(roomInstances, 'holding-cell-1');
    const placedObjects = new PlacedObjectRegistry();
    const world = ownedWorld();
    wall2x2(world);
    const events = new SimulationEventLog();
    // A door on every edge, held constant: this describe block is about the
    // object side only, so the doorway side must never contribute.
    const system = new RoomNeedsClearedNoticeSystem(
      { roomInstances },
      placedObjects,
      world,
      constantDoorReader(true),
      events,
    );

    // Seeding tick: short one bench. Must announce nothing.
    system.update(context(0));
    expect(events.since(0), 'the seeding call must announce nothing').toEqual([]);

    // Still short, a day later: no change, still nothing.
    system.update(context(DAY_LENGTH_TICKS));
    expect(events.since(0), 'no crossing yet').toEqual([]);

    // The bench is placed.
    expect(placedObjects.place(placedObjectAt('object.bench', TILE(0, 0), 0))).toBe(true);

    system.update(context(2 * DAY_LENGTH_TICKS));
    const recorded = events.since(0);
    expect(recorded, 'the crossing to zero fires exactly one notice').toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      type: 'rooms.needs-cleared',
      roomNameKey: 'room.holding-cell.name',
      tick: 2 * DAY_LENGTH_TICKS,
    });

    // Nothing changed since: no second notice for a room that stayed ready.
    system.update(context(3 * DAY_LENGTH_TICKS));
    expect(events.since(0), 'a room that stayed ready announces nothing further').toHaveLength(1);
  });

  it('fires again after a later regression and repair, one notice per crossing', () => {
    const roomInstances = new RoomInstanceRegistry();
    registerHoldingCell(roomInstances, 'holding-cell-2');
    const placedObjects = new PlacedObjectRegistry();
    const world = ownedWorld();
    wall2x2(world);
    const events = new SimulationEventLog();
    const system = new RoomNeedsClearedNoticeSystem(
      { roomInstances },
      placedObjects,
      world,
      constantDoorReader(true),
      events,
    );

    expect(placedObjects.place(placedObjectAt('object.bench', TILE(0, 0), 0))).toBe(true);
    system.update(context(0));
    expect(events.since(0), 'already ready on the seeding tick: nothing to announce').toEqual([]);

    expect(placedObjects.remove('object:0:0')).toBe(true);
    system.update(context(DAY_LENGTH_TICKS));
    expect(events.since(0), 'a regression is silent -- this issue is only about confirming a repair').toEqual([]);

    expect(placedObjects.place(placedObjectAt('object.bench', TILE(0, 0), 0))).toBe(true);
    system.update(context(2 * DAY_LENGTH_TICKS));
    expect(events.since(0), 'the second repair fires its own notice').toHaveLength(1);
  });
});

describe('RoomNeedsClearedNoticeSystem: the doorway side of shortfallOf, the object side held constant', () => {
  it('fires once the day a door closes the perimeter a wall alone could not', () => {
    const roomInstances = new RoomInstanceRegistry();
    registerHoldingCell(roomInstances, 'holding-cell-3');
    const placedObjects = new PlacedObjectRegistry();
    // The bench is placed from the first tick and never moves: this block is
    // about the doorway side only.
    expect(placedObjects.place(placedObjectAt('object.bench', TILE(0, 0), 0))).toBe(true);
    const world = ownedWorld();
    wall2x2(world);
    const events = new SimulationEventLog();
    const { reader: doors, setPresent } = toggledDoorReader();
    const system = new RoomNeedsClearedNoticeSystem({ roomInstances }, placedObjects, world, doors, events);

    // Sealed with no door: `roomPerimeterAccess` reads `'no-way-in'`, exactly
    // the state issue #1006's own comment and #938 describe.
    system.update(context(0));
    expect(events.since(0), 'no door yet: nothing to announce on the seeding tick').toEqual([]);

    setPresent(true);
    system.update(context(DAY_LENGTH_TICKS));
    const recorded = events.since(0);
    expect(recorded, 'the door completes the crossing').toHaveLength(1);
    expect(recorded[0]).toMatchObject({ type: 'rooms.needs-cleared', roomNameKey: 'room.holding-cell.name' });
  });
});

describe('RoomNeedsClearedNoticeSystem: restore does not re-announce', () => {
  it('seeds silently even when every fixture reads ready on the very first update()', () => {
    const roomInstances = new RoomInstanceRegistry();
    registerHoldingCell(roomInstances, 'holding-cell-4');
    const placedObjects = new PlacedObjectRegistry();
    expect(placedObjects.place(placedObjectAt('object.bench', TILE(0, 0), 0))).toBe(true);
    const world = ownedWorld();
    wall2x2(world);
    const events = new SimulationEventLog();
    // Already ready before this system has ever run -- the shape a restored
    // session's first tick presents, per `restoreSessionSystems` running
    // before the kernel ever steps.
    const system = new RoomNeedsClearedNoticeSystem(
      { roomInstances },
      placedObjects,
      world,
      constantDoorReader(true),
      events,
    );

    system.update(context(0));
    expect(events.since(0), 'a room already fine on the seeding tick is not a repair').toEqual([]);

    // Confirmed still capable of firing afterwards, so this is a seeding
    // property and not the system going permanently silent.
    expect(placedObjects.remove('object:0:0')).toBe(true);
    system.update(context(DAY_LENGTH_TICKS));
    expect(placedObjects.place(placedObjectAt('object.bench', TILE(0, 0), 0))).toBe(true);
    system.update(context(2 * DAY_LENGTH_TICKS));
    expect(events.since(0)).toHaveLength(1);
  });
});

describe('RoomNeedsClearedNoticeSystem: a removed instance does not poison a reused id', () => {
  it('prunes a ready instance once it is no longer registered, so a later reuse of its id can cross again', () => {
    const roomInstances = new RoomInstanceRegistry();
    registerHoldingCell(roomInstances, 'holding-cell-5');
    const placedObjects = new PlacedObjectRegistry();
    expect(placedObjects.place(placedObjectAt('object.bench', TILE(0, 0), 0))).toBe(true);
    const world = ownedWorld();
    wall2x2(world);
    const events = new SimulationEventLog();
    const system = new RoomNeedsClearedNoticeSystem(
      { roomInstances },
      placedObjects,
      world,
      constantDoorReader(true),
      events,
    );

    // Seeds ready, silently (this test is not about the seeding property --
    // see the describe block above -- it only needs the id to start "ready"
    // in this system's own memory).
    system.update(context(0));
    expect(events.since(0)).toEqual([]);

    // The room is fully removed, and this system is given a chance to notice
    // -- an unregister with no intervening `update()` would never exercise
    // the prune at all.
    roomInstances.unregister('holding-cell-5');
    system.update(context(DAY_LENGTH_TICKS));
    expect(events.since(0), 'a removed room reports no crossing of its own').toEqual([]);

    // A new room registered under the same id, starting ready from its very
    // first tick under this system -- exactly the shape #1006 finding 5
    // measured (zoned and removed in short order), reused for the id rather
    // than the type. Without the prune above, `this.ready` would still hold
    // this id from before the removal and this crossing would be silently
    // swallowed as "no change".
    registerHoldingCell(roomInstances, 'holding-cell-5');
    system.update(context(2 * DAY_LENGTH_TICKS));
    expect(events.since(0), 'the reused id is free to cross again').toHaveLength(1);
  });
});
