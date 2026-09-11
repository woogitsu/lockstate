import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import {
  SIMULATION_EVENT_TYPES,
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import {
  MAX_EVENT_ALERT_ROWS,
  alertRowDismissal,
  hudAlertsWithoutRow,
  hudEventAlertsFromWorkerMessage,
  hudEventNoticeFromWorkerMessage,
} from '../../src/ui/simulation-events';
import type { HudAlertViewModel } from '../../src/ui/hud/view-model';
import { resolveHudLabelParameters } from '../../src/ui/hud/label-parameters';

/**
 * The main thread's event translation: the channel that gave `HudSeverity`'s
 * `'info'` its first producer (issue #507).
 *
 * `'info'` had been a member of that union since it was declared and was
 * assigned nowhere in `src/`, because `src/ui/simulation-alerts.ts` builds
 * every row it can produce from a `RefusalReason` or a `ProtocolFaultCode` --
 * so the only things it can say are `'warning'` and
 * `recoverable ? 'warning' : 'danger'`. The prison could report what went
 * wrong and nothing else.
 *
 * The same two properties `ui-simulation-alerts.test.ts` holds apply here and
 * pull in opposite directions, so both are asserted:
 *
 * 1. **No text crosses the boundary** (ADR 0011). What arrives is a typed
 *    event; what leaves is a message key.
 * 2. **Every key resolves.** A key is just a string, so a typo type-checks,
 *    passes every schema and reaches a player as its own dotted self --
 *    and `tests/foundation/localization-key-completeness.test.ts` cannot see
 *    these, because they are `Record` values rather than `labelKey:` fields.
 */

/** Every event type, with a payload that satisfies its own member of the union. */
const SAMPLE: { readonly [K in SimulationEvent['type']]: (sequence: number) => Extract<SimulationEvent, { type: K }> } = {
  // `contraband.weapon.name` written out as a literal, because the point of
  // #703 ruling 13 is the *loudest* item taking the ordinary band: a sample
  // built from `defaultContrabandRegistry` would supply both sides of the
  // comparison (`docs/TESTING.md`).
  'contraband.discovered': (sequence) => ({ sequence, tick: 100, type: 'contraband.discovered', categoryNameKey: 'contraband.weapon.name' }),
  // #749's five. Four carry nothing at all -- the owner's ruling declines both
  // the refund amount `ConstructionSystem.cancelOrder` cannot answer and the
  // transaction size `undo` deliberately does not surface -- so the sample is
  // the envelope and the discriminant.
  'construction.order-cancelled': (sequence) => ({ sequence, tick: 100, type: 'construction.order-cancelled' }),
  'construction.order-cancelled-underway': (sequence) => ({ sequence, tick: 100, type: 'construction.order-cancelled-underway' }),
  // ADR 0104 option 2 (#956): the press found a transaction and declined it,
  // because the player's latest action was not a change to the build queue.
  // Carries nothing, for the same #749 ruling the four above carry nothing.
  'construction.undo-refused-newer-action': (sequence) => ({
    sequence,
    tick: 100,
    type: 'construction.undo-refused-newer-action',
  }),
  'construction.undone': (sequence) => ({ sequence, tick: 100, type: 'construction.undone' }),
  'construction.undone-spend-destroyed': (sequence) => ({
    sequence,
    tick: 100,
    type: 'construction.undone-spend-destroyed',
  }),
  'construction.redone': (sequence) => ({ sequence, tick: 100, type: 'construction.redone' }),
  'objects.removed-spend-destroyed': (sequence) => ({
    sequence,
    tick: 100,
    type: 'objects.removed-spend-destroyed',
  }),
  'economy.delivery-cancelled': (sequence) => ({ sequence, tick: 100, type: 'economy.delivery-cancelled', refundedMinorUnits: 1250 }),
  'economy.wages-unpaid': (sequence) => ({ sequence, tick: 100, type: 'economy.wages-unpaid', unpaidWagesMinorUnits: 360 }),
  'economy.deliveries-refused': (sequence) => ({ sequence, tick: 100, type: 'economy.deliveries-refused' }),
  'economy.construction-refused': (sequence) => ({ sequence, tick: 100, type: 'economy.construction-refused' }),
  // #966 site 1's recovery mirror of the two crossings above.
  'economy.deliveries-restored': (sequence) => ({ sequence, tick: 100, type: 'economy.deliveries-restored' }),
  'economy.construction-restored': (sequence) => ({ sequence, tick: 100, type: 'economy.construction-restored' }),
  'prisoners.discharged': (sequence) => ({ sequence, tick: 100, type: 'prisoners.discharged', count: 2 }),
  'incidents.riot-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.riot-opened', participantCount: 12 }),
  'incidents.assault-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.assault-opened' }),
  'incidents.escape-attempt-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.escape-attempt-opened' }),
  'incidents.escape-succeeded': (sequence) => ({
    sequence,
    tick: 100,
    type: 'incidents.escape-succeeded',
    entityId: 3,
    name: { givenName: 'Ada', familyName: 'Bell' },
  }),
  'incidents.gang-retaliation-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.gang-retaliation-opened' }),
  'incidents.all-clear': (sequence) => ({ sequence, tick: 100, type: 'incidents.all-clear' }),
  'incidents.all-clear-after-lapse': (sequence) => ({ sequence, tick: 100, type: 'incidents.all-clear-after-lapse' }),
  'prisoners.relocated': (sequence) => ({
    sequence,
    tick: 100,
    type: 'prisoners.relocated',
    entityId: 3,
    name: { givenName: 'Ada', familyName: 'Bell' },
    roomNameKey: 'room.cell.name',
  }),
  // #966 site 3's housing mirror of `prisoners.relocated` above.
  'prisoners.housed': (sequence) => ({
    sequence,
    tick: 100,
    type: 'prisoners.housed',
    entityId: 3,
    name: { givenName: 'Ada', familyName: 'Bell' },
    roomNameKey: 'room.cell.name',
  }),
  // #966 site 2's acknowledgement. `room.yard.name` and not the
  // `room.cell.name` above it, so the two members carrying a `{room}` cannot
  // agree by accident about which key a renderer resolved -- and the yard is
  // the one room type that authors no object requirement, which is the room a
  // sentence promising *function* would have been true of and false for the
  // other seventeen.
  'rooms.needs-cleared': (sequence) => ({ sequence, tick: 100, type: 'rooms.needs-cleared', roomNameKey: 'room.yard.name' }),
  'rooms.unzoned': (sequence) => ({ sequence, tick: 100, type: 'rooms.unzoned', roomNameKey: 'room.yard.name' }),
  'rooms.zoned': (sequence) => ({ sequence, tick: 100, type: 'rooms.zoned', roomNameKey: 'room.yard.name' }),
};

/**
 * A real `simulation/event`, parsed by the protocol schema rather than
 * hand-shaped, so a payload the boundary would reject cannot reach an
 * assertion here.
 */
function publication(event: SimulationEvent): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000507',
    kind: 'simulation/event',
    payload: { tick: event.tick + 1, event },
  }) as WorkerToMainMessage;
}

function stopped(): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-00000000dead',
    replyTo: '00000000-0000-4000-8000-00000000beef',
    kind: 'simulation/stopped',
    payload: { tick: 900, reason: 'shutdown-requested' },
  }) as WorkerToMainMessage;
}

/**
 * The one surface every event on this channel reaches, and therefore the one a
 * sweep over the whole union can be driven from.
 *
 * **Introduced on 2026-09-05.** These sweeps used to read
 * `hudEventNoticeFromWorkerMessage` and throw on `undefined`, which was exact
 * while every event raised the band. The owner's ruling of that date sends
 * `rooms.zoned` to the log and not to the band, so reading the band would have
 * made the sweep skip -- or fail on -- the newest member, and the sentence it
 * skipped is the one a player reads. Reading the log instead keeps the sweep
 * total: `eventAlertRow` and `hudEventNoticeFromWorkerMessage` build their
 * label, parameters and severity from the same table and the same two
 * functions, so nothing about the sentence goes unchecked by the move, and one
 * more member is now checked than before.
 */
function loggedRow(event: SimulationEvent): HudAlertViewModel {
  const rows = hudEventAlertsFromWorkerMessage(publication(event), []);
  const row = rows?.at(-1);
  if (row === undefined) throw new Error(`${event.type} produced no row in the alerts log`);
  return row;
}

describe('what the prison says when nothing went wrong', () => {
  it('gives every event type a sentence a player can actually read', () => {
    const missing: string[] = [];
    const localizer = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
    });

    // Driven off the protocol's own vocabulary rather than a list written
    // here, so an event type added to the union and forgotten here fails
    // rather than going unchecked.
    for (const type of SIMULATION_EVENT_TYPES) {
      const row = loggedRow(SAMPLE[type](1));
      // Through `resolveHudLabelParameters`, which is what `hud.ts` renders
      // with: since ADR 0076's relocation notice a sentence's parameters are
      // not all plain values, and formatting from `labelParameters` alone
      // would leave `{name}` and `{room}` on screen while this test passed.
      const sentence = localizer.format(
        row.labelKey,
        resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), row),
      );
      expect(sentence, `${type} reaches the player as its own key`).not.toContain('hud.alert.event');
      expect(sentence.trim().length, `${type} says nothing at all`).toBeGreaterThan(0);
      // **The one assertion in this loop that is not about the catalog, and
      // the one that guards a path the compiler does not.** `EVENT_PRESENTATION`,
      // `eventParameters` and `SAMPLE` above all fail to compile for an event
      // type nobody has decided about; `eventParameterMessages` opened with an
      // early return on a single type, so a sentence carrying `{name}` whose
      // branch nobody added rendered the literal placeholder -- and the two
      // assertions above passed on it, because "{name} broke out" contains
      // neither `hud.alert.event` nor nothing at all. `interpolate`
      // (`src/services/localization/format.ts`) deliberately leaves an
      // unsubstituted placeholder visible, so this is what a player would
      // actually read. Asserted for **every** type rather than for the one
      // that provoked it (#683), which is the half `not.toContain('{')` in the
      // ADR 0076 test below could not do.
      expect(sentence, `${type} leaves a placeholder on screen`).not.toContain('{');
    }
    expect(missing, 'every event key must be in the catalog that ships').toEqual([]);
  });

  it('names a prisoner the prison never named by their entity id, rather than saying nothing (ADR 0076)', () => {
    /*
     * The relocation notice's `name` is optional on the wire, exactly as
     * `PrisonerRosterRowViewModel.name` is, and for the same reason: a session
     * wired without an identity registry mints nobody. No path in `src/` can
     * produce that -- `createNewSimulationRuntime` always wires one -- which is
     * why this is pinned here rather than in
     * `tests/integration/relocation-notice-loop.test.ts`.
     *
     * The fallback reuses `hud.regime.roster-unnamed`, which is what
     * `formatPrisonerName` shows for an unnamed roster row. **No new copy is
     * authored for it**, and the alternative -- dropping the notice -- is the
     * silence issue #629 outlaws.
     */
    const anonymous = { ...SAMPLE['prisoners.relocated'](1) } as Record<string, unknown>;
    delete anonymous['name'];
    const notice = hudEventNoticeFromWorkerMessage(publication(anonymous as never));
    if (notice === undefined || notice === 'none') throw new Error('an unnamed prisoner still moved');
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentence = localizer.format(
      notice.labelKey,
      resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), notice),
    );
    expect(sentence).toBe('Prisoner 3 had nowhere to sleep and moved to Cell.');
    expect(sentence, 'and no placeholder survives the fallback').not.toContain('{');
  });

  /**
   * The housing mirror of the case above, for `prisoners.housed`
   * ([#966](https://github.com/matmaxalez/lockstate/issues/966) site 3) --
   * same optional `name`, same fallback, same reason: a session wired without
   * an identity registry mints nobody, and `createIntakeHousedNotice` never
   * invents one.
   */
  it('names a newly housed prisoner by their entity id when nobody minted a name (#966)', () => {
    const anonymous = { ...SAMPLE['prisoners.housed'](1) } as Record<string, unknown>;
    delete anonymous['name'];
    const notice = hudEventNoticeFromWorkerMessage(publication(anonymous as never));
    if (notice === undefined || notice === 'none') throw new Error('an unnamed prisoner was still housed');
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentence = localizer.format(
      notice.labelKey,
      resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), notice),
    );
    expect(sentence).toBe('Prisoner 3 finally has a place in Cell.');
    expect(sentence, 'and no placeholder survives the fallback').not.toContain('{');
  });

  /**
   * The exact sentences `EVENT_PRESENTATION`'s two new members back
   * ([#966](https://github.com/matmaxalez/lockstate/issues/966) site 1),
   * pinned word for word for the reason the designation sentence above is:
   * under `AGENTS.md` reservation 4 the wording is ours and its truth is not,
   * so every clause is a claim to prove rather than a string to skim past.
   */
  it('names which rung recovered, and claims nothing about what a purchase would now cost (#966)', () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentenceFor = (type: 'economy.deliveries-restored' | 'economy.construction-restored'): string => {
      const notice = hudEventNoticeFromWorkerMessage(publication(SAMPLE[type](1)));
      if (notice === undefined || notice === 'none') throw new Error(`${type} produced no notice`);
      return localizer.format(
        notice.labelKey,
        resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), notice),
      );
    };

    expect(sentenceFor('economy.deliveries-restored')).toBe('The treasury has climbed back above the deliveries floor.');
    expect(sentenceFor('economy.construction-restored')).toBe('The treasury has climbed back above the construction floor.');
  });

  /**
   * **The first sentence this game says when a player gets something right**
   * (issue [#966](https://github.com/matmaxalez/lockstate/issues/966) site 2).
   *
   * The sweep at the top of this file already proves it resolves and leaves no
   * `{` behind, which a row reading *"Cell designated."* and a row reading
   * *"Cell designated — prisoners can use it now."* both satisfy identically.
   * What is pinned here is the sentence **word for word**, because under
   * `AGENTS.md` reservation 4's release of 2026-09-04 the wording is ours and
   * its *truth* is not, and every clause of it is a claim about code:
   *
   * - **`{room}` is the type the press named**, resolved from the key the
   *   event carried rather than from a word anybody wrote here -- which is why
   *   both types are formatted and why the sample carries the yard.
   * - **"designated" and nothing further.** The accepted outcome also holds the
   *   rectangle, the anchor tile and an `enclosure` reading, and a sentence
   *   mentioning any of them would claim more than the world has confirmed: a
   *   `'sealed'` perimeter is #938's trap (identical for a reachable room and a
   *   doorless one), and a registered instance has `residentCapacity: 0` until
   *   an object stands in it.
   *
   * So this is a `toBe` rather than a `toContain`: any clause added to that
   * sentence is a claim that has to be proved here first.
   */
  it('says which type was designated, and claims nothing further (#966)', () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentenceFor = (roomNameKey: string): string => {
      // Off the alerts row and not the band notice, since 2026-09-05 the band
      // is not where this sentence goes -- see `loggedRow` above.
      const row = loggedRow({ sequence: 1, tick: 100, type: 'rooms.zoned', roomNameKey });
      return localizer.format(
        row.labelKey,
        resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), row),
      );
    };

    expect(sentenceFor('room.cell.name')).toBe('Cell designated.');
    // The room type whose designation is complete on the tick it is created --
    // `room.yard` authors no `object` requirement -- and still the same
    // sentence, because "designated" is all either of them has earned.
    expect(sentenceFor('room.yard.name')).toBe('Yard designated.');
  });

  /**
   * **Where each sentence goes, decided per event type** (issue #966 site 2,
   * and the owner's ruling of 2026-09-05).
   *
   * This channel paints two surfaces -- the alerts list, which is the log, and
   * `.hud__event`, the one line laid out at every viewport -- and until that
   * ruling every event reached both by construction. The ruling sends the
   * acknowledgement of a designation to the log **only**, so the routing is now
   * a decision somebody has to take per member, and this is where it is
   * checked.
   *
   * **Exhaustive, and the list of exceptions is written here rather than read
   * from the code under test.** `LOG_ONLY` is this file's own statement of the
   * ruling; every other member of `SIMULATION_EVENT_TYPES` must produce a
   * notice. So a member added to the union and quietly given `'log-only'` fails
   * here, and so does `rooms.zoned` being put back on the band.
   *
   * `rooms.needs-cleared` and `rooms.unzoned` joined `rooms.zoned` here under
   * issue #1006, for the same reason stated at their own `EVENT_PRESENTATION`
   * entries: a repair or a removal the player already knows about belongs in
   * the record, not fighting for the band's one line.
   */
  it('sends the acknowledgement to the log alone and every other event to both surfaces (#966)', () => {
    const LOG_ONLY = new Set<SimulationEvent['type']>(['rooms.needs-cleared', 'rooms.unzoned', 'rooms.zoned']);

    for (const type of SIMULATION_EVENT_TYPES) {
      const notice = hudEventNoticeFromWorkerMessage(publication(SAMPLE[type](1)));
      if (LOG_ONLY.has(type)) {
        /*
         * **`undefined`, and `toBeUndefined` is what separates the two wrong
         * answers.** A notice would put the sentence back on the band, which is
         * the ruling reversed. `'none'` would be worse than the band ever was:
         * it means *there is no event*, and `src/main.ts` deletes
         * `HudViewModel.event` on it -- so designating a room would **empty**
         * the band and delete an escape-attempt sentence outright, rather than
         * merely displacing it. `undefined` is *this message says nothing about
         * the band*, and the field is left exactly as it was. Both wrong
         * answers fail this one assertion.
         */
        expect(notice, `${type} is log-only and must not reach the band`).toBeUndefined();
      } else {
        expect(notice, `${type} must still reach the band`).not.toBeUndefined();
        expect(notice, `${type} must not empty the band`).not.toBe('none');
      }
      // Either way it is in the log. The routing decides one surface, never
      // both, and an event that reached neither would be a silent event --
      // which is the defect the acknowledgement census (#960, #966) is about.
      expect(loggedRow(SAMPLE[type](1)).labelKey, `${type} must be in the log whatever the band does`).toBe(
        `hud.alert.event.${type}`,
      );
    }
  });

  /**
   * **The grade, pinned where the grade still bites: the list's cap** (issue
   * #966 site 2, the owner's ruling of 2026-09-05).
   *
   * **This case replaces one that pinned the grade on the band, and the reason
   * it is replaced rather than kept is the whole of the ruling.** That case
   * asserted that a `'warning'` acknowledgement would take the line from
   * `prisoners.relocated` and `admitToEventBand` would discard it. Every word
   * of it was a true description of `admitToEventBand` and none of it is a
   * description of this member any more: an event that never reaches the band
   * is never offered to that function, so the case would have passed for a
   * reason that had stopped existing.
   *
   * What still reads the grade is `SEVERITY_EVICTION_ORDER` at the cap, and it
   * is a claim a player can see: **a run of designations must give up its own
   * confirmations before it gives up a warning.** The unpaid payday goes in
   * first, so it is the oldest row in the list -- which is what makes the two
   * grades separable. At `'info'` the designations are evicted and the payday
   * survives; at `'warning'` they tie with it, the age rule breaks the tie, and
   * the payday -- the oldest of the band -- is the row that goes.
   *
   * **Different room types on purpose.** `simulationEventIdentity` collapses
   * repeats of one statement into a single counted row, and the payload here is
   * the room type alone, so eight designations of a cell are one row and could
   * never reach the cap. A player working through a prison designates a cell,
   * a yard, a canteen -- that is the run this measures, and it is the only
   * shape in which an acknowledgement can crowd the list at all.
   */
  it('gives up its own confirmations before it gives up a warning (#966)', () => {
    // Real catalogue keys, and more of them than the cap, so the list is
    // genuinely over budget rather than exactly at it.
    const ROOM_NAME_KEYS = [
      'room.cell.name',
      'room.yard.name',
      'room.canteen.name',
      'room.kitchen.name',
      'room.holding-cell.name',
      'room.shower-room.name',
      'room.laundry.name',
      'room.infirmary.name',
      'room.classroom.name',
      'room.common-room.name',
      'room.storage-room.name',
      'room.staff-room.name',
    ] as const;
    expect(ROOM_NAME_KEYS.length, 'the run has to overflow the cap for the cap to choose anything').toBeGreaterThan(
      MAX_EVENT_ALERT_ROWS,
    );

    let rows: readonly HudAlertViewModel[] = [];
    rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['economy.wages-unpaid'](1)), rows) ?? rows;
    ROOM_NAME_KEYS.forEach((roomNameKey, index) => {
      rows =
        hudEventAlertsFromWorkerMessage(
          publication({ sequence: index + 2, tick: 100 + index, type: 'rooms.zoned', roomNameKey }),
          rows,
        ) ?? rows;
    });

    expect(rows.length, 'the cap still holds').toBe(MAX_EVENT_ALERT_ROWS);

    // The payday is the oldest row in the list and it is still there. This is
    // the assertion a `'warning'` acknowledgement fails.
    const payday = rows.find((row) => row.id === 'event-1');
    expect(payday, 'the unpaid payday outlives a dozen designations that arrived after it').toBeDefined();
    expect(payday?.severity, 'and it is there as the warning it is').toBe('warning');

    // And what went are the oldest designations, so the age rule still governs
    // inside the band the acknowledgement belongs to.
    const survivors = rows.map((row) => row.id);
    expect(survivors, 'the oldest designation is the one sacrificed').not.toContain('event-2');
    expect(survivors.at(-1), 'the newest row is always kept').toBe(`event-${String(ROOM_NAME_KEYS.length + 1)}`);
    expect(survivors[0], 'and position is preserved: the payday arrived first and is still drawn first').toBe(
      'event-1',
    );
  });

  it('carries a severity that says whether anything is wrong, which is the whole point of #507', () => {
    // A served sentence is good news. This is the assignment that makes
    // `'info'` a member with a producer rather than a member with a comment.
    expect(hudEventNoticeFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](1)))).toMatchObject({
      severity: 'info',
    });
    // An unpaid payday is not a refusal -- nobody asked for anything -- and not
    // `'danger'` either, because ADR 0049 made insolvency recoverable.
    expect(hudEventNoticeFromWorkerMessage(publication(SAMPLE['economy.wages-unpaid'](1)))).toMatchObject({
      severity: 'warning',
    });
  });

  /**
   * The grade of every incident event, and the line between the two bands
   * (issue #555).
   *
   * **Not a restatement of `EVENT_PRESENTATION`.** The claim being pinned is
   * the *shape* of the table rather than its entries: an incident that
   * can take the prison out of the player's hands is painted differently from
   * one that cannot, and the simulation decides which is which. `assault` is
   * the only kind capped below `IncidentResponsePolicy.lockdownSeverityThreshold`
   * -- `ASSAULT_SEVERITY_CEILING` is 5, deliberately one under 6 -- so it is
   * the only opening that is a warning, and a change that graded it alongside
   * the others, or split one of the others away from them, has to come here
   * and say so.
   */
  /**
   * **A weapon is not louder than a phone** -- the owner's ruling 13 of
   * 2026-08-31 on issue #703, in two halves: the row is `'warning'`, and *"a
   * weapon sits in the same band as any other item"*.
   *
   * The second half is the assertion worth having, and it is the one a reading
   * of `EVENT_PRESENTATION` alone would not force: that table keys on the event
   * `type`, and this event has exactly one type, so a future `danger` variant
   * for a weapon would have to arrive as a *second member* of the union and a
   * second sentence. What this case pins is that the band is a function of the
   * event and not of the item in it, driven through the two ends of the
   * catalog's authored severity range -- `contraband.weapon` is `severity: 9`
   * and `contraband.currency` is `2` -- so a change that graded them apart has
   * to come here and say so.
   *
   * The `'warning'` half is the `economy.wages-unpaid` reading one system over:
   * nobody pressed anything, and the state is already put right (the item is
   * confiscated before the event is recorded), so it is neither a refusal nor
   * the `'danger'` this table reserves for what a player cannot undo.
   */
  it('grades a found weapon exactly as it grades found currency (#703 ruling 13)', () => {
    const severityOf = (categoryNameKey: string): string => {
      const notice = hudEventNoticeFromWorkerMessage(
        publication({ sequence: 1, tick: 100, type: 'contraband.discovered', categoryNameKey }),
      );
      if (notice === undefined || notice === 'none') throw new Error(`${categoryNameKey} produced no notice`);
      return notice.severity;
    };

    expect(severityOf('contraband.weapon.name')).toBe('warning');
    expect(severityOf('contraband.currency.name')).toBe('warning');
  });

  /**
   * The sentence, assembled the way `hud.ts` assembles it, with the found
   * item's own word in it (#703 ruling 13).
   *
   * Not covered by the sweep at the top of this file: that one asserts every
   * sentence resolves and leaves no `{` behind, which a row reading
   * "Contraband found: Weapon." and a row reading "Contraband found: Phone."
   * both satisfy identically. The claim here is that the *key the event
   * carried* is what got resolved -- a translator that ignored
   * `categoryNameKey` and hard-coded one word would pass the sweep and fail
   * this.
   *
   * The expected words are written out rather than read back off the catalog,
   * for the reason `docs/TESTING.md` gives: an expectation computed from the
   * code under test's own input holds for any implementation.
   */
  it('puts the found item`s own name in the sentence, not a fixed word (#703 ruling 13)', () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentenceFor = (categoryNameKey: string): string => {
      const notice = hudEventNoticeFromWorkerMessage(
        publication({ sequence: 1, tick: 100, type: 'contraband.discovered', categoryNameKey }),
      );
      if (notice === undefined || notice === 'none') throw new Error(`${categoryNameKey} produced no notice`);
      return localizer.format(
        notice.labelKey,
        resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), notice),
      );
    };

    expect(sentenceFor('contraband.weapon.name')).toBe('Contraband found: Weapon.');
    expect(sentenceFor('contraband.phone.name')).toBe('Contraband found: Phone.');
  });

  it('paints a fistfight and a riot differently, on the line the simulation already draws (#555)', () => {
    const severityOf = (type: keyof typeof SAMPLE): string => {
      const notice = hudEventNoticeFromWorkerMessage(publication(SAMPLE[type](1)));
      if (notice === undefined || notice === 'none') throw new Error(`${type} produced no notice`);
      return notice.severity;
    };

    // The three that keep the full 0-10 severity range and can therefore lock
    // a sector down. The riot is the strongest: `riot-regime.ts` overrides
    // what its participants do, so while it is open the HUD's own account of
    // the prisoners' day is not what is happening.
    expect(severityOf('incidents.riot-opened')).toBe('danger');
    expect(severityOf('incidents.escape-attempt-opened')).toBe('danger');
    expect(severityOf('incidents.gang-retaliation-opened')).toBe('danger');

    // The one that cannot, by construction.
    expect(severityOf('incidents.assault-opened')).toBe('warning');

    // And the sentence that ends them. Nothing on this channel is retracted,
    // so without an `'info'` counterpart the three rows above would leave the
    // band red over a prison that is calm again.
    expect(severityOf('incidents.all-clear')).toBe('info');
    /*
     * **And the lapse's closing row is a step louder** (issue #914's finding
     * 4). The two rows say the same thing about `openIncidentCount` and
     * different things about the prison: a containment injures nobody
     * (`IncidentResponseSystem`'s `'resolved'` branch writes
     * `injuredEntityIds: []`) and a lapse injures every participant, so
     * grading them the same is what let a prison with 114 prisoner-injuries
     * read like one with none. `'warning'` and not `'danger'`: nothing is
     * still running.
     */
    expect(severityOf('incidents.all-clear-after-lapse')).toBe('warning');

    /*
     * The one member about an outcome rather than an opening (#683), and the
     * only place in this suite that says which band it takes. The line the
     * test above draws is about severity and lockdown, and it does not decide
     * this one: an escape that succeeded has no severity left to weigh. It is
     * `'danger'` on the argument `EVENT_PRESENTATION` already made for the
     * *attempt* -- ADR 0061 decision 5 makes the failure a prisoner who is
     * gone, and nothing about that is recoverable -- which is more true of the
     * success than of the attempt. Grading it `'info'` beside the all-clear
     * would paint losing somebody as the loop working.
     */
    expect(severityOf('incidents.escape-succeeded')).toBe('danger');
  });

  it('puts the numbers the sentence needs where the sentence can reach them', () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const discharged = hudEventNoticeFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](1)));
    const unpaid = hudEventNoticeFromWorkerMessage(publication(SAMPLE['economy.wages-unpaid'](1)));
    if (discharged === undefined || discharged === 'none' || unpaid === undefined || unpaid === 'none') {
      throw new Error('both events must produce a notice');
    }
    // The figures are the event's own, and they reach the finished sentence --
    // an assertion on `labelParameters` alone would hold for a message that
    // never substituted them.
    expect(localizer.format(discharged.labelKey, discharged.labelParameters)).toContain('2');
    expect(localizer.format(unpaid.labelKey, unpaid.labelParameters)).toContain('360');

    /*
     * The riot's participant count is the only figure the incident events
     * carry, and it must reach the finished sentence too. The openings listed
     * below carry none, and each of their sentences must still be a whole
     * sentence rather than one with a hole where a placeholder went
     * unsubstituted -- which is what a `{count}` left in an unparameterised
     * message looks like.
     *
     * **`incidents.escape-succeeded` is deliberately not in that list**, and
     * the reason is the distinction this whole `it` is about: its `{name}` is
     * a *message-valued* parameter, so formatting from `labelParameters` alone
     * -- which is what this loop does on purpose -- leaves the placeholder
     * standing, correctly. The corresponding assertion for it goes through
     * `resolveHudLabelParameters` in the first test in this file, which makes
     * it for every event type at once.
     */
    const riot = hudEventNoticeFromWorkerMessage(publication(SAMPLE['incidents.riot-opened'](1)));
    if (riot === undefined || riot === 'none') throw new Error('a riot must produce a notice');
    expect(localizer.format(riot.labelKey, riot.labelParameters)).toContain('12');
    for (const type of ['incidents.assault-opened', 'incidents.escape-attempt-opened', 'incidents.gang-retaliation-opened', 'incidents.all-clear'] as const) {
      const notice = hudEventNoticeFromWorkerMessage(publication(SAMPLE[type](1)));
      if (notice === undefined || notice === 'none') throw new Error(`${type} must produce a notice`);
      expect(localizer.format(notice.labelKey, notice.labelParameters), `${type} must not leave a placeholder on screen`).not.toContain('{');
    }
  });
});

/**
 * What a control says when it **works** (issue
 * [#749](https://github.com/matmaxalez/lockstate/issues/749), the owner's
 * ruling of 2026-09-01).
 *
 * `docs/research/2026-09-01-what-act-six-never-reached.md` D2 measured four
 * controls that succeeded and said nothing: Cancel on a queued build order,
 * Cancel on a delivery, Undo and Redo. The only feedback was a row vanishing
 * from a fold that starts collapsed.
 *
 * The sweep at the top of this file already covers the property every event
 * shares -- the key resolves, the sentence is not empty, no placeholder
 * survives -- so what is asserted here is what is specific to these five and
 * what a change could get wrong while that sweep stayed green: **which of the
 * two cancellation sentences a state gets, that the delivery names the figure
 * it was handed rather than one written into the message, that neither history
 * sentence names a count, and the severity split.**
 *
 * The expected words are written out rather than read back off the catalog,
 * for the reason `docs/TESTING.md` gives: an expectation computed from the code
 * under test's own input holds for any implementation, including one that put
 * the loss sentence on the refund.
 */
describe('what a control says when it works (#749)', () => {
  const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
  const sentenceOf = (event: SimulationEvent): string => {
    const notice = hudEventNoticeFromWorkerMessage(publication(event));
    if (notice === undefined || notice === 'none') throw new Error(`${event.type} produced no notice`);
    return localizer.format(
      notice.labelKey,
      resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), notice),
    );
  };
  const severityOf = (event: SimulationEvent): string => {
    const notice = hudEventNoticeFromWorkerMessage(publication(event));
    if (notice === undefined || notice === 'none') throw new Error(`${event.type} produced no notice`);
    return notice.severity;
  };

  it('says two different things about a cancelled order, which is the whole of ruling 2', () => {
    /*
     * The owner split one sentence into two because the two outcomes differ:
     * before the crew started the money comes back, and after it ruling 20 of
     * 2026-08-31 destroys the materials on purpose. Their reasoning is
     * *"silence about a loss is the worst option"*.
     *
     * Asserted as two whole sentences and as their *difference*, because a
     * table that mapped both types onto one key would satisfy any assertion
     * made about either of them alone.
     */
    expect(sentenceOf(SAMPLE['construction.order-cancelled'](1))).toBe(
      'The order was cancelled — the money it cost is refunded.',
    );
    expect(sentenceOf(SAMPLE['construction.order-cancelled-underway'](1))).toBe(
      'The order was cancelled. Anything already spent past the point of no return stays spent.',
    );
    expect(
      sentenceOf(SAMPLE['construction.order-cancelled'](1)),
      'the two outcomes must not read the same',
    ).not.toBe(sentenceOf(SAMPLE['construction.order-cancelled-underway'](1)));
  });

  it('names the refund the delivery actually carried, not a figure written into the message', () => {
    /*
     * Ruling 3. Two different amounts through one sentence, because a message
     * with the number baked in would satisfy a single-value assertion -- the
     * same shape the contraband case above uses for `{item}`.
     */
    const refund = (refundedMinorUnits: number): string =>
      sentenceOf({ sequence: 1, tick: 100, type: 'economy.delivery-cancelled', refundedMinorUnits });

    expect(refund(1250)).toBe('The delivery was cancelled — 1250 back.');
    expect(refund(80)).toBe('The delivery was cancelled — 80 back.');
  });

  it('says the last change moved, and says no count, which is ruling 4', () => {
    /*
     * Undo and Redo each reverse a whole transaction, so a sentence naming one
     * order would be a small lie whenever a run of several was taken back. The
     * digit assertion is the one that would catch a later change plumbing
     * `redoTransaction.length` through and interpolating it: the sentence would
     * still resolve and still leave no `{` behind.
     */
    expect(sentenceOf(SAMPLE['construction.undone'](1))).toBe('The last change to the build queue was undone.');
    expect(sentenceOf(SAMPLE['construction.redone'](1))).toBe('The last change to the build queue was redone.');
    expect(sentenceOf(SAMPLE['construction.undone'](1)), 'no count').not.toMatch(/\d/);
    expect(sentenceOf(SAMPLE['construction.redone'](1)), 'no count').not.toMatch(/\d/);
  });

  it('says what an undo destroyed, in the sentence that says the undo happened (#927)', () => {
    /*
     * Issue [#927](https://github.com/matmaxalez/lockstate/issues/927): `Z` on a
     * finished wall takes the wall down, refunds nothing and destroys the
     * materials, and the only thing the game said was *"The last change to the
     * build queue was undone."* -- true, and not the part that mattered.
     *
     * **Asserted as a whole sentence and as its difference from the plain
     * undo**, the shape ruling 2's pair is asserted in above and for the same
     * reason: a presentation table mapping both types onto one key satisfies any
     * assertion made about either alone.
     *
     * **And asserted as containing the plain undo's own clause**, which is the
     * assertion that would catch the near-miss this fix was nearly built as:
     * reusing `order-cancelled-underway` on this channel would have said *"The
     * order was cancelled"* over a press that cancelled no single order and was
     * not the Cancel control. The player has to be told the change was undone
     * *and* what it cost, in one sentence, because the band shows one.
     */
    const destroyed = sentenceOf(SAMPLE['construction.undone-spend-destroyed'](1));

    expect(destroyed).toBe(
      'The last change to the build queue was undone — anything already spent past the point of no return stays spent.',
    );
    expect(destroyed, 'the two outcomes must not read the same').not.toBe(
      sentenceOf(SAMPLE['construction.undone'](1)),
    );
    expect(destroyed, 'it still says the undo happened').toContain('The last change to the build queue was undone');
    expect(destroyed, 'and it does not claim a control the player did not press').not.toContain('The order was cancelled');
    expect(destroyed, 'no count, which is ruling 4').not.toMatch(/\d/);
  });

  it('says a removed object took its cost with it, and does not call it an order (#945)', () => {
    /*
     * Issue [#945](https://github.com/matmaxalez/lockstate/issues/945): removing
     * a standing bed destroyed the 65 it cost -- `25,000 -> 24,935` on placement,
     * `24,935 -> 24,935` on removal -- and put **nothing** on screen. The band
     * was `hidden`, so it was an absence and not a collision, and it survived
     * #932 because a standing object reaches neither channel #932 fixed.
     *
     * **The two `not` assertions are the ones that fail against the near-miss
     * this fix was nearly built as.** The obvious cheap fix is to raise
     * `construction.order-cancelled-underway` from the removal branch, which
     * needs no new key at all -- and it would say *"The order was cancelled"*
     * over a press that cancelled no order: the order that built the bed is
     * still `'completed'` afterwards, which
     * `tests/integration/object-removal-loop.test.ts` asserts. The other
     * direction is just as wrong: it must not read as a refund, because the
     * whole finding is that a player cannot tell this press from one.
     *
     * **Asserted as a whole sentence, and as its difference from the refund
     * sentence it is deliberately shaped to mirror.** A presentation table
     * mapping two types onto one key satisfies any assertion made about either
     * alone, which is the reason #927's case above asserts the same way.
     */
    const removed = sentenceOf(SAMPLE['objects.removed-spend-destroyed'](1));

    expect(removed).toBe('The object was removed — the money it cost does not come back.');
    expect(removed, 'a standing object is not an order any more').not.toContain('The order was cancelled');
    expect(removed, 'and it must not read as a refund').not.toContain('refunded');
    expect(removed, 'the pair must not read the same').not.toBe(
      sentenceOf(SAMPLE['construction.order-cancelled'](1)),
    );
    expect(removed, 'no figure -- `PlacedObjectRegistry.remove` answers `boolean`').not.toMatch(/\d/);
  });

  it('paints the one that reports a loss differently from the three that do not', () => {
    /*
     * The band's severity is the only thing separating "you got your money
     * back" from "what the crew had used is gone", and the grade is argued in
     * `EVENT_PRESENTATION`'s docblock: read as *the player got what they asked
     * for* the in-progress cancellation is `'info'`; read as *this reports
     * value destroyed* it is not, and it is graded on the second reading
     * because painting the two outcomes in one colour would take back in the
     * tone what the owner's two sentences just distinguished.
     *
     * Not `'danger'`: that member means "stop trusting what you are looking
     * at", and a deliberate press is the opposite of that.
     */
    expect(severityOf(SAMPLE['construction.order-cancelled-underway'](1))).toBe('warning');
    expect(severityOf(SAMPLE['construction.order-cancelled'](1))).toBe('info');
    expect(severityOf(SAMPLE['construction.undone'](1))).toBe('info');
    expect(severityOf(SAMPLE['construction.redone'](1))).toBe('info');
    expect(severityOf(SAMPLE['economy.delivery-cancelled'](1))).toBe('info');
    // #927's row, graded by the same rule as the cancellation that reports a
    // loss: an undo that destroyed a finished order's materials is not the loop
    // working quietly, and `'info'` beside the plain undo would take back in
    // the tone what the second sentence exists to distinguish.
    expect(severityOf(SAMPLE['construction.undone-spend-destroyed'](1))).toBe('warning');
    // #945's row, graded by that same rule on a third route. Taking a standing
    // object away credits no treasury and fills no container, so it reports
    // value destroyed -- and `'info'` here would put the one press that
    // *destroys* money in the same colour as the two that give it back.
    expect(severityOf(SAMPLE['objects.removed-spend-destroyed'](1))).toBe('warning');
  });

  it('refuses a refund that is not a whole non-negative number of minor units', () => {
    /*
     * The one figure these five carry, and the boundary is the only thing
     * checking it: `recordDeliveryCancelled` guards the same way, but a command
     * handler is not the only conceivable producer and the schema is what makes
     * the sentence safe from any of them.
     *
     * `min(0)` rather than the `min(1)` every other figure on this channel
     * carries, and the difference is deliberate: elsewhere a zero means the
     * thing did not happen, and here the cancellation happened whatever the
     * delivery had cost.
     */
    const parseRefund = (refundedMinorUnits: unknown): boolean =>
      workerToMainMessageSchema.safeParse({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: '00000000-0000-4000-8000-000000000749',
        kind: 'simulation/event',
        payload: { tick: 101, event: { sequence: 1, tick: 100, type: 'economy.delivery-cancelled', refundedMinorUnits } },
      }).success;

    expect(parseRefund(1250)).toBe(true);
    expect(parseRefund(0), 'a delivery that cost nothing was still cancelled').toBe(true);
    expect(parseRefund(-1), 'a cancellation never takes money away').toBe(false);
    expect(parseRefund(12.5), 'minor units are whole').toBe(false);
    expect(parseRefund('1250')).toBe(false);
  });
});

/**
 * The wire's own refusal, which is what stands between a malformed
 * `categoryNameKey` and a player reading a dotted key inside an authored
 * sentence (#703 ruling 13).
 *
 * `SimulationEventLog.recordContrabandDiscovered` is deliberately unguarded --
 * its caller drops a category it cannot name, and a second copy of that rule in
 * the log is how the two would come to disagree -- so the schema is the only
 * check, and this is where it is pinned. Without this case the field could be
 * weakened to a bare `z.string()` and the whole suite would stay green: measured.
 *
 * `interpolate` and `resolveLocalizationKey` are why it matters rather than
 * being hygiene. Both deliberately render what they cannot resolve: a sentence
 * built from `''` or from `'not a key'` reaches the screen as
 * "Contraband found: not a key." with no error anywhere.
 */
describe('what the events boundary refuses', () => {
  const parse = (categoryNameKey: unknown): boolean =>
    workerToMainMessageSchema.safeParse({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: '00000000-0000-4000-8000-000000000703',
      kind: 'simulation/event',
      payload: { tick: 101, event: { sequence: 1, tick: 100, type: 'contraband.discovered', categoryNameKey } },
    }).success;

  it('takes a contraband category`s name key and refuses anything that is not one (#703 ruling 13)', () => {
    // The premise: a real catalog key crosses, so the cases below fail for
    // being malformed rather than for the member being unreachable.
    expect(parse('contraband.weapon.name')).toBe(true);

    expect(parse(''), 'an empty key renders as an empty word inside the sentence').toBe(false);
    expect(parse('not a key'), 'a space is not in an identifier, and this would reach the screen verbatim').toBe(false);
    expect(parse('.contraband.weapon.name'), 'an identifier starts with an alphanumeric').toBe(false);
    expect(parse(7), 'and it is a key, not a figure').toBe(false);
  });
});

/**
 * A discharge that says something **different** every time: `count` prisoners
 * left, on a tick of its own.
 *
 * `SAMPLE['prisoners.discharged']` is fixed at two prisoners on tick 100, so
 * every call to it renders the identical sentence -- which, since the owner's
 * decision 1 of 2026-09-01, is one row that counts them rather than several
 * rows. The tests below that are about *distinct* events therefore need
 * distinct events, and this is what makes them distinct in the way the game
 * does: a different figure in the sentence.
 */
function distinctDischarge(sequence: number): Extract<SimulationEvent, { type: 'prisoners.discharged' }> {
  return { sequence, tick: 100 + sequence, type: 'prisoners.discharged', count: sequence };
}

describe('the log beside the notice', () => {
  it('gives every event its own row rather than rewriting the last one', () => {
    const first = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(1)), []);
    const second = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(2)), first);
    // Two discharges are two things that happened, not one thing restated --
    // the opposite of a refusal, which is republished unchanged on a cadence
    // and must update in place.
    //
    // **The two events are now deliberately unequal, and that is the whole of
    // what the owner's decision 1 changed here.** This drove two publications
    // of `SAMPLE['prisoners.discharged']`, which are byte-identical apart from
    // the ordinal, and required two rows. Two *identical* sentences are now one
    // row saying so twice -- the case below -- while two discharges that
    // released a different number of people are still two things that
    // happened, which is what this test was always about.
    expect(second?.length).toBe(2);
    expect(new Set(second?.map((row) => row.id)).size).toBe(2);
  });

  it('leaves the other producer`s rows alone, in both directions', () => {
    // `simulation-alerts.ts` and this module are two producers of one list and
    // neither may erase the other. A standing protocol fault is the case that
    // matters: it is the row nothing else on this thread reads.
    const fault: HudAlertViewModel = { id: 'fault-invalid-message', labelKey: 'hud.alert.fault.invalid-message', severity: 'danger' };
    const withEvent = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(1)), [fault]);
    expect(withEvent).toContainEqual(fault);
    // And the fault stays *above* the events, so a fault that has been standing
    // all session does not sink out of sight under a run of discharges.
    expect(withEvent?.[0]).toEqual(fault);
  });

  it('does not move a row the player is already reading', () => {
    /*
     * The two producers of this list interleave on a cadence, and that is what
     * makes position stability a real property rather than a tidy one.
     * `hudAlertsFromWorkerMessage` re-appends the refusal row at the **end** of
     * the list on every `simulation/status-counts` publication -- up to twice a
     * second -- so if this function reorders the families against each other,
     * the refusal row oscillates between two positions twice a second for as
     * long as it stands.
     *
     * `simulation-alerts.ts` states the rule this holds it to, in
     * `replaceOrAppend`: "the position of a row the player is already reading
     * must not change under them". Issue #209 measured the same property from
     * the other side, and `ui-shell.spec.ts`'s "alerts list order" block keeps
     * that measurement.
     *
     * So: whatever order the caller hands in is the order that comes back,
     * with the new event appended. Asserted on ids rather than on lengths --
     * a length is exactly what a reordering preserves.
     */
    const fault: HudAlertViewModel = { id: 'fault-invalid-message', labelKey: 'hud.alert.fault.invalid-message', severity: 'danger' };
    const refusal: HudAlertViewModel = { id: 'refusal-7', labelKey: 'hud.alert.refusal.build.unowned-land', severity: 'warning' };

    const afterFirstEvent = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(1)), [fault]) ?? [];
    // What a status-counts publication then does: it keeps every non-refusal
    // row where it is and appends the refusal at the end.
    const afterCounts = [...afterFirstEvent, refusal];
    const afterSecondEvent = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(2)), afterCounts) ?? [];

    expect(
      afterSecondEvent.map((row) => row.id),
      'every row that was already in the list must still be in the position it was in, or the player is reading a list that shuffles under them twice a second',
    ).toEqual(['fault-invalid-message', 'event-1', 'refusal-7', 'event-2']);
  });

  it('stops growing, so a long session does not become a spam feed', () => {
    /*
     * The volume rule, driven rather than asserted against its own constant.
     * `expect(MAX_EVENT_ALERT_ROWS).toBe(8)` would hold for any implementation
     * that declared the number and never used it; this pushes more events
     * through the translator than the cap allows and asks what the player is
     * left looking at.
     */
    let rows: readonly HudAlertViewModel[] = [];
    const total = MAX_EVENT_ALERT_ROWS + 5;
    for (let sequence = 1; sequence <= total; sequence += 1) {
      rows = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(sequence)), rows) ?? rows;
    }
    expect(rows.length, 'the alerts list must not grow with the session').toBe(MAX_EVENT_ALERT_ROWS);
    // The newest are the ones kept: within one severity band the oldest is
    // dropped, because a log whose most recent entry had fallen off would be
    // showing stale news. Every row here is `'info'`, which is what makes this
    // a test of the age half of the rule rather than of the severity half --
    // the case below drives the other one.
    expect(rows.at(-1)?.id).toBe(`event-${String(total)}`);
    expect(rows[0]?.id).toBe(`event-${String(total - MAX_EVENT_ALERT_ROWS + 1)}`);
  });

  it('sacrifices the least severe row rather than the oldest one (#703 ruling 11)', () => {
    /*
     * The owner's ruling 11 of 2026-08-31, and the case the test above cannot
     * make: it drives one severity, so evict-oldest and evict-least-severe are
     * indistinguishable under it.
     *
     * **What the ruling is for, in the numbers that bought it.** In a
     * 289-resident prison the severity mix measured `danger` 14.5 %, `warning`
     * 0.3 %, `info` 85.3 % -- five rows in six are a discharge or an all-clear,
     * because the discharge rate is population / 52 an in-game day while the
     * incident producers are capped by their quiet periods. Under the old rule
     * an escape row survived a worst case of 1,340 ticks: **67 seconds at x1,
     * 17 at x4.** Under this one, 23,390.
     *
     * The list is driven with one `danger` row FIRST and then filled past the
     * cap with `info` rows, which is the shape that separates the two rules: the
     * escape is the oldest row in the list, so evict-oldest drops it and
     * evict-least-severe keeps it. Asserted as the surviving **set**, not as a
     * window, because the rule no longer produces a contiguous window.
     */
    let rows: readonly HudAlertViewModel[] = [];
    rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.escape-succeeded'](1)), rows) ?? rows;

    const total = MAX_EVENT_ALERT_ROWS + 5;
    for (let sequence = 2; sequence <= total; sequence += 1) {
      rows = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(sequence)), rows) ?? rows;
    }

    expect(rows.length, 'the cap still holds').toBe(MAX_EVENT_ALERT_ROWS);

    // The escape is the oldest row in the list and it is still there. This is
    // the assertion the old rule fails.
    const survivors = rows.map((row) => row.id);
    expect(survivors, 'the escape outlives twelve discharges that arrived after it').toContain('event-1');
    expect(rows.find((row) => row.id === 'event-1')?.severity).toBe('danger');

    // And the `info` rows that went are the oldest of their own band, so the
    // age rule still governs inside a band.
    expect(survivors, 'the oldest discharge is the one sacrificed').not.toContain('event-2');
    expect(survivors.at(-1), 'the newest row is always kept').toBe(`event-${String(total)}`);

    // **Position is preserved**, which is issue #209's property and the thing a
    // sort could easily have broken: the escape arrived first and is still
    // drawn first, and the survivors are in arrival order.
    expect(survivors[0]).toBe('event-1');
    const sequences = survivors.map((id) => Number(id.replace('event-', '')));
    expect(sequences, 'the surviving rows keep arrival order').toEqual([...sequences].sort((a, b) => a - b));
  });

  it('says nothing about a message that is not an event', () => {
    // The tri-state every translator here uses: `undefined` means leave the
    // field alone. Without it, a status-counts publication twice a second would
    // rebuild or empty the event rows.
    expect(hudEventAlertsFromWorkerMessage(stopped(), [])).toBeUndefined();
  });
});

describe('what clears an event', () => {
  it('does not withdraw one, because an event does not stop being true', () => {
    // A refusal is withdrawn when the same action later succeeds. There is no
    // equivalent here and this pins that there is none: a second, different
    // event does not remove the first.
    const first = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](1)), []);
    const second = hudEventAlertsFromWorkerMessage(publication(SAMPLE['economy.wages-unpaid'](2)), first);
    expect(second?.map((row) => row.severity)).toEqual(['info', 'warning']);
  });

  it('empties the band when the session ends, and says so as a state rather than an absence', () => {
    // `'none'` rather than `undefined`, for the reason the refusal band needs
    // the same distinction: `undefined` means this message said nothing about
    // an event, and collapsing the two would leave the band showing an event
    // from a session that had ended.
    expect(hudEventNoticeFromWorkerMessage(stopped())).toBe('none');
  });

  it('is replaced on the band by the newer event, while both stay in the log', () => {
    const older = hudEventNoticeFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](1)));
    const newer = hudEventNoticeFromWorkerMessage(publication(SAMPLE['economy.wages-unpaid'](2)));
    if (older === undefined || older === 'none' || newer === undefined || newer === 'none') {
      throw new Error('both must produce a notice');
    }
    // One line, so one sentence, and the newest is the one -- the rule the
    // refusal band already runs.
    expect(newer.sequence).toBeGreaterThan(older.sequence);
    expect(newer.labelKey).not.toBe(older.labelKey);
  });
});

/**
 * A `simulation/event` carrying a record a restored log kept, rather than
 * something the prison has just done (the owner's decision 4 of 2026-09-01).
 */
function restoredPublication(event: SimulationEvent): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000084',
    kind: 'simulation/event',
    payload: { tick: 4_000, event, restored: true },
  }) as WorkerToMainMessage;
}

function ready(): WorkerToMainMessage {
  return workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-0000000000aa',
    replyTo: '00000000-0000-4000-8000-0000000000bb',
    kind: 'simulation/ready',
    payload: { sessionId: 'session-1', tick: 0, clock: { mode: 'paused' } },
  }) as WorkerToMainMessage;
}

/** One in-game day, as `DAY_LENGTH_TICKS` has it. Written out rather than imported, so this fixture does not supply both sides of the day arithmetic it checks. */
const DAY_TICKS = 2_400;

describe('a sentence the prison says more than once (ADR 0084 decisions 1 and 2)', () => {
  it('counts the repeats on one row instead of filling the list with copies of itself', () => {
    /*
     * Issue #741's measurement, in the translator: by in-game day 7 the list
     * held "A fight has broken out between two prisoners." three times and the
     * all-clear three times, in an eight-row list, "with no tick, no in-game
     * time and no `×3`".
     *
     * The four incident-opening types are the ones that can repeat verbatim,
     * because they carry no payload at all (`types.ts`, ADR 0084 Finding 1),
     * so the assault is the case the player actually met.
     */
    let rows: readonly HudAlertViewModel[] = [];
    for (let sequence = 1; sequence <= 3; sequence += 1) {
      rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](sequence)), rows, DAY_TICKS) ?? rows;
    }

    expect(rows.length, 'three identical sentences are one row').toBe(1);
    expect(rows[0]?.occurrences?.count, 'and the row says how many times').toBe(3);
    // The row keeps the identity its first arrival earned, so the row the
    // player is reading does not become a different row under them.
    expect(rows[0]?.id).toBe('event-1');
    expect(rows[0]?.occurrences?.firstSequence).toBe(1);
    expect(rows[0]?.occurrences?.lastSequence).toBe(3);
  });

  it('does not collapse two sentences that differ by a figure', () => {
    // The rule is one rule over the whole union, and it fires on what the data
    // says rather than on which family the event belongs to: two discharges
    // that released a different number of people are two statements.
    let rows = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(1)), [], DAY_TICKS) ?? [];
    rows = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(2)), rows, DAY_TICKS) ?? rows;
    expect(rows.map((row) => row.occurrences?.count)).toEqual([1, 1]);
  });

  it('does not collapse two escapes by different prisoners', () => {
    // The safe direction of "identity is the payload, not the sentence": two
    // people got out, and one row saying so twice would claim the same person
    // did.
    const first: SimulationEvent = { sequence: 1, tick: 100, type: 'incidents.escape-succeeded', entityId: 3, name: { givenName: 'Ada', familyName: 'Bell' } };
    const second: SimulationEvent = { sequence: 2, tick: 200, type: 'incidents.escape-succeeded', entityId: 4, name: { givenName: 'Bo', familyName: 'Crane' } };
    let rows = hudEventAlertsFromWorkerMessage(publication(first), [], DAY_TICKS) ?? [];
    rows = hudEventAlertsFromWorkerMessage(publication(second), rows, DAY_TICKS) ?? rows;
    expect(rows.length).toBe(2);
  });

  it('says when the most recent of them happened, in the day the strip counts', () => {
    /*
     * Decision 2. The vocabulary is the game's own: a day and a position
     * within it, because nothing maps the tick budget onto a 24-hour dial
     * (`docs/HUD_PROJECTIONS.md` gap 5).
     *
     * Tick 2,400 is the first tick of day 2 and tick 3,600 is halfway through
     * it, computed here from the day length rather than read back off the
     * translator, so the assertion does not supply both sides.
     */
    const first: SimulationEvent = { sequence: 1, tick: 2_400, type: 'incidents.all-clear' };
    const again: SimulationEvent = { sequence: 2, tick: 3_600, type: 'incidents.all-clear' };
    let rows = hudEventAlertsFromWorkerMessage(publication(first), [], DAY_TICKS) ?? [];
    expect(rows[0]?.occurrences?.lastAt).toEqual({ day: 2, progressPercent: 0 });
    rows = hudEventAlertsFromWorkerMessage(publication(again), rows, DAY_TICKS) ?? rows;
    // The time moves with the newest arrival, which is what keeps a collapsed
    // row honest about being recent while it keeps its first arrival's place.
    expect(rows[0]?.occurrences?.lastAt).toEqual({ day: 2, progressPercent: 50 });
  });

  it('carries no time at all when no session has said how long a day is', () => {
    // `UNKNOWN_HUD_CLOCK` holds `dayLengthTicks: 0`, and a row built then must
    // not invent a day. Absent is the real state.
    const rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.all-clear'](1)), [], 0) ?? [];
    expect(rows[0]?.occurrences?.lastAt).toBeUndefined();
    expect(rows[0]?.occurrences?.count, 'the count does not depend on the clock').toBe(1);
  });

  it('ages a collapsed row by its newest arrival, so a recurring row is not evicted as the oldest', () => {
    /*
     * The interaction between decision 1 and ruling 11 of #703, and the reason
     * the eviction rule stopped reading the row's index.
     *
     * The all-clear arrives first, so it sits at index 0 for ever -- and then
     * recurs after every one of the discharges that fill the list past its
     * cap. Under the old age rule (position in the list) it is the oldest row
     * in its band and is the first `info` row evicted; under the new one it is
     * the newest thing in the band, because its last arrival is the last
     * ordinal issued.
     */
    let rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.all-clear'](1)), [], DAY_TICKS) ?? [];
    let sequence = 2;
    for (let filled = 0; filled < MAX_EVENT_ALERT_ROWS + 4; filled += 1) {
      rows = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(sequence)), rows, DAY_TICKS) ?? rows;
      sequence += 1;
      rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.all-clear'](sequence)), rows, DAY_TICKS) ?? rows;
      sequence += 1;
    }

    expect(rows.length, 'the cap still holds').toBe(MAX_EVENT_ALERT_ROWS);
    const allClear = rows.find((row) => row.id === 'event-1');
    expect(allClear, 'the row that keeps recurring is still there').toBeDefined();
    expect(allClear?.occurrences?.count).toBe(MAX_EVENT_ALERT_ROWS + 5);
    // And it is still first, because collapsing keeps a row where it was.
    expect(rows[0]?.id).toBe('event-1');
  });
});

describe('a row a player has read (ADR 0084 decision 3)', () => {
  it('names the whole run of arrivals it stands for, and nothing after them', () => {
    let rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](1)), [], DAY_TICKS) ?? [];
    rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](4)), rows, DAY_TICKS) ?? rows;
    expect(alertRowDismissal(rows, 'event-1')).toEqual({ fromSequence: 1, throughSequence: 4 });
  });

  it('cannot be asked of the other producer`s rows, which have their own un-taken decision (gap 34)', () => {
    const refusal: HudAlertViewModel = { id: 'refusal-7', labelKey: 'hud.alert.refusal.build.unowned-land', severity: 'warning' };
    const fault: HudAlertViewModel = { id: 'fault-invalid-message', labelKey: 'hud.alert.fault.invalid-message', severity: 'danger' };
    expect(alertRowDismissal([refusal, fault], 'refusal-7')).toBeUndefined();
    expect(alertRowDismissal([refusal, fault], 'fault-invalid-message')).toBeUndefined();
  });

  it('leaves the list without it, and leaves every other row exactly where it was', () => {
    const fault: HudAlertViewModel = { id: 'fault-invalid-message', labelKey: 'hud.alert.fault.invalid-message', severity: 'danger' };
    let rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](1)), [fault], DAY_TICKS) ?? [];
    rows = hudEventAlertsFromWorkerMessage(publication(distinctDischarge(2)), rows, DAY_TICKS) ?? rows;
    expect(hudAlertsWithoutRow(rows, 'event-1').map((row) => row.id)).toEqual(['fault-invalid-message', 'event-2']);
  });

  it('comes back as a new row counting from one when the same fact happens again', () => {
    // ADR 0084's recurrence question, answered: a dismissal is about the
    // arrivals the player had read, so a fourth fight after the third was
    // dismissed is a new row rather than the return of a dismissed one.
    let rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](1)), [], DAY_TICKS) ?? [];
    rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](2)), rows, DAY_TICKS) ?? rows;
    rows = hudAlertsWithoutRow(rows, 'event-1');
    rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](3)), rows, DAY_TICKS) ?? rows;
    expect(rows.map((row) => row.id)).toEqual(['event-3']);
    expect(rows[0]?.occurrences?.count).toBe(1);
  });
});

describe('a log that survived a reload (ADR 0084 decision 4)', () => {
  it('builds the same rows out of restored records as the live session had', () => {
    let live = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](1)), [], DAY_TICKS) ?? [];
    live = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](2)), live, DAY_TICKS) ?? live;

    let restored = hudEventAlertsFromWorkerMessage(ready(), [], DAY_TICKS) ?? [];
    restored = hudEventAlertsFromWorkerMessage(restoredPublication(SAMPLE['incidents.assault-opened'](1)), restored, DAY_TICKS) ?? restored;
    restored = hudEventAlertsFromWorkerMessage(restoredPublication(SAMPLE['incidents.assault-opened'](2)), restored, DAY_TICKS) ?? restored;

    expect(restored).toEqual(live);
  });

  it('does not announce a restored record on the band', () => {
    // The band says what just happened. A restored record happened on a tick
    // the player was not looking at, and `undefined` leaves the band alone
    // rather than emptying it.
    expect(hudEventNoticeFromWorkerMessage(restoredPublication(SAMPLE['incidents.assault-opened'](1)))).toBeUndefined();
  });

  it('starts the log again when a session is started or restored, without touching the other producer`s rows', () => {
    /*
     * The reason a restore can publish rows at all. Loading a prison inside a
     * page that already has one leaves the previous session's rows standing,
     * and a restored arrival that matched one of them would be counted twice
     * -- so the list a new session starts with is empty of *this* producer's
     * rows, exactly as `simulation/stopped` empties them at the other end.
     */
    const fault: HudAlertViewModel = { id: 'fault-invalid-message', labelKey: 'hud.alert.fault.invalid-message', severity: 'danger' };
    let rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](1)), [fault], DAY_TICKS) ?? [];
    expect(rows.length).toBe(2);
    rows = hudEventAlertsFromWorkerMessage(ready(), rows, DAY_TICKS) ?? rows;
    expect(rows.map((row) => row.id), 'the fault is not this producer`s to remove').toEqual(['fault-invalid-message']);
  });

  it('counts a restored run once rather than twice when a prison is loaded over a running one', () => {
    // The interaction the reset exists for, driven end to end: two assaults in
    // the session that was saved, the save loaded into the same page, and the
    // restored row must say two rather than four.
    let rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](1)), [], DAY_TICKS) ?? [];
    rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['incidents.assault-opened'](2)), rows, DAY_TICKS) ?? rows;
    rows = hudEventAlertsFromWorkerMessage(ready(), rows, DAY_TICKS) ?? rows;
    rows = hudEventAlertsFromWorkerMessage(restoredPublication(SAMPLE['incidents.assault-opened'](1)), rows, DAY_TICKS) ?? rows;
    rows = hudEventAlertsFromWorkerMessage(restoredPublication(SAMPLE['incidents.assault-opened'](2)), rows, DAY_TICKS) ?? rows;
    expect(rows.length).toBe(1);
    expect(rows[0]?.occurrences?.count).toBe(2);
  });
});
