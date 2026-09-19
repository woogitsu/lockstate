import { type TelemetryConsent, type TelemetryConsentGate, TELEMETRY_CONSENT_VERSION } from './consent';
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
 * The supported way to emit telemetry. It applies, in order: registration,
 * consent, sampling, redaction and schema validation, and it is the only
 * place that turns a name and some attributes into an envelope.
 *
 * ## What this class guarantees, stated accurately
 *
 * This header used to end *"so no caller can construct an envelope that skips
 * a privacy control by calling the sink directly with a hand-built object"*.
 * That was false. `BatchingTelemetrySink.record` was public and checked
 * nothing but its rate limit and its queue bound, so anything holding the
 * sink could enqueue a hand-built envelope for a refused category carrying
 * unredacted attributes.
 *
 * The guarantee now holds, and it holds because of the *sink*, not because of
 * this class: `record()` there refuses anything `TelemetryAdmission` does not
 * admit (`./admission`). What this recorder adds is a precise refusal reason
 * for the caller and the construction of a well-formed envelope in the first
 * place -- convenience and diagnosis, not the control. Two consequences worth
 * stating plainly:
 *
 * - **Bypassing this class buys nothing.** The sink applies the same consent,
 *   registration and redaction checks to whatever it is handed.
 * - **Bypassing the sink is not defended against and cannot be.** A caller
 *   holding the `TelemetryTransport` can post whatever it likes. The control
 *   there is that exactly one transport is constructed, in the composition
 *   root, from deployment configuration -- not a check inside this layer.
 *
 * Nothing in `src/simulation/` may import this: telemetry is fed from the
 * main thread's orchestration layer, off the tick and frame paths
 * (ADR 0010).
 */
export type TelemetryRejectionReason =
  | 'unknown-event'
  | 'no-consent'
  | 'not-sampled'
  | 'invalid-envelope'
  /**
   * The sink's admission gate refused an envelope this class built. Only
   * reachable if the two disagree, which they cannot while both read the same
   * `TelemetryConsentGate` -- so it is reported rather than swallowed, and a
   * test pins that the legitimate path never produces it.
   */
  | 'sink-refused';

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
  /**
   * The live consent value, shared with the sink's admission gate. Required,
   * and a holder rather than a value: a decision copied into two objects is a
   * decision that can only be withdrawn from one of them.
   */
  readonly consent: TelemetryConsentGate;
  /** Per-event overrides for the registry's default sample rates. */
  readonly sampleRateOverrides?: Readonly<Record<string, number>>;
}

export class TelemetryRecorder {
  private readonly registry: TelemetryEventRegistry;

  public constructor(private readonly options: TelemetryRecorderOptions) {
    this.registry = options.registry ?? defaultTelemetryEventRegistry;
  }

  /**
   * Applied immediately: withdrawing consent stops the very next event.
   *
   * It writes through to the shared gate, so the sink stops admitting the
   * category in the same instant. There is no second copy to forget.
   */
  public setConsent(consent: TelemetryConsent | undefined): void {
    this.options.consent.set(consent);
  }

  public record(name: string, attributes: TelemetryAttributes, now: number): TelemetryRecordDecision {
    const definition = this.registry.get(name);
    if (definition === undefined) return { accepted: false, reason: 'unknown-event' };

    if (!this.options.consent.allows(definition.category)) {
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
      consentVersion: this.options.consent.current()?.version ?? TELEMETRY_CONSENT_VERSION,
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
    const outcome = this.options.sink.record(envelope, now);
    if (outcome === 'refused') {
      const lastRefusal = this.options.sink.stats().lastRefusal;
      return { accepted: false, reason: 'sink-refused', ...(lastRefusal === undefined ? {} : { message: lastRefusal }) };
    }
    return { accepted: true, outcome, envelope };
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
