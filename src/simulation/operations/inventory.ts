import type { ConstructionMaterialsProvider } from '../construction/materials-provider';
import type { MaterialRequirement } from '../construction/definition';

export type InventoryError =
  | { readonly kind: 'insufficient-stock'; readonly itemId: string; readonly available: number; readonly requested: number }
  | { readonly kind: 'insufficient-reserved'; readonly itemId: string; readonly reserved: number; readonly requested: number };

export type InventoryResult = { readonly ok: true } | { readonly ok: false; readonly error: InventoryError };

/**
 * A transactional item container (issue #25: "inventory mutations are
 * transactional and auditable to prevent duplication/loss"). Stock and
 * reservation are tracked separately so a pending transfer can hold a
 * quantity unavailable to other claimants without removing it from the
 * container until the carrier actually arrives to pick it up -- the
 * mechanism behind the "no-teleport rule": `reserve` -> (a carry job
 * travels here) -> `withdrawReserved` (pickup, stock actually leaves) ->
 * (the carry job travels to its destination) -> `deposit` there.
 */
export class Container {
  private readonly stock = new Map<string, number>();
  private readonly reservedQuantity = new Map<string, number>();

  public constructor(public readonly id: string) {}

  public quantityOf(itemId: string): number {
    return this.stock.get(itemId) ?? 0;
  }

  public reservedOf(itemId: string): number {
    return this.reservedQuantity.get(itemId) ?? 0;
  }

  /** Stock not already claimed by a pending reservation. */
  public availableOf(itemId: string): number {
    return this.quantityOf(itemId) - this.reservedOf(itemId);
  }

  /** Adds stock directly -- e.g. a delivery job's final drop-off, or scenario/session seeding. Never itself reserved. */
  public deposit(itemId: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError('deposit quantity must be a positive integer.');
    this.stock.set(itemId, this.quantityOf(itemId) + quantity);
  }

  /** Claims `quantity` of available (non-reserved) stock for a pending transfer. Does not remove it yet. */
  public reserve(itemId: string, quantity: number): InventoryResult {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError('reserve quantity must be a positive integer.');
    const available = this.availableOf(itemId);
    if (available < quantity) {
      return { ok: false, error: { kind: 'insufficient-stock', itemId, available, requested: quantity } };
    }
    this.reservedQuantity.set(itemId, this.reservedOf(itemId) + quantity);
    return { ok: true };
  }

  /** Cancels a reservation without withdrawing stock -- e.g. a carry job was cancelled before pickup. */
  public releaseReservation(itemId: string, quantity: number): void {
    const remaining = Math.max(0, this.reservedOf(itemId) - quantity);
    if (remaining === 0) this.reservedQuantity.delete(itemId);
    else this.reservedQuantity.set(itemId, remaining);
  }

  /** Commits a reservation: the actual pickup. Stock leaves the container and the reservation is cleared. */
  public withdrawReserved(itemId: string, quantity: number): InventoryResult {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError('withdraw quantity must be a positive integer.');
    const reserved = this.reservedOf(itemId);
    if (reserved < quantity) {
      return { ok: false, error: { kind: 'insufficient-reserved', itemId, reserved, requested: quantity } };
    }
    this.releaseReservation(itemId, quantity);
    this.stock.set(itemId, this.quantityOf(itemId) - quantity);
    return { ok: true };
  }

  /**
   * `[itemId, quantity, reserved]` per item this container actually holds
   * something of, ascending by item id.
   *
   * **A row where both numbers are `0` is omitted, and that is a fix rather
   * than a tidy-up.** `withdrawReserved` writes `stock.set(itemId, 0)` rather
   * than deleting the key, so a container emptied of an item kept emitting
   * `[itemId, 0, 0]` for the rest of the session -- while `loadSnapshot` below
   * writes back only rows with a positive quantity or reservation. **The
   * snapshot was therefore not a fixed point of itself**: `getSnapshot() ->
   * loadSnapshot() -> getSnapshot()` lost the empty row, silently, and
   * `snapshot() === restore()` is exactly what
   * `tests/determinism/snapshot-restore-fidelity.test.ts` exists to require.
   *
   * **Measured rather than reasoned about, and it was latent rather than
   * new.** The asymmetry predates
   * [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) by a long way;
   * what that decision changed is that a container in the determinism scenario
   * now *ends* a 200-tick run empty of bricks rather than holding the ones a
   * teleporting carry had already delivered, so the fidelity gate reached the
   * state for the first time and failed on it:
   * `[["item.brick",0,0]]` against `[]`.
   *
   * **Nothing about the container's behaviour changes**, which is why this
   * needs no save-format decision: `quantityOf`, `reservedOf` and
   * `availableOf` all answer `0` for an absent row and for a zero row alike,
   * no reader distinguishes them, and `carryItemJobSchema`'s sibling
   * `containers` schema validates a row as `min(0)` either way. The two shapes
   * were always the same fact; only one of them survived a reload.
   */
  public getSnapshot(): readonly (readonly [string, number, number])[] {
    const itemIds = new Set([...this.stock.keys(), ...this.reservedQuantity.keys()]);
    return [...itemIds]
      .sort()
      .map((itemId) => [itemId, this.quantityOf(itemId), this.reservedOf(itemId)] as const)
      .filter(([, quantity, reserved]) => quantity > 0 || reserved > 0);
  }

  public loadSnapshot(snapshot: readonly (readonly [string, number, number])[]): void {
    this.stock.clear();
    this.reservedQuantity.clear();
    for (const [itemId, quantity, reserved] of snapshot) {
      if (quantity > 0) this.stock.set(itemId, quantity);
      else this.stock.delete(itemId);
      if (reserved > 0) this.reservedQuantity.set(itemId, reserved);
      else this.reservedQuantity.delete(itemId);
    }
  }
}

/**
 * Every registered `Container`, keyed by a stable container id -- the
 * "warehouse" a job/construction order looks a specific container up
 * from. Deterministic iteration; never assumes Map insertion order.
 */
export class ContainerRegistry {
  private readonly containers = new Map<string, Container>();

  public register(container: Container): void {
    if (this.containers.has(container.id)) throw new RangeError(`Duplicate container id "${container.id}".`);
    this.containers.set(container.id, container);
  }

  public getById(id: string): Container | undefined {
    return this.containers.get(id);
  }

  public require(id: string): Container {
    const container = this.containers.get(id);
    if (container === undefined) throw new RangeError(`Unknown container id "${id}".`);
    return container;
  }

  public all(): readonly Container[] {
    return [...this.containers.keys()]
      .sort()
      .map((id) => this.containers.get(id)!);
  }

  public getSnapshot(): readonly (readonly [string, readonly (readonly [string, number, number])[]])[] {
    return this.all().map((container) => [container.id, container.getSnapshot()] as const);
  }

  public loadSnapshot(snapshot: readonly (readonly [string, readonly (readonly [string, number, number])[]])[]): void {
    for (const [containerId, containerSnapshot] of snapshot) {
      this.require(containerId).loadSnapshot(containerSnapshot);
    }
  }
}

/**
 * #16/#25 integration: satisfies a `ConstructionSystem`'s material
 * requirements from a real `Container` (typically a "site" container fed
 * by delivery jobs) instead of #16's original always-available default.
 * `tryAllocate` checks every requirement *before* withdrawing any of them,
 * so a shortfall on one item never leaves a build order with some
 * materials consumed and others missing.
 */
export class ContainerMaterialsProvider implements ConstructionMaterialsProvider {
  public constructor(private readonly container: Container) {}

  public tryAllocate(requirements: readonly MaterialRequirement[]): boolean {
    for (const requirement of requirements) {
      if (this.container.availableOf(requirement.itemId) < requirement.quantity) return false;
    }
    for (const requirement of requirements) {
      this.container.reserve(requirement.itemId, requirement.quantity);
      this.container.withdrawReserved(requirement.itemId, requirement.quantity);
    }
    return true;
  }

  /**
   * Puts a cancelled order's materials back into the same container they
   * were spent from.
   *
   * `deposit` rather than a reservation reversal, because `tryAllocate`
   * already committed the withdrawal -- the reservation it made lived for
   * two statements and no longer exists. This is the drop-off half of the
   * same one-container exception `tryAllocate` is: nothing moves between
   * containers, so the no-teleport rule (`docs/OPERATIONS.md`) is untouched.
   */
  public release(allocations: readonly MaterialRequirement[]): void {
    for (const allocation of allocations) {
      if (allocation.quantity <= 0) continue;
      this.container.deposit(allocation.itemId, allocation.quantity);
    }
  }
}
