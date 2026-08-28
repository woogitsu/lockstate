// What one expanded search node costs in wall clock, measured on the
// production navigation modules. NOT part of `pnpm benchmark`,
// `benchmark:smoke` or `verify:benchmark`, and deliberately not a gate: every
// number it prints is a duration, and `docs/BENCHMARKING.md`'s CI policy
// refuses a wall-clock threshold on a shared runner.
//
// It exists for #413's remaining half. `path-request-queue.ts`'s work budget
// is denominated in expanded search nodes because counted work is
// deterministic and wall clock is not (ADR 0009, and the save format and named
// RNG streams behind it). That is the right unit for a deterministic kernel and
// it is only *honest* if one unit costs roughly the same everywhere -- otherwise
// a budget of 2,000 bounds a different amount of frame time depending on the
// shape of the search it is spent on. This measures the exchange rate, so
// whoever decides #413 is calibrating against a number rather than guessing.
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
import {
  navigationProductionLockdownReturnScenario,
  navigationProductionMealRushScenario,
  navigationProductionSingleRequestBudgetScenario,
} from '../benchmarks/scenarios/navigation-production.mjs';

const SCENARIOS = [
  navigationProductionSingleRequestBudgetScenario,
  navigationProductionMealRushScenario,
  navigationProductionLockdownReturnScenario,
];
const PROFILES = ['smoke', 'full'];
const DEFAULT_REPEATS = 9;
const WARMUP_REPEATS = 2;

/** Every production navigation scenario reports its expansions under one of these two names. */
function expansionsOf(metrics) {
  if (typeof metrics.totalExpansions === 'number') return metrics.totalExpansions;
  return metrics.expansionsForOneRequest + metrics.expansionsForGuidedRequest;
}

function statistics(sorted) {
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1),
  };
}

async function main() {
  const repeats = Number.parseInt(process.argv[2] ?? String(DEFAULT_REPEATS), 10);
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError(`Repeats must be a positive integer, got ${String(process.argv[2])}.`);

  console.log(`node ${process.version} on ${process.platform}/${process.arch}, ${String(repeats)} timed repeats after ${String(WARMUP_REPEATS)} warm-ups\n`);
  console.log('scenario                                       profile  expansions   us/expansion (min/med/max)   budget x min');

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
      const sorted = samplesMs.map((sample) => (sample * 1_000) / expansions).sort((left, right) => left - right);
      const { min, median, max } = statistics(sorted);
      // What ADR 0007's per-tick allowance buys, at the cheapest expansion this
      // shape produced. A floor, therefore: the real tick costs at least this.
      const budgetMs = (metrics.workBudgetPerTick * min) / 1_000;

      console.log(
        `${scenario.id.padEnd(46)} ${profileName.padEnd(7)} ${String(expansions).padStart(10)}   ` +
          `${min.toFixed(3)} / ${median.toFixed(3)} / ${max.toFixed(3)}`.padEnd(28) +
          `${budgetMs.toFixed(2)} ms`,
      );
    }
  }

  console.log(
    '\n"budget x min" is metrics.workBudgetPerTick expansions at the cheapest measured\n' +
      'expansion of that shape -- a floor under what one tick of the navigation budget\n' +
      'costs, not an estimate of it. Compare against the kernel step (50 ms) and the\n' +
      'share of it navigation may have.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
