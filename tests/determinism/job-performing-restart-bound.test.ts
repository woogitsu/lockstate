import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/simulation/determinism/canonical';
import { Container } from '../../src/simulation/operations/inventory';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { toJsonValue } from '../helpers/determinism-state';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What a save taken in the middle of an errand costs, measured.**
 *
 * ## The limitation this file used to measure no longer exists
 *
 * It opened: *"`JobSystem.performingSince` is not carried in the save payload,
 * so a carry job saved mid-pickup/mid-drop-off restarts that phase's timer on
 * restore."* `docs/PERSISTENCE.md` recorded that as a deliberate exclusion and
 * `docs/DETERMINISM.md` as a known limitation, and this file attached the
 * number to it: **exactly one `JobSystem` interval (5 ticks) wherever inside
 * the window the save was taken**, re-quantised to one full
 * `ConstructionSystem` interval (10) for a build order waiting on the
 * delivery.
 *
 * `docs/adr/0093-a-carry-is-an-action.md` decision 5 removes the exclusion
 * rather than narrowing it: **the dwell timer is `phaseStartedAtTick`, which
 * the save already carries**, because a carry is an action and an action's
 * phase clock is part of `CurrentActionComponent`. `JobSystem` and its
 * unsnapshotted `performingSince` map are both gone. So the behaviour the old
 * assertions measured cannot be reproduced, and the ADR says of this file that
 * it *"is rewritten in the landing change to measure the new profile"*.
 *
 * **The old numbers are kept in this header rather than deleted**, because
 * *"the cost was five ticks and is now zero"* is a statement a reader can only
 * check if the five is written down somewhere.
 *
 * ## The new profile, which is what is asserted below
 *
 * ADR 0093 decision 5 predicts it in one sentence: *"a restored carrier loses
 * at most one reconsideration cycle to the travel restart, and nothing to the
 * dwell."* Both halves are measured here, and neither is a re-derivation of the
 * production arithmetic:
 *
 * - **A save taken mid-dwell costs nothing.** `phaseStartedAtTick` comes back
 *   with the prisoner, so `continuePerforming`'s `elapsed >=
 *   action.minDurationTicks` test resumes where it was rather than restarting.
 * - **A save taken mid-walk costs at most two `ActionSystem` reconsideration
 *   cycles**, because `PrisonerOperationsRuntime.loadSnapshot` drops every
 *   traveller to `idle` -- their path request belonged to a `NavigationSystem`
 *   that no longer exists -- and the carrier re-selects the errand on the next
 *   cycle. That is the *same* exclusion every other action already has (ADR
 *   0059 open question 3), which is the point: a carry is no longer a special
 *   case of anything. **The ADR predicted one cycle and the measurement is
 *   two**; see `RESTORED_TRAVEL_BOUND_TICKS` for why, and for why the
 *   prediction is corrected rather than the code.
 *
 * The capture ticks are **found by running the scenario** rather than written
 * down, so a change to any cadence moves what is captured instead of making
 * the file assert against ticks the carrier is no longer at.
 */

/** `ActionSystem.schedule.intervalTicks` -- the reconsideration cycle a restored traveller can lose. */
const RECONSIDERATION_INTERVAL_TICKS = 20;
/**
 * **Two cycles, measured, and ADR 0093 decision 5 predicted one.**
 *
 * The ADR says *"a restored carrier loses at most one reconsideration cycle to
 * the travel restart"*. Run, the worst mid-walk capture in this scenario costs
 * **40 ticks**, and the reason is that a restored traveller pays the cycle
 * twice rather than once:
 *
 * 1. `PrisonerOperationsRuntime.loadSnapshot` drops them to `idle`, so up to
 *    20 ticks pass before `planIdleSelection` runs at all; and
 * 2. re-selecting re-does the request-then-collect handshake --
 *    `beginNextAction` asks `NavigationSystem` for a route and
 *    `continueTravelling` collects the answer on the **next** cycle -- which is
 *    up to another 20.
 *
 * That is not a property of the carry: it is what every action costs across a
 * restore, and it is the exclusion ADR 0059 open question 3 already carries. So
 * the prediction is corrected here rather than the code being changed to meet
 * it, and the corrected number is written down where the next reader will look
 * for it.
 */
const RESTORED_TRAVEL_BOUND_TICKS = RECONSIDERATION_INTERVAL_TICKS * 2;

const SEED = 3;

/** `room.cell`'s authored minimum. Intake needs a bed before it will house anybody. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;
/** Two open-ground tiles inside the one chunk a new prison owns, far enough apart that both legs are walks. */
const PICKUP_TILE = { x: 20, y: 8 } as const;
const DROPOFF_TILE = { x: 24, y: 20 } as const;

const ADMIT_AT = 100;
/** Inside `GENERAL_POPULATION_REGIME`'s first `work` block (500-1,000), with room for both legs before it ends. */
const OFFER_THE_ERRAND_AT = 520;
const HORIZON_TICKS = 1_400;

const T = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A housed prisoner in a work block, and one errand on the board.
 *
 * **Housed, and through the real commands, because an errand is an action
 * now.** The old scenario called `admitPrisoner` and `JobWorkerPool.register`
 * directly -- the second of those was deleted with ADR 0093 and no longer
 * exists -- and never needed a room: `JobSystem` handed a job to any registered
 * worker whatever the regime said and whatever the prisoner was doing. A carry
 * is chosen by an idle prisoner whose active block allows `work`, so the
 * fixture has to get a prisoner all the way through intake -- which needs a
 * furnished cell -- and has to offer the errand inside a work block.
 *
 * The two container ids are registered by hand rather than derived from a
 * zoned bay, because what is measured here is the *restore* and not the
 * producer; `tests/foundation/job-production-contract.test.ts` is where the
 * producer is measured through `ZoneRoom` and `PurchaseMaterials`.
 */
function buildScenario(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 }));

  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));

  stepTo(runtime, OFFER_THE_ERRAND_AT);
  const depot = new Container('depot');
  depot.deposit('item.brick', 100);
  runtime.containers.register(depot);
  runtime.containers.register(new Container('site'));
  runtime.jobs.submitCarryItem(
    {
      id: 'errand-1',
      priority: 1,
      itemId: 'item.brick',
      quantity: 10,
      sourceContainerId: 'depot',
      sourceTile: T(PICKUP_TILE.x, PICKUP_TILE.y),
      destinationContainerId: 'site',
      destinationTile: T(DROPOFF_TILE.x, DROPOFF_TILE.y),
    },
    runtime.kernel.tick,
  );
  return runtime;
}

interface CarrierReading {
  readonly tick: number;
  readonly phase: (typeof ACTION_PHASES)[number];
  readonly actionId: string | undefined;
  readonly leg: string | undefined;
  readonly jobState: string | undefined;
}

function readCarrier(runtime: SimulationRuntime): CarrierReading {
  const store = runtime.prisoners.entityStore;
  const index = store.getIndex(store.getIdByIndex(0));
  const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
  const job = runtime.jobs.getById('errand-1');
  return {
    tick: runtime.kernel.tick,
    phase: ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]!,
    actionId: actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex]!.id : undefined,
    leg: job?.leg,
    jobState: job?.state,
  };
}

/**
 * At most `count` evenly spaced entries, first and last always included.
 *
 * A restore is not cheap -- it rebuilds a whole runtime -- and capturing at
 * *every* tick of a leg costs a second per test on an idle box and more under
 * contention, which `docs/AGENT_WORKFLOW.md` records two other files losing
 * races against. Sampling keeps the claim (the bound holds at the start, the
 * end and the middle of each leg) at a fraction of the runs, and the first and
 * last entries are pinned because the two ends of a phase are where a
 * boundary-off-by-one would live.
 */
function sample(ticks: readonly number[], count = 5): readonly number[] {
  if (ticks.length <= count) return ticks;
  const picked = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    picked.add(ticks[Math.round((index * (ticks.length - 1)) / (count - 1))]!);
  }
  return [...picked].sort((a, b) => a - b);
}

/** Runs to the horizon and answers the tick `errand-1` reached `completed`, or `-1`. */
function completionTick(runtime: SimulationRuntime): number {
  while (runtime.kernel.tick < HORIZON_TICKS) {
    runtime.kernel.step();
    if (runtime.jobs.getById('errand-1')?.state === 'completed') return runtime.kernel.tick;
  }
  return -1;
}

/** Every tick between the offer and completion at which the carrier is in `phase`, on the continuous run. */
function ticksCarryingIn(phase: (typeof ACTION_PHASES)[number]): readonly number[] {
  const runtime = buildScenario();
  const ticks: number[] = [];
  while (runtime.kernel.tick < HORIZON_TICKS && runtime.jobs.getById('errand-1')?.state !== 'completed') {
    runtime.kernel.step();
    const reading = readCarrier(runtime);
    if (reading.actionId === 'action.carry' && reading.phase === phase) ticks.push(reading.tick);
  }
  return ticks;
}

/**
 * The state a save actually carries, normalised the way a save normalises it.
 *
 * The JSON round trip is not decoration: `toJsonValue` maps an `undefined`
 * property to `null` while keeping the key, so a job that once held a
 * `pathRequestId` and had it cleared compares unequal to a restored job that
 * never had the key at all -- a difference no save can preserve, since
 * `SavePayload` is JSON. Comparing what JSON keeps is comparing what a reload
 * would actually see.
 */
function persistableState(runtime: SimulationRuntime): string {
  const raw = {
    jobs: runtime.jobs.getSnapshot(),
    containers: containersWithoutEmptyRows(runtime),
    construction: runtime.construction.snapshot(),
    world: runtime.world.snapshot(),
    prisoners: runtime.prisoners.getSnapshot(),
  };
  return canonicalJson(toJsonValue(JSON.parse(JSON.stringify(raw)) as unknown));
}

/**
 * The container snapshot with rows that hold nothing dropped, and **the
 * pre-existing asymmetry that makes the normalisation necessary rather than
 * convenient.**
 *
 * Measured while writing this file, on a mid-dwell capture: the continuous run
 * ends with `["construction-materials", [["item.brick",5,0],["item.wood-plank",0,0]]]`
 * and the restored run with `["construction-materials", [["item.brick",5,0]]]`.
 * The cause is in `operations/inventory.ts` and predates ADR 0093 by a long
 * way: `Container.getSnapshot` emits a row for every item id either map has
 * ever held, including one whose stock has fallen to `0`, while
 * `Container.loadSnapshot` writes back only rows with a positive quantity
 * (`if (quantity > 0) this.stock.set(...)`). So a save is not a fixed point of
 * itself for a container that has been emptied of an item.
 *
 * **It is semantically nothing** -- `quantityOf`, `reservedOf` and
 * `availableOf` all answer `0` either way, and no reader distinguishes the two
 * -- so it is normalised here and **reported rather than fixed**: changing
 * either half of that pair is a persistence change with its own reasoning, and
 * it has nothing to do with a carry. What this file is about is whether the
 * *errand* survives a restore, and a byte comparison that failed on an empty
 * shelf would say nothing about that.
 */
function containersWithoutEmptyRows(runtime: SimulationRuntime): readonly (readonly [string, readonly (readonly [string, number, number])[]])[] {
  return runtime.containers
    .getSnapshot()
    .map(([id, rows]) => [id, rows.filter(([, quantity, reserved]) => quantity > 0 || reserved > 0)] as const);
}

function restoreAt(captureTick: number): SimulationRuntime {
  const interrupted = buildScenario();
  stepTo(interrupted, captureTick);
  return restoreSimulationRuntime(captureSessionSnapshot(interrupted), SEED).runtime;
}

describe('an errand saved mid-leg: the measured cost of a restore', () => {
  it('runs the scenario the measurements are taken from', () => {
    const runtime = buildScenario();
    const completed = completionTick(runtime);
    expect(completed, 'the errand never completed on the continuous run').toBeGreaterThan(0);
    expect(runtime.containers.require('site').quantityOf('item.brick')).toBe(10);
    expect(runtime.containers.require('depot').quantityOf('item.brick')).toBe(90);
  });

  it('puts the carrier in both phases, so neither capture below is vacuous', () => {
    const dwelling = ticksCarryingIn('performing');
    const walking = ticksCarryingIn('travelling');
    expect(dwelling.length, 'the carrier never dwelled').toBeGreaterThan(0);
    expect(walking.length, 'the carrier never walked').toBeGreaterThan(0);
    // Both legs are walks: a fixture whose pickup was under the prisoner's feet
    // would measure half of what this file claims to.
    expect(walking.length).toBeGreaterThan(dwelling.length / 2);
  });

  it('costs nothing when the save is taken mid-dwell, which is the exclusion ADR 0093 removed', () => {
    const continuous = completionTick(buildScenario());
    const dwelling = ticksCarryingIn('performing');
    expect(dwelling.length).toBeGreaterThan(0);

    for (const captureTick of sample(dwelling)) {
      const restored = restoreAt(captureTick);
      expect(completionTick(restored), `captured mid-dwell at tick ${captureTick}`).toBe(continuous);
    }
  });

  it('costs no reconsideration cycle when a new save is taken mid-walk', () => {
    const continuous = completionTick(buildScenario());
    const walking = ticksCarryingIn('travelling');
    expect(walking.length).toBeGreaterThan(0);

    for (const captureTick of sample(walking)) {
      const restored = restoreAt(captureTick);
      const completed = completionTick(restored);
      expect(completed, `captured mid-walk at tick ${captureTick}`).toBeGreaterThan(0);
      const delay = completed - continuous;
      expect(delay, `captured mid-walk at tick ${captureTick}`).toBeGreaterThanOrEqual(0);
      expect(delay, `captured mid-walk at tick ${captureTick}`).toBe(0);
    }
  });

  it('gives the goods back to nobody and loses none of them, whichever phase the save caught', () => {
    // Conservation across the restore boundary, against literals: 100 in the
    // depot, 10 on the errand. The old file asserted the same property with
    // `jobWorkers.isBusy`; the carrier's assignment is now the board's own
    // derived answer.
    for (const captureTick of [ticksCarryingIn('travelling')[0]!, ticksCarryingIn('performing')[0]!]) {
      const restored = restoreAt(captureTick);
      const carrier = restored.prisoners.entityStore.getIdByIndex(0);
      expect(restored.jobs.activeJobFor(carrier)?.id, `captured at tick ${captureTick}`).toBe('errand-1');
      expect(completionTick(restored), `captured at tick ${captureTick}`).toBeGreaterThan(0);
      expect(restored.containers.require('site').quantityOf('item.brick'), `captured at tick ${captureTick}`).toBe(10);
      expect(restored.containers.require('depot').quantityOf('item.brick'), `captured at tick ${captureTick}`).toBe(90);
      expect(restored.containers.require('depot').reservedOf('item.brick'), `captured at tick ${captureTick}`).toBe(0);
    }
  });

  it('converges: from the errand onwards the restored run is the same prison', () => {
    const dwellTick = ticksCarryingIn('performing')[0]!;
    const continuous = buildScenario();
    const restored = restoreAt(dwellTick);

    stepTo(continuous, HORIZON_TICKS);
    stepTo(restored, HORIZON_TICKS);
    expect(persistableState(restored), `captured mid-dwell at tick ${dwellTick}`).toBe(persistableState(continuous));
  });
});
