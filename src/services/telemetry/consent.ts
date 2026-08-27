import { z } from 'zod';
import type { KeyValueStore } from '../../shared/key-value-store';
import type { DeepReadonly } from '../../simulation/protocol/types';

/**
 * Consent is client-authoritative and opt-in per category (ADR 0010).
 * Nothing is recorded, sampled or queued before a decision exists, and the
 * player must be able to change it offline -- so it lives in local
 * key/value storage, outside any prison save, and never in a form the
 * server can override.
 */
export const TELEMETRY_CONSENT_VERSION = 1 as const;

export const telemetryCategorySchema = z.enum(['diagnostics', 'performance', 'gameplay']);
export type TelemetryCategory = z.infer<typeof telemetryCategorySchema>;

export const telemetryConsentSchema = z
  .object({
    version: z.literal(TELEMETRY_CONSENT_VERSION),
    /** Epoch ms of the player's decision. There is no "not yet asked" value: absence means that. */
    decidedAt: z.number().int().min(1),
    categories: z
      .object({ diagnostics: z.boolean(), performance: z.boolean(), gameplay: z.boolean() })
      .strict(),
  })
  .strict();
export type TelemetryConsent = DeepReadonly<z.infer<typeof telemetryConsentSchema>>;

/** Every category off. Used before a decision and whenever consent is withdrawn. */
export const NO_TELEMETRY_CONSENT: TelemetryConsent = {
  version: TELEMETRY_CONSENT_VERSION,
  decidedAt: 1,
  categories: { diagnostics: false, performance: false, gameplay: false },
};

export function createTelemetryConsent(
  decidedAt: number,
  categories: Readonly<Record<TelemetryCategory, boolean>>,
): TelemetryConsent {
  return telemetryConsentSchema.parse({
    version: TELEMETRY_CONSENT_VERSION,
    decidedAt,
    categories,
  }) as TelemetryConsent;
}

export function withdrawTelemetryConsent(decidedAt: number): TelemetryConsent {
  return createTelemetryConsent(decidedAt, { diagnostics: false, performance: false, gameplay: false });
}

/**
 * `undefined` means "no valid decision on record" -- which includes a
 * decision made against an older `TELEMETRY_CONSENT_VERSION`. A consent
 * given for one policy is not consent for a wider one, so raising the
 * version re-asks rather than silently inheriting.
 */
export function isTelemetryAllowed(consent: TelemetryConsent | undefined, category: TelemetryCategory): boolean {
  if (consent === undefined) return false;
  if (consent.version !== TELEMETRY_CONSENT_VERSION) return false;
  return consent.categories[category];
}

const CONSENT_STORAGE_KEY = 'lockstate.telemetry.consent';

export function loadTelemetryConsent(store: KeyValueStore): TelemetryConsent | undefined {
  const raw = store.getItem(CONSENT_STORAGE_KEY);
  if (raw === null || raw === '') return undefined;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const parsed = telemetryConsentSchema.safeParse(parsedJson);
  return parsed.success ? (parsed.data as TelemetryConsent) : undefined;
}

export function saveTelemetryConsent(store: KeyValueStore, consent: TelemetryConsent): void {
  store.setItem(CONSENT_STORAGE_KEY, JSON.stringify(telemetryConsentSchema.parse(consent)));
}

/**
 * The one live consent value the pipeline reads.
 *
 * Before this existed, `TelemetryRecorder` held the player's decision in a
 * private field and `BatchingTelemetrySink` held nothing -- which is why
 * `sink.record()` could enqueue an envelope for a category the player had
 * refused. Both halves now read the same holder, so there is no arrangement
 * in which the recorder believes consent was withdrawn and the sink does not.
 *
 * A mutable holder rather than a value passed at construction, because
 * withdrawal has to take effect on the very next event: a value copied into
 * two objects at boot is a value that can only be revoked in one of them.
 */
export class TelemetryConsentGate {
  private consent: TelemetryConsent | undefined;

  public constructor(initial?: TelemetryConsent) {
    this.consent = initial;
  }

  /** The decision on record, or `undefined` for "no valid decision" -- which includes a stale policy version. */
  public current(): TelemetryConsent | undefined {
    return this.consent;
  }

  public set(consent: TelemetryConsent | undefined): void {
    this.consent = consent;
  }

  public allows(category: TelemetryCategory): boolean {
    return isTelemetryAllowed(this.consent, category);
  }
}
