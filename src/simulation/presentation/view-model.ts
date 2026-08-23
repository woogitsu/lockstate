/**
 * Shared primitives for every HUD view model in this directory.
 *
 * A "projection" here is the same thing `world-projection.ts` already is
 * for the world: a pure function from authoritative simulation state to a
 * readonly, structured-clone-safe value. `AGENTS.md` boundary 1 -- Phaser
 * and the DOM are never the source of truth -- means the HUD may only ever
 * read one of these, never a live simulation object.
 *
 * Three rules hold for everything exported from this directory:
 *
 * 1. **Readonly, and never mutating.** No projection writes to the state it
 *    is given, and no projected value shares a mutable reference with it.
 * 2. **Deterministic iteration.** Every list is ordered by a key derived
 *    from *state* (ascending entity id, ascending string id in code-unit
 *    order, or a fixed declared catalog order) -- never `Map`/`Set`
 *    insertion order, and never `localeCompare` (`docs/DETERMINISM.md`).
 * 3. **Ids and message keys, never text** (ADR 0011). A view model carries
 *    a stable simulation/content id, and where the content catalog defines
 *    one, its `nameKey`. Resolving a key to a translated string is the
 *    HUD's job; simulation code may not do it.
 */

export const HUD_VIEW_MODEL_SCHEMA_ID = 'lockstate.hud-view-model';
export const HUD_VIEW_MODEL_SCHEMA_VERSION = 1;
export type HudViewModelSchemaVersion = typeof HUD_VIEW_MODEL_SCHEMA_VERSION;

/**
 * Tile-space position as plain numbers. `TilePosition`'s branded
 * `TileCoordinate` is a compile-time-only nominal type; a value crossing
 * the worker boundary and landing in the DOM is just a number, so the view
 * model says so rather than exporting a brand the HUD would have to import
 * simulation types to satisfy.
 */
export interface TileViewModel {
  readonly x: number;
  readonly y: number;
}

export function toTileViewModel(position: { readonly x: number; readonly y: number }): TileViewModel {
  return { x: position.x, y: position.y };
}

// ---------------------------------------------------------------------------
// Bounded values
// ---------------------------------------------------------------------------

/**
 * Segments in a projected bar. Owned here, not by the HUD, so every
 * segmented bar in the interface has the same granularity and a redesign
 * is one constant rather than a hunt through CSS.
 */
export const BOUNDED_VALUE_SEGMENTS = 10;

/** `permille` is always an integer in `[0, 1000]`. */
export const BOUNDED_VALUE_PERMILLE_MAX = 1_000;

/**
 * A quantity the simulation stores on some internal scale, projected in a
 * form the HUD can render without knowing that scale.
 *
 * **The contract**, and why it is shaped this way:
 *
 * - `permille` -- the value as an integer share of its own maximum, `0`
 *   (empty) to `1000` (full). Integer, so two projections of identical
 *   state compare equal with `===` and can be diffed or hashed; per-mille
 *   rather than percent so a 10-segment bar has a whole-number step and a
 *   tooltip still has a digit of precision left. This is the authoritative
 *   number: use it for tooltips, ARIA values and any width calculation.
 * - `filled`/`segments` -- a ready-made segmented bar: fill `filled` of
 *   `segments`. `filled` is `floor(permille * segments / 1000)`, so a
 *   partially-filled final segment reads as unfilled and a bar shows
 *   completely full **only** when the underlying value is exactly at its
 *   maximum. Rounding instead would show 96 % as a full bar, which for a
 *   need bar is a lie the player acts on.
 *
 * Deliberately **absent**: the raw value and its raw maximum. Needs are
 * `0..255` `Uint8Array` levels today (`src/simulation/prisoners/needs.ts`)
 * and that is an internal storage decision. Exposing it would guarantee a
 * HUD somewhere hard-codes `255`, and changing the storage width would
 * then be a rendering bug rather than a simulation change.
 *
 * Semantics are "how full", not "how bad": a need at `permille: 0` is a
 * starving prisoner, not a satisfied one. The simulation defines no
 * warning/critical thresholds for needs, so this type carries no severity
 * band -- inventing one would be a balance decision, not a projection.
 */
export interface BoundedValue {
  readonly permille: number;
  readonly filled: number;
  readonly segments: number;
}

/**
 * Projects `value` against `maximum`. Values outside `[0, maximum]` are
 * clamped rather than rejected: a projection is a read of live state and
 * must never be the thing that throws in front of a player. Non-finite
 * input *is* rejected, because it means the caller passed the wrong field.
 */
export function toBoundedValue(value: number, maximum: number, segments: number = BOUNDED_VALUE_SEGMENTS): BoundedValue {
  if (!Number.isFinite(value)) throw new RangeError('Bounded value must be finite.');
  if (!Number.isFinite(maximum) || maximum <= 0) throw new RangeError('Bounded maximum must be a positive finite number.');
  if (!Number.isSafeInteger(segments) || segments <= 0) throw new RangeError('Bounded segment count must be a positive integer.');

  const clamped = Math.max(0, Math.min(maximum, value));
  const permille = Math.round((clamped / maximum) * BOUNDED_VALUE_PERMILLE_MAX);
  const filled = Math.floor((permille * segments) / BOUNDED_VALUE_PERMILLE_MAX);
  return { permille, filled, segments };
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

/**
 * Default window size. A prisoner roster runs to the 5,000-actor stress
 * tier (`docs/ARCHITECTURE.md`); no panel renders 5,000 rows, so a
 * projection that built them all would be per-frame work nobody looks at.
 */
export const DEFAULT_VIEW_MODEL_PAGE_LIMIT = 100;

export interface PageRequest {
  /** Rows to skip, in the projection's canonical order. Negative values clamp to 0. */
  readonly offset?: number;
  /** Maximum rows to build. Clamps to `[0, ...]`; defaults to `DEFAULT_VIEW_MODEL_PAGE_LIMIT`. */
  readonly limit?: number;
}

/**
 * One window of a larger list. `total` is the full count so the HUD can
 * size a scrollbar without asking for every row; `rows` holds only the
 * requested window, and only that window costs an allocation.
 */
export interface ViewModelPage<TRow> {
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly rows: readonly TRow[];
}

export interface ResolvedPage {
  readonly offset: number;
  readonly limit: number;
}

export function resolvePageRequest(request: PageRequest = {}): ResolvedPage {
  const offset = Math.max(0, Math.trunc(request.offset ?? 0));
  const limit = Math.max(0, Math.trunc(request.limit ?? DEFAULT_VIEW_MODEL_PAGE_LIMIT));
  return { offset, limit };
}

/** Windows an already-materialized, already-canonically-ordered array. */
export function pageOf<TRow>(rows: readonly TRow[], request: PageRequest = {}): ViewModelPage<TRow> {
  const { offset, limit } = resolvePageRequest(request);
  return { total: rows.length, offset, limit, rows: rows.slice(offset, offset + limit) };
}

// ---------------------------------------------------------------------------
// Actor names
// ---------------------------------------------------------------------------

/**
 * A prisoner's or staff member's name.
 *
 * This is the one player-facing *string* a projection here emits, and it
 * does not break rule 3 above. ADR 0011 separates three namespaces --
 * stable id, message key, translated text -- and forbids simulation code
 * from producing the third. A proper name is none of them: it is never
 * authored into a content catalog, never translated, and identical in
 * every locale. It is state that happens to be a string, like a room
 * instance id, and it reaches the HUD for the same reason an id does.
 *
 * The distinction is exactly the one the localization-boundary test
 * asserts: that test fails a projected string that *equals a translation*
 * in the default `en` catalog. A name never does, and
 * `tests/unit/actor-identity.test.ts` pins that the whole name pool is
 * disjoint from the catalog so it stays true when either side grows.
 * Weakening the test to make room for names would have been the wrong fix.
 *
 * Given and family parts stay separate: which order they read in, and
 * whether a roster shows both, is a presentation choice, and composing
 * them here would bake one convention into the simulation.
 */
export interface ActorNameViewModel {
  readonly givenName: string;
  readonly familyName: string;
}

export function toActorNameViewModel(name: { readonly givenName: string; readonly familyName: string }): ActorNameViewModel {
  return { givenName: name.givenName, familyName: name.familyName };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Code-unit string ordering. `docs/DETERMINISM.md` forbids
 * `localeCompare`: collation depends on the runtime's default locale and
 * on the ICU data the engine was built with, so two clients can order the
 * same ids differently.
 */
export function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Ascending numeric entity id. */
export function compareEntityIds(left: number, right: number): number {
  return left - right;
}
