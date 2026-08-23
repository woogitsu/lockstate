/**
 * Minimal synchronous key/value persistence boundary, shared by every
 * subsystem that stores a small client-side preference or cache outside
 * prison saves (input/accessibility settings, entitlement projections,
 * telemetry consent). `localStorage` satisfies it in the browser; tests
 * inject an in-memory implementation instead of touching the DOM.
 *
 * Deliberately not a general storage abstraction: anything large,
 * structured or recoverable belongs in the IndexedDB persistence layer
 * (`src/persistence/`), not here.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
