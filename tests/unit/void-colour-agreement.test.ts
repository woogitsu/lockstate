import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { VOID_APPEARANCE, VOID_COLOR } from '../../src/rendering/world/appearance';

/**
 * The colour of empty space, declared once and used in three places.
 *
 * It was written out three times -- `src/main.ts`'s Phaser game config,
 * `WorldScene.create`'s `setBackgroundColor`, and `VOID_APPEARANCE` -- and
 * #141 found the third while inventorying exports with no reference anywhere.
 *
 * ## Why a drift here would be visible, unlike most duplicated constants
 *
 * `TileLayer.updateChunks` (`src/rendering/phaser/tile-layer.ts:276-278`)
 * gives an unloaded chunk **no draw calls at all**:
 *
 * ```ts
 * // Unmaterialised land gets no draw calls at all; the camera's own
 * // background is what "outside the world" looks like.
 * if (!world.isChunkLoaded(chunkX, chunkY)) continue;
 * ```
 *
 * So the background *is* the void, and its edge is wherever loaded chunks
 * stop. If the game config and the camera disagreed, the canvas would show one
 * colour before the scene booted and another after. If `VOID_APPEARANCE` ever
 * gained a caller and disagreed with either, the seam between materialised
 * land and empty space would be a visible band.
 *
 * ## What this file pins, and what it cannot
 *
 * That the three **spellings** are one value. It is textual for two of them,
 * because a game config and a Phaser call cannot be imported without booting a
 * browser, and this is a headless unit test.
 *
 * That bound is real and worth stating: this proves the three *say* the same
 * thing, not that Phaser paints it. `tests/browser/app-shell.spec.ts` is where
 * the canvas is actually looked at.
 *
 * `--ink-900` in `src/ui/tokens.css` is the same hex and is **deliberately not
 * asserted here**. It is a UI palette token, not the world's void; the two
 * agreeing today is a coincidence of taste, and forcing them to stay equal
 * would make a legitimate change to either fail for the wrong reason.
 */

const ROOT = join(__dirname, '../..');

/** `0x0b0e12` in the `#rrggbb` form a hand-written declaration would use. */
const asCssHex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function sourceOf(relative: string): string {
  return stripComments(readFileSync(join(ROOT, relative), 'utf8'));
}

describe('empty space has one colour', () => {
  it('derives the void appearance from the shared constant rather than repeating it', () => {
    expect(VOID_APPEARANCE.fill).toBe(VOID_COLOR);
    // Both channels, deliberately: the alternating tone breaks up large flat
    // areas of tiles, and empty space is not tiles. A `fillAlternate` that had
    // drifted would stripe the void.
    expect(VOID_APPEARANCE.fillAlternate).toBe(VOID_COLOR);
  });

  it('is the colour the game config and the camera are given, by reference and not by copy', () => {
    /*
     * Textual, and asserted in both directions.
     *
     * The positive half: both files must name `VOID_COLOR`. The negative half
     * is the one that makes this a gate rather than a note -- neither may
     * contain the hex as a literal again, which is what catches somebody
     * "fixing" a colour by editing one call site.
     *
     * Comments are stripped first, so the sentences in those files *about* the
     * colour do not read as declarations of it (#188).
     */
    const literal = asCssHex(VOID_COLOR);
    expect(literal).toBe('#0b0e12');

    // The **call site**, not the identifier. An earlier version of this
    // assertion looked for `VOID_COLOR` anywhere in the file, and measured, a
    // mutation replacing the one usage with a *different* hex survived it --
    // because the `import { VOID_COLOR }` line still contained the name. A
    // check that proves a symbol is imported rather than used is the shape
    // this repository keeps finding wired to nothing, so it must not be this
    // file's own shape.
    const usages: Readonly<Record<string, string>> = {
      'src/main.ts': 'backgroundColor: VOID_COLOR,',
      'src/rendering/scene/world-scene.ts': 'setBackgroundColor(VOID_COLOR)',
    };

    for (const [file, usage] of Object.entries(usages)) {
      const source = sourceOf(file);
      expect(source.length, `${file} read as empty; the scan is broken`).toBeGreaterThan(1_000);
      expect(
        source,
        `${file} no longer passes the shared void colour. It has one home, \`src/rendering/world/appearance.ts\`, because the camera background is what unmaterialised land looks like and a second spelling that drifted would show as a band where loaded chunks stop (#141)`,
      ).toContain(usage);
      expect(
        source.includes(literal) || source.includes('0x0b0e12'),
        `${file} declares the void colour again as a literal beside the shared one`,
      ).toBe(false);
    }
  });

  it('keeps the one declaration where the painter can reach it', () => {
    // The vacuity guard for the two assertions above: they check that other
    // files do *not* hold the literal, which an appearance module that had
    // also lost it would satisfy. So the declaration itself is asserted.
    const appearance = sourceOf('src/rendering/world/appearance.ts');
    expect(appearance).toContain('export const VOID_COLOR = 0x0b0e12;');
  });
});
