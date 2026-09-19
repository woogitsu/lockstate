import { describe, expect, it } from 'vitest';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import {
  EMPTY_TELEMETRY_CONSENT_DRAFT,
  TELEMETRY_CONSENT_MESSAGE_KEY,
  TELEMETRY_CONSENT_ROWS,
  TELEMETRY_CONSENT_VERSION,
  createTelemetryConsent,
  inspectStoredTelemetryConsent,
  isTelemetryAllowed,
  saveTelemetryConsent,
  setTelemetryConsentCategory,
  shouldAskForTelemetryConsent,
  telemetryCategorySchema,
  telemetryConsentStorageKey,
} from '../../src/services/telemetry';

/**
 * The consent surface's decisions, all of which live outside the DOM.
 *
 * `vitest.config.ts` runs in `node` with no jsdom, so a decision taken inside
 * `src/ui/telemetry-consent-prompt.ts` would have no headless coverage at all.
 * That is the reason the split exists, and this file is the half it buys:
 * whether to ask, what a stored decision means, which categories there are,
 * which label each carries, what a toggle does, and what the player's answer
 * becomes. What is left in the browser-only half is element construction and
 * two event listeners.
 */

const NOW = 1_700_000_000_000;

class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

describe('the consent surface asks for exactly the categories that exist', () => {
  it('has a row for every category the schema declares, and none for one it does not', () => {
    // Enumerated from the schema rather than transcribed. A fourth category
    // added to `telemetryCategorySchema` with no row here would be a category
    // the recorder gates on and the player was never shown.
    expect(TELEMETRY_CONSENT_ROWS.map((row) => row.category)).toEqual([...telemetryCategorySchema.options]);
  });

  it('resolves every key it renders in the bundled default locale', () => {
    // The specific grievance behind this whole change: four
    // `telemetry.consent.*` strings shipped inside the bundle with nothing
    // rendering them (ADR 0044). The inverse -- a surface rendering a key the
    // catalog does not carry -- paints the raw key at the player, because
    // `Localizer.format` falls back to the key itself (ADR 0011).
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const keys = [
      ...Object.values(TELEMETRY_CONSENT_MESSAGE_KEY),
      ...TELEMETRY_CONSENT_ROWS.map((row) => row.labelKey),
    ];

    expect(keys.length, 'the key registry is empty; this would pass vacuously').toBeGreaterThanOrEqual(7);
    const unresolved = keys.filter((key) => !localizer.has(key));
    expect(unresolved, 'these keys render as themselves at the player').toEqual([]);
  });

  it('offers no category pre-ticked', () => {
    // A pre-ticked box is opt-out wearing a checkbox, and ADR 0010 rejects
    // opt-out outright.
    expect(Object.values(EMPTY_TELEMETRY_CONSENT_DRAFT)).toEqual([false, false, false]);
    for (const { category } of TELEMETRY_CONSENT_ROWS) {
      expect(EMPTY_TELEMETRY_CONSENT_DRAFT[category], `${category} starts ticked`).toBe(false);
    }
  });

  it('toggles one category without disturbing the others', () => {
    const draft = setTelemetryConsentCategory(EMPTY_TELEMETRY_CONSENT_DRAFT, 'diagnostics', true);
    expect(draft).toEqual({ diagnostics: true, performance: false, gameplay: false });
    expect(EMPTY_TELEMETRY_CONSENT_DRAFT.diagnostics, 'the shared empty draft was mutated').toBe(false);

    expect(setTelemetryConsentCategory(draft, 'diagnostics', false)).toEqual(EMPTY_TELEMETRY_CONSENT_DRAFT);
  });
});

describe('what is on record decides whether the player is asked', () => {
  it('names the same storage key the writer uses', () => {
    // Two literals of the same value in two modules is how a stored decision
    // becomes invisible to the surface that has to honour it: the prompt would
    // reappear on every load while the recorder kept collecting. Asserted
    // through the real writer rather than by comparing two strings.
    const store = new MemoryStore();
    saveTelemetryConsent(store, createTelemetryConsent(NOW, { diagnostics: true, performance: false, gameplay: false }));
    expect(store.getItem(telemetryConsentStorageKey())).not.toBeNull();
  });

  it('asks when nothing has ever been stored', () => {
    const stored = inspectStoredTelemetryConsent(new MemoryStore());
    expect(stored).toEqual({ status: 'absent' });
    expect(shouldAskForTelemetryConsent(stored)).toBe(true);
  });

  it('does not ask again once a current decision is on record, even a refusal', () => {
    const store = new MemoryStore();
    const refusal = createTelemetryConsent(NOW, { diagnostics: false, performance: false, gameplay: false });
    saveTelemetryConsent(store, refusal);

    const stored = inspectStoredTelemetryConsent(store);
    expect(stored.status).toBe('current');
    expect(stored.consent).toEqual(refusal);
    // The half that makes "Send nothing" a real answer rather than a deferral.
    expect(shouldAskForTelemetryConsent(stored)).toBe(false);
  });

  it('asks again when the decision was made against a different policy version, and carries none of it forward', () => {
    // ADR 0010: consent given for one policy is not consent for a wider one.
    const store = new MemoryStore();
    store.setItem(
      telemetryConsentStorageKey(),
      JSON.stringify({
        version: TELEMETRY_CONSENT_VERSION + 1,
        decidedAt: NOW,
        categories: { diagnostics: true, performance: true, gameplay: true },
      }),
    );

    const stored = inspectStoredTelemetryConsent(store);
    expect(stored.status).toBe('superseded');
    expect(stored.consent, 'a decision about a different policy must not be carried forward').toBeUndefined();
    expect(shouldAskForTelemetryConsent(stored)).toBe(true);
  });

  it('tells a corrupt entry apart from a superseded one, and asks in both cases', () => {
    // They mean the same thing for collection and different things for what
    // may be said, so collapsing them would lose a distinction the surface is
    // entitled to make.
    const corrupt = new MemoryStore();
    corrupt.setItem(telemetryConsentStorageKey(), '{not json');
    expect(inspectStoredTelemetryConsent(corrupt).status).toBe('unreadable');

    const wrongShape = new MemoryStore();
    wrongShape.setItem(telemetryConsentStorageKey(), JSON.stringify({ version: 1, categories: 'all' }));
    expect(inspectStoredTelemetryConsent(wrongShape).status).toBe('unreadable');

    for (const store of [corrupt, wrongShape]) {
      expect(shouldAskForTelemetryConsent(inspectStoredTelemetryConsent(store))).toBe(true);
    }
  });

  it('collects nothing in every state that is not a current decision', () => {
    // The independent floor. `shouldAskForTelemetryConsent` losing a prompt is
    // a bug; it must never be able to lose a refusal, and it cannot, because
    // the gate the recorder reads is a different function over a value that is
    // `undefined` in all three of these cases.
    const superseded = new MemoryStore();
    superseded.setItem(
      telemetryConsentStorageKey(),
      JSON.stringify({ version: TELEMETRY_CONSENT_VERSION + 1, decidedAt: NOW, categories: { diagnostics: true, performance: true, gameplay: true } }),
    );
    const corrupt = new MemoryStore();
    corrupt.setItem(telemetryConsentStorageKey(), 'nonsense');

    for (const store of [new MemoryStore(), superseded, corrupt]) {
      const stored = inspectStoredTelemetryConsent(store);
      for (const category of telemetryCategorySchema.options) {
        expect(isTelemetryAllowed(stored.consent, category), `${category} allowed with status ${stored.status}`).toBe(
          false,
        );
      }
    }
  });
});
