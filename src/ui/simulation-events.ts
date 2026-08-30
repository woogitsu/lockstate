import type { LocalizationKey } from '../content/localization';
import type { SimulationEvent, SimulationEventType, WorkerToMainMessage } from '../simulation/protocol/types';
import type { HudAlertViewModel, HudEventNoticeViewModel, HudSeverity } from './hud/view-model';
import type { HudMessageParameterViewModel } from './hud/label-parameters';
import { HUD_MESSAGE_KEY } from './hud/messages';

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
 *
 * ## `'danger'`, and what finally cleared that bar (issue #555)
 *
 * The paragraph above is what `hud.css` was written against: its
 * `.hud__event[data-severity='danger']` rule carries a comment saying no event
 * carried `'danger'` and that the rule existed anyway, because a third event
 * graded `'danger'` would otherwise *"inherit the `'info'` blue above and be
 * painted as good news"*. These five rows are that third event.
 *
 * **The bar, restated for a domain event.** "Stop trusting what you are
 * looking at" is a sentence about a protocol fault, and read *only* as a
 * sentence about the HUD's own machinery no simulation event could ever clear
 * it -- which would leave the member producerless for ever and make the CSS
 * comment's own premise unreachable. The reading actually available is the one
 * the rest of this HUD already takes: the status strip has painted
 * `tone: 'danger'` on the incidents badge for **any** open incident since
 * before #507 (`src/ui/hud/projection.ts`, `badge: hasIncidents ? { tone:
 * 'danger', ... }`), so a `'warning'` band about the same incident would put
 * two different colours on one fact.
 *
 * **The line between the two bands is measured, and it is the simulation's
 * own.** `IncidentResponsePolicy.lockdownSeverityThreshold` is 6: at or above
 * it the response system locks every door in the sector, and the prison stops
 * doing what the player told it to. Three incident types keep the full 0-10
 * severity range and can cross it. The fourth cannot, by construction:
 * `ASSAULT_SEVERITY_CEILING` (`src/simulation/incidents/flashpoint.ts`) caps
 * an assault at 5, *"one below the lockdown threshold"*, and says why at
 * length -- scoring a fistfight on the riot's scale *"says two things about a
 * fistfight that are not true"*.
 *
 * - **`incidents.riot-opened` is `'danger'`**, and it is the strongest of the
 *   three. A riot does not merely reach the lockdown threshold; it suspends
 *   the prison's control over the people in it. `IncidentLog` keeps
 *   `isOpenRiotParticipant` for exactly one type -- *"Only `'riot'` is
 *   indexed"* -- and `riot-regime.ts` overrides action selection for every
 *   participant while it is open, so the jobs, the routine and the schedule
 *   the HUD is showing are not what those prisoners are doing. That is "stop
 *   trusting what you are looking at", said about the prison rather than about
 *   the renderer.
 * - **`incidents.escape-attempt-opened` is `'danger'`.** It is the one
 *   incident whose failure is irreversible: ADR 0061 decision 5 makes a lapsed
 *   escape attempt a prisoner who is *gone*, and `IncidentResponseSystem`
 *   releases them. Nothing about that is recoverable, which is the test ADR
 *   0049 set for unpaid wages and this one fails.
 * - **`incidents.gang-retaliation-opened` is `'danger'`.** It keeps the full
 *   severity range and can lock the sector down, which is the line above. It
 *   is graded on that rather than on anything measured in play, because
 *   nothing in `src/` seeds a gang -- `GangRegistry.addMember` is reached only
 *   from `loadSnapshot` -- so no session a player can start opens one today.
 *   The grade is what the code would do if one did, and it is here so that
 *   seeding gangs is not also a copy decision.
 * - **`incidents.assault-opened` is `'warning'`**, the same band as unpaid
 *   wages and for a compatible reason: two prisoners, contained by two or
 *   three guards, and by `ASSAULT_SEVERITY_CEILING` it can never reach the
 *   threshold that seals a door. It is bad, and the prison is still the
 *   player's.
 * - **`incidents.escape-succeeded` is `'danger'`, and it is the row the
 *   paragraph above was already arguing for without having one to point at
 *   (#683).** Every word of the escape-attempt entry -- irreversible, ADR 0061
 *   decision 5, *"a prisoner who is gone"*, nothing about it recoverable -- is
 *   a description of the *failure*, and until this row the channel only ever
 *   graded the attempt. The attempt keeps `'danger'`, because at the moment it
 *   opens the prison cannot know which way it ends; this is what the band says
 *   when it ended the bad way. It is the only member of this table about an
 *   outcome rather than an opening or a return to calm.
 * - **`incidents.all-clear` is `'info'`.** Nothing is wrong any more, which is
 *   the same thing `prisoners.discharged` says about a served sentence. It is
 *   also what stops a `'danger'` band standing over a calm prison for the rest
 *   of a session; see the schema's own comment in
 *   `src/simulation/protocol/types.ts`.
 *
 * ## `prisoners.relocated` is `'info'`, and the grade is arguable (ADR 0076)
 *
 * A prisoner moved cell without the player asking, because the player took
 * their bed away. Read as a *consequence* it sounds like a warning; read as a
 * *state* it is not one, and this table grades states: the prisoner now sleeps
 * on a bed that exists, the prison pays for a place it really furnished
 * (decision A(ii)), and there is nothing left for the player to put right. An
 * unpaid payday is `'warning'` because the arrears are still owed on the next
 * tick; this is closer to `prisoners.discharged`, where the loop worked.
 *
 * **What it must not be is silent**, which is what it was between PR #637 and
 * this change and what issue #629 puts in the same class as a promise the code
 * does not keep. The band is the surface that reaches the player at every
 * viewport with nothing opened, and `'info'` still lands on it.
 *
 * The resident relocation could *not* rehouse is a different fact with no
 * approved sentence, so it has no row here and no key. See
 * `SimulationEventLog.recordResidentRelocated`.
 */
const EVENT_PRESENTATION: Readonly<
  Record<SimulationEventType, { readonly labelKey: LocalizationKey; readonly severity: HudSeverity }>
> = {
  'economy.wages-unpaid': { labelKey: 'hud.alert.event.economy.wages-unpaid', severity: 'warning' },
  'incidents.all-clear': { labelKey: 'hud.alert.event.incidents.all-clear', severity: 'info' },
  'incidents.assault-opened': { labelKey: 'hud.alert.event.incidents.assault-opened', severity: 'warning' },
  'incidents.escape-attempt-opened': {
    labelKey: 'hud.alert.event.incidents.escape-attempt-opened',
    severity: 'danger',
  },
  'incidents.escape-succeeded': {
    labelKey: 'hud.alert.event.incidents.escape-succeeded',
    severity: 'danger',
  },
  'incidents.gang-retaliation-opened': {
    labelKey: 'hud.alert.event.incidents.gang-retaliation-opened',
    severity: 'danger',
  },
  'incidents.riot-opened': { labelKey: 'hud.alert.event.incidents.riot-opened', severity: 'danger' },
  'prisoners.discharged': { labelKey: 'hud.alert.event.prisoners.discharged', severity: 'info' },
  'prisoners.relocated': { labelKey: 'hud.alert.event.prisoners.relocated', severity: 'info' },
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
 * `count`, `PayrollSystem` emits at most one per in-game day, and the two
 * incident producers of #555 are bounded by the quiet period the trigger
 * system already keeps (`IncidentTriggerSystem.openIncident`) and by the
 * return-to-calm rule (`IncidentResponseSystem.reportAllClearIfCalm`) -- so a
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
 * Measured rather than guessed -- **and the measurement has been re-based,
 * because the figure it rested on is gone.** This read *"`ADMISSION_REQUEST` in
 * `src/main.ts` asks for `sentenceLengthTicks: 10_000`, which ADR 0050 records
 * as about four in-game days"*. Since ADR 0069 that constant is
 * `{ priorIncidents: 0 }` and carries no sentence at all: the length is drawn
 * **inside the worker**, uniformly over whole in-game days.
 *
 * **The range that sentence quoted, `[2, 16]` -- 4,800..38,400 ticks, mean
 * 21,600 -- is itself gone since the owner's 2026-08-30 ruling on
 * [#593](https://github.com/matmaxalez/lockstate/issues/593)
 * ([ADR 0079](../../docs/adr/0079-a-sentence-long-enough-to-be-a-history.md)).**
 * It is `[14, 90]` now: 33,600..216,000 ticks, mean 124,800 -- **52** in-game
 * days rather than nine, and 5.8x the spread. The old figures are kept above
 * because the worked example below is written in them, and because this
 * paragraph's subject is a measurement that has now been re-based twice.
 *
 * **The conclusion drawn from that is withdrawn too, and it was mine.** It read
 * *"the wider spread strengthens it: cohorts leave further apart than the old
 * fixed sentence implied, not closer together."* Replacing a stale number with
 * a confident direction is not a correction, and the direction is false: an
 * independent draw per prisoner **both splits cohorts and merges them.**
 *
 * Two prisoners admitted together with 2- and 16-day sentences leave 33,600
 * ticks apart -- split. One admitted at tick 0 with 16 days ends at 38,400, and
 * one admitted a day later at 2,400 with 15 days ends at 2,400 + 36,000 =
 * **38,400 as well** -- merged onto a single tick, where the old fixed 10,000
 * would have left them 2,400 apart. `PrisonerDischargeSystem` aggregates only
 * those due on the *same tick*, so both directions really do move the count.
 *
 * The worked example is in the old range's numbers and is left in them: the
 * shape of the argument is what it is for, and it survives the re-range
 * unchanged except that both effects get larger. Under `[14, 90]` the split
 * case is 182,400 ticks rather than 33,600, and the merge case still needs
 * only that two arrival ticks and two draws sum to the same number.
 *
 * So **eight rows is no longer an argued figure, it is an unmeasured one**.
 * What would settle it is the number of discharge events a real admission
 * cadence produces, and nobody has run that. Recorded as open rather than
 * defended, because a cap justified by reasoning that has been withdrawn twice
 * is a cap nobody is checking.
 * `DISCHARGE_CHECK_INTERVAL_TICKS` is how often anybody can leave. A
 * prison admitting steadily therefore produces discharge events on the order
 * of one per admission cohort rather than one per prisoner -- the aggregation
 * above is what makes that true -- so eight rows is several cohorts of
 * history, and `tests/unit/ui-simulation-events.test.ts` pins the cap by
 * driving more events than that through the translator rather than by
 * asserting the constant against itself.
 *
 * **The incident producers are the fastest thing on this channel, and the
 * arithmetic still lands inside the cap (#555).** Their pace is not a guess
 * either: `IncidentTriggerSystem` will not open a second incident of the same
 * kind in the same sector inside a quiet period, and those periods are
 * `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` 4,800 ticks for a riot and a
 * gang-retaliation, `..._AFTER_ASSAULT` 2,400 and `..._AFTER_ESCAPE_ATTEMPT`
 * 12,000. One sector is registered in a shipped session (ADR 0036), an in-game
 * day is 2,400 ticks, and every opening has at most one "all clear" after it,
 * so the ceiling is four kinds pacing themselves independently: 2 + 1 + 1 + 0.4
 * openings per two days, doubled, is about **nine rows per two in-game days**
 * at an absolute worst case where every kind fires on cooldown for ever.
 *
 * Measured play is far below that: issue #555's twelve-prisoner playtest saw
 * one incident every two in-game days, which is two rows -- one opening, one
 * all-clear -- per two days, alongside at most one payday row per day. Eight
 * rows is therefore about four days of a prison in trouble and much longer for
 * one that is not, which is the "scrolls back a little" the paragraph above
 * asks for. The reason it does not need to be larger is the band: an incident
 * the player must act on *now* is on the line above the list, not in it.
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
      const messages = eventParameterMessages(event);
      return {
        sequence: event.sequence,
        labelKey,
        severity,
        labelParameters: eventParameters(event),
        ...(messages === undefined ? {} : { labelParameterMessages: messages }),
      };
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
  const messages = eventParameterMessages(event);
  return {
    // The event's own ordinal, so every event is its own row rather than
    // rewriting the previous one -- the opposite of what a refusal's ordinal
    // buys, and for the opposite reason: a refusal is republished unchanged on
    // a cadence and must update in place, while each event is published once
    // and is a new fact.
    id: `${EVENT_ROW_PREFIX}${event.sequence}`,
    labelKey,
    labelParameters: eventParameters(event),
    ...(messages === undefined ? {} : { labelParameterMessages: messages }),
    severity,
  };
}

/**
 * The numbers the sentence needs, keyed by the placeholder its message uses.
 *
 * `switch` over the discriminant rather than an index into a table, because
 * the members carry *different* figures -- a count of people, a sum of money,
 * a count of rioters, and for four of them nothing at all -- and a shared
 * `magnitude` field would have been a name that means several things, which is
 * the shape `src/simulation/protocol/types.ts` refuses for `refusal` inside
 * `counts`. Exhaustive over the union, so a further event type does not
 * compile until its parameters are decided.
 *
 * **This said "the two members" and "a third event type"**, which was true of
 * the two #507 shipped and stopped being true when #555 added five. The
 * sentence is corrected rather than the tally re-typed, because a tally is the
 * part that rots: see `docs/AGENT_WORKFLOW.md` section 4.
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
    case 'incidents.riot-opened':
      return { count: event.participantCount };
    // Both of this one's parameters are messages rather than figures, so they
    // are resolved at render time by `eventParameterMessages` below. Nothing
    // is substituted from here.
    case 'prisoners.relocated':
      return {};
    // Four members with nothing to substitute, and an empty object rather than
    // `undefined`: a `switch` that sometimes returned nothing would make an
    // absent `labelParameters` mean two different things at the two call
    // sites. Why none of these four carries a figure -- an assault is always
    // two prisoners, an escape attempt always one, a retaliation's count has
    // no plural rule to render it with, and "all clear" is the absence of one
    // -- is argued in the schemas in `src/simulation/protocol/types.ts`.
    // The escape's own sentence carries `{name}`, which is a message rather
    // than a figure and is supplied by `eventParameterMessages` below --
    // exactly as the relocation notice's two are, and for the same reason.
    case 'incidents.escape-succeeded':
      return {};
    case 'incidents.gang-retaliation-opened':
    case 'incidents.assault-opened':
    case 'incidents.escape-attempt-opened':
    case 'incidents.all-clear':
      return {};
  }
}

/**
 * The parameters whose value is another message, keyed by the placeholder its
 * sentence uses.
 *
 * The counterpart of `eventParameters` for text a localizer has to produce,
 * and the reason both exist is that `MessageParameters` cannot carry a
 * *deferred* translation. See `HudMessageParameterViewModel` for why the view
 * model must not carry the finished text instead.
 *
 * **A `switch` over the discriminant rather than an early return, and that is
 * the correction #683 paid for.** This opened with
 * `if (event.type !== 'prisoners.relocated') return undefined;` while the
 * relocation notice was the only member with a message-valued parameter. The
 * research that settled #683's plumbing
 * (`docs/research/2026-08-30-what-an-escape-says.md`) enumerated the sites a
 * new event type forces -- `EVENT_PRESENTATION` above, `eventParameters`
 * above, and the test fixture's `SAMPLE` -- and named this one as the site the
 * compiler does **not** force: an event whose sentence carries `{name}` and
 * whose branch nobody added here renders the literal placeholder, because
 * `interpolate` deliberately leaves an unsubstituted one visible. It was
 * handed over rather than fixed, on the reasoning that the change authoring
 * such a sentence is the change that should close it. This is that change.
 *
 * The `switch` is the readable half; the `default` branch is the half that
 * actually forces the next decision, and it says at its own site why the
 * `switch` alone does not. The measurement that the fix is real rather than
 * stylistic: `tests/unit/ui-simulation-events.test.ts` asserts no rendered
 * sentence contains `{`, for every type at once, and was watched failing on
 * `incidents.escape-succeeded` before either half existed.
 *
 * **Two members have message-valued parameters.** ADR 0076's relocation notice
 * has two, message-valued for different reasons:
 *
 * - **`{room}`** is a room type, and `roomNameKey` is the catalog's own
 *   `nameKey` -- the same field `PrisonerRoomRefViewModel` already carries to
 *   the roster panel. This module resolves nothing and authors nothing; it
 *   passes the key through to the renderer.
 * - **`{name}`** is a person, and the two halves cross the wire as state
 *   (ADR 0015: a name is never translated and is identical in every locale)
 *   while the *order* they are read in is a locale decision. That decision is
 *   already made once, in `hud.regime.roster-name`, and this reuses it rather
 *   than authoring a second one: two keys spelling "{given} {family}" would be
 *   two answers to one question, and the second locale to disagree with
 *   English would find only one of them.
 *
 * #683's escape notice has one, and it is the second bullet's `{name}` again
 * rather than a third kind of thing: the same halves, the same
 * `hud.regime.roster-name`, shared through `prisonerName` below so the two
 * cannot drift about the fallback. What differs is only the subject's fate --
 * this one is gone. Nothing here looks anybody up, both halves being in the
 * payload, so a departed entity id costs the sentence nothing; see the schema
 * in `src/simulation/protocol/types.ts` for why naming them is nonetheless a
 * narrowing of a rule rather than a free extension of one.
 *
 * A prisoner with no name falls back to `hud.regime.roster-unnamed` --
 * "Prisoner 3" -- which is exactly what `formatPrisonerName` does for a roster
 * row, and is why neither sentence goes silent for a session wired without an
 * identity registry. **No key here is new copy.** The only strings these two
 * changes author are the two sentences the owner approved.
 */
function eventParameterMessages(
  event: SimulationEvent,
): Readonly<Record<string, HudMessageParameterViewModel>> | undefined {
  switch (event.type) {
    case 'prisoners.relocated':
      return { name: prisonerName(event.entityId, event.name), room: { key: event.roomNameKey } };
    case 'incidents.escape-succeeded':
      return { name: prisonerName(event.entityId, event.name) };
    // Every sentence whose parameters are figures or nothing at all.
    // `eventParameters` above is where those are decided; they are listed
    // one by one rather than left to the `default` so that the decision is
    // visible for each, and so the `default` below is reached only by a type
    // nobody has considered.
    case 'economy.wages-unpaid':
    case 'prisoners.discharged':
    case 'incidents.riot-opened':
    case 'incidents.gang-retaliation-opened':
    case 'incidents.assault-opened':
    case 'incidents.escape-attempt-opened':
    case 'incidents.all-clear':
      return undefined;
    default: {
      // **This branch is the exhaustiveness, and it is here because the
      // obvious version does not work.** `eventParameters` above needs no
      // `default`: it returns an object, so a missing case makes the function
      // fall off the end and TypeScript rejects it with TS2366. This one may
      // legitimately return `undefined`, so falling off the end is *valid* --
      // a new event type would silently take the `undefined` branch and its
      // `{name}` would reach a player as the literal placeholder. Measured
      // rather than assumed: with the `incidents.escape-succeeded` case
      // deleted and no `default`, `tsc -b` exits 0.
      //
      // `never` is what restores the guarantee, in the idiom
      // `SessionController` uses for snapshot refusal reasons. The throw is
      // unreachable while the union and this `switch` agree, which is the
      // point of it.
      const unhandled: never = event;
      throw new Error(`Unhandled simulation event: ${JSON.stringify(unhandled)}.`);
    }
  }
}

/**
 * One prisoner, as the sentence around them needs to read them.
 *
 * Shared by the two members that name somebody rather than duplicated into
 * both, because the fallback is the part that would drift: a second copy that
 * dropped the notice for an unnamed prisoner, or named them some other way,
 * would be a second answer to a question `formatPrisonerName` already
 * answered once for the roster.
 */
function prisonerName(
  entityId: number,
  name: { readonly givenName: string; readonly familyName: string } | undefined,
): HudMessageParameterViewModel {
  return name === undefined
    ? { key: HUD_MESSAGE_KEY.regimeRosterUnnamed, parameters: { id: entityId } }
    : { key: HUD_MESSAGE_KEY.regimeRosterName, parameters: { given: name.givenName, family: name.familyName } };
}
