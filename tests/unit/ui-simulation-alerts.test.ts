import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import {
  PROTOCOL_FAULT_CODES,
  REFUSAL_REASONS,
  SIMULATION_PROTOCOL_VERSION,
  type ProtocolFaultCode,
  type RefusalReason,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import { hudAlertsFromWorkerMessage, hudRefusalFromWorkerMessage } from '../../src/ui/simulation-alerts';

/**
 * The main thread's refusal translation: the alerts list's first producer.
 *
 * `HudViewModel.alerts` was fully implemented and browser-tested -- the list,
 * the severity badges, the folding section, the empty-state row and the
 * insertion ordering #209 measured -- and **nothing had ever populated it**.
 * `src/main.ts` wrote `clock` and `counts` into the view model and the only
 * other assignment anywhere in the repository was the literal `[]`, so a
 * refusal the simulation reported would have had nowhere to be painted even
 * if one had been sent (issue #261).
 *
 * Two properties matter here and they pull in opposite directions, which is
 * why both are asserted rather than one being assumed from the other:
 *
 * 1. **No text crosses the boundary** (ADR 0011). What arrives is a stable
 *    id; what leaves is a message key.
 * 2. **Every key resolves.** A key is just a string, so a typo type-checks,
 *    passes every schema and renders as its own dotted self on somebody's
 *    screen -- which is exactly the shipping state
 *    `tests/foundation/localization-key-completeness.test.ts` was written
 *    for, and that scanner cannot see these keys because they are `Record`
 *    values rather than `labelKey:` fields.
 */

const COUNTS = {
  prisoners: 0,
  prisonersInIntake: 0,
  prisonersHighRisk: 0,
  staff: 0,
  staffUnassigned: 0,
  rooms: 0,
  roomCapacity: 0,
  roomOccupants: 0,
  activeIncidents: 0,
  contrabandDiscovered: 0,
  treasuryMinorUnits: 25_000,
} as const;

function publication(refusal?: { sequence: number; tick: number; reason: RefusalReason }): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-1',
    kind: 'simulation/status-counts',
    payload: {
      tick: 1_234,
      schemaVersion: 1,
      counts: { ...COUNTS },
      ...(refusal === undefined ? {} : { refusal }),
    },
  } as WorkerToMainMessage;
}

describe('a refusal the worker published becomes an alert row', () => {
  it('turns the refusal into one row carrying a message key and a severity', () => {
    expect(hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 12, reason: 'build.unowned-land' }))).toEqual([
      {
        id: 'refusal-1',
        labelKey: 'hud.alert.refusal.build.unowned-land',
        severity: 'warning',
      },
    ]);
  });

  it('reports an empty list, not "nothing to say", when the session has refused nothing', () => {
    // `[]` and `undefined` mean different things to `src/main.ts`: `[]` is a
    // statement that there are no alerts and clears a stale row, `undefined`
    // is "this message says nothing about alerts" and leaves the HUD alone.
    // A publication always carries the complete refusal state, so it is
    // always the former.
    expect(hudAlertsFromWorkerMessage(publication())).toEqual([]);
  });

  it('keeps the row identity while a refusal stands, and mints a new one when it changes', () => {
    // `HudAlertViewModel.id` exists so "a list update is not a full rebuild".
    // The channel republishes the same refusal beside every later count, so
    // an id derived from anything per-message -- the envelope's `messageId`,
    // its `tick` -- would rebuild the row the player is reading several times
    // a second.
    const first = hudAlertsFromWorkerMessage(publication({ sequence: 4, tick: 12, reason: 'build.out-of-bounds' }));
    const republished = hudAlertsFromWorkerMessage(publication({ sequence: 4, tick: 12, reason: 'build.out-of-bounds' }));
    expect(republished?.[0]?.id).toBe(first?.[0]?.id);

    const next = hudAlertsFromWorkerMessage(publication({ sequence: 5, tick: 90, reason: 'build.out-of-bounds' }));
    // Same reason, same sentence, different refusal: a new row rather than
    // the old one silently rewritten under the player.
    expect(next?.[0]?.id).not.toBe(first?.[0]?.id);
    expect(next?.[0]?.labelKey).toBe(first?.[0]?.labelKey);
  });

  it('empties the list when the session stops', () => {
    // A refusal by a simulation that no longer exists is not something the
    // player can act on -- the same reasoning that sends the counts back to
    // `EMPTY_HUD_VIEW_MODEL.counts` and the clock to `UNKNOWN_HUD_CLOCK`.
    expect(
      hudAlertsFromWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'stopped-1',
        replyTo: 'shutdown-1',
        kind: 'simulation/stopped',
        payload: { tick: 900, reason: 'shutdown-requested' },
      } as WorkerToMainMessage),
    ).toEqual([]);
  });

  it('says nothing about alerts for a message that is not about them', () => {
    expect(
      hudAlertsFromWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'clock-1',
        kind: 'simulation/clock-state',
        payload: { tick: 40, clock: { mode: 'running', speed: 1 } },
      } as WorkerToMainMessage),
    ).toBeUndefined();
  });
});

describe('what the player is told is a key, and the key is real', () => {
  it('emits a key for every reason the protocol declares, and no two share one', () => {
    const keys = REFUSAL_REASONS.map(
      (reason) => hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey,
    );
    expect(keys.filter((key) => key === undefined)).toEqual([]);
    // A shared key would put one sentence on two different refusals, which
    // is the same defect as no sentence at all for the reason it hides.
    expect(new Set(keys).size).toBe(REFUSAL_REASONS.length);
  });

  it('resolves every one of those keys to real text in the bundled default locale', () => {
    // ADR 0011: an unresolved key renders as itself. That is the right
    // runtime behaviour and the wrong shipping state, and this is the gate
    // that stops `hud.alert.refusal.build.unowned-lnad` from reaching a
    // screen.
    const missing: string[] = [];
    const localizer = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
    });

    for (const reason of REFUSAL_REASONS) {
      const key = hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey;
      expect(key, `${reason} produced no label key`).toBeDefined();
      const text = localizer.format(String(key));
      expect(text, `${String(key)} has no default-locale entry`).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
    }
    expect(missing).toEqual([]);
  });

  /*
   * **The owner's ruling 23 of 2026-08-31: the worker says the same words as
   * the host.** One refusal is decided on either side of `sender.submit` --
   * `src/main.ts` checks a purchase and a hire against the balance the worker
   * last published and throws `HostRefusalError` instead of submitting, and a
   * charge that check let through is refused a tick later by `Treasury.spend`
   * and arrives here. Both land on the *same* `.hud__refusal` band
   * (`applySimulationRefusal` in `src/ui/hud/hud.ts` arbitrates one line
   * between the two producers), so two wordings for one fact is a difference
   * the player reads as a difference in what happened.
   *
   * Pinned as an equality of **text** and not of key, because they are four
   * keys on purpose -- see `src/content/default-locale-en.ts` for why the
   * worker keys are not made to reference the host's -- and an equality of
   * text is then the only thing that keeps the four in step when one is
   * edited.
   */
  it("says the host's words for the refusal both sides of the submit can decide (ruling 23)", () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const alertSentence = (reason: RefusalReason): string =>
      localizer.format(
        String(hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey),
      );

    expect(alertSentence('hire.insufficient-funds')).toBe(
      localizer.format(HUD_MESSAGE_KEY.refusalHireStaffPastFloor),
    );
    expect(alertSentence('purchase.insufficient-funds')).toBe(
      localizer.format(HUD_MESSAGE_KEY.refusalPurchaseMaterialsPastFloor),
    );

    /*
     * **And the words themselves, transcribed from the owner's ruling of
     * 2026-09-01 rather than read back off the catalog.** The equality above
     * holds for *any* pair of identical strings, including the pair ruling 19
     * made false -- both sides said "that would go past what the state will
     * carry" and both were wrong together between -1,250 and -2,500, in step
     * and undetectably. Ruling 23 is what keeps the four keys equal; only a
     * transcription keeps them *right*, and this is the transcription. It is
     * not the fixture supplying both sides of the comparison
     * (`docs/TESTING.md`): the expected text comes from the ruling, and the
     * code under test is the table that chooses which key each reason gets.
     *
     * **The tail was rewritten on 2026-09-04 and the transcription follows it
     * rather than the 2026-09-01 words.** Ruling 19's requirement is *name
     * what stops, not the number it stops at*, and the clause that carried it
     * -- *"until the state pays what it owes"* -- is false of a prison that is
     * not earning: `StateIncomeSystem.update` credits nothing when
     * `stateIncomeForCompletedDay` is zero, and that fold counts only
     * prisoners holding a furnished bed
     * (`src/simulation/economy/income.ts`; issue #913). *"Until the prison
     * earns the money"* is the same shape with the false promise removed.
     */
    expect(alertSentence('purchase.insufficient-funds')).toBe(
      'Nothing was bought — deliveries are refused until the prison earns the money.',
    );
    expect(alertSentence('hire.insufficient-funds')).toBe(
      'Nobody was hired — hiring is refused until the prison earns the money.',
    );

    // And still not each other's. The namespace exists so that somebody who
    // pressed Hire is not sent to the Build panel to look for materials they
    // never ordered, and saying the host's words must not collapse that.
    expect(alertSentence('hire.insufficient-funds')).not.toBe(alertSentence('purchase.insufficient-funds'));
  });

  /**
   * **ADR 0017 decision 8's three rungs say three things** -- the owner's
   * ruling of 2026-09-01, which gave rung 2 a sentence of its own.
   *
   * Rung 2 had none: `reportMaterialsFunding` recorded
   * `purchase.insufficient-funds` whichever `SpendClass` the treasury refused,
   * so a stalled build queue borrowed rung 1's words. ADR 0017's "Amendment,
   * 2026-09-01" §5 named that owed and the owner accepted the plumbing -- a new
   * `RefusalReason` member and a row in `REFUSAL_LABEL_KEYS`.
   *
   * Two assertions, and they fail on different mistakes. The transcription
   * catches the words drifting from the ruling; the distinctness catches the
   * three collapsing back onto one, whatever wording they collapse onto.
   */
  it("gives the insolvency ladder's second rung a sentence of its own (2026-09-01)", () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const alertSentence = (reason: RefusalReason): string =>
      localizer.format(
        String(hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey),
      );

    expect(alertSentence('construction.materials-unfunded')).toBe(
      'The build queue is stalled — no more materials until the prison earns the money.',
    );

    const ladder = [
      alertSentence('purchase.insufficient-funds'),
      alertSentence('construction.materials-unfunded'),
      alertSentence('hire.insufficient-funds'),
    ];
    expect(new Set(ladder).size, 'three rungs, three sentences').toBe(3);
    // And they are one ladder rather than three unrelated rules: the tail is
    // shared on purpose, and a rung that lost it would read as a different
    // kind of refusal. The clause itself changed on 2026-09-04 (issue #913 --
    // the state owes nothing to a prison that is not earning); what ruling 19
    // asked for, a tail naming what stops rather than the threshold, is what
    // is checked here.
    for (const sentence of ladder) expect(sentence).toContain('until the prison earns the money');
  });

  it('carries no simulation text and no reason id into the view model', () => {
    // The boundary, stated as a measurement: nothing the HUD is handed is a
    // sentence, and nothing it is handed is the wire vocabulary either --
    // both would be a namespace leaking one layer too far (ADR 0011).
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    for (const reason of REFUSAL_REASONS) {
      const row = hudAlertsFromWorkerMessage(publication({ sequence: 3, tick: 1, reason }))?.[0];
      expect(row?.labelKey).not.toBe(reason);
      expect(row?.labelKey).not.toBe(localizer.format(String(row?.labelKey)));
      expect(row?.labelKey).toMatch(/^[a-z][a-z0-9.-]*$/u);
    }
  });
});

/** A `protocol/error`, correlated to a request or not. */
function fault(
  code: ProtocolFaultCode,
  options: { readonly recoverable?: boolean; readonly replyTo?: string } = {},
): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `fault-message-${code}`,
    ...(options.replyTo === undefined ? {} : { replyTo: options.replyTo }),
    kind: 'protocol/error',
    payload: { code, message: `rejected: ${code}`, recoverable: options.recoverable ?? false },
  } as WorkerToMainMessage;
}

/**
 * The second producer of alert rows: a protocol fault nobody else reads
 * (#187).
 *
 * Before this, an uncorrelated `protocol/error` reached `SimulationClient`,
 * was handed to every listener, and was dropped by all of them --
 * `WorkerSessionHost` ignores a message with no `replyTo`, and this function
 * returned `undefined` for it. That is the whole of finding 3's consequence
 * on this side: the worker faults, says so on the wire, and the player is
 * told nothing.
 */
describe('a protocol fault the worker raised becomes an alert row', () => {
  it('turns an uncorrelated fault into a row carrying a message key and a severity', () => {
    expect(hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true }))).toEqual([
      { id: 'fault-invalid-message', labelKey: 'hud.alert.fault.invalid-message', severity: 'warning' },
    ]);
  });

  it('says nothing about a fault that answers a request, because its caller reports it', () => {
    // `WorkerSessionHost` rejects the pending promise with a
    // `WorkerFaultError` and the save panel names the action that failed. A
    // row here would be the same failure told twice, in two places, with no
    // way for the player to know it is one event.
    expect(hudAlertsFromWorkerMessage(fault('snapshot-incompatible', { replyTo: 'load-request-1' }))).toBeUndefined();
  });

  it('grades a recoverable fault below an unrecoverable one', () => {
    // The one difference between #187's two halves that a player can act on.
    // A worker that rejected a message it never applied is still running the
    // prison; a reply this thread could not read means it cannot say what the
    // worker did at all.
    expect(hudAlertsFromWorkerMessage(fault('invalid-payload', { recoverable: true }))?.[0]?.severity).toBe('warning');
    expect(hudAlertsFromWorkerMessage(fault('invalid-payload', { recoverable: false }))?.[0]?.severity).toBe('danger');
  });

  it('keeps one row per code however many times that fault recurs', () => {
    // A peer sending malformed messages in a loop must not grow the list
    // without bound (`docs/HUD_PROJECTIONS.md` contract 5), and must not move
    // the row a player is reading.
    let alerts = hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true })) ?? [];
    alerts = hudAlertsFromWorkerMessage(fault('unknown-message-kind', { recoverable: true }), alerts) ?? [];
    const positions = alerts.map((row) => row.id);
    expect(positions).toEqual(['fault-invalid-message', 'fault-unknown-message-kind']);
    for (let repeat = 0; repeat < 50; repeat += 1) {
      alerts = hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true }), alerts) ?? [];
    }
    expect(alerts.map((row) => row.id)).toEqual(positions);
  });

  it('empties the list when the session stops', () => {
    const alerts = hudAlertsFromWorkerMessage(fault('internal-error')) ?? [];
    expect(alerts).toHaveLength(1);
    expect(
      hudAlertsFromWorkerMessage(
        {
          protocolVersion: SIMULATION_PROTOCOL_VERSION,
          messageId: 'stopped-1',
          replyTo: 'shutdown-1',
          kind: 'simulation/stopped',
          payload: { tick: 900, reason: 'shutdown-requested' },
        } as WorkerToMainMessage,
        alerts,
      ),
    ).toEqual([]);
  });
});

describe('the two producers of alert rows do not erase each other', () => {
  it('keeps a standing fault row when a counts publication carries a refusal', () => {
    // The publication arrives up to twice a second. A fault row that did not
    // survive one would be visible for under 500 ms, which the player cannot
    // tell apart from never being told at all -- #187 finding 3 with extra
    // steps.
    const withFault = hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true })) ?? [];
    const next = hudAlertsFromWorkerMessage(
      publication({ sequence: 1, tick: 12, reason: 'build.unowned-land' }),
      withFault,
    );
    expect(next?.map((row) => row.id)).toEqual(['fault-invalid-message', 'refusal-1']);
  });

  it('keeps a standing fault row when a counts publication carries no refusal', () => {
    const withFault = hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true })) ?? [];
    expect(hudAlertsFromWorkerMessage(publication(), withFault)?.map((row) => row.id)).toEqual([
      'fault-invalid-message',
    ]);
  });

  it('replaces only the refusal row when the refusal changes', () => {
    let alerts = hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true })) ?? [];
    alerts = hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 1, reason: 'build.unowned-land' }), alerts) ?? [];
    alerts = hudAlertsFromWorkerMessage(publication({ sequence: 2, tick: 9, reason: 'zone.invalid-area' }), alerts) ?? [];
    expect(alerts.map((row) => row.id)).toEqual(['fault-invalid-message', 'refusal-2']);
  });

  it('keeps a standing refusal row when a fault arrives', () => {
    const withRefusal =
      hudAlertsFromWorkerMessage(publication({ sequence: 3, tick: 4, reason: 'purchase.insufficient-funds' })) ?? [];
    const next = hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true }), withRefusal);
    expect(next?.map((row) => row.id)).toEqual(['refusal-3', 'fault-invalid-message']);
  });

  it('is pure: the same arguments give the same answer and the list it was handed is untouched', () => {
    const held = hudAlertsFromWorkerMessage(fault('invalid-message', { recoverable: true })) ?? [];
    const before = JSON.stringify(held);
    const first = hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 1, reason: 'build.unbuildable' }), held);
    const second = hudAlertsFromWorkerMessage(publication({ sequence: 1, tick: 1, reason: 'build.unbuildable' }), held);
    expect(first).toEqual(second);
    expect(JSON.stringify(held)).toBe(before);
  });
});

describe('what the player is told about a fault is a key, and the key is real', () => {
  it('emits a distinct key for every code the protocol declares', () => {
    // Exhaustive over the enum rather than over what is reachable today: a
    // code that gains an uncorrelated emitter must already have a sentence,
    // or it ships as its own raw dotted key.
    const keys = PROTOCOL_FAULT_CODES.map((code) => hudAlertsFromWorkerMessage(fault(code))?.[0]?.labelKey);
    expect(keys.filter((key) => key === undefined)).toEqual([]);
    expect(new Set(keys).size).toBe(PROTOCOL_FAULT_CODES.length);
  });

  it('resolves every one of those keys to real text in the bundled default locale', () => {
    const missing: string[] = [];
    const localizer = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
    });

    for (const code of PROTOCOL_FAULT_CODES) {
      const key = hudAlertsFromWorkerMessage(fault(code))?.[0]?.labelKey;
      expect(key, `${code} produced no label key`).toBeDefined();
      const text = localizer.format(String(key));
      expect(text, `${String(key)} has no default-locale entry`).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
    }
    expect(missing).toEqual([]);
  });

  it('carries no fault code and no protocol text into the view model', () => {
    // ADR 0011 at the same line the refusal case checks it: the wire
    // vocabulary stops here, and `payload.message` -- which is protocol
    // English, not a translated string -- never reaches a row.
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    for (const code of PROTOCOL_FAULT_CODES) {
      const row = hudAlertsFromWorkerMessage(fault(code))?.[0];
      expect(row?.labelKey).not.toBe(code);
      expect(row?.labelKey).not.toContain(`rejected: ${code}`);
      expect(row?.labelKey).not.toBe(localizer.format(String(row?.labelKey)));
      expect(row?.labelKey).toMatch(/^[a-z][a-z0-9.-]*$/u);
    }
  });
});

/**
 * The same refusal, read for the surface the player can actually see.
 *
 * The list this file's other blocks cover is inside `.hud__corner`, which
 * `hud.css` drops at 720px and below, in a section that starts folded at
 * every size -- so #261 joined the seam and left the sentence on screen at no
 * viewport. `hudRefusalFromWorkerMessage` is the second reading, for
 * `HudViewModel.refusal` and the always-laid-out band that carries it; the
 * band's own visibility is measured in a real browser
 * (`tests/browser/ui-shell.spec.ts`, `tests/browser/app-shell.spec.ts`),
 * because nothing here can see a layout.
 *
 * The tri-state is the whole of what is asserted below, and it is the part a
 * `toEqual` on the happy path would not reach: `undefined` must mean "this
 * message said nothing, leave the band alone" and `'none'` must mean "it did
 * say, and there is nothing to show". Collapsing them leaves a refusal from a
 * finished session standing across the top of the world.
 */
describe('the same refusal is read a second time, for the band that is always laid out', () => {
  it('carries the refusal as a key and its ordinal, and nothing else', () => {
    // The ordinal and not the tick: the band uses it to tell a republication
    // of the refusal it is already showing from a newly decided one, and
    // `tick` is the tick the refusal happened on rather than an identity.
    expect(hudRefusalFromWorkerMessage(publication({ sequence: 7, tick: 12, reason: 'remove-object.nothing-to-remove' }))).toEqual({
      sequence: 7,
      labelKey: 'hud.alert.refusal.remove-object.nothing-to-remove',
    });
  });

  it('agrees with the list about which sentence the refusal is', () => {
    // One record on the wire, two surfaces: a band and a log that disagreed
    // about what was refused would be worse than either alone. Asserted over
    // every reason the protocol declares rather than a sample, because the
    // two lookups could drift one entry at a time.
    for (const reason of REFUSAL_REASONS) {
      const message = publication({ sequence: 1, tick: 3, reason });
      const row = hudAlertsFromWorkerMessage(message)?.[0];
      const notice = hudRefusalFromWorkerMessage(message);
      expect(notice).not.toBe('none');
      expect(notice).not.toBeUndefined();
      expect(typeof notice === 'object' ? notice.labelKey : undefined).toBe(row?.labelKey);
    }
  });

  it('resolves to real text in the bundled default locale, for every reason', () => {
    // The same gate the list's keys get: a key is a string, so a typo
    // type-checks and renders as its own dotted self on somebody's screen --
    // and now it would do so in a band that is on screen at every viewport.
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    for (const reason of REFUSAL_REASONS) {
      const notice = hudRefusalFromWorkerMessage(publication({ sequence: 1, tick: 3, reason }));
      const key = typeof notice === 'object' ? notice.labelKey : undefined;
      expect(key, `${reason} produced no key`).toBeDefined();
      const text = localizer.format(String(key));
      expect(text, `${String(key)} has no default-locale entry`).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
      // ADR 0011 at the boundary: the wire vocabulary stops here.
      expect(String(key)).not.toBe(reason);
      expect(text).not.toContain(reason);
    }
  });

  it("says 'none' -- not undefined -- when the session has refused nothing", () => {
    // The distinction the band depends on. `undefined` would make a session
    // that has refused nothing indistinguishable from a message that is not
    // about refusals at all, and the band would keep a withdrawn sentence.
    expect(hudRefusalFromWorkerMessage(publication())).toBe('none');
  });

  it("says 'none' when the session stops", () => {
    expect(
      hudRefusalFromWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'stopped-2',
        replyTo: 'shutdown-2',
        kind: 'simulation/stopped',
        payload: { tick: 900, reason: 'shutdown-requested' },
      } as WorkerToMainMessage),
    ).toBe('none');
  });

  it('says nothing at all about a message that is not about refusals', () => {
    expect(
      hudRefusalFromWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'clock-2',
        kind: 'simulation/clock-state',
        payload: { tick: 40, clock: { mode: 'running', speed: 1 } },
      } as WorkerToMainMessage),
    ).toBeUndefined();
  });

  it('is pure: the same message gives the same answer', () => {
    const message = publication({ sequence: 3, tick: 8, reason: 'zone.overlaps-existing-room' });
    expect(hudRefusalFromWorkerMessage(message)).toEqual(hudRefusalFromWorkerMessage(message));
  });
});
