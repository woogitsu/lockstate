import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A regression test for issue #739's finding D5
 * (`docs/research/2026-09-01-playing-after-the-rulings.md`): the Rooms
 * panel's only instruction for its drawing gesture,
 * `.hud-rooms__note` -- "Drag a rectangle across the tiles this room should
 * cover." -- painted **outside its own box** at every viewport 720px tall or
 * taller, because `display: block` in `hud.css` overrides `.ui-eyebrow`'s
 * `display: inline` but not its `white-space: nowrap`, and nothing contained
 * the line that left. Measured on the assembled page before the fix this test
 * pins: `469x13` of content in a `238x13` box, `overflow: visible` by the user
 * agent default, 231px painted past the panel's right edge and over whatever
 * the map block drew beside it.
 *
 * **The owner ruled on 2026-09-01 that the sentence wraps**, so the cure is
 * `white-space: normal` (overriding the `nowrap` inherited from `.ui-eyebrow`)
 * plus `overflow-wrap: break-word`, the same pairing #720's fix gave
 * `.ui-row--wrap`. `overflow: hidden` stays, and is still what this test is
 * mainly for: it is the declaration that keeps a single unbreakable token
 * contained once wrapping has nothing to break on.
 *
 * This is a source-level check in the same spirit as
 * `tests/unit/ui-design-tokens.test.ts` -- `vitest.config.ts` sets
 * `environment: 'node'`, so there is no layout engine here to measure a real
 * `scrollWidth` against a real `clientWidth`. What this test can and does
 * assert is the CSS contract that keeps the failure from recurring: the rule
 * declares `overflow: hidden` (so the box, not the world beside it, absorbs
 * whatever does not fit) and `text-overflow: ellipsis` (so the truncation is
 * visible rather than a silent hard clip). Confirming that the sentence no
 * longer paints past its box on the assembled page is a Playwright
 * measurement this suite cannot take; ADR 0085 names it as one still owed.
 *
 * **This file's third case asserted `text-overflow: ellipsis` until the
 * ruling**, under a docblock that called the sentence unreadable *"deliberately
 * narrow: this does not assert the sentence is readable -- ellipsis-truncating
 * the only instruction the game gives for this gesture is itself an unresolved
 * cost"*. That cost is what the owner removed: the case now asserts the two
 * declarations that make the whole sentence visible, and `text-overflow` is
 * asserted **absent**, because it only ever applies to a single non-wrapping
 * line and would read as a promise this rule does not keep.
 */

const HUD_CSS_PATH = join(__dirname, '../../src/ui/hud/hud.css');

/** Comments are prose about the rules, not CSS -- see `ui-design-tokens.test.ts`. */
function stylesheetRules(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The base-level `.hud-rooms__note { display: block; ... }` rule, distinct
 * from `.hud-rooms__note[data-tone='warning']` and from the `@media
 * (max-height: 700px)` block's own `.hud-rooms__note` clamp rule (`display:
 * -webkit-box; ...`) -- both legitimately different rule bodies for the same
 * selector, and neither is the one this fix lives on. `display: block` is
 * the substring that picks out this rule and no other: it is unique to it,
 * unlike the bare selector, which the height-clamped rule also opens.
 */
function baseRoomsNoteRule(source: string): string {
  const match = /\.hud-rooms__note\s*\{\s*display:\s*block\s*;([^}]*)\}/m.exec(source);
  if (match === null) {
    throw new Error('.hud-rooms__note has no base-level `display: block` rule in hud.css');
  }
  return match[1]!;
}

describe('.hud-rooms__note contains its overflow instead of painting over its neighbours (#739 D5)', () => {
  const source = stylesheetRules(HUD_CSS_PATH);

  it('finds exactly one base-level rule, so the check below cannot pass vacuously', () => {
    const occurrences = source.match(/\.hud-rooms__note\s*\{\s*display:\s*block\s*;/gm) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it('declares overflow: hidden, so content that does not fit stays inside the box', () => {
    const rule = baseRoomsNoteRule(source);
    expect(rule).toMatch(/overflow\s*:\s*hidden\s*;?/);
  });

  it('wraps the sentence rather than truncating it, on the owner\'s ruling of 2026-09-01', () => {
    const rule = baseRoomsNoteRule(source);
    // `.ui-eyebrow` sets `white-space: nowrap`; without this override the
    // sentence is one line however wide it gets, which is what spilled.
    expect(rule, 'the note inherits nowrap from .ui-eyebrow and nothing overrides it').toMatch(
      /white-space\s*:\s*normal\s*;?/,
    );
    // The pairing #720's `.ui-row--wrap` uses: wrapping alone leaves a single
    // token longer than the box with nowhere to break.
    expect(rule, 'a token longer than the box has nowhere to break').toMatch(/overflow-wrap\s*:\s*break-word\s*;?/);
    // And not the truncation this rule carried for a few hours: it applies
    // only to a non-wrapping line, so beside `white-space: normal` it would be
    // a declaration that does nothing and reads as though it did.
    expect(rule, 'text-overflow does nothing on a wrapping line and should not suggest otherwise').not.toMatch(
      /text-overflow\s*:/,
    );
  });
});
