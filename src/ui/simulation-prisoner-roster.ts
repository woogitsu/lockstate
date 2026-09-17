import type { LocalizationKey } from '../content/localization';
import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type {
  PrisonerNeedViewModel,
  PrisonerRosterPage,
  PrisonerRosterRowViewModel,
} from '../simulation/presentation/prisoner-projection';
import {
  PRISONER_ROSTER_ROW_LIMIT,
  type HudPrisonerNeedViewModel,
  type HudPrisonerRosterViewModel,
  type HudPrisonerRowViewModel,
} from './hud';
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
 *   a player can start. **That last clause is false since
 *   [ADR 0103](../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md),
 *   which seeds two gangs per session and assigns `high-risk` arrivals to one
 *   at intake, and it is kept rather than overwritten**
 *   (`docs/AGENT_WORKFLOW.md` §4). The reason this row still drops the field is
 *   the clause before it, which did not move: `gang.alpha` is a machine name
 *   with no locale key, and a roster cell reading it would be raw dotted text.
 *   See `simulation-prisoner-detail.ts`, which carries the same correction.
 * - `lowestNeed` **was** dropped here for a different reason, which belonged to
 *   the panel: gap 7, no threshold. See `roster-panel.ts`. It is forwarded as
 *   of issue #535 decision 6, and the bullet is amended rather than deleted
 *   because the reason it gave was real and is only half spent: the *level* was
 *   always renderable and what was missing was a line to read it against. #488
 *   supplied one the simulation acts on (`STATE_INCOME_UNMET_NEED_LEVEL`), the
 *   projection now reports it per need, and this module forwards the pair. What
 *   is still missing -- and is still not invented here -- is the player-facing
 *   threshold gap 7 keeps with the owner.
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
 * One need, from the projection's own shape to the HUD's.
 *
 * Exported and shared with `./simulation-prisoner-detail.ts` rather than
 * written twice, because the mapping carries a *rule* and not only a copy: the
 * word comes from `deriveSimulationMessageKey('need', needId)` and never from a
 * table, and the level is the projection's `permille` rather than its raw
 * level and maximum, which `BoundedValue`'s own header refuses to publish so
 * that no HUD hard-codes `255`. Two declarations of that drift -- the roster
 * would still be deriving a key while the inspector had grown a literal -- and
 * the drift is invisible in any test that reads only one of them.
 *
 * Four fields out and nothing computed: `unmetForStateIncome` is carried, not
 * compared. The threshold behind it is `STATE_INCOME_UNMET_NEED_LEVEL`, in
 * `src/simulation/economy/income.ts`, which this thread may not import
 * (`AGENTS.md` boundary 1) and must not restate.
 */
export function prisonerNeed(need: PrisonerNeedViewModel): HudPrisonerNeedViewModel {
  return {
    needId: need.needId,
    labelKey: deriveSimulationMessageKey('need', need.needId),
    permille: need.level.permille,
    unmetForStateIncome: need.unmetForStateIncome,
  };
}

/**
 * The badge word for one prisoner: the risk tier once classification has run,
 * and the intake stage before it.
 *
 * Exported and shared with `./simulation-prisoner-detail.ts` for
 * `prisonerNeed`'s reason, and this one is the sharper of the two because it
 * is a *decision* rather than a copy. `classified` exists on the projection
 * precisely because `riskTier` is a zero-initialised `0` beforehand, which
 * decodes as "Minimal" -- so a second copy of this rule that forgot the flag
 * would show every queued arrival as an assessed low-risk prisoner, and would
 * show it on one surface while the other was correct.
 *
 * The parameter is structural rather than either projection's row type, so the
 * roster row and the detail can both pass themselves: the two view models
 * declare these three fields identically and neither is a subtype of the
 * other.
 */
export function prisonerStandingLabelKey(record: {
  readonly classified: boolean;
  readonly riskTier?: number;
  readonly intakeStage: PrisonerRosterRowViewModel['intakeStage'];
}): LocalizationKey {
  return record.classified && record.riskTier !== undefined
    ? deriveSimulationMessageKey('risk-tier', record.riskTier)
    : deriveSimulationMessageKey('intake-stage', record.intakeStage);
}

/**
 * What one row says, from one projected row.
 *
 * Four decisions, and only the third carries a figure:
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
 * 3. **The worst need is carried as an id, a key, a figure and a flag, and none
 *    of the four is computed here.** The projection picked *which* need is
 *    lowest and whether the state withholds for it; this reads both off the row
 *    and derives the word from the id the same way every other label on the row
 *    is derived. A threshold comparison on this thread would be the failure
 *    decision 3 above describes for the badge -- recomputing a simulation line
 *    in the layer that renders it -- and it would need
 *    `src/simulation/economy/income.ts`, a *deep* simulation import this module
 *    refuses for `ActionPhase`'s reason above.
 * 4. **The badge word is the tier once classification has run, and the intake
 *    stage before it.** `classified` is the projection's own flag and it exists
 *    precisely because `riskTier` is still a zero-initialised `0` beforehand --
 *    which decodes as "Minimal" and would show every queued arrival as an
 *    assessed low-risk prisoner. The group id rides along unlabelled: the panel
 *    uses it for the badge's tone, and the group's *name* is on screen already
 *    in the block above the roster.
 *
 * **Decisions 3 and 4 are `prisonerNeed` and `prisonerStandingLabelKey` above
 * as of issue #895**, unchanged in what they decide and moved because a second
 * reader of the same prisoner arrived: `./simulation-prisoner-detail.ts` maps
 * all six needs and the same badge word off `hud/prisoner-detail`. Both are
 * rules rather than copies, so the alternative was two declarations that agree
 * today.
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
    standingLabelKey: prisonerStandingLabelKey(row),
    ...(row.classificationGroupId === undefined ? {} : { classificationGroupId: row.classificationGroupId }),
    ...(riskTier === undefined ? {} : { riskTier }),
    lowestNeed: prisonerNeed(row.lowestNeed),
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
 * The window's order is the projection's and is not re-sorted here. A
 * main-thread sort of one page would order that page and claim to have ordered
 * the prison -- this reader asks for `PRISONER_ROSTER_ROW_LIMIT` rows and gets
 * four, so a sort here could only ever rearrange four rows out of a prison of
 * up to `DEFAULT_PRISONER_CAPACITY`.
 *
 * **What that order is changed on 2026-08-31 (issue #703, the owner's fourth
 * ruling), and this paragraph is corrected rather than replaced.** It used to
 * read: *"ascending entity index, the same canonical walk
 * `EntityQuery.execute()` uses (ADR 0005) ... `projectPrisonerRoster` says in
 * its own header that rows are not sortable by an arbitrary column there
 * either, and that the answer is an indexed accessor in the prisoner runtime
 * rather than a sort anywhere."* The order is now **highest risk tier first,
 * ties broken by ascending entity index**, decided in the projection where the
 * whole population is visible. Both halves of the old sentence were true when
 * written and only the first is now false: entity index survives as the
 * tie-break, and the refusal of an *arbitrary-column* sort survives too -- what
 * changed is that one fixed key with five values turned out to be a counting
 * sort rather than a comparison sort, which `projectPrisonerRoster`'s header
 * now prices.
 *
 * The rule this module has to keep either way is unchanged: the order is a
 * function of simulation state, and the main thread neither chooses it nor
 * recomputes it.
 */
export function prisonerRosterFromProjection(view: PrisonerRosterPage): HudPrisonerRosterViewModel {
  return { total: view.total, rows: view.rows.map(prisonerRow), everAdmitted: view.everAdmitted };
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
   * **"twice a second" is the counts cadence and this reader does not ride
   * it (corrected 2026-09-02, issues #718 and #765).** The sentence is kept
   * because the argument is unchanged and only gets stronger: what makes the
   * main thread ask is the worker's clock heartbeat, and
   * `CLOCK_STATE_PUBLISH_INTERVAL_MS` is 250 against the counts channel's 500 --
   * measured at 120 refreshes in 30 s in a prison with nobody housed and 178 in
   * one with two housed (ADR 0086 §3), so **up to about four a second, not
   * two**. The spacing is `ceil(250 / 15) * 15` = 255 ms on the harness, with a
   * 292.8-299.6 ms tail measured in a browser (PR #762). The cost this window
   * refuses is therefore roughly double what this sentence priced.
   *
   * **No `offset`, and no control that would change one.** The projection walks
   * entity *indices*, and `EntityStore` recycles an index behind a wrapping
   * generation when a prisoner leaves (ADR 0026), so an offset is not a stable
   * name for a set of people across ticks -- "page 3" would silently be a
   * different three prisoners after a release. Paging an unsorted 5,000-row
   * list four at a time is not a way to find a prisoner in any case; what would
   * make one is a filter or an ordering.
   *
   * **The second of those exists as of 2026-08-31 and the sentence that denied
   * it is corrected here rather than deleted.** It read: *"and
   * `projectPrisonerRoster` records that neither exists and that the fix is an
   * indexed accessor in the prisoner runtime."* An ordering exists now --
   * highest risk tier first, ties on ascending entity index (issue #703, the
   * owner's fourth ruling) -- so the four rows this reader asks for are the four
   * highest-tier prisoners in the prison rather than the four oldest. A
   * **filter** still does not exist, and neither does an indexed accessor, so
   * the half of that sentence about finding *a particular* prisoner is
   * untouched. So this still asks for the first window and reports the true
   * total beside it; what changed is that the first window is now the window
   * worth having.
   *
   * `undefined` while another read is in flight, exactly as every other reader
   * on this channel answers.
   */
  public async read(): Promise<HudPrisonerRosterViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<PrisonerRosterPage>('hud/prisoner-roster', {
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
