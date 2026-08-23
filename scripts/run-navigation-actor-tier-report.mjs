// One-off, reproducible directional report covering all four of issue
// #22's actor tiers (250/1,000/2,500/5,000) across its three scenario
// families. NOT part of `pnpm benchmark`/`benchmark:smoke` -- those only
// exercise the smoke (250) and full (5,000) tiers per docs/BENCHMARKING.md's
// existing convention. Run manually and copy results into
// docs/NAVIGATION.md when refreshing its directional performance note; see
// docs/BENCHMARKING.md's "no hard timing threshold" policy for why this
// never gates CI.
import { performance } from 'node:perf_hooks';
import {
  navigationLockdownReturnScenario,
  navigationMealRushScenario,
  navigationMixedDestinationScenario,
  runNavigationScenario,
} from '../benchmarks/scenarios/navigation-actor-tiers.mjs';

const TIERS = [250, 1_000, 2_500, 5_000];
const SCENARIOS = [navigationMealRushScenario, navigationLockdownReturnScenario, navigationMixedDestinationScenario];

function modeFor(scenario) {
  if (scenario === navigationMealRushScenario) return 'meal-rush';
  if (scenario === navigationLockdownReturnScenario) return 'lockdown-return';
  return 'mixed';
}

function main() {
  console.log(`node ${process.version} on ${process.platform}/${process.arch}\n`);

  for (const scenario of SCENARIOS) {
    console.log(`## ${scenario.id}`);
    for (const actorCount of TIERS) {
      if (globalThis.gc) globalThis.gc();
      const heapBeforeBytes = process.memoryUsage().heapUsed;
      const startedAt = performance.now();
      const { checksum, metrics } = runNavigationScenario(scenario.seed, actorCount, modeFor(scenario));
      const durationMs = performance.now() - startedAt;
      const heapAfterBytes = process.memoryUsage().heapUsed;

      console.log(
        `  actors=${actorCount} ticks=${metrics.ticksTaken} expansions=${metrics.totalExpansions} ` +
          `workUnits/actor=${metrics.workUnitsPerActor} flowFieldActivations=${metrics.flowFieldActivations} ` +
          `cache(hit/miss)=${metrics.cacheHits}/${metrics.cacheMisses} ` +
          `latencyTicks(mean/p50/p95/p99/max)=${metrics.latencyTicks.mean}/${metrics.latencyTicks.p50}/${metrics.latencyTicks.p95}/${metrics.latencyTicks.p99}/${metrics.latencyTicks.max} ` +
          `wallMs=${durationMs.toFixed(3)} heapDeltaKB=${((heapAfterBytes - heapBeforeBytes) / 1024).toFixed(1)} checksum=${checksum}`,
      );
    }
    console.log('');
  }
  if (!globalThis.gc) {
    console.log('(heapDelta is directional only -- run with `node --expose-gc` for a forced-GC-before-sample reading.)');
  }
}

main();
