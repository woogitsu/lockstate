import type { TelemetryAttributeValue, TelemetryAttributes } from './events';
import { MAX_TELEMETRY_ATTRIBUTES, MAX_TELEMETRY_STRING_LENGTH } from './events';

/**
 * Redaction is a last line of defence, not the mechanism (ADR 0010): the
 * first defence is not collecting the field at all. It runs
 * unconditionally on every event, including attributes the caller believes
 * are safe, because "the caller was careful" is not a control.
 */
export const REDACTED = '[redacted]';

/**
 * Key-name deny list. Matching keys are *dropped entirely* rather than
 * redacted in place: keeping `authToken: "[redacted]"` still tells an
 * observer that a token was involved and invites the next author to
 * "temporarily" unredact it.
 */
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|credential|authorization|auth|apikey|api_key|jwt|cookie|session|signature|email|phone|address|payload|savedata|save_data)/i;

export interface ValuePattern {
  readonly pattern: RegExp;
  /** What the shape is, in one word. The name a test's sample is filed under. */
  readonly reason: string;
}

/**
 * Value shapes that must never leave the device even under an innocuous
 * key name. All are global so every occurrence in a string is replaced;
 * `String.prototype.replace` resets `lastIndex`, so reusing them is safe.
 *
 * Exported so the table can be *enumerated* by a test rather than sampled by
 * hand. Six of the seven entries had a sample and `file-url` had none, so
 * deleting that entry outright changed no test result (#264); the samples in
 * `tests/unit/services-telemetry.test.ts` are now required to name every
 * `reason` here, which is what makes the eighth omission impossible rather
 * than merely unlikely.
 */
export const SENSITIVE_VALUE_PATTERNS: readonly ValuePattern[] = [
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, reason: 'email' },
  { pattern: /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, reason: 'jwt' },
  { pattern: /\bbearer\s+\S+/gi, reason: 'bearer-token' },
  { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, reason: 'uuid' },
  { pattern: /\bfile:\/\/\S+/gi, reason: 'file-url' },
  { pattern: /\/(?:home|Users|root|var|etc)\/[^\s"']+/g, reason: 'filesystem-path' },
  { pattern: /[?&][\w-]+=[^\s&"']*/g, reason: 'url-query' },
];

/** Redacts a free-text string (an error message, a frame) without dropping its shape. */
export function redactText(value: string): string {
  let redacted = value;
  for (const { pattern } of SENSITIVE_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted.length > MAX_TELEMETRY_STRING_LENGTH ? `${redacted.slice(0, MAX_TELEMETRY_STRING_LENGTH - 1)}…` : redacted;
}

export interface RedactionOutcome {
  readonly attributes: TelemetryAttributes;
  /** Keys removed because their *name* was sensitive; reported so a bug is visible in development. */
  readonly droppedKeys: readonly string[];
  /** Keys whose value was rewritten. */
  readonly redactedKeys: readonly string[];
}

/**
 * Drops sensitive keys, redacts sensitive values, truncates long strings
 * and enforces the attribute-count cap deterministically (keys are sorted,
 * so which attributes survive a cap does not depend on object order).
 */
export function redactAttributes(attributes: TelemetryAttributes): RedactionOutcome {
  const droppedKeys: string[] = [];
  const redactedKeys: string[] = [];
  const result: Record<string, TelemetryAttributeValue> = {};

  for (const key of Object.keys(attributes).sort()) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      droppedKeys.push(key);
      continue;
    }
    if (Object.keys(result).length >= MAX_TELEMETRY_ATTRIBUTES) {
      droppedKeys.push(key);
      continue;
    }

    const value = attributes[key];
    if (typeof value === 'string') {
      const redacted = redactText(value);
      if (redacted !== value) redactedKeys.push(key);
      result[key] = redacted;
      continue;
    }
    if (typeof value === 'number') {
      // Non-finite numbers are not JSON-representable and usually indicate
      // a measurement bug; they are dropped rather than serialized as null.
      if (!Number.isFinite(value)) {
        droppedKeys.push(key);
        continue;
      }
      result[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      result[key] = value;
      continue;
    }
    droppedKeys.push(key);
  }

  return { attributes: result, droppedKeys, redactedKeys };
}
