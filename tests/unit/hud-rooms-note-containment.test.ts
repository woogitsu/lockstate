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
 * Deliberately narrow: this does not assert the sentence is *readable* --
 * ellipsis-truncating the only instruction the game gives for this gesture is
 * itself an unresolved cost, recorded in `hud.css`'s own comment on this rule
 * and in ADR 0085 rather than fixed here. It asserts only that the box
 * contains what does not fit, instead of drawing it over its neighbours.
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

  it('declares text-overflow: ellipsis, so a truncation is visible rather than a silent hard clip', () => {
    const rule = baseRoomsNoteRule(source);
    expect(rule).toMatch(/text-overflow\s*:\s*ellipsis\s*;?/);
  });
});
