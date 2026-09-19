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
   * stock an order that consumes two bricks and is then undone
   * -- an ordinary thing a player does, since `undo()` delegates here --
   * destroys them permanently, so a prison walks itself into an unbuildable
   * state through normal play with no feedback. A provider that cannot say
   * what it does on cancellation is therefore not a usable provider.
   *
   * **Since the owner's ruling 20 of 2026-08-31 this is no longer what every
   * cancellation does, and the paragraph above is kept because the seam still
   * exists for exactly that reason.**
   * [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
   * amendment of that date has `ConstructionSystem.cancelOrder` give back
   * **money** rather than materials for an order in `'assigned'`, and nothing
   * at all for one in `'in-progress'`. Three callers are left:
   * a `'completed'` order being un-built (ADR 0076 decision B, untouched by the
   * ruling), a line the procurement catalogue cannot price and therefore cannot
   * pay for, and any `ConstructionSystem` with no procurement sink behind it --
   * which has no treasury to pay from and so does what it always did. The
   * unbuildable-prison failure the paragraph above describes is still what this
   * method prevents in all three.
   *
   * **The first of those three went on 2026-09-01 and the count is marked
   * rather than corrected in place, because which caller left and when is the
   * record.** The owner's ruling of that date -- *"Taking a finished object
   * away returns nothing. Not its materials, not its money."*, recorded in the
   * same ADR's amendment of that date -- reverses decision B, so an un-built
   * `'completed'` order releases nothing either. **Two callers are left**, the
   * second and third above, and both are unchanged.
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
