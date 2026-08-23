/**
 * The Lockstate UI primitive vocabulary.
 *
 * Small, composable, DOM-only building blocks shared by every browser-side
 * panel. They are deliberately dumb: they take already-resolved text and
 * plain data, and they never import from `src/simulation/**` or reach for a
 * localizer themselves. Resolving a message key is the composing layer's
 * job, which is what keeps the primitives reusable for any panel and keeps
 * translated text out of anything that could become a source of truth.
 */
export * from './async-action';
export * from './collapsible-section';
export * from './dom';
export * from './icon';
export * from './icon-button';
export * from './list-row';
export * from './panel';
export * from './segmented-bar';
export * from './stat-chip';
export * from './status-badge';
export * from './tab-button';
