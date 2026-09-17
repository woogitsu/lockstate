import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { ContrabandViewModel } from '../simulation/presentation/contraband-projection';
import type { HudContrabandViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads what the prison is searching for and what it has found, over the
 * projection channel, and turns it into what the Security panel's contraband
 * block renders.
 *
 * ## The gap this closes
 *
 * `hud/contraband` was catalogued, routed and unread. What sat behind it is a
 * whole subsystem a player could drive and could not watch: `SearchSystem`
 * queues an order when staffing demand is unmet and works it when a guard is
 * free, and the difference between "the prison is searching" and "the prison
 * has three orders out that no guard has ever picked up" reached nothing. The
 * status strip's Contraband chip counts confiscations (#703 ruling 3) and says
 * nothing about the searching.
 *
 * ## What it narrows away, and why the narrowing is the important part
 *
 * `ContrabandViewModel` carries `intelligence` and `informants` -- what the
 * prison **suspects**, with its uncertainty intact -- and they are deliberately
 * left on the projection. `contraband-projection.ts`'s own header draws the
 * line this module keeps: the registry of where the contraband actually is is
 * ground truth and must never reach a panel, and the intelligence ledger is the
 * player-visible layer over it. That makes suspicion safe to *project* and not
 * obviously safe to *render beside evidence*: a list of "informant says cell
 * 4, confidence 0.3" drawn immediately under a list of things actually
 * confiscated reads as the same kind of fact at a glance, and a player who
 * treats a 0.3 as a finding has been misled by the layout rather than by any
 * sentence. Rendering it well is a design question with an owner decision in
 * it; leaving it on the projection is not, and the id is read either way.
 *
 * `policies` is left there too: it is the rule book behind the searching --
 * detection probability, dwell ticks, the concealment penalty -- and, like the
 * access policy one block up, it says the same thing in every prison.
 *
 * ## The shape of the request
 *
 * `limit: 0`, for the two reasons `simulation-incidents.ts` gives about its own
 * list and one more of this projection's own: `discovered`'s rows are oldest
 * first, and `ConfiscationLedger.all()` is unbounded over a session
 * (`docs/HUD_PROJECTIONS.md:1600-1603`). What is rendered instead is
 * `searchOrders`, which is not windowed, and `discoveredByCategoryId`, which is
 * published whole in declared catalog order.
 */
export function contrabandFromProjection(view: ContrabandViewModel): HudContrabandViewModel {
  return {
    searches: view.searchOrders.map((order) => ({
      orderId: order.orderId,
      // Derived, never hand-authored (ADR 0011). `search-order-state` covers
      // `'queued'` as well as the three `SearchJobState` members, which is why
      // that namespace exists -- an order accepted and not yet assigned a guard
      // has no job record and the row still has to be labelled.
      scopeLabelKey: deriveSimulationMessageKey('search-scope', order.scope),
      stateLabelKey: deriveSimulationMessageKey('search-order-state', order.state),
      queued: order.state === 'queued',
      currentTargetIndex: order.currentTargetIndex,
      targetCount: order.targetCount,
    })),
    foundByCategory: view.discoveredByCategoryId
      // A category nothing has been found in is dropped rather than drawn as a
      // zero, for `intakePipelineFromProjection`'s reason about its six stages:
      // a column of permanent zeroes in a block that exists to report findings
      // is how a readout becomes furniture. The projection emits all of them so
      // that a row cannot appear and vanish, which is the right contract for a
      // projection and the wrong one here.
      .filter((entry) => entry.count > 0)
      .map((entry) => ({
        categoryId: entry.categoryId,
        // The catalog's own `nameKey`, carried rather than derived: a
        // contraband category is content with a name, not an enum member, so
        // its word is authored beside its definition.
        categoryLabelKey: entry.categoryNameKey,
        count: entry.count,
      })),
    itemsDiscovered: view.metrics.itemsDiscovered,
    itemsMissed: view.metrics.itemsMissed,
    searchesQueued: view.metrics.searchesQueued,
    searchesActive: view.metrics.searchesActive,
  };
}

export class ContrabandReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  public async read(): Promise<HudContrabandViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<ContrabandViewModel>('hud/contraband', { limit: 0 });
      if (reply.view === undefined) return undefined;
      return contrabandFromProjection(reply.view);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
