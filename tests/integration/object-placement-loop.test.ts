import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { intakeStageFromIndex } from '../../src/simulation/prisoners/components';
import { NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';

/**
 * [ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * phase 1: **a player buys a plank, places a bed in a cell they zoned, and a
 * prisoner lives in it.**
 *
 * Every step below goes through the real kernel, the real decoder and the real
 * session command router, in the shape `prisoner-admission-loop.test.ts`
 * established: nothing calls `RoomInstanceRegistry.register`,
 * `PlacedObjectRegistry.place` or `admitPrisoner` by hand, because a test that
 * did would prove the pipeline works and say nothing about whether a command
 * can reach it.
 *
 * ## What was true before this change, and is measured here as being false now
 *
 * A zoned cell registered `capacity: 0` with no capabilities, so
 * `findAvailable` returned nothing, every arrival waited at
 * `accommodation-assignment` with a rising `accommodationBacklogTicks`, and
 * `StateIncomeSystem` paid `300 x 0` for ever. The status strip's
 * `roomCapacity` and `roomOccupants` could not leave zero in any session a
 * player could start, and the treasury could only ever go *down*.
 *
 * The chain that closes that is four links long and this file walks all four:
 * `PurchaseMaterials` fills the construction container, `PlaceObject` mints an
 * object order against it, a completed order writes a `PlacedObject`, and
 * `RoomCapacityResolver` turns the objects inside the cell's rectangle into a
 * `residentCapacity` of 1 and a `'sleep-surface'` capability. Only then does
 * `AdmitPrisoner` reach a prison that can house anybody.
 */

const SEED = 0x0b1ec7;
const CELL = 'room.cell';
const PRISON_ID = 'object-placement-prison';

/** `room.cell`'s authored minimum, and the smallest rectangle zoning accepts for one. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** Inside `CELL_RECT`, so the bed's 1x2 footprint lies wholly in the cell. */
const BED_TILE = { x: 4, y: 6 } as const;
/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 };
/** What one press of the Intake panel's control asks for, copied from `ADMISSION_REQUEST` in `src/main.ts`. */
const ADMISSION = { sentenceLengthTicks: 10_000, priorIncidents: 0 };

/** Dispatches one command through the kernel, at the sequence the kernel is expecting. */
function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison with one zoned cell, one plank bought, and a bed order placed --
 * the three commands a player sends before anything can be housed.
 *
 * The plank is bought *first* on purpose: `ProcurementSystem` delivers after
 * `PROCUREMENT_DELIVERY_DELAY_TICKS`, and an object order submitted against an
 * empty container simply waits in `materials-pending`, which is the same state
 * a wall waits in. Buying first makes the wait one delivery long rather than
 * two.
 */
function prisonWithBedOrdered(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  return runtime;
}

const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;

describe('a bed placed in a zoned cell gives that cell a capacity', () => {
  it('registers the cell with nothing, and gives it a bed and a capacity when the order finishes', () => {
    const runtime = prisonWithBedOrdered();

    // Zoned, and empty. This is the state every prison was permanently in
    // before this change, and it is still the state of a cell with no
    // furniture -- what changed is that it is now a state the player can leave.
    const zoned = runtime.prisoners.roomInstances.getById(cellInstanceId);
    expect(zoned).toMatchObject({ residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [] });
    // The rectangle, which is what gives the containment rule a domain.
    expect(zoned).toMatchObject({ width: CELL_RECT.width, height: CELL_RECT.height });
    expect(runtime.placedObjects.size).toBe(0);
    expect(runtime.prisoners.roomInstances.findAvailableResidence(CELL, 'sleep-surface')).toBeUndefined();

    // The order was accepted and is waiting for the plank. It has already been
    // approved -- `submit` steps the kernel, and `ConstructionSystem`'s
    // `phaseTicks: 0` schedule runs at tick 0 -- and it cannot advance past
    // `materials-pending` until the delivery lands 100 ticks later.
    expect(runtime.construction.getOrder('bed-1')?.state).toBe('approved');
    expect(runtime.refusals.count, 'none of the three commands may be refused').toBe(0);

    // 100 ticks of delivery delay, then three progress ticks of ten each on a
    // ten-tick schedule. 200 is comfortably past both and is not a boundary.
    stepTo(runtime, 200);

    expect(runtime.construction.getOrder('bed-1')?.state).toBe('completed');
    expect(runtime.placedObjects.size).toBe(1);
    // The id is derived from the anchor tile and nothing else -- no counter, no
    // `crypto.randomUUID()`.
    expect(runtime.placedObjects.objectAt({ x: 4, y: 6 } as never)).toMatchObject({
      placedObjectId: 'object:4:6',
      objectId: 'object.bed',
      orientation: 0,
    });
    // The second tile of the 1x2 footprint is claimed too, which is what stops
    // a second bed being placed half on top of this one.
    expect(runtime.placedObjects.objectAt({ x: 4, y: 7 } as never)?.placedObjectId).toBe('object:4:6');

    // **The number that could not move.** One bed of footprint width 1, so a
    // resident capacity of 1 -- nothing authored it, and nothing in any content
    // file says how many a cell holds.
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: 1,
      concurrentUseCapacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
    expect(runtime.prisoners.roomInstances.findAvailableResidence(CELL, 'sleep-surface')?.instanceId).toBe(cellInstanceId);
  });

  it('puts the capacity on the status strip, where it was pinned at zero', () => {
    const runtime = prisonWithBedOrdered();
    expect(projectStatusCounts(runtime, runtime.kernel.tick)).toMatchObject({ rooms: 1, roomCapacity: 0, roomOccupants: 0 });

    stepTo(runtime, 200);

    expect(projectStatusCounts(runtime, runtime.kernel.tick)).toMatchObject({ rooms: 1, roomCapacity: 1, roomOccupants: 0 });
  });

  it('houses an admitted prisoner, and pays for the place they occupy', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);
    const spentOnPlank = 25_000 - runtime.treasury.balanceMinorUnits;
    expect(spentOnPlank, 'one plank at its placeholder price').toBe(65);

    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    expect(runtime.refusals.count, 'a prison with a bed must not refuse the admission').toBe(0);
    const arrival = runtime.prisoners.entityStore.getIdByIndex(0);

    // `IntakeSystem` runs every five ticks and the arrival passes through
    // queued, reception, classification and accommodation-assignment, so a
    // handful of scheduled ticks is all it takes.
    stepTo(runtime, 240);

    const index = runtime.prisoners.entityStore.getIndex(arrival);
    expect(intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!)).toBe('completed');
    expect(runtime.prisoners.coldState.getAccommodation(arrival)).toBe(cellInstanceId);
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    expect(runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });
    // The cell is now full: one bed, one occupant.
    expect(runtime.prisoners.roomInstances.findAvailableResidence(CELL, 'sleep-surface')).toBeUndefined();

    // **The treasury moves upward for the first time from something other than
    // spending.** `StateIncomeSystem` pays once per in-game day, on the day's
    // last tick, per occupied place -- and until a room could hold anybody
    // `occupiedPlaces` was zero, so the line paid `300 x 0` in every session a
    // player could start.
    const beforeTheDayEnds = runtime.treasury.balanceMinorUnits;
    stepTo(runtime, 2_400);
    expect(runtime.treasury.balanceMinorUnits - beforeTheDayEnds).toBe(300);
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - 65 + 300);
  });

  it('lets the prisoner sleep, which is the whole point of the bed', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    const arrival = runtime.prisoners.entityStore.getIndex(runtime.prisoners.entityStore.getIdByIndex(0));
    const arrivalId = runtime.prisoners.entityStore.getIdByIndex(0);

    // Long enough for `ActionSystem` to select, travel and perform: the
    // prisoner walks to the cell's anchor tile and sleeps there.
    stepTo(runtime, 400);

    // `action.sleep`, resolved through the `own-accommodation` path -- by id,
    // re-checking neither the capacity nor the capability gate, which is why one
    // bed buys sleep, the toilet and eating in cell together.
    expect(DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[arrival]!]?.id).toBe('action.sleep');
    expect(runtime.prisoners.coldState.getActionTarget(arrivalId)).toBe(cellInstanceId);
    // And the need it fulfils is the one that stays high while every other one
    // falls: measured at tick 400, `sleep` is 254.7 of 255 while `hunger` has
    // dropped to 242.5 and `bladder` to 235. The bed is doing work.
    const sleepLevel = runtime.prisoners.needs.levels.sleep[arrival]! / NEED_SCALE;
    expect(sleepLevel).toBeGreaterThan(250);
    expect(runtime.prisoners.needs.levels.hunger[arrival]! / NEED_SCALE).toBeLessThan(sleepLevel);
  });
});

describe('a placement is refused rather than silently doing nothing', () => {
  it('refuses a tile another object already covers, including the far tile of its footprint', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);

    // (4,7) is the *second* tile of the bed's footprint, not its anchor. The
    // tile index is what makes this a refusal rather than two beds in one
    // place, and it is the thing an objects *plane* could answer while being
    // unable to say the two tiles are one bed.
    submit(runtime, 'place-overlap', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', x: 4, y: 7 }));

    expect(runtime.refusals.last?.reason).toBe('place-object.tile-occupied');
    expect(runtime.construction.getOrder('bed-2'), 'a refused placement mints no order').toBeUndefined();
    expect(runtime.placedObjects.size).toBe(1);
  });

  it('refuses a tile claimed by an order still in flight, before either object exists', () => {
    const runtime = prisonWithBedOrdered();
    // The first order is still waiting for its plank, so no object exists yet
    // -- and the tile must still not be handed out twice, or both orders would
    // finish and the second would have nowhere to stand.
    expect(runtime.placedObjects.size).toBe(0);

    submit(runtime, 'place-again', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...BED_TILE }));

    expect(runtime.refusals.last?.reason).toBe('place-object.tile-occupied');
    expect(runtime.construction.getOrder('bed-2')).toBeUndefined();
  });

  it('refuses a tile in no room, so a plank is never spent on an object nothing reads', () => {
    const runtime = prisonWithBedOrdered();
    // Owned land, inside the materialised chunk, and outside the cell. Capacity
    // is derived per room instance, so an object here would change nothing
    // observable -- ADR 0028 open question 5 leaves the *gesture* open and
    // `ObjectPlacementService` records why this answers it with a refusal.
    submit(runtime, 'place-field', packCommand({ type: 'PlaceObject', orderId: 'bed-3', definitionId: 'bed-wooden', x: 20, y: 20 }));

    expect(runtime.refusals.last?.reason).toBe('place-object.outside-room');
    expect(runtime.construction.getOrder('bed-3')).toBeUndefined();
  });

  it('refuses a buildable that places no object, rather than ordering it as a wall', () => {
    const runtime = prisonWithBedOrdered();
    submit(runtime, 'place-wall', packCommand({ type: 'PlaceObject', orderId: 'wall-1', definitionId: 'wall-brick', x: 4, y: 6 }));

    expect(runtime.refusals.last?.reason).toBe('place-object.not-a-placeable-object');
    expect(runtime.construction.getOrder('wall-1')).toBeUndefined();
  });

  it('refuses an order id the session already holds, rather than throwing out of a command dispatch', () => {
    const runtime = prisonWithBedOrdered();
    // The shape a queued command restored from a save has: the order exists and
    // the command arrives again. `ConstructionSystem.submitOrder` throws on a
    // duplicate id, and this is the guard that keeps the throw inside the
    // corruption check it was written as.
    submit(runtime, 'place-dup', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 5, y: 6 }));

    expect(runtime.refusals.last?.reason).toBe('place-object.duplicate-order');
    expect(runtime.placedObjects.size).toBe(0);
  });
});

describe('what the placement does to the rest of the prison', () => {
  it('leaves no dangling occupant when the room a bed stands in is un-zoned', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 240);
    const arrival = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(arrival)).toBe(cellInstanceId);

    // **Reachable for the first time.** `unzone` refuses an occupied room, and
    // that refusal used to be unreachable from a session zoned only through the
    // service -- a zoned room had `capacity: 0`, so nothing could ever be
    // living in one. A bed makes it a rule a player meets.
    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', ...CELL_RECT }));

    expect(runtime.refusals.last?.reason).toBe('unzone.room-occupied');
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId), 'the instance must survive').toBeDefined();
    expect(runtime.prisoners.coldState.getAccommodation(arrival)).toBe(cellInstanceId);
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
  });

  it('un-zones an empty cell with a bed still in it, and the bed keeps standing there', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);

    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', ...CELL_RECT }));

    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toBeUndefined();
    // The object outlives the room, because an object is not owned by one (ADR
    // 0028 decision 1's rejection of a record on the room). Nothing reads it
    // while it stands in no room, and re-zoning a cell around it counts it
    // again -- which is the next assertion.
    expect(runtime.placedObjects.size).toBe(1);

    submit(runtime, 'rezone', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));

    // A newly zoned room counts objects that were already standing there.
    // Refusing to would make the order of two player gestures change the
    // outcome, which is the same class of defect as iterating a `Map`.
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: 1,
      objectCapabilities: ['sleep-surface'],
    });
  });

  it('takes the bed back out of the world when the order that built it is undone', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(1);

    // Phase 1 ships no `RemoveObject` command, and `Undo` is not one: it
    // reverses the last construction transaction, and a completed order's
    // geometry goes with it -- which for a wall means the edge and for a bed
    // means the object. Without this the first misplaced bed would be permanent
    // while a misplaced wall is not.
    submit(runtime, 'undo', packCommand({ type: 'Undo' }));

    expect(runtime.placedObjects.size).toBe(0);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
  });

  it('carries the bed and the cell rectangle through a save, and derives the capacity again on load', () => {
    const runtime = prisonWithBedOrdered();
    stepTo(runtime, 200);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 240);

    const bundle = captureSessionSnapshot(runtime);
    // The objects section carries four fields per row and no capacity: the
    // capacity is a function of them and is recomputed on load, which is what
    // makes a restored session equal to the live one by construction.
    expect(bundle.simulation?.objects?.placedObjects).toEqual([
      { placedObjectId: 'object:4:6', objectId: 'object.bed', anchorTile: { x: 4, y: 6 }, orientation: 0 },
    ]);
    expect(bundle.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: cellInstanceId, roomCatalogId: CELL, anchorTile: { x: 4, y: 6 }, width: 2, height: 3 },
    ]);

    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: PRISON_ID,
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;

    expect(restored.placedObjects.getSnapshot()).toEqual(runtime.placedObjects.getSnapshot());
    expect(restored.prisoners.roomInstances.getById(cellInstanceId)).toEqual(
      runtime.prisoners.roomInstances.getById(cellInstanceId),
    );
    expect(restored.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    // And the restored prison keeps paying for the occupied place.
    const beforeTheDayEnds = restored.treasury.balanceMinorUnits;
    stepTo(restored, 2_400);
    expect(restored.treasury.balanceMinorUnits - beforeTheDayEnds).toBe(300);
  });

  it('produces byte-identical state for the same command order, and no RNG stream moves', () => {
    const left = prisonWithBedOrdered();
    const right = prisonWithBedOrdered();
    for (const runtime of [left, right]) {
      stepTo(runtime, 200);
      submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
      stepTo(runtime, 600);
    }

    // The whole session, through the encoder a save uses -- not just the
    // objects. Placement uses no RNG, so a run that places an object must
    // leave every named stream where a run that does not would.
    expect(JSON.stringify(captureSessionSnapshot(right))).toBe(JSON.stringify(captureSessionSnapshot(left)));

    // And the same prison built with the three commands in a different order
    // still ends with the same bed in the same cell: the placement is refused
    // or accepted on the state at its own tick, and none of the three depends
    // on which of the others ran first.
    const reordered = createNewSimulationRuntime(SEED);
    submit(reordered, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(reordered, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    submit(reordered, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
    stepTo(reordered, 200);

    expect(reordered.placedObjects.getSnapshot()).toEqual(left.placedObjects.getSnapshot());
    expect(reordered.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(1);
  });
});
