/**
 * Types for the anchor budget spend annotation, so
 * `tests/foundation/anchor-budget-spend-annotation.test.ts` can import the
 * same pure functions `.github/workflows/version.yml` runs rather than a
 * second copy of them -- the same arrangement, and the same reason, as
 * `build-identity.d.mts`.
 *
 * The implementation is `tooling/anchor-budget-spend.mjs`.
 */

/** Must match `ANCHOR_STALENESS_BUDGET_RELEASES` in
 *  `tests/foundation/adr-status-queue-anchor-contract.test.ts`. */
export const BUDGET: number;

/** Releases of budget remaining at which the annotation escalates from
 *  `notice` to `warning`. */
export const WARNING_REMAINING_THRESHOLD: number;

export type AnchorSpendResult =
  | { readonly kind: 'ok'; readonly anchorVersion: string; readonly packageVersion: string; readonly spend: number; readonly remaining: number }
  | { readonly kind: 'no-anchor' }
  | { readonly kind: 'multiple-anchors'; readonly count: number }
  | { readonly kind: 'incomparable'; readonly anchorVersion: string; readonly packageVersion: string }
  | { readonly kind: 'ahead'; readonly anchorVersion: string; readonly packageVersion: string };

export function computeAnchorSpend(statusQueueText: string, packageVersion: string): AnchorSpendResult;

export function formatAnchorSpendAnnotation(result: AnchorSpendResult): {
  readonly level: 'notice' | 'warning';
  readonly message: string;
};
