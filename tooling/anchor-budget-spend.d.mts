/**
 * Types for the anchor budget spend annotation, so
 * `tests/foundation/anchor-budget-spend-annotation.test.ts` can import the
 * same pure functions `.github/workflows/version.yml` runs rather than a
 * second copy of them -- the same arrangement, and the same reason, as
 * `build-identity.d.mts`.
 *
 * The implementation is `tooling/anchor-budget-spend.mjs`, and its header
 * carries the argument for every shape below -- in particular why the spend
 * stopped being counted in `package.json` patch numbers on 2026-09-15.
 */

/** Must match `ANCHOR_STALENESS_BUDGET_MERGES` in
 *  `tests/foundation/adr-status-queue-anchor-contract.test.ts` -- the budget
 *  that gate enforces. This used to name a sibling constant counted in
 *  releases, which is no longer declared anywhere. */
export const BUDGET: number;

/** Merges of budget remaining at which the annotation escalates from
 *  `notice` to `warning`. */
export const WARNING_REMAINING_THRESHOLD: number;

/** The subject `.github/workflows/version.yml` writes for its bump commit: the
 *  only first-parent commit shape that is not counted as landed history. A
 *  second copy of the gate's pattern, pinned to it by the contract test. */
export const RELEASE_COMMIT_SUBJECT: RegExp;

export type AnchorSpendResult =
  | {
      readonly kind: 'ok';
      readonly anchorSha: string;
      readonly anchorVersion: string;
      readonly packageVersion: string;
      /** Merges since the anchor: first-parent commits that are not release bumps. */
      readonly spend: number;
      readonly remaining: number;
      /** The release count for the same window -- an aside, not the spend.
       *  `null` across a major or minor line; negative when the anchor names a
       *  version `package.json` has not reached. */
      readonly releases: number | null;
    }
  | { readonly kind: 'no-anchor' }
  | { readonly kind: 'multiple-anchors'; readonly count: number }
  | {
      readonly kind: 'uncountable';
      readonly anchorSha: string;
      readonly anchorVersion: string;
      readonly packageVersion: string;
    };

/**
 * Merges since `anchorSha` up to `until` (default `HEAD`), counted the way the
 * gate counts them. `null` when this checkout cannot answer: the commit is
 * absent, the history is shallow, or git would not run.
 */
export function countLandingsSince(anchorSha: string, repositoryRoot: string, until?: string): number | null;

export function computeAnchorSpend(
  statusQueueText: string,
  packageVersion: string,
  countLandings: (anchorSha: string) => number | null,
): AnchorSpendResult;

export function formatAnchorSpendAnnotation(result: AnchorSpendResult): {
  readonly level: 'notice' | 'warning';
  readonly message: string;
};
