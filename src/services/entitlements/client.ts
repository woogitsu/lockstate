import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { KeyValueStore } from '../../shared/key-value-store';
import { BASE_SAVE_SLOTS, MAX_TOTAL_SAVE_SLOTS } from './products';
import {
  ENTITLEMENT_PROJECTION_VERSION,
  type EntitlementProjection,
  entitlementProjectionSchema,
  saveCachedEntitlementProjection,
} from './projection';

/**
 * Read-only client boundary for entitlements. There is deliberately no
 * write method anywhere in this file: the browser can read its own
 * entitlement row (RLS `entitlements_select_own`) and nothing else. Grants
 * and revocations happen exclusively through the trusted server path
 * (`webhook.ts`), which this layer cannot reach.
 */

export interface AccountEntitlementSnapshot {
  readonly accountId: string;
  readonly grantedSaveSlots: number;
  readonly ledgerRevision: number;
}

export interface EntitlementsReadClient {
  fetchEntitlements(accountId: string): Promise<AccountEntitlementSnapshot | undefined>;
}

export class MemoryEntitlementsReadClient implements EntitlementsReadClient {
  private readonly snapshots = new Map<string, AccountEntitlementSnapshot>();

  public set(snapshot: AccountEntitlementSnapshot): void {
    this.snapshots.set(snapshot.accountId, snapshot);
  }

  public async fetchEntitlements(accountId: string): Promise<AccountEntitlementSnapshot | undefined> {
    return this.snapshots.get(accountId);
  }
}

/** Shape of the `entitlements.value` JSONB projection row written only by the trusted path. */
const entitlementRowValueSchema = z
  .object({
    grantedSaveSlots: z.number().int().min(0).max(MAX_TOTAL_SAVE_SLOTS - BASE_SAVE_SLOTS),
    ledgerRevision: z.number().int().min(0),
  })
  .strict();

export const SAVE_SLOTS_ENTITLEMENT_KEY = 'save-slots' as const;

/**
 * Real adapter over the `entitlements` table. Like
 * `SupabaseCloudSaveClient` (docs/CLOUD_SAVE.md) it has no automated test
 * here: its contract is Postgres RLS, which cannot be meaningfully faked
 * in pure JS. Review it against the migrations; the *policy* it feeds is
 * tested through `MemoryEntitlementsReadClient`.
 *
 * A row that fails validation is treated as "no entitlement" rather than
 * being coerced: a malformed trusted row must degrade to the free tier,
 * never to a guess.
 */
export class SupabaseEntitlementsReadClient implements EntitlementsReadClient {
  public constructor(private readonly supabase: SupabaseClient) {}

  public async fetchEntitlements(accountId: string): Promise<AccountEntitlementSnapshot | undefined> {
    const { data, error } = await this.supabase
      .from('entitlements')
      .select('key, value')
      .eq('user_id', accountId)
      .eq('key', SAVE_SLOTS_ENTITLEMENT_KEY)
      .maybeSingle();
    if (error !== null) throw new Error(`Failed to read entitlements: ${error.message}`);
    if (data === null) return { accountId, grantedSaveSlots: 0, ledgerRevision: 0 };

    const parsed = entitlementRowValueSchema.safeParse(data.value);
    if (!parsed.success) return { accountId, grantedSaveSlots: 0, ledgerRevision: 0 };
    return { accountId, grantedSaveSlots: parsed.data.grantedSaveSlots, ledgerRevision: parsed.data.ledgerRevision };
  }
}

export interface RefreshEntitlementProjectionInput {
  readonly client: EntitlementsReadClient;
  readonly accountId: string;
  /** Client clock at the moment of the trusted read; becomes the projection's `verifiedAt`. */
  readonly now: number;
  readonly store?: KeyValueStore;
}

/**
 * Confirms entitlements against the server and refreshes the local cache.
 *
 * `verifiedAt` is the time of *this read*, not the row's own timestamp: an
 * entitlement granted a year ago and confirmed a second ago is current,
 * while one confirmed a month ago is stale no matter when it was granted.
 *
 * Returns `undefined` when the server cannot be reached, leaving any
 * existing cache untouched so `evaluateSaveSlotEntitlement` can apply the
 * offline grace window instead of the caller inventing a fallback.
 */
export async function refreshEntitlementProjection(
  input: RefreshEntitlementProjectionInput,
): Promise<EntitlementProjection | undefined> {
  let snapshot: AccountEntitlementSnapshot | undefined;
  try {
    snapshot = await input.client.fetchEntitlements(input.accountId);
  } catch {
    return undefined;
  }
  if (snapshot === undefined) return undefined;

  const projection = entitlementProjectionSchema.parse({
    version: ENTITLEMENT_PROJECTION_VERSION,
    accountId: snapshot.accountId,
    grantedSaveSlots: snapshot.grantedSaveSlots,
    ledgerRevision: snapshot.ledgerRevision,
    verifiedAt: input.now,
  }) as EntitlementProjection;

  if (input.store !== undefined) saveCachedEntitlementProjection(input.store, projection);
  return projection;
}
