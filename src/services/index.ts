/**
 * Trusted services layer (issue #36, ADR 0008).
 *
 * A deliberately separate layer from the simulation: it holds the
 * contracts and pure logic for product features that cross a trust
 * boundary (verified challenges, account entitlements) or leave the
 * device (telemetry), plus the localization runtime that keeps translated
 * text out of simulation and persistence.
 *
 * Boundary rules. The first two are enforced by
 * `tests/unit/services-layer-boundaries.test.ts`; the third is a design
 * constraint with no static check behind it:
 * - nothing under `src/simulation/` may import this layer;
 * - this layer imports no Phaser and touches no DOM globals, so the same
 *   modules run in a browser, a worker and a trusted server function;
 * - nothing here is on the tick or frame path.
 */
export * from './challenges';
export * from './entitlements';
export * from './localization';
export * from './telemetry';
