import type { LocalizationKey } from '../../content/localization';
import type { KeyValueStore } from '../../shared/key-value-store';
import {
  type TelemetryCategory,
  type TelemetryConsent,
  TELEMETRY_CONSENT_VERSION,
  telemetryCategorySchema,
  telemetryConsentSchema,
} from './consent';

/**
 * Every decision the consent surface makes, with no DOM anywhere near it.
 *
 * ## Why the decisions are here and not in the panel
 *
 * `vitest.config.ts` sets `environment: 'node'` and loads no jsdom, so
 * anything that touches `document` is unreachable from `pnpm test` and can be
 * exercised only by the Playwright suite. A consent gate whose *rules* --
 * whether to ask, what a stored decision means, what the player's choice
 * becomes -- lived in a DOM module would therefore be a privacy control with
 * no headless coverage at all.
 *
 * So this module holds all of them, and `src/ui/telemetry-consent-prompt.ts`
 * holds only element construction and event plumbing. It is also structurally
 * enforced rather than merely intended: `tests/unit/services-layer-boundaries.test.ts`
 * refuses `document.`/`window.` anywhere under `src/services/`, so this file
 * cannot acquire a DOM dependency without failing that gate.
 *
 * ## The one thing it does not decide
 *
 * Whether there is anything to consent *to*. A prompt shown by a build with
 * no ingestion configuration would be the exact defect ADR 0044 named -- the
 * product's vocabulary shipping while its capability did not. That decision
 * belongs to `./pipeline`, which constructs nothing at all when the
 * configuration is absent, and therefore mounts no prompt.
 */

/**
 * The keys this surface renders. Wired, every one: `title` and the three
 * category labels already shipped inside the bundle with no code behind them
 * (ADR 0044), and `body`, `accept` and `decline` arrive with the change that
 * finally renders all seven.
 *
 * Fields are named `title` rather than `titleKey`, matching
 * `src/ui/save-panel-messages.ts` and `src/ui/hud/messages.ts`. That is a
 * convention with a consequence worth stating: the repository-wide scanner in
 * `tests/foundation/localization-key-completeness.test.ts` matches `xKey:
 * 'literal'` declarations, so a registry shaped like this one is outside it --
 * which is why every registry of this shape carries its own resolution test,
 * and why `tests/unit/services-telemetry-consent-flow.test.ts` resolves all
 * seven of these against the bundled catalog.
 */
export const TELEMETRY_CONSENT_MESSAGE_KEY = {
  title: 'telemetry.consent.title',
  body: 'telemetry.consent.body',
  accept: 'telemetry.consent.accept',
  decline: 'telemetry.consent.decline',
} as const satisfies Readonly<Record<string, LocalizationKey>>;

/**
 * One row per category, ordered as the prompt shows them.
 *
 * Derived from `telemetryCategorySchema.options` rather than transcribed, so
 * a fourth category cannot be added to the schema without either appearing
 * here or failing `TELEMETRY_CONSENT_ROWS`'s own completeness test. A
 * category with no label would otherwise render as a bare checkbox with
 * nothing to say what agreeing to it means.
 */
const CATEGORY_LABEL_KEYS: Readonly<Record<TelemetryCategory, LocalizationKey>> = {
  diagnostics: 'telemetry.consent.diagnostics',
  performance: 'telemetry.consent.performance',
  gameplay: 'telemetry.consent.gameplay',
};

export interface TelemetryConsentRow {
  readonly category: TelemetryCategory;
  readonly labelKey: LocalizationKey;
}

export const TELEMETRY_CONSENT_ROWS: readonly TelemetryConsentRow[] = telemetryCategorySchema.options.map(
  (category) => ({ category, labelKey: CATEGORY_LABEL_KEYS[category] }),
);

/** What the player has toggled, before they commit it. Never a `TelemetryConsent`: an uncommitted draft is not a decision. */
export type TelemetryConsentDraft = Readonly<Record<TelemetryCategory, boolean>>;

/**
 * Every category off.
 *
 * The draft a prompt opens with, and it is opt-in rather than
 * pre-ticked-and-opt-out by construction: ADR 0010 rejects opt-out outright,
 * and a pre-ticked box is opt-out wearing a checkbox.
 */
export const EMPTY_TELEMETRY_CONSENT_DRAFT: TelemetryConsentDraft = {
  diagnostics: false,
  performance: false,
  gameplay: false,
};

export function setTelemetryConsentCategory(
  draft: TelemetryConsentDraft,
  category: TelemetryCategory,
  allowed: boolean,
): TelemetryConsentDraft {
  return { ...draft, [category]: allowed };
}

/**
 * What is on record, and why it does not count if it does not.
 *
 * `loadTelemetryConsent` answers `undefined` for three different situations
 * and the surface needs to tell them apart: a player who has never been asked
 * is in a different position from one who agreed to an older policy, and a
 * corrupt entry is a bug rather than a choice. All three still mean "collect
 * nothing and ask again" -- the distinction changes what may be *said*, never
 * what is collected.
 */
export type StoredTelemetryConsentStatus =
  /** No entry at all: never asked. */
  | 'absent'
  /** A well-formed decision, for the policy version in force. */
  | 'current'
  /** A well-formed decision made against a different `TELEMETRY_CONSENT_VERSION`. */
  | 'superseded'
  /** Present and not parseable. Treated as no decision, and never repaired in place. */
  | 'unreadable';

export interface StoredTelemetryConsent {
  readonly status: StoredTelemetryConsentStatus;
  /** Only ever populated for `current`; a superseded decision is deliberately not carried forward. */
  readonly consent?: TelemetryConsent;
}

/** The storage key, declared once. Kept in step with `./consent`'s writer by `telemetryConsentStorageKey`. */
const CONSENT_STORAGE_KEY = 'lockstate.telemetry.consent';

/**
 * Exported so a test can assert this module and `saveTelemetryConsent` agree
 * on where the decision lives. Two string literals of the same value in two
 * modules is exactly the drift that would make a stored decision invisible to
 * the surface that has to honour it -- the prompt would reappear on every
 * load while the recorder kept collecting.
 */
export function telemetryConsentStorageKey(): string {
  return CONSENT_STORAGE_KEY;
}

export function inspectStoredTelemetryConsent(store: KeyValueStore): StoredTelemetryConsent {
  const raw = store.getItem(CONSENT_STORAGE_KEY);
  if (raw === null || raw === '') return { status: 'absent' };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { status: 'unreadable' };
  }

  const parsed = telemetryConsentSchema.safeParse(parsedJson);
  if (parsed.success) return { status: 'current', consent: parsed.data as TelemetryConsent };

  // A decision whose only fault is its version is a real decision about a
  // different policy, and saying so is what lets the surface distinguish "we
  // have never asked" from "we widened what we collect and must ask again"
  // (ADR 0010). Anything else is a corrupt entry.
  const version = (parsedJson as { readonly version?: unknown } | null)?.version;
  const superseded =
    typeof version === 'number' && Number.isInteger(version) && version >= 1 && version !== TELEMETRY_CONSENT_VERSION;
  return { status: superseded ? 'superseded' : 'unreadable' };
}

/**
 * Whether the prompt goes up.
 *
 * Default-deny is structural rather than conditional: only `current`
 * suppresses the prompt, so every unknown state -- including one this enum
 * gains later -- asks. `isTelemetryAllowed(undefined, …)` is `false`
 * independently, so a bug here loses a prompt, never a player's refusal.
 */
export function shouldAskForTelemetryConsent(stored: StoredTelemetryConsent): boolean {
  return stored.status !== 'current';
}
