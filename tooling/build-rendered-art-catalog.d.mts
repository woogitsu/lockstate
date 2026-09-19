/**
 * Types for the rendered-art catalog generator's data, so
 * `tests/foundation/rendered-art-catalog-generator-contract.test.ts` can
 * check the *actual* published list against `environment-sprites.ts` rather
 * than a copy of it retyped in the test.
 */

/** Render ids this generator publishes. See the module docblock for why this is a short, explicit list rather than "all 23". */
export const PUBLISHED_ASSET_IDS: readonly string[];
