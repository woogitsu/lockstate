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
import { REFUSAL_BAND_TICK_CEILING_AT_X1, refusalBandTickCeiling } from '../../src/simulation/refusals/refusal-band-lifetime';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import { hudAlertsFromWorkerMessage, hudRefusalFromWorkerMessage } from '../../src/ui/simulation-alerts';
import type { HudAlertViewModel, HudSpeed } from '../../src/ui/hud/view-model';
import { alertRows } from '../helpers/alert-rows';

/**
 * `hudAlertsFromWorkerMessage`'s rows, for the assertions that read one.
 *
 * The translator answers three things since issue #1184 -- a list, `'none'`
 * for `simulation/stopped`, `undefined` for a message that says nothing --
 * and this throws on the two that are not a list rather than coercing them to
 * `[]`. Every use below drives a publication or a fault, so the throw is
 * unreachable; the three tests that assert the other two answers call the
 * translator directly, which is what makes the distinction visible here.
 */
function rows(
  message: WorkerToMainMessage,
  previous?: readonly HudAlertViewModel[],
): readonly HudAlertViewModel[] {
  return alertRows(previous === undefined ? hudAlertsFromWorkerMessage(message) : hudAlertsFromWorkerMessage(message, previous));
}

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

/**
 * One `simulation/status-counts` publication carrying `refusal`.
 *
 * `publishedAt` is the tick the readout is *about*, and it defaults to the
 * refusal's own rather than to a constant. That default used to be `1_234`,
 * which stopped being inert on 2026-09-20: the band now retires a refusal that
 * has stood `REFUSAL_BAND_TICK_CEILING_AT_X1` ticks with nothing further happening
 * (the owner's ruling, amending ADR 0091), and `hudRefusalFromWorkerMessage`
 * computes that from these two numbers. A fixture that published every refusal
 * more than a thousand ticks after it happened would mark every notice in this
 * file as outlived, and each case below would then be asserting about the
 * retirement rule instead of about the thing it was written for. Ageing is
 * opted into, by the cases that are about it.
 */
function publication(
  refusal?: { sequence: number; tick: number; reason: RefusalReason; routeDecidedSince?: true },
  publishedAt?: number,
): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-1',
    kind: 'simulation/status-counts',
    payload: {
      tick: publishedAt ?? refusal?.tick ?? 1_234,
      schemaVersion: 1,
      counts: { ...COUNTS },
      ...(refusal === undefined ? {} : { refusal }),
    },
  } as WorkerToMainMessage;
}

/**
 * `hudRefusalFromWorkerMessage` at x1 unless a case says otherwise.
 *
 * The speed is a required parameter of the production function (the owner's
 * *"Skalować sufit prędkością"* of 2026-09-20 scales the band's tick threshold
 * with it), and defaulting it here keeps every case that is **not** about the
 * ceiling reading as it did before that ruling. The cases that *are* about it
 * pass a speed explicitly, which is the only way to tell from the call site
 * which kind of case you are looking at.
 */
function bandNotice(message: WorkerToMainMessage, speed: HudSpeed = 1) {
  return hudRefusalFromWorkerMessage(message, speed);
}

describe('a refusal the worker published becomes an alert row', () => {
  it('turns the refusal into one row carrying a message key and a severity', () => {
    expect(rows(publication({ sequence: 1, tick: 12, reason: 'build.unowned-land' }))).toEqual([
      {
        id: 'refusal-1',
        labelKey: 'hud.alert.refusal.build.unowned-land',
        severity: 'warning',
      },
    ]);
  });

  it('keeps the row when the simulation marks the refusal route as decided since -- the list is the record (ADR 0091)', () => {
    // The companion to the band's own rule: option F retires the corner and
    // deliberately leaves the log alone, which is the split
    // `src/ui/simulation-alerts.ts` has described in prose since #507. A
    // reader who finds the band empty and the list full has found the ruling,
    // not a bug.
    expect(
      rows(publication({ sequence: 1, tick: 12, reason: 'build.unowned-land', routeDecidedSince: true })),
    ).toEqual([
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
    expect(rows(publication())).toEqual([]);
  });

  it('keeps the row identity while a refusal stands, and mints a new one when it changes', () => {
    // `HudAlertViewModel.id` exists so "a list update is not a full rebuild".
    // The channel republishes the same refusal beside every later count, so
    // an id derived from anything per-message -- the envelope's `messageId`,
    // its `tick` -- would rebuild the row the player is reading several times
    // a second.
    const first = rows(publication({ sequence: 4, tick: 12, reason: 'build.out-of-bounds' }));
    const republished = rows(publication({ sequence: 4, tick: 12, reason: 'build.out-of-bounds' }));
    expect(republished?.[0]?.id).toBe(first?.[0]?.id);

    const next = rows(publication({ sequence: 5, tick: 90, reason: 'build.out-of-bounds' }));
    // Same reason, same sentence, different refusal: a new row rather than
    // the old one silently rewritten under the player.
    expect(next?.[0]?.id).not.toBe(first?.[0]?.id);
    expect(next?.[0]?.labelKey).toBe(first?.[0]?.labelKey);
  });

  it('takes the log off when the session stops, rather than emptying it (#1184)', () => {
    // A refusal by a simulation that no longer exists is not something the
    // player can act on -- the same reasoning that sends the clock back to
    // `UNKNOWN_HUD_CLOCK`.
    //
    // **`'none'` and not `[]`, and that distinction is issue #1184.** An empty
    // list is what a running prison with a clean log publishes, and the HUD
    // says so in words: *"No active alerts"*. Returning it here made a session
    // that had ENDED say the same sentence about a prison that was no longer
    // there -- article 5's *"'brak incydentow' i 'brak danych' to rozne
    // stany"*. `'none'` deletes the field instead, and the HUD paints
    // *"No prison is reporting."* for it.
    expect(
      hudAlertsFromWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'stopped-1',
        replyTo: 'shutdown-1',
        kind: 'simulation/stopped',
        payload: { tick: 900, reason: 'shutdown-requested' },
      } as WorkerToMainMessage),
    ).toBe('none');
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
      (reason) => rows(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey,
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
      const key = rows(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey;
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
        String(rows(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey),
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
        String(rows(publication({ sequence: 1, tick: 1, reason }))?.[0]?.labelKey),
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
      const row = rows(publication({ sequence: 3, tick: 1, reason }))?.[0];
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
    expect(rows(fault('invalid-message', { recoverable: true }))).toEqual([
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
    expect(rows(fault('invalid-payload', { recoverable: true }))?.[0]?.severity).toBe('warning');
    expect(rows(fault('invalid-payload', { recoverable: false }))?.[0]?.severity).toBe('danger');
  });

  it('keeps one row per code however many times that fault recurs', () => {
    // A peer sending malformed messages in a loop must not grow the list
    // without bound (`docs/HUD_PROJECTIONS.md` contract 5), and must not move
    // the row a player is reading.
    let alerts = rows(fault('invalid-message', { recoverable: true })) ?? [];
    alerts = rows(fault('unknown-message-kind', { recoverable: true }), alerts) ?? [];
    const positions = alerts.map((row) => row.id);
    expect(positions).toEqual(['fault-invalid-message', 'fault-unknown-message-kind']);
    for (let repeat = 0; repeat < 50; repeat += 1) {
      alerts = rows(fault('invalid-message', { recoverable: true }), alerts) ?? [];
    }
    expect(alerts.map((row) => row.id)).toEqual(positions);
  });

  it('takes the log off when the session stops, standing faults and all (#1184)', () => {
    const alerts = rows(fault('internal-error'));
    expect(alerts).toHaveLength(1);
    // `'none'` rather than `[]` for the reason the refusal case above states:
    // the field comes off the view model, so a stopped session cannot be read
    // as a running prison with nothing to report.
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
    ).toBe('none');
  });
});

describe('the two producers of alert rows do not erase each other', () => {
  it('keeps a standing fault row when a counts publication carries a refusal', () => {
    // The publication arrives up to twice a second. A fault row that did not
    // survive one would be visible for under 500 ms, which the player cannot
    // tell apart from never being told at all -- #187 finding 3 with extra
    // steps.
    const withFault = rows(fault('invalid-message', { recoverable: true })) ?? [];
    const next = rows(
      publication({ sequence: 1, tick: 12, reason: 'build.unowned-land' }),
      withFault,
    );
    expect(next?.map((row) => row.id)).toEqual(['fault-invalid-message', 'refusal-1']);
  });

  it('keeps a standing fault row when a counts publication carries no refusal', () => {
    const withFault = rows(fault('invalid-message', { recoverable: true })) ?? [];
    expect(rows(publication(), withFault)?.map((row) => row.id)).toEqual([
      'fault-invalid-message',
    ]);
  });

  it('replaces only the refusal row when the refusal changes', () => {
    let alerts = rows(fault('invalid-message', { recoverable: true })) ?? [];
    alerts = rows(publication({ sequence: 1, tick: 1, reason: 'build.unowned-land' }), alerts) ?? [];
    alerts = rows(publication({ sequence: 2, tick: 9, reason: 'zone.invalid-area' }), alerts) ?? [];
    expect(alerts.map((row) => row.id)).toEqual(['fault-invalid-message', 'refusal-2']);
  });

  it('keeps a standing refusal row when a fault arrives', () => {
    const withRefusal =
      rows(publication({ sequence: 3, tick: 4, reason: 'purchase.insufficient-funds' })) ?? [];
    const next = rows(fault('invalid-message', { recoverable: true }), withRefusal);
    expect(next?.map((row) => row.id)).toEqual(['refusal-3', 'fault-invalid-message']);
  });

  it('is pure: the same arguments give the same answer and the list it was handed is untouched', () => {
    const held = rows(fault('invalid-message', { recoverable: true })) ?? [];
    const before = JSON.stringify(held);
    const first = rows(publication({ sequence: 1, tick: 1, reason: 'build.unbuildable' }), held);
    const second = rows(publication({ sequence: 1, tick: 1, reason: 'build.unbuildable' }), held);
    expect(first).toEqual(second);
    expect(JSON.stringify(held)).toBe(before);
  });
});

describe('what the player is told about a fault is a key, and the key is real', () => {
  it('emits a distinct key for every code the protocol declares', () => {
    // Exhaustive over the enum rather than over what is reachable today: a
    // code that gains an uncorrelated emitter must already have a sentence,
    // or it ships as its own raw dotted key.
    const keys = PROTOCOL_FAULT_CODES.map((code) => rows(fault(code))?.[0]?.labelKey);
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
      const key = rows(fault(code))?.[0]?.labelKey;
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
      const row = rows(fault(code))?.[0];
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
    expect(bandNotice(publication({ sequence: 7, tick: 12, reason: 'remove-object.nothing-to-remove' }))).toEqual({
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
      const row = rows(message)?.[0];
      const notice = bandNotice(message);
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
      const notice = bandNotice(publication({ sequence: 1, tick: 3, reason }));
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
    expect(bandNotice(publication())).toBe('none');
  });

  it("says 'none' when the session stops", () => {
    expect(
      bandNotice({
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
      bandNotice({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'clock-2',
        kind: 'simulation/clock-state',
        payload: { tick: 40, clock: { mode: 'running', speed: 1 } },
      } as WorkerToMainMessage),
    ).toBeUndefined();
  });

  /**
   * ADR 0091 decision 2, option F (ruled by the owner 2026-09-16). The
   * simulation reports that the standing refusal's own command route has
   * decided something since; **the band retires on it and the list does
   * not**, and these two cases are the halves of that divergence asserted
   * separately rather than one inferred from the other.
   *
   * This function's job is to forward the fact, not to act on it: the band
   * rule lives in `mountHud`'s `applySimulationRefusal` and is measured in
   * `tests/browser/ui-refusal-band-route-retire.spec.ts`, because that is the
   * only place the production DOM exists.
   */
  it('forwards the mark the simulation put on the refusal, without acting on it (ADR 0091)', () => {
    expect(
      bandNotice(
        publication({ sequence: 3, tick: 8, reason: 'remove-wall.nothing-to-remove', routeDecidedSince: true }),
      ),
    ).toEqual({
      sequence: 3,
      labelKey: 'hud.alert.refusal.remove-wall.nothing-to-remove',
      routeDecidedSince: true,
    });
  });

  it('leaves the field off entirely while nothing of that route has been decided', () => {
    // Absent rather than `false`, so a consumer cannot read "not marked" and
    // "the worker does not report marks" as the same state, and so the shape
    // matches `SimulationRefusal`'s own `true`-or-absent field.
    const notice = bandNotice(publication({ sequence: 3, tick: 8, reason: 'remove-wall.nothing-to-remove' }));
    expect(notice).toEqual({ sequence: 3, labelKey: 'hud.alert.refusal.remove-wall.nothing-to-remove' });
    expect(notice === 'none' || notice === undefined ? true : 'routeDecidedSince' in notice).toBe(false);
  });

  /**
   * **The complement of option F, ruled by the owner on 2026-09-20**: the band
   * retires a refusal that has stood `REFUSAL_BAND_TICK_CEILING_AT_X1` simulation
   * ticks with nothing further happening. The provenance is the weaker of the
   * two kinds this repository distinguishes -- the label of a clickable option
   * a session wrote, *"Tak, ale liczony w tikach"* ("Yes, but counted in
   * ticks") -- and what was agreed is the unit, not the number.
   *
   * Unlike `routeDecidedSince`, this mark is **computed here** rather than
   * forwarded: it is a subtraction of two integers the payload already carries,
   * so `refusalSchema` gains no member. This function is the composition root's
   * helper and may know both sides of the boundary, which is what lets the
   * simulation's own constant be imported instead of copied into `src/ui/hud/`.
   *
   * The boundary is asserted from both sides, because a rule that fired a tick
   * early would still retire every band eventually and a one-sided assertion
   * would stay green. The band rule itself lives in `mountHud`'s
   * `applySimulationRefusal` and is measured in
   * `tests/browser/ui-refusal-band-tick-retire.spec.ts`, the only place the
   * production DOM exists.
   */
  it('marks a refusal that has stood the whole tick ceiling with nothing further happening', () => {
    expect(
      bandNotice(
        publication({ sequence: 4, tick: 40, reason: 'zone.not-enclosed' }, 40 + REFUSAL_BAND_TICK_CEILING_AT_X1),
      ),
    ).toEqual({ sequence: 4, labelKey: 'hud.alert.refusal.zone.not-enclosed', outlivedBandTicks: true });
  });

  it('leaves the mark off one tick short of the ceiling', () => {
    const notice = bandNotice(
      publication({ sequence: 4, tick: 40, reason: 'zone.not-enclosed' }, 40 + REFUSAL_BAND_TICK_CEILING_AT_X1 - 1),
    );
    expect(notice).toEqual({ sequence: 4, labelKey: 'hud.alert.refusal.zone.not-enclosed' });
    // Absent rather than `false`, matching `routeDecidedSince` beside it.
    expect(notice === 'none' || notice === undefined ? true : 'outlivedBandTicks' in notice).toBe(false);
  });

  it('counts in ticks and not in the wall clock, which is the whole of what the owner ruled', () => {
    // A paused prison republishes the standing refusal beside whatever else
    // the counts channel carries, and its tick does not move. Time passing on
    // this thread is not represented here at all -- there is nothing in this
    // function that could read it -- and that is exactly the property a
    // wall-clock ceiling like `.hud__event`'s `EVENT_BAND_HOLD_CEILING_MS`
    // would lose.
    const standing = { sequence: 5, tick: 900, reason: 'unzone.room-occupied' } as const;
    for (let republication = 0; republication < 50; republication += 1) {
      expect(bandNotice(publication(standing, 900))).toEqual({
        sequence: 5,
        labelKey: 'hud.alert.refusal.unzone.room-occupied',
      });
    }
  });

  it('marks both ways at once when a route decided something and the ceiling has passed', () => {
    // The two marks are independent facts with different producers, so a
    // notice can carry both. The band reads them as one branch, but a shape
    // that made either exclusive would invent a relationship neither rule has.
    expect(
      bandNotice(
        publication(
          { sequence: 6, tick: 12, reason: 'build.out-of-bounds', routeDecidedSince: true },
          12 + REFUSAL_BAND_TICK_CEILING_AT_X1,
        ),
      ),
    ).toEqual({
      sequence: 6,
      labelKey: 'hud.alert.refusal.build.out-of-bounds',
      routeDecidedSince: true,
      outlivedBandTicks: true,
    });
  });

  /**
   * **The threshold scales with the running speed** -- the owner's second
   * ruling of 2026-09-20, *"Skalować sufit prędkością (zalecane)"* ("Scale the
   * ceiling with speed"), chosen from three clickable options and carrying the
   * same weaker provenance as the ruling it amends. It was put to them as the
   * cost the first ruling disclosed: 300 ticks is 15.0 s at x1, **7.5 s at
   * x2** and 3.75 s at x4, against a 14.05 s estimate of reading the longest
   * sentence, so the sentence could vanish unread at both faster speeds.
   *
   * **The unit did not change and must not.** A paused prison still ages the
   * sentence by nothing at all, because no tick passes; what scales is the
   * number of ticks the sentence is owed.
   *
   * Each speed is asserted from **both sides of its own boundary**, and the
   * x2 and x4 cases additionally assert the negative at the x1 figure -- a
   * ceiling that ignored the speed would pass a one-sided test at 600 or 1,200
   * ticks, because those are past 300 too.
   */
  it.each([1, 2, 4] as const)('holds a refusal for a speed-scaled number of ticks at x%i', (speed) => {
    const standing = { sequence: 7, tick: 100, reason: 'zone.not-enclosed' } as const;
    const ceiling = refusalBandTickCeiling(speed);
    expect(ceiling, 'the ceiling at this speed is not what the derivation says').toBe(
      REFUSAL_BAND_TICK_CEILING_AT_X1 * speed,
    );

    const short = bandNotice(publication(standing, standing.tick + ceiling - 1), speed);
    expect(short).toEqual({ sequence: 7, labelKey: 'hud.alert.refusal.zone.not-enclosed' });

    const reached = bandNotice(publication(standing, standing.tick + ceiling), speed);
    expect(reached).toEqual({
      sequence: 7,
      labelKey: 'hud.alert.refusal.zone.not-enclosed',
      outlivedBandTicks: true,
    });
  });

  it.each([2, 4] as const)('does not retire at the x1 figure when the game is running at x%i', (speed) => {
    // The negative that makes the parameterised case above mean something.
    const standing = { sequence: 7, tick: 100, reason: 'zone.not-enclosed' } as const;
    expect(
      bandNotice(publication(standing, standing.tick + REFUSAL_BAND_TICK_CEILING_AT_X1), speed),
    ).toEqual({ sequence: 7, labelKey: 'hud.alert.refusal.zone.not-enclosed' });
  });

  it('holds the same stretch of wall clock at every speed, which is the whole point of scaling', () => {
    // A tick is `stepMilliseconds / speed` of wall clock, and
    // `FixedStepClock`'s default step is 50 ms. So the check is that the
    // product is one number rather than three -- the arithmetic the ruling was
    // put to the owner as.
    const holdMs = ([1, 2, 4] as const).map((speed) => refusalBandTickCeiling(speed) * (50 / speed));
    expect(holdMs).toEqual([15_000, 15_000, 15_000]);
  });

  it('is not monotone in the speed, which is the property the band has to compensate for', () => {
    // Stated as a test rather than only in prose, because it is the reason
    // `mountHud` remembers the ordinal it retired. The same record, the same
    // two ticks, read at two speeds, gives two different answers -- so a band
    // with no memory would put a retired sentence back when the player slowed
    // down.
    const standing = { sequence: 8, tick: 0, reason: 'unzone.room-occupied' } as const;
    const atOneSpeed = bandNotice(publication(standing, REFUSAL_BAND_TICK_CEILING_AT_X1), 1);
    const atFourSpeed = bandNotice(publication(standing, REFUSAL_BAND_TICK_CEILING_AT_X1), 4);
    expect(atOneSpeed === 'none' || atOneSpeed === undefined ? false : atOneSpeed.outlivedBandTicks).toBe(true);
    expect(
      atFourSpeed === 'none' || atFourSpeed === undefined ? true : 'outlivedBandTicks' in atFourSpeed,
    ).toBe(false);
  });

  it('is pure: the same message gives the same answer', () => {
    const message = publication({ sequence: 3, tick: 8, reason: 'zone.overlaps-existing-room' });
    expect(bandNotice(message)).toEqual(bandNotice(message));
  });
});
