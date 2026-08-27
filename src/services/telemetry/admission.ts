import type { TelemetryConsentGate } from './consent';
import {
  type TelemetryAttributes,
  type TelemetryEnvelope,
  type TelemetryEventRegistry,
  defaultTelemetryEventRegistry,
  telemetryEnvelopeSchema,
} from './events';
import { redactAttributes } from './redaction';

/**
 * The privacy controls, re-applied at the queue rather than trusted from the
 * caller.
 *
 * ## The defect this closes
 *
 * `src/services/telemetry/recorder.ts` used to claim, in its own header, that
 * *"no caller can construct an envelope that skips a privacy control by
 * calling the sink directly with a hand-built object."* That sentence was
 * false the day it was written. `BatchingTelemetrySink.record(envelope, now)`
 * was `public`, took an already-shaped `TelemetryEnvelope`, and did
 * rate-limiting and queueing only -- no consent check, no registry check, no
 * redaction. Anything holding the sink could enqueue
 * `{ ...envelope, category: 'gameplay', attributes: { authToken: '...' } }`
 * for a player who had refused every category, and every gate in the
 * repository stayed green.
 *
 * It was latent only because nothing sends. It stops being latent the moment
 * a transport exists, which is the same change that introduces this file.
 *
 * ## Why a second gate rather than a private method
 *
 * TypeScript has no way to make a method callable by one other class:
 * `private` and `#private` exclude the recorder too, and a shared symbol in a
 * sibling module is importable by anyone who can import the sink. Whichever
 * shape hid the method, the underlying object would still be reachable
 * through `recorder.pump`'s owner, through a test double, or through the
 * composition root's own reference.
 *
 * So the sink is made *safe to call* instead of *hard to call*. That is the
 * stronger property: it holds no matter who obtained the reference, and it
 * survives a refactor that changes who owns what.
 *
 * ## What it deliberately does not check
 *
 * **Sampling.** `shouldSample` is a volume control, not a privacy control --
 * an unsampled event is one the receiver would have weighted differently, not
 * one the player refused -- and the applied rate legitimately differs from the
 * registry default whenever `TelemetryRecorderOptions.sampleRateOverrides`
 * says so, which the sink cannot see. Re-deriving it here would refuse
 * correct events and prove nothing about privacy.
 *
 * **Cost.** Every admitted event is parsed and redacted twice, once by the
 * recorder building it and once here. That is bounded and small by
 * construction: attributes are scalars capped at
 * `MAX_TELEMETRY_ATTRIBUTES` (24), and the sink's own token bucket caps
 * arrivals at 60 per minute by default. Nothing on the tick or frame path
 * calls either one (ADR 0010).
 */
export type TelemetryAdmissionRefusal =
  /** Not a valid `TelemetryEnvelope` at all. */
  | 'invalid-envelope'
  /** A name the registry does not carry, so no purpose sentence covers it. */
  | 'unknown-event'
  /** A registered name relabelled into a category the player did consent to. */
  | 'category-mismatch'
  /** The player has not consented to this category, or has not decided at all. */
  | 'no-consent'
  /** Attributes that `redactAttributes` would still change: they never went through it. */
  | 'unredacted';

export type TelemetryAdmissionVerdict =
  | { readonly admitted: true; readonly envelope: TelemetryEnvelope }
  | { readonly admitted: false; readonly reason: TelemetryAdmissionRefusal; readonly detail?: string };

export interface TelemetryAdmission {
  /**
   * Takes `unknown` rather than `TelemetryEnvelope` on purpose: the whole
   * point is that the caller's claim about the shape is not evidence.
   */
  admit(candidate: unknown): TelemetryAdmissionVerdict;
}

export interface ConsentGatedAdmissionOptions {
  readonly consent: TelemetryConsentGate;
  readonly registry?: TelemetryEventRegistry;
}

/**
 * True when `attributes` is already a fixed point of `redactAttributes` --
 * that is, when running redaction over it would change nothing.
 *
 * Redaction is idempotent (its markers and its truncation suffix match none
 * of its own patterns), so a set that came through the recorder passes and a
 * hand-built one carrying `authToken`, an email address or a 1,000-character
 * string does not. The comparison is over scalars only, which is all the
 * envelope schema admits, so a shallow walk is exact rather than approximate.
 */
function isAlreadyRedacted(attributes: TelemetryAttributes): boolean {
  const redacted = redactAttributes(attributes).attributes;
  const before = Object.keys(attributes);
  const after = Object.keys(redacted);
  if (before.length !== after.length) return false;
  return before.every((key) => Object.hasOwn(redacted, key) && redacted[key] === attributes[key]);
}

export function consentGatedTelemetryAdmission(options: ConsentGatedAdmissionOptions): TelemetryAdmission {
  const registry = options.registry ?? defaultTelemetryEventRegistry;

  return {
    admit(candidate: unknown): TelemetryAdmissionVerdict {
      const parsed = telemetryEnvelopeSchema.safeParse(candidate);
      if (!parsed.success) {
        return {
          admitted: false,
          reason: 'invalid-envelope',
          detail: parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
            .join('; '),
        };
      }

      const envelope = parsed.data as TelemetryEnvelope;
      const definition = registry.get(envelope.name);
      if (definition === undefined) {
        return { admitted: false, reason: 'unknown-event', detail: envelope.name };
      }
      // Checked separately from consent, and this ordering is the reason:
      // relabelling `diagnostic.unhandled-error` as `gameplay` on a player who
      // consented to gameplay only would otherwise pass the consent check.
      if (definition.category !== envelope.category) {
        return {
          admitted: false,
          reason: 'category-mismatch',
          detail: `${envelope.name} is registered as ${definition.category}, not ${envelope.category}`,
        };
      }
      if (!options.consent.allows(definition.category)) {
        return { admitted: false, reason: 'no-consent', detail: definition.category };
      }
      if (!isAlreadyRedacted(envelope.attributes)) {
        return { admitted: false, reason: 'unredacted' };
      }

      return { admitted: true, envelope };
    },
  };
}
