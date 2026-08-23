import { z } from 'zod';
import { type DeepReadonly, identifierSchema } from '../../simulation/protocol/types';

/**
 * Entitlements are *account metadata*, never simulation state
 * (docs/ARCHITECTURE.md "Authentication"): nothing here may be embedded in
 * a prison save, and no simulation system may read it.
 */

/** Free tier, per README ("five free save slots is the current product direction"). */
export const BASE_SAVE_SLOTS = 5 as const;

/**
 * Absolute ceiling on total slots, applied to *every* computed capacity --
 * including one folded from a real server ledger and one restored from a
 * tampered local cache (threat T5). A bug or a forged cache can therefore
 * inflate capacity by at most this much, not without bound.
 */
export const MAX_TOTAL_SAVE_SLOTS = 50 as const;

/** Additional slots any single grant may carry; bounds a malformed or hostile webhook. */
export const MAX_SAVE_SLOTS_PER_GRANT = 25 as const;

export const entitlementCapabilitySchema = z.enum(['save-slots']);
export type EntitlementCapability = z.infer<typeof entitlementCapabilitySchema>;

export const entitlementProductSchema = z
  .object({
    productId: identifierSchema,
    capability: entitlementCapabilitySchema,
    /** How much of the capability one grant of this product confers. */
    quantity: z.number().int().min(1).max(MAX_SAVE_SLOTS_PER_GRANT),
    /** A `LocalizationKey` (src/content/localization.ts), never a display label (ADR 0011). */
    nameKey: identifierSchema,
  })
  .strict();
export type EntitlementProduct = DeepReadonly<z.infer<typeof entitlementProductSchema>>;

/**
 * Product *identifiers* are stable and may be referenced by a store or
 * payment provider; prices, storefront copy and whether a product is
 * currently purchasable are deliberately absent. Choosing a payment
 * provider and shipping checkout are out of scope for issue #36 and
 * require a separate commercial/legal review.
 */
const DEFAULT_PRODUCTS: readonly EntitlementProduct[] = [
  { productId: 'product.save-slots.plus-5', capability: 'save-slots', quantity: 5, nameKey: 'product.save-slots.plus-5.name' },
  { productId: 'product.save-slots.plus-10', capability: 'save-slots', quantity: 10, nameKey: 'product.save-slots.plus-10.name' },
];

export interface EntitlementProductCatalog {
  get(productId: string): EntitlementProduct | undefined;
  has(productId: string): boolean;
  all(): readonly EntitlementProduct[];
}

export function loadEntitlementProductCatalog(
  products: readonly EntitlementProduct[] = DEFAULT_PRODUCTS,
): EntitlementProductCatalog {
  const byId = new Map<string, EntitlementProduct>();
  for (const product of products) {
    const parsed = entitlementProductSchema.parse(product) as EntitlementProduct;
    if (byId.has(parsed.productId)) throw new RangeError(`Duplicate entitlement product "${parsed.productId}".`);
    byId.set(parsed.productId, parsed);
  }
  return {
    get: (productId) => byId.get(productId),
    has: (productId) => byId.has(productId),
    // Sorted by id, never insertion order, so audit output and tests are deterministic.
    all: () => [...byId.values()].sort((left, right) => (left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0)),
  };
}

export const defaultEntitlementProductCatalog = loadEntitlementProductCatalog();

/** Clamped, never trusted arithmetic: the ceiling applies wherever a capacity is produced. */
export function clampSaveSlotCapacity(totalSlots: number): number {
  if (!Number.isFinite(totalSlots)) return BASE_SAVE_SLOTS;
  return Math.max(BASE_SAVE_SLOTS, Math.min(MAX_TOTAL_SAVE_SLOTS, Math.floor(totalSlots)));
}
