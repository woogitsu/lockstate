import { z } from 'zod';
import { type DeepReadonly, identifierSchema } from '../../simulation/protocol/types';
import { type EntitlementEvent, ENTITLEMENT_EVENT_SCHEMA_VERSION, entitlementEventSchema } from './events';
import { MAX_SAVE_SLOTS_PER_GRANT, type EntitlementProductCatalog, defaultEntitlementProductCatalog } from './products';

/**
 * Server-side-only entitlement mutation path (ADR 0008 zone Z3 -> Z2).
 * This module is pure logic so it can be unit-tested in Node, but it is
 * only ever *deployed* inside a trusted server function holding the
 * provider signing secret and an elevated database role. Nothing here may
 * run in the browser, and nothing here reads a client-supplied identity:
 * the provider's signed payload is the only authority for whether money
 * moved.
 *
 * Deliberately provider-agnostic: choosing a payment provider and shipping
 * checkout are out of scope for issue #36 pending a commercial/legal
 * review, so the contract is defined in terms the eventual provider
 * adapter maps onto, not in one provider's vocabulary.
 */

export const paymentWebhookEventSchema = z
  .object({
    provider: identifierSchema,
    /** The provider's own event id: the idempotency key for the whole path. */
    providerEventId: identifierSchema,
    type: z.enum(['purchase-completed', 'refund-issued', 'subscription-cancelled', 'chargeback']),
    accountId: identifierSchema,
    productId: identifierSchema,
    quantity: z.number().int().min(1).max(MAX_SAVE_SLOTS_PER_GRANT),
    occurredAt: z.number().int().min(0),
  })
  .strict();
export type PaymentWebhookEvent = DeepReadonly<z.infer<typeof paymentWebhookEventSchema>>;

/**
 * Signature verification is a port: the real check is HMAC/asymmetric
 * verification with the provider's secret, which belongs to the deployment
 * environment, never to this repository. It runs over the *raw* body --
 * verifying a re-serialized object would verify our serializer, not the
 * provider's bytes.
 */
export interface WebhookSignatureVerifier {
  verify(input: {
    readonly provider: string;
    readonly rawBody: string;
    readonly signature: string;
  }): Promise<boolean> | boolean;
}

/** Append-only ledger storage, as seen by the trusted function. */
export interface EntitlementEventStore {
  findByProviderEvent(provider: string, providerEventId: string): Promise<EntitlementEvent | undefined>;
  append(event: EntitlementEvent): Promise<void>;
}

export type WebhookRejectionCode =
  | 'signature-invalid'
  | 'malformed-body'
  | 'invalid-shape'
  | 'provider-mismatch'
  | 'unknown-product'
  | 'quantity-out-of-range'
  | 'unknown-account'
  | 'stale-event';

export type EntitlementWebhookResult =
  | { readonly status: 'applied'; readonly event: EntitlementEvent }
  /** The same provider event arriving again: the original result, nothing written. */
  | { readonly status: 'duplicate'; readonly event: EntitlementEvent }
  | { readonly status: 'rejected'; readonly code: WebhookRejectionCode; readonly message: string };

export interface ProcessEntitlementWebhookInput {
  readonly provider: string;
  readonly rawBody: string;
  readonly signature: string;
  readonly verifier: WebhookSignatureVerifier;
  readonly store: EntitlementEventStore;
  readonly now: number;
  /** Server-generated event id; never derived from the request body. */
  readonly newEventId: () => string;
  readonly catalog?: EntitlementProductCatalog;
  readonly accountExists?: (accountId: string) => Promise<boolean> | boolean;
  /** Events older than this are refused outright (replay of an ancient capture). */
  readonly maxEventAgeMs?: number;
}

const DEFAULT_MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1_000;

/** Purchases grant; refunds, chargebacks and cancellations revoke (threat T7). */
function ledgerEventTypeFor(type: PaymentWebhookEvent['type']): EntitlementEvent['type'] {
  return type === 'purchase-completed' ? 'grant' : 'revoke';
}

function reject(code: WebhookRejectionCode, message: string): EntitlementWebhookResult {
  return { status: 'rejected', code, message };
}

/**
 * The ADR 0008 entry-point shape, in order: authenticate, validate,
 * deduplicate, apply, audit. Every step fails closed and no step mutates
 * anything until the one after it has passed.
 */
export async function processEntitlementWebhook(
  input: ProcessEntitlementWebhookInput,
): Promise<EntitlementWebhookResult> {
  // 1. Authenticate the raw bytes *before* parsing them: an unsigned body
  //    must never reach a parser, let alone a database.
  const signatureValid = await input.verifier.verify({
    provider: input.provider,
    rawBody: input.rawBody,
    signature: input.signature,
  });
  if (!signatureValid) return reject('signature-invalid', 'Webhook signature did not verify.');

  let body: unknown;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    return reject('malformed-body', 'Webhook body is not valid JSON.');
  }

  // 2. Validate.
  const parsed = paymentWebhookEventSchema.safeParse(body);
  if (!parsed.success) {
    return reject(
      'invalid-shape',
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; '),
    );
  }
  const event = parsed.data as PaymentWebhookEvent;

  if (event.provider !== input.provider) {
    return reject('provider-mismatch', 'Webhook body claims a different provider than the verified endpoint.');
  }

  const catalog = input.catalog ?? defaultEntitlementProductCatalog;
  const product = catalog.get(event.productId);
  if (product === undefined) {
    return reject('unknown-product', `Unknown entitlement product "${event.productId}".`);
  }

  // The provider states how many *units of the product* were bought; the
  // ledger records how many *capability units* that resolves to, so the
  // audit row keeps its meaning even if the product is later redefined.
  const grantedQuantity = product.quantity * event.quantity;
  if (grantedQuantity > MAX_SAVE_SLOTS_PER_GRANT) {
    return reject(
      'quantity-out-of-range',
      `A single event may not move more than ${MAX_SAVE_SLOTS_PER_GRANT} units (asked for ${grantedQuantity}).`,
    );
  }

  const maxAge = input.maxEventAgeMs ?? DEFAULT_MAX_EVENT_AGE_MS;
  if (event.occurredAt > input.now || input.now - event.occurredAt > maxAge) {
    return reject('stale-event', 'Webhook event timestamp is outside the accepted window.');
  }

  if (input.accountExists !== undefined && !(await input.accountExists(event.accountId))) {
    return reject('unknown-account', 'Webhook references an account that does not exist.');
  }

  // 3. Deduplicate on the provider's own id: a redelivered webhook returns
  //    the original outcome and writes nothing (threat T6).
  const existing = await input.store.findByProviderEvent(event.provider, event.providerEventId);
  if (existing !== undefined) return { status: 'duplicate', event: existing };

  // 4./5. Apply as an append, with the audit fields populated from the
  //       verified source rather than from anything a client said.
  const ledgerEvent = entitlementEventSchema.parse({
    schemaVersion: ENTITLEMENT_EVENT_SCHEMA_VERSION,
    eventId: input.newEventId(),
    accountId: event.accountId,
    productId: event.productId,
    type: ledgerEventTypeFor(event.type),
    source: 'payment-webhook',
    capability: product.capability,
    quantity: grantedQuantity,
    provider: event.provider,
    providerEventId: event.providerEventId,
    occurredAt: event.occurredAt,
    recordedAt: input.now,
    actor: { kind: 'provider', id: event.provider },
    reason: `${event.type} via ${event.provider}`,
  }) as EntitlementEvent;

  await input.store.append(ledgerEvent);
  return { status: 'applied', event: ledgerEvent };
}
