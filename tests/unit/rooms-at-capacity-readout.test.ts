import { describe, expect, it } from 'vitest';
import { placedObjectAt } from '../../src/simulation/objects';
import { projectRoomList } from '../../src/simulation/presentation';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { roomNeedsSubjectOf } from '../../src/ui/hud/rooms-panel';
import { roomNeedsFromProjections } from '../../src/ui/simulation-room-needs';
import { SCENARIO_SEED } from '../helpers/determinism-scenario';

/**
 * ADR 0028 phase 5's owed readout: a room that is *finished* and cannot take
 * another user (issues #997 and #1003).
 *
 * ## The state this exists for, and why nothing could see it
 *
 * `room.shower-room` asks for two `object.shower-head`
 * (`src/content/room-catalog.ts`), each `{ width: 1, height: 1 }` carrying
 * `['hygiene', 'shower']` (`src/content/object-catalog.ts`), and
 * `action.shower` requires `'hygiene'`
 * (`src/simulation/prisoners/actions.ts`). So a shower room built to its
 * authored minimum has a hygiene ceiling of **two**, whatever its floor area:
 * `room.shower-room` carries no `openArea: true`, so the ground rule ADR 0071
 * gives the yard has no domain here at all. Two heads for fifty prisoners is a
 * prison in which almost nobody washes, and before this readout the only
 * signal was a need sitting at zero in the Regime panel -- every room reading
 * complete, `requirementSummary.missingCapability` **0**, and the ceiling
 * published nowhere.
 *
 * ## Every number below is read off the catalogues, and no fixture states one
 *
 * The rooms are registered with zeroes and the real `RoomCapacityResolver`
 * derives the capacities from real `PlacedObject` rows -- the shape
 * `tests/unit/hud-projections.test.ts` uses and for its reason: an instance
 * whose capacities are typed into the fixture proves only that the fixture and
 * the assertion agree. The claims are taken through the real
 * `RoomInstanceRegistry.claimUse`, which is the gate the readout's sentences
 * are about, so the `inUse` figures are the gate's own count and not this
 * file's idea of one.
 *
 * The expected ceilings are written as literals (`2`, then `3` for a third
 * head) rather than read back from the registry, so a footprint or a
 * `minQuantity` edited underneath this file fails it instead of moving with
 * it.
 */

const TILE = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

interface Room {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly objects: readonly (readonly [string, { readonly x: number; readonly y: number }])[];
}

/** A 3x3 shower room -- the authored minimum -- holding `heads` shower heads in a row. */
function showerRoom(instanceId: string, heads: number): Room {
  return {
    instanceId,
    roomCatalogId: 'room.shower-room',
    anchorTile: TILE(8, 8),
    width: 3,
    height: 3,
    objects: Array.from({ length: heads }, (_, index) => ['object.shower-head', TILE(8 + index, 8)] as const),
  };
}

/**
 * ADR 0028's worked canteen: two `object.dining-table` and four
 * `object.bench`, which is `room.canteen`'s authored requirement exactly.
 *
 * The room whose numbers separate the per-capability ceiling from the
 * capability-blind total, which is issue #326. A table is `3x2` carrying
 * `['dining']` and a bench is `2x1` carrying `['seating', 'recreation']`, so
 * the room's total footprint width is `2x3 + 4x2 = 14` while its **dining**
 * ceiling -- the one `action.eat-meal` gates on -- is `2x3 = 6`. Any readout
 * that publishes 14 as "how many can eat here" is #326 back on screen, and
 * this fixture is what fails when one does.
 */
const WORKED_CANTEEN: Room = {
  instanceId: 'canteen-1',
  roomCatalogId: 'room.canteen',
  anchorTile: TILE(20, 8),
  width: 6,
  height: 6,
  objects: [
    ['object.dining-table', TILE(20, 8)],
    ['object.dining-table', TILE(23, 8)],
    ['object.bench', TILE(20, 11)],
    ['object.bench', TILE(22, 11)],
    ['object.bench', TILE(20, 12)],
    ['object.bench', TILE(22, 12)],
  ],
};

function furnish(rooms: readonly Room[]): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SCENARIO_SEED);
  for (const room of rooms) {
    runtime.prisoners.roomInstances.register({
      instanceId: room.instanceId,
      roomCatalogId: room.roomCatalogId,
      anchorTile: room.anchorTile as never,
      width: room.width,
      height: room.height,
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    for (const [objectId, anchor] of room.objects) {
      if (!runtime.placedObjects.place(placedObjectAt(objectId, anchor as never, 0))) {
        throw new Error(`the fixture's ${objectId} at (${anchor.x}, ${anchor.y}) must be placeable`);
      }
    }
  }
  runtime.roomCapacity.resolveAll();
  return runtime;
}

function listOf(runtime: SimulationRuntime) {
  return projectRoomList(runtime.prisoners, {}, { placedObjects: runtime.placedObjects });
}

function rowOf(runtime: SimulationRuntime, instanceId: string) {
  return listOf(runtime).rooms.rows.find((row) => row.instanceId === instanceId)!;
}

describe('the concurrent-use ceiling a room derives from its objects (ADR 0028 phase 5)', () => {
  it('publishes one ceiling per capability, from the heads standing in the room', () => {
    const runtime = furnish([showerRoom('shower-1', 2)]);

    // Two 1-tile heads, each carrying both capabilities: two places for each.
    expect(rowOf(runtime, 'shower-1').concurrentUse).toEqual([
      { capability: 'hygiene', capacity: 2, inUse: 0 },
      { capability: 'shower', capacity: 2, inUse: 0 },
    ]);
  });

  it('is the heads and not the floor: a third head in the same rectangle raises it to three', () => {
    // Issue #1003's measurement, which is the whole reason this readout exists:
    // capacity went 2 -> 3 with the 3x3 rectangle unchanged.
    const two = furnish([showerRoom('shower-1', 2)]);
    const three = furnish([showerRoom('shower-1', 3)]);

    expect(rowOf(two, 'shower-1').concurrentUse.map((use) => use.capacity)).toEqual([2, 2]);
    expect(rowOf(three, 'shower-1').concurrentUse.map((use) => use.capacity)).toEqual([3, 3]);
    // And the rectangle really is the same one, so the change is the object.
    expect(rowOf(three, 'shower-1').anchorTile).toEqual(rowOf(two, 'shower-1').anchorTile);
  });

  it("is the capability's own sum and never the room's total, which is issue #326 on screen", () => {
    const runtime = furnish([WORKED_CANTEEN]);
    const row = rowOf(runtime, 'canteen-1');

    // 2 tables x 3 for dining; 4 benches x 2 for each of the bench
    // capabilities. The room's capability-blind total is 14 and appears
    // nowhere -- a canteen that seats six diners must not read as seating
    // fourteen.
    expect(row.concurrentUse).toEqual([
      { capability: 'dining', capacity: 6, inUse: 0 },
      { capability: 'recreation', capacity: 8, inUse: 0 },
      { capability: 'seating', capacity: 8, inUse: 0 },
    ]);
    expect(row.concurrentUse.some((use) => use.capacity === 14)).toBe(false);
  });

  it('counts the claims the gate actually took, per capability', () => {
    const runtime = furnish([showerRoom('shower-1', 2)]);
    const registry = runtime.prisoners.roomInstances;

    expect(registry.claimUse('shower-1', 41, 'hygiene')).toBe(true);
    expect(registry.claimUse('shower-1', 42, 'hygiene')).toBe(true);
    // The room is full, and this is what makes "is full" a true sentence
    // rather than a readout's opinion.
    expect(registry.claimUse('shower-1', 43, 'hygiene')).toBe(false);

    expect(rowOf(runtime, 'shower-1').concurrentUse).toEqual([
      // `'shower'` is untouched: two washers do not make the room's other use
      // busy, which is the whole reason the ceiling is per capability (#326).
      { capability: 'hygiene', capacity: 2, inUse: 2 },
      { capability: 'shower', capacity: 2, inUse: 0 },
    ]);
  });

  it('does not project the resident capacity into it, or it into the resident capacity', () => {
    const runtime = furnish([showerRoom('shower-1', 2)]);
    const row = rowOf(runtime, 'shower-1');

    // A shower room houses nobody: no head is a sleep surface, so the resident
    // capacity is zero while two may use it at once. Reading either figure as
    // the other is what `RoomOccupancyViewModel`'s docblock forbids.
    expect(row.occupancy).toMatchObject({ current: 0, capacity: 0, free: 0 });
    expect(row.occupancy.utilization).toBeUndefined();
    expect(row.concurrentUse.some((use) => use.capacity > 0)).toBe(true);
  });
});

describe('what the Rooms panel is told about a finished room that is full', () => {
  it('reports the full room while calling nothing unfinished -- the state #1003 measured as invisible', () => {
    const runtime = furnish([showerRoom('shower-1', 2)]);
    const registry = runtime.prisoners.roomInstances;
    registry.claimUse('shower-1', 41, 'hygiene');
    registry.claimUse('shower-1', 42, 'hygiene');

    const needs = roomNeedsFromProjections(listOf(runtime), []);

    // The room holds both the heads it is authored to hold, so nothing is
    // missing -- which is exactly why no readout could say anything about it.
    expect(needs.unfinishedRooms).toBe(0);
    expect(needs.totalNeeds).toBe(0);
    expect(needs.atCapacity).toEqual([
      {
        instanceId: 'shower-1',
        roomLabelKey: 'room.shower-room.name',
        tile: { x: 8, y: 8 },
        places: 2,
        inUse: 2,
      },
    ]);
    expect(roomNeedsSubjectOf(needs)).toBe('at-capacity');
  });

  it('says nothing about a room with a free place, which is the sample that refutes the one above', () => {
    const runtime = furnish([showerRoom('shower-1', 2)]);
    runtime.prisoners.roomInstances.claimUse('shower-1', 41, 'hygiene');

    const needs = roomNeedsFromProjections(listOf(runtime), []);
    expect(needs.atCapacity).toEqual([]);
    expect(roomNeedsSubjectOf(needs)).toBe('none');
  });

  it('will not call a ceiling of zero full, however many nobodies are standing in it', () => {
    // An instance nobody has resolved -- a hand-built fixture, the one state
    // `concurrentUseCapacityFor`'s third case survives for -- claims a
    // capability with a total of zero. `0 >= 0` would report it full, and it
    // is the opposite: a room that cannot be used for that at all, with
    // nobody in it.
    const runtime = createNewSimulationRuntime(SCENARIO_SEED);
    runtime.prisoners.roomInstances.register({
      instanceId: 'shower-unresolved',
      roomCatalogId: 'room.shower-room',
      anchorTile: TILE(8, 8) as never,
      width: 3,
      height: 3,
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: ['hygiene'],
    });

    const list = projectRoomList(runtime.prisoners, {}, { placedObjects: runtime.placedObjects });
    expect(list.rooms.rows[0]?.concurrentUse).toEqual([{ capability: 'hygiene', capacity: 0, inUse: 0 }]);
    expect(roomNeedsFromProjections(list, []).atCapacity).toEqual([]);
  });
});

describe('which subject the "not ready" block draws', () => {
  const FULL_ROOM = {
    instanceId: 'shower-1',
    roomLabelKey: 'room.shower-room.name',
    tile: { x: 8, y: 8 },
    places: 2,
    inUse: 2,
  } as const;

  it('draws nothing at all when nothing has been asked', () => {
    expect(roomNeedsSubjectOf(undefined)).toBe('none');
  });

  it('draws nothing when every room is finished and none of them is full', () => {
    expect(
      roomNeedsSubjectOf({ unfinishedRooms: 0, totalRooms: 3, totalNeeds: 0, needs: [], atCapacity: [] }),
    ).toBe('none');
  });

  it('draws the unfinished rooms when there are any', () => {
    expect(
      roomNeedsSubjectOf({ unfinishedRooms: 1, totalRooms: 3, totalNeeds: 1, needs: [], atCapacity: [] }),
    ).toBe('unfinished');
  });

  it('prefers the unfinished rooms over the full ones, which is the cost the panel documents', () => {
    // One cell half-built and a shower room that is turning prisoners away:
    // the block names the cell. Both do not fit -- `ROOM_NEEDS_NAMED_LIMIT`
    // carries the 100px against 7.89px -- and this is the half that is given up.
    expect(
      roomNeedsSubjectOf({ unfinishedRooms: 1, totalRooms: 3, totalNeeds: 1, needs: [], atCapacity: [FULL_ROOM] }),
    ).toBe('unfinished');
  });

  it('draws the full rooms once nothing is unfinished', () => {
    expect(
      roomNeedsSubjectOf({ unfinishedRooms: 0, totalRooms: 3, totalNeeds: 0, needs: [], atCapacity: [FULL_ROOM] }),
    ).toBe('at-capacity');
  });
});
