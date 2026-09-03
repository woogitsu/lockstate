import type { PrisonerDetailViewModel } from '../simulation/presentation/prisoner-projection';
import type { HudPrisonerDetailViewModel } from './hud';
import { prisonerNeed, prisonerStandingLabelKey } from './simulation-prisoner-roster';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads everything the simulation will say about **one** prisoner, over the
 * projection channel, and turns it into what the Regime panel's inspector
 * renders (issue #895).
 *
 * ## The gap this closes
 *
 * `hud/prisoner-detail` was catalogued, typed, answered and read by nothing:
 * `tests/foundation/projection-reachability-contract.test.ts` carried it as an
 * `UNPAINTED_PROJECTION_IDS` entry, written so the day a module under
 * `src/ui/` quoted the id the entry went stale and that gate failed until it
 * was deleted. This is that module, and the entry is gone.
 *
 * What was invisible without it is a number the player is *charged* for. The
 * roster row shows the prisoner's **worst** need of six, so a prison losing
 * grant over four needs on one prisoner and one need on another read
 * identically -- `unmetNeedCount` is what
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` multiplies, and no
 * surface in the application had ever shown more than one term of that sum for
 * one person.
 *
 * ## The thirteenth translator, and why it is a class
 *
 * It joins the twelve before it outside `src/ui/hud/`, for the reason they are
 * all there: the HUD imports nothing from `src/simulation/**` (`AGENTS.md`
 * boundary 1, enforced by `tests/unit/ui-hud-messages.test.ts`), so a module
 * that has to know both a projection's shape and a view model sits outside it.
 * A class because this is a **pull** correlated by `messageId` (ADR 0003
 * decision 2); the mapping is a pure function -- `prisonerDetailFromProjection`
 * -- so what the panel is told can be proven with no worker, no channel and no
 * DOM.
 *
 * It caches nothing, exactly as `RoomNeedsReader` caches nothing and for the
 * identical reason its header gives: a cache here is a second, stale copy of a
 * prisoner on the thread that owns no prisoners. Every read is a fresh
 * question, and a panel with nobody selected asks none.
 *
 * ## What it drops, and why each one is a refusal rather than an omission
 *
 * The projection carries more than this view model does, and the three things
 * left behind are left behind for reasons `regime-panel.ts` already wrote down
 * for the roster row:
 *
 * - **`location.tile` and `accommodation`.** `ActionSystem` writes the position
 *   component on *arrival* and never in between (`docs/HUD_PROJECTIONS.md` gap
 *   10), so a travelling prisoner's tile is where they set off from; and an
 *   accommodation resolves to the word "Cell" for every prisoner in a prison
 *   whose only residential room is `room.cell`, over an instance id
 *   (`room.cell:12:9`) that is a machine name. Where a prisoner *is*, as a
 *   player would say it, is gap 11 and is still unprojected.
 * - **`gang`.** `simulation-message-keys.ts` excludes runtime-registered ids by
 *   name and says why, so a gang id has no word at all -- and nothing in `src/`
 *   registers a gang into a new session, so the field is absent in every prison
 *   a player can start.
 * - **`sentence` and `currentAction`.** Both are renderable and neither can be
 *   *said*: a tick count is not a date (`regime.ts` says outright that
 *   `DAY_LENGTH_TICKS` is a tick budget rather than a mapping onto a clock
 *   face, and the status strip already had to withdraw an `HH:MM` readout for
 *   it), and every sentence that would frame either figure is new player-facing
 *   copy, which is `AGENTS.md`'s fourth exclusion and the owner's. The needs
 *   need no new words: the six need names, the six risk-tier and intake-stage
 *   words and the percent format all exist and were authored for this kind of
 *   readout.
 *
 * **One of those three is a projection asymmetry rather than a choice, and it
 * is recorded rather than worked around.** A roster row carries `actionPhase`
 * at the top level, so the roster can say "Idle" for a prisoner with no action
 * selected; `PrisonerDetailViewModel` carries the phase only *inside*
 * `currentAction`, so on this route there is no phase to name when no action is
 * selected. Deriving one here would be inventing simulation state, and
 * widening the projection is a protocol change rather than a panel one -- so
 * the inspector says nothing about the activity and the row above it says it
 * all.
 */

/**
 * What the inspector renders, from one projection reply.
 *
 * Pure, and every field is carried: the badge word is
 * `prisonerStandingLabelKey`'s decision (shared with the roster, so the two
 * surfaces cannot disagree about a prisoner whose classification has not run
 * yet), and the needs are the projection's own array **in the projection's own
 * order**, mapped one for one.
 *
 * **Not sorted here, and that is the load-bearing half.** `NEED_IDS` order is
 * what the projection publishes ("All six needs, always in `NEED_IDS` order"),
 * so the six lines sit in the same place on every repaint and a player reading
 * the third line down keeps reading the same need. Sorting by level -- worst
 * first, which is what the roster's single column effectively is -- would
 * reorder the block under them on any tick two needs crossed, which is the
 * rule issue #209 left standing for a repainted list: *"the position of a row
 * the player is already reading must not change under them"*. It would also
 * put a second definition of "which need is worst" on this thread, where the
 * roster's `lowestNeed` is the projection's answer to exactly that question.
 */
export function prisonerDetailFromProjection(view: PrisonerDetailViewModel): HudPrisonerDetailViewModel {
  return {
    entityId: view.entityId,
    ...(view.name === undefined ? {} : { name: { givenName: view.name.givenName, familyName: view.name.familyName } }),
    standingLabelKey: prisonerStandingLabelKey(view),
    ...(view.classificationGroupId === undefined ? {} : { classificationGroupId: view.classificationGroupId }),
    ...(view.riskTier === undefined ? {} : { riskTier: view.riskTier }),
    needs: view.needs.map(prisonerNeed),
  };
}

/**
 * What one read answered, as three states rather than as `HudPrisonerDetailViewModel | undefined`.
 *
 * **This is the one place this reader departs from `RoomNeedsReader`'s shape,
 * and the departure is the point.** That reader answers `undefined` for both
 * "a read is already in flight" and "the room went away between the two
 * requests", and it can afford to: it is looping over rooms it has just listed
 * itself, so a raced room is one dropped line and the next publication asks
 * again off a fresh list.
 *
 * Here the absent reply is not noise, it is *the answer to the player's
 * selection*. `PROJECTION_CATALOG`'s own entry says so -- "Absent, not an
 * error: a prisoner released between the click and the reply is a race the UI
 * handles, not a protocol fault" -- and a caller that could not tell it from a
 * skipped read would go on asking the worker about a released prisoner for as
 * long as the tab stayed open, while showing nothing and never letting the
 * panel forget the selection. So the three cases are named:
 *
 * - `'busy'` -- another read is in flight. **Not an answer**, so a caller must
 *   leave what is on screen alone; the next refresh asks again.
 * - `'released'` -- the worker answered, and there is no such live prisoner.
 *   `projectPrisonerDetail` returns `undefined` for exactly one reason,
 *   `!entityStore.isAlive(entityId)`, so this is a fact about the prison and
 *   not a transport failure.
 * - `'detail'` -- the prisoner, as of the tick the projection was read at.
 *
 * A refusal, a timeout or a worker that went away still *rejects*, exactly as
 * every other reader on this channel does, and is nobody's third state: the
 * caller's `catch` takes the block off.
 */
export type PrisonerDetailRead =
  | { readonly kind: 'busy' }
  | { readonly kind: 'released' }
  | { readonly kind: 'detail'; readonly detail: HudPrisonerDetailViewModel };

export class PrisonerDetailReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * **One message about one prisoner**, whatever the population.
   *
   * The cheapest read on this channel: `projectPrisonerDetail` is `O(1)` in the
   * prison -- one liveness check, one index, six needs -- where the roster's is
   * `O(window)` and the room list's is `O(instances)`. So an inspector open
   * beside the roster costs the worker one extra message per refresh, which is
   * why it is asked for on the same cadence as the roster rather than on one of
   * its own.
   *
   * **`entityId` and no offset, which is what makes an id-keyed selection safe
   * at all.** The roster refuses paging because `EntityStore` recycles an index
   * behind a wrapping generation, so an *offset* is not a stable name for a set
   * of people across ticks -- "page 3" would silently be a different three
   * prisoners after a release. An `EntityId` is not an index: it packs the
   * index with the generation (`packEntityId`, 20 bits and 12), and since
   * ADR 0026 question 1's answer (#169) a slot dying at generation 4,095 is
   * **retired** rather than recycled, precisely so that a life's id can never
   * be reissued. So this id either names the prisoner the player selected or
   * names nobody, and the second is `'released'` above. It can never quietly
   * name somebody else, which is the failure the roster's refusal of paging is
   * about and which does not reach this route.
   *
   * `'busy'` while another read is in flight, exactly as every other reader on
   * this channel returns nothing in that state, and for the same reason: a
   * caller on a cadence must not queue a second question about a prisoner it
   * has not heard the answer for once.
   */
  public async read(entityId: number): Promise<PrisonerDetailRead> {
    if (this.reading) return { kind: 'busy' };
    this.reading = true;
    try {
      const reply = await this.requester.request<PrisonerDetailViewModel>('hud/prisoner-detail', {
        target: { kind: 'entity', entityId },
      });
      if (reply.view === undefined) return { kind: 'released' };
      return { kind: 'detail', detail: prisonerDetailFromProjection(reply.view) };
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
