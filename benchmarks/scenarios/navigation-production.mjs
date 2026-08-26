/**
 * The first benchmark scenarios in this repository that **import and drive
 * production code** (#410).
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
  const { Xoshiro128StarStar, deriveXoshiroState } = await loadSimulationRng();

  const system = new layout.nav.NavigationSystem(layout.world, options, layout.doors);
  system.setLoadedChunks(layout.chunkPositions);

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
    system.update({ tick });
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
      // measured on a 64x64 open region: 4,030 expansions diagonally (2.02x
      // the per-tick budget), 64 expansions on the guided route.
      metricBounds: Object.freeze({
        expansionsForOneRequest: { max: 4_096 },
        expansionsForGuidedRequest: { max: 70 },
        regionCount: { equals: 1 },
        routeSegmentCount: { equals: 1 },
      }),
    }),
    full: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 128,
      // measured on a 128x128 open region: 16,162 expansions diagonally
      // (8.08x the per-tick budget), 128 expansions on the guided route.
      metricBounds: Object.freeze({
        expansionsForOneRequest: { max: 16_384 },
        expansionsForGuidedRequest: { max: 140 },
        regionCount: { equals: 1 },
        routeSegmentCount: { equals: 1 },
      }),
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runSingleRequestBudget(seed, operationsPerIteration);
  },
});
