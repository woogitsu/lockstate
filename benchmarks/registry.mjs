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
import {
  navigationProductionLockdownReturnScenario,
  navigationProductionMealRushScenario,
  navigationProductionSingleRequestBudgetScenario,
} from './scenarios/navigation-production.mjs';

export const benchmarkScenarios = Object.freeze([
  foundationSmokeScenario,
  worldChunkSizeSparseEdgeScenario,
  worldChunkSizeDensePrisonScenario,
  entitySoaScenario,
  kernelThroughputScenario,
  navigationMealRushScenario,
  navigationLockdownReturnScenario,
  navigationMixedDestinationScenario,
  navigationProductionMealRushScenario,
  navigationProductionLockdownReturnScenario,
  navigationProductionSingleRequestBudgetScenario,
]);

export function findBenchmarkScenario(id) {
  return benchmarkScenarios.find((scenario) => scenario.id === id);
}
