import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every `SaveStatusKind` the save panel can set must have a colour rule in
 * `src/styles.css`.
 *
 * ## The gap this closes, which was found by falling into it
 *
 * `SavePanel` writes the kind straight onto the element --
 * `this.statusElement.dataset.kind = status.kind;` -- and `src/styles.css`
 * styles the ones it knows by attribute selector, under a comment citing issue
 * #19: *"Distinct recovery states stay visually distinct ... The wording
 * differs too, so colour is never the only signal."*
 *
 * Nothing connected the two. Adding a member to `SaveStatusKind`, mapping a
 * failure to it in `describeSaveResult`, and shipping a catalogue sentence for
 * it all typecheck and all pass every existing test **while the sentence
 * renders in the default body colour**. That happened here: ADR 0109's
 * `'changed-elsewhere'` -- the one status line telling a player their save did
 * not happen -- was written, mapped, translated and committed before anybody
 * noticed it had no rule, and it was noticed by reading the stylesheet rather
 * than by any gate.
 *
 * ## Why this is a source-text contract rather than a rendering one
 *
 * The honest version of this question is "what colour does the browser
 * compute", and that belongs in `tests/browser/` where a real stylesheet is
 * loaded. But the defect is not a wrong colour, it is a **missing rule**, and
 * a missing rule is visible in the source text at no cost and with no browser.
 * `tests/browser/playtest-2026-09-03-can-a-player-read-this.playtest.ts`
 * already sweeps `[data-kind]` elements for contrast on the real page; this
 * sits in front of it and fails in `pnpm verify`, minutes earlier.
 *
 * It deliberately does **not** assert which colour a kind gets. That is a
 * design choice per state -- `saved` is success, `error` is danger, the
 * recoverable ones are warnings -- and pinning it here would turn every
 * palette decision into a test edit.
 */

const PANEL_SOURCE = fileURLToPath(new URL('../../src/ui/save-panel.ts', import.meta.url));
const STYLES_SOURCE = fileURLToPath(new URL('../../src/styles.css', import.meta.url));

/**
 * Reads the union members out of `SaveStatusKind`'s declaration.
 *
 * Parsed from source rather than imported, because a type has no runtime
 * value to enumerate -- the same reason `tests/foundation` reads several other
 * contracts as text. The declaration is matched from `export type
 * SaveStatusKind =` to the first `;`, so both the single-line and the
 * one-member-per-line shapes work; it was written as the first and is now the
 * second, and this test should not care which.
 */
function declaredStatusKinds(source: string): readonly string[] {
  const declaration = /export type SaveStatusKind\s*=([^;]*);/u.exec(source);
  if (declaration === null) {
    throw new Error(
      'Could not find `export type SaveStatusKind = ...;` in src/ui/save-panel.ts. ' +
        'If it was renamed or moved, this contract has to follow it rather than be deleted.',
    );
  }
  return [...declaration[1]!.matchAll(/'([a-z-]+)'/gu)].map((match) => match[1]!);
}

describe('every save-panel status kind is styled', () => {
  it('finds the union, and finds more than a couple of members', async () => {
    const kinds = declaredStatusKinds(await readFile(PANEL_SOURCE, 'utf8'));

    // Guards the extractor rather than the subject. A regex that silently
    // matched nothing would make the real assertion below vacuously true,
    // which is the shape this whole directory exists to prevent.
    expect(kinds.length).toBeGreaterThan(5);
    expect(kinds).toContain('idle');
    expect(kinds).toContain('error');
  });

  it('gives every kind a colour rule in src/styles.css', async () => {
    const kinds = declaredStatusKinds(await readFile(PANEL_SOURCE, 'utf8'));
    const styles = await readFile(STYLES_SOURCE, 'utf8');

    const unstyled = kinds.filter((kind) => !styles.includes(`.save-panel__status[data-kind='${kind}']`));

    expect(
      unstyled,
      'a SaveStatusKind with no rule in src/styles.css renders in the default body colour, which for a failure ' +
        'status is the one line a player most needs to notice. Add a rule beside the others and decide which ' +
        'of success/warning/danger it is -- do not delete this test, and do not widen the selector to cover ' +
        'every kind at once, because "distinct recovery states stay visually distinct" is issue #19.',
    ).toEqual([]);
  });
});
