// What one expanded search node costs in wall clock, and what a navigation
// tick is actually made of, measured on the production navigation modules.
// NOT part of `pnpm benchmark`, `benchmark:smoke` or `verify:benchmark`, and
// deliberately not a gate: every number it prints is a duration, and
// `docs/BENCHMARKING.md`'s CI policy refuses a wall-clock threshold on a
// shared runner.
//
// It exists for #413. `path-request-queue.ts`'s work budget is denominated in
// expanded search nodes because counted work is deterministic and wall clock
// is not (ADR 0009, and the save format and named RNG streams behind it).
// That is the right unit for a deterministic kernel, and it is only *honest*
// if one unit costs roughly the same everywhere and if the budget is what a
// tick's cost is made of. This measures both, so whoever decides #413 is
// calibrating against numbers rather than guessing.
//
// ## What this script measured wrongly until 2026-08-28, and what it now does
//
// Section 1 used to be the whole script, it divided **the whole scenario run**
// by its expansions, and it called the quotient "µs/expansion". That number is
// an upper bound and not a unit cost: the run it divides also contains one
// `buildNavigationGraph` rebuild (11-16 ms, paid on the first `update` because
// `NavigationSystem` builds its graph lazily) and, on every tick, a
// `processTick` prelude that is O(pending) and pays nothing to any budget. On
// `meal-rush` full it returned 3.431 µs against a marginal cost of about
// 1.28 µs -- two thirds of what it charged to expansions was not expansions.
// `docs/BENCHMARKING.md` carried that table and read a conclusion off it; both
// are corrected, in both directions, and section 1 is kept with its name fixed
// because the upper bound is still worth seeing beside the unit.
//
// Section 2 is the unit: `findRoute` timed on its own, nothing else in the
// sample. Section 3 is the tick: `NavigationSystem.update` timed on its own,
// per tick, so the graph rebuild, the O(pending) prelude and the budgeted
// search are three columns instead of one quotient.
//
// ## Why the minimum, and not the mean or a percentile
//
// This machine is shared. Preemption is one-sided: another process can only
// make a sample slower, never faster, so the minimum over many repeats is the
// closest available estimate of the uncontended cost and its error runs in one
// direction only. Measured on this container while two other agents worked, the
// minimum of a scenario's samples moved 1.5% across three runs of an unchanged
// tree where the mean moved 23%. The median and maximum are printed beside it
// so the spread is visible rather than hidden.
//
// Usage: node --experimental-transform-types scripts/report-navigation-cost-model.mjs [repeats]
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { normalizeRunResult } from '../benchmarks/harness.mjs';
import { buildOpenRegionLayout } from '../benchmarks/fixtures/navigation-layouts.mjs';
import { loadProductionNavigationOptions, loadSimulationRng } from '../benchmarks/production-modules.mjs';
import {
  navigationProductionLockdownReturnScenario,
  navigationProductionMealRushScenario,
  navigationProductionSingleRequestBudgetScenario,
  navigationProductionYardCrossingScenario,
} from '../benchmarks/scenarios/navigation-production.mjs';

const SCENARIOS = [
  navigationProductionSingleRequestBudgetScenario,
  navigationProductionMealRushScenario,
  navigationProductionLockdownReturnScenario,
  navigationProductionYardCrossingScenario,
];
const PROFILES = ['smoke', 'full'];
const DEFAULT_REPEATS = 9;
const WARMUP_REPEATS = 2;

/** Open-region sides for section 2. 32 to 256 is a 66x range in search size, which is what shows whether the unit is constant. */
const UNIT_REGION_SIDES = [32, 64, 128, 256];

/** Populations for section 3, chosen so the O(pending) prelude is visible: it is what separates them. */
const TICK_POPULATIONS = [250, 5_000];

/** Every production navigation scenario reports its expansions under one of these two names. */
function expansionsOf(metrics) {
  if (typeof metrics.totalExpansions === 'number') return metrics.totalExpansions;
  return metrics.expansionsForOneRequest + metrics.expansionsForGuidedRequest;
}

function statistics(sorted) {
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
}

function sortedAscending(values) {
  return [...values].sort((left, right) => left - right);
}

/** Section 1: the whole run over its expansions. An upper bound on the unit, not the unit. */
async function reportWholeRunUpperBound(repeats) {
  console.log('## 1. Whole run over its expansions -- an UPPER BOUND on the unit, not the unit\n');
  console.log('scenario                                       profile  expansions   us/expansion, whole run (min/med/max)');

  for (const scenario of SCENARIOS) {
    for (const profileName of PROFILES) {
      const profile = scenario.profiles[profileName];
      const context = { seed: scenario.seed, operationsPerIteration: profile.operationsPerIteration };

      for (let index = 0; index < WARMUP_REPEATS; index += 1) await scenario.run(context);

      const samplesMs = [];
      let metrics = null;
      for (let index = 0; index < repeats; index += 1) {
        const startedAt = performance.now();
        const result = normalizeRunResult(await scenario.run(context));
        samplesMs.push(performance.now() - startedAt);
        metrics = result.metrics;
      }

      const expansions = expansionsOf(metrics);
      const { min, median, max } = statistics(sortedAscending(samplesMs.map((sample) => (sample * 1_000) / expansions)));
      console.log(
        `${scenario.id.padEnd(46)} ${profileName.padEnd(7)} ${String(expansions).padStart(10)}   ` +
          `${min.toFixed(3)} / ${median.toFixed(3)} / ${max.toFixed(3)}`,
      );
    }
  }

  console.log(
    '\nEach sample above also contains one lazy `buildNavigationGraph` rebuild and, per\n' +
      'tick, a `processTick` prelude proportional to queue depth. Section 3 separates them.\n',
  );
}

/** Section 2: `findRoute` and nothing else. This is the exchange rate a budget is denominated against. */
async function reportUnitCost(repeats) {
  console.log('## 2. The unit: one `findRoute`, timed on its own\n');
  console.log('open region  expansions   route ms (min/med/max)              us/expansion at min');

  const dearest = { microseconds: 0, label: '' };
  const bySide = new Map();

  for (const side of UNIT_REGION_SIDES) {
    const layout = await buildOpenRegionLayout(side);
    const context = { role: 'stub-actor', securityClearance: 0 };
    const samplesMs = [];
    let expansions = 0;

    for (let index = 0; index < repeats + WARMUP_REPEATS; index += 1) {
      const stats = { expansions: 0 };
      const startedAt = performance.now();
      const result = layout.nav.findRoute(layout.world, layout.doors, layout.graph, layout.origin, layout.diagonalDestination, context, stats);
      const elapsed = performance.now() - startedAt;
      if (!result.ok) throw new Error(`Expected a route across a ${side}x${side} open region, got ${result.failure.reason}.`);
      if (index >= WARMUP_REPEATS) samplesMs.push(elapsed);
      expansions = stats.expansions;
    }

    const { min, median, max } = statistics(sortedAscending(samplesMs));
    const microseconds = (min * 1_000) / expansions;
    bySide.set(side, microseconds);
    if (microseconds > dearest.microseconds) {
      dearest.microseconds = microseconds;
      dearest.label = `${side}x${side}`;
    }
    console.log(
      `${`${side}x${side}`.padEnd(12)} ${String(expansions).padStart(10)}   ` +
        `${min.toFixed(2).padStart(7)} / ${median.toFixed(2).padStart(7)} / ${max.toFixed(2).padStart(7)}   ` +
        `${microseconds.toFixed(3).padStart(29)}`,
    );
  }

  const options = await loadProductionNavigationOptions();
  console.log(
    `\nDearest expansion measured: ${dearest.microseconds.toFixed(3)} us (${dearest.label}). At that rate the shipped\n` +
      `budget of ${String(options.workBudgetPerTick)} expansions is ${((options.workBudgetPerTick * dearest.microseconds) / 1_000).toFixed(2)} ms of search. Compare against the 50 ms\n` +
      'kernel step and the share of it navigation may have -- which no document in this\n' +
      'repository sets (docs/ARCHITECTURE.md: "Exact frame/tick budgets will be set after\n' +
      'representative benchmark scenarios exist").\n',
  );
  return { dearest, bySide };
}

/**
 * Section 3: one `NavigationSystem.update` per sample.
 *
 * A workload of this script's own rather than a gated scenario's, because a
 * gated scenario reports aggregates and there is no way to time its ticks
 * from outside it. It is the yard shape -- one open region, requests between
 * random tiles in it -- because that is the shape where a single search is
 * worth a large fraction of the budget, which is what makes the three columns
 * differ from each other. It is NOT the workload
 * `navigation.production.yard-crossing` gates, so its counted work will not
 * match that scenario's; only the shape is shared.
 */
async function reportTickDecomposition(repeats, unitMicroseconds) {
  console.log('## 3. The tick: `NavigationSystem.update`, timed per tick\n');

  const options = await loadProductionNavigationOptions();
  const { Xoshiro128StarStar, deriveXoshiroState, NamedRngStreams } = await loadSimulationRng();
  const side = 64;

  console.log(
    `one open ${side}x${side} region, budget ${String(options.workBudgetPerTick)}, element-wise minimum per tick over ${String(repeats)} repeats\n`,
  );
  console.log(
    'pending  tick 0 ms  steady tick ms  steady exp  worst tick after 0, ms  its exp  prelude ms at steady',
  );

  for (const pending of TICK_POPULATIONS) {
    // Annotated because `= null` alone infers the type `null`, and every
    // later assignment and every read then fails or silently degrades to
    // `never` (#602).
    /** @type {number[] | null} */
    let perTickMinimums = null;
    /** @type {number[] | null} */
    let expansionsPerTick = null;

    for (let repeat = 0; repeat < repeats + WARMUP_REPEATS; repeat += 1) {
      const layout = await buildOpenRegionLayout(side);
      const system = new layout.nav.NavigationSystem(layout.world, options, layout.doors);
      system.setLoadedChunks(layout.chunkPositions);

      const rng = new Xoshiro128StarStar(deriveXoshiroState(0x59524344, 'navigation.cost-model.tick').words);
      const context = { role: 'stub-actor', securityClearance: 0 };
      // `SimulationContext` is `{ tick, rng }`; this passed `{ tick }` alone
      // until #602 put the call under a typechecker. `NavigationSystem.update`
      // reads only `tick`, so the numbers this script reports do not move.
      const tickRng = new NamedRngStreams([]);
      const tile = (x, y) => ({ x: layout.nav.tileCoordinate(x), y: layout.nav.tileCoordinate(y) });
      const idWidth = String(pending - 1).length;
      for (let index = 0; index < pending; index += 1) {
        const origin = tile(rng.nextInt(layout.tileWidth), rng.nextInt(layout.tileHeight));
        const destination = tile(rng.nextInt(layout.tileWidth), rng.nextInt(layout.tileHeight));
        system.requestRoute(String(index).padStart(idWidth, '0'), origin, destination, context, rng.nextInt(3), 0);
      }

      const samplesMs = [];
      const samplesExpansions = [];
      let tick = 0;
      while (system.pendingCount() > 0) {
        const before = system.getQueueMetrics().totalExpansions;
        const startedAt = performance.now();
        system.update({ tick });
        samplesMs.push(performance.now() - startedAt);
        samplesExpansions.push(system.getQueueMetrics().totalExpansions - before);
        tick += 1;
      }

      if (repeat < WARMUP_REPEATS) continue;
      expansionsPerTick = samplesExpansions;
      if (perTickMinimums === null) perTickMinimums = samplesMs;
      else for (let index = 0; index < perTickMinimums.length; index += 1) perTickMinimums[index] = Math.min(perTickMinimums[index], samplesMs[index]);
    }

    // Tick 0 alone pays the lazy `buildNavigationGraph`; tick 1 is the first
    // that is only queue work, and is what "steady" means here. The worst tick
    // is taken from tick 1 onwards for the same reason -- otherwise it is
    // always tick 0 and reports the graph rebuild a second time.
    if (perTickMinimums === null || expansionsPerTick === null) {
      throw new Error(`navigation cost model: side ${String(side)} produced no measured repeat.`);
    }
    const first = perTickMinimums[0];
    const steady = perTickMinimums[1];
    const steadyExpansions = expansionsPerTick[1];
    const afterFirst = perTickMinimums.slice(1);
    const worst = Math.max(...afterFirst);
    const worstExpansions = expansionsPerTick[perTickMinimums.indexOf(worst)];
    // What the steady tick spent on something other than expanding nodes, at
    // section 2's measured rate for this region size.
    const prelude = steady - (steadyExpansions * unitMicroseconds) / 1_000;

    console.log(
      `${String(pending).padStart(7)}  ${first.toFixed(2).padStart(9)}  ${steady.toFixed(2).padStart(14)}  ${String(steadyExpansions).padStart(10)}  ` +
        `${worst.toFixed(2).padStart(22)}  ${String(worstExpansions).padStart(7)}  ${prelude.toFixed(2).padStart(21)}`,
    );
  }

  console.log(
    '\nThree terms, and the budget bounds one of them.\n\n' +
      '1. Tick 0 is the one-off lazy `buildNavigationGraph`. No budget value changes it,\n' +
      '   and a geometry change makes the next tick pay it again.\n' +
      '2. "prelude ms at steady" is what a tick spends on something other than expanding\n' +
      '   nodes: `processTick` sorts every pending entry and computes a flow-field group\n' +
      '   key -- `routeContextFingerprint` included -- for every pending request, every\n' +
      '   tick, including the ones the tick will never reach. It grows with queue depth\n' +
      '   and is not budgeted, which is why the two rows differ at the same expansion\n' +
      '   count.\n' +
      '3. The budgeted search, `steady exp` at section 2\'s rate.\n\n' +
      'A fourth term is not visible here and is gated instead: the queue tests\n' +
      '`usedBudget >= workBudget` before a request and never inside one, so a tick may\n' +
      'spend the budget plus one whole request. `navigation.production.yard-crossing`\n' +
      'measures that as `tickOvershootRatio` (2.04 smoke, 2.46 full).\n',
  );
}

async function main() {
  const repeats = Number.parseInt(process.argv[2] ?? String(DEFAULT_REPEATS), 10);
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError(`Repeats must be a positive integer, got ${String(process.argv[2])}.`);

  console.log(`node ${process.version} on ${process.platform}/${process.arch}, ${String(repeats)} timed repeats after ${String(WARMUP_REPEATS)} warm-ups\n`);

  await reportWholeRunUpperBound(repeats);
  const { bySide } = await reportUnitCost(repeats);
  const unitMicroseconds = bySide.get(64);
  if (unitMicroseconds === undefined) throw new Error('Section 3 prices its ticks at the 64x64 unit, which section 2 did not measure.');
  await reportTickDecomposition(repeats, unitMicroseconds);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
