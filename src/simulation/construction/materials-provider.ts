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
  /**
   * Returns materials a cancelled order had already allocated.
   *
   * Required, not optional. While materials were infinite this was
   * invisible, which is why `ConstructionSystem.cancelOrder` carried a
   * `// TODO: release materials` for as long as it did. Against a finite
   * stock (ADR 0018) an order that consumes two bricks and is then undone
   * -- an ordinary thing a player does, since `undo()` delegates here --
   * destroys them permanently, so a prison walks itself into an unbuildable
   * state through normal play with no feedback. A provider that cannot say
   * what it does on cancellation is therefore not a usable provider.
   */
  release(allocations: readonly MaterialRequirement[]): void;
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
  /** Nothing was ever taken from anywhere, so there is nothing to give back. */
  release: () => {},
};
