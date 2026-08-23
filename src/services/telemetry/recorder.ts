import { type TelemetryConsent, TELEMETRY_CONSENT_VERSION, isTelemetryAllowed } from './consent';
import {
  type CapturedError,
  type CrashDiagnosticContext,
  buildCrashDiagnosticAttributes,
} from './diagnostics';
import {
  type ReleaseIdentity,
  type TelemetryAttributes,
  type TelemetryEnvelope,
  type TelemetryEventRegistry,
  TELEMETRY_SCHEMA_VERSION,
  defaultTelemetryEventRegistry,
  telemetryEnvelopeSchema,
} from './events';
import { redactAttributes } from './redaction';
import { shouldSample } from './sampling';
import type { BatchingTelemetrySink, TelemetryRecordOutcome } from './sink';

/**
 * The only supported way to emit telemetry. It enforces, in order:
 * registration, consent, sampling, redaction and schema validation --
 * so no caller can construct an envelope that skips a privacy control by
 * calling the sink directly with a hand-built object.
 *
 * Nothing in `src/simulation/` may import this: telemetry is fed from the
 * main thread's orchestration layer, off the tick and frame paths
 * (ADR 0010).
 */
export type TelemetryRejectionReason =
  | 'unknown-event'
  | 'no-consent'
  | 'not-sampled'
  | 'invalid-envelope';

export type TelemetryRecordDecision =
  | { readonly accepted: true; readonly outcome: TelemetryRecordOutcome; readonly envelope: TelemetryEnvelope }
  | { readonly accepted: false; readonly reason: TelemetryRejectionReason; readonly message?: string };

export interface TelemetryRecorderOptions {
  readonly sink: BatchingTelemetrySink;
  readonly release: ReleaseIdentity;
  readonly sessionId: string;
  /** Injected so ids are unique and testable without a global RNG. */
  readonly newEventId: () => string;
  readonly registry?: TelemetryEventRegistry;
  readonly consent?: TelemetryConsent;
  /** Per-event overrides for the registry's default sample rates. */
  readonly sampleRateOverrides?: Readonly<Record<string, number>>;
}

export class TelemetryRecorder {
  private consent: TelemetryConsent | undefined;
  private readonly registry: TelemetryEventRegistry;

  public constructor(private readonly options: TelemetryRecorderOptions) {
    this.registry = options.registry ?? defaultTelemetryEventRegistry;
    this.consent = options.consent;
  }

  /** Applied immediately: withdrawing consent stops the very next event. */
  public setConsent(consent: TelemetryConsent | undefined): void {
    this.consent = consent;
  }

  public record(name: string, attributes: TelemetryAttributes, now: number): TelemetryRecordDecision {
    const definition = this.registry.get(name);
    if (definition === undefined) return { accepted: false, reason: 'unknown-event' };

    if (!isTelemetryAllowed(this.consent, definition.category)) {
      return { accepted: false, reason: 'no-consent' };
    }

    const sampleRate = this.options.sampleRateOverrides?.[name] ?? definition.sampleRate;
    if (!shouldSample(this.options.sessionId, name, sampleRate)) {
      return { accepted: false, reason: 'not-sampled' };
    }

    const redacted = redactAttributes(attributes);
    const parsed = telemetryEnvelopeSchema.safeParse({
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      eventId: this.options.newEventId(),
      name,
      category: definition.category,
      occurredAt: now,
      sessionId: this.options.sessionId,
      release: this.options.release,
      consentVersion: this.consent?.version ?? TELEMETRY_CONSENT_VERSION,
      sampleRate,
      attributes: redacted.attributes,
    });
    if (!parsed.success) {
      // A malformed diagnostic is dropped locally rather than sent "best
      // effort": an unvalidated event is exactly how unexpected data leaks.
      return {
        accepted: false,
        reason: 'invalid-envelope',
        message: parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; '),
      };
    }

    const envelope = parsed.data as TelemetryEnvelope;
    return { accepted: true, outcome: this.options.sink.record(envelope, now), envelope };
  }

  /** Convenience for the `diagnostic.*` family; still goes through every check above. */
  public recordError(
    name: string,
    error: CapturedError,
    context: CrashDiagnosticContext,
    now: number,
  ): TelemetryRecordDecision {
    return this.record(name, buildCrashDiagnosticAttributes(error, context), now);
  }

  /** Host-driven; see `BatchingTelemetrySink.pump`. Never rejects. */
  public async pump(now: number): Promise<void> {
    await this.options.sink.pump(now);
  }
}
