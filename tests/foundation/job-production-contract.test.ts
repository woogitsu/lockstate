import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { DAY_LENGTH_TICKS, GENERAL_POPULATION_REGIME, resolveActiveRegimeBlock } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, CONSTRUCTION_MATERIALS_CONTAINER_ID, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Whether the job system has a producer, measured rather than asserted from
 * a grep.**
 *
 * Issue #600 opens by quoting the design brief: *"A complete job system exists
 * -- job board, workers, containers, carry legs, reservations, pathfinding --
 * and is fully tested end to end, on containers whose ids merely look like
 * rooms."* Both halves of that sentence are load-bearing and this repository
 * has learned the hard way that *"it exists"* and *"it does anything"* are
 * different claims -- `unconsumed-content-contract.test.ts` exists because
 * four agents rediscovered the same absence, and
 * `room-routing-contract.test.ts` exists because that file's measure could not
 * see a room a prisoner cannot reach.
 *
 * This is the third question in that family, asked of a *system* rather than
 * of a content id: **`JobSystem` is constructed and registered on every
 * session's kernel (`runtime/new-session.ts`, order 260, every 5 ticks), so
 * what does it do on a tick?** The answer this file pins is *nothing, because
 * nothing gives it anything to do*, and it pins it three ways so that the day
 * a producer arrives, the failure names which half arrived.
 *
 * ## What is deliberately **not** claimed here
 *
 * **Not that the job system is dead code, and not that it should be deleted.**
 * ADR 0017 decision 4 names `room.delivery-bay`, `object.loading-dock-door`
 * and `room.storage-room` as *"the intended physical route"* and says in the
 * same breath **"do not delete them as dead content"**; ADR 0037 decided what
 * happens to goods in a dying carrier's hands; `docs/OPERATIONS.md` records
 * the direct deposit that stands in for the route as *"scaffolding"*. The
 * substrate is decided-and-unbuilt, which is a different thing from unused, and
 * #141's own words apply: *"'has no consumer' and 'is dead' are not the same
 * statement."*
 *
 * **Not that a prisoner in a work block does nothing.** That reading is in the
 * issue and the measurement below refutes it: with a furnished `room.kitchen`
 * the prisoner performs a `work`-category action for a large majority of the
 * work blocks, in a real `RoomInstance`, holding a real concurrent-use claim
 * (ADR 0029). What a working prisoner is *not* is a member of
 * `JobWorkerPool` -- which is what `prisoners/job-worker-adapter.ts` says
 * about itself: *"No prisoner is registered as a worker by default; that is a
 * session/scenario/future-regime decision, not implicit behavior."* The third
 * case below is what stops that sentence rotting silently.
 *
 * ## The exit from this file
 *
 * The same one those two sibling gates describe: a number moves because
 * something started using the seam, and the assertion is updated in that
 * change rather than deleted. Every figure is computed from the run, so the
 * failure message carries the new number instead of only the fact that it
 * moved.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, and `room.kitchen`'s -- the same rectangles `tests/integration/kitchen-work.test.ts` measures the work shift on. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const KITCHEN_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;

const ADMIT_AT = 600;
const WATCH_FROM = 1_000;
/**
 * Three in-game days, which is 7,200 ticks of kernel on top of the 1,000 the
 * fixture spends building. Enough that both work blocks run three times each;
 * short enough to keep this file well clear of the 5,000 ms test timeout that
 * `docs/AGENT_WORKFLOW.md` records two other files losing races against on a
 * loaded machine.
 */
const WATCH_DAYS = 3;

/**
 * How many ticks of one day `GENERAL_POPULATION_REGIME` allows `work` in, read
 * off the schedule rather than written down as 1,000.
 *
 * The schedule is content and not the subject of this file, so reading it is
 * not a fixture supplying both sides of its own comparison
 * (`docs/TESTING.md`): the subject is `JobSystem`, and this number only
 * establishes that the prisoner had a shift to work at all.
 */
const WORK_TICKS_PER_DAY = GENERAL_POPULATION_REGIME.blocks
  .filter((block) => block.allowedCategories.includes('work'))
  .reduce((total, block) => total + (block.endTickOfDay - block.startTickOfDay), 0);

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A prison built the way a player builds one: purchased materials, walled
 * rectangles, `ZoneRoom` and `PlaceObject` commands through
 * `Kernel.submitCommand`, and one `AdmitPrisoner`.
 *
 * **The commands and not the services**, which is the rule
 * `tests/unit/simulation-refusals.test.ts` states for #375: a fixture that
 * calls a system directly does not exercise the route the behaviour lives on.
 * It matters more here than usual, because the *only* things in this
 * repository that ever put a job on a board or a worker in the pool are test
 * helpers doing exactly that (`tests/helpers/determinism-scenario.ts` and
 * `tests/determinism/job-performing-restart-bound.test.ts`), so a fixture
 * shaped like theirs would answer its own question.
 */
function prisonAPlayerCanBuild(): SimulationRuntime {
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
  return runtime;
}

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  /** Times `JobBoard.submitCarryItem` was reached through the live session's own board. */
  readonly jobsSubmitted: number;
  /** Times `JobWorkerPool.register` was reached through the live session's own pool. */
  readonly workersRegistered: number;
  readonly workBlockTicks: number;
  readonly workBlockTicksPerformingWork: number;
  readonly peakUseClaims: number;
}

/**
 * Runs the prison and counts what reaches the two seams a producer must go
 * through, by wrapping the **live session's own** board and pool.
 *
 * A snapshot taken at the end could not answer this: `JobBoard.cancel` and a
 * completed job both leave a row behind, but a job raised and cancelled inside
 * one tick window is exactly the shape a producer wired at the wrong seam
 * would have, and the count is what sees it. Wrapping rather than replacing,
 * so the real method still runs and a producer that appears is exercised
 * rather than swallowed.
 */
function watch(runtime: SimulationRuntime): WatchedRun {
  let jobsSubmitted = 0;
  let workersRegistered = 0;
  const board = runtime.jobs;
  const pool = runtime.jobWorkers;
  const realSubmit = board.submitCarryItem.bind(board);
  const realRegister = pool.register.bind(pool);
  board.submitCarryItem = (input, tick) => { jobsSubmitted += 1; return realSubmit(input, tick); };
  pool.register = (entityId) => { workersRegistered += 1; realRegister(entityId); };

  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));
  stepTo(runtime, WATCH_FROM);

  const store = runtime.prisoners.entityStore;
  let workBlockTicks = 0;
  let workBlockTicksPerformingWork = 0;
  let peakUseClaims = 0;
  const until = WATCH_FROM + DAY_LENGTH_TICKS * WATCH_DAYS;
  for (let tick = runtime.kernel.tick + 1; tick <= until; tick += 1) {
    stepTo(runtime, tick);
    const index = store.getIndex(store.getIdByIndex(0));
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    const inWorkBlock = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, tick).allowedCategories.includes('work');
    if (inWorkBlock) workBlockTicks += 1;
    // `2` is `performing` in `ACTION_PHASES`; the phase names are not exported
    // and what matters here is that the action is being done rather than
    // travelled to, which is `tests/integration/kitchen-work.test.ts`'s reading
    // of the same two integers.
    if (inWorkBlock && runtime.prisoners.currentAction.phase[index] === 2 && actionIndex >= 0) {
      if (DEFAULT_ACTIONS[actionIndex]!.category === 'work') workBlockTicksPerformingWork += 1;
    }
    peakUseClaims = Math.max(peakUseClaims, runtime.prisoners.roomInstances.totalUseClaims);
  }

  return { runtime, jobsSubmitted, workersRegistered, workBlockTicks, workBlockTicksPerformingWork, peakUseClaims };
}

/**
 * The containers a session holds, and the reason each one is there.
 *
 * One entry, and it is the whole of issue #600's first half: *"No room
 * instance is ever bound to a container, so no delivery ever physically
 * travels."* `ContainerRegistry` is keyed by a bare string id and a
 * `Container` carries no tile and no room instance
 * (`operations/inventory.ts`), so a bay or a storeroom becoming real is a
 * *new id in this map* -- which is why the set is pinned by name rather than
 * by count.
 */
const SESSION_CONTAINERS: Readonly<Record<string, string>> = {
  [CONSTRUCTION_MATERIALS_CONTAINER_ID]:
    'ADR 0017 decision 2\'s destination for a purchase, and the one container `ContainerMaterialsProvider` draws from. `docs/OPERATIONS.md` records the deposit into it as the second deliberate exception to the no-teleport rule, and as scaffolding for ADR 0017 decision 4\'s physical route.',
};

const SRC_ROOT = join(__dirname, '../../src');

function typeScriptFilesUnder(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...typeScriptFilesUnder(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

/**
 * The file the producer seam is *declared* in, asserted alongside the empty
 * call-site list so the scan cannot pass vacuously: a rename of
 * `submitCarryItem` would otherwise leave "no call site" true and meaningless.
 *
 * Comments are stripped before both scans, which is #188's lesson applied here
 * -- a comment *about* the absent producer would otherwise count as the
 * producer, and `runtime/new-session.ts` carries exactly such a comment
 * (*"there is no bay to deliver to, and inventing one would mean deciding
 * where a new prison's bay sits and when a carry job is raised"*).
 */
const CARRY_JOB_DECLARATION_FILE = 'simulation/operations/job.ts';

describe('the job system on a live session', () => {
  it('reaches neither of its two producer seams in a prison a player can build', () => {
    const run = watch(prisonAPlayerCanBuild());

    /*
     * The positive half first, because it is what makes the negative half
     * mean something. A prisoner who never worked would leave an empty worker
     * pool for an uninteresting reason.
     */
    expect(run.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });
    expect(run.workBlockTicks).toBe(WORK_TICKS_PER_DAY * WATCH_DAYS);
    expect(run.workBlockTicksPerformingWork).toBeGreaterThan(run.workBlockTicks / 2);
    // A real room instance, claimed for concurrent use while the work happens
    // (ADR 0029) -- so the work is already bound to a room, and it is the
    // *job board* that is not.
    expect(run.peakUseClaims).toBeGreaterThan(0);

    /*
     * And the two seams. Exact zeroes rather than bounds: the loop is
     * deterministic (one seed, one command order) and a bound would pass for
     * a producer that fired once.
     */
    expect({ jobsSubmitted: run.jobsSubmitted, workersRegistered: run.workersRegistered }).toEqual({ jobsSubmitted: 0, workersRegistered: 0 });
    expect(run.runtime.jobs.getSnapshot()).toEqual([]);
    expect(run.runtime.jobWorkers.getSnapshot()).toEqual({ workers: [], busy: [] });
  });

  it('holds exactly the containers named above, none of them bound to a room instance', () => {
    const runtime = prisonAPlayerCanBuild();
    stepTo(runtime, WATCH_FROM);
    expect(runtime.containers.all().map((container) => container.id).sort()).toEqual(Object.keys(SESSION_CONTAINERS).sort());
  });

  it('has no call site for the job board\'s producer anywhere under src/', () => {
    const matching = (needle: string): readonly string[] =>
      typeScriptFilesUnder(SRC_ROOT)
        .filter((path) => stripComments(readFileSync(path, 'utf8')).includes(needle))
        .map((path) => relative(SRC_ROOT, path).split(/[\\/]/).join('/'))
        .sort();

    // The declaration is still there, spelled the way the call-site scan looks
    // for -- without this the empty list below proves nothing.
    expect(matching('submitCarryItem(')).toEqual([CARRY_JOB_DECLARATION_FILE]);
    // And nothing calls it. A member call is the only way to reach a
    // `JobBoard`'s method, so the leading dot is what separates the two scans.
    expect(matching('.submitCarryItem(')).toEqual([]);
  });
});
