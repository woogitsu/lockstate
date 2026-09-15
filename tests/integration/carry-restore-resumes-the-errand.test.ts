import { describe, expect, it } from 'vitest';
import { Container } from '../../src/simulation/operations/inventory';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { GENERAL_POPULATION_REGIME, resolveActiveRegimeBlock } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A restore may not ask a question continuous play never asks** — issue #882.
 *
 * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md)'s Consequences say,
 * in their own words: *"A carry outlasts its block. Like every action, it is
 * not cut at a regime boundary; a prisoner who picked up at 1,795 finishes the
 * drop-off in the recreation block."* That is an Accepted consequence of an
 * Accepted ADR, and this file is its guard.
 *
 * It was true continuously and false across a restore, and the mechanism is
 * exactly one `&&`:
 *
 * - `PrisonerOperationsRuntime.loadSnapshot` drops every restored traveller to
 *   `'idle'`, which is the one restore rule ADR 0093 decision 5 (as corrected
 *   by landing note 2) relies on — a carrier comes back idle with the carry
 *   still in `actionIndex` and the job still `'assigned'` on the board, and the
 *   *next* reconsideration is expected to re-select it.
 * - `carryAvailableFor` answers that question correctly: a prisoner whose own
 *   `activeJobFor` is defined is eligible whether or not the board has anything
 *   spare.
 * - But `planIdleSelection`'s gate ran `isActionCategoryAllowed` **first**.
 *   `action.carry` is category `'work'`; the moment the work block ends the
 *   category test is false and `&&` short-circuits before the active-job check
 *   is ever reached. The prisoner already holding the goods was filtered out of
 *   their own errand.
 *
 * So the block-category gate was being applied to a prisoner **resuming** an
 * errand as though they were **taking** one. Those are two different decisions,
 * and this file pins that they no longer share one predicate.
 *
 * ## Why the save point is where it is
 *
 * The save is taken at tick 1,880 — inside `GENERAL_POPULATION_REGIME`'s
 * 1,800–2,000 **recreation** block, which allows no `work` at all — with the
 * carrier mid-walk on the drop-off leg, goods already withdrawn from the
 * source container and not yet deposited. That is ADR 0093's own sentence made
 * literal: the errand was taken inside the work block that ended at 1,800 and
 * the walk is happening after it. The first assertion below proves the setup
 * really is in that state, because every other assertion is vacuous otherwise.
 *
 * The comparison is then **the same bundle, two futures**: the live session
 * stepped on, and a session restored from its snapshot stepped on the same
 * number of ticks. Continuous play is the reference, not a number this file
 * chose — which is what makes the bound below ADR 0093's and not a threshold
 * invented here.
 *
 * ## What it measured before the fix
 *
 * Reproduced exactly, seeded, not statistically:
 *
 * ```
 * SAVE POINT: 1880 action.carry travelling job=assigned/dropoff depot=0 pantry=0
 * CONTINUOUS:        job completed at 1918, depot=4
 * RESTORED at load:  1880 action.carry idle   job=assigned/dropoff
 * RESTORED:          1881 action.use-toilet -- walks off holding four bricks
 *                    job still `assigned` at 2280, 400 ticks later
 *                    resumes 2961, completes 3061
 * ```
 *
 * **1,143 ticks against ADR 0093 decision 5's corrected bound of 40**, and the
 * goods were in the carrier's hands for every one of them: `pantry` 0 and
 * `depot` 0 the whole way, because `withdrawReserved` had already run. The
 * issue's field report measured 380 on a save taken *inside* a work block,
 * where the next block boundary was 33 ticks away; taken *after* the boundary
 * the wait is the rest of the day, to the next work block at 2,900.
 */

const SEED = 0x0b1ec7;

const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const KITCHEN_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;
const PICKUP_TILE = { x: 22, y: 8 } as const;
const DROPOFF_TILE = { x: 26, y: 20 } as const;

const ADMIT_AT = 600;
/** Inside the 1,300–1,800 `work` block, late enough that the drop-off leg falls after it. */
const ERRAND_AT = 1_700;
/** Mid drop-off walk, and 80 ticks *past* the end of the work block that started the errand. */
const SAVE_AT = 1_880;
/** Long enough to cover continuous completion many times over, short of the next day's work block at 2,900. */
const RUN_FOR = 400;

/**
 * ADR 0093 decision 5, as corrected by its own landing note 3: *"the worst
 * mid-walk capture costs **40 ticks**, because a restored traveller pays the
 * cycle twice — dropped to `idle` (up to 20), then the request-then-collect
 * handshake (up to 20 more). That is what *every* action costs across a
 * restore."* It is the bound this file holds the restore to, and it is the
 * ADR's number rather than one measured here and enshrined.
 */
const RESTORE_BOUND_TICKS = 40;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison with a cell and a furnished kitchen, so a work block offers the
 * carrier something *else* to be doing and the errand is a choice rather than
 * the only option — the same fixture shape
 * `tests/integration/carry-need-threshold.test.ts` argues for.
 */
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

/**
 * One errand on the board, its containers registered by hand.
 *
 * What is under test is the *selection* rule across a restore and not the
 * producer, which has its own gate in
 * `tests/foundation/job-production-contract.test.ts`.
 */
function putTheErrandOnTheBoard(runtime: SimulationRuntime): void {
  const pantry = new Container('pantry');
  pantry.deposit('item.brick', 4);
  runtime.containers.register(pantry);
  runtime.containers.register(new Container('depot'));
  runtime.jobs.submitCarryItem(
    {
      id: 'errand-1', priority: 1, itemId: 'item.brick', quantity: 4,
      sourceContainerId: 'pantry', sourceTile: { x: tileCoordinate(PICKUP_TILE.x), y: tileCoordinate(PICKUP_TILE.y) },
      destinationContainerId: 'depot', destinationTile: { x: tileCoordinate(DROPOFF_TILE.x), y: tileCoordinate(DROPOFF_TILE.y) },
    },
    runtime.kernel.tick,
  );
}

interface Carrier {
  readonly actionId: string | undefined;
  readonly phase: string;
  readonly jobState: string | undefined;
  readonly jobLeg: string | undefined;
  readonly inTheDepot: number;
  readonly inThePantry: number;
}

function readCarrier(runtime: SimulationRuntime): Carrier {
  const store = runtime.prisoners.entityStore;
  const index = store.getIndex(store.getIdByIndex(0));
  const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
  const job = runtime.jobs.getById('errand-1');
  return {
    actionId: actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex]!.id : undefined,
    phase: ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]!,
    jobState: job?.state,
    jobLeg: job?.leg,
    inTheDepot: runtime.containers.getById('depot')?.quantityOf('item.brick') ?? -1,
    inThePantry: runtime.containers.getById('pantry')?.quantityOf('item.brick') ?? -1,
  };
}

/** The live session, stepped to the save point with the goods in the carrier's hands. */
function aCarrierMidDropOff(): SimulationRuntime {
  const runtime = prisonWithAKitchen();
  stepTo(runtime, ERRAND_AT);
  putTheErrandOnTheBoard(runtime);
  stepTo(runtime, SAVE_AT);
  return runtime;
}

/** Steps `runtime` for `RUN_FOR` ticks and reports the tick the errand completed on, if it did. */
function completedAt(runtime: SimulationRuntime): number | undefined {
  for (let step = 0; step < RUN_FOR; step += 1) {
    runtime.kernel.step();
    if (runtime.jobs.getById('errand-1')?.state === 'completed') return runtime.kernel.tick;
  }
  return undefined;
}

describe('issue #882: a restore hands the errand back rather than turning it into a selection', () => {
  it('is measured on a carrier who is already outlasting their block, or nothing below means anything', () => {
    const block = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, SAVE_AT);
    expect(block.allowedCategories, `tick ${SAVE_AT} must be outside every work block`).not.toContain('work');
    expect(resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, ERRAND_AT).allowedCategories).toContain('work');

    const live = aCarrierMidDropOff();
    expect(readCarrier(live)).toMatchObject({
      actionId: 'action.carry',
      phase: 'travelling',
      jobState: 'assigned',
      jobLeg: 'dropoff',
      // The goods are in the carrier's hands: withdrawn from the source and not
      // yet deposited. This is what "walks off with the goods" means literally.
      inThePantry: 0,
      inTheDepot: 0,
    });
  });

  it('finishes the errand in the recreation block when play is continuous — ADR 0093\'s Consequences, unchanged', () => {
    const live = aCarrierMidDropOff();
    const completed = completedAt(live);
    expect(completed, `the errand did not complete within ${RUN_FOR} ticks of ${SAVE_AT}`).toBeDefined();
    expect(readCarrier(live)).toMatchObject({ jobState: 'completed', inTheDepot: 4 });
  });

  it('finishes it on the same terms after a restore, within decision 5\'s bound', () => {
    const live = aCarrierMidDropOff();
    const bundle = captureSessionSnapshot(live);
    const continuous = completedAt(live);
    expect(continuous, 'the reference run must complete, or there is nothing to compare against').toBeDefined();

    const restored = restoreSimulationRuntime(bundle).runtime;
    // The restore rule ADR 0093 decision 5 depends on: a carrier comes back
    // idle, holding the carry in `actionIndex`, with the job still theirs.
    expect(readCarrier(restored)).toMatchObject({ actionId: 'action.carry', phase: 'idle', jobState: 'assigned', jobLeg: 'dropoff' });

    const afterRestore = completedAt(restored);
    expect(
      afterRestore,
      `the restored carrier never finished the errand within ${RUN_FOR} ticks; they were last seen doing ${JSON.stringify(readCarrier(restored))}`,
    ).toBeDefined();
    expect(readCarrier(restored)).toMatchObject({ jobState: 'completed', inTheDepot: 4 });
    expect(
      afterRestore! - continuous!,
      'ADR 0093 decision 5 (landing note 3): a restore costs a carry at most two reconsideration cycles',
    ).toBeLessThanOrEqual(RESTORE_BOUND_TICKS);
  });

  it('does not let the restored carrier choose anything but the errand while they hold the goods', () => {
    const live = aCarrierMidDropOff();
    const restored = restoreSimulationRuntime(captureSessionSnapshot(live)).runtime;

    // Every action the restored carrier is seen in *before* the errand ends.
    // The regression put `action.use-toilet` here at tick 1,881, with four
    // bricks in hand and the roster reading "Errand".
    const seen = new Set<string>();
    for (let step = 0; step < RUN_FOR; step += 1) {
      restored.kernel.step();
      if (restored.jobs.getById('errand-1')?.state === 'completed') break;
      const carrier = readCarrier(restored);
      if (carrier.actionId !== undefined) seen.add(carrier.actionId);
    }
    expect([...seen].sort()).toEqual(['action.carry']);
  });
});
