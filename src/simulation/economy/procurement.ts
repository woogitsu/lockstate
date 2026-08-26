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

/**
 * Why a purchase was refused.
 *
 * Named rather than left inline in `PurchaseOutcome` since #261: the refusal
 * now has to reach the player, and `src/simulation/refusals/refusal-log.ts`
 * maps this union through an exhaustive `Record` so a fifth reason added here
 * fails to compile until somebody decides what the player is told. Inline, it
 * could only have been mapped with a fallback.
 */
export type PurchaseRefusalReason = 'unknown-material' | 'invalid-quantity' | 'duplicate-order' | 'insufficient-funds';

/** What a purchase did. `ok` is not a refusal. */
export type PurchaseOutcome =
  | { readonly ok: true; readonly paidMinorUnits: number; readonly arrivesAtTick: number }
  | { readonly ok: false; readonly reason: PurchaseRefusalReason };

/**
 * Why a cancellation refunded nothing.
 *
 * One member, and it is one for a reason rather than for now: this system
 * cannot tell an id it has never seen from an id whose delivery has already
 * landed, because a landed delivery leaves `pending` and takes its record with
 * it. Both are the same fact about the treasury — there is no payment here to
 * give back — and a second reason would be this system claiming to know which
 * of the two happened.
 *
 * Named as a union rather than left as a `false`, for the reason
 * `PurchaseRefusalReason` is named: `src/simulation/refusals/refusal-log.ts`
 * maps it through an exhaustive `Record`, so a second reason added here fails
 * to compile until somebody decides what the player is told (#285).
 */
export type PurchaseCancelRefusalReason = 'not-pending';

/**
 * What a cancellation did.
 *
 * `refundedMinorUnits` is the figure that was actually credited, never the
 * figure the catalog would charge today — see `cancel`. It is on the outcome
 * because the caller is the only thing that can report it, and because "the
 * money came back" is the whole point of the command this answers.
 */
export type PurchaseCancelOutcome =
  | { readonly ok: true; readonly refundedMinorUnits: number }
  | { readonly ok: false; readonly reason: PurchaseCancelRefusalReason };

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
   * After construction (100). Ordering between systems is a scheduling
   * decision the kernel makes explicit, so it is stated rather than left to
   * registration order, and it is pinned by
   * `tests/determinism/kernel-system-order.test.ts`.
   *
   * **After means later, so a delivery is picked up on the next scheduled
   * construction tick, not the one it landed on.** `Kernel.register` sorts
   * ascending (`kernel.ts:113`, `a.order - b.order`) and iterates in that
   * order, so construction runs first within a tick. Construction is also on
   * `intervalTicks: 10` (`construction/system.ts:100`) against this system's
   * `1`, so a deposit made at order 110 on tick T is visible to the
   * allocation attempt at T+10 -- measured: a delivery arriving on tick 100
   * leaves `materials-pending` on tick 110.
   *
   * That half-second lag is accepted, and this comment says so rather than
   * claiming the opposite. It previously read "so a delivery that lands on a
   * tick construction also runs is visible to that same tick's allocation
   * attempt rather than the next one", which described the behaviour of
   * `order < 100` and was never true of this value. Making the same-tick
   * property real would mean moving below 100, which is a deliberate reviewed
   * edit rather than a free one: declared order is part of ADR 0020's
   * determinism contract and ADR 0009's replay guarantee over stored saves,
   * and the pin above fails on the change by design.
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
   * moving yet is a property of this slice, not of the design. It is also what
   * closes the buy-low-cancel-high trade before it exists, which is why the
   * refund is a *record* rather than a calculation.
   *
   * **Idempotent, and the second call is a refusal rather than a silence**
   * (#285). It answers a `PurchaseCancelOutcome` rather than a boolean because
   * the caller has to report both halves: a refund is a figure the player
   * watched leave, and a refusal is a sentence they are owed — a cancellation
   * that quietly did nothing is a control that lied, which is the class of
   * defect `src/simulation/refusals/refusal-log.ts` exists for.
   *
   * There is deliberately no way to cancel a delivery that has landed. The
   * materials are in the container by then and the money bought stock, so
   * taking the money back without taking the stock back would create value out
   * of a button press — which is the mutation
   * `tests/integration/economy-money-conservation.test.ts` records as M1.
   */
  public cancel(orderId: string): PurchaseCancelOutcome {
    const index = this.pending.findIndex((delivery) => delivery.orderId === orderId);
    if (index === -1) return { ok: false, reason: 'not-pending' };
    const [delivery] = this.pending.splice(index, 1);
    this.treasury.credit(delivery!.paidMinorUnits);
    return { ok: true, refundedMinorUnits: delivery!.paidMinorUnits };
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
