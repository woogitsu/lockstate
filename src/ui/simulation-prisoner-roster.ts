import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { PrisonerRosterRowViewModel } from '../simulation/presentation/prisoner-projection';
import type { ViewModelPage } from '../simulation/presentation/view-model';
import { PRISONER_ROSTER_ROW_LIMIT, type HudPrisonerRosterViewModel, type HudPrisonerRowViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads who is in the prison and what each of them is doing, over the
 * projection channel, and turns it into what the Regime panel's roster block
 * renders (issue #451).
 *
 * ## The gap this closes
 *
 * `hud/prisoner-roster` was catalogued, typed, deterministic and read by
 * nothing in `src/`. What that left invisible is the whole of #450's
 * consequence chain: `ClassificationReviewSystem` rewrites a prisoner's
 * `riskTier` and `classificationGroupIndex` from their disciplinary record,
 * `ActionSystem` resolves the regime schedule from that index on the next
 * reconsideration, and a prisoner moved to `high-risk` is confined to sleep,
 * meals and hygiene for 2,200 of the day's 2,400 ticks. Every step of that is
 * deterministic and tested. The only thing that reached the player from it was
 * `activeIncidents`, one integer on one stat tile.
 *
 * ## The payload is player-facing, which was the open question
 *
 * Issue #451's own weakest claim was that these projections are shaped for a
 * panel rather than for a debug reader, and that it had read their catalog
 * entries rather than their payloads. Read: every id on a roster row has an
 * authored label in `src/content/simulation-message-keys.ts` -- `action`,
 * `action-phase`, `intake-stage`, `classification-group` and `risk-tier` are
 * all groups there -- and the `action` labels were written *for this*, one of
 * them saying so in its own comment: *"A roster cell says what the prisoner is
 * doing."* So the claim holds for the roster.
 *
 * It does **not** hold for everything the row carries, and this module drops
 * what it cannot render honestly rather than passing it through:
 *
 * - `tile` is `{x, y}`, and `ActionSystem` writes the position component on
 *   arrival and never in between (`docs/HUD_PROJECTIONS.md` gap 10), so a
 *   travelling prisoner's tile is where they set off from.
 * - `accommodation` is a room instance whose `roomNameKey` resolves to the word
 *   "Cell" for every prisoner a player can house, over an id of the form
 *   `room.cell:12:9` (`roomInstanceIdFor`) which is a machine name.
 * - `gangId` has no labelling mechanism at all -- `simulation-message-keys.ts`
 *   excludes runtime-registered ids by name and says why -- and nothing in
 *   `src/` registers a gang into a new session, so it is absent in every prison
 *   a player can start.
 * - `lowestNeed` is renderable and is dropped for a different reason, which
 *   belongs to the panel: gap 7, no threshold. See `regime-panel.ts`.
 *
 * ## The twelfth translator, and why it is a class
 *
 * It joins the ten before it outside `src/ui/hud/`, and it is here for the
 * reason they all are: the HUD imports nothing from `src/simulation/**`
 * (`AGENTS.md` boundary 1, enforced by `tests/unit/ui-hud-messages.test.ts`),
 * so a module that has to know both a projection's shape and a view model sits
 * outside it. A class because this is a **pull** correlated by `messageId`
 * (ADR 0003 decision 2); the mapping is a pure function --
 * `prisonerRosterFromProjection` -- so what the panel is told can be proven
 * with no worker, no channel and no DOM.
 */

/**
 * The action-phase vocabulary, taken from the read model rather than from the
 * simulation's own declaration.
 *
 * `ActionPhase` is declared in `src/simulation/prisoners/components.ts`, and
 * naming it from here would make this module's only simulation dependency a
 * *deep* one. The projection already carries the union on the field this module
 * reads, so deriving it from the view-model shape keeps the dependency where
 * every other translator's is -- on `src/simulation/presentation/` -- while
 * still failing to compile if a phase is renamed. The rule
 * `simulation-intake.ts` states for `IntakeStage`, applied to the sibling enum.
 */
type ProjectedActionPhase = PrisonerRosterRowViewModel['actionPhase'];

/** The one phase that is about a place the prisoner has not reached yet. */
const TRAVELLING_PHASE: ProjectedActionPhase = 'travelling';

/**
 * What one row says, from one projected row.
 *
 * Three decisions, and none of them is a figure:
 *
 * 1. **The activity is the action when there is one and the phase when there
 *    is not.** `currentActionId` is absent while the store holds its `-1`
 *    sentinel, and a row with a blank activity cell would be indistinguishable
 *    from a row that failed to paint. `action-phase.idle.name` is the word the
 *    catalogue already authored for that state, so nothing new is invented for
 *    it. The two fields are independent on the projection, so this reads them
 *    independently rather than assuming that no action implies the idle phase.
 * 2. **`travelling` is true only when there is an action to name.** "Heading
 *    to Idle" is not a sentence, and a phase of `travelling` with no action
 *    selected cannot say where.
 * 3. **The badge word is the tier once classification has run, and the intake
 *    stage before it.** `classified` is the projection's own flag and it exists
 *    precisely because `riskTier` is still a zero-initialised `0` beforehand --
 *    which decodes as "Minimal" and would show every queued arrival as an
 *    assessed low-risk prisoner. The group id rides along unlabelled: the panel
 *    uses it for the badge's tone, and the group's *name* is on screen already
 *    in the block above the roster.
 */
function prisonerRow(row: PrisonerRosterRowViewModel): HudPrisonerRowViewModel {
  const actionId = row.currentActionId;
  const riskTier = row.riskTier;
  return {
    entityId: row.entityId,
    ...(row.name === undefined ? {} : { name: { givenName: row.name.givenName, familyName: row.name.familyName } }),
    activityLabelKey:
      actionId === undefined
        ? deriveSimulationMessageKey('action-phase', row.actionPhase)
        : deriveSimulationMessageKey('action', actionId),
    travelling: actionId !== undefined && row.actionPhase === TRAVELLING_PHASE,
    standingLabelKey:
      row.classified && riskTier !== undefined
        ? deriveSimulationMessageKey('risk-tier', riskTier)
        : deriveSimulationMessageKey('intake-stage', row.intakeStage),
    ...(row.classificationGroupId === undefined ? {} : { classificationGroupId: row.classificationGroupId }),
    ...(riskTier === undefined ? {} : { riskTier }),
  };
}

/**
 * What the roster block renders, from one projection reply.
 *
 * Pure, and it counts nothing: `total` is the projection's own figure over the
 * whole live population, not the length of the window. Getting that the other
 * way round would make the panel report its own row budget as the size of the
 * prison, which is the failure mode a "N of M" readout exists to prevent.
 *
 * The window's order is the projection's -- ascending entity index, the same
 * canonical walk `EntityQuery.execute()` uses (ADR 0005) -- and is not re-sorted
 * here. A main-thread sort of one page would order that page and claim to have
 * ordered the prison; `projectPrisonerRoster` says in its own header that rows
 * are not sortable by an arbitrary column there either, and that the answer is
 * an indexed accessor in the prisoner runtime rather than a sort anywhere.
 */
export function prisonerRosterFromProjection(
  view: ViewModelPage<PrisonerRosterRowViewModel>,
): HudPrisonerRosterViewModel {
  return { total: view.total, rows: view.rows.map(prisonerRow) };
}

export class PrisonerRosterReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * **One message carrying the panel's own row budget**, whatever the
   * population.
   *
   * `PRISONER_ROSTER_ROW_LIMIT` rows from offset zero, which is the rule
   * `HeldGuardsReader` follows by naming `HELD_GUARD_ROW_LIMIT` -- ask for the
   * rows the panel can draw. The alternative was `MAX_PROJECTION_PAGE_LIMIT`
   * (500) with the paging done on this thread, and it is refused twice over: it
   * would build 496 row objects to discard twice a second, and it would put a
   * copy of the roster on the thread that owns no roster, which is the cache
   * `SimulationProjectionRequester`'s own header refuses to keep.
   *
   * **No `offset`, and no control that would change one.** The projection walks
   * entity *indices*, and `EntityStore` recycles an index behind a wrapping
   * generation when a prisoner leaves (ADR 0026), so an offset is not a stable
   * name for a set of people across ticks -- "page 3" would silently be a
   * different three prisoners after a release. Paging an unsorted 5,000-row
   * list four at a time is not a way to find a prisoner in any case; what would
   * make one is a filter or an ordering, and `projectPrisonerRoster` records
   * that neither exists and that the fix is an indexed accessor in the prisoner
   * runtime. So this asks for the first window and reports the true total
   * beside it.
   *
   * `undefined` while another read is in flight, exactly as every other reader
   * on this channel answers.
   */
  public async read(): Promise<HudPrisonerRosterViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<ViewModelPage<PrisonerRosterRowViewModel>>('hud/prisoner-roster', {
        limit: PRISONER_ROSTER_ROW_LIMIT,
      });
      if (reply.view === undefined) return undefined;
      return prisonerRosterFromProjection(reply.view);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
