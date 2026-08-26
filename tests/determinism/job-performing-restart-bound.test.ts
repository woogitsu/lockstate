import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/simulation/determinism/canonical';
import { Container } from '../../src/simulation/operations/inventory';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { toJsonValue } from '../helpers/determinism-state';

/**
 * `JobSystem.performingSince` is not carried in the save payload, so a carry
 * job saved mid-pickup/mid-drop-off restarts that phase's timer on restore.
 * `docs/PERSISTENCE.md` records that as a deliberate exclusion and
 * `docs/DETERMINISM.md` as a known limitation, but both said only that the
 * restored job "finishes later" -- no test captured a job *inside* the
 * performance window, and no number was ever attached to "later".
 *
 * This file attaches the number and then asks the question the number does
 * not answer on its own: whether the delay stays a delay, or whether moving
 * a worker's release relative to the other scheduled systems reorders work
 * downstream of it. Both halves are measurements, and every constant below
 * is one -- not a rounded bound and not a re-derivation of the production
 * arithmetic, so a change in `PICKUP_DROPOFF_DURATION_TICKS`, in either
 * system's `intervalTicks`, or in the restore path moves these assertions
 * and has to be looked at rather than absorbed.
 *
 * The scenario is deliberately the *worst* shape for the exclusion rather
 * than a representative one: a single worker, so the jobs behind the
 * delayed one cannot start early on another worker, and a build order whose
 * materials arrive only by carry job, so a scheduled system with a cadence
 * of its own is waiting on the delivery.
 */

/** `JobSystem.schedule.intervalTicks` -- how long a re-seeded performance phase costs. */
const JOB_SYSTEM_INTERVAL_TICKS = 5;
/** `ConstructionSystem.schedule.intervalTicks` -- the cadence the delay is re-quantised to downstream. */
const CONSTRUCTION_INTERVAL_TICKS = 10;

const SEED = 3;
const HORIZON_TICKS = 300;

const T = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/**
 * One worker, three identical carry jobs queued behind each other, and one
 * build order that stays `materials-pending` until the first delivery lands.
 *
 * The worker starts standing on the source tile, so the pickup leg begins
 * `'performing'` immediately at tick 0 and the drop-off leg has to travel:
 * that puts one performance window at ticks 0-5 and the next at 10-15, both
 * at known ticks, which is what lets the assertions below name ticks instead
 * of comparing "before" and "after".
 */
function buildScenario(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);

  const depot = new Container('depot');
  depot.deposit('item.brick', 100);
  runtime.containers.register(depot);

  const worker = runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 9_000, priorIncidents: 0 }, T(1, 1));
  runtime.jobWorkers.register(worker);

  for (const id of ['job-1', 'job-2', 'job-3']) {
    runtime.jobs.submitCarryItem(
      {
        id,
        priority: 1,
        itemId: 'item.brick',
        quantity: 10,
        sourceContainerId: 'depot',
        sourceTile: T(1, 1),
        destinationContainerId: 'construction-materials',
        destinationTile: T(4, 1),
      },
      0,
    );
  }

  runtime.kernel.submitCommand('build-0', 0, 0, packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-1', definitionId: 'wall-brick', x: 8, y: 8 }));
  return runtime;
}

/**
 * `Kernel.step()` executes tick `kernel.tick` and *then* increments, so a
 * change first visible once `kernel.tick` reads N was computed on tick N-1.
 * Every tick this file reports is the tick the work happened on.
 */
function executedTick(runtime: SimulationRuntime): number {
  return runtime.kernel.tick - 1;
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function brickCount(runtime: SimulationRuntime, containerId: string): number {
  return runtime.containers.require(containerId).quantityOf('item.brick');
}

interface Milestones {
  /** Per job, the tick `withdrawReserved` took its ten bricks out of the depot -- the tick the pickup leg ended. */
  readonly jobWithdrew: Readonly<Record<string, number>>;
  /** Tick the first drop-off deposited into `construction-materials`. */
  readonly firstDeposit: number;
  readonly jobCompleted: Readonly<Record<string, number>>;
  /** Completion order, so a reordering shows up as a different array and not only as different ticks. */
  readonly jobCompletionOrder: readonly string[];
  /** Tick `ConstructionSystem` moved `wall-1` off `materials-pending`. */
  readonly wallMaterialsAllocated: number;
  readonly wallCompleted: number;
}

function runToHorizon(runtime: SimulationRuntime): Milestones {
  const jobWithdrew: Record<string, number> = {};
  const jobCompleted: Record<string, number> = {};
  const jobCompletionOrder: string[] = [];
  let firstDeposit = -1;
  let wallMaterialsAllocated = -1;
  let wallCompleted = -1;

  let materials = brickCount(runtime, 'construction-materials');
  // A job already past its pickup when the run starts must not be recorded as
  // having withdrawn during it -- that is the difference the drop-off-window
  // captures below turn on.
  const pickupPending = new Set(runtime.jobs.allSorted().filter((job) => job.leg === 'pickup').map((job) => job.id));

  while (runtime.kernel.tick < HORIZON_TICKS) {
    runtime.kernel.step();
    const tick = executedTick(runtime);

    const materialsNow = brickCount(runtime, 'construction-materials');
    if (firstDeposit < 0 && materialsNow > materials) firstDeposit = tick;
    materials = materialsNow;

    for (const job of runtime.jobs.allSorted()) {
      if (job.leg === 'dropoff' && pickupPending.delete(job.id)) jobWithdrew[job.id] = tick;
      if (job.state === 'completed' && jobCompleted[job.id] === undefined) {
        jobCompleted[job.id] = tick;
        jobCompletionOrder.push(job.id);
      }
    }
    for (const order of runtime.construction.allOrders()) {
      if (wallMaterialsAllocated < 0 && order.state !== 'approved' && order.state !== 'materials-pending') wallMaterialsAllocated = tick;
      if (wallCompleted < 0 && order.state === 'completed') wallCompleted = tick;
    }
  }

  return { jobWithdrew, firstDeposit, jobCompleted, jobCompletionOrder, wallMaterialsAllocated, wallCompleted };
}

/**
 * A save taken at `captureTick`, restored, and run on to the horizon.
 *
 * Nothing is re-applied on the far side: this scenario's containers and their
 * stock are carried by the payload, so the restored session is the same
 * prison and any difference in what follows is the restore's own.
 */
function restoreAtAndRun(captureTick: number): { readonly runtime: SimulationRuntime; readonly milestones: Milestones } {
  const interrupted = buildScenario();
  stepTo(interrupted, captureTick);
  const { runtime } = restoreSimulationRuntime(captureSessionSnapshot(interrupted), SEED);
  return { runtime, milestones: runToHorizon(runtime) };
}

function jobStateAt(runtime: SimulationRuntime, jobId: string): string {
  const job = runtime.jobs.getById(jobId);
  return `${job?.state ?? 'missing'}/${job?.leg ?? '-'}`;
}

/**
 * The state a save actually carries, normalised the way a save normalises it.
 *
 * The JSON round trip is not decoration: `toJsonValue` maps an
 * `undefined` property to `null` while keeping the key, so a job that once
 * held a `pathRequestId` and had it cleared compares unequal to a restored
 * job that never had the key at all -- a difference no save can preserve,
 * since `SavePayload` is JSON. Comparing what JSON keeps is comparing what a
 * reload would actually see.
 */
function persistableState(runtime: SimulationRuntime): string {
  const raw = {
    jobs: runtime.jobs.getSnapshot(),
    jobWorkers: runtime.jobWorkers.getSnapshot(),
    containers: runtime.containers.getSnapshot(),
    construction: runtime.construction.snapshot(),
    world: runtime.world.snapshot(),
    prisoners: runtime.prisoners.getSnapshot(),
  };
  return canonicalJson(toJsonValue(JSON.parse(JSON.stringify(raw)) as unknown));
}

describe('a carry job saved mid-performance: the measured cost of not snapshotting performingSince', () => {
  /*
   * The baseline every number below is a delta from. Asserted rather than
   * merely recorded, because a scenario that stopped putting a job inside a
   * performance window at the ticks the captures below use would make every
   * other test in this file pass vacuously.
   */
  const CONTINUOUS = {
    jobWithdrew: { 'job-1': 5, 'job-2': 30, 'job-3': 55 },
    firstDeposit: 15,
    jobCompleted: { 'job-1': 15, 'job-2': 40, 'job-3': 65 },
    wallMaterialsAllocated: 20,
    wallCompleted: 80,
  } as const;

  /** Ticks at which `job-1` is `'performing'` -- the pickup window is 0-5, the drop-off window 10-15. */
  const PICKUP_PERFORMING_TICKS = [1, 2, 3, 4] as const;
  const DROPOFF_PERFORMING_TICKS = [11, 12, 13, 14] as const;
  /** Ticks at which `job-1` is `'travelling'` instead -- the already-accepted exclusion, for comparison. */
  const TRAVELLING_TICKS = [6, 7, 8, 9] as const;

  it('runs the scenario the measurements are taken from', () => {
    const runtime = buildScenario();
    const milestones = runToHorizon(runtime);

    expect(milestones.jobWithdrew).toEqual(CONTINUOUS.jobWithdrew);
    expect(milestones.firstDeposit).toBe(CONTINUOUS.firstDeposit);
    expect(milestones.jobCompleted).toEqual(CONTINUOUS.jobCompleted);
    expect(milestones.jobCompletionOrder).toEqual(['job-1', 'job-2', 'job-3']);
    expect(milestones.wallMaterialsAllocated).toBe(CONTINUOUS.wallMaterialsAllocated);
    expect(milestones.wallCompleted).toBe(CONTINUOUS.wallCompleted);
  });

  it('puts job-1 inside a performance window at every tick the captures use', () => {
    const runtime = buildScenario();
    for (const tick of [...PICKUP_PERFORMING_TICKS, ...DROPOFF_PERFORMING_TICKS, ...TRAVELLING_TICKS].sort((a, b) => a - b)) {
      stepTo(runtime, tick);
      const expected = (PICKUP_PERFORMING_TICKS as readonly number[]).includes(tick)
        ? 'performing/pickup'
        : (DROPOFF_PERFORMING_TICKS as readonly number[]).includes(tick)
          ? 'performing/dropoff'
          : 'travelling/dropoff';
      expect(jobStateAt(runtime, 'job-1'), `at tick ${tick}`).toBe(expected);
    }
  });

  it('costs exactly one JobSystem interval, wherever inside the window the save was taken', () => {
    for (const captureTick of PICKUP_PERFORMING_TICKS) {
      const { milestones } = restoreAtAndRun(captureTick);
      expect(milestones.jobWithdrew['job-1'], `captured at tick ${captureTick}`).toBe(CONTINUOUS.jobWithdrew['job-1'] + JOB_SYSTEM_INTERVAL_TICKS);
      expect(milestones.firstDeposit, `captured at tick ${captureTick}`).toBe(CONTINUOUS.firstDeposit + JOB_SYSTEM_INTERVAL_TICKS);
    }

    for (const captureTick of DROPOFF_PERFORMING_TICKS) {
      const { milestones } = restoreAtAndRun(captureTick);
      // The pickup already happened before the save, so only the drop-off moves.
      expect(milestones.jobWithdrew['job-1'], `captured at tick ${captureTick}`).toBeUndefined();
      expect(milestones.firstDeposit, `captured at tick ${captureTick}`).toBe(CONTINUOUS.firstDeposit + JOB_SYSTEM_INTERVAL_TICKS);
    }
  });

  it('holds the container and worker state at the boundary tick, not merely at the end', () => {
    const continuous = buildScenario();
    const { runtime: restored } = restoreAtAndRun(DROPOFF_PERFORMING_TICKS[0]);

    // The tick the continuous run deposits on: the restored run has not, and
    // its worker is still busy on a job the continuous run has finished.
    stepTo(continuous, CONTINUOUS.firstDeposit + 1);
    expect(brickCount(continuous, 'construction-materials')).toBe(10);
    expect(jobStateAt(continuous, 'job-1')).toBe('completed/dropoff');
    expect(continuous.jobWorkers.isBusy(0)).toBe(false);

    const restoredAtSameTick = buildScenario();
    stepTo(restoredAtSameTick, DROPOFF_PERFORMING_TICKS[0]);
    const { runtime: mirrored } = restoreSimulationRuntime(captureSessionSnapshot(restoredAtSameTick), SEED);
    stepTo(mirrored, CONTINUOUS.firstDeposit + 1);
    expect(brickCount(mirrored, 'construction-materials')).toBe(0);
    expect(jobStateAt(mirrored, 'job-1')).toBe('performing/dropoff');
    expect(mirrored.jobWorkers.isBusy(0)).toBe(true);

    // ... and one JobSystem interval later it has caught up, exactly.
    stepTo(mirrored, CONTINUOUS.firstDeposit + 1 + JOB_SYSTEM_INTERVAL_TICKS);
    expect(brickCount(mirrored, 'construction-materials')).toBe(10);
    expect(jobStateAt(mirrored, 'job-1')).toBe('completed/dropoff');
    expect(mirrored.jobWorkers.isBusy(0)).toBe(false);
    expect(restored.jobs.getById('job-1')?.state).toBe('completed');
  });

  it('does not compound down a queue of jobs sharing the delayed worker, and does not reorder them', () => {
    for (const captureTick of [...PICKUP_PERFORMING_TICKS, ...DROPOFF_PERFORMING_TICKS]) {
      const { milestones } = restoreAtAndRun(captureTick);
      expect(milestones.jobCompletionOrder, `captured at tick ${captureTick}`).toEqual(['job-1', 'job-2', 'job-3']);
      for (const [jobId, continuousTick] of Object.entries(CONTINUOUS.jobCompleted)) {
        // The second and third job wait on the same worker, so a delay that
        // grew as it propagated would show here as more than one interval.
        expect(milestones.jobCompleted[jobId], `${jobId} captured at tick ${captureTick}`).toBe(continuousTick + JOB_SYSTEM_INTERVAL_TICKS);
      }
    }
  });

  /*
   * The one place the cost is not the five ticks it starts as. A five-tick
   * slip in the delivery moves it across a `ConstructionSystem` boundary, and
   * that system's own cadence re-quantises the delay to ten -- so the
   * player-visible event (a wall finishing) moves by two JobSystem intervals
   * for a one-interval cause. It is still a delay and still bounded: the
   * amplification is one downstream interval, not a compounding one, which is
   * what the next test settles.
   */
  it('is re-quantised to one full ConstructionSystem interval by a build order waiting on the delivery', () => {
    for (const captureTick of [...PICKUP_PERFORMING_TICKS, ...DROPOFF_PERFORMING_TICKS]) {
      const { milestones } = restoreAtAndRun(captureTick);
      expect(milestones.wallMaterialsAllocated, `captured at tick ${captureTick}`).toBe(CONTINUOUS.wallMaterialsAllocated + CONSTRUCTION_INTERVAL_TICKS);
      expect(milestones.wallCompleted, `captured at tick ${captureTick}`).toBe(CONTINUOUS.wallCompleted + CONSTRUCTION_INTERVAL_TICKS);
    }
  });

  it('converges: from the delayed build completion onwards the two runs are the same prison', () => {
    const convergenceTick = CONTINUOUS.wallCompleted + CONSTRUCTION_INTERVAL_TICKS + 1;

    for (const captureTick of [PICKUP_PERFORMING_TICKS[0], DROPOFF_PERFORMING_TICKS[1]]) {
      const continuous = buildScenario();
      const interrupted = buildScenario();
      stepTo(interrupted, captureTick);
      const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(interrupted), SEED);

      stepTo(continuous, convergenceTick);
      stepTo(restored, convergenceTick);
      expect(persistableState(restored), `captured at tick ${captureTick}`).toBe(persistableState(continuous));

      // And stays converged rather than crossing over once.
      stepTo(continuous, HORIZON_TICKS);
      stepTo(restored, HORIZON_TICKS);
      expect(persistableState(restored), `captured at tick ${captureTick}`).toBe(persistableState(continuous));
    }
  });

  /*
   * Why this exclusion is recorded rather than fixed, stated as a
   * measurement instead of as an argument.
   *
   * `JobBoard.loadSnapshot` already drops a `'travelling'` job back to
   * `'assigned'` on restore -- an accepted, documented exclusion of the same
   * "restart rather than assume arrival" family. Saving five ticks earlier,
   * while the same job is travelling rather than performing, produces the
   * identical profile: every job one JobSystem interval late and the wall one
   * ConstructionSystem interval late. Persisting `performingSince` would
   * narrow the window in which a save costs anything; it would not remove the
   * cost, because the window either side of it already does.
   */
  it('matches, tick for tick, the delay the already-accepted travel restart produces', () => {
    for (const captureTick of TRAVELLING_TICKS) {
      const { milestones } = restoreAtAndRun(captureTick);
      expect(milestones.jobCompletionOrder, `captured at tick ${captureTick}`).toEqual(['job-1', 'job-2', 'job-3']);
      for (const [jobId, continuousTick] of Object.entries(CONTINUOUS.jobCompleted)) {
        expect(milestones.jobCompleted[jobId], `${jobId} captured at tick ${captureTick}`).toBe(continuousTick + JOB_SYSTEM_INTERVAL_TICKS);
      }
      expect(milestones.wallCompleted, `captured at tick ${captureTick}`).toBe(CONTINUOUS.wallCompleted + CONSTRUCTION_INTERVAL_TICKS);
    }
  });
});
