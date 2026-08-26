import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES, intakeStageFromIndex } from '../../src/simulation/prisoners/components';
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
 * phase 3: **an object the player placed can be taken away again, and the room
 * it stood in survives it.**
 *
 * ## What was true before this change
 *
 * A placed object could be removed only by `Undo`, and `Undo` is bound to
 * `KeyZ` and to nothing else (`docs/INPUT.md`). The Build panel offers no
 * per-order control -- `tests/foundation/unconsumed-command-contract.test.ts`
 * still holds `CancelBuildOrder` on its unproduced list and records why -- and a
 * tile a standing object covers refuses every further placement
 * (`place-object.tile-occupied`). So **on a touch device a misplaced bed was
 * permanent for the session**, and a bed ordered against money the player did
 * not have claimed its tile for the session too, with the order stuck in
 * `materials-pending` and no gesture able to reach it.
 *
 * That is the state the Rooms tab shipped in and had to fix in a follow-up
 * (#312, then #317), and `AGENTS.md` boundary 10 is not satisfied by "it works
 * with a keyboard" any more than by "it works with a mouse".
 *
 * ## The two hard paths, which are the reason this is a phase of its own
 *
 * **A room that is occupied.** ADR 0028 decision 2 decides it: nobody is
 * evicted, the room stops accepting new occupants, and the room's `object`
 * requirement reads `'missing-capability'`. Measured below rather than asserted.
 *
 * **A room that is in use.** That decision was written before concurrent-use
 * claims existed (ADR 0029, #323), and a removal drops a capacity those claims
 * are bounded by. This file measures the answer this phase takes -- the claim
 * count is allowed to stand above the capacity and drains by itself, exactly as
 * the residency count is -- and `ObjectPlacementService.remove` argues why
 * against the two alternatives.
 *
 * Everything below goes through the real kernel, the real decoder and the real
 * session command router, in the shape `object-placement-loop.test.ts`
 * established: nothing calls `PlacedObjectRegistry.remove`, `claimUse` or
 * `updateDerived` by hand, because a test that did would prove the registry
 * works and say nothing about whether a press can reach it.
 */

const SEED = 0x0b1ec7;
const CELL = 'room.cell';
const YARD = 'room.yard';
const PRISON_ID = 'object-removal-prison';

/** `room.cell`'s authored minimum, and the same rectangle phases 1 and 2 measure. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** A second cell, so "the prison admits nobody new" is a statement about the *cell* and not about the prison running out of rooms. */
const SECOND_CELL_RECT = { x: 7, y: 6, width: 2, height: 3 } as const;
/** Inside `CELL_RECT`, so the bed's 1x2 footprint lies wholly in the cell. */
const BED_TILE = { x: 4, y: 6 } as const;
/** The bed's *second* footprint tile. A press here must remove the same bed, which is what the tile index is for. */
const BED_FAR_TILE = { x: 4, y: 7 } as const;
/** Also inside `CELL_RECT`, and not the bed's second tile. */
const TOILET_TILE = { x: 5, y: 6 } as const;
const SECOND_BED_TILE = { x: 7, y: 6 } as const;

/**
 * `room.yard`'s authored minimum (8x8, 64 tiles), on owned land and clear of
 * both cells.
 *
 * A yard because it is the one room type whose `action` -- `action.yard-recreation`
 * -- targets a room by catalogue id and declares **no** required object
 * capability, so a claim on it can be taken with only the two objects phases 1
 * and 2 ship. Phase 4 is what gives a canteen a dining table; until then this is
 * the honest way to reach the concurrent-use path with real content.
 */
const YARD_RECT = { x: 16, y: 4, width: 8, height: 8 } as const;
/**
 * Inside `YARD_RECT`. A bed in a yard is odd and legal: an object belongs to
 * whichever room's rectangle contains its anchor tile, and nothing refuses a
 * bed outdoors.
 *
 * It used to be load-bearing as well as odd. Before issue #326 the yard's
 * concurrent-use ceiling summed every object's footprint width whatever it was
 * for, so this bed *was* the yard's ceiling and gave the block below a bounded
 * room to measure. It is not one any more -- `action.yard-recreation` names no
 * capability and a rule that sums object footprints has no domain for it -- so
 * the bed now buys the yard a `'sleep-surface'` ceiling nothing asks for, and
 * the block below measures that instead.
 */
const YARD_BED_TILE = { x: 16, y: 4 } as const;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 };
/** What one press of the Intake panel's control asks for, copied from `ADMISSION_REQUEST` in `src/main.ts`. */
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 };

const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;
const secondCellInstanceId = `${CELL}:${SECOND_CELL_RECT.x}:${SECOND_CELL_RECT.y}`;
const yardInstanceId = `${YARD}:${YARD_RECT.x}:${YARD_RECT.y}`;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** A furnished cell: the state phase 2 leaves, and the one a removal has to be able to undo. */
function prisonWithFurnishedCell(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', ...TOILET_TILE }));
  return runtime;
}

/** The object requirement statuses a room reads, keyed by object id. `projectRoomDetail` is the only thing that answers this. */
function objectRequirementStatuses(runtime: SimulationRuntime, instanceId: string): Record<string, string> {
  const detail = projectRoomDetail(runtime.prisoners, instanceId);
  const statuses: Record<string, string> = {};
  for (const requirement of detail?.requirements ?? []) {
    if (requirement.objectId === undefined) continue;
    statuses[requirement.objectId] = requirement.status;
  }
  return statuses;
}

describe('a removed object takes its capacity and its capability with it', () => {
  it('drops the capability and both capacities, and the tile becomes placeable again', () => {
    const runtime = prisonWithFurnishedCell();
    stepTo(runtime, 200);

    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: 1,
      concurrentUseCapacity: 2,
      objectCapabilities: ['sanitation', 'sleep-surface'],
    });

    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    expect(runtime.refusals.count, 'removing a standing object must not be refused').toBe(0);
    expect(runtime.placedObjects.size).toBe(1);
    expect(runtime.placedObjects.objectAt(BED_TILE as never)).toBeUndefined();
    // The far tile of the 1x2 footprint is released too. Leaving it claimed
    // would make the tile un-placeable and un-removable at once, which is the
    // shape of leak the tile index exists to make impossible.
    expect(runtime.placedObjects.objectAt(BED_FAR_TILE as never)).toBeUndefined();

    // **The numbers that had to move.** The toilet is still standing, so this is
    // the toilet's contribution alone -- `sanitation` and a footprint width of
    // 1 -- and not a room reset to zero.
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: 0,
      concurrentUseCapacity: 1,
      objectCapabilities: ['sanitation'],
    });
    expect(runtime.prisoners.roomInstances.findAvailableResidence(CELL, 'sleep-surface')).toBeUndefined();
    // And the status strip, where the capacity became visible in phase 1.
    expect(projectStatusCounts(runtime, runtime.kernel.tick)).toMatchObject({ rooms: 1, roomCapacity: 0 });

    // The tile is free, and the proof is that a second bed can be built there
    // -- which is what a player who removed a bed to move it needs.
    submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-3', itemId: 'item.wood-plank', quantity: 1 }));
    submit(runtime, 'replace-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...BED_TILE }));
    expect(runtime.refusals.count, 'the freed tile must accept a placement').toBe(0);
    stepTo(runtime, 400);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(1);
  });

  it('removes the object a press lands on, from any tile of its footprint', () => {
    const runtime = prisonWithFurnishedCell();
    stepTo(runtime, 200);

    // (4,7) is the bed's second tile and not its anchor, so its derived id is
    // not `object:4:7`. A removal keyed on the pressed tile rather than on the
    // anchor is the whole reason `RemoveObject` carries a tile: the player
    // pressed the bottom half of the bed and meant the bed.
    submit(runtime, 'remove-far', packCommand({ type: 'RemoveObject', ...BED_FAR_TILE }));

    expect(runtime.refusals.count).toBe(0);
    expect(runtime.placedObjects.getSnapshot().map((object) => object.placedObjectId)).toEqual(['object:5:6']);
  });

  it('refuses a press on a tile with nothing on it, rather than reporting a removal that did not happen', () => {
    const runtime = prisonWithFurnishedCell();
    stepTo(runtime, 200);

    // Inside the cell, owned, in bounds -- and empty. Both objects are still
    // standing afterwards, which is what distinguishes a refusal from a removal
    // that hit the wrong row.
    submit(runtime, 'remove-empty', packCommand({ type: 'RemoveObject', x: 5, y: 8 }));

    expect(runtime.refusals.last?.reason).toBe('remove-object.nothing-to-remove');
    expect(runtime.placedObjects.size).toBe(2);

    // And far outside the materialised world, which answers the same way and
    // must not grow the world on the way there: nothing here writes a tile.
    const chunksBefore = captureSessionSnapshot(runtime).world.chunks.length;
    submit(runtime, 'remove-void', packCommand({ type: 'RemoveObject', x: 9_000, y: 9_000 }));
    expect(runtime.refusals.last?.reason).toBe('remove-object.nothing-to-remove');
    expect(captureSessionSnapshot(runtime).world.chunks.length).toBe(chunksBefore);
  });

  it('cancels a placement still being built, so a tile under a stalled order is not claimed for the session', () => {
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    // No plank bought, so the order waits in `materials-pending` for ever. This
    // is the trap: nothing stands on the tile, so a removal that only looked at
    // standing objects would answer `nothing-to-remove`, and `PlaceObject`
    // refuses `tile-occupied` against the footprints of orders in flight -- so
    // the tile would be unusable and unrecoverable without a keyboard.
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    stepTo(runtime, 200);
    expect(runtime.construction.getOrder('bed-1')?.state).toBe('materials-pending');
    expect(runtime.placedObjects.size).toBe(0);

    submit(runtime, 'remove-pending', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    expect(runtime.refusals.count, 'a pending order on the tile is something to remove').toBe(0);
    expect(runtime.construction.getOrder('bed-1')?.state).toBe('cancelled');
    // The tile is free again, proved by a placement that would have been refused
    // `tile-occupied` a moment earlier.
    submit(runtime, 'place-again', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...BED_TILE }));
    expect(runtime.refusals.count).toBe(0);
    // One `ConstructionSystem` cycle on, so the new order has been through
    // approval and is waiting on the same empty container the first one was --
    // which is the state that proves the tile, and not the money, was the thing
    // the removal freed.
    stepTo(runtime, 240);
    expect(runtime.construction.getOrder('bed-2')?.state).toBe('materials-pending');
  });

  it('gives back the materials a cancelled order had allocated, and does not refund a built object', () => {
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }));
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    // Past the delivery and past the allocation, but not past the work: the
    // order holds its plank and has not spent it on anything. Measured on the
    // real schedule -- the delivery lands at 100, the allocation at 120 and the
    // order completes at 160, so 130 is inside the one window where a cancelled
    // order has something to give back.
    stepTo(runtime, 130);
    expect(runtime.construction.getOrder('bed-1')?.state).toBe('in-progress');
    const allocatedWhileBuilding = runtime.construction.getOrder('bed-1')?.materialsAllocated.length ?? 0;
    expect(allocatedWhileBuilding).toBeGreaterThan(0);

    submit(runtime, 'remove-pending', packCommand({ type: 'RemoveObject', ...BED_TILE }));
    expect(runtime.construction.getOrder('bed-1')?.materialsAllocated).toEqual([]);

    // The second plank builds a second bed all the way, and removing *that* one
    // gives nothing back: the plank became a bed. The asymmetry is the decision
    // -- an order that never finished releases what it was holding, and a thing
    // built out of the materials does not un-build into them.
    submit(runtime, 'place-again', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...BED_TILE }));
    stepTo(runtime, 500);
    expect(runtime.construction.getOrder('bed-2')?.state).toBe('completed');
    const treasuryBefore = runtime.treasury.balanceMinorUnits;
    submit(runtime, 'remove-built', packCommand({ type: 'RemoveObject', ...BED_TILE }));
    expect(runtime.treasury.balanceMinorUnits).toBe(treasuryBefore);
    expect(runtime.placedObjects.size).toBe(0);
  });

  it('refuses a second press on a tile whose object has already gone', () => {
    const runtime = prisonWithFurnishedCell();
    stepTo(runtime, 200);
    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));
    expect(runtime.refusals.count).toBe(0);

    // The completed order is still `completed` -- a removal reverses no order --
    // and it must not be mistaken for an order still building something here,
    // or the second press would cancel it and refund a plank that became a bed.
    expect(runtime.construction.getOrder('bed-1')?.state).toBe('completed');
    submit(runtime, 'remove-again', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    expect(runtime.refusals.last?.reason).toBe('remove-object.nothing-to-remove');
    expect(runtime.construction.getOrder('bed-1')?.state).toBe('completed');
  });
});

describe('a bed removed from an occupied cell evicts nobody (ADR 0028 decision 2)', () => {
  /** The furnished prison with a second cell, one prisoner housed in the first, and both beds standing. */
  function prisonWithHousedPrisoner(): { readonly runtime: SimulationRuntime; readonly prisoner: number } {
    const runtime = prisonWithFurnishedCell();
    submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-3', itemId: 'item.wood-plank', quantity: 1 }));
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    submit(runtime, 'place-bed-2', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
    stepTo(runtime, 200);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 260);
    const prisoner = runtime.prisoners.entityStore.getIdByIndex(0);
    // The first cell sorts first by instance id, so this is where intake put
    // them -- asserted rather than assumed, because every measurement below is
    // about *that* cell losing its bed.
    expect(runtime.prisoners.coldState.getAccommodation(prisoner)).toBe(cellInstanceId);
    return { runtime, prisoner };
  }

  it('keeps the prisoner housed, stops the cell taking anybody new, and reads the requirement as missing', () => {
    const { runtime, prisoner } = prisonWithHousedPrisoner();
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    expect(objectRequirementStatuses(runtime, cellInstanceId)).toEqual({
      'object.bed': 'satisfied-by-capability',
      'object.toilet': 'satisfied-by-capability',
    });

    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // **Nobody is evicted.** The prisoner keeps the accommodation they were
    // given, and the occupant set keeps them -- so the cell is now occupied by
    // one and has room for none, which ADR 0028 decision 2 names as a legal
    // state rather than a defect to repair.
    expect(runtime.prisoners.coldState.getAccommodation(prisoner)).toBe(cellInstanceId);
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(0);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'the state still pays for the place they occupy').toBe(1);

    // **The cell admits nobody new**, and the second cell still does -- so this
    // is the cell refusing, not the prison having run out.
    expect(runtime.prisoners.roomInstances.assign(cellInstanceId, 4_242 as never)).toBe(false);
    expect(runtime.prisoners.roomInstances.findAvailableResidence(CELL, 'sleep-surface')?.instanceId).toBe(secondCellInstanceId);

    // **The requirement flips to missing.** The toilet is untouched, which is
    // what makes this a statement about the bed rather than about the room being
    // reset.
    expect(objectRequirementStatuses(runtime, cellInstanceId)).toEqual({
      'object.bed': 'missing-capability',
      'object.toilet': 'satisfied-by-capability',
    });
    // The projection reads the over-capacity room as full with nothing free,
    // clamped rather than negative -- ADR 0028 decision 2 records that "over
    // capacity" is a sentence phase 5 owes and this shape cannot yet say.
    expect(projectRoomDetail(runtime.prisoners, cellInstanceId)?.occupancy).toMatchObject({ current: 1, capacity: 0, free: 0 });
  });

  it('keeps the prisoner sleeping in the cell whose bed has gone, because own-accommodation re-checks nothing', () => {
    const { runtime, prisoner } = prisonWithHousedPrisoner();
    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // The sleep block is `[0, 400)` of each day and `action.sleep` targets
    // `own-accommodation`, which resolves by id and checks neither gate. So the
    // prisoner keeps sleeping in a cell with no bed in it -- which is the
    // "degrade visibly, never hard-fail" answer the ADR reached with no new
    // mechanic, and it is measured here rather than trusted.
    stepTo(runtime, 2_500);
    const index = runtime.prisoners.entityStore.getIndex(prisoner);
    expect(DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[index]!]?.id).toBe('action.sleep');
    expect(runtime.prisoners.coldState.getActionTarget(prisoner)).toBe(cellInstanceId);
    expect(ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]).toBe('performing');
  });

  it('leaves nothing inconsistent after a long run, and the room cannot be un-zoned from under them', () => {
    const { runtime, prisoner } = prisonWithHousedPrisoner();
    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // Five in-game days past the removal. The point is that nothing throws out
    // of `Kernel.step()`: an over-capacity room is walked by the intake system,
    // the action system, the income system and both projections on every
    // scheduled tick, and a capacity below an occupant count is the arithmetic
    // that would produce a `RangeError` or a negative bounded value if any of
    // them subtracted without clamping.
    expect(() => stepTo(runtime, 12_000)).not.toThrow();

    const index = runtime.prisoners.entityStore.getIndex(prisoner);
    expect(intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!)).toBe('completed');
    expect(runtime.prisoners.coldState.getAccommodation(prisoner)).toBe(cellInstanceId);
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
    // No claim outlived the action that took it, over five days of them.
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(0);
    // The registry and the tile index still agree, and neither holds the bed.
    // The cell's toilet and the *second* cell's bed, and nothing at (4,6).
    expect(runtime.placedObjects.getSnapshot().map((object) => object.placedObjectId)).toEqual(['object:5:6', 'object:7:6']);
    expect(runtime.placedObjects.objectAt(BED_TILE as never)).toBeUndefined();
    // Every requirement is still answerable, and the projection still resolves.
    expect(projectRoomDetail(runtime.prisoners, cellInstanceId)).toBeDefined();

    // And the guard that keeps a reference from dangling is unmoved by the
    // removal: `unzone` still refuses a room somebody is living in, so a removal
    // has not opened a route to unregistering an instance under a prisoner.
    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', ...CELL_RECT }));
    expect(runtime.refusals.last?.reason).toBe('unzone.room-occupied');
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toBeDefined();
  });
});

describe('a removal that drops capacity below the claims held on a room (ADR 0029)', () => {
  /**
   * A prison whose yard has one object in it and **both** prisoners performing
   * there.
   *
   * Two prisoners because "the room is not bounded by its furniture" is
   * indistinguishable from "nobody asked" with one.
   */
  function prisonWithYardInUse(): {
    readonly runtime: SimulationRuntime;
    readonly first: number;
    readonly second: number;
  } {
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 3 }));
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: YARD, ...YARD_RECT }));
    submit(runtime, 'bed-1', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    submit(runtime, 'bed-2', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
    submit(runtime, 'bed-yard', packCommand({ type: 'PlaceObject', orderId: 'bed-3', definitionId: 'bed-wooden', ...YARD_BED_TILE }));
    // Three beds, and the crew builds one at a time: 100 ticks for the plank
    // delivery, then 40 ticks per bed once the queue is moving. 400 clears all
    // three with headroom, where 220 cleared them only because they used to be
    // built simultaneously.
    stepTo(runtime, 400);
    // One bed of footprint width 1, so the yard's all-objects total is 1 and its
    // one per-capability ceiling is `'sleep-surface'` of 1. Nothing authored
    // either: both are the object's own width. Neither bounds
    // `action.yard-recreation`, which names no capability.
    expect(runtime.prisoners.roomInstances.getById(yardInstanceId)).toMatchObject({
      concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['sleep-surface', 1]],
    });

    submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    submit(runtime, 'admit-2', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, x: ARRIVAL.x + 1, y: ARRIVAL.y }));
    // Into the recreation block, `[1000, 1200)` of the day, whose only legal
    // category is `recreation`. `action.yard-recreation` outscores
    // `action.common-room-recreation` (recreation 3 plus safety against
    // recreation 2) and no common room is zoned anyway, so the yard is where
    // both of them go.
    stepTo(runtime, 1_040);

    const first = runtime.prisoners.entityStore.getIdByIndex(0);
    const second = runtime.prisoners.entityStore.getIdByIndex(1);
    // **Both are in the yard**, which is the #326 fix at the far end of the real
    // command path. On the previous rule the bed's width of 1 was the ceiling
    // and the second prisoner was refused the claim outright -- so a prison
    // whose yard happened to contain no furniture admitted nobody to sixty-four
    // tiles of open ground, and one with a delivery door in it admitted three.
    expect(runtime.prisoners.roomInstances.useOccupancyOf(yardInstanceId)).toBe(2);
    expect(runtime.prisoners.coldState.getActionTarget(first)).toBe(yardInstanceId);
    expect(runtime.prisoners.coldState.getActionTarget(second)).toBe(yardInstanceId);
    return { runtime, first, second };
  }

  it('takes every derived figure with it and refuses nobody, because none of them bounded the action', () => {
    const { runtime, first, second } = prisonWithYardInUse();
    const firstIndex = runtime.prisoners.entityStore.getIndex(first);
    const secondIndex = runtime.prisoners.entityStore.getIndex(second);

    submit(runtime, 'remove-yard-bed', packCommand({ type: 'RemoveObject', ...YARD_BED_TILE }));

    expect(runtime.refusals.count, 'a room in use is still removable from').toBe(0);
    // Both derived figures go, and the capability with them: the removal did
    // everything a removal does.
    expect(runtime.prisoners.roomInstances.getById(yardInstanceId)).toMatchObject({
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      concurrentUseCapacityByCapability: [],
      objectCapabilities: [],
    });

    // **And nothing about the yard's use changed**, because none of those
    // numbers was ever this action's ceiling. Both claims stand, both prisoners
    // keep performing, and the room still admits. On the pre-#326 rule this same
    // removal shut the yard: the ceiling fell to 0, `findAvailableForUse`
    // answered `undefined`, and an empty yard was a room nobody could stand in.
    expect(runtime.prisoners.roomInstances.useOccupancyOf(yardInstanceId)).toBe(2);
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(2);
    expect(ACTION_PHASES[runtime.prisoners.currentAction.phase[firstIndex]!]).toBe('performing');
    expect(ACTION_PHASES[runtime.prisoners.currentAction.phase[secondIndex]!]).toBe('performing');
    expect(runtime.prisoners.roomInstances.findAvailableForUse(YARD)?.instanceId).toBe(yardInstanceId);
    expect(runtime.prisoners.roomInstances.claimUse(yardInstanceId, 4_242 as never)).toBe(true);

    // Unbounded is not "anything goes": the emptied yard admits nobody to
    // anything that needs an object, so no capability-naming action falls
    // through the same hole.
    expect(runtime.prisoners.roomInstances.findAvailableForUse(YARD, 'sleep-surface')).toBeUndefined();
    expect(runtime.prisoners.roomInstances.claimUse(yardInstanceId, 4_243 as never, 'sleep-surface')).toBe(false);
  });

  it('drains the claims when the actions end, leaking nothing and double-releasing nothing', () => {
    const { runtime } = prisonWithYardInUse();
    submit(runtime, 'remove-yard-bed', packCommand({ type: 'RemoveObject', ...YARD_BED_TILE }));
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(2);

    /*
     * Nothing in `ActionSystem`'s three release sites consults a capacity, which
     * is why a dropped capacity can neither leak a claim nor strand one. A claim
     * that is taken and never released would accumulate: two prisoners can hold
     * at most two at a time, so a **ceiling of 2 sampled on every tick of five
     * days** -- through every recreation block in them, so the claims really
     * were taken and released many times over -- is the statement that no claim
     * outlived its action. A claim released twice, or released without having
     * been taken, would drive the registry-wide counter below the number of
     * performers and silently *raise* every room's effective capacity for the
     * rest of the session.
     *
     * **The per-tick ceiling replaced a single sample at tick 14,000, and the
     * reason is worth recording** ([ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)).
     * That sample read zero only because both prisoners were standing idle
     * through the `[1800, 2000)` block, whose `recreation` category they could
     * once select and never resolve. With the fallback they spend that block in
     * the yard, so tick 14,000 lands on the last tick of a legitimately held
     * pair of claims -- measured: both `performing action.yard-recreation`,
     * target `room.yard:16:4`, `phaseStartedAtTick` 13,900, `minDurationTicks`
     * 100. Nothing leaked; the sample tick had simply been chosen when the yard
     * was unreachable. A ceiling over every tick cannot be fooled by that, and
     * the zero is re-read at tick 15,000, a tick-of-day of 600 in the
     * `work`/`education` block where no action in `DEFAULT_ACTIONS` resolves in
     * this prison at all.
     */
    let maxUseClaims = 0;
    expect(() => {
      for (let tick = runtime.kernel.tick + 1; tick <= 15_000; tick += 1) {
        stepTo(runtime, tick);
        maxUseClaims = Math.max(maxUseClaims, runtime.prisoners.roomInstances.totalUseClaims);
      }
    }).not.toThrow();
    expect(maxUseClaims, 'two prisoners can hold at most two claims at once, however many they take and release').toBe(2);
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(0);
    expect(runtime.prisoners.roomInstances.useOccupancyOf(yardInstanceId)).toBe(0);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(2);
  });

  it('brings the removed object s own ceiling back when it is placed again', () => {
    const { runtime } = prisonWithYardInUse();
    submit(runtime, 'remove-yard-bed', packCommand({ type: 'RemoveObject', ...YARD_BED_TILE }));
    stepTo(runtime, 1_180);
    expect(runtime.prisoners.roomInstances.findAvailableForUse(YARD, 'sleep-surface')).toBeUndefined();

    submit(runtime, 'buy-again', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 }));
    submit(runtime, 'bed-yard-2', packCommand({ type: 'PlaceObject', orderId: 'bed-4', definitionId: 'bed-wooden', ...YARD_BED_TILE }));
    stepTo(runtime, 1_400);

    // The capacity comes back from the object and nothing else -- there is no
    // remembered figure to restore, which is what makes the resolver's
    // idempotence the whole of the recovery.
    expect(runtime.prisoners.roomInstances.getById(yardInstanceId)).toMatchObject({
      concurrentUseCapacity: 1,
      concurrentUseCapacityByCapability: [['sleep-surface', 1]],
    });
    expect(runtime.prisoners.roomInstances.findAvailableForUse(YARD, 'sleep-surface')?.instanceId).toBe(yardInstanceId);
  });

  /*
   * **Where ADR 0029's over-capacity property went, and why it is not here.**
   *
   * This block used to prove it: a claim standing above a ceiling a removal had
   * dropped, with the door shut behind it. It could do that because the yard's
   * ceiling summed every object's footprint width, so a *bed* in a yard bounded
   * `action.yard-recreation` -- which is the defect issue #326 removed, and
   * which `YARD_BED_TILE`'s comment named as odd before it was known to be
   * wrong.
   *
   * The property is unchanged and still holds. What it lost is its route
   * through a command: no placeable buildable supplies a capability any
   * `room-catalog-id` action asks for. `bed-wooden` gives `'sleep-surface'` and
   * `toilet-brick` gives `'sanitation'`, and `action.sleep` and
   * `action.use-toilet` both target `own-accommodation`, which re-checks neither
   * gate. So until ADR 0028 phase 4 makes a dining table placeable there is no
   * bounded, command-reachable concurrent-use room to drop a ceiling under.
   *
   * It is proven over the real `ActionSystem` in
   * `tests/unit/prisoners-concurrent-room-use.test.ts` -- "a ceiling lowered
   * under a standing claim closes the door without evicting anybody" -- and this
   * comment is here so the move is a recorded relocation rather than a deletion
   * somebody has to find.
   */
});

describe('a removal is deterministic and survives a save', () => {
  it('gives byte-identical state for the same command order', () => {
    const build = (): SimulationRuntime => {
      const runtime = prisonWithFurnishedCell();
      stepTo(runtime, 200);
      submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
      stepTo(runtime, 300);
      submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));
      stepTo(runtime, 900);
      return runtime;
    };

    // The whole session through the encoder a save uses, not just the objects.
    // A removal uses no RNG, so a run that removes an object must leave every
    // named stream where a run that does not would.
    expect(JSON.stringify(captureSessionSnapshot(build()))).toBe(JSON.stringify(captureSessionSnapshot(build())));
  });

  it('does not let the order two removals were sent in decide the outcome', () => {
    /** Removes the bed and the toilet, in the order given, from the same starting prison. */
    const removeIn = (tiles: readonly { readonly x: number; readonly y: number }[]): SimulationRuntime => {
      const runtime = prisonWithFurnishedCell();
      stepTo(runtime, 200);
      tiles.forEach((tile, index) => {
        submit(runtime, `remove-${index}`, packCommand({ type: 'RemoveObject', ...tile }));
      });
      stepTo(runtime, 400);
      return runtime;
    };

    const bedFirst = removeIn([BED_TILE, TOILET_TILE]);
    const toiletFirst = removeIn([TOILET_TILE, BED_TILE]);

    expect(bedFirst.placedObjects.size).toBe(0);
    expect(JSON.stringify(captureSessionSnapshot(toiletFirst))).toBe(JSON.stringify(captureSessionSnapshot(bedFirst)));
  });

  it('keeps the registry in canonical (y, x) order across a removal from the middle', () => {
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 3 }));
    submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: YARD, ...YARD_RECT }));
    // Three toilets down one column, so the middle one can be taken out of the
    // middle of the sorted walk. Toilets rather than beds because a toilet is
    // 1x1 and three of them fit in consecutive rows.
    for (const [index, y] of [4, 5, 6].entries()) {
      submit(runtime, `t-${index}`, packCommand({ type: 'PlaceObject', orderId: `toilet-${index}`, definitionId: 'toilet-brick', x: 16, y }));
    }
    stepTo(runtime, 300);
    expect(runtime.placedObjects.all().map((object) => object.placedObjectId)).toEqual(['object:16:4', 'object:16:5', 'object:16:6']);

    submit(runtime, 'remove-middle', packCommand({ type: 'RemoveObject', x: 16, y: 5 }));

    // Ascending `(y, x)`, still, with the hole closed rather than left as a gap
    // and without the survivors reordering by insertion history. The payload
    // takes the same walk, so a disturbed order here would move
    // `computeSaveChecksum`.
    expect(runtime.placedObjects.all().map((object) => object.placedObjectId)).toEqual(['object:16:4', 'object:16:6']);
    expect(captureSessionSnapshot(runtime).simulation?.objects?.placedObjects.map((object) => object.placedObjectId)).toEqual([
      'object:16:4',
      'object:16:6',
    ]);
  });

  it('round-trips a V5 save taken after a removal, and derives the same capacity again', () => {
    const runtime = prisonWithFurnishedCell();
    stepTo(runtime, 200);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 300);
    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    const bundle = captureSessionSnapshot(runtime);
    // The removed row is gone from the section rather than tombstoned. A removal
    // deletes a row from a section that already exists, which is why phase 3
    // moves no save version.
    expect(bundle.simulation?.objects?.placedObjects).toEqual([
      { placedObjectId: 'object:5:6', objectId: 'object.toilet', anchorTile: { x: 5, y: 6 }, orientation: 0 },
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
    // **The over-capacity room survives the round trip**, and it survives it by
    // being recomputed rather than remembered: the save carries neither capacity
    // nor capability, so a restored occupied-and-capacity-zero cell is the
    // resolver reaching the same answer from the same objects.
    expect(restored.prisoners.roomInstances.getById(cellInstanceId)).toEqual(
      runtime.prisoners.roomInstances.getById(cellInstanceId),
    );
    expect(restored.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(0);
    expect(restored.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    expect(objectRequirementStatuses(restored, cellInstanceId)).toEqual({
      'object.bed': 'missing-capability',
      'object.toilet': 'satisfied-by-capability',
    });

    // And the restored session keeps running from there without throwing, which
    // is the half a snapshot equality cannot see.
    expect(() => stepTo(restored, 3_000)).not.toThrow();
    expect(restored.prisoners.roomInstances.totalOccupancy).toBe(1);
  });
});
