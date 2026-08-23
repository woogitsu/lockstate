import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../../src/shared/key-value-store';
import {
  BASE_SAVE_SLOTS,
  DEFAULT_ENTITLEMENT_TRUST_POLICY,
  type EntitlementEvent,
  type EntitlementEventStore,
  MAX_TOTAL_SAVE_SLOTS,
  MemoryEntitlementsReadClient,
  buildEntitlementAuditTrail,
  clearCachedEntitlementProjection,
  evaluateSaveSlotAccess,
  evaluateSaveSlotEntitlement,
  foldEntitlementEvents,
  loadCachedEntitlementProjection,
  processEntitlementWebhook,
  projectionFromState,
  refreshEntitlementProjection,
  saveCachedEntitlementProjection,
} from '../../src/services/entitlements';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

function grant(overrides: Partial<EntitlementEvent> = {}): EntitlementEvent {
  return {
    schemaVersion: 1,
    eventId: 'event-1',
    accountId: 'account-1',
    productId: 'product.save-slots.plus-5',
    type: 'grant',
    source: 'payment-webhook',
    capability: 'save-slots',
    quantity: 5,
    provider: 'provider.test',
    providerEventId: 'provider-event-1',
    occurredAt: NOW - DAY,
    recordedAt: NOW - DAY,
    actor: { kind: 'provider', id: 'provider.test' },
    reason: 'purchase-completed via provider.test',
    ...overrides,
  };
}

describe('entitlement ledger fold', () => {
  it('grants capacity above the free tier', () => {
    const state = foldEntitlementEvents('account-1', [grant()], NOW);
    expect(state.saveSlotCapacity).toBe(BASE_SAVE_SLOTS + 5);
    expect(state.grantedSaveSlots).toBe(5);
    expect(state.ledgerRevision).toBe(1);
  });

  it('is idempotent: the same event id twice cannot double a grant', () => {
    const state = foldEntitlementEvents('account-1', [grant(), grant()], NOW);
    expect(state.saveSlotCapacity).toBe(BASE_SAVE_SLOTS + 5);
    expect(state.ledgerRevision).toBe(1);
  });

  it('produces the same state regardless of storage order', () => {
    const events = [
      grant({ eventId: 'event-2', occurredAt: NOW - HOUR, recordedAt: NOW - HOUR, providerEventId: 'provider-event-2' }),
      grant(),
    ];
    const forwards = foldEntitlementEvents('account-1', events, NOW);
    const backwards = foldEntitlementEvents('account-1', [...events].reverse(), NOW);
    expect(backwards).toEqual(forwards);
    expect(forwards.saveSlotCapacity).toBe(BASE_SAVE_SLOTS + 10);
  });

  it('applies a revocation (refund or chargeback) and never goes negative', () => {
    const events = [
      grant(),
      grant({
        eventId: 'event-2',
        type: 'revoke',
        quantity: 25,
        occurredAt: NOW - HOUR,
        recordedAt: NOW - HOUR,
        providerEventId: 'provider-event-2',
        reason: 'refund-issued via provider.test',
      }),
    ];
    const state = foldEntitlementEvents('account-1', events, NOW);
    expect(state.saveSlotCapacity).toBe(BASE_SAVE_SLOTS);
    expect(state.balances).toEqual([]);
  });

  it('ignores an expired grant without needing a background job', () => {
    const expired = grant({ expiresAt: NOW - HOUR });
    expect(foldEntitlementEvents('account-1', [expired], NOW).saveSlotCapacity).toBe(BASE_SAVE_SLOTS);
    expect(foldEntitlementEvents('account-1', [expired], NOW - 2 * HOUR).saveSlotCapacity).toBe(BASE_SAVE_SLOTS + 5);
  });

  it('ignores events belonging to another account', () => {
    const state = foldEntitlementEvents('account-1', [grant({ accountId: 'account-2' })], NOW);
    expect(state.saveSlotCapacity).toBe(BASE_SAVE_SLOTS);
  });

  it('clamps a runaway or hostile event stream to the documented ceiling', () => {
    const events = Array.from({ length: 40 }, (_unused, index) =>
      grant({ eventId: `event-${index}`, providerEventId: `provider-event-${index}`, quantity: 25 }),
    );
    expect(foldEntitlementEvents('account-1', events, NOW).saveSlotCapacity).toBe(MAX_TOTAL_SAVE_SLOTS);
  });
});

describe('entitlement audit trail', () => {
  it('records the balance each event moved, including events that did not apply', () => {
    const events = [
      grant(),
      grant({
        eventId: 'event-2',
        expiresAt: NOW - HOUR,
        providerEventId: 'provider-event-2',
        occurredAt: NOW - 2 * DAY,
        recordedAt: NOW - 2 * DAY,
      }),
      grant({
        eventId: 'event-3',
        type: 'revoke',
        quantity: 5,
        occurredAt: NOW - HOUR,
        recordedAt: NOW - HOUR,
        providerEventId: 'provider-event-3',
        reason: 'refund-issued via provider.test',
      }),
    ];

    const trail = buildEntitlementAuditTrail('account-1', events, NOW);
    expect(trail.map((record) => [record.eventId, record.applied, record.quantityBefore, record.quantityAfter])).toEqual([
      ['event-2', false, 0, 0],
      ['event-1', true, 0, 5],
      ['event-3', true, 5, 0],
    ]);
    expect(trail[1]?.provider).toBe('provider.test');
    expect(trail[2]?.reason).toContain('refund-issued');
  });
});

describe('entitlement webhook processing', () => {
  class MemoryEventStore implements EntitlementEventStore {
    public readonly appended: EntitlementEvent[] = [];

    public async findByProviderEvent(provider: string, providerEventId: string): Promise<EntitlementEvent | undefined> {
      return this.appended.find((event) => event.provider === provider && event.providerEventId === providerEventId);
    }

    public async append(event: EntitlementEvent): Promise<void> {
      this.appended.push(event);
    }
  }

  const body = JSON.stringify({
    provider: 'provider.test',
    providerEventId: 'provider-event-1',
    type: 'purchase-completed',
    accountId: 'account-1',
    productId: 'product.save-slots.plus-5',
    quantity: 1,
    occurredAt: NOW - HOUR,
  });

  function processWith(overrides: Partial<Parameters<typeof processEntitlementWebhook>[0]> = {}) {
    const store = overrides.store ?? new MemoryEventStore();
    return {
      store,
      result: processEntitlementWebhook({
        provider: 'provider.test',
        rawBody: body,
        signature: 'signature',
        verifier: { verify: () => true },
        store,
        now: NOW,
        newEventId: () => 'event-1',
        ...overrides,
      }),
    };
  }

  it('records a grant for a signed purchase, resolving product units into capability units', async () => {
    const { store, result } = processWith();
    await expect(result).resolves.toMatchObject({ status: 'applied' });
    const appended = (store as MemoryEventStore).appended;
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: 'grant',
      capability: 'save-slots',
      quantity: 5,
      source: 'payment-webhook',
      actor: { kind: 'provider', id: 'provider.test' },
    });
  });

  it('refuses an unsigned payload before it is even parsed', async () => {
    let parsed = false;
    const result = await processEntitlementWebhook({
      provider: 'provider.test',
      rawBody: body,
      signature: 'wrong',
      verifier: {
        verify: () => {
          parsed = true;
          return false;
        },
      },
      store: new MemoryEventStore(),
      now: NOW,
      newEventId: () => 'event-1',
    });
    expect(result).toMatchObject({ status: 'rejected', code: 'signature-invalid' });
    expect(parsed).toBe(true);
  });

  it('is idempotent across redelivery of the same provider event', async () => {
    const store = new MemoryEventStore();
    await processWith({ store }).result;
    const second = await processWith({ store, newEventId: () => 'event-2' }).result;
    expect(second.status).toBe('duplicate');
    expect(store.appended).toHaveLength(1);
  });

  it('records refunds and chargebacks as revocations', async () => {
    const refundBody = JSON.stringify({
      provider: 'provider.test',
      providerEventId: 'provider-event-2',
      type: 'refund-issued',
      accountId: 'account-1',
      productId: 'product.save-slots.plus-5',
      quantity: 1,
      occurredAt: NOW - HOUR,
    });
    const { store, result } = processWith({ rawBody: refundBody });
    await result;
    expect((store as MemoryEventStore).appended[0]).toMatchObject({ type: 'revoke', quantity: 5 });
  });

  it.each([
    ['malformed-body', { rawBody: 'not json' }],
    ['invalid-shape', { rawBody: JSON.stringify({ provider: 'provider.test' }) }],
    [
      'unknown-product',
      {
        rawBody: JSON.stringify({
          provider: 'provider.test',
          providerEventId: 'provider-event-9',
          type: 'purchase-completed',
          accountId: 'account-1',
          productId: 'product.unlimited-everything',
          quantity: 1,
          occurredAt: NOW - HOUR,
        }),
      },
    ],
    [
      'quantity-out-of-range',
      {
        rawBody: JSON.stringify({
          provider: 'provider.test',
          providerEventId: 'provider-event-8',
          type: 'purchase-completed',
          accountId: 'account-1',
          productId: 'product.save-slots.plus-10',
          quantity: 20,
          occurredAt: NOW - HOUR,
        }),
      },
    ],
    ['stale-event', { now: NOW + 400 * DAY }],
  ])('rejects a %s payload without writing to the ledger', async (code, overrides) => {
    const { store, result } = processWith(overrides);
    await expect(result).resolves.toMatchObject({ status: 'rejected', code });
    expect((store as MemoryEventStore).appended).toHaveLength(0);
  });

  it('rejects a body claiming a different provider than the verified endpoint', async () => {
    const foreign = JSON.stringify({
      provider: 'provider.other',
      providerEventId: 'provider-event-3',
      type: 'purchase-completed',
      accountId: 'account-1',
      productId: 'product.save-slots.plus-5',
      quantity: 1,
      occurredAt: NOW - HOUR,
    });
    const { result } = processWith({ rawBody: foreign });
    await expect(result).resolves.toMatchObject({ status: 'rejected', code: 'provider-mismatch' });
  });

  it('rejects an event for an account that does not exist', async () => {
    const { result } = processWith({ accountExists: () => false });
    await expect(result).resolves.toMatchObject({ status: 'rejected', code: 'unknown-account' });
  });
});

describe('client entitlement projection', () => {
  const projection = projectionFromState(foldEntitlementEvents('account-1', [grant()], NOW));

  it('trusts a freshly confirmed projection', () => {
    const view = evaluateSaveSlotEntitlement({ projection, now: NOW });
    expect(view).toMatchObject({ tier: 'verified', reason: 'confirmed', capacity: BASE_SAVE_SLOTS + 5 });
  });

  it('keeps paid capacity through the offline grace window, but labels it unverified', () => {
    const view = evaluateSaveSlotEntitlement({ projection, now: NOW + 10 * DAY });
    expect(view).toMatchObject({ tier: 'cached', reason: 'offline-grace', capacity: BASE_SAVE_SLOTS + 5 });
  });

  it('falls back to the free tier once the grace window expires', () => {
    const now = NOW + DEFAULT_ENTITLEMENT_TRUST_POLICY.graceWindowMs + 1;
    expect(evaluateSaveSlotEntitlement({ projection, now })).toMatchObject({
      tier: 'base',
      reason: 'grace-expired',
      capacity: BASE_SAVE_SLOTS,
      grantedSaveSlots: 0,
    });
  });

  it('never invents paid rights when there is no projection at all', () => {
    expect(evaluateSaveSlotEntitlement({ projection: undefined, now: NOW })).toMatchObject({
      tier: 'base',
      reason: 'no-projection',
      capacity: BASE_SAVE_SLOTS,
    });
  });

  it('refuses a projection dated implausibly far into the future', () => {
    const forged = { ...projection, verifiedAt: NOW + 400 * DAY };
    expect(evaluateSaveSlotEntitlement({ projection: forged, now: NOW })).toMatchObject({
      tier: 'base',
      reason: 'implausible-timestamp',
    });
  });

  it('discards a locally edited cache that claims more than the ceiling allows', () => {
    const store = new MemoryStore();
    store.setItem(
      'lockstate.entitlements.projection',
      JSON.stringify({ version: 1, accountId: 'account-1', grantedSaveSlots: 9_000, ledgerRevision: 1, verifiedAt: NOW }),
    );
    expect(loadCachedEntitlementProjection(store, 'account-1')).toBeUndefined();
  });

  it('discards a cache belonging to a different account', () => {
    const store = new MemoryStore();
    saveCachedEntitlementProjection(store, projection);
    expect(loadCachedEntitlementProjection(store, 'account-2')).toBeUndefined();
    expect(loadCachedEntitlementProjection(store, 'account-1')).toEqual(projection);
  });

  it('treats a cleared cache as absent', () => {
    const store = new MemoryStore();
    saveCachedEntitlementProjection(store, projection);
    clearCachedEntitlementProjection(store);
    expect(loadCachedEntitlementProjection(store, 'account-1')).toBeUndefined();
  });

  it('blocks new slots when over capacity but never locks existing prisons', () => {
    const view = evaluateSaveSlotEntitlement({ projection, now: NOW + 400 * DAY });
    const access = evaluateSaveSlotAccess(view, 8);
    expect(access).toMatchObject({
      capacity: BASE_SAVE_SLOTS,
      canCreateNewSlot: false,
      overCapacitySlots: 3,
      existingSlotsRemainPlayable: true,
    });
  });

  it('allows a new slot while capacity remains', () => {
    const view = evaluateSaveSlotEntitlement({ projection, now: NOW });
    expect(evaluateSaveSlotAccess(view, 9)).toMatchObject({ canCreateNewSlot: true, overCapacitySlots: 0 });
  });
});

describe('projection refresh', () => {
  it('stamps the projection with the time of the read, not the time of the grant', async () => {
    const client = new MemoryEntitlementsReadClient();
    client.set({ accountId: 'account-1', grantedSaveSlots: 5, ledgerRevision: 3 });
    const store = new MemoryStore();

    const projection = await refreshEntitlementProjection({ client, accountId: 'account-1', now: NOW, store });
    expect(projection).toMatchObject({ grantedSaveSlots: 5, ledgerRevision: 3, verifiedAt: NOW });
    expect(loadCachedEntitlementProjection(store, 'account-1')).toEqual(projection);
  });

  it('leaves the existing cache intact when the server cannot be reached', async () => {
    const store = new MemoryStore();
    const cached = projectionFromState(foldEntitlementEvents('account-1', [grant()], NOW));
    saveCachedEntitlementProjection(store, cached);

    const failing = {
      fetchEntitlements: async (): Promise<never> => {
        throw new Error('offline');
      },
    };
    await expect(refreshEntitlementProjection({ client: failing, accountId: 'account-1', now: NOW, store })).resolves.toBeUndefined();
    expect(loadCachedEntitlementProjection(store, 'account-1')).toEqual(cached);
  });
});
