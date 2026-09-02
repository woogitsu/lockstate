import { describe, expect, it } from 'vitest';
import { Container } from '../../src/simulation/operations/inventory';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Two authorities write one prisoner, and neither yields.** Pinned as the
 * behaviour this tree has, so that the decision which removes it is watched
 * going red rather than assumed to have landed.
 *
 * `prisoners.actions` (order 250) decides what a prisoner does and where they
 * stand for it; `operations.jobs` (order 260) hands a carry job to any member
 * of `JobWorkerPool` and, when the leg's route resolves, writes the worker's
 * tile through `PrisonerJobWorkerAdapter.setPositionTile`
 * (`src/simulation/prisoners/job-worker-adapter.ts`), which cancels the walk
 * and nothing else. Nothing in `src/` puts a prisoner in that pool and nothing
 * in `src/` puts a job on the board, so in a session a player can start the
 * two systems never meet. Issue #600 asks for exactly the meeting -- *"let a
 * prisoner in a work block be a worker"* -- and this file measures what the
 * meeting does today, through the one route that can produce it.
 *
 * ## What is pinned
 *
 * A prisoner **performing `action.kitchen-work` inside a real `room.kitchen`
 * instance, holding its concurrent-use claim** (ADR 0029), is registered as a
 * worker and offered one carry whose pickup is the tile they stand on and whose
 * drop-off is across the prison. When the job completes, the prisoner is at
 * the drop-off tile -- and `prisoners.actions` still records them as
 * `performing` kitchen work, targeting the kitchen, holding its seat, and
 * being fed by it. Every one of those five facts is asserted, because the
 * decision that ends this state has to end all five.
 *
 * ## What is deliberately **not** claimed
 *
 * Not that either system is wrong on its own terms. `ActionSystem` has no
 * departure event to release a claim on (ADR 0029 decision 3 releases when
 * the *action* ends), and `JobSystem` moves a worker because ADR 0059 names
 * *"an external write to a walker's tile ends the walk"* as the rule and this
 * adapter as its one site outside `prisoners/`. The incoherence is between
 * them, and which one yields is the decision
 * `docs/adr/0093-a-carry-is-an-action.md` records the owner taking: a carry
 * becomes an action, so one authority moves the prisoner. **That decision is
 * Proposed and unbuilt**; this file pins the tree it was written against.
 *
 * ## The exit from this file
 *
 * When a carry is an action, the prisoner in this fixture cannot be both in
 * the kitchen and at the depot, and the assertions under "and `prisoners.actions`
 * still records them as working in the kitchen" go red. Rewrite them in that
 * change to say what a carrying prisoner *is* -- do not delete the file, because
 * the first half (a working prisoner holds a seat) stays true and is what makes
 * the second half mean something.
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
  it('is moved by `operations.jobs` while `prisoners.actions` still records them as working in the kitchen', () => {
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

    // The meeting #600 asks for, through the only route that can produce it:
    // a stocked container under the prisoner's feet, an empty one across the
    // prison, the prisoner in the pool, one carry on the board.
    const pantry = new Container('pantry');
    pantry.deposit('item.brick', 4);
    runtime.containers.register(pantry);
    runtime.containers.register(new Container('depot'));
    runtime.jobWorkers.register(runtime.prisoners.entityStore.getIdByIndex(0));
    runtime.jobs.submitCarryItem(
      {
        id: 'carry-1', priority: 1, itemId: 'item.brick', quantity: 4,
        sourceContainerId: 'pantry', sourceTile: { x: tileCoordinate(atWork.tile.x), y: tileCoordinate(atWork.tile.y) },
        destinationContainerId: 'depot', destinationTile: { x: tileCoordinate(DEPOT_TILE.x), y: tileCoordinate(DEPOT_TILE.y) },
      },
      runtime.kernel.tick,
    );

    let job = runtime.jobs.getById('carry-1')!;
    while (job.state !== 'completed' && job.state !== 'failed' && runtime.kernel.tick < atWork.tick + 400) {
      runtime.kernel.step();
      job = runtime.jobs.getById('carry-1')!;
    }
    expect(job.state, `carry did not complete: ${JSON.stringify(job)}`).toBe('completed');
    expect(runtime.containers.require('depot').quantityOf('item.brick')).toBe(4);

    // `operations.jobs` moved them: the drop-off tile, written by
    // `setPositionTile` when the drop-off route resolved.
    const afterCarry = read(runtime);
    expect(afterCarry.tile).toEqual(DEPOT_TILE);
    expect(tilesFromTheKitchen(afterCarry.tile)).toBeGreaterThan(10);

    // ...and `prisoners.actions` still records them as working in the kitchen.
    // Five facts, and the decision that ends this state has to end all five.
    expect(afterCarry.phase).toBe('performing');
    expect(afterCarry.actionId).toBe('action.kitchen-work');
    expect(afterCarry.target).toBe(KITCHEN_ID);
    expect(afterCarry.kitchenClaims).toBe(1);
    // Still being fed by a stove they are not standing at: the fulfilment stamp
    // moved *after* the tile did.
    stepTo(runtime, afterCarry.tick + 40);
    expect(read(runtime).needFulfilledLastTick).toBeGreaterThan(afterCarry.tick);
    expect(read(runtime).tile).toEqual(DEPOT_TILE);
  });
});
