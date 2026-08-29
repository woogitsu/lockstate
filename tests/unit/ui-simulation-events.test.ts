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
  hudEventAlertsFromWorkerMessage,
  hudEventNoticeFromWorkerMessage,
} from '../../src/ui/simulation-events';
import type { HudAlertViewModel } from '../../src/ui/hud/view-model';

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
  'economy.wages-unpaid': (sequence) => ({ sequence, tick: 100, type: 'economy.wages-unpaid', unpaidWagesMinorUnits: 360 }),
  'prisoners.discharged': (sequence) => ({ sequence, tick: 100, type: 'prisoners.discharged', count: 2 }),
  'incidents.riot-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.riot-opened', participantCount: 12 }),
  'incidents.assault-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.assault-opened' }),
  'incidents.escape-attempt-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.escape-attempt-opened' }),
  'incidents.gang-retaliation-opened': (sequence) => ({ sequence, tick: 100, type: 'incidents.gang-retaliation-opened' }),
  'incidents.all-clear': (sequence) => ({ sequence, tick: 100, type: 'incidents.all-clear' }),
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
      const notice = hudEventNoticeFromWorkerMessage(publication(SAMPLE[type](1)));
      if (notice === undefined || notice === 'none') throw new Error(`${type} produced no notice`);
      const sentence = localizer.format(notice.labelKey, notice.labelParameters);
      expect(sentence, `${type} reaches the player as its own key`).not.toContain('hud.alert.event');
      expect(sentence.trim().length, `${type} says nothing at all`).toBeGreaterThan(0);
    }
    expect(missing, 'every event key must be in the catalog that ships').toEqual([]);
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
  });
});

describe('the log beside the notice', () => {
  it('gives every event its own row rather than rewriting the last one', () => {
    const first = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](1)), []);
    const second = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](2)), first);
    // Two discharges are two things that happened, not one thing restated --
    // the opposite of a refusal, which is republished unchanged on a cadence
    // and must update in place.
    expect(second?.length).toBe(2);
    expect(new Set(second?.map((row) => row.id)).size).toBe(2);
  });

  it('leaves the other producer`s rows alone, in both directions', () => {
    // `simulation-alerts.ts` and this module are two producers of one list and
    // neither may erase the other. A standing protocol fault is the case that
    // matters: it is the row nothing else on this thread reads.
    const fault: HudAlertViewModel = { id: 'fault-invalid-message', labelKey: 'hud.alert.fault.invalid-message', severity: 'danger' };
    const withEvent = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](1)), [fault]);
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

    const afterFirstEvent = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](1)), [fault]) ?? [];
    // What a status-counts publication then does: it keeps every non-refusal
    // row where it is and appends the refusal at the end.
    const afterCounts = [...afterFirstEvent, refusal];
    const afterSecondEvent = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](2)), afterCounts) ?? [];

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
      rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](sequence)), rows) ?? rows;
    }
    expect(rows.length, 'the alerts list must not grow with the session').toBe(MAX_EVENT_ALERT_ROWS);
    // The newest are the ones kept: the oldest is dropped, because a log whose
    // most recent entry had fallen off would be showing stale news.
    expect(rows.at(-1)?.id).toBe(`event-${String(total)}`);
    expect(rows[0]?.id).toBe(`event-${String(total - MAX_EVENT_ALERT_ROWS + 1)}`);
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
