import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import {
  REFUSAL_REASONS,
  SIMULATION_PROTOCOL_VERSION,
  type RefusalReason,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { hudAlertsFromWorkerMessage } from '../../src/ui/simulation-alerts';

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
