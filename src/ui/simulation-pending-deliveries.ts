import type { LocalizationKey } from '../content/localization';
import type { PendingDeliveriesViewModel } from '../simulation/presentation/procurement-projection';
import {
  PENDING_DELIVERY_ROW_LIMIT,
  type HudPendingDeliveriesViewModel,
  type HudPendingDeliveryViewModel,
} from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads what has been paid for and has not arrived, over the projection
 * channel, and turns it into what the Build panel's buy disclosure renders
 * (#285).
 *
 * ## The gap this closes
 *
 * `ProcurementSystem.cancel` refunds the recorded price of a delivery that has
 * not landed. It is complete, idempotent, snapshotted, restored and tested --
 * and until this module existed **nothing in `src/` could reach it**. There was
 * no command that named a purchase, and there could not usefully have been one:
 * a purchase id is minted on this thread by the press that spends the money and
 * then forgotten, so a control would have had nothing to aim at. That is the
 * same shape `CancelBuildOrder` was in before #367, and the missing piece is the
 * same kind of thing -- a read model, not a button.
 *
 * So the money a player spent on a delivery they had changed their mind about
 * was unrecoverable by any means the interface offered, and the interface said
 * nothing about it being in transit at all. Value was conserved throughout
 * (`tests/integration/economy-money-conservation.test.ts` asserts that in
 * integer minor units) -- what was missing was the surface, which is exactly
 * what #285's decision comment concluded.
 *
 * ## The fourth translator, and why it is a class
 *
 * It joins `simulation-clock.ts`, `simulation-counts.ts`, `simulation-alerts.ts`,
 * `simulation-zoning.ts`, `simulation-room-needs.ts`, `simulation-build-queue.ts`
 * and `simulation-intake.ts` outside `src/ui/hud/`, and it is here for the
 * reason they all are: the HUD imports nothing from `src/simulation/**`
 * (`AGENTS.md` boundary 1, enforced by `tests/unit/ui-hud-messages.test.ts`), so
 * a module that has to know both a projection's shape and a view model sits
 * outside it.
 *
 * A class rather than a function of a message, exactly as `BuildQueueReader` is:
 * this is a **pull** correlated by `messageId` (ADR 0003 decision 2), so it holds
 * the requester that asks. The mapping is a pure function --
 * `pendingDeliveriesFromProjection` -- so what the panel is told can be proven
 * with no worker, no channel and no DOM.
 *
 * ## What it caches, and what it must not
 *
 * Nothing, for the reason `BuildQueueReader` caches nothing, and the reason is
 * sharper here: the ids in it are what a press *refunds*, so a row surviving one
 * publication too long is a control promising money back for a delivery that has
 * already landed. The simulation refuses that honestly -- it records
 * `cancel-purchase.not-pending`, which reaches the alerts list -- and a refusal
 * the player can read is what makes the race survivable, not a reason to cause
 * one.
 */

/**
 * The item-name lookup this reader is handed.
 *
 * A **function**, not a table, and the composition root supplies it: what an
 * item is called is `src/content/item-catalog.ts`'s `nameKey`, which neither
 * side of the boundary may hold -- the projection may not emit translated text
 * (ADR 0011) and the HUD may not read a content registry (`AGENTS.md` boundary
 * 1). So the answer is injected across both boundaries from the one place that
 * legitimately knows, exactly as `BuildableLabelLookup` is.
 *
 * `undefined` is a real answer and not a failure -- see
 * `HudPendingDeliveryViewModel.labelKey`.
 */
export type ItemLabelLookup = (itemId: string) => LocalizationKey | undefined;

/**
 * What the panel renders, from one projection reply.
 *
 * Pure, and it decides nothing the simulation decided: the rows are the
 * projection's own window in the projection's own order -- `(arrivesAtTick,
 * orderId)`, which is the order the deliveries will land in and therefore the
 * order in which their refunds stop being available -- the figures are the
 * projection's, and the only thing added is the item's name.
 *
 * A delivery whose item the host cannot name keeps its place, for the reason a
 * nameless build order keeps its row: money nobody can label is still money, and
 * dropping the row would hide the only control that recovers it.
 */
export function pendingDeliveriesFromProjection(
  view: PendingDeliveriesViewModel,
  labelKeyOf: ItemLabelLookup,
): HudPendingDeliveriesViewModel {
  const deliveries: HudPendingDeliveryViewModel[] = view.deliveries.rows.map((row) => {
    const labelKey = labelKeyOf(row.itemId);
    return {
      orderId: row.orderId,
      // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
      // is on, so "the host names no item" has to be an absent property and not
      // a present one holding nothing.
      ...(labelKey === undefined ? {} : { labelKey }),
      quantity: row.quantity,
      paidMinorUnits: row.paidMinorUnits,
    };
  });

  return {
    total: view.deliveries.total,
    refundableMinorUnits: view.refundableMinorUnits,
    deliveries,
  };
}

export class PendingDeliveriesReader {
  private readonly requester: SimulationProjectionRequester;
  private readonly labelKeyOf: ItemLabelLookup;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(
    channel: ProjectionMessageChannel,
    labelKeyOf: ItemLabelLookup,
    options: ProjectionRequesterOptions = {},
  ) {
    this.requester = new SimulationProjectionRequester(channel, options);
    this.labelKeyOf = labelKeyOf;
  }

  /**
   * **One message**, however many purchases are out.
   *
   * The window is named rather than defaulted, and it is the panel's own row
   * budget: `PENDING_DELIVERY_ROW_LIMIT` is how many rows the block can show, so
   * asking for the projection's default hundred would build ninety-odd rows
   * nothing can render, twice a second. `total` and `refundableMinorUnits` still
   * come back over the whole list, so the header tells the truth about the
   * treasury while the rows tell the truth about the panel.
   *
   * `undefined` while another read is in flight, exactly as `BuildQueueReader`
   * answers: a caller on a cadence must not queue a second question about a
   * prison it has not heard the answer for once.
   */
  public async read(): Promise<HudPendingDeliveriesViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<PendingDeliveriesViewModel>('hud/pending-deliveries', {
        limit: PENDING_DELIVERY_ROW_LIMIT,
      });
      if (reply.view === undefined) return undefined;
      return pendingDeliveriesFromProjection(reply.view, this.labelKeyOf);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
