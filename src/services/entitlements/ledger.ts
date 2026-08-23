import type { EntitlementCapability } from './products';
import { BASE_SAVE_SLOTS, clampSaveSlotCapacity } from './products';
import { type EntitlementEvent, compareEntitlementEvents } from './events';

/**
 * Deterministic fold of the append-only ledger into the state a projection
 * (and the `entitlements` table) is allowed to show. Pure and total: the
 * same events plus the same `now` always produce the same state, in any
 * storage order, with duplicates ignored rather than throwing -- a trusted
 * service must not be DoS-able by one bad row.
 *
 * The fold reads only what each event recorded at write time (capability,
 * quantity), never the current product catalog: replaying history through
 * today's catalog would let a catalog edit silently rewrite what an
 * account was granted last year.
 */

export interface EntitlementBalance {
  readonly productId: string;
  readonly capability: EntitlementCapability;
  /** Net granted units after revocations and expiry, never negative. */
  readonly quantity: number;
}

export interface EntitlementState {
  readonly accountId: string;
  readonly balances: readonly EntitlementBalance[];
  /** Additional save slots beyond `BASE_SAVE_SLOTS`, already clamped. */
  readonly grantedSaveSlots: number;
  /** Total usable slots, including the free tier. */
  readonly saveSlotCapacity: number;
  /** Number of distinct ledger events folded; a monotonic staleness/versioning handle. */
  readonly ledgerRevision: number;
  readonly computedAt: number;
}

export interface FoldEntitlementEventsOptions {
  /** Events dated after `now` are not yet effective. */
  readonly ignoreFutureEvents?: boolean;
}

interface ProductAccumulator {
  readonly capability: EntitlementCapability;
  quantity: number;
}

function orderedUniqueEvents(
  accountId: string,
  events: readonly EntitlementEvent[],
  now: number,
  ignoreFutureEvents: boolean,
): readonly EntitlementEvent[] {
  // Idempotency at fold level as well as write level: the same event id
  // twice must not change the balance even if it reached storage twice.
  const unique = new Map<string, EntitlementEvent>();
  for (const event of events) {
    if (event.accountId !== accountId) continue;
    if (ignoreFutureEvents && event.occurredAt > now) continue;
    if (!unique.has(event.eventId)) unique.set(event.eventId, event);
  }
  return [...unique.values()].sort(compareEntitlementEvents);
}

/** A grant past its expiry contributes nothing; expiry is evaluated here, not by a background job. */
function isEffectiveGrant(event: EntitlementEvent, now: number): boolean {
  return event.expiresAt === undefined || event.expiresAt > now;
}

export function foldEntitlementEvents(
  accountId: string,
  events: readonly EntitlementEvent[],
  now: number,
  options: FoldEntitlementEventsOptions = {},
): EntitlementState {
  const ordered = orderedUniqueEvents(accountId, events, now, options.ignoreFutureEvents ?? true);
  const byProduct = new Map<string, ProductAccumulator>();

  for (const event of ordered) {
    const accumulator = byProduct.get(event.productId) ?? { capability: event.capability, quantity: 0 };
    if (event.type === 'grant') {
      if (!isEffectiveGrant(event, now)) {
        byProduct.set(event.productId, accumulator);
        continue;
      }
      accumulator.quantity += event.quantity;
    } else {
      accumulator.quantity = Math.max(0, accumulator.quantity - event.quantity);
    }
    byProduct.set(event.productId, accumulator);
  }

  const balances: EntitlementBalance[] = [];
  let saveSlots = 0;
  const sorted = [...byProduct.entries()].sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  for (const [productId, accumulator] of sorted) {
    if (accumulator.quantity <= 0) continue;
    balances.push({ productId, capability: accumulator.capability, quantity: accumulator.quantity });
    if (accumulator.capability === 'save-slots') saveSlots += accumulator.quantity;
  }

  const saveSlotCapacity = clampSaveSlotCapacity(BASE_SAVE_SLOTS + saveSlots);
  return {
    accountId,
    balances,
    grantedSaveSlots: saveSlotCapacity - BASE_SAVE_SLOTS,
    saveSlotCapacity,
    ledgerRevision: ordered.length,
    computedAt: now,
  };
}

export interface EntitlementAuditRecord {
  readonly eventId: string;
  readonly occurredAt: number;
  readonly recordedAt: number;
  readonly productId: string;
  readonly capability: EntitlementCapability;
  readonly type: EntitlementEvent['type'];
  readonly source: EntitlementEvent['source'];
  readonly actor: EntitlementEvent['actor'];
  readonly reason: string;
  readonly provider: string | undefined;
  readonly providerEventId: string | undefined;
  readonly quantityBefore: number;
  readonly quantityAfter: number;
  readonly applied: boolean;
}

/**
 * The audit view issue #36 asks for: every event in deterministic order
 * with the balance it moved, *including* events that did not apply (an
 * expired grant, one dated in the future) and therefore left the number
 * unchanged. An audit trail that silently omits non-applied events cannot
 * answer "why is this account's capacity not what support expected".
 */
export function buildEntitlementAuditTrail(
  accountId: string,
  events: readonly EntitlementEvent[],
  now: number,
): readonly EntitlementAuditRecord[] {
  const ordered = orderedUniqueEvents(accountId, events, now, false);
  const quantities = new Map<string, number>();

  return ordered.map((event) => {
    const before = quantities.get(event.productId) ?? 0;
    const applied = event.occurredAt <= now && (event.type === 'revoke' || isEffectiveGrant(event, now));

    let after = before;
    if (applied) {
      after = event.type === 'grant' ? before + event.quantity : Math.max(0, before - event.quantity);
      quantities.set(event.productId, after);
    }

    return {
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      recordedAt: event.recordedAt,
      productId: event.productId,
      capability: event.capability,
      type: event.type,
      source: event.source,
      actor: event.actor,
      reason: event.reason,
      provider: event.provider,
      providerEventId: event.providerEventId,
      quantityBefore: before,
      quantityAfter: after,
      applied,
    };
  });
}
