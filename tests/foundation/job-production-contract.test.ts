import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { deliveryBayContainerId } from '../../src/simulation/operations/delivery-route';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
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
 * different claims.
 *
 * ## THE ANSWER CHANGED, AND THIS FILE IS WHERE IT CHANGED
 *
 * **This file used to pin *nothing, because nothing gives it anything to do*.**
 * It asserted `{ jobsSubmitted: 0, workersRegistered: 0 }` over three in-game
 * days of a prison built through `Kernel.submitCommand`, an empty board, an
 * empty worker pool, exactly one session container, and **no call site
 * anywhere under `src/` for `JobBoard.submitCarryItem`**. Its own header named
 * the exit: *"a number moves because something started using the seam, and the
 * assertion is updated in that change rather than deleted."*
 *
 * That is this change. `docs/adr/0093-a-carry-is-an-action.md` -- accepted by
 * the repository owner on 2026-09-03 -- makes a carry an `ActionDefinition`
 * and makes `ProcurementSystem` its first producer, so both zeroes move and
 * the third assertion inverts: there is now exactly one call site and it is
 * `simulation/operations/delivery-route.ts`. `workersRegistered` is gone
 * entirely rather than moved, because `JobWorkerPool` is retired (decision 4):
 * eligibility is the regime's and busyness is the board's.
 *
 * **The old measurement is not deleted, it is the other half of the pair**, and
 * that pairing is the whole design of the file now. ADR 0093 decision 2 keeps
 * today's direct deposit as the graceful fallback wherever the player has not
 * built the route, so *"zero jobs, one container, the delivery lands in
 * `construction-materials`"* is still a true and required statement -- about a
 * prison with no bay. Both prisons are built here, through the same commands,
 * and the difference between them is the feature.
 *
 * ## What is deliberately **not** claimed here
 *
 * **Not that a prisoner in a work block did nothing before.** That reading is
 * in the issue and the measurement below still refutes it: with a furnished
 * `room.kitchen` the prisoner performs a `work`-category action for a large
 * majority of the work blocks, in a real `RoomInstance`, holding a real
 * concurrent-use claim (ADR 0029). The errand is a *third* thing a work block
 * can be, not a first.
 *
 * **Not that the route is free.** The delivery no longer becomes available to
 * construction at `arrivesAtTick`; it becomes available when somebody has
 * carried it. That cost is the feature and `DeliveryBayCarryRoute` states it.
 *
 * ## The exit from this file
 *
 * The same shape as before, in the other direction: a number moves because a
 * *second* producer arrived -- kitchen portions, laundry kits, deconstruction
 * salvage -- and the assertion is updated in that change rather than deleted.
 * Every figure is computed from the run, so the failure message carries the new
 * number.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, and `room.kitchen`'s -- the same rectangles `tests/integration/kitchen-work.test.ts` measures the work shift on. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const KITCHEN_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
/** `room.delivery-bay`'s authored minimum (4x4, 16 tiles) and `room.storage-room`'s (3x3, 9). */
const BAY_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
const STORE_RECT = { x: 20, y: 20, width: 3, height: 3 } as const;
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
 * (`docs/TESTING.md`): the subject is the producer, and this number only
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

/** A cell with a bed and a toilet: what intake needs before a prisoner can be housed. */
function buildTheCell(runtime: SimulationRuntime): void {
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 }));
}

/**
 * A prison built the way a player builds one -- purchased materials, walled
 * rectangles, `ZoneRoom` and `PlaceObject` commands through
 * `Kernel.submitCommand`, and one `AdmitPrisoner` -- **with no delivery bay and
 * no storeroom.**
 *
 * **The commands and not the services**, which is the rule
 * `tests/unit/simulation-refusals.test.ts` states for #375: a fixture that
 * calls a system directly does not exercise the route the behaviour lives on.
 * It matters here because the *decision* under test is a decision about rooms
 * the player zoned, and a fixture that registered a container by hand would
 * answer its own question.
 */
function prisonWithNoRoute(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  buildTheCell(runtime);

  wallRoomPerimeter(runtime.world, KITCHEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-kitchen', packCommand({ type: 'ZoneRoom', roomId: 'room.kitchen', ...KITCHEN_RECT }));
  submit(runtime, 'place-fridge', packCommand({ type: 'PlaceObject', orderId: 'fridge-1', definitionId: 'fridge-brick', x: 13, y: 6 }));
  submit(runtime, 'place-stove', packCommand({ type: 'PlaceObject', orderId: 'stove-1', definitionId: 'stove-brick', x: 10, y: 6 }));
  submit(runtime, 'place-prep', packCommand({ type: 'PlaceObject', orderId: 'prep-1', definitionId: 'prep-counter-brick', x: 10, y: 7 }));
  return runtime;
}

/**
 * The same prison with ADR 0017 decision 4's physical route built: a
 * `room.delivery-bay` holding a loading dock door and a `room.storage-room`
 * holding two racks.
 *
 * **Both ends are furnished, and that is not decoration.** The route gates on
 * each room holding its own authored capability, and
 * `DeliveryBayCarryRoute`'s header carries the prison that measured why: a bay
 * zoned before the first bed is built strands every delivery in it and the
 * prison never admits anybody. The bay takes `room.kitchen`'s rectangle
 * because both are 4x4 minimums and this fixture wants the errand rather than
 * the kitchen shift.
 */
function prisonWithTheRoute(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 8 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  buildTheCell(runtime);

  wallRoomPerimeter(runtime.world, BAY_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-bay', packCommand({ type: 'ZoneRoom', roomId: 'room.delivery-bay', ...BAY_RECT }));
  submit(runtime, 'place-dock', packCommand({ type: 'PlaceObject', orderId: 'dock-1', definitionId: 'loading-dock-door-wooden', x: 10, y: 6 }));

  wallRoomPerimeter(runtime.world, STORE_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-store', packCommand({ type: 'ZoneRoom', roomId: 'room.storage-room', ...STORE_RECT }));
  submit(runtime, 'place-rack-1', packCommand({ type: 'PlaceObject', orderId: 'rack-1', definitionId: 'storage-rack-wooden', x: 20, y: 20 }));
  submit(runtime, 'place-rack-2', packCommand({ type: 'PlaceObject', orderId: 'rack-2', definitionId: 'storage-rack-wooden', x: 21, y: 20 }));
  return runtime;
}

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  /** Times `JobBoard.submitCarryItem` was reached through the live session's own board. */
  readonly jobsSubmitted: number;
  readonly workBlockTicks: number;
  readonly workBlockTicksPerformingWork: number;
  /** Work-block ticks spent performing `action.carry` specifically -- the errand, not the shift. */
  readonly workBlockTicksOnAnErrand: number;
  readonly peakUseClaims: number;
  readonly completedJobs: number;
}

/**
 * Runs the prison and counts what reaches the producer seam, by wrapping the
 * **live session's own** board.
 *
 * A snapshot taken at the end could not answer this: `JobBoard.cancel` and a
 * completed job both leave a row behind, but a job raised and cancelled inside
 * one tick window is exactly the shape a producer wired at the wrong seam
 * would have, and the count is what sees it. Wrapping rather than replacing,
 * so the real method still runs and the producer is exercised rather than
 * swallowed.
 */
function watch(runtime: SimulationRuntime, options: { readonly buyAt?: number } = {}): WatchedRun {
  let jobsSubmitted = 0;
  const board = runtime.jobs;
  const realSubmit = board.submitCarryItem.bind(board);
  board.submitCarryItem = (input, tick) => { jobsSubmitted += 1; return realSubmit(input, tick); };

  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));
  stepTo(runtime, WATCH_FROM);

  const store = runtime.prisoners.entityStore;
  let workBlockTicks = 0;
  let workBlockTicksPerformingWork = 0;
  let workBlockTicksOnAnErrand = 0;
  let peakUseClaims = 0;
  let bought = options.buyAt === undefined;
  const until = WATCH_FROM + DAY_LENGTH_TICKS * WATCH_DAYS;
  for (let tick = runtime.kernel.tick + 1; tick <= until; tick += 1) {
    stepTo(runtime, tick);
    if (!bought && options.buyAt !== undefined && tick >= options.buyAt) {
      bought = true;
      submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-more', itemId: 'item.brick', quantity: 4 }));
    }
    const index = store.getIndex(store.getIdByIndex(0));
    const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
    const inWorkBlock = resolveActiveRegimeBlock(GENERAL_POPULATION_REGIME, tick).allowedCategories.includes('work');
    if (inWorkBlock) workBlockTicks += 1;
    const performing = runtime.prisoners.currentAction.phase[index] === ACTION_PHASES.indexOf('performing');
    if (inWorkBlock && performing && actionIndex >= 0) {
      const action = DEFAULT_ACTIONS[actionIndex]!;
      if (action.category === 'work') workBlockTicksPerformingWork += 1;
      if (action.target.kind === 'job-board') workBlockTicksOnAnErrand += 1;
    }
    peakUseClaims = Math.max(peakUseClaims, runtime.prisoners.roomInstances.totalUseClaims);
  }

  return {
    runtime,
    jobsSubmitted,
    workBlockTicks,
    workBlockTicksPerformingWork,
    workBlockTicksOnAnErrand,
    peakUseClaims,
    completedJobs: runtime.jobs.allSorted().filter((job) => job.state === 'completed').length,
  };
}

/**
 * The containers a prison **with no route** holds, and the reason each one is
 * there.
 *
 * One entry, and it used to be the whole of issue #600's first half: *"No room
 * instance is ever bound to a container, so no delivery ever physically
 * travels."* That sentence is now false of a prison that has built the route
 * and still true of one that has not, which is exactly the pair this file
 * asserts -- see the second test for the bay's derived id.
 */
const ROUTELESS_SESSION_CONTAINERS: Readonly<Record<string, string>> = {
  [CONSTRUCTION_MATERIALS_CONTAINER_ID]:
    'ADR 0017 decision 2\'s destination for a purchase, and the one container `ContainerMaterialsProvider` draws from. `docs/OPERATIONS.md` records the deposit into it as the second deliberate exception to the no-teleport rule; with no bay and no storeroom zoned it is still that exception, which is ADR 0093 decision 2\'s graceful fallback.',
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
 * The file the producer seam is *declared* in, asserted alongside the call-site
 * list so the scan cannot pass vacuously: a rename of `submitCarryItem` would
 * otherwise leave both lists wrong and meaningless.
 *
 * Comments are stripped before both scans, which is #188's lesson applied here
 * -- a comment *about* the producer would otherwise count as the producer, and
 * several files carry exactly such comments.
 */
const CARRY_JOB_DECLARATION_FILE = 'simulation/operations/job.ts';
/** ADR 0093 decision 2's producer, and the only caller. */
const CARRY_JOB_PRODUCER_FILE = 'simulation/operations/delivery-route.ts';

describe('the job board on a live session', () => {
  it('reaches its producer seam in a prison a player can build, and the delivery walks', () => {
    // Bought inside the first watched work block, so the delivery comes due
    // while somebody is eligible to carry it rather than at a tick chosen for
    // convenience.
    const run = watch(prisonWithTheRoute(), { buyAt: 1_350 });

    /*
     * The positive half first, because it is what makes the rest mean
     * something. A prisoner who never worked would leave an empty board for an
     * uninteresting reason.
     */
    expect(run.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });
    expect(run.workBlockTicks).toBe(WORK_TICKS_PER_DAY * WATCH_DAYS);

    /*
     * And the seam. `toBeGreaterThan(0)` rather than an exact count: the number
     * of deliveries a prison raises depends on what
     * `JustInTimeMaterialsService` buys for the build orders this fixture
     * places, which is not the subject of this file. What *is* asserted exactly
     * is that every job the board received reached `completed` -- a producer
     * that raised jobs nobody could carry would leave them `available`.
     */
    expect(run.jobsSubmitted, 'the producer never reached the board').toBeGreaterThan(0);
    expect(run.completedJobs, `jobs were raised but not completed: ${JSON.stringify(run.runtime.jobs.allSorted())}`).toBe(run.jobsSubmitted);

    /*
     * The prisoner carried, in a work block, as an action -- which is the whole
     * of ADR 0093 decision 1. `action.carry` is the only entry of
     * `DEFAULT_ACTIONS` whose target is a job, so this counter cannot be
     * satisfied by kitchen or laundry duty.
     */
    expect(run.workBlockTicksOnAnErrand, 'no work-block tick was spent performing a `job-board` action').toBeGreaterThan(0);
    expect(run.workBlockTicksPerformingWork).toBeGreaterThanOrEqual(run.workBlockTicksOnAnErrand);

    /*
     * **And the errand takes no room seat**, which is the asymmetry decision 1
     * argues: the job's `available -> assigned` transition *is* the claim. This
     * prison has no kitchen, laundry or classroom, so the only `work` action
     * available in it is the carry -- and nothing ever claimed a concurrent-use
     * place.
     */
    expect(run.peakUseClaims, 'a carry claimed a room seat').toBe(0);

    // The materials arrived where construction draws from, by being carried
    // there rather than deposited there.
    expect(run.runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).quantityOf('item.brick')).toBeGreaterThan(0);
  });

  it('keeps the direct deposit in a prison with no bay and no storeroom, and raises nothing', () => {
    const run = watch(prisonWithNoRoute());

    // The same positive half: this prisoner really does work a shift in a real
    // room instance, holding a real claim (ADR 0029). Without it the zeroes
    // below would be zero for an uninteresting reason.
    expect(run.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });
    expect(run.workBlockTicks).toBe(WORK_TICKS_PER_DAY * WATCH_DAYS);
    expect(run.workBlockTicksPerformingWork).toBeGreaterThan(run.workBlockTicks / 2);
    expect(run.peakUseClaims).toBeGreaterThan(0);

    /*
     * **Exact zeroes, and they are the ones this file used to assert of every
     * prison.** ADR 0093 decision 2 keeps today's deposit where either room is
     * missing, and this is that statement measured rather than assumed: the
     * loop is deterministic (one seed, one command order) and a bound would
     * pass for a producer that fired once.
     */
    expect({ jobsSubmitted: run.jobsSubmitted, errandTicks: run.workBlockTicksOnAnErrand }).toEqual({ jobsSubmitted: 0, errandTicks: 0 });
    expect(run.runtime.jobs.getSnapshot()).toEqual([]);
  });

  it('holds exactly the containers named above when no bay is zoned, and the bay\'s derived container when one is', () => {
    const routeless = prisonWithNoRoute();
    stepTo(routeless, WATCH_FROM);
    expect(routeless.containers.all().map((container) => container.id).sort()).toEqual(Object.keys(ROUTELESS_SESSION_CONTAINERS).sort());

    /*
     * And the other side of #600's first half: a room instance **is** bound to
     * a container now, and the binding is derived from the instance id rather
     * than stored (ADR 0093 decision 2). The id is computed by the production
     * function rather than written out here, because the *shape* of the id is
     * that function's decision and a literal here would be a second copy of it
     * -- what this asserts is that the container the route registers is the
     * container the bay's instance names.
     */
    const routed = prisonWithTheRoute();
    stepTo(routed, WATCH_FROM);
    const bay = routed.prisoners.roomInstances.allByRoomCatalogId('room.delivery-bay')[0];
    expect(bay, 'the fixture is only meaningful if the bay was actually zoned').toBeDefined();
    // Registered on first use, so nothing exists until a delivery needs it.
    expect(routed.containers.all().map((container) => container.id).sort()).toEqual([CONSTRUCTION_MATERIALS_CONTAINER_ID]);

    submit(routed, 'buy-late', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-late', itemId: 'item.brick', quantity: 2 }));
    stepTo(routed, routed.kernel.tick + 200);
    expect(routed.containers.all().map((container) => container.id).sort()).toEqual(
      [CONSTRUCTION_MATERIALS_CONTAINER_ID, deliveryBayContainerId(bay!.instanceId)].sort(),
    );
  });

  it('has exactly one call site for the job board\'s producer under src/, and it is the delivery route', () => {
    const matching = (needle: string): readonly string[] =>
      typeScriptFilesUnder(SRC_ROOT)
        .filter((path) => stripComments(readFileSync(path, 'utf8')).includes(needle))
        .map((path) => relative(SRC_ROOT, path).split(/[\\/]/).join('/'))
        .sort();

    // The declaration is still there, spelled the way the call-site scan looks
    // for -- without this the list below proves nothing.
    expect(matching('submitCarryItem(')).toEqual([CARRY_JOB_DECLARATION_FILE, CARRY_JOB_PRODUCER_FILE].sort());
    /*
     * **And exactly one thing calls it. This assertion read `toEqual([])` until
     * ADR 0093**, and the empty list was the finding: a consumer with no
     * writer, the mirror image of the dead-room shape. A member call is the
     * only way to reach a `JobBoard`'s method, so the leading dot is what
     * separates the two scans.
     */
    expect(matching('.submitCarryItem(')).toEqual([CARRY_JOB_PRODUCER_FILE]);
  });
});

/**
 * **Which `JobLifecycleState` members a carry job can actually be in, split
 * three ways rather than two -- and the third partition is the finding.**
 *
 * `JobBoard.loadSnapshot`'s docblock said, until this file existed, that
 * `'travelling'`, `'performing'` and `'reserved'` all stay in the union
 * *"because a save written before ADR 0093 can carry them"*. That is a
 * statement about producers, and it was never checked against any: it holds
 * for the first two and not for the third.
 *
 * - **`'travelling'` and `'performing'` had a producer and lost it.** The
 *   deleted `JobSystem` assigned both, so a save written by a pre-ADR-0093
 *   build really can hold them, `carryItemJobSchema` really will validate such
 *   a save, and `JobBoard.loadSnapshot` really does normalise the first of the
 *   two back to `'assigned'`. Deleting either is a data-loss bug and not a
 *   cleanup.
 * - **`'reserved'` has never had one.** It came in with issue #25's lifecycle
 *   vocabulary and no commit has ever assigned it. It stays for the reason
 *   `JobBoard.loadSnapshot`'s docblock now gives -- the save reader's `z.enum`
 *   and this union are joined by an `as unknown as` cast and nothing else, so
 *   a union narrower than the reader is an unchecked claim -- and that is a
 *   different reason from the other two, which is the whole point of writing
 *   the partition down.
 *
 * **What each half of the pin is worth, stated rather than implied.** The
 * runtime half is a measurement and can only ever be positive evidence: it
 * samples the board once per tick, so a state entered and left inside one tick
 * would not appear in it. The source half is what carries the negative claim,
 * and it is narrow on purpose -- it reads the module that owns the vocabulary
 * and asks which literals it *writes*, which is the question a grep for the
 * member name cannot answer (a member named only in a `switch` is still
 * unreachable if nothing assigns it).
 *
 * The exit is the same shape as the rest of this file: a member changes
 * partition because something started or stopped producing it, and the
 * `Record` below fails to compile until whoever adds a ninth member has said
 * which of the three it is.
 */
const JOB_LIFECYCLE_REACHABILITY: Readonly<Record<JobLifecycleState, string>> = {
  available: 'produced: `JobBoard.submitCarryItem` opens every job here.',
  assigned: 'produced: `JobBoard.assignTo`, and `JobBoard.loadSnapshot` normalising a restored `travelling` job.',
  cancelled: 'produced: `JobBoard.cancel`.',
  completed: 'produced: `JobBoard.endJob`, which takes the terminal state as an argument rather than writing a literal.',
  failed: 'produced: `JobBoard.endJob`, same argument.',
  performing: 'save-only: the deleted `JobSystem` wrote it; `CarryJobExecutor.reconcileRestoredJobs` decides such a restored job.',
  travelling: 'save-only: the deleted `JobSystem` wrote it; `JobBoard.loadSnapshot` normalises it to `assigned`.',
  reserved: 'never produced: no commit in this repository has ever assigned it. Kept to mirror the save reader, not to carry a save.',
};

const PRODUCED_BY_THIS_BUILD: readonly JobLifecycleState[] = ['assigned', 'available', 'cancelled', 'completed', 'failed'];
const CARRIED_ONLY_BY_A_PRE_ADR_0093_SAVE: readonly JobLifecycleState[] = ['performing', 'travelling'];
const NEVER_PRODUCED_BY_ANY_BUILD: readonly JobLifecycleState[] = ['reserved'];

/** The module that owns the vocabulary; the only place a carry job's `state` is written. */
const OPERATIONS_ROOT = join(SRC_ROOT, 'simulation/operations');

/** Every `state = 'x'` / `state: 'x'` literal a file writes, comments stripped first (#188). */
function stateLiteralsWrittenIn(path: string): readonly string[] {
  const source = stripComments(readFileSync(path, 'utf8'));
  return [...source.matchAll(/\bstate\s*[:=]\s*'([a-z-]+)'/g)].map((match) => match[1]!);
}

describe('a carry job\'s lifecycle states, partitioned by producer', () => {
  it('partitions every member of the union exactly once', () => {
    const partitioned = [...PRODUCED_BY_THIS_BUILD, ...CARRIED_ONLY_BY_A_PRE_ADR_0093_SAVE, ...NEVER_PRODUCED_BY_ANY_BUILD];
    expect([...partitioned].sort()).toEqual(Object.keys(JOB_LIFECYCLE_REACHABILITY).sort());
    // Terminal-ness is a property of the produced half alone: neither save-only
    // member is terminal, which is why a restored one needs a path rather than
    // being ignored.
    expect(TERMINAL_JOB_STATES.every((state) => PRODUCED_BY_THIS_BUILD.includes(state))).toBe(true);
  });

  it('writes only the produced members anywhere under src/simulation/operations/', () => {
    const written = new Map<string, readonly string[]>();
    for (const path of typeScriptFilesUnder(OPERATIONS_ROOT)) {
      const literals = stateLiteralsWrittenIn(path);
      if (literals.length > 0) written.set(relative(SRC_ROOT, path).split(/[\\/]/).join('/'), literals);
    }

    /*
     * The declaration file is the only writer, which is what makes the negative
     * claim below mean something: a second writer would have to be read before
     * anybody could say what a job's state can be.
     */
    expect([...written.keys()]).toEqual([CARRY_JOB_DECLARATION_FILE]);

    const literals = new Set(written.get(CARRY_JOB_DECLARATION_FILE));
    /*
     * `'completed'` and `'failed'` are absent because `JobBoard.endJob` takes
     * the state as a typed parameter -- the runtime measurement below is what
     * establishes those two, and the direct transitions in the test after it
     * establish the pair this fixture's happy path never reaches.
     */
    expect([...literals].sort()).toEqual(['assigned', 'available', 'cancelled']);
    for (const state of [...CARRIED_ONLY_BY_A_PRE_ADR_0093_SAVE, ...NEVER_PRODUCED_BY_ANY_BUILD]) {
      expect(literals.has(state), `\`${state}\` is written by this build after all: ${JOB_LIFECYCLE_REACHABILITY[state]}`).toBe(false);
    }
  });

  it('never shows a save-only or never-produced state on a live prison that runs errands', () => {
    const runtime = prisonWithTheRoute();
    const seen = new Set<string>();
    const record = (): void => {
      for (const job of runtime.jobs.allSorted()) seen.add(job.state);
    };

    stepTo(runtime, ADMIT_AT);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));
    stepTo(runtime, WATCH_FROM);
    record();
    let bought = false;
    const until = WATCH_FROM + DAY_LENGTH_TICKS * WATCH_DAYS;
    for (let tick = runtime.kernel.tick + 1; tick <= until; tick += 1) {
      stepTo(runtime, tick);
      if (!bought && tick >= 1_350) {
        bought = true;
        submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-more', itemId: 'item.brick', quantity: 4 }));
      }
      record();
    }

    // Positive half first: an empty board would satisfy every negative below.
    expect(runtime.jobs.allSorted().length, 'the prison ran no errand, so this measures nothing').toBeGreaterThan(0);
    expect([...seen].sort()).toEqual(['assigned', 'available', 'completed']);
  });

  it('reaches the two terminal states the happy path does not, through the board itself', () => {
    const board = new JobBoard();
    const input = {
      priority: 1,
      itemId: 'item.brick',
      quantity: 1,
      sourceContainerId: 'source',
      sourceTile: { x: 0, y: 0 },
      destinationContainerId: 'destination',
      destinationTile: { x: 1, y: 0 },
    } as const;

    const failing = board.submitCarryItem({ ...input, id: 'job-fail' }, 0);
    expect(failing.state).toBe('available');
    expect(board.assignTo('job-fail', 1)).toBe(true);
    expect(failing.state).toBe('assigned');
    expect(board.endJob('job-fail', 'failed', 'carrier-departed')).toBe(true);
    expect(failing.state).toBe('failed');

    board.submitCarryItem({ ...input, id: 'job-cancel' }, 0);
    expect(board.cancel('job-cancel')).toBe(true);
    expect(board.getById('job-cancel')?.state).toBe('cancelled');
  });
});
