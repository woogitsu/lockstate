import { z } from 'zod';
import { type DeepReadonly, identifierSchema } from '../../simulation/protocol/types';
import { telemetryCategorySchema, type TelemetryCategory } from './consent';

/**
 * Telemetry is an allow-list, not a bucket (ADR 0010): an event exists
 * only if it has a registered name, a category and a written purpose.
 * Adding one is intentional friction -- that is the point.
 */
export const TELEMETRY_SCHEMA_VERSION = 1 as const;

export const MAX_TELEMETRY_ATTRIBUTES = 24;
export const MAX_TELEMETRY_STRING_LENGTH = 200;

export const telemetryAttributeValueSchema = z.union([
  z.string().max(MAX_TELEMETRY_STRING_LENGTH),
  z.number().finite(),
  z.boolean(),
]);
export type TelemetryAttributeValue = z.infer<typeof telemetryAttributeValueSchema>;
export type TelemetryAttributes = Readonly<Record<string, TelemetryAttributeValue>>;

export const releaseIdentitySchema = z
  .object({
    /** Correlates a stack frame with the privately retained source map (ADR 0010). */
    buildVersion: identifierSchema,
    environment: z.enum(['development', 'staging', 'production']),
    commit: identifierSchema.optional(),
  })
  .strict();
export type ReleaseIdentity = DeepReadonly<z.infer<typeof releaseIdentitySchema>>;

export const telemetryEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    eventId: identifierSchema,
    name: identifierSchema,
    category: telemetryCategorySchema,
    occurredAt: z.number().int().min(0),
    /**
     * Rotates per browser session, is never persisted and is never derived
     * from the account id: it correlates events *within* one session and
     * deliberately nothing across sessions.
     */
    sessionId: identifierSchema,
    release: releaseIdentitySchema,
    /** Which consent policy version the player agreed to when this was recorded. */
    consentVersion: z.number().int().min(1),
    /** Travels with the event so the receiver can weight instead of guessing. */
    sampleRate: z.number().min(0).max(1),
    attributes: z.record(identifierSchema, telemetryAttributeValueSchema),
  })
  .strict()
  .superRefine((envelope, ctx) => {
    if (Object.keys(envelope.attributes).length > MAX_TELEMETRY_ATTRIBUTES) {
      ctx.addIssue({ code: 'custom', message: 'Too many attributes.', path: ['attributes'] });
    }
  });
export type TelemetryEnvelope = DeepReadonly<z.infer<typeof telemetryEnvelopeSchema>>;

export interface TelemetryEventDefinition {
  readonly name: string;
  readonly category: TelemetryCategory;
  /** Why this event exists, in one line. Reviewed when the privacy policy is reviewed. */
  readonly purpose: string;
  /** Default share of sessions that report it, before per-recorder overrides. */
  readonly sampleRate: number;
}

/**
 * The complete set of events the client may emit today. Diagnostics are
 * unsampled because a crash is rare and always interesting; volume-heavy
 * categories are sampled.
 */
export const DEFAULT_TELEMETRY_EVENTS: readonly TelemetryEventDefinition[] = [
  {
    name: 'diagnostic.unhandled-error',
    category: 'diagnostics',
    purpose: 'Detect crashes players never report, correlated to a build.',
    sampleRate: 1,
  },
  {
    name: 'diagnostic.save-decode-failed',
    category: 'diagnostics',
    purpose: 'Detect save corruption and failed migrations in the field.',
    sampleRate: 1,
  },
  {
    name: 'diagnostic.worker-terminated',
    category: 'diagnostics',
    purpose: 'Detect simulation worker loss, which is invisible to the player until state stops advancing.',
    sampleRate: 1,
  },
  {
    name: 'performance.tick-budget',
    category: 'performance',
    purpose: 'Compare real-hardware tick cost against benchmark budgets at known actor counts.',
    sampleRate: 0.1,
  },
  {
    name: 'performance.frame-budget',
    category: 'performance',
    purpose: 'Detect render-side stalls that benchmarks on developer hardware do not reproduce.',
    sampleRate: 0.1,
  },
  {
    name: 'gameplay.scenario-completed',
    category: 'gameplay',
    purpose: 'Aggregate completion rates for scenario/tutorial design, never per-player behaviour.',
    sampleRate: 0.25,
  },
];

export interface TelemetryEventRegistry {
  get(name: string): TelemetryEventDefinition | undefined;
  all(): readonly TelemetryEventDefinition[];
}

export function loadTelemetryEventRegistry(
  definitions: readonly TelemetryEventDefinition[] = DEFAULT_TELEMETRY_EVENTS,
): TelemetryEventRegistry {
  const byName = new Map<string, TelemetryEventDefinition>();
  for (const definition of definitions) {
    identifierSchema.parse(definition.name);
    if (definition.sampleRate < 0 || definition.sampleRate > 1) {
      throw new RangeError(`Sample rate for "${definition.name}" must be within [0, 1].`);
    }
    if (byName.has(definition.name)) throw new RangeError(`Duplicate telemetry event "${definition.name}".`);
    byName.set(definition.name, definition);
  }
  return {
    get: (name) => byName.get(name),
    all: () => [...byName.values()].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
  };
}

export const defaultTelemetryEventRegistry = loadTelemetryEventRegistry();
