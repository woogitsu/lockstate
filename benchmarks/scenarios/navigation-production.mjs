/**
 * DRIVES PRODUCTION CODE, NOT A MODEL OF IT.
 *
 * The first benchmark scenarios in this repository that **import and drive
 * production code** (#410). The line above is the second of the two kind
 * markers `docs/BENCHMARKING.md`'s scenario rule 9 requires, and
 * `tests/foundation/benchmark-scenario-kind-contract.test.ts` checks it
 * against the mechanical fact -- that this file imports
 * `../production-modules.mjs` -- in both directions, so neither the claim nor
 * the import can go without the other going red. (That gate reads only the
 * first lines of a file, so it cannot tell a marker from a mention of one:
 * naming the modelled marker up here would read as carrying it. The other
 * marker's spelling is in the gate, and in the five files that use it.)
 *
 * Every other scenario in `benchmarks/scenarios/` re-implements the subsystem
 * whose name it carries: `entity-soa.mjs` declares its own `EntityStore`,
 * `kernel-throughput.mjs` schedules mock systems, `navigation-actor-tiers.mjs`
 * models a region pass as `Math.ceil(cellCount / 4)`. Those numbers hold for
 * any implementation, including one the game does not have, so
 * `verify:benchmark` passing said nothing about `src/`. These two scenarios
 * import `src/simulation/navigation/` and `src/simulation/world/` through
 * `benchmarks/production-modules.mjs` and report what the shipped modules
 * actually count.
 *
 * ## The metric is counted work, never elapsed time
 *
 * Both scenarios report `SearchStats.expansions` -- tiles dequeued by
 * `boundedLocalSearch` plus regions dequeued by `runRegionDijkstra` -- read
 * out of the production counters, not recomputed here. That is the unit ADR
 * 0007 denominates its budget in (`workBudgetPerTick`), it is identical on
 * every machine for a given seed, and it is the one thing a shared CI runner
 * cannot make noisy. `docs/BENCHMARKING.md`'s standing refusal to gate on
 * wall clock is untouched: the harness still records timings, and nothing
 * here asserts on them.
 *
 * ## What these scenarios do *not* cover
 *
 * - **No door mutation and no graph rebuild.** `isNavigationGraphStale` /
 *   `buildNavigationGraph` run once per layout, so `RouteCache`
 *   invalidation and `doorDependenciesStillHold` are exercised only in their
 *   "nothing changed" direction. A regression in invalidation cost is
 *   invisible here.
 * - **No chunk streaming.** `setLoadedChunks` is called once with every
 *   chunk loaded.
 * - **One prison shape.** A corridor block with one canteen. Multi-wing
 *   prisons, yards inside a block, and long routes across several regions
 *   are not modelled, so the region-graph pass stays small relative to the
 *   tile pass.
 * - **Nothing above the navigation layer.** The six production systems that
 *   call `requestRoute` are not involved; requests are synthetic, exactly as
 *   ADR 0007's "minimal stub actors" scope intends.
 * - **`navigation.production.single-request-budget` is one request.** It
 *   bounds what one `findRoute` can charge; it says nothing about how many
 *   such requests a tick sees.
 */
import { buildOpenRegionLayout, buildPrisonBlockLayout } from '../fixtures/navigation-layouts.mjs';
import { loadProductionNavigationOptions, loadSimulationRng } from '../production-modules.mjs';

/** Fixed prison shape: 64 cells off one corridor plus a 12-tile-wide canteen. Population, not geometry, is what the profile varies. */
const CELL_COUNT = 64;
const CANTEEN_WIDTH = 12;

/** Safety valve only. A queue that cannot drain is a bug, and a scenario that silently spins forever hides it. */
const MAX_DRAIN_TICKS = 10_000;

function percentileNearestRank(sortedValues, percentile) {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((percentile / 100) * sortedValues.length);
  return sortedValues[Math.max(0, rank - 1)];
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function mixHash(hash, value) {
  return Math.imul(hash ^ (value >>> 0), 0x517cc1b7) >>> 0;
}

/**
 * Drains a full population of path requests through the real
 * `NavigationSystem`, at the real `DEFAULT_NAVIGATION_SYSTEM_OPTIONS`, and
 * reports what `PathRequestQueue`/`SearchStats` counted.
 */
async function runQueueDrain(seed, actorCount, mode) {
  const layout = await buildPrisonBlockLayout(CELL_COUNT, CANTEEN_WIDTH);
  const options = await loadProductionNavigationOptions();
  const { Xoshiro128StarStar, deriveXoshiroState, NamedRngStreams } = await loadSimulationRng();

  const system = new layout.nav.NavigationSystem(layout.world, options, layout.doors);
  system.setLoadedChunks(layout.chunkPositions);

  // `SimulationContext` is `{ tick, rng }` and this scenario used to pass
  // `{ tick }` alone -- `NavigationSystem.update` happens to read only `tick`,
  // so it ran, and nothing typechecked the call until #602. An empty stream
  // set is the honest value: the system draws from none, and a stream that
  // was never registered throws on `get` rather than silently seeding.
  const tickRng = new NamedRngStreams([]);

  const rng = new Xoshiro128StarStar(deriveXoshiroState(seed, `navigation.production.${mode}`).words);
  const sharedCanteenTile = layout.canteenTiles[Math.floor(layout.canteenTiles.length / 2)];
  const idWidth = String(actorCount - 1).length;
  const requestIds = [];

  for (let index = 0; index < actorCount; index += 1) {
    const securityClearance = rng.nextInt(6);
    const hasMedicalPermission = rng.nextInt(5) === 0;
    const context = {
      role: 'stub-actor',
      securityClearance,
      ...(hasMedicalPermission ? { permissions: ['medical-wing'] } : {}),
    };
    const priority = rng.nextInt(3);
    const cellTile = layout.cellDoorSideTiles[rng.nextInt(layout.cellDoorSideTiles.length)];

    const origin = mode === 'lockdown-return' ? sharedCanteenTile : cellTile;
    const destination = mode === 'lockdown-return' ? cellTile : sharedCanteenTile;

    // Zero-padded so the queue's final id tie-break does not depend on how
    // many digits the population happens to need.
    const id = String(index).padStart(idWidth, '0');
    requestIds.push(id);
    system.requestRoute(id, origin, destination, context, priority, 0);
  }

  const expansionsPerTick = [];
  let tick = 0;
  while (system.pendingCount() > 0 && tick < MAX_DRAIN_TICKS) {
    const before = system.getQueueMetrics().totalExpansions;
    system.update({ tick, rng: tickRng });
    expansionsPerTick.push(system.getQueueMetrics().totalExpansions - before);
    tick += 1;
  }
  if (system.pendingCount() > 0) {
    throw new Error(`navigation.production.${mode} did not drain within ${MAX_DRAIN_TICKS} ticks.`);
  }

  const queueMetrics = system.getQueueMetrics();
  const routeCacheMetrics = system.getRouteCacheMetrics();
  const flowFieldMetrics = system.getFlowFieldCacheMetrics();

  let stateHash = seed >>> 0;
  let resolvedOk = 0;
  let resolvedFailed = 0;
  let maxExpansionsForOneRequest = 0;
  let usedFlowFieldCount = 0;
  const waitedTicks = [];

  for (const id of requestIds) {
    const resolved = system.getResult(id);
    if (resolved === undefined) throw new Error(`Request ${id} drained without a result.`);
    if (resolved.result.ok) resolvedOk += 1;
    else resolvedFailed += 1;
    if (resolved.usedFlowField) usedFlowFieldCount += 1;
    if (resolved.expansions > maxExpansionsForOneRequest) maxExpansionsForOneRequest = resolved.expansions;
    waitedTicks.push(resolved.waitedTicks);

    const totalCost = resolved.result.ok ? Math.round(resolved.result.route.totalCost * 1000) : -1;
    const segmentCount = resolved.result.ok ? resolved.result.route.segments.length : 0;
    stateHash = mixHash(stateHash, totalCost);
    stateHash = mixHash(stateHash, segmentCount);
    stateHash = mixHash(stateHash, resolved.expansions);
    stateHash = mixHash(stateHash, resolved.waitedTicks);
  }
  stateHash = mixHash(stateHash, queueMetrics.totalExpansions);
  stateHash = mixHash(stateHash, tick);

  const sortedWaits = [...waitedTicks].sort((left, right) => left - right);

  return {
    checksum: `0x${stateHash.toString(16).padStart(8, '0')}`,
    metrics: {
      source: 'production',
      actorCount,
      cellCount: CELL_COUNT,
      regionCount: layout.regionCount,
      workBudgetPerTick: options.workBudgetPerTick,
      resolvedOk,
      resolvedFailed,
      ticksToDrain: tick,
      totalExpansions: queueMetrics.totalExpansions,
      expansionsPerActor: round3(queueMetrics.totalExpansions / actorCount),
      maxExpansionsInOneTick: Math.max(...expansionsPerTick),
      maxExpansionsForOneRequest,
      flowFieldActivations: queueMetrics.flowFieldActivations,
      requestsServedByFlowField: usedFlowFieldCount,
      flowFieldCacheHits: flowFieldMetrics.hits,
      routeCacheHits: routeCacheMetrics.hits,
      routeCacheMisses: routeCacheMetrics.misses,
      latencyTicks: {
        mean: round3(waitedTicks.reduce((sum, value) => sum + value, 0) / waitedTicks.length),
        p50: percentileNearestRank(sortedWaits, 50),
        p95: percentileNearestRank(sortedWaits, 95),
        max: sortedWaits.at(-1) ?? 0,
      },
    },
  };
}

/**
 * Two real `findRoute` calls across one open region `side` tiles square,
 * measured against the real per-tick budget.
 *
 * **`expansionsForOneRequest`** (origin to the diagonally opposite corner) is
 * the finding this scenario exists to keep visible:
 * `PathRequestQueue.processTick` tests `usedBudget >= workBudget` before a
 * request and never inside one, so `budgetOvershootRatio` is how many times
 * over ADR 0007's per-tick allowance a single request can go. Both halves of
 * that ratio are production values -- the numerator from `SearchStats`, the
 * denominator from `DEFAULT_NAVIGATION_SYSTEM_OPTIONS`.
 *
 * Its ceiling is **structural, not a measured value with headroom**: the
 * region's own tile count. A bounded search over one region may expand each
 * of its tiles at most once, so exceeding that means tiles are being
 * re-expanded. Nothing tighter would be honest -- corner to corner every
 * equal-length route ties under a Manhattan heuristic, so this search is
 * already near-exhaustive (4,030 of 4,096 tiles at the smoke size) and there
 * is barely any room left above it for a regression to occupy. Measured:
 * disabling the heuristic entirely moves it only 4,030 -> 4,096.
 *
 * **`expansionsForGuidedRequest`** is the other end of the same region -- the
 * straight run along the origin's own row, where an admissible heuristic has
 * no ties to break and expands exactly one tile per step. It is the sensitive
 * half: 64 expansions for a 63-tile journey, and a ceiling of 70 that a
 * frontier-selection or heuristic regression cannot survive.
 *
 * **`workBudgetPerTick` and `budgetOvershootRatio` are bounded because the
 * ratio's denominator was not.** Both are reported straight out of
 * `DEFAULT_NAVIGATION_SYSTEM_OPTIONS`, and until they were bounded, raising
 * the budget from ADR 0007's 2,000 to 8,000 left this scenario green: measured
 * on the smoke profile, `expansionsForOneRequest` came back **byte-identical**
 * at 4,030 -- the search does not read the budget -- and the only two metrics
 * that moved were the two nothing was reading. `budgetOvershootRatio` merely
 * recorded 0.504 instead of 2.015, which is the *headline finding of this
 * scenario silently inverting*: a single request going twice over the
 * allowance became one going half of it. That is `docs/BENCHMARKING.md`'s "a
 * ceiling alone is not enough" in its second form -- not a workload that broke
 * and lowered a count, but a denominator that grew. `equals: 2_000` pins the
 * budget the way `maxExpansionsInOneTick` pins it on the drain scenarios, and
 * the floor under the ratio (5% under measured, the mirror of the 5% headroom
 * on every ceiling here) fails in the other direction too: if
 * `PathRequestQueue` ever starts checking the budget *during* a request, this
 * scenario's whole subject is gone and the floor makes deleting it a decision
 * somebody writes down rather than a ceiling quietly relaxing.
 */
async function runSingleRequestBudget(seed, side) {
  const layout = await buildOpenRegionLayout(side);
  const options = await loadProductionNavigationOptions();
  const context = { role: 'stub-actor', securityClearance: 0 };

  const route = (destination) => {
    const stats = { expansions: 0 };
    const result = layout.nav.findRoute(layout.world, layout.doors, layout.graph, layout.origin, destination, context, stats);
    if (!result.ok) {
      throw new Error(`navigation.production.single-request-budget expected a route, got ${result.failure.reason}.`);
    }
    return { expansions: stats.expansions, cost: Math.round(result.route.totalCost * 1000), segments: result.route.segments.length };
  };

  const diagonal = route(layout.diagonalDestination);
  const straight = route(layout.straightDestination);

  let stateHash = mixHash(seed >>> 0, diagonal.cost);
  stateHash = mixHash(stateHash, diagonal.expansions);
  stateHash = mixHash(stateHash, straight.cost);
  stateHash = mixHash(stateHash, straight.expansions);

  return {
    checksum: `0x${stateHash.toString(16).padStart(8, '0')}`,
    metrics: {
      source: 'production',
      regionTileWidth: layout.tileWidth,
      regionTileCount: layout.tileWidth * layout.tileHeight,
      regionCount: layout.regionCount,
      workBudgetPerTick: options.workBudgetPerTick,
      expansionsForOneRequest: diagonal.expansions,
      budgetOvershootRatio: round3(diagonal.expansions / options.workBudgetPerTick),
      expansionsForGuidedRequest: straight.expansions,
      guidedRouteTileDistance: layout.tileWidth - 1,
      routeSegmentCount: diagonal.segments,
      routeTotalCost: diagonal.cost,
    },
  };
}

/**
 * Many requests, each with a large frontier, over one open yard region -- the
 * shape that calibrates a per-tick budget, and the one the three scenarios
 * above between them do not cover (#413).
 *
 * `meal-rush` and `lockdown-return` drain hundreds of requests but every
 * search is small: a prison block's regions are three-by-three cells and a
 * one-tile corridor, so a request costs 60-130 expansions and a 2,000-expansion
 * budget buys twenty of them. `single-request-budget` has the large frontier
 * but is **one** request, and says nothing about a tick. Neither can show what
 * a tick costs when the budget is spent on expensive searches, which is
 * exactly the case a budget has to be safe in.
 *
 * A yard is that case and it is not contrived: `buildNavigationGraph` floods a
 * region across chunk boundaries, so any unwalled ground -- an exercise yard,
 * a plot before its interior walls go up -- is one region thousands of tiles
 * across, and `boundedLocalSearch` inside it has nothing but the heuristic to
 * stop it.
 *
 * ## What this scenario is for, and it is one number
 *
 * `tickOvershootRatio` = `maxExpansionsInOneTick / workBudgetPerTick`.
 * `processTick` tests `usedBudget >= workBudget` **before** a request and
 * never inside one, so a tick's true bound is not the budget: it is
 * `budget + (the most expensive single request)`. In a block those two terms
 * differ by a factor of twenty and the second is invisible. Here they are the
 * same order, and the ratio comes back at 1.7-2.0 -- a tick spending twice
 * what it budgeted, measured on production modules, deterministically, in
 * counted work.
 *
 * That is why the ratio carries a **floor** and not only a ceiling. The floor
 * is what fails when the overshoot is fixed (a suspendable search resuming next
 * tick would drive it to ~1.0), which makes retiring this scenario's subject a
 * decision somebody writes down rather than a ceiling quietly relaxing -- the
 * same argument `single-request-budget` makes for its own ratio, one layer up.
 *
 * ## `ticksToDrain` is the guard on the budget's *value*
 *
 * `workBudgetPerTick: { equals: 2_000 }` pins the constant, the way it is
 * pinned on `single-request-budget`, but an equality alone says only that
 * somebody changed a number -- not what changing it cost. The two ceilings
 * either side say that. Raise the budget and `maxExpansionsInOneTick` goes
 * through its ceiling; lower it and `ticksToDrain` goes through its own,
 * because the same 80,970 expansions of counted work then need more ticks to
 * spend. Measured: at 1,200 the smoke drain takes 48 ticks against a ceiling
 * of 34. So a re-calibration has to arrive with both numbers re-measured,
 * which is the whole of what "the constant has a test" can mean when the
 * repository refuses to gate on wall clock (`docs/BENCHMARKING.md`).
 *
 * `ticksToDrain` is also this scenario's only latency reading, and latency is
 * the thing a smaller budget spends: at 2,000 the p95 request waits 29 ticks
 * (1.45 s of game time) at 250 actors and 114 (5.7 s) at 1,000.
 *
 * ## What it does not cover
 *
 * Everything the header excludes, plus: **one region, so the region-graph pass
 * is trivial here.** All work in this scenario is tile-level A*. A regression
 * in the portal Dijkstra is invisible to it; `meal-rush` is where that lives.
 */
async function runYardCrossing(seed, actorCount, side) {
  const layout = await buildOpenRegionLayout(side);
  const options = await loadProductionNavigationOptions();
  const { Xoshiro128StarStar, deriveXoshiroState, NamedRngStreams } = await loadSimulationRng();

  const system = new layout.nav.NavigationSystem(layout.world, options, layout.doors);
  system.setLoadedChunks(layout.chunkPositions);

  // `SimulationContext` is `{ tick, rng }` and this scenario used to pass
  // `{ tick }` alone -- `NavigationSystem.update` happens to read only `tick`,
  // so it ran, and nothing typechecked the call until #602. An empty stream
  // set is the honest value: the system draws from none, and a stream that
  // was never registered throws on `get` rather than silently seeding.
  const tickRng = new NamedRngStreams([]);

  const rng = new Xoshiro128StarStar(deriveXoshiroState(seed, 'navigation.production.yard-crossing').words);
  const context = { role: 'stub-actor', securityClearance: 0 };
  const idWidth = String(actorCount - 1).length;
  const requestIds = [];

  for (let index = 0; index < actorCount; index += 1) {
    const origin = { x: layout.nav.tileCoordinate(rng.nextInt(layout.tileWidth)), y: layout.nav.tileCoordinate(rng.nextInt(layout.tileHeight)) };
    const destination = { x: layout.nav.tileCoordinate(rng.nextInt(layout.tileWidth)), y: layout.nav.tileCoordinate(rng.nextInt(layout.tileHeight)) };
    const priority = rng.nextInt(3);
    // Zero-padded for the same reason the drain scenarios pad: the queue's
    // final id tie-break must not depend on how many digits the population
    // happens to need.
    const id = String(index).padStart(idWidth, '0');
    requestIds.push(id);
    system.requestRoute(id, origin, destination, context, priority, 0);
  }

  const expansionsPerTick = [];
  let tick = 0;
  while (system.pendingCount() > 0 && tick < MAX_DRAIN_TICKS) {
    const before = system.getQueueMetrics().totalExpansions;
    system.update({ tick, rng: tickRng });
    expansionsPerTick.push(system.getQueueMetrics().totalExpansions - before);
    tick += 1;
  }
  if (system.pendingCount() > 0) {
    throw new Error(`navigation.production.yard-crossing did not drain within ${MAX_DRAIN_TICKS} ticks.`);
  }

  const queueMetrics = system.getQueueMetrics();
  let stateHash = seed >>> 0;
  let resolvedOk = 0;
  let resolvedFailed = 0;
  let maxExpansionsForOneRequest = 0;
  const waitedTicks = [];

  for (const id of requestIds) {
    const resolved = system.getResult(id);
    if (resolved === undefined) throw new Error(`Request ${id} drained without a result.`);
    if (resolved.result.ok) resolvedOk += 1;
    else resolvedFailed += 1;
    if (resolved.expansions > maxExpansionsForOneRequest) maxExpansionsForOneRequest = resolved.expansions;
    waitedTicks.push(resolved.waitedTicks);

    const totalCost = resolved.result.ok ? Math.round(resolved.result.route.totalCost * 1000) : -1;
    stateHash = mixHash(stateHash, totalCost);
    stateHash = mixHash(stateHash, resolved.expansions);
    stateHash = mixHash(stateHash, resolved.waitedTicks);
  }
  stateHash = mixHash(stateHash, queueMetrics.totalExpansions);
  stateHash = mixHash(stateHash, tick);

  const maxExpansionsInOneTick = Math.max(...expansionsPerTick);
  const sortedWaits = [...waitedTicks].sort((left, right) => left - right);

  return {
    checksum: `0x${stateHash.toString(16).padStart(8, '0')}`,
    metrics: {
      source: 'production',
      actorCount,
      regionTileWidth: layout.tileWidth,
      regionCount: layout.regionCount,
      workBudgetPerTick: options.workBudgetPerTick,
      resolvedOk,
      resolvedFailed,
      ticksToDrain: tick,
      totalExpansions: queueMetrics.totalExpansions,
      maxExpansionsInOneTick,
      maxExpansionsForOneRequest,
      /** The finding: what a tick actually spends against what it budgeted. */
      tickOvershootRatio: round3(maxExpansionsInOneTick / options.workBudgetPerTick),
      latencyTicks: {
        mean: round3(waitedTicks.reduce((sum, value) => sum + value, 0) / waitedTicks.length),
        p50: percentileNearestRank(sortedWaits, 50),
        p95: percentileNearestRank(sortedWaits, 95),
        max: sortedWaits.at(-1) ?? 0,
      },
    },
  };
}

/**
 * Counted-work ceilings and outcome pins, in the unit ADR 0007 budgets.
 *
 * Every number below was **measured** on this tree (see the issue thread for
 * the run) and then written down as a literal. None of them is computed from
 * the run they gate -- a bound a scenario derives from its own output holds
 * for every implementation, which is the defect #410 is about.
 *
 * A counted-work metric has no run-to-run variance, so the headroom on a
 * ceiling is not noise budget -- it is how far the number may drift before
 * somebody has to look at it and re-baseline deliberately. Five per cent over
 * the measured value: enough that a refactor which changes allocation or
 * iteration order does not trip it, tight enough that both mutations recorded
 * on #410 (a disabled A* heuristic, a removed region-Dijkstra early exit) push
 * every drain scenario over its ceiling.
 *
 * `maxExpansionsInOneTick` is the exception and is a *semantic* bound rather
 * than a measured one: 2,400 is 20% over ADR 0007's `workBudgetPerTick` of
 * 2,000, so it fails if the budget is raised, or if one request's overshoot
 * past the pre-request budget check grows large enough to matter at this
 * scale. The measured values are 2,093 (meal rush) and 2,097
 * (lockdown return).
 * `resolvedOk`/`resolvedFailed` are pinned to exact equality on purpose: a
 * mutation that makes routing fail early would *lower* every work count, and
 * a ceiling alone would call that an improvement.
 */
const MEAL_RUSH_BOUNDS = Object.freeze({
  // measured: 16,087 total expansions, 2,093 in the busiest tick, 160/90 resolved.
  smoke: Object.freeze({
    resolvedOk: { equals: 160 },
    resolvedFailed: { equals: 90 },
    totalExpansions: { max: 16_900 },
    maxExpansionsInOneTick: { max: 2_400 },
  }),
  // measured: 51,901 total expansions, 2,103 in the busiest tick, 3,100/1,900 resolved.
  full: Object.freeze({
    resolvedOk: { equals: 3_100 },
    resolvedFailed: { equals: 1_900 },
    totalExpansions: { max: 54_500 },
    maxExpansionsInOneTick: { max: 2_400 },
  }),
});

const LOCKDOWN_BOUNDS = Object.freeze({
  // measured: 19,898 total expansions, 2,097 in the busiest tick, 168/82 resolved.
  smoke: Object.freeze({
    resolvedOk: { equals: 168 },
    resolvedFailed: { equals: 82 },
    totalExpansions: { max: 20_900 },
    maxExpansionsInOneTick: { max: 2_400 },
  }),
  // measured: 78,997 total expansions, 2,139 in the busiest tick, 3,145/1,855 resolved.
  full: Object.freeze({
    resolvedOk: { equals: 3_145 },
    resolvedFailed: { equals: 1_855 },
    totalExpansions: { max: 83_000 },
    maxExpansionsInOneTick: { max: 2_400 },
  }),
});

function makeQueueDrainScenario(id, description, seed, mode, bounds) {
  return Object.freeze({
    id,
    version: 1,
    description,
    seed,
    profiles: Object.freeze({
      smoke: Object.freeze({
        warmupIterations: 1,
        measuredIterations: 3,
        operationsPerIteration: 250,
        metricBounds: bounds.smoke,
      }),
      full: Object.freeze({
        warmupIterations: 2,
        measuredIterations: 5,
        operationsPerIteration: 5_000,
        metricBounds: bounds.full,
      }),
    }),
    run({ seed: runSeed, operationsPerIteration }) {
      return runQueueDrain(runSeed, operationsPerIteration, mode);
    },
  });
}

export const navigationProductionMealRushScenario = makeQueueDrainScenario(
  'navigation.production.meal-rush',
  'Real NavigationSystem/PathRequestQueue/RouteCache/FlowFieldCache draining a population of path requests converging on one canteen region, over a real SparseWorld and buildNavigationGraph at ADR 0004 chunk size 32. Primary metric is production SearchStats expansions, not elapsed time.',
  0x4d45414c, // 'MEAL'
  'meal-rush',
  MEAL_RUSH_BOUNDS,
);

export const navigationProductionLockdownReturnScenario = makeQueueDrainScenario(
  'navigation.production.lockdown-return',
  'Real NavigationSystem draining a population of path requests each returning to a distinct cell region -- the same production module graph as the meal rush with no shared destination, so ADR 0007 flow-field sharing cannot apply. Primary metric is production SearchStats expansions.',
  0x4c4f434b, // 'LOCK'
  'lockdown-return',
  LOCKDOWN_BOUNDS,
);

export const navigationProductionSingleRequestBudgetScenario = Object.freeze({
  id: 'navigation.production.single-request-budget',
  version: 1,
  description:
    'One real findRoute corner-to-corner across one open region, measured against the real DEFAULT_NAVIGATION_SYSTEM_OPTIONS.workBudgetPerTick. Makes visible that PathRequestQueue checks the budget before a request and never during one, so a single request can charge many times the per-tick allowance.',
  seed: 0x59415244, // 'YARD'
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 64,
      // measured on a 64x64 open region: 4,030 expansions diagonally (2.015x
      // the per-tick budget), 64 expansions on the guided route.
      metricBounds: Object.freeze({
        expansionsForOneRequest: { max: 4_096 },
        expansionsForGuidedRequest: { max: 70 },
        regionCount: { equals: 1 },
        routeSegmentCount: { equals: 1 },
        workBudgetPerTick: { equals: 2_000 },
        budgetOvershootRatio: { min: 1.9 },
      }),
    }),
    full: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 128,
      // measured on a 128x128 open region: 16,162 expansions diagonally
      // (8.081x the per-tick budget), 128 expansions on the guided route.
      metricBounds: Object.freeze({
        expansionsForOneRequest: { max: 16_384 },
        expansionsForGuidedRequest: { max: 140 },
        regionCount: { equals: 1 },
        routeSegmentCount: { equals: 1 },
        workBudgetPerTick: { equals: 2_000 },
        budgetOvershootRatio: { min: 7.6 },
      }),
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runSingleRequestBudget(seed, operationsPerIteration);
  },
});

/** The yard the crossings happen in: 64x64 at ADR 0004's chunk size, one flood-filled region, no doors. */
const YARD_SIDE = 64;

export const navigationProductionYardCrossingScenario = Object.freeze({
  id: 'navigation.production.yard-crossing',
  version: 1,
  description:
    'Real NavigationSystem draining a population of path requests crossing one open 64x64 yard region, where a single search is worth a large fraction of the whole per-tick budget. Reports tickOvershootRatio: what one tick actually spends in production SearchStats expansions against DEFAULT_NAVIGATION_SYSTEM_OPTIONS.workBudgetPerTick.',
  seed: 0x59524344, // 'YRCD'
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 250,
      // measured: 80,970 total expansions over 32 ticks, 4,083 in the busiest
      // tick (2.042x the budget), 2,667 for the dearest single request.
      metricBounds: Object.freeze({
        resolvedOk: { equals: 250 },
        resolvedFailed: { equals: 0 },
        regionCount: { equals: 1 },
        workBudgetPerTick: { equals: 2_000 },
        totalExpansions: { max: 85_000 },
        maxExpansionsInOneTick: { max: 4_300 },
        maxExpansionsForOneRequest: { max: 2_800 },
        ticksToDrain: { max: 34 },
        tickOvershootRatio: { min: 1.9 },
      }),
    }),
    full: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 1_000,
      // measured: 300,186 total expansions over 122 ticks, 4,910 in the busiest
      // tick (2.455x the budget), 2,957 for the dearest single request.
      metricBounds: Object.freeze({
        resolvedOk: { equals: 1_000 },
        resolvedFailed: { equals: 0 },
        regionCount: { equals: 1 },
        workBudgetPerTick: { equals: 2_000 },
        totalExpansions: { max: 315_000 },
        maxExpansionsInOneTick: { max: 5_200 },
        maxExpansionsForOneRequest: { max: 3_150 },
        ticksToDrain: { max: 128 },
        tickOvershootRatio: { min: 2.3 },
      }),
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runYardCrossing(seed, operationsPerIteration, YARD_SIDE);
  },
});
