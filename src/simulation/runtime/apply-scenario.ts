import type { ScenarioDefinition } from '../../content/scenario-catalog';
import { Container } from '../operations/inventory';
import type { SimulationRuntime } from './new-session';

/**
 * Places a scenario's declared starting content into an already-constructed
 * runtime (ADR 0018).
 *
 * This is deliberately a *separate call* rather than an option on
 * `createNewSimulationRuntime`. That function's contract -- stated in its
 * own comments for containers, jobs, utility networks, security sectors,
 * schedules, contraband and incidents alike -- is that it wires real
 * infrastructure and fabricates no content. Keeping seeding outside it
 * means the convention survives literally, the seeding step is visible at
 * every call site, and a test that wants an empty prison simply does not
 * call this.
 *
 * ## Why a restore must not call this
 *
 * Stock a scenario deposited is ordinary container state. It is captured by
 * `ContainerRegistry.getSnapshot`, carried in the session snapshot, and
 * restored by `session-systems.ts` -- which registers containers by id from
 * the snapshot before loading into them. Applying the scenario again on top
 * of a restore would silently hand the player a second copy of whatever
 * they had not yet spent, growing every time they loaded.
 *
 * ## Determinism
 *
 * `startingStock` is walked in declared order and every effect is a
 * `deposit`, which is commutative and touches no RNG stream. Two sessions
 * built from the same seed and the same scenario are identical.
 */
export function applyScenario(runtime: SimulationRuntime, scenario: ScenarioDefinition): void {
  for (const stock of scenario.startingStock) {
    let container = runtime.containers.getById(stock.containerId);
    if (container === undefined) {
      // A scenario may name a container the runtime does not pre-register
      // (a delivery bay, a food store). Creating it here is what lets a
      // future scenario stock somewhere other than the construction
      // container without this function changing.
      container = new Container(stock.containerId);
      runtime.containers.register(container);
    }
    container.deposit(stock.itemId, stock.quantity);
  }
}
