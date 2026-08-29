import type { LocalizationKey } from '../content/localization';
import type { SimulationEvent, SimulationEventType, WorkerToMainMessage } from '../simulation/protocol/types';
import type { HudAlertViewModel, HudEventNoticeViewModel, HudSeverity } from './hud/view-model';

/**
 * What the player is told about each thing the prison does, and how loudly.
 *
 * A `Record` over the closed `SimulationEventType` union, for the reason
 * `REFUSAL_LABEL_KEYS` and `PROTOCOL_FAULT_LABEL_KEYS` are `Record`s over
 * theirs: an event type added to the protocol **fails to compile here** until
 * somebody has decided what it says to a player and how serious it is. That
 * property is the entire argument for `simulation/event` carrying a typed
 * union instead of the opaque `versionedPayload` it was declared with; see
 * `simulationEventSchema` in `src/simulation/protocol/types.ts`.
 *
 * The keys are HUD-namespaced (`hud.alert.event.*`) and authored rather than
 * derived through `src/content/simulation-message-keys.ts`, on the same
 * reasoning `src/ui/simulation-alerts.ts` gives for refusals: that module
 * labels an id a panel renders *as a label*, and these are sentences about
 * something that happened, not dense panel labels.
 *
 * ## `severity`, and the first `'info'` in the repository
 *
 * `HudSeverity` has been `'info' | 'warning' | 'danger'` since the type was
 * declared, and until this table `'info'` was assigned nowhere in `src/`:
 * `simulation-alerts.ts` builds every row it produces from a `RefusalReason`
 * or a `ProtocolFaultCode`, so it can only ever say `'warning'` or
 * `recoverable ? 'warning' : 'danger'`. The prison could report what went
 * wrong and nothing else. That is issue #507, and these two rows are what
 * make the member real:
 *
 * - **`prisoners.discharged` is `'info'`.** Nothing is wrong. A sentence ran
 *   its course and somebody went home, which is the loop working. Grading it
 *   as a warning would be a lie about the prison's state, and it is the case
 *   that proves the channel carries good news as well as bad.
 * - **`economy.wages-unpaid` is `'warning'`, and it is the first `'warning'`
 *   in the repository that is not a refusal of something the player asked
 *   for.** Nobody pressed anything; the prison ran out of money on its own.
 *   ADR 0049 decided insolvency is a state rather than a loss condition, so
 *   this is not `'danger'` -- the session continues, the arrears are
 *   recoverable, and `'danger'` is reserved for the one thing this HUD says
 *   it means, "stop trusting what you are looking at"
 *   (`simulation-alerts.ts`, the `protocol/error` branch).
 */
const EVENT_PRESENTATION: Readonly<
  Record<SimulationEventType, { readonly labelKey: LocalizationKey; readonly severity: HudSeverity }>
> = {
  'economy.wages-unpaid': { labelKey: 'hud.alert.event.economy.wages-unpaid', severity: 'warning' },
  'prisoners.discharged': { labelKey: 'hud.alert.event.prisoners.discharged', severity: 'info' },
};

/**
 * The row family this module produces, as a prefix on `HudAlertViewModel.id`.
 *
 * A third prefix beside `simulation-alerts.ts`'s `refusal-` and `fault-`, and
 * it has to be distinct from both for the reason that module gives: the
 * producers update one flat list independently, and each must leave the
 * others' rows alone. `hudAlertsFromWorkerMessage` filters on
 * `refusal-` when a status-counts publication replaces the refusal row, so an
 * `event-` row survives it untouched -- which is the property that lets the
 * two modules share `HudViewModel.alerts` without either knowing about the
 * other.
 */
const EVENT_ROW_PREFIX = 'event-';

/**
 * How many event rows the alerts list keeps.
 *
 * **This is the volume rule, and it is the one thing on this channel that a
 * cap has to do rather than a producer.** The producers are already bounded
 * where they are written -- `PrisonerDischargeSystem` emits at most one event
 * per discharge check and aggregates the tick's releases into a single
 * `count`, and `PayrollSystem` emits at most one per in-game day -- so a
 * *burst* is impossible by construction. What is not bounded by construction
 * is the **session**: a prison left running discharges regularly, and every
 * discharge is a row that is still true, so an uncapped list grows without
 * limit for as long as the tab is open. That is exactly what
 * `docs/HUD_PROJECTIONS.md` contract 5 forbids, and `simulation-alerts.ts`
 * only escaped it by holding at most one refusal row and at most one row per
 * fault code.
 *
 * Eight, and the newest eight: the list is a log the player scrolls back
 * through a little, not an audit trail, and the band beside it already
 * carries the one that matters right now. The oldest is dropped rather than
 * the newest for the reason `SimulationEventLog` drops the oldest.
 *
 * Measured rather than guessed. `ADMISSION_REQUEST` in `src/main.ts` asks for
 * `sentenceLengthTicks: 10_000`, which ADR 0050 records as about four in-game
 * days; `DISCHARGE_CHECK_INTERVAL_TICKS` is how often anybody can leave. A
 * prison admitting steadily therefore produces discharge events on the order
 * of one per admission cohort rather than one per prisoner -- the aggregation
 * above is what makes that true -- so eight rows is several cohorts of
 * history, and `tests/unit/ui-simulation-events.test.ts` pins the cap by
 * driving more events than that through the translator rather than by
 * asserting the constant against itself.
 */
export const MAX_EVENT_ALERT_ROWS = 8;

/**
 * Turns what the prison just did into the rows the HUD's alerts list paints.
 *
 * The sixth translator outside `src/ui/hud/`, and it lives here for the reason
 * the other five do: the HUD is a view over plain data and may not import
 * `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), so the module that has to know both a
 * protocol message and a view model sits outside it. Pure, so proving it needs
 * neither a worker nor a DOM.
 *
 * Takes and returns the whole list for the reason `hudAlertsFromWorkerMessage`
 * does: two producers share `HudViewModel.alerts` and neither may erase the
 * other, so the caller passes the list it is holding and gets the next one
 * back. Rows from the other producer are carried through untouched.
 *
 * ## What clears an event
 *
 * **Nothing, individually.** A refusal is withdrawn when the same action later
 * succeeds, because "the build order failed" stops being the current answer
 * about that control. An event has no control and no current answer: "two
 * prisoners finished their sentences at tick 40,000" does not become untrue,
 * and there is nothing a player could do that would make it untrue. So no row
 * is ever removed for being wrong. Rows leave for exactly two reasons, and
 * both are about the *list* rather than about the event:
 *
 * - **The cap** (`MAX_EVENT_ALERT_ROWS`) drops the oldest to keep the list
 *   bounded.
 * - **`simulation/stopped` empties it**, which
 *   `hudAlertsFromWorkerMessage` already does for the whole list. That is not
 *   a claim that the events stopped being true; it is the same reading the
 *   counts take when they zero and the clock takes when it goes unknown --
 *   this HUD is a view of a live session, and there is no longer a session for
 *   it to be a view of.
 *
 * Returns `undefined` for a message that says nothing about events, so the
 * caller leaves the field alone -- the tri-state every translator here uses.
 */
export function hudEventAlertsFromWorkerMessage(
  message: WorkerToMainMessage,
  previous: readonly HudAlertViewModel[] = [],
): readonly HudAlertViewModel[] | undefined {
  if (message.kind !== 'simulation/event') return undefined;
  const next = [...previous, eventAlertRow(message.payload.event)];

  /*
   * **Positions are preserved and only the oldest event rows are dropped.**
   *
   * The obvious implementation -- partition into events and non-events, trim
   * the events, concatenate -- is wrong here, and wrong in a way that only
   * shows up once both producers are running. `hudAlertsFromWorkerMessage`
   * re-appends the refusal row at the *end* of the list on every
   * `simulation/status-counts` publication, which arrives up to twice a
   * second; a partition that grouped the families would hoist that row back
   * above the events on every event, and it would oscillate between two
   * positions for as long as it stood.
   *
   * `simulation-alerts.ts` states the rule in `replaceOrAppend` -- "the
   * position of a row the player is already reading must not change under
   * them" -- and issue #209 measured the same property from the other side.
   * So this filters in place: every surviving row keeps its index relative to
   * the others, and the new event goes on the end.
   */
  const eventIds = next.filter((existing) => existing.id.startsWith(EVENT_ROW_PREFIX)).map((existing) => existing.id);
  if (eventIds.length <= MAX_EVENT_ALERT_ROWS) return next;
  const dropped = new Set(eventIds.slice(0, eventIds.length - MAX_EVENT_ALERT_ROWS));
  return next.filter((existing) => !dropped.has(existing.id));
}

/**
 * Turns the same event into the notice the HUD's events band paints.
 *
 * The band's counterpart to `hudRefusalFromWorkerMessage`, and a second
 * reading of one message rather than a second message, for the reason that
 * function gives: the list merges these rows with another producer's and
 * therefore needs the list it is updating, while the band holds one sentence
 * and needs nothing but the message.
 *
 * **The newest event is the one on the line.** The same rule the refusal band
 * runs, and it needs no arbitration here because there is only one producer
 * for this band -- what it replaces is always an older event, never a sentence
 * of a different class. Nothing is stacked and nothing comes back: an event
 * pushed off the line is still in the log.
 *
 * Tri-state, exactly as `hudRefusalFromWorkerMessage` is: `undefined` means
 * this message says nothing about an event and the view model must be left
 * alone, while `'none'` is a message that does say, and says there is none.
 * Collapsing them would leave the band showing an event from a session that
 * had ended.
 */
export function hudEventNoticeFromWorkerMessage(
  message: WorkerToMainMessage,
): HudEventNoticeViewModel | 'none' | undefined {
  switch (message.kind) {
    case 'simulation/event': {
      const { event } = message.payload;
      const { labelKey, severity } = EVENT_PRESENTATION[event.type];
      return { sequence: event.sequence, labelKey, severity, labelParameters: eventParameters(event) };
    }

    // The session is over, so the band empties -- the same thing the alerts
    // list does on this message, and for the same reason the refusal band
    // does: this HUD is a view of a live session and there is no longer one.
    case 'simulation/stopped':
      return 'none';

    default:
      return undefined;
  }
}

function eventAlertRow(event: SimulationEvent): HudAlertViewModel {
  const { labelKey, severity } = EVENT_PRESENTATION[event.type];
  return {
    // The event's own ordinal, so every event is its own row rather than
    // rewriting the previous one -- the opposite of what a refusal's ordinal
    // buys, and for the opposite reason: a refusal is republished unchanged on
    // a cadence and must update in place, while each event is published once
    // and is a new fact.
    id: `${EVENT_ROW_PREFIX}${event.sequence}`,
    labelKey,
    labelParameters: eventParameters(event),
    severity,
  };
}

/**
 * The numbers the sentence needs, keyed by the placeholder its message uses.
 *
 * `switch` over the discriminant rather than an index into a table, because
 * the two members carry *different* figures -- a count of people and a sum of
 * money -- and a shared `magnitude` field would have been a name that means
 * two things, which is the shape `src/simulation/protocol/types.ts` refuses
 * for `refusal` inside `counts`. Exhaustive over the union, so a third event
 * type does not compile until its parameters are decided.
 *
 * Minor units are passed through unconverted, exactly as
 * `HudCountsViewModel.treasuryMinorUnits` is: the HUD formats money at the
 * last possible moment and nothing upstream of the formatter knows what a
 * major unit is.
 */
function eventParameters(event: SimulationEvent): { readonly [key: string]: number } {
  switch (event.type) {
    case 'economy.wages-unpaid':
      return { total: event.unpaidWagesMinorUnits };
    case 'prisoners.discharged':
      return { count: event.count };
  }
}
