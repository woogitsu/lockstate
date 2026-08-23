import type { MaterialRequirement } from './definition';

/**
 * How `ConstructionSystem` obtains the materials a buildable definition
 * requires once an order reaches `'materials-pending'`. `tryAllocate` is
 * all-or-nothing: either every requirement is satisfied and consumed, or
 * none are -- an order must never end up with some materials allocated
 * and others missing.
 */
export interface ConstructionMaterialsProvider {
  tryAllocate(requirements: readonly MaterialRequirement[]): boolean;
}

/**
 * Default provider, preserving #16's original behavior exactly: materials
 * are always available. `createNewSimulationRuntime` and every existing
 * caller/test that doesn't explicitly wire a real logistics substrate
 * keeps working unmodified -- only opting a `ConstructionSystem` into a
 * real `ContainerMaterialsProvider` (issue #25's operations/) makes
 * "materials-pending" a genuine wait.
 */
export const UNLIMITED_MATERIALS_PROVIDER: ConstructionMaterialsProvider = {
  tryAllocate: () => true,
};
