import type { LocalizationKey } from '../content/localization';
import type { BuildQueueViewModel } from '../simulation/presentation/construction-projection';
import {
  BUILD_QUEUE_ROW_LIMIT,
  type HudBuildOrderViewModel,
  type HudBuildQueueViewModel,
} from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads what is still waiting to be built, over the projection channel, and
 * turns it into what the Build panel renders.
 *
 * ## The gap this closes
 *
 * `CancelBuildOrder { orderId }` has had a schema member, a decoder, a handler
 * branch and a complete implementation behind it (`ConstructionSystem.cancelOrder`)
 * since #16, and **nothing in the application could construct one**:
 * `tests/foundation/unconsumed-command-contract.test.ts` recorded it as the last
 * command with no producer. The blocker was not the control. It was that no
 * order *id* reached this thread at all -- `src/simulation/protocol/commands.ts`
 * says so while arguing that `RemoveObject` carries a tile instead: an order id
 * is something "nothing on screen shows and no snapshot carries".
 *
 * `projectBuildQueue` is what carries them, and this is the module that asks.
 *
 * ## The sixth translator, and why it is a class
 *
 * It joins `simulation-clock.ts`, `simulation-counts.ts`, `simulation-alerts.ts`,
 * `simulation-zoning.ts` and `simulation-room-needs.ts` outside `src/ui/hud/`,
 * and it is here for the reason they all are: the HUD imports nothing from
 * `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), so a module that has to know both a
 * projection's shape and a view model sits outside it.
 *
 * A class rather than a function of a message, for the same reason
 * `RoomNeedsReader` is one: a queue is a **pull**, correlated by `messageId`
 * (ADR 0003 decision 2), so this holds the requester that asks. The mapping is
 * still a pure function -- `buildQueueFromProjection` -- so what the panel is
 * told can be proven with no worker, no channel and no DOM.
 *
 * ## What it caches, and what it must not
 *
 * Nothing, exactly as `RoomNeedsReader` caches nothing. A queue held on this
 * thread would be a second, stale copy of what the crew is doing, and a stale
 * copy is worse here than anywhere else in the interface: the ids in it are what
 * a press *cancels*, so a row surviving one publication too long is a control
 * aimed at an order that no longer exists. The simulation is idempotent about
 * that -- `createConstructionCommandHandler` swallows the throw -- which makes
 * the race harmless rather than makes it acceptable to cause.
 */

/**
 * The buildable-name lookup this reader is handed.
 *
 * A **function**, not a table, and the composition root supplies it: what a
 * buildable is called is `buildableLabelKey`'s answer in `src/main.ts`, because
 * the buildable registry carries a hard-coded English `name` and no key at all
 * (`docs/HUD_PROJECTIONS.md` gap 32) and an object-placing buildable is named by
 * its object's own `nameKey` instead. Neither of those is knowledge this layer
 * or the projection may hold: the projection may not emit translated text (ADR
 * 0011) and the HUD may not read the buildable registry (`AGENTS.md` boundary
 * 1), so the answer is injected across both boundaries from the one place that
 * legitimately knows.
 *
 * `undefined` is a real answer and not a failure -- see
 * `HudBuildOrderViewModel.labelKey`.
 */
export type BuildableLabelLookup = (definitionId: string) => LocalizationKey | undefined;

/**
 * What the panel renders, from one projection reply.
 *
 * Pure, and it decides nothing the simulation decided: the rows are the
 * projection's own window in the projection's own order (ascending order id,
 * which is the order the crew will reach them in), the counts are the
 * projection's, and the only thing added is the name -- which is the one fact
 * neither side of the boundary is allowed to hold.
 *
 * **`materialsFunding` is copied across rather than recomputed, and it is the
 * one thing here that is not about a row.** The projection decides whether the
 * queue is stalled on money and by how much (#627, #629); this layer cannot,
 * because the answer is a fact about the treasury and the last purchase pass
 * and neither is on this thread. Until #640's playtest measured it, the field
 * arrived over the wire and was dropped on this line -- `HudBuildQueueViewModel`
 * had nowhere for it to land -- so the number the projection exists to produce
 * reached no reader at all.
 *
 * The projection's per-item `items` list is deliberately not carried; see
 * `HudBuildQueueMaterialsFundingViewModel` for why two scalars are the whole
 * of what a consumer can use today.
 *
 * A row whose buildable the host cannot name keeps its place. That is the
 * opposite of `roomNeedsFromProjections`, which *skips* a room the catalogue
 * cannot name, and the difference is what the row is for: a nameless room need
 * is a sentence with a hole in it, while a nameless build order is still an
 * order a player may want to cancel, and dropping it would hide the only control
 * that reaches it.
 */
export function buildQueueFromProjection(
  view: BuildQueueViewModel,
  labelKeyOf: BuildableLabelLookup,
): HudBuildQueueViewModel {
  const orders: HudBuildOrderViewModel[] = view.orders.rows.map((row) => {
    const labelKey = labelKeyOf(row.definitionId);
    return {
      orderId: row.orderId,
      // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
      // is on, so "the host names no buildable" has to be an absent property
      // and not a present one holding nothing.
      ...(labelKey === undefined ? {} : { labelKey }),
      tile: { x: row.tile.x, y: row.tile.y },
      edge: row.edge,
      state: row.state,
    };
  });

  return {
    total: view.orders.total,
    started: view.started,
    orders,
    materialsFunding: {
      unfunded: view.materialsFunding.unfunded,
      shortfallMinorUnits: view.materialsFunding.shortfallMinorUnits,
    },
  };
}

export class BuildQueueReader {
  private readonly requester: SimulationProjectionRequester;
  private readonly labelKeyOf: BuildableLabelLookup;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(
    channel: ProjectionMessageChannel,
    labelKeyOf: BuildableLabelLookup,
    options: ProjectionRequesterOptions = {},
  ) {
    this.requester = new SimulationProjectionRequester(channel, options);
    this.labelKeyOf = labelKeyOf;
  }

  /**
   * **One message**, whatever the queue's length.
   *
   * The window is named rather than defaulted, and it is the panel's own row
   * budget: `BUILD_QUEUE_ROW_LIMIT` is how many rows the block can show, so
   * asking for the projection's default hundred would build ninety-odd rows
   * nothing can render, twice a second. `total` still comes back over the whole
   * queue, so the header tells the truth about the prison while the rows tell
   * the truth about the panel.
   *
   * `undefined` while another read is in flight, exactly as `RoomNeedsReader`
   * answers: a caller on a cadence must not queue a second question about a
   * prison it has not heard the answer for once, and returning rather than
   * throwing keeps that a non-event.
   */
  public async read(): Promise<HudBuildQueueViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<BuildQueueViewModel>('hud/build-queue', {
        limit: BUILD_QUEUE_ROW_LIMIT,
      });
      if (reply.view === undefined) return undefined;
      return buildQueueFromProjection(reply.view, this.labelKeyOf);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
