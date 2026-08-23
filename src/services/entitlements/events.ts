import { z } from 'zod';
import { type DeepReadonly, identifierSchema } from '../../simulation/protocol/types';
import { MAX_SAVE_SLOTS_PER_GRANT, entitlementCapabilitySchema } from './products';

/**
 * The entitlement ledger is append-only and is the *source of truth*
 * (ADR 0008 step 5): the `entitlements` projection is derived from it and
 * never written independently. That is what makes a grant auditable --
 * "why does this account have 10 slots" is answered by replaying rows, not
 * by trusting a mutable counter nobody can explain.
 */
export const ENTITLEMENT_EVENT_SCHEMA_VERSION = 1 as const;

export const entitlementEventTypeSchema = z.enum(['grant', 'revoke']);
export type EntitlementEventType = z.infer<typeof entitlementEventTypeSchema>;

export const entitlementEventSourceSchema = z.enum([
  'payment-webhook',
  'promotional',
  'support-adjustment',
  'migration',
]);
export type EntitlementEventSource = z.infer<typeof entitlementEventSourceSchema>;

export const entitlementActorSchema = z
  .object({
    /** `provider` = an authenticated Z3 callback; `staff` = a named human; `system` = our own automation. Never `player`. */
    kind: z.enum(['provider', 'staff', 'system']),
    id: identifierSchema,
  })
  .strict();

export const entitlementEventSchema = z
  .object({
    schemaVersion: z.literal(ENTITLEMENT_EVENT_SCHEMA_VERSION),
    /** Server-generated. A client-supplied event id would be an idempotency-key forgery primitive. */
    eventId: identifierSchema,
    accountId: identifierSchema,
    productId: identifierSchema,
    type: entitlementEventTypeSchema,
    source: entitlementEventSourceSchema,
    /**
     * The capability and unit count are *resolved at write time* and
     * stored on the row, not looked up from the product catalog when the
     * ledger is read. An audit trail must say what was actually granted
     * then, immune to a later catalog edit changing history retroactively.
     */
    capability: entitlementCapabilitySchema,
    quantity: z.number().int().min(1).max(MAX_SAVE_SLOTS_PER_GRANT),
    /** Provider-scoped idempotency key; unique together with `provider` (threat T6). */
    provider: identifierSchema.optional(),
    providerEventId: identifierSchema.optional(),
    /** When the fact happened at its source; `recordedAt` is when we learned about it. */
    occurredAt: z.number().int().min(0),
    recordedAt: z.number().int().min(0),
    actor: entitlementActorSchema,
    /** Free text for humans reading an audit trail; never parsed for behavior. */
    reason: z.string().min(1).max(200),
    /** Absent means "does not expire". Expiry is evaluated at fold time, not by a background job. */
    expiresAt: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.recordedAt < event.occurredAt) {
      ctx.addIssue({ code: 'custom', message: 'recordedAt must not precede occurredAt.', path: ['recordedAt'] });
    }
    if ((event.provider === undefined) !== (event.providerEventId === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'provider and providerEventId must be supplied together.',
        path: ['providerEventId'],
      });
    }
    if (event.source === 'payment-webhook' && event.provider === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'A payment-webhook event must carry its provider idempotency key.',
        path: ['provider'],
      });
    }
    if (event.expiresAt !== undefined && event.expiresAt <= event.occurredAt) {
      ctx.addIssue({ code: 'custom', message: 'expiresAt must be after occurredAt.', path: ['expiresAt'] });
    }
  });
export type EntitlementEvent = DeepReadonly<z.infer<typeof entitlementEventSchema>>;

export type EntitlementEventDecodeResult =
  | { readonly ok: true; readonly event: EntitlementEvent }
  | { readonly ok: false; readonly message: string };

export function decodeEntitlementEvent(input: unknown): EntitlementEventDecodeResult {
  const parsed = entitlementEventSchema.safeParse(input);
  if (parsed.success) return { ok: true, event: parsed.data as EntitlementEvent };
  return {
    ok: false,
    message: parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; '),
  };
}

/**
 * Deterministic total order for folding and for audit output: by when the
 * fact happened, then by event id. Storage order (insertion, uuid order,
 * whatever a query returns) must never decide the resulting balance.
 */
export function compareEntitlementEvents(left: EntitlementEvent, right: EntitlementEvent): number {
  if (left.occurredAt !== right.occurredAt) return left.occurredAt - right.occurredAt;
  if (left.eventId === right.eventId) return 0;
  return left.eventId < right.eventId ? -1 : 1;
}
