import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { stateIncomeForCompletedDay } from '../../src/simulation/economy';
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
import { wallRoomPerimeter } from '../helpers/room-walls';
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
 * A **second** bed inside `CELL_RECT`, so the cell derives a `residentCapacity`
 * of 2 and a removal can drop it to 1 rather than to 0.
 *
 * The same tile `TOILET_TILE` names, and never in the same prison: the two-bed
 * fixture (ADR 0076 decision A(i)'s "excess") furnishes no toilet, because
 * `room.cell`'s 2x3 authored minimum has exactly two 1x2 columns and both are
 * spoken for. Named separately rather than reusing `TOILET_TILE` because what
 * a reader needs to know here is that it is a bed, not that it is where a
 * toilet goes in a different fixture.
 */
const SECOND_BED_IN_CELL_TILE = { x: 5, y: 6 } as const;

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
/**
 * What one press of the Intake panel's control asks for -- the tile and `priorIncidents: 0` from
 * `ADMISSION_REQUEST` in `src/main.ts`, and a sentence length that press no longer sends.
 * Since #535 decision 5 an omitted length is drawn inside the simulation from
 * `prisoners.sentence`; naming one here is still legal, is never redrawn, and is what keeps
 * this fixture's timings fixed.
 */
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
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
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

  it('cancels a placement still being built, so a tile under an unfinished order is not claimed for the session', () => {
    const runtime = createNewSimulationRuntime(SEED);
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    /*
     * **The stall this used to rely on no longer exists, and the case is the
     * same one.** It read *"No plank bought, so the order waits in
     * `materials-pending` for ever"* -- true until ADR 0017 decision 7 was
     * implemented (#627), which has the order buy its own plank at the press.
     * The order therefore waits for a *delivery* now, for
     * `PROCUREMENT_DELIVERY_DELAY_TICKS`, and then builds.
     *
     * The trap being guarded is untouched by that: nothing stands on the tile
     * while the order is in flight, so a removal that only looked at standing
     * objects would answer `nothing-to-remove`, and `PlaceObject` refuses
     * `tile-occupied` against the footprints of orders in flight -- so the tile
     * would be unusable and unrecoverable without a keyboard. What changes is
     * *when* the window is open, so the measurements below happen inside it
     * rather than at an arbitrary tick 200 that used to be safe because the
     * window never closed.
     */
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    stepTo(runtime, 20);
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
    // approval and is waiting on its own delivery -- which is the state that
    // proves the tile, and not the money, was the thing the removal freed. The
    // second order buys nothing: the first order's plank is still in flight and
    // the deficit nets it off, which is why the balance is asserted too.
    const balanceAfterOnePlank = runtime.treasury.balanceMinorUnits;
    stepTo(runtime, 60);
    expect(runtime.construction.getOrder('bed-2')?.state).toBe('materials-pending');
    expect(runtime.treasury.balanceMinorUnits, 'a re-placed order must not buy a second plank').toBe(balanceAfterOnePlank);
  });

  it('gives back the materials a cancelled order had allocated, and does not refund a built object', () => {
    /*
     * **The name survives the owner's ruling of 2026-09-01 and one word of it
     * changed meaning, which is why it is annotated rather than renamed.**
     * *"Does not refund a built object"* is now true of every route rather than
     * of this one -- ADR 0076's amendment of that date reverses decision B, so
     * `Undo` on the finished bed gives nothing back either. *"Gives back the
     * materials a cancelled order had allocated"* is about the `'in-progress'`
     * press below and was already false in its own currency after ruling 20:
     * that press releases nothing, and this case asserts the empty allocation
     * rather than a stock figure, which is why it never went red.
     *
     * The asymmetry the body's comment names is therefore gone, and the case
     * now measures the two halves agreeing.
     */
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }));
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
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
    // gives nothing back: the plank became a bed.
    //
    // **The two sentences that followed named an asymmetry and are kept because
    // it is the asymmetry two rulings closed.** They read: *"The asymmetry is
    // the decision -- an order that never finished gives its materials back,
    // and a thing built out of the materials does not un-build into them."*
    // Ruling 20 took the first half (an unfinished order gives back money, or
    // nothing once the crew has started) and the ruling of 2026-09-01 confirmed
    // the second for every route. Nothing gives materials back any more, so
    // there is no asymmetry left -- only the second half, which was always the
    // part this case measured.
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

describe('a bed removed from an occupied cell relocates its resident, and evicts nobody when it cannot (ADR 0028 decision 2, narrowed by ADR 0076 A(i))', () => {
  /**
   * **This block's name and three of its sentences were rewritten by hand for
   * [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
   * decision A(i), and the old ones are quoted below rather than deleted.**
   * They were correct when they were written and they were correct against the
   * code that shipped them; what changed is the decision under them, and that
   * ADR's consequences say in as many words that each one *"is a sentence that
   * has to be rewritten by hand, and that is the point: it must not be
   * possible to change this behaviour without editing the sentences that
   * promised the old one."*
   *
   * The block used to be called *"a bed removed from an occupied cell evicts
   * nobody (ADR 0028 decision 2)"*. **That decision is not withdrawn and
   * neither is the sentence** -- ADR 0076 narrows both. Nobody is put on the
   * street: a resident the prison cannot rehouse stays exactly where ADR 0028
   * left them, in a cell with no bed in it, and the last two tests here are
   * that branch, holding the assertions the first two used to hold. What is
   * new is that a resident the prison *can* rehouse is **moved**, and a prison
   * with a free furnished bed one cell over no longer houses somebody in a
   * room it cannot sleep them in.
   */

  /** The furnished prison with a second cell, one prisoner housed in the first, and both beds standing. */
  function prisonWithHousedPrisoner(): { readonly runtime: SimulationRuntime; readonly prisoner: number } {
    const runtime = prisonWithFurnishedCell();
    submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-3', itemId: 'item.wood-plank', quantity: 1 }));
    wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
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

  /**
   * The same prison with **one** cell, so the relocation this file now measures
   * has nowhere to go.
   *
   * The whole difference from `prisonWithHousedPrisoner` is the second cell,
   * and that is deliberate: the two branches of decision A(i) are one command
   * apart, and the fixtures that reach them should be too.
   */
  function prisonWithNowhereToMoveAnybody(): { readonly runtime: SimulationRuntime; readonly prisoner: number } {
    const runtime = prisonWithFurnishedCell();
    stepTo(runtime, 200);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 260);
    const prisoner = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(prisoner)).toBe(cellInstanceId);
    return { runtime, prisoner };
  }

  it('moves the resident into the still-furnished cell next door, and the state pays for the place they now really hold', () => {
    const { runtime, prisoner } = prisonWithHousedPrisoner();
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    expect(objectRequirementStatuses(runtime, cellInstanceId)).toEqual({
      'object.bed': 'satisfied-by-capability',
      'object.toilet': 'satisfied-by-capability',
    });

    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // **This assertion read `toBe(cellInstanceId)` under the message "Nobody is
    // evicted", and it is the sentence ADR 0076 decision A(i) is.** The
    // prisoner is not evicted -- they are *rehoused*, in one step, into a cell
    // whose bed exists, because this prison has one. The cell they came from
    // now holds nobody rather than holding somebody it cannot sleep.
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'rehoused, not evicted and not left').toBe(
      secondCellInstanceId,
    );
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(0);
    expect(runtime.prisoners.roomInstances.occupantsOf(secondCellInstanceId)).toEqual([prisoner]);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(0);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'and the registry still counts them as housed').toBe(1);

    // **And the money follows the bed rather than the room.** Decision A(ii)
    // pays for `min(occupancy, residentCapacity)` per instance, and after a
    // relocation the resident occupies a real furnished place -- so the grant
    // that A(ii) withheld while they sat in a bedless cell is payable again.
    // That is the half of A(ii) the no-vacancy test below cannot show.
    expect(
      runtime.prisoners.roomInstances.residentIdsWithExistingPlace(),
      'the place they hold is a bed that exists',
    ).toEqual([prisoner]);
    expect(stateIncomeForCompletedDay(runtime.prisoners), 'so a whole day is worth something again').toBeGreaterThan(0);

    // **The emptied cell admits nobody new**, and the second cell is full
    // rather than free -- so this is the cell refusing on its own capacity,
    // not the prison having run out of rooms.
    expect(runtime.prisoners.roomInstances.assign(cellInstanceId, 4_242 as never)).toBe(false);
    expect(runtime.prisoners.roomInstances.findAvailableResidence(CELL, 'sleep-surface')).toBeUndefined();

    // **The requirement flips to missing.** The toilet is untouched, which is
    // what makes this a statement about the bed rather than about the room being
    // reset.
    expect(objectRequirementStatuses(runtime, cellInstanceId)).toEqual({
      'object.bed': 'missing-capability',
      'object.toilet': 'satisfied-by-capability',
    });
    expect(projectRoomDetail(runtime.prisoners, cellInstanceId)?.occupancy).toMatchObject({ current: 0, capacity: 0, free: 0 });
  });

  it('sleeps the relocated prisoner in the cell they were moved to, because own-accommodation resolves by id', () => {
    const { runtime, prisoner } = prisonWithHousedPrisoner();
    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // **This test read "keeps the prisoner sleeping in the cell whose bed has
    // gone, because own-accommodation re-checks nothing", and the mechanism it
    // named is unchanged -- only the id is.** `action.sleep` targets
    // `own-accommodation`, which resolves by id and checks neither gate; that
    // is exactly why relocation had to write `coldState.setAccommodation`
    // rather than only move the residency claim. It did, so the prisoner walks
    // to the cell they now live in and sleeps on the bed that is in it.
    stepTo(runtime, 2_500);
    const index = runtime.prisoners.entityStore.getIndex(prisoner);
    expect(DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[index]!]?.id).toBe('action.sleep');
    expect(runtime.prisoners.coldState.getActionTarget(prisoner)).toBe(secondCellInstanceId);
    expect(ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]).toBe('performing');
  });

  it('leaves the resident where ADR 0028 put them when there is nowhere to move them, and the state pays for none of it', () => {
    const { runtime, prisoner } = prisonWithNowhereToMoveAnybody();

    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // **The whole of what the first two tests used to assert, moved to the
    // branch where it is still true**, and it is the branch that matters:
    // ADR 0076 calls it "a prison with one cell, or a prison that is full,
    // which is every prison the moment the player is under pressure", and the
    // recycling loop `economy-bed-recycling.test.ts` measures runs through it
    // by construction, because a player exploiting it has no spare bed.
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'nobody is put on the street').toBe(cellInstanceId);
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(1);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(0);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
    expect(
      runtime.prisoners.roomInstances.residentIdsWithExistingPlace(),
      'and the state pays for none of it: the place went with the bed',
    ).toEqual([]);
    expect(stateIncomeForCompletedDay(runtime.prisoners), 'so a whole day is worth nothing here').toBe(0);

    // And they go on sleeping there, over a whole day boundary, which is the
    // "degrade visibly, never hard-fail" answer ADR 0028 reached with no new
    // mechanic.
    stepTo(runtime, 2_500);
    const index = runtime.prisoners.entityStore.getIndex(prisoner);
    expect(DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[index]!]?.id).toBe('action.sleep');
    expect(runtime.prisoners.coldState.getActionTarget(prisoner)).toBe(cellInstanceId);
    expect(ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]).toBe('performing');
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId), 'still housed a day later').toBe(1);
  });

  it('moves only the excess: a cell losing one of two beds relocates one resident and keeps the other', () => {
    // ADR 0076 names this as relocation's "one gap for this use": the
    // mechanism `unzone` had empties *whole instances*, and a room losing one
    // of two beds needs only the excess moved. The two residents are
    // deliberately in one cell before the spare cell exists, so intake cannot
    // have spread them and the fixture is not quietly measuring its own
    // admission order.
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 3 }));
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'bed-a', packCommand({ type: 'PlaceObject', orderId: 'bed-a', definitionId: 'bed-wooden', ...BED_TILE }));
    submit(runtime, 'bed-b', packCommand({ type: 'PlaceObject', orderId: 'bed-b', definitionId: 'bed-wooden', ...SECOND_BED_IN_CELL_TILE }));
    stepTo(runtime, 400);
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity, 'two beds, two places').toBe(2);

    submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    submit(runtime, 'admit-2', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, x: ARRIVAL.x + 1, y: ARRIVAL.y }));
    stepTo(runtime, 700);
    const occupants = runtime.prisoners.roomInstances.occupantsOf(cellInstanceId);
    expect(occupants, 'both housed in the one cell, ascending by entity id').toHaveLength(2);
    const [staying, excess] = occupants as readonly [number, number];

    // Only now does anywhere else exist to be moved to.
    wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    submit(runtime, 'bed-c', packCommand({ type: 'PlaceObject', orderId: 'bed-c', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
    stepTo(runtime, 1_100);
    expect(runtime.prisoners.roomInstances.getById(secondCellInstanceId)?.residentCapacity).toBe(1);

    submit(runtime, 'remove-bed-a', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // One bed left, one resident on it: the *lowest* entity id keeps the place,
    // which is the tie-break `residentsWithExistingPlace` already imposed on
    // the money (decision A(ii)) rather than a second rule invented for
    // relocation. The other -- the resident the state had stopped paying for --
    // is the one that moves.
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity, 'one bed left').toBe(1);
    expect(runtime.prisoners.roomInstances.occupantsOf(cellInstanceId), 'the lowest id keeps the place').toEqual([staying]);
    expect(runtime.prisoners.coldState.getAccommodation(staying)).toBe(cellInstanceId);
    expect(runtime.prisoners.coldState.getAccommodation(excess), 'and only the excess moves').toBe(secondCellInstanceId);
    expect(runtime.prisoners.roomInstances.occupantsOf(secondCellInstanceId)).toEqual([excess]);

    // Two residents, two beds, two places -- and no prison anywhere in this
    // fixture is over capacity, which is the state A(ii) exists to stop paying
    // for and A(i) has just removed.
    expect(runtime.prisoners.roomInstances.residentIdsWithExistingPlace()).toEqual([staying, excess].sort((a, b) => a - b));
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(2);
  });

  it('leaves nothing inconsistent after a long run, and the cell it emptied un-zones with nobody left to relocate', () => {
    const { runtime, prisoner } = prisonWithHousedPrisoner();
    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));

    // Five in-game days past the removal. The point is that nothing throws out
    // of `Kernel.step()`: an over-capacity room is walked by the intake system,
    // the action system, the income system and both projections on every
    // scheduled tick, and a capacity below an occupant count is the arithmetic
    // that would produce a `RangeError` or a negative bounded value if any of
    // them subtracted without clamping. Under A(i) this prison is no longer in
    // that state at all -- which is why the same five days are stepped in the
    // no-vacancy test above, where it still is.
    expect(() => stepTo(runtime, 12_000)).not.toThrow();

    const index = runtime.prisoners.entityStore.getIndex(prisoner);
    expect(intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!)).toBe('completed');
    // **This read `toBe(cellInstanceId)` and `occupancyOf(cellInstanceId)` 1.**
    // The relocation happened at the removal, five days ago, and nothing since
    // has moved them back or lost them.
    expect(runtime.prisoners.coldState.getAccommodation(prisoner)).toBe(secondCellInstanceId);
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(0);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(1);
    // No claim outlived the action that took it, over five days of them.
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(0);
    // The registry and the tile index still agree, and neither holds the bed.
    // The cell's toilet and the *second* cell's bed, and nothing at (4,6).
    expect(runtime.placedObjects.getSnapshot().map((object) => object.placedObjectId)).toEqual(['object:5:6', 'object:7:6']);
    expect(runtime.placedObjects.objectAt(BED_TILE as never)).toBeUndefined();
    // Every requirement is still answerable, and the projection still resolves.
    expect(projectRoomDetail(runtime.prisoners, cellInstanceId)).toBeDefined();

    // **This half used to be the file's only measurement of #478's relocation,
    // and A(i) has taken its subject away**: the cell is empty by the time
    // `unzone` sees it, so `ResidentRelocationPort` is never asked and the
    // removal proceeds on the ordinary path. That is a real loss of coverage
    // *here* and not a silent one -- `unzone` relocating an occupied room is
    // measured by `tests/integration/room-zoning-loop.test.ts` ("un-zoning an
    // occupied room relocates its resident instead of refusing for ever
    // (#478)") and, for a room a removal has already emptied of capacity, by
    // the no-vacancy prison below, where the resident is still in the bedless
    // cell when the un-zoning arrives. What this still proves is the thing it was written
    // for: the removal opened no route to a dangling reference.
    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', ...CELL_RECT }));
    expect(runtime.refusals.last, 'accepted -- there was nobody left in it').toBeUndefined();
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId), 'the bed-less cell is gone').toBeUndefined();
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'and the resident is untouched by it').toBe(
      secondCellInstanceId,
    );
    expect(runtime.prisoners.roomInstances.occupantsOf(secondCellInstanceId)).toEqual([prisoner]);
  });

  it('offers the one free bed to the lowest entity id when two residents are excess and only one can move', () => {
    // The visit order, made observable. One removal can only ever make one
    // more resident excess -- a bed contributes one to `residentCapacity` --
    // so two-excess-at-once needs a room that was *already* over capacity when
    // the second bed went, which is exactly what a prison with nowhere to move
    // anybody produces. Give it one spare bed after that and the tie is real:
    // two residents with no place, one place going, and the ascending
    // entity-id walk decides which of them gets it.
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 3 }));
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'bed-a', packCommand({ type: 'PlaceObject', orderId: 'bed-a', definitionId: 'bed-wooden', ...BED_TILE }));
    submit(runtime, 'bed-b', packCommand({ type: 'PlaceObject', orderId: 'bed-b', definitionId: 'bed-wooden', ...SECOND_BED_IN_CELL_TILE }));
    stepTo(runtime, 400);
    submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    submit(runtime, 'admit-2', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, x: ARRIVAL.x + 1, y: ARRIVAL.y }));
    stepTo(runtime, 700);
    const [lower, higher] = runtime.prisoners.roomInstances.occupantsOf(cellInstanceId) as readonly [number, number];

    // First bed out, with nowhere in the prison to go: one of them is excess
    // and both stay, which is the ADR 0028 state.
    submit(runtime, 'remove-bed-a', packCommand({ type: 'RemoveObject', ...BED_TILE }));
    expect(runtime.prisoners.roomInstances.occupantsOf(cellInstanceId)).toEqual([lower, higher]);
    expect(runtime.prisoners.roomInstances.residentIdsWithExistingPlace(), 'one place, and the lowest id holds it').toEqual([
      lower,
    ]);

    // One spare bed, somewhere else.
    wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    submit(runtime, 'bed-c', packCommand({ type: 'PlaceObject', orderId: 'bed-c', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
    stepTo(runtime, 1_100);

    // Second bed out: now *both* are excess and there is one place for them.
    submit(runtime, 'remove-bed-b', packCommand({ type: 'RemoveObject', ...SECOND_BED_IN_CELL_TILE }));

    expect(runtime.prisoners.coldState.getAccommodation(lower), 'the lowest id is offered the bed first').toBe(
      secondCellInstanceId,
    );
    expect(runtime.prisoners.coldState.getAccommodation(higher), 'and the other stays put rather than being evicted').toBe(
      cellInstanceId,
    );
    expect(runtime.prisoners.roomInstances.occupantsOf(cellInstanceId)).toEqual([higher]);
    // Partial, and better than nothing: the sibling `relocateResidentsOutOf`
    // would have rolled the successful move back on reaching the resident it
    // could not place, because `unzone` can still refuse. This caller cannot
    // -- the bed is already gone -- so undoing the move would put a rehoused
    // prisoner back in a bedless cell to preserve an atomicity nobody reads,
    // and would cost the prison the one place it still has.
    expect(runtime.prisoners.roomInstances.residentIdsWithExistingPlace()).toEqual([lower]);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'and nobody was lost on the way').toBe(2);
  });

  it('relocates on the undo route too, because a bed taken back by `Undo` is the same bed', () => {
    // The other command that takes a standing object out of a room
    // (`ConstructionSystem.cancelOrder` -> `onOrderReverted`), and the one the
    // recycling loop `economy-bed-recycling.test.ts` measures actually uses.
    // ADR 0076 decision B is about the two commands disagreeing over
    // *materials*; this is the two agreeing about *residents*, and it is a
    // separate wiring that a test of `RemoveObject` alone would not reach.
    // (Since the owner's ruling of 2026-09-01 -- ADR 0076's amendment of that
    // date -- the two agree about materials as well: neither gives anything
    // back. The sentence is kept because the *wirings* are still separate,
    // which is the whole reason this case exists beside the one above it.)
    // Its own fixture, because `Undo` pops the *last* transaction and
    // `prisonWithHousedPrisoner` furnishes the spare cell second. The two beds
    // are therefore placed the other way round here -- the spare cell first,
    // the cell that will be occupied last -- so one press reaches the bed the
    // resident is sleeping on. Nothing else is different.
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }));
    wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    submit(runtime, 'bed-2', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'bed-1', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
    stepTo(runtime, 600);
    expect(runtime.construction.getOrder('bed-1')?.state, 'the bed is a completed order').toBe('completed');
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepTo(runtime, 700);
    const prisoner = runtime.prisoners.entityStore.getIdByIndex(0);
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'housed on the bed the undo will take').toBe(cellInstanceId);

    submit(runtime, 'undo', packCommand({ type: 'Undo' }));

    expect(runtime.placedObjects.objectAt(BED_TILE as never), 'the bed is gone').toBeUndefined();
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity).toBe(0);
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'and the resident is rehoused, not left').toBe(
      secondCellInstanceId,
    );
    expect(runtime.prisoners.roomInstances.occupancyOf(cellInstanceId)).toBe(0);
    expect(runtime.prisoners.roomInstances.residentIdsWithExistingPlace()).toEqual([prisoner]);
  });

  it('still relocates on un-zoning when the removal could not: the two commands answer the same question one after the other (#478)', () => {
    // The no-vacancy prison, given somewhere to go *afterwards*. This is the
    // sequence A(i) does not close and #478 does, kept because the test above
    // no longer reaches it: a resident stranded by a removal is relocated by
    // the next command that can.
    const { runtime, prisoner } = prisonWithNowhereToMoveAnybody();
    submit(runtime, 'remove-bed', packCommand({ type: 'RemoveObject', ...BED_TILE }));
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'stranded by the removal').toBe(cellInstanceId);

    submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-3', itemId: 'item.wood-plank', quantity: 1 }));
    wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    submit(runtime, 'place-bed-2', packCommand({ type: 'PlaceObject', orderId: 'bed-2', definitionId: 'bed-wooden', ...SECOND_BED_TILE }));
    stepTo(runtime, 700);
    expect(runtime.prisoners.roomInstances.getById(secondCellInstanceId)?.residentCapacity).toBe(1);

    submit(runtime, 'unzone', packCommand({ type: 'UnzoneRoom', ...CELL_RECT }));
    expect(runtime.refusals.last, 'accepted -- relocated rather than refused').toBeUndefined();
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId), 'the bed-less cell is gone').toBeUndefined();
    expect(runtime.prisoners.coldState.getAccommodation(prisoner), 'moved into the still-furnished cell').toBe(
      secondCellInstanceId,
    );
    expect(runtime.prisoners.roomInstances.occupantsOf(secondCellInstanceId)).toEqual([prisoner]);
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
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    wallRoomPerimeter(runtime.world, SECOND_CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell-2', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SECOND_CELL_RECT }));
    wallRoomPerimeter(runtime.world, YARD_RECT, { doors: runtime.navigation.doors });
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
    /*
     * Into the recreation block, `[1000, 1200)` of the day.
     * `action.yard-recreation` outscores `action.common-room-recreation`
     * (recreation 3 plus safety against recreation 2) and no common room is
     * zoned anyway, so the yard is where both of them go.
     *
     * **1,165 rather than 1,120 since ADR 0059, and the 45 ticks are the walk
     * to the yard.** The prisoners are admitted at the arrival tile and the
     * yard is across the chunk; until locomotion existed they were written
     * onto its anchor in the tick their route resolved, and both held a seat
     * by 1,120. They now cover the tiles between at
     * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK`, and 1,165 is the first tick at
     * which both are inside -- found by stepping and asserted three lines
     * below, exactly as the paragraph this one replaced described its own
     * number. Everything that paragraph said about *which* action they pick is
     * unchanged, and is kept here because it is still the reason they are in
     * the yard at all:
     *
     * **1,120 rather than 1,040, and the 80 ticks are ADR 0054 rather than
     * slack.** That change added `'free-association'` to this block, because
     * until it did the block resolved nothing at all in a prison with no yard
     * and no common room. `action.free-association` runs for 60 ticks and the
     * previous block, `[500, 1000)`, now ends in one -- so an association
     * begun at 980 is still being performed at 1,040 and the prisoner has not
     * yet reconsidered into the yard. It never *displaces* the yard: it
     * declares no need effect, `scoreAction` therefore gives it exactly 0, and
     * `action.yard-recreation` scores above 0 for any safety deficit at all.
     * What moved is when the walk next runs, not what it picks.
     */
    stepTo(runtime, 1_165);

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
    // Sixty ticks after the fixture leaves off, and then the same 220-tick
    // delivery-and-build window the re-placed bed always had. Both offsets
    // moved with the fixture's own tick when ADR 0059 made the walk to the
    // yard take time (1,120 -> 1,165); they were 1,180 and 1,400.
    stepTo(runtime, 1_225);
    expect(runtime.prisoners.roomInstances.findAvailableForUse(YARD, 'sleep-surface')).toBeUndefined();

    submit(runtime, 'buy-again', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.wood-plank', quantity: 1 }));
    submit(runtime, 'bed-yard-2', packCommand({ type: 'PlaceObject', orderId: 'bed-4', definitionId: 'bed-wooden', ...YARD_BED_TILE }));
    stepTo(runtime, 1_445);

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
    wallRoomPerimeter(runtime.world, YARD_RECT, { doors: runtime.navigation.doors });
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
