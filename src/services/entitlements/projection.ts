import { z } from 'zod';
import type { KeyValueStore } from '../../shared/key-value-store';
import { type DeepReadonly, identifierSchema } from '../../simulation/protocol/types';
import type { EntitlementState } from './ledger';
import { BASE_SAVE_SLOTS, MAX_TOTAL_SAVE_SLOTS, clampSaveSlotCapacity } from './products';

/**
 * The client-side *projection* of server-authoritative entitlements
 * (ADR 0008): a cache, never a source. Three properties make it safe:
 *
 * 1. it is validated and clamped on load, so an edited localStorage entry
 *    cannot express more than `MAX_TOTAL_SAVE_SLOTS` (threat T5);
 * 2. it expires, and expiry can only ever *reduce* what the client
 *    believes it may do -- never extend it;
 * 3. it is advisory: the trusted function that creates a cloud slot
 *    re-checks capacity server-side, so a forged cache buys a misleading
 *    UI, not a right.
 */
export const ENTITLEMENT_PROJECTION_VERSION = 1 as const;

const MAX_GRANTED_SAVE_SLOTS = MAX_TOTAL_SAVE_SLOTS - BASE_SAVE_SLOTS;

export const entitlementProjectionSchema = z
  .object({
    version: z.literal(ENTITLEMENT_PROJECTION_VERSION),
    accountId: identifierSchema,
    /** Additional slots beyond the free tier, already clamped server-side. */
    grantedSaveSlots: z.number().int().min(0).max(MAX_GRANTED_SAVE_SLOTS),
    ledgerRevision: z.number().int().min(0),
    /** When a trusted read last confirmed this. Drives every staleness decision below. */
    verifiedAt: z.number().int().min(0),
  })
  .strict();
export type EntitlementProjection = DeepReadonly<z.infer<typeof entitlementProjectionSchema>>;

export function projectionFromState(state: EntitlementState): EntitlementProjection {
  return entitlementProjectionSchema.parse({
    version: ENTITLEMENT_PROJECTION_VERSION,
    accountId: state.accountId,
    grantedSaveSlots: Math.min(MAX_GRANTED_SAVE_SLOTS, state.grantedSaveSlots),
    ledgerRevision: state.ledgerRevision,
    verifiedAt: state.computedAt,
  }) as EntitlementProjection;
}

export interface EntitlementTrustPolicy {
  /** Within this age the projection is treated as current. */
  readonly freshWindowMs: number;
  /** Beyond `freshWindowMs` but within this, paid capacity still applies but is labelled unverified. */
  readonly graceWindowMs: number;
  /** A projection dated further into the future than this is not trusted at all. */
  readonly maxClockSkewMs: number;
}

/**
 * A generous grace window is deliberate: a paying player who is offline
 * for a fortnight must not lose access to slots they bought. The window is
 * long enough for ordinary offline play and short enough that a revoked or
 * refunded entitlement cannot persist indefinitely without a server
 * confirmation (threat T7).
 */
export const DEFAULT_ENTITLEMENT_TRUST_POLICY: EntitlementTrustPolicy = {
  freshWindowMs: 24 * 60 * 60 * 1_000,
  graceWindowMs: 30 * 24 * 60 * 60 * 1_000,
  maxClockSkewMs: 60 * 60 * 1_000,
};

export type EntitlementTrustTier = 'verified' | 'cached' | 'base';

export type EntitlementTrustReason =
  | 'confirmed'
  | 'offline-grace'
  | 'no-projection'
  | 'grace-expired'
  | 'implausible-timestamp';

export interface SaveSlotEntitlementView {
  readonly tier: EntitlementTrustTier;
  readonly reason: EntitlementTrustReason;
  readonly capacity: number;
  readonly grantedSaveSlots: number;
  /** Age of the projection in ms, `undefined` when there is none. */
  readonly ageMs: number | undefined;
}

export interface EvaluateSaveSlotEntitlementInput {
  readonly projection: EntitlementProjection | undefined;
  readonly now: number;
  readonly policy?: EntitlementTrustPolicy;
}

function baseView(reason: EntitlementTrustReason, ageMs: number | undefined): SaveSlotEntitlementView {
  return { tier: 'base', reason, capacity: BASE_SAVE_SLOTS, grantedSaveSlots: 0, ageMs };
}

/**
 * Degradation ladder. Every unhappy path lands on the free tier, so the
 * failure mode of "we cannot reach the server" is a smaller number of
 * slots, never a larger one -- the client can never invent a paid right.
 */
export function evaluateSaveSlotEntitlement(input: EvaluateSaveSlotEntitlementInput): SaveSlotEntitlementView {
  const policy = input.policy ?? DEFAULT_ENTITLEMENT_TRUST_POLICY;
  const { projection } = input;
  if (projection === undefined) return baseView('no-projection', undefined);

  const ageMs = input.now - projection.verifiedAt;
  // Dated into the future beyond tolerable clock skew: either a tampered
  // cache buying itself an unexpiring grant, or a clock so wrong that no
  // staleness decision here is meaningful. Both degrade to the free tier.
  if (ageMs < -policy.maxClockSkewMs) return baseView('implausible-timestamp', ageMs);

  const capacity = clampSaveSlotCapacity(BASE_SAVE_SLOTS + projection.grantedSaveSlots);
  const grantedSaveSlots = capacity - BASE_SAVE_SLOTS;

  if (ageMs <= policy.freshWindowMs) {
    return { tier: 'verified', reason: 'confirmed', capacity, grantedSaveSlots, ageMs };
  }
  if (ageMs <= policy.graceWindowMs) {
    return { tier: 'cached', reason: 'offline-grace', capacity, grantedSaveSlots, ageMs };
  }
  return baseView('grace-expired', ageMs);
}

export interface SaveSlotAccess {
  readonly capacity: number;
  readonly tier: EntitlementTrustTier;
  readonly usedSlots: number;
  readonly canCreateNewSlot: boolean;
  /** How many existing slots exceed the currently trusted capacity. */
  readonly overCapacitySlots: number;
  /**
   * Invariant, asserted by tests: losing capacity never deletes, locks or
   * hides an existing prison. Over-capacity only stops *new* slots from
   * being created until the entitlement is confirmed again. Destroying
   * player data because a cache expired would be a far worse failure than
   * briefly showing an over-capacity account.
   */
  readonly existingSlotsRemainPlayable: true;
}

export function evaluateSaveSlotAccess(view: SaveSlotEntitlementView, usedSlots: number): SaveSlotAccess {
  const used = Math.max(0, Math.floor(usedSlots));
  return {
    capacity: view.capacity,
    tier: view.tier,
    usedSlots: used,
    canCreateNewSlot: used < view.capacity,
    overCapacitySlots: Math.max(0, used - view.capacity),
    existingSlotsRemainPlayable: true,
  };
}

const PROJECTION_STORAGE_KEY = 'lockstate.entitlements.projection';

/**
 * Loads and re-validates the cached projection. Anything unexpected --
 * corrupt JSON, a wrong schema version, an out-of-range grant, or a
 * projection belonging to a different account -- is treated as absent,
 * which by the ladder above means the free tier.
 */
export function loadCachedEntitlementProjection(
  store: KeyValueStore,
  accountId: string,
): EntitlementProjection | undefined {
  const raw = store.getItem(PROJECTION_STORAGE_KEY);
  if (raw === null) return undefined;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const parsed = entitlementProjectionSchema.safeParse(parsedJson);
  if (!parsed.success) return undefined;
  if (parsed.data.accountId !== accountId) return undefined;
  return parsed.data as EntitlementProjection;
}

export function saveCachedEntitlementProjection(store: KeyValueStore, projection: EntitlementProjection): void {
  store.setItem(PROJECTION_STORAGE_KEY, JSON.stringify(entitlementProjectionSchema.parse(projection)));
}

/**
 * Called on sign-out/account switch: a projection must never outlive its
 * account's session. `KeyValueStore` intentionally has no `removeItem`
 * (see src/shared/key-value-store.ts), so the slot is blanked; an empty
 * value fails to parse above and is therefore treated as absent, which is
 * exactly the intended "no entitlement information" state.
 */
export function clearCachedEntitlementProjection(store: KeyValueStore): void {
  store.setItem(PROJECTION_STORAGE_KEY, '');
}
