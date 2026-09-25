import {
  createNewSimulationRuntime,
  type SimulationRuntime,
  type SimulationRuntimeOptions,
} from '../../src/simulation/runtime/new-session';

/**
 * Recreate the 25,000 opening grant used by pre-#641 economic scenarios.
 * This changes only a fresh test runtime at tick zero, before any command or
 * transaction. Shipped sessions still use the owner's 100,000 grant.
 */
export function createHistoricalOpeningRuntime(
  masterSeed = 0,
  options: SimulationRuntimeOptions = {},
): SimulationRuntime {
  const runtime = createNewSimulationRuntime(masterSeed, options);
  setHistoricalOpeningTreasury(runtime);
  return runtime;
}

/** Use for existing scenario builders that register the prison before tick 0. */
export function setHistoricalOpeningTreasury(runtime: SimulationRuntime): void {
  if (runtime.kernel.tick !== 0) throw new Error('Historical treasury must be set before the first tick.');
  runtime.treasury.restore({ balanceMinorUnits: 25_000 });
  runtime.treasury.setOverdraftFloor(-2_500);
}
