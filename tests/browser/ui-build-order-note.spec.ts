import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import './ui-harness-api';

/**
 * `hud.build.note` reaches the screen (#639, ruling 1; #636).
 *
 * ## The defect this exists for
 *
 * *"An order is queued now and built while the clock runs."* is in the shipped
 * locale and in `HUD_MESSAGE_KEY`, and had **no renderer** between `67e366e`
 * (2026-08-23) -- which deleted the `.hud-build__footer` it lived in -- and the
 * change this spec lands with. It passed every gate for a week and reached
 * nobody.
 *
 * **The gate it passed is the point.** `tests/unit/ui-hud-messages.test.ts`
 * asserts that every key in the registry *resolves* in the default locale.
 * `hud.build.note` resolved perfectly the entire time. Resolution is a property
 * of the catalogue; being read is a property of the DOM, and nothing asserted
 * the second one. So this file asserts the second one, and asserts it about
 * **rendered text** rather than about the element the panel happens to build:
 * it looks the sentence up by its own words, so moving it, renaming its class
 * or rebuilding the panel around it all keep passing, and deleting the renderer
 * fails.
 *
 * ## Why a browser
 *
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so `build-panel.ts`
 * cannot assemble a DOM under `pnpm test` at all. And the question here is not
 * only "is the node there": #629 is a standing owner directive that information
 * which exists and reaches nobody does not count, with #627 as its worked
 * example -- *"Awaiting Materials"* was on the page the whole time, inside a
 * fold that starts shut. So what is asserted is that the sentence is laid out,
 * inside the panel's visible box, outside every fold, at 900x600.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/** The shipped sentence, read through the shipped catalogue rather than retyped. */
const NOTE_TEXT = localizer.format(HUD_MESSAGE_KEY.buildNote);

interface NoteReading {
  /** How many elements in the Build panel render exactly this sentence. */
  readonly matches: number;
  readonly box: { readonly width: number; readonly height: number };
  /** Whether the sentence's box lies inside the Build panel's own visible box. */
  readonly insidePanel: boolean;
  /** `data-collapsed`/`hidden` of every ancestor between the sentence and the panel. */
  readonly foldedAncestors: readonly string[];
  /** True when the box clips the sentence -- the short-viewport line clamp. */
  readonly clipped: boolean;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  /** The panel's laid-out text with every `.ui-sr-only` span dropped. */
  readonly sightedPanelText: string;
}

test.describe('the Build panel says an order waits for the clock (#639)', () => {
  // The binding viewport, and the one that bites: `@media (max-height: 700px)`
  // in `hud.css` clamps `.hud-build__note` to a single line, so 600 is where a
  // restored sentence has to prove it is readable rather than merely present.
  test.use({ viewport: { width: 900, height: 600 } });

  test('renders the note where the order is placed, outside every fold', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);

    const reading: NoteReading = await page.evaluate((note) => {
      const panel = document.querySelector<HTMLElement>('.hud-build');
      if (panel === null) throw new Error('no Build panel in the mounted HUD');

      // By text, not by class: what is being gated is that the sentence
      // reaches the player, and a selector on the element this change happens
      // to add would pass against an element rendering something else.
      const leaves = [...panel.querySelectorAll<HTMLElement>('*')].filter(
        (node) => node.childElementCount === 0 && (node.textContent ?? '').trim() === note,
      );
      const found = leaves[0];
      if (found === undefined) {
        const clone = panel.cloneNode(true) as HTMLElement;
        for (const hidden of clone.querySelectorAll('.ui-sr-only')) hidden.remove();
        return {
          matches: 0,
          box: { width: 0, height: 0 },
          insidePanel: false,
          foldedAncestors: [],
          clipped: false,
          scrollHeight: 0,
          clientHeight: 0,
          sightedPanelText: (clone.textContent ?? '').replace(/\s+/g, ' ').trim(),
        };
      }

      const folded: string[] = [];
      for (let node = found.parentElement; node !== null && node !== panel.parentElement; node = node.parentElement) {
        if (node.hidden) folded.push(`${node.className}:hidden`);
        if (node.getAttribute('data-collapsed') === 'true') folded.push(`${node.className}:collapsed`);
      }

      const panelBox = panel.getBoundingClientRect();
      const box = found.getBoundingClientRect();

      const clone = panel.cloneNode(true) as HTMLElement;
      for (const hidden of clone.querySelectorAll('.ui-sr-only')) hidden.remove();
      clone.style.position = 'absolute';
      clone.style.left = '-10000px';
      document.body.append(clone);
      const sightedPanelText = clone.innerText.replace(/\s+/g, ' ').trim();
      clone.remove();

      return {
        matches: leaves.length,
        box: { width: Math.round(box.width * 100) / 100, height: Math.round(box.height * 100) / 100 },
        insidePanel:
          box.top >= panelBox.top - 0.5 &&
          box.bottom <= panelBox.bottom + 0.5 &&
          box.left >= panelBox.left - 0.5 &&
          box.right <= panelBox.right + 0.5,
        foldedAncestors: folded,
        clipped: found.scrollHeight > found.clientHeight + 0.5 || found.scrollWidth > found.clientWidth + 0.5,
        scrollHeight: found.scrollHeight,
        clientHeight: found.clientHeight,
        sightedPanelText,
      };
    }, NOTE_TEXT);

    console.log(`[note] ${JSON.stringify(reading)}`);

    expect(
      reading.matches,
      `nothing in the Build panel renders "${NOTE_TEXT}" -- the key resolves and reaches nobody, which is exactly the state #636 found`,
    ).toBe(1);
    expect(reading.box.width, 'the note measured zero width, so it is in the DOM and not on screen').toBeGreaterThan(0);
    expect(reading.box.height, 'the note measured zero height').toBeGreaterThan(0);
    expect(
      reading.insidePanel,
      'the note lies outside the Build panel box, so it is present and reaches nobody -- #629',
    ).toBe(true);
    expect(
      reading.foldedAncestors,
      'the note is inside a fold. #627 is the failure where "Awaiting Materials" was on the page the whole time, one fold down',
    ).toEqual([]);
    expect(
      reading.clipped,
      'the note is clipped by its own box at the binding viewport, so the player reads part of a sentence',
    ).toBe(false);
    expect(
      reading.sightedPanelText,
      'the sentence is not in the panel text a sighted player reads',
    ).toContain(NOTE_TEXT);
  });
});
