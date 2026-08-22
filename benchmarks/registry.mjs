import { foundationSmokeScenario } from './scenarios/foundation-smoke.mjs';

export const benchmarkScenarios = Object.freeze([foundationSmokeScenario]);

export function findBenchmarkScenario(id) {
  return benchmarkScenarios.find((scenario) => scenario.id === id);
}
