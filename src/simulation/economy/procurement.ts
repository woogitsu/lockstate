import { PROCUREMENT_DELIVERY_DELAY_TICKS, procurableMaterial } from '../../content/procurement-catalog';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { DeliveryCarryRoute } from '../operations/delivery-route';
import type { Container } from '../operations/inventory';
import type { SpendClass, Treasury } from './treasury';

/**
 * The two rungs a purchase can be refused at (the owner's ruling 19 of
 * 2026-08-31, drafted as ADR 0017's "Amendment, 2026-09-01").
 *
 * A narrowing of `SpendClass` rather than the whole union, because a purchase
 * is neither a wage nor a hire and a caller must not be able to buy bricks at
 * the wage rung's deeper threshold. See `ProcurementSystem.purchase`.
 */
export type PurchaseSpendClass = Extract<SpendClass, 'deliveries' | 'construction'>;

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
 * consumes it.** Since
 * [ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) this class
 * implements **all four arrows**, and the middle one is the `carryRoute`
 * constructor parameter below: `update` hands a due delivery to
 * `DeliveryCarryRoute.landAndRaiseCarry`, which lands it in the bay's own
 * container and raises the carry to the storeroom, and falls back to the direct
 * deposit only when that answers `false`.
 *
 * **This paragraph said the opposite, and it is corrected rather than
 * overwritten** (`docs/AGENT_WORKFLOW.md` §4: mark both directions), because a
 * reader who meets the old sentence somewhere else needs to know which half of
 * it survived. It read: *"This implements the first two arrows and the last
 * one. The physical route in the middle — `room.delivery-bay`, a carry job, a
 * construction site with a location — is **not** here, and the reason is a
 * fact rather than a preference: `room.delivery-bay` and
 * `object.loading-dock-door` are declared content that no session instantiates
 * (#141), so there is no bay to deliver to. Building one would mean deciding
 * where a new prison's bay sits and when a carry job is raised, which is
 * scenario design and logistics policy respectively. So a delivery lands
 * directly in the container construction draws from, and that is scaffolding
 * rather than the finished shape."*
 *
 * Every clause of that was true when it was written, and two of them are still
 * true of a prison that has not built the route: the deposit really does go
 * straight into the container construction draws from, and it really is
 * `docs/OPERATIONS.md`'s second no-teleport exception. What changed is that the
 * room *is* instantiated — a player zones it from the Rooms panel and furnishes
 * it from the Build panel, watched through the interface in
 * `docs/research/2026-09-03-does-the-errand-walk.md` — so *"there is no bay to
 * deliver to"* is now a statement about one kind of prison rather than about
 * the game, and the two questions the paragraph declined to answer were
 * answered by ADR 0093 decision 2: the bay's anchor tile, and the tick a
 * delivery comes due. `update`'s own comment carries what that costs a player.
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
 * **[ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 3, "Sell-back at a loss" — Accepted 2026-08-29 and, per that
 * decision's own text, invoked rather than amended by
 * [ADR 0096](../../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 3(b): "building the sell-back needs no new ruling; it needs the
 * ratio (#29's) and the command, the control and the refusal sentence the
 * decision already prices."**
 *
 * **The ratio, which neither ADR names a candidate for.** ADR 0075 decision 3
 * states only *"the ratio is a balance value and is #29's"*; ADR 0096 §3(b)
 * gives the arithmetic that bounds it from below — *"any ratio above about
 * 12% reopens the game"*, over the act B fixture's 288 bricks at catalogue —
 * and explicitly declines to name a candidate above that floor: *"the ratio
 * is #29's and the class does not turn on it."* This implementation chooses
 * one rather than leaving the mechanism unusable, and flags the choice for
 * the owner rather than presenting it as settled:
 *
 * **One half — 50%.** Comfortably above the ~12% arithmetic floor (so the
 * class this decision exists for is closed with margin, not by a hair), a
 * plain fraction a refusal or confirmation sentence can state without a
 * percent sign, and in keeping with decision 3's own argument for why the
 * ratio must be a real loss: *"a round trip at full price makes purchase
 * decisions free and turns the treasury into a warehouse; a loss keeps the
 * decision to buy a real one."* No other value is measured or argued for
 * here — see this repository's report for ADR 0096 for the flag.
 *
 * **THE FLAG WAS RAISED AND THE OWNER RULED, 2026-09-11: 50% stands.** The
 * paragraph above is kept as written rather than rewritten, because what it
 * says was true when it was written — the ratio was this session's choice and
 * nothing else — and a reader should be able to see which half of this
 * docblock is an implementation's guess and which half is a ruling. It is now
 * the ruling: presented with 50% (leave it), 25% (matching the already-ruled
 * diversion magnitude), 12.5% (just above the floor) and "measure a sweep
 * first and come back", the owner chose 50%.
 *
 * **Its provenance is the weaker kind, and this comment says so rather than
 * letting a later reader assume otherwise.** It is the label of a clickable
 * option this session wrote and the owner selected — not a sentence they
 * typed, and not a measurement. `AGENTS.md` records two earlier rulings of
 * exactly this shape and warns against treating them as precedent for
 * anything wider. So: the VALUE is settled and no longer needs a flag; the
 * ARGUMENT for it is still only the one above.
 */
export const SELL_BACK_RATIO_NUMERATOR = 1;
export const SELL_BACK_RATIO_DENOMINATOR = 2;

/**
 * `SELL_BACK_RATIO_NUMERATOR / SELL_BACK_RATIO_DENOMINATOR` of one unit's
 * catalogue price, floored -- the one formula `previewSellStock` and
 * `sellStock` both price a sale by, pulled out so the HUD can preview the same
 * figure without a `ProcurementSystem` instance to ask. A second copy of this
 * arithmetic in the UI layer would be exactly the hazard this repository's
 * "derive it from the same code path" rule exists to close -- see
 * `src/ui/hud/build-panel.ts`'s sell control, the one other caller.
 */
export function sellBackUnitPriceMinorUnits(unitPriceMinorUnits: number): number {
  return Math.floor((unitPriceMinorUnits * SELL_BACK_RATIO_NUMERATOR) / SELL_BACK_RATIO_DENOMINATOR);
}

/**
 * What buying `quantity` units at `unitPriceMinorUnits` each charges the
 * treasury -- the one formula `purchase` sets `paidMinorUnits` from, pulled out
 * so the Build panel's Buy control can preview the same figure without a
 * `ProcurementSystem` instance to ask.
 *
 * **The buy twin of `sellBackUnitPriceMinorUnits` above, and it exists for the
 * reason that one states rather than for symmetry.** Until 2026-09-14 the sell
 * side had the "derive it from the same code path" property and the buy side
 * did not: `src/ui/hud/build-panel.ts`'s `paintBuyTotal` composed
 * `material.unitPriceMinorUnits * quantity` itself, so the label a player read
 * and the charge `purchase` actually made were two spellings of one rule with
 * nothing keeping them in step. Constitution article 4 and issue #1160 name
 * that as the interface recomputing finances; the placement cost was the other
 * instance of it in the same panel, and `placement-cost.ts` is where that one
 * went.
 *
 * Linear, with no ratio and no rounding, which is what makes it look too small
 * to be worth a function. That is precisely the argument the sell helper
 * refuses on its own behalf: what the function buys is that there is one
 * definition to change when the rule stops being linear -- a bulk discount, a
 * price that moves with delivery time -- rather than two that have to be found.
 */
export function purchaseChargeMinorUnits(unitPriceMinorUnits: number, quantity: number): number {
  return unitPriceMinorUnits * quantity;
}

/**
 * Why a sell-back credited nothing.
 *
 * Named as a union for the same reason `PurchaseRefusalReason` is: a fifth
 * reason added later fails to compile at `src/simulation/refusals/refusal-log.ts`
 * until somebody decides what the player is told, rather than being silently
 * absorbed into a boolean.
 */
export type SellStockRefusalReason = 'unknown-material' | 'invalid-quantity' | 'insufficient-stock';

/** What a sell-back did. `ok` is not a refusal. */
export type SellStockOutcome =
  | { readonly ok: true; readonly creditedMinorUnits: number }
  | { readonly ok: false; readonly reason: SellStockRefusalReason };

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
   * construction tick, not the one it landed on.** `Kernel.registerSystem`
   * sorts ascending (`kernel.ts:115`, `a.order - b.order`) and iterates in that
   * order, so construction runs first within a tick. Construction is also on
   * `intervalTicks: 10` (`construction/system.ts:347`) against this system's
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
    /**
     * ADR 0017 decision 4's physical route, where the player has built one
     * ([ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) decision 2).
     *
     * **Optional, and absent means today's behaviour exactly.** A fixture that
     * stands up the economy alone has no rooms and no job board, and a session
     * whose player has zoned no bay or no storeroom has no route either -- so
     * the two cases are the same case, and `update` below asks the port and
     * takes its answer rather than branching on whether it exists.
     */
    private readonly carryRoute?: DeliveryCarryRoute,
  ) {}

  /**
   * Buys `quantity` of `itemId`, spending now and delivering later.
   *
   * Every refusal leaves the treasury and the queue untouched, which is why
   * the affordability check happens before the spend rather than being
   * inferred from a failed one.
   *
   * ## All or nothing, and after #703 ruling 9 that is a decision rather than
   * the only thing anybody had thought of
   *
   * **A purchase here still spends the whole figure or none of it.** Ruling 9
   * -- *"kupować tyle, ile stać"* -- chose partial fill on 2026-08-31, and it
   * did not reach this method, for a reason that is in
   * [ADR 0081](../../../docs/adr/0081-whether-a-purchase-may-be-partly-filled.md)'s
   * own text rather than inferred from silence. Every clause of its Decision is
   * about the build queue: §1 says *"rather than refusing the whole per-item
   * order"*, which names the aggregated per-item figure
   * `JustInTimeMaterialsService` was buying; §2 is about which **build order**
   * is funded; §3 is about `MaterialsProcurementReport`. The player's *Buy*
   * press appears nowhere in it, and ruling 12's unit -- the order -- does not
   * exist on this path at all: a press names an item and a quantity, and there
   * is no order to be atomic about.
   *
   * **So the press keeps its meaning: you get what you asked for, or a refusal
   * you can read.** Partly filling it would mean a player who asked for ten
   * bricks silently receiving six, which needs a sentence saying so -- and that
   * sentence is ADR 0081's open question 2, which `AGENTS.md`'s fourth
   * exclusion reserves to the owner. Doing it here would have shipped the
   * mechanic without the sentence.
   *
   * Partial fill therefore lives one layer up, in
   * `JustInTimeMaterialsService.procureForPendingOrders`, which decides *how
   * big a figure to hand this method* and calls it once per item per funded
   * order. `Treasury.spend` is likewise untouched and still strictly
   * all-or-nothing against its floor.
   *
   * ## `spendClass`, and why this one method serves two rungs
   *
   * The owner's ruling 19 of 2026-08-31 gave ADR 0017 decision 8's first two
   * rungs their own thresholds — deliveries at −1,250, construction at
   * −2,000, 750 minor units deeper — and **both of them arrive here**,
   * because a purchase is the only way materials enter a prison. So the rung
   * cannot be a property of this method; it is a property of *who asked*, and
   * the caller says which:
   *
   * - the player's Buy press, through `PurchaseMaterials`
   *   (`src/simulation/runtime/session-commands.ts`), is `'deliveries'`;
   * - `JustInTimeMaterialsService.procureForPendingOrders`, buying for build
   *   orders that are already queued, is `'construction'`.
   *
   * **The two thresholds are no longer 750 apart.** The owner's ruling on
   * #771 (2026-09-01, ADR 0017's equalisation amendment) retired the split
   * above: `construction` now reads the same −1,250 as `deliveries`
   * (`INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS ===
   * INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`). What the paragraph above
   * argues is unaffected by that: the two spend classes still name two
   * distinct callers, "who asked" is still what decides `spendClass` here,
   * and `PurchaseSpendClass` still exists to keep a hire from hiding behind
   * either one's threshold. Two rungs sharing a value is not the same as the
   * split disappearing.
   *
   * It is `PurchaseSpendClass` rather than `SpendClass`: a purchase is never a
   * wage and never a hire, and narrowing the union here means a caller cannot
   * hide a hire behind a delivery's threshold. The amendment argues the split
   * itself, which is a reading of decision 8's words rather than something
   * ruling 19 states.
   */
  /**
   * `isFreshUnfurnishedPrison` defaults to `false` for the reason
   * `rungFloorMinorUnits` gives: the only caller that ever needs `true` is
   * `createSessionCommandHandler`'s `'deliveries'` press
   * (`src/simulation/runtime/session-commands.ts`), computed there from live
   * room-instance state. `JustInTimeMaterialsService`'s `'construction'` calls
   * are unaffected by it either way — see `STARTER_RUNG_FLOORS_MINOR_UNITS`.
   */
  public purchase(
    orderId: string,
    itemId: string,
    quantity: number,
    tick: number,
    spendClass: PurchaseSpendClass,
    isFreshUnfurnishedPrison = false,
  ): PurchaseOutcome {
    if (this.pending.some((delivery) => delivery.orderId === orderId)) {
      return { ok: false, reason: 'duplicate-order' };
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_PURCHASE_QUANTITY) {
      return { ok: false, reason: 'invalid-quantity' };
    }
    const material = procurableMaterial(itemId);
    if (material === undefined) return { ok: false, reason: 'unknown-material' };

    const paidMinorUnits = purchaseChargeMinorUnits(material.unitPriceMinorUnits, quantity);
    if (!this.treasury.spend(paidMinorUnits, spendClass, isFreshUnfurnishedPrison)) {
      return { ok: false, reason: 'insufficient-funds' };
    }

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

  /**
   * Sells `quantity` of `itemId` back at the catalogue price, and answers what
   * was credited.
   *
   * **The other direction of `purchase`, and it exists for the owner's
   * ruling 20 of 2026-08-31** -- *"Anulowanie zwraca pieniądze zamiast
   * cegieł"*, recorded in
   * [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)'s
   * amendment of that date. A build order cancelled before its crew starts
   * gives back **money**, and the money for an order that has already
   * allocated has to come from somewhere: the materials it is holding, valued
   * and handed back to the supplier. The caller destroys the goods in the same
   * step -- see `ConstructionSystem.cancelOrder` -- because paying for the
   * plank *and* putting it back in the container is the one-press value
   * creation the amendment names.
   *
   * **It prices from the catalogue where `cancel` deliberately does not, and
   * the difference is a fact about the two situations rather than an
   * inconsistency.** `cancel` refunds a `PendingDelivery.paidMinorUnits`
   * because the record of what that purchase cost still exists and refunding
   * anything else would open a buy-low-cancel-high trade. Allocated material
   * carries no such record: `BuildOrderMaterial` is an item id and a quantity,
   * the goods are fungible with everything else the container held, and the
   * order may have consumed stock nobody bought at all. The catalogue price is
   * therefore the only figure available, and it is the same figure
   * `tests/integration/economy-money-conservation.test.ts` values stock at --
   * which is what makes the exchange exact. **The buy-low-cancel-high trade it
   * reopens is bounded by prices never moving**: `PROCURABLE_MATERIALS` is a
   * static table with no producer. The day a price moves, this becomes an
   * arbitrage and the fix is a paid-price record on the allocation, which is a
   * save-format change.
   *
   * `0` for an item the catalogue does not sell and for a non-positive or
   * non-integer quantity, and in both cases nothing is credited: the caller is
   * then holding goods it could not price, and must put them back rather than
   * destroy them.
   *
   * The pricing itself is `previewRefundMaterials`, called and then credited --
   * so a caller that only needs to know what this *would* pay (the Build
   * panel's queue row, ADR 0011's read-only side of the boundary) has the same
   * arithmetic on offer without the side effect. See that method.
   */
  public refundMaterials(itemId: string, quantity: number): number {
    const refundedMinorUnits = this.previewRefundMaterials(itemId, quantity);
    if (refundedMinorUnits > 0) this.treasury.credit(refundedMinorUnits);
    return refundedMinorUnits;
  }

  /**
   * What `refundMaterials` would credit, without crediting it.
   *
   * The whole of `refundMaterials`'s pricing rule and none of its effect: `0`
   * for an item the catalogue does not sell and for a non-positive or
   * non-integer quantity, `unitPriceMinorUnits * quantity` otherwise. Pulled
   * out rather than re-derived at the caller so the two can never disagree --
   * a second formula here would be the exact hazard `AGENTS.md`'s "derive it
   * from the same code path" rule exists to name.
   *
   * Its one caller today is `JustInTimeMaterialsService.previewAllocatedRefundMinorUnits`,
   * which the Build panel's queue row reaches through
   * `ConstructionSystem.previewCancelRefundMinorUnits` -- a projection-time
   * question, never a command, so it must not move the treasury while it is
   * being asked.
   */
  public previewRefundMaterials(itemId: string, quantity: number): number {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return 0;
    const material = procurableMaterial(itemId);
    if (material === undefined) return 0;
    return material.unitPriceMinorUnits * quantity;
  }

  /**
   * **[ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
   * decision 3, invoked by [ADR 0096](../../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
   * decision 3(b): sells `quantity` of `itemId` out of the container this
   * system already deposits deliveries into, at `SELL_BACK_RATIO_NUMERATOR /
   * SELL_BACK_RATIO_DENOMINATOR` of the catalogue price.**
   *
   * **The general answer to "the money is in the wrong shape", stated in ADR
   * 0075's own words: "the 625-brick prison is not poor, it is illiquid."**
   * `refundMaterials` above returns money for stock an *order* is holding;
   * this is the sibling for stock a *container* is holding, with nothing
   * queued to cancel — the gap ADR 0096 §4 measures directly: "there is no
   * player command that sells stock out of a container, at any ratio."
   *
   * **Withdraws through `reserve`/`withdrawReserved`, the same two-step
   * commit `ContainerMaterialsProvider.tryAllocate` already uses**, rather
   * than a new removal method on `Container` — this system already holds a
   * reference to the one container that matters (`this.destination`, the same
   * one `ProcurementSystem.update` deposits arrivals into and
   * `ConstructionSystem` draws from), so no second container reference or
   * no-teleport exception is introduced.
   *
   * **The loss rounds down, per-unit, so it is never a tax at the margin.**
   * `Math.floor(unitPriceMinorUnits * SELL_BACK_RATIO_NUMERATOR /
   * SELL_BACK_RATIO_DENOMINATOR)` per unit, not
   * `Math.floor(unitPriceMinorUnits * quantity * ratio)` for the whole sale —
   * the two differ whenever a unit's price does not divide evenly by the
   * ratio's denominator (a plank at 65, halved, is 32 per unit rather than a
   * batch-dependent rounding), and per-unit is the reading that cannot be
   * gamed by splitting one sale into many or combining many into one.
   *
   * **What this paragraph used to say was missing is wired now, and the
   * paragraph is corrected rather than deleted for the reason
   * `docs/AGENT_WORKFLOW.md` §4 gives: a reader who meets the old sentence
   * elsewhere needs to see which half of it survived.** It read: *"there is no
   * `SellMaterials` (or similarly named) entry in `simulationCommandSchema`,
   * no refusal reason registered on `src/simulation/refusals/refusal-log.ts`'s
   * exhaustive `Record`, and no HUD control … wiring a command needs a
   * decision about where a `SellMaterials` command belongs relative to that
   * work rather than a unilateral edit to a shared file."* `RemoveWall` (ADR
   * 0106) landed and released the shared files this method's own comment was
   * waiting on: `SellMaterials` is now a member of `simulationCommandSchema`,
   * `SellStockRefusalReason` is mapped through
   * `src/simulation/refusals/refusal-log.ts`'s `SELL_REFUSAL_REASONS`, and the
   * Build panel's Buy disclosure carries a Sell control beside Buy
   * (`src/ui/hud/build-panel.ts`). This method and `previewSellStock` are
   * unchanged by any of it — they were the economics ADR 0075 decision 3
   * already priced, and the command above calls them exactly as written.
   */
  public sellStock(itemId: string, quantity: number): SellStockOutcome {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return { ok: false, reason: 'invalid-quantity' };
    const material = procurableMaterial(itemId);
    if (material === undefined) return { ok: false, reason: 'unknown-material' };
    if (this.destination.availableOf(itemId) < quantity) return { ok: false, reason: 'insufficient-stock' };

    const creditedMinorUnits = this.previewSellStock(itemId, quantity);
    this.destination.reserve(itemId, quantity);
    this.destination.withdrawReserved(itemId, quantity);
    if (creditedMinorUnits > 0) this.treasury.credit(creditedMinorUnits);
    return { ok: true, creditedMinorUnits };
  }

  /**
   * What `sellStock` would credit, without crediting it or touching the
   * container — the read-only half `previewRefundMaterials` is to
   * `refundMaterials`, for the same reason: a queue row or a confirmation
   * dialog must be able to state the price without moving anything.
   */
  public previewSellStock(itemId: string, quantity: number): number {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return 0;
    const material = procurableMaterial(itemId);
    if (material === undefined) return 0;
    return sellBackUnitPriceMinorUnits(material.unitPriceMinorUnits) * quantity;
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
      /*
       * **The delivery lands in the bay and is carried to the storeroom
       * wherever the player has built both, and lands in the construction
       * container directly wherever they have not**
       * ([ADR 0093](../../../docs/adr/0093-a-carry-is-an-action.md) decision 2,
       * which is ADR 0017 decision 4's physical route).
       *
       * The direct deposit is what `docs/OPERATIONS.md` records as the second
       * deliberate exception to the no-teleport rule and calls *scaffolding*.
       * It stops being scaffolding on the first line below and stays the
       * exception it is on the second -- and the fallback is the graceful one
       * #600 itself prefers, for the three reasons `DeliveryBayCarryRoute`
       * states: zero regression for every existing save, no stranded early
       * prison, and no balance number ADR 0017 decision 5 reserves.
       *
       * **What this costs a player who has built the route, said plainly.**
       * The materials no longer become available for construction at
       * `arrivesAtTick`. They become available at `arrivesAtTick` plus a
       * carrier's selection latency (up to one 20-tick reconsideration cycle,
       * or up to the next `work` block), plus the walk to the bay, a dwell, the
       * walk to the storeroom and a dwell -- at two ticks a tile plus up to 20
       * per dwell. **Where the bay sits and where the storeroom sits therefore
       * become a choice the player is making**, which is #600's *"construction
       * time becomes a function of geometry"* arriving by the only route that
       * makes it true.
       */
      if (this.carryRoute?.landAndRaiseCarry(delivery.orderId, delivery.itemId, delivery.quantity, context.tick) === true) continue;
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
