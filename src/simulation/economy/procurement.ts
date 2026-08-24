import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../content/procurement-catalog';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { Container } from '../operations/inventory';
import type { Treasury } from './treasury';

/**
 * Money in, materials out: the procurement half of issue #96's loop.
 *
 * A purchase spends from the `Treasury` immediately and queues a delivery
 * that arrives some ticks later. When it arrives, the materials are deposited
 * into a container the construction system can draw from — which is what
 * finally lets a build order leave `materials-pending` and reach `completed`
 * (issue #89).
 *
 * ## What this is half of, said plainly
 *
 * #96 describes the whole loop as **money → purchase → delivery arrives at
 * the bay → carry jobs move it to the site → `ContainerMaterialsProvider`
 * consumes it.** This implements the first two arrows and the last one. The
 * physical route in the middle — `room.delivery-bay`, a carry job, a
 * construction site with a location — is **not** here, and the reason is a
 * fact rather than a preference: `room.delivery-bay` and
 * `object.loading-dock-door` are declared content that no session instantiates
 * (#141), so there is no bay to deliver to. Building one would mean deciding
 * where a new prison's bay sits and when a carry job is raised, which is
 * scenario design and logistics policy respectively.
 *
 * So a delivery lands directly in the container construction draws from, and
 * that is scaffolding rather than the finished shape. It is recorded here and
 * on #96 rather than left for a reader to discover from the absence of a bay.
 *
 * ## Ordering, because this writes simulation state
 *
 * Pending deliveries are kept sorted by `(arrivesAtTick, orderId)` and drained
 * in that order, never insertion order (`docs/DETERMINISM.md`). Two purchases
 * that arrive on the same tick deposit in id order, so a snapshot round trip
 * cannot change which one landed first — and `orderId` breaks the tie because
 * the tick alone does not.
 */

export interface PendingDelivery {
  readonly orderId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly arrivesAtTick: number;
  /** What was paid, kept so a cancellation can refund exactly that. */
  readonly paidMinorUnits: number;
}

export interface ProcurementSnapshot {
  readonly pending: readonly PendingDelivery[];
}

/** Why a purchase was refused. `ok` is not a refusal. */
export type PurchaseOutcome =
  | { readonly ok: true; readonly paidMinorUnits: number; readonly arrivesAtTick: number }
  | { readonly ok: false; readonly reason: 'unknown-material' | 'invalid-quantity' | 'duplicate-order' | 'insufficient-funds' };

/**
 * Quantity bound for one purchase.
 *
 * Not a balance decision: an unbounded quantity multiplied by a unit price is
 * an integer overflow waiting to happen, and the treasury's own guard would
 * then be comparing against a number that had already lost precision. The
 * bound is far above any purchase a price of 40 makes affordable from the
 * starting balance, so it constrains nothing a player can reach.
 */
export const MAX_PURCHASE_QUANTITY = 100_000;

export class ProcurementSystem implements SystemRegistration {
  public readonly id = 'procurement';
  /**
   * After construction (100), so a delivery that lands on a tick construction
   * also runs is visible to that same tick's allocation attempt rather than
   * the next one. Ordering between systems is a scheduling decision the
   * kernel makes explicit, so it is stated rather than left to registration
   * order.
   */
  public readonly order = 110;
  /** Every tick: a delivery that arrives is not something to round to a window. */
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };

  private pending: PendingDelivery[] = [];

  public constructor(
    private readonly treasury: Treasury,
    private readonly destination: Container,
  ) {}

  /**
   * Buys `quantity` of `itemId`, spending now and delivering later.
   *
   * Every refusal leaves the treasury and the queue untouched, which is why
   * the affordability check happens before the spend rather than being
   * inferred from a failed one.
   */
  public purchase(orderId: string, itemId: string, quantity: number, tick: number): PurchaseOutcome {
    if (this.pending.some((delivery) => delivery.orderId === orderId)) {
      return { ok: false, reason: 'duplicate-order' };
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_PURCHASE_QUANTITY) {
      return { ok: false, reason: 'invalid-quantity' };
    }
    const material = procurableMaterial(itemId);
    if (material === undefined) return { ok: false, reason: 'unknown-material' };

    const paidMinorUnits = material.unitPriceMinorUnits * quantity;
    if (!this.treasury.spend(paidMinorUnits)) return { ok: false, reason: 'insufficient-funds' };

    const arrivesAtTick = tick + PROCUREMENT_DELIVERY_DELAY_TICKS;
    this.pending.push({ orderId, itemId, quantity, arrivesAtTick, paidMinorUnits });
    this.sortPending();
    return { ok: true, paidMinorUnits, arrivesAtTick };
  }

  /**
   * Cancels a delivery that has not arrived, refunding what was paid.
   *
   * Refunds the recorded `paidMinorUnits` rather than recomputing from the
   * catalog: recomputing would refund today's price for a purchase made at
   * yesterday's, which is a bug the moment prices ever move — and prices not
   * moving yet is a property of this slice, not of the design.
   */
  public cancel(orderId: string): boolean {
    const index = this.pending.findIndex((delivery) => delivery.orderId === orderId);
    if (index === -1) return false;
    const [delivery] = this.pending.splice(index, 1);
    this.treasury.credit(delivery!.paidMinorUnits);
    return true;
  }

  /** Deliveries not yet arrived, in the order they will arrive. */
  public get pendingDeliveries(): readonly PendingDelivery[] {
    return this.pending;
  }

  public update(context: SimulationContext): void {
    if (this.pending.length === 0) return;

    // `<=` rather than `===`: a restored session resumes at the tick the save
    // was taken, and a scheduled system does not run on every tick in the
    // general case, so an arrival tick can be stepped over. A delivery that is
    // due lands on the first update after it is due, never silently never.
    const arrived = this.pending.filter((delivery) => delivery.arrivesAtTick <= context.tick);
    if (arrived.length === 0) return;

    this.pending = this.pending.filter((delivery) => delivery.arrivesAtTick > context.tick);
    for (const delivery of arrived) {
      this.destination.deposit(delivery.itemId, delivery.quantity);
    }
  }

  public snapshot(): ProcurementSnapshot {
    return { pending: this.pending.map((delivery) => ({ ...delivery })) };
  }

  public restore(snapshot: ProcurementSnapshot): void {
    this.pending = snapshot.pending.map((delivery) => ({ ...delivery }));
    this.sortPending();
  }

  /** `(arrivesAtTick, orderId)`, code-unit order on the id. `docs/DETERMINISM.md`. */
  private sortPending(): void {
    this.pending.sort((left, right) =>
      left.arrivesAtTick === right.arrivesAtTick
        ? (left.orderId < right.orderId ? -1 : left.orderId > right.orderId ? 1 : 0)
        : left.arrivesAtTick - right.arrivesAtTick,
    );
  }
}
