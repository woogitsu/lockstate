import { describe, expect, it } from 'vitest';
import { Container } from '../../src/simulation/operations/inventory';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **One authority writes one prisoner.** Pinned as the behaviour this tree has
 * *since* `docs/adr/0093-a-carry-is-an-action.md`, and pinned in the same
 * fixture that measured the incoherence it removed, so the two readings can be
 * compared line for line.
 *
 * ## What this file used to pin, and why it is not deleted
 *
 * Until ADR 0093 landed, this file asserted the opposite and was named
 * *"is moved by `operations.jobs` while `prisoners.actions` still records them
 * as working in the kitchen"*. `operations.jobs` ran at order 260, handed a
 * carry job to any member of `JobWorkerPool`, and when the leg's route
 * resolved wrote the worker's tile through
 * `PrisonerJobWorkerAdapter.setPositionTile`, which cancelled the walk and
 * nothing else. Neither that class nor that method exists any longer; ADR 0093
 * deleted the file they lived in. The measured result, on this exact prison and this exact seed:
 * a prisoner **26 tiles from the kitchen by Manhattan distance, standing at the
 * depot, and still recorded as `performing` `action.kitchen-work`, targeting
 * `room.kitchen:10:6`, holding its one concurrent-use seat, and being fed by a
 * stove they were not standing at** -- `needFulfilledLastTick` moving from 680
 * to 720 *after* the tile had moved.
 *
 * Its own header named the exit: *"When a carry is an action, the prisoner in
 * this fixture cannot be both in the kitchen and at the depot ... Rewrite them
 * in that change to say what a carrying prisoner *is* -- do not delete the
 * file, because the first half (a working prisoner holds a seat) stays true and
 * is what makes the second half mean something."* This is that rewrite. The
 * first half is unchanged and still runs first.
 *
 * ## What is pinned now
 *
 * A prisoner **performing `action.kitchen-work` inside a real `room.kitchen`
 * instance, holding its concurrent-use claim** (ADR 0029) is offered one carry
 * whose drop-off is across the prison. Six facts follow, and every one of them
 * is asserted because the decision that produced this state produces all six:
 *
 * 1. **The kitchen shift is not interrupted.** A carry is chosen at a
 *    reconsideration by an *idle* prisoner, so the 120-tick shift finishes on
 *    its own terms -- which is ADR 0093's *"a carry outlasts its block"*
 *    argument run the other way, and the reason nothing here has to release a
 *    seat early.
 * 2. **The seat is released when the shift ends**, by the one release site that
 *    has always released it (`ActionSystem.releaseUseClaim`). No second site
 *    was added, which is what ADR 0029 decision 3 asks for.
 * 3. **The prisoner then chooses `action.carry`**, from the catalogue, in a
 *    `work` block -- not because a second system reached in and moved them.
 * 4. **They walk**, both legs, through `LocomotionStore`: `travelling` ->
 *    `performing` -> `travelling` -> `performing`, with tiles in between.
 * 5. **They are not in the kitchen while they carry**: not targeting it, not
 *    holding its seat, and not being fed by it.
 * 6. **The goods arrive**, and the job completes.
 *
 * ## What is deliberately **not** claimed
 *
 * Not that ADR 0093 was the only possible answer. Options (a) and (b) are
 * priced in the ADR and the owner chose (c) with that cost in front of them.
 * This file measures what (c) does, not that it was right.
 *
 * Every figure below is computed from the run rather than written down, so a
 * failure carries the new number.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, and `room.kitchen`'s -- the rectangles `tests/integration/kitchen-work.test.ts` measures the shift on. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const KITCHEN_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
const KITCHEN_ID = `room.kitchen:${KITCHEN_RECT.x}:${KITCHEN_RECT.y}`;
/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Open ground on the far side of the chunk from the kitchen; the carry's drop-off. */
const DEPOT_TILE = { x: 24, y: 24 } as const;

const ADMIT_AT = 600;
/** One in-game day past admission is more than enough; the shift begins inside the first work block. */
const GIVE_UP_AT = 4_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** A prison built the way a player builds one, through `Kernel.submitCommand` -- the same fixture shape as `tests/integration/kitchen-work.test.ts`. */
function prisonWithAKitchen(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 }));

  wallRoomPerimeter(runtime.world, KITCHEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-kitchen', packCommand({ type: 'ZoneRoom', roomId: 'room.kitchen', ...KITCHEN_RECT }));
  submit(runtime, 'place-fridge', packCommand({ type: 'PlaceObject', orderId: 'fridge-1', definitionId: 'fridge-brick', x: 13, y: 6 }));
  submit(runtime, 'place-stove', packCommand({ type: 'PlaceObject', orderId: 'stove-1', definitionId: 'stove-brick', x: 10, y: 6 }));
  submit(runtime, 'place-prep', packCommand({ type: 'PlaceObject', orderId: 'prep-1', definitionId: 'prep-counter-brick', x: 10, y: 7 }));

  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));
  return runtime;
}

interface PrisonerReading {
  readonly tick: number;
  readonly tile: { readonly x: number; readonly y: number };
  readonly phase: (typeof ACTION_PHASES)[number];
  readonly actionId: string | undefined;
  readonly target: string | undefined;
  readonly kitchenClaims: number;
  readonly needFulfilledLastTick: number;
  /** The job this prisoner is carrying for, read off the board by entity id (ADR 0093 decision 1). */
  readonly carryingJobId: string | undefined;
}

function read(runtime: SimulationRuntime): PrisonerReading {
  const store = runtime.prisoners.entityStore;
  const entityId = store.getIdByIndex(0);
  const index = store.getIndex(entityId);
  const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
  return {
    tick: runtime.kernel.tick,
    tile: { x: tileCoordinate(runtime.prisoners.position.tileX[index]!), y: tileCoordinate(runtime.prisoners.position.tileY[index]!) },
    phase: ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]!,
    actionId: actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex]!.id : undefined,
    target: runtime.prisoners.coldState.getActionTarget(entityId),
    kitchenClaims: runtime.prisoners.roomInstances.claimCountOf(KITCHEN_ID),
    needFulfilledLastTick: runtime.prisoners.currentAction.needFulfilledLastTick[index]!,
    carryingJobId: runtime.jobs.activeJobFor(entityId)?.id,
  };
}

function isWorkingInTheKitchen(reading: PrisonerReading): boolean {
  return reading.phase === 'performing' && reading.actionId === 'action.kitchen-work' && reading.target === KITCHEN_ID && reading.kitchenClaims === 1;
}

/** Manhattan distance from a tile to the nearest tile of the kitchen rectangle. */
function tilesFromTheKitchen(tile: { readonly x: number; readonly y: number }): number {
  const dx = Math.max(KITCHEN_RECT.x - tile.x, 0, tile.x - (KITCHEN_RECT.x + KITCHEN_RECT.width - 1));
  const dy = Math.max(KITCHEN_RECT.y - tile.y, 0, tile.y - (KITCHEN_RECT.y + KITCHEN_RECT.height - 1));
  return dx + dy;
}

describe('a working prisoner offered a carry job', () => {
  it('finishes the shift, gives the seat back, then walks the errand as its own action', () => {
    const runtime = prisonWithAKitchen();

    // The positive half first: the prisoner really does work a shift in a real
    // room instance, holding a real claim. Without it the rest is vacuous.
    let atWork = read(runtime);
    while (!isWorkingInTheKitchen(atWork) && runtime.kernel.tick < GIVE_UP_AT) {
      runtime.kernel.step();
      atWork = read(runtime);
    }
    expect(isWorkingInTheKitchen(atWork), `never performing kitchen work by tick ${GIVE_UP_AT}: ${JSON.stringify(atWork)}`).toBe(true);
    expect(tilesFromTheKitchen(atWork.tile)).toBe(0);
    expect(atWork.carryingJobId, 'a prisoner on kitchen duty is not on an errand').toBeUndefined();

    // The meeting #600 asks for. It needs no worker pool any more: eligibility
    // is the regime's, so a stocked container, an empty one across the prison
    // and one job on the board are the whole of the setup.
    const pantry = new Container('pantry');
    pantry.deposit('item.brick', 4);
    runtime.containers.register(pantry);
    runtime.containers.register(new Container('depot'));
    runtime.jobs.submitCarryItem(
      {
        id: 'carry-1', priority: 1, itemId: 'item.brick', quantity: 4,
        sourceContainerId: 'pantry', sourceTile: { x: tileCoordinate(atWork.tile.x), y: tileCoordinate(atWork.tile.y) },
        destinationContainerId: 'depot', destinationTile: { x: tileCoordinate(DEPOT_TILE.x), y: tileCoordinate(DEPOT_TILE.y) },
      },
      runtime.kernel.tick,
    );

    /*
     * **The shift is not cut short, and that is fact 1.** The old behaviour
     * moved the prisoner's tile on the tick the leg's route resolved, whatever
     * they were doing. A carry is chosen by an *idle* prisoner at a
     * reconsideration, so the kitchen action ends on its own terms first --
     * and while it runs the prisoner stays in the kitchen, holding the seat.
     */
    let stillCooking = read(runtime);
    while (stillCooking.actionId === 'action.kitchen-work' && runtime.kernel.tick < atWork.tick + 400) {
      expect(tilesFromTheKitchen(stillCooking.tile), `moved out of the kitchen while still recorded as cooking: ${JSON.stringify(stillCooking)}`).toBe(0);
      runtime.kernel.step();
      stillCooking = read(runtime);
    }
    expect(stillCooking.actionId, 'the kitchen shift never ended').not.toBe('action.kitchen-work');

    // Fact 2: the seat came back, through the only release site there is.
    expect(runtime.prisoners.roomInstances.claimCountOf(KITCHEN_ID)).toBe(0);

    // Facts 3 and 4: the prisoner takes the errand as an action, and walks it.
    let carrying = read(runtime);
    while (carrying.actionId !== 'action.carry' && runtime.kernel.tick < atWork.tick + 600) {
      runtime.kernel.step();
      carrying = read(runtime);
    }
    expect(carrying.actionId, `never chose the errand: ${JSON.stringify(carrying)}`).toBe('action.carry');
    expect(carrying.carryingJobId, 'the errand is the job the board assigned them').toBe('carry-1');

    /*
     * Fact 5, and it is the assertion this file exists for. The five facts the
     * old version pinned -- `performing`, `action.kitchen-work`, the kitchen
     * target, the kitchen seat, and a fulfilment stamp from a stove they were
     * not standing at -- are all gone, and every one of them is asserted in its
     * new form rather than merely dropped.
     */
    const phasesSeen = new Set<string>();
    const tilesSeen = new Set<string>();
    let job = runtime.jobs.getById('carry-1')!;
    let fulfilmentStampWhileCarrying: number | undefined;
    while (job.state !== 'completed' && job.state !== 'failed' && runtime.kernel.tick < atWork.tick + 900) {
      const reading = read(runtime);
      if (reading.actionId === 'action.carry') {
        phasesSeen.add(reading.phase);
        tilesSeen.add(`${reading.tile.x},${reading.tile.y}`);
        expect(reading.target, 'a carry writes no room-instance target').toBeUndefined();
        expect(reading.kitchenClaims, 'a carrier holds no kitchen seat').toBe(0);
        fulfilmentStampWhileCarrying = reading.needFulfilledLastTick;
      }
      runtime.kernel.step();
      job = runtime.jobs.getById('carry-1')!;
    }

    // Fact 4 again, measured: both phases and more than two tiles, so the legs
    // were walked rather than resolved into a teleport.
    expect([...phasesSeen].sort()).toEqual(['performing', 'travelling']);
    expect(tilesSeen.size, `a carrier that only ever stood on ${[...tilesSeen].join(' and ')} did not walk`).toBeGreaterThan(2);

    // Fact 6: the goods arrived, and the job completed.
    expect(job.state, `carry did not complete: ${JSON.stringify(job)}`).toBe('completed');
    expect(runtime.containers.require('depot').quantityOf('item.brick')).toBe(4);
    expect(runtime.containers.require('pantry').quantityOf('item.brick')).toBe(0);

    // The carrier ends at the depot, and this time `prisoners.actions` agrees:
    // nothing records them as being in the kitchen.
    const afterCarry = read(runtime);
    expect(afterCarry.tile).toEqual(DEPOT_TILE);
    expect(tilesFromTheKitchen(afterCarry.tile)).toBeGreaterThan(10);
    expect(afterCarry.actionId).not.toBe('action.kitchen-work');
    expect(afterCarry.target).toBeUndefined();
    expect(afterCarry.kitchenClaims).toBe(0);
    expect(afterCarry.carryingJobId, 'a completed errand is not an active job').toBeUndefined();

    /*
     * **And nothing fed them while they carried.** The old version's last
     * assertion was that `needFulfilledLastTick` kept *moving* after the tile
     * did, because `applyNeedEffects` was still crediting the stove. A carry
     * has no `needEffectsPerTick`, so the stamp is frozen at whatever the
     * kitchen shift last wrote -- and the run then goes 40 ticks further to show
     * it does not move.
     */
    expect(fulfilmentStampWhileCarrying, 'the carrier was never observed').toBeDefined();
    stepTo(runtime, afterCarry.tick + 40);
    expect(read(runtime).needFulfilledLastTick).toBeLessThanOrEqual(afterCarry.tick);
  });
});
