import { foundationSmokeScenario } from './scenarios/foundation-smoke.mjs';
import {
  worldChunkSizeDensePrisonScenario,
  worldChunkSizeSparseEdgeScenario,
} from './scenarios/world-chunk-size.mjs';
import { entitySoaScenario } from './scenarios/entity-soa.mjs';
import { kernelThroughputScenario } from './scenarios/kernel-throughput.mjs';
import {
  navigationLockdownReturnScenario,
  navigationMealRushScenario,
  navigationMixedDestinationScenario,
} from './scenarios/navigation-actor-tiers.mjs';

export const benchmarkScenarios = Object.freeze([
  foundationSmokeScenario,
  worldChunkSizeSparseEdgeScenario,
  worldChunkSizeDensePrisonScenario,
  entitySoaScenario,
  kernelThroughputScenario,
  navigationMealRushScenario,
  navigationLockdownReturnScenario,
  navigationMixedDestinationScenario,
]);

export function findBenchmarkScenario(id) {
  return benchmarkScenarios.find((scenario) => scenario.id === id);
}
