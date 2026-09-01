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
  'construction.undone': (sequence) => ({ sequence, tick: 100, type: 'construction.undone' }),
  'construction.redone': (sequence) => ({ sequence, tick: 100, type: 'construction.redone' }),
  'economy.delivery-cancelled': (sequence) => ({ sequence, tick: 100, type: 'economy.delivery-cancelled', refundedMinorUnits: 1250 }),
  'economy.wages-unpaid': (sequence) => ({ sequence, tick: 100, type: 'economy.wages-unpaid', unpaidWagesMinorUnits: 360 }),
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
  'prisoners.relocated': (sequence) => ({
    sequence,
    tick: 100,
    type: 'prisoners.relocated',
    entityId: 3,
    name: { givenName: 'Ada', familyName: 'Bell' },
    roomNameKey: 'room.cell.name',
  }),
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
      // Through `resolveHudLabelParameters`, which is what `hud.ts` renders
      // with: since ADR 0076's relocation notice a sentence's parameters are
      // not all plain values, and formatting from `labelParameters` alone
      // would leave `{name}` and `{room}` on screen while this test passed.
      const sentence = localizer.format(
        notice.labelKey,
        resolveHudLabelParameters((key, parameters) => localizer.format(key, parameters), notice),
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
      rows = hudEventAlertsFromWorkerMessage(publication(SAMPLE['prisoners.discharged'](sequence)), rows) ?? rows;
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
