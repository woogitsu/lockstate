import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { StatusStripViewModel } from '../simulation/presentation/status-strip-projection';
import type { HudRegimeBlockViewModel, HudRegimeViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads what each classification group's day allows at this tick, over the
 * projection channel, and turns it into what the Regime panel's timetable block
 * renders (issue #451).
 *
 * ## The gap this closes
 *
 * `projectStatusStrip` has carried a `regime` array -- one entry per
 * classification group, with the running block's bounds, its allowed
 * categories and how far through it the simulation is -- since the read-model
 * layer existed, and `hud/status-strip` was catalogued with **no reader in
 * `src/` at all**. Not "no reader for the regime block": no reader for the
 * projection. Its two other thirds reach the interface by the *push* route
 * instead (`simulation/status-counts` -> `src/ui/simulation-counts.ts` and
 * `simulation/clock-state` -> `src/ui/simulation-clock.ts`), which is why the
 * absence went unnoticed: the strip was full of numbers the whole time.
 *
 * What that costs a player is the *why* behind everything the roster beside it
 * shows. `ActionSystem` filters a prisoner's candidate actions to the active
 * block's categories every reconsideration, and the two shipped schedules are
 * not alike: `GENERAL_POPULATION_REGIME` tiles the 2,400-tick day into ten
 * blocks, and `HIGH_RISK_REGIME` allows only sleep, meals and hygiene for 2,200
 * of them. So a prisoner reclassified to `high-risk` stops going to the yard --
 * and with no timetable on screen that reads as the prisoner having changed
 * rather than the prison having changed what it permits them.
 *
 * ## What it computes, which is nothing
 *
 * The groups, their order, the categories and the order of *those* are the
 * projection's. Two things are added and neither is a measurement: the message
 * key for each id (derived, never hand-authored -- `classification-group` and
 * `action-category` both label every member of their source declaration), and
 * the percent, which is a rendering of the projection's own authoritative
 * `permille`. `docs/HUD_PROJECTIONS.md` contract 4 names `permille` as the
 * field to derive a width or an ARIA value from, which is exactly this.
 *
 * It does **not** resolve the active block. `resolveActiveRegimeBlock` is the
 * simulation's function over the schedule and the tick, and running it here
 * would be a second definition of "what is the prison doing now" on a thread
 * that holds neither -- the class of thing `AGENTS.md` boundary 1 forbids, and
 * the one that would drift the day anything overrode a schedule at runtime.
 *
 * ## The eleventh translator, and why it is a class
 *
 * It joins `simulation-clock.ts`, `simulation-counts.ts`, `simulation-alerts.ts`,
 * `simulation-zoning.ts`, `simulation-room-needs.ts`, `simulation-build-queue.ts`,
 * `simulation-intake.ts`, `simulation-pending-deliveries.ts`,
 * `simulation-held-guards.ts` and `simulation-staff-coverage.ts` outside
 * `src/ui/hud/`, and it is here for the reason they all are: the HUD imports
 * nothing from `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), so a module that has to know both a
 * projection's shape and a view model sits outside it.
 *
 * A class rather than a function of a message, exactly as the five pulled
 * readers before it are: this is a **pull** correlated by `messageId` (ADR 0003
 * decision 2), so it holds the requester that asks. The mapping is a pure
 * function -- `regimeFromProjection` -- so what the panel is told can be proven
 * with no worker, no channel and no DOM.
 */

/**
 * A share of a block, as a percent a panel can print.
 *
 * Floored, for `dayProgressPercent`'s reason one layer over: 99.6% of the way
 * through a block must not read as a whole block gone. It deliberately does
 * **not** copy the other half of the `BoundedValue.filled` rule -- that any
 * value above zero lights one segment -- because a percent has a real zero and
 * one tick into a 500-tick block is 0%, truthfully.
 *
 * Derived from `permille` rather than from the tick bounds beside it, because
 * `permille` is the figure the projection calls authoritative and the bounds
 * are ticks this layer must not do arithmetic on.
 */
function blockProgressPercent(permille: number): number {
  if (!Number.isFinite(permille)) return 0;
  return Math.min(100, Math.max(0, Math.floor(permille / 10)));
}

/**
 * What the timetable block renders, from one projection reply.
 *
 * Pure, and it decides nothing the simulation decided. A group with no allowed
 * category is carried as an empty list rather than dropped, because it would be
 * a real and serious state -- a block in which `ActionSystem` can select
 * nothing at all -- and a panel that silently omitted the group would hide it.
 * No schedule in `src/` can produce one (`assertGaplessSchedule` checks the
 * tiling and every authored block names at least one category), which is why
 * this is stated rather than defended with a branch.
 */
export function regimeFromProjection(view: StatusStripViewModel): HudRegimeViewModel {
  return {
    groups: view.regime.map(
      (group): HudRegimeBlockViewModel => ({
        classificationGroupId: group.classificationGroupId,
        // Derived, never hand-authored (ADR 0011): `classification-group` in
        // `src/content/simulation-message-keys.ts` labels every member of
        // `CLASSIFICATION_GROUP_IDS`, and a second spelling of those two here
        // would be the one that goes stale when a group is renamed.
        labelKey: deriveSimulationMessageKey('classification-group', group.classificationGroupId),
        allowedCategoryLabelKeys: group.allowedCategories.map((category) =>
          deriveSimulationMessageKey('action-category', category),
        ),
        blockProgressPercent: blockProgressPercent(group.blockProgress.permille),
        // The two fields `EditRegimeBlock` is built out of, straight through
        // and derived from nothing (ADR 0113 section 3): the block is named by
        // the tick it starts on, and the categories are sent as the ids the
        // command's own `z.enum(ACTION_CATEGORIES)` decodes. The ids are
        // carried *as well as* the label keys above rather than instead of
        // them -- `deriveSimulationMessageKey` has no inverse, so a panel
        // handed only keys could render the block and never edit it.
        startTickOfDay: group.blockStartTickOfDay,
        allowedCategoryIds: group.allowedCategories,
      }),
    ),
  };
}

export class RegimeReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * **One message with no window on it**, whatever the prison holds.
   *
   * `hud/status-strip` is declared `paged: false`, and the worker refuses
   * `offset`/`limit` on a projection that has no list rather than ignoring them
   * -- so a window here would be an `invalid-payload` and a block that never
   * paints. It needs none: the reply is one entry per classification group, and
   * the group vocabulary is a two-member catalogue rather than the population.
   *
   * The reply also carries the clock and the counts, which are already on
   * screen by the *push* route. That duplication is deliberate and is the
   * projection's own design: `projection-catalog.ts` builds this source from
   * the same `statusStripSource` the timer publication uses, *"so the pull
   * route and the push route cannot answer differently"*. Nothing here reads
   * either field.
   *
   * `undefined` while another read is in flight, exactly as every other reader
   * on this channel answers: a caller on a cadence must not queue a second
   * question about a prison it has not heard the answer for once.
   */
  public async read(): Promise<HudRegimeViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<StatusStripViewModel>('hud/status-strip');
      if (reply.view === undefined) return undefined;
      return regimeFromProjection(reply.view);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
