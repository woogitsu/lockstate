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
 *   cycles**, because a restored carrier's path request belonged to a
 *   `NavigationSystem` that no longer exists, so `continueTravelling` asks for
 *   the leg again on the next cycle and collects the answer on the one after.
 *   That is the *same* exclusion every other action already has (ADR 0059
 *   open question 3), which is the point: a carry is no longer a special case
 *   of anything. **The ADR predicted one cycle and the measurement is two**;
 *   see `RESTORED_TRAVEL_BOUND_TICKS` for why, and for why the prediction is
 *   corrected rather than the code.
 *
 *   **This bullet used to say the two cycles were paid by `loadSnapshot`
 *   dropping *every* traveller to `idle` and the carrier then re-selecting the
 *   errand.** That was true of the tree it was written for and is the very
 *   thing issue #882 costed at 1,280 ticks across a block boundary; the two
 *   cycles are unchanged, only the route to them is. See the section below.
 *
 * The capture ticks are **found by running the scenario** rather than written
 * down, so a change to any cadence moves what is captured instead of making
 * the file assert against ticks the carrier is no longer at.
 *
 * ## What this file measured and what it missed, added 2026-09-03 (#882)
 *
 * **Both statements above are true of an errand that fits inside one work
 * block, and that is the only errand this file used to run.**
 * `OFFER_THE_ERRAND_AT` is 520 and both legs finish by 721, so the block
 * boundary at 1,000 is never crossed and the question the boundary asks is
 * never put. Played through the UI, issue #882 crossed it and measured **380
 * ticks** against the 40 this file pins.
 *
 * The mechanism was that going idle is not free for a carry the way it is for
 * every other action. `PrisonerOperationsRuntime.loadSnapshot` dropped a
 * restored traveller to `'idle'`, which forces
 * `ActionSystem.planIdleSelection` to ask an eligibility question continuous
 * play never asks -- and `action.carry` is category `work`, so a carrier
 * restored near the end of a work block was filtered out of the errand they
 * are already holding the goods for. `describe('an errand saved across a
 * block boundary')` below is that case, measured at the worst boundary rather
 * than the one the playtest happened to hit:
 * **1,280 ticks, 32 times the bound this file pins**, because the gap between
 * the end of the 1,300-1,800 work block and the start of the next day's
 * 500-1,000 one is 1,100 ticks.
 *
 * `docs/research/2026-09-03-what-a-restore-costs-an-errand.md` is the
 * construction, the three terms the 1,280 is made of, and the four attempts
 * that failed to lose the goods.
 *
 * ## What fixed it, and why that is a conformance change rather than a design one
 *
 * **ADR 0093 decision 5 had already decided this, and the landing change did
 * not build what it decided.** Its words are *"A carrier is instead
 * **re-seated from the board** after it loads -- `actionIndex` the carry,
 * `travelling`, no request"*; the landing change dropped the carrier to
 * `'idle'` like every other traveller and let `planIdleSelection` re-select
 * the errand instead, recording the substitution as *"the same one restore
 * rule, reached without adding a path"*. The 1,280 above is the measurement
 * that refutes that sentence: the two routes agree inside a work block and
 * diverge across a boundary, because re-selection asks whether `work` is
 * allowed *now* and re-seating asks nobody anything.
 * `PrisonerOperationsRuntime.loadSnapshot` now keeps a restored carrier
 * `travelling`, and the numbers below are what that costs.
 *
 * **The 1,280 is kept in this header rather than deleted**, for the same
 * reason the five ticks above it are: *"it used to cost 1,280 and now costs
 * 40"* is only checkable against a written-down 1,280.
 *
 * **What is deliberately NOT changed, and is the class this fix does not
 * close.** `planIdleSelection` still reads
 * `isActionCategoryAllowed(CARRY_ACTION, block.allowedCategories)` before it
 * asks `carryAvailableFor`, and `&&` still short-circuits -- so *any* future
 * path that leaves a prisoner idle while a non-terminal errand is still
 * assigned to them inherits this whole cost. No path in `src/` does that
 * today (every exit that idles a carrier fails the job first; see
 * `ActionSystem.carryAvailableFor`). Reordering that gate is issue #882's own
 * proposal and it would offer a carry in a block that does not allow `work`,
 * which contradicts decision 2's *"offered a carry iff they are idle at a
 * reconsideration ... and their active block allows `work`"* -- an amendment
 * to an accepted decision, and not this file's to make.
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

/**
 * Inside `GENERAL_POPULATION_REGIME`'s **second** `work` block (1,300-1,800),
 * late enough that the drop-off leg is still being walked when the block ends.
 *
 * 1,640 rather than a rounder number because both legs have to fit: the carry
 * is selected at 1,661, the pickup dwell ends at 1,740 and the drop-off walk
 * runs 1,741-1,792, so the errand completes at 1,801 -- eight ticks after the
 * block it was taken in has ended, which is `action.carry` outlasting its block
 * exactly as ADR 0093's Consequences say it does. An offer much later than this
 * is not selected at all until the next day, which is the *other* cost ADR 0093
 * decision 2 already states (a delivery waiting in a bay for up to 1,100 ticks)
 * and is not what this file measures.
 */
const OFFER_THE_LATE_ERRAND_AT = 1_640;
/** Long enough to contain the next day's first work block, which is where a filtered-out carry resumes. */
const LATE_HORIZON_TICKS = 4_000;

/**
 * **What the boundary cost before ADR 0093 decision 5 was built as written,
 * and the three terms it was made of.** No longer asserted as a cost -- the
 * restore no longer pays it -- but kept as the number the fix removed, and
 * used below only to state how large a factor that is:
 *
 * - **1,100** ticks: the gap from the end of the 1,300-1,800 work block to the
 *   start of the next day's 500-1,000 one (`prisoners/regime.ts`). This is the
 *   same figure ADR 0093 decision 2 states for a delivery with nobody to carry
 *   it, which is the point -- a restore turns an errand already in hand back
 *   into one nobody has started.
 * - **+80**: the prisoner is not idle when the work block opens.
 *   `action.sleep` selected at 2,761 runs its `minDurationTicks: 200` to 2,961,
 *   and the carry is re-selected at 2,981. An action is not cut at a block
 *   boundary -- the same rule the carry itself relies on.
 * - **+100**: the walk the wandering created. The restored carrier walks the
 *   goods home to its cell (arriving 1,877) and has to walk back out to the
 *   drop-off tile, 2,981-3,069, plus the dwell.
 *
 * So 3,081 against a continuous 1,801, on `f7adf652` (v0.0.419), which is the
 * commit the research note measured. **The assertions below no longer expect
 * it**: with a restored carrier kept `travelling` the same captures cost
 * `RESTORED_TRAVEL_BOUND_TICKS`, and the mutation that shows this file would
 * notice is dropping the carrier to `idle` again, which puts the 1,280 back.
 */
const BLOCK_BOUNDARY_COST_TICKS_BEFORE_THE_FIX = 1_280;

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
function buildScenario(offerAt: number = OFFER_THE_ERRAND_AT): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 }));

  stepTo(runtime, ADMIT_AT);
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));

  stepTo(runtime, offerAt);
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
function completionTick(runtime: SimulationRuntime, horizon: number = HORIZON_TICKS): number {
  while (runtime.kernel.tick < horizon) {
    runtime.kernel.step();
    if (runtime.jobs.getById('errand-1')?.state === 'completed') return runtime.kernel.tick;
  }
  return -1;
}

/** Every tick between the offer and completion at which the carrier is in `phase`, on the continuous run. */
function ticksCarryingIn(phase: (typeof ACTION_PHASES)[number], offerAt: number = OFFER_THE_ERRAND_AT, horizon: number = HORIZON_TICKS): readonly number[] {
  const runtime = buildScenario(offerAt);
  const ticks: number[] = [];
  while (runtime.kernel.tick < horizon && runtime.jobs.getById('errand-1')?.state !== 'completed') {
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

/**
 * The same restore, for an errand offered late in the second work block.
 *
 * The **two-argument** call production uses, deliberately: what the tests
 * below measure is the restore every save gets, not a mode one of them asks
 * for. An earlier revision of this file took a `resume: boolean` and drove an
 * off-by-default option; the option is gone, because ADR 0093 decision 5 is a
 * rule and not a setting.
 */
function restoreLateErrandAt(captureTick: number): SimulationRuntime {
  const interrupted = buildScenario(OFFER_THE_LATE_ERRAND_AT);
  stepTo(interrupted, captureTick);
  return restoreSimulationRuntime(captureSessionSnapshot(interrupted), SEED).runtime;
}

/**
 * The phase name of the one prisoner in the fixture.
 *
 * A helper rather than the expression inlined three times, because the
 * index-of-id-of-index round trip is what the assertion is *not* about.
 */
function phaseOf(runtime: SimulationRuntime): string | undefined {
  const entityId = runtime.prisoners.entityStore.getIdByIndex(0);
  return ACTION_PHASES[runtime.prisoners.currentAction.phase[runtime.prisoners.entityStore.getIndex(entityId)]!];
}

/** Bricks in the depot plus bricks at the site plus bricks in a carrier's hands. */
function bricksInTheWorld(runtime: SimulationRuntime): number {
  const job = runtime.jobs.getById('errand-1');
  const inHand = job !== undefined && !['completed', 'failed', 'cancelled'].includes(job.state) && job.leg === 'dropoff' ? job.quantity : 0;
  return runtime.containers.require('depot').quantityOf('item.brick') + runtime.containers.require('site').quantityOf('item.brick') + inHand;
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

  it('costs at most one reconsideration cycle when the save is taken mid-walk', () => {
    const continuous = completionTick(buildScenario());
    const walking = ticksCarryingIn('travelling');
    expect(walking.length).toBeGreaterThan(0);

    let anyDelay = false;
    for (const captureTick of sample(walking)) {
      const restored = restoreAt(captureTick);
      const completed = completionTick(restored);
      expect(completed, `captured mid-walk at tick ${captureTick}`).toBeGreaterThan(0);
      const delay = completed - continuous;
      expect(delay, `captured mid-walk at tick ${captureTick}`).toBeGreaterThanOrEqual(0);
      expect(delay, `captured mid-walk at tick ${captureTick}`).toBeLessThanOrEqual(RESTORED_TRAVEL_BOUND_TICKS);
      if (delay > 0) anyDelay = true;
    }
    // The bound is only interesting if some capture actually pays it: a run
    // where every mid-walk save cost zero would pass the bound vacuously.
    expect(anyDelay, 'no sampled mid-walk capture cost anything, so the bound above is untested').toBe(true);
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

/**
 * **The case the file above never ran: a save taken while the errand is still
 * being walked and the work block is about to end** (issue
 * [#882](https://github.com/matmaxalez/lockstate/issues/882)).
 *
 * Nothing here re-derives the production arithmetic. The capture tick is the
 * last tick the continuous run spends walking, found by running it; the
 * continuous completion is measured; and the two numbers the assertions carry
 * -- 1,280 and 40 -- are the measurement and the bound the file already pins.
 */
describe('an errand saved across a block boundary: what the restore costs', () => {
  it('runs the late errand at all, so neither capture below is vacuous', () => {
    const completed = completionTick(buildScenario(OFFER_THE_LATE_ERRAND_AT), LATE_HORIZON_TICKS);
    expect(completed, 'the late errand never completed on the continuous run').toBeGreaterThan(0);
    // The whole construction: the errand finishes *after* the work block it was
    // taken in has ended. A fixture whose errand fitted inside the block would
    // measure the file's first half a second time.
    expect(completed).toBeGreaterThan(1_800);
    const walking = ticksCarryingIn('travelling', OFFER_THE_LATE_ERRAND_AT, LATE_HORIZON_TICKS);
    expect(walking[walking.length - 1], 'the last walking tick is not inside the work block').toBeLessThan(1_800);
  });

  it('costs the ordinary two cycles across the boundary, at the worst capture there is', () => {
    const continuous = completionTick(buildScenario(OFFER_THE_LATE_ERRAND_AT), LATE_HORIZON_TICKS);
    const walking = ticksCarryingIn('travelling', OFFER_THE_LATE_ERRAND_AT, LATE_HORIZON_TICKS);
    const lastWalkingTick = walking[walking.length - 1]!;

    const restored = restoreLateErrandAt(lastWalkingTick);
    // The carrier comes back holding the goods, holding the job, and *walking*.
    // The phase is the whole of the fix: an idle carrier here is what made
    // `planIdleSelection` ask whether `work` is allowed, twenty ticks after a
    // work block that has already ended.
    expect(restored.jobs.activeJobFor(restored.prisoners.entityStore.getIdByIndex(0))?.leg).toBe('dropoff');
    expect(restored.containers.require('site').quantityOf('item.brick')).toBe(0);
    expect(phaseOf(restored), `captured mid-walk at tick ${lastWalkingTick}`).toBe('travelling');

    const completed = completionTick(restored, LATE_HORIZON_TICKS + 4_000);
    expect(completed, `captured mid-walk at tick ${lastWalkingTick}`).toBeGreaterThan(0);
    expect(completed - continuous, `captured mid-walk at tick ${lastWalkingTick}`).toBeLessThanOrEqual(RESTORED_TRAVEL_BOUND_TICKS);
    // The capture the research note found the cliff at, named so that a reader
    // can see this is the worst case and not a convenient one: 1,780 cost 20
    // and 1,781 cost 1,280, because the next reconsideration fell the other
    // side of the work block's end at 1,800.
    expect(lastWalkingTick).toBeGreaterThan(1_780);
    // What the fix is worth, stated as the factor rather than as a second copy
    // of the arithmetic.
    expect(BLOCK_BOUNDARY_COST_TICKS_BEFORE_THE_FIX / RESTORED_TRAVEL_BOUND_TICKS).toBe(32);
  });

  it('costs at most that at every capture on the boundary, not only the last one', () => {
    const continuous = completionTick(buildScenario(OFFER_THE_LATE_ERRAND_AT), LATE_HORIZON_TICKS);
    const walking = ticksCarryingIn('travelling', OFFER_THE_LATE_ERRAND_AT, LATE_HORIZON_TICKS);

    let anyDelay = false;
    for (const captureTick of [...sample(walking), walking[walking.length - 1]!]) {
      const restored = restoreLateErrandAt(captureTick);
      // Never idle, so no eligibility question is asked -- which is the whole
      // of what decision 5's re-seating changes.
      expect(phaseOf(restored), `captured at ${captureTick}`).toBe('travelling');

      const completed = completionTick(restored, LATE_HORIZON_TICKS + 4_000);
      expect(completed, `captured at ${captureTick}`).toBeGreaterThan(0);
      const delay = completed - continuous;
      expect(delay, `captured at ${captureTick}`).toBeGreaterThanOrEqual(0);
      expect(delay, `captured at ${captureTick}`).toBeLessThanOrEqual(RESTORED_TRAVEL_BOUND_TICKS);
      expect(bricksInTheWorld(restored), `captured at ${captureTick}`).toBe(100);
      expect(restored.containers.require('site').quantityOf('item.brick'), `captured at ${captureTick}`).toBe(10);
      if (delay > 0) anyDelay = true;
    }
    // Without this the bound above is satisfied by a restore that costs
    // nothing anywhere, which would not test a bound at all.
    expect(anyDelay, 'no sampled capture cost anything, so the bound above is untested').toBe(true);
  });

  it('loses none of the goods across the boundary, which the delay never cost either', () => {
    const walking = ticksCarryingIn('travelling', OFFER_THE_LATE_ERRAND_AT, LATE_HORIZON_TICKS);
    for (const captureTick of sample(walking)) {
      const restored = restoreLateErrandAt(captureTick);
      expect(bricksInTheWorld(restored), `at restore, captured at ${captureTick}`).toBe(100);
      expect(completionTick(restored, LATE_HORIZON_TICKS + 4_000), `captured at ${captureTick}`).toBeGreaterThan(0);
      expect(bricksInTheWorld(restored), `after completion, captured at ${captureTick}`).toBe(100);
      expect(restored.containers.require('site').quantityOf('item.brick'), `captured at ${captureTick}`).toBe(10);
      expect(restored.containers.require('depot').reservedOf('item.brick'), `captured at ${captureTick}`).toBe(0);
    }
  });

  it('gives the goods back when the board fails the errand under a re-seated carrier', () => {
    /*
     * The other direction of ADR 0093 decision 5's restore rule. A carrier kept
     * `'travelling'` whose job `reconcileRestoredJobs` ends -- here by naming a
     * worker id this session does not hold -- must not walk on for an errand
     * that no longer exists, and the goods must come back.
     * `ActionSystem.continueTravelling` checks exactly this before it advances
     * a carry, which is why re-seating needs no extra path of its own.
     */
    const walking = ticksCarryingIn('travelling', OFFER_THE_LATE_ERRAND_AT, LATE_HORIZON_TICKS);
    const interrupted = buildScenario(OFFER_THE_LATE_ERRAND_AT);
    stepTo(interrupted, walking[walking.length - 1]!);
    const bundle = captureSessionSnapshot(interrupted);
    const jobs = bundle.simulation!.operations.jobs as readonly { assignedWorkerId?: number }[];
    expect(jobs.length).toBe(1);
    jobs[0]!.assignedWorkerId = 999;

    const restored = restoreSimulationRuntime(bundle, SEED).runtime;
    expect(restored.jobs.getById('errand-1')?.state).toBe('failed');
    expect(restored.jobs.getById('errand-1')?.failReason).toBe('carrier-departed');
    expect(restored.containers.require('depot').quantityOf('item.brick')).toBe(100);
    expect(restored.containers.require('depot').reservedOf('item.brick')).toBe(0);

    stepTo(restored, restored.kernel.tick + 120);
    const index = restored.prisoners.entityStore.getIndex(restored.prisoners.entityStore.getIdByIndex(0));
    expect(DEFAULT_ACTIONS[restored.prisoners.currentAction.actionIndex[index]!]?.id).not.toBe('action.carry');
    expect(restored.containers.require('depot').quantityOf('item.brick')).toBe(100);
  });
});
