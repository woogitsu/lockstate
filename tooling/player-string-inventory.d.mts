/**
 * Types for the player-visible string inventory, so
 * `tests/foundation/player-string-inventory-contract.test.ts` can import the
 * same pure functions `pnpm content:player-strings` runs rather than a second
 * copy of them -- the same arrangement, and the same reason, as
 * `anchor-budget-spend.d.mts` and `build-identity.d.mts`.
 *
 * The implementation is `tooling/player-string-inventory.mjs`.
 */

/** `src/content/default-locale-en.ts`, repository-relative. */
export const LOCALE_SOURCE_PATH: string;

/** `docs/PLAYER_STRINGS.md`, repository-relative. */
export const INVENTORY_PATH: string;

export interface AuthoredString {
  /** The localization key, exactly as declared. */
  readonly key: string;
  /** The sentence the game ships today, with escapes decoded and concatenations folded. */
  readonly value: string;
  /** The 1-based line the KEY sits on -- the line a reader jumps to. */
  readonly line: number;
}

/**
 * Every authored player-visible string, in source order.
 *
 * **Throws** on any property shape it does not recognise, rather than skipping
 * it: a findability record that silently omits a sentence is the defect this
 * tooling exists to end.
 */
export function extractAuthoredStrings(sourceText: string): { readonly entries: readonly AuthoredString[] };

export function renderInventory(extracted: { readonly entries: readonly AuthoredString[] }): string;

/** `renderInventory(extractAuthoredStrings(sourceText))`. */
export function buildInventory(sourceText: string): string;
