import { expect, test, type Page } from './network-changed-fixture';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';

/**
 * The language picker, in the *assembled application* (#663).
 *
 * `tests/unit/ui-language.test.ts` proves every decision a `node` process can
 * reach: the vocabulary, what a stored preference means, that a chosen locale
 * ignores the browser and `'auto'` does not, and that a refused store is
 * reported rather than swallowed. Four things sit outside that layer entirely,
 * and each is a thing the *wiring* rather than the rule can get wrong:
 *
 * 1. **That the change reaches the whole interface.** #663 asks for exactly
 *    this and says why: *"A switch that leaves a panel in the old language
 *    until it happens to repaint is the defect a player will report, and it
 *    will not show up in a test that mounts one panel."* So the assertion
 *    below is over **every readable string in the HUD at once**, taken from
 *    the real page with several panels laid out, not over one label.
 * 2. **That `location.reload()` is an application of the change rather than a
 *    loss of one.** The decision this control implements is that a language
 *    change takes effect on reload
 *    (`docs/adr/drafts/how-a-language-change-reaches-a-running-page.md`), and
 *    the thing that decision has to be held to is that a prison survives it.
 * 3. **That `navigator.languages` and the stored preference are read in the
 *    right order.** Vitest runs in `environment: 'node'`, where there is no
 *    `navigator` at all; a Polish browser whose player chose English is only
 *    real here.
 * 4. **That three controls fit the row they are in.** The aside is a measured
 *    budget -- `src/ui/theme.ts` records what a second *row* in it cost -- and
 *    this control is the third occupant of the first row. Only a browser lays
 *    out a flex box.
 */

const APP_URL = '/index.html';

/** The one control: a button that cycles `Automatic (…)` -> `English` -> `Polski`. */
const CYCLE = '.language-control__cycle';

const EN = defaultMessageCatalogEn.messages;
const PL = messageCatalogPl.messages;

function text(catalog: Readonly<Record<string, unknown>>, key: string): string {
  const value = catalog[key];
  if (typeof value !== 'string') throw new Error(`${key} is not a flat string in this catalogue`);
  return value;
}

/**
 * Loads the real application and waits for the same three things
 * `app-shell.spec.ts` waits for, plus the control this file is about.
 */
async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.waitForSelector(CYCLE);
}

/**
 * Every readable string in the HUD and the save panel, as one sorted list.
 *
 * `innerText` per element rather than one call on `.hud`, so the comparison
 * below can say *which* strings failed to change rather than only that the
 * blob differs -- which is the difference between a useful failure and a
 * diff nobody reads.
 */
async function visibleStrings(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    for (const root of document.querySelectorAll('.hud, .save-panel')) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const value = (node.textContent ?? '').trim();
        if (value.length === 0) continue;
        const parent = node.parentElement;
        if (parent === null || parent.offsetParent === null) continue;
        seen.add(value);
      }
    }
    return [...seen].sort();
  });
}

test.describe('a browser that asks for English, with nothing chosen', () => {
  test('names the language it negotiated, and says it negotiated it', async ({ page }) => {
    await openApp(page);

    const button = page.locator(CYCLE);
    // `Automatic (English)`, assembled by the catalogue rather than here: the
    // parameter is the endonym of the locale that actually resolved, so this
    // asserts the readout reports what the player is reading and not only how
    // it was picked.
    await expect(button).toHaveText(
      text(EN, 'display.language.automatic').replace('{language}', text(EN, 'display.language.english')),
    );
    await expect(button).toHaveAttribute('data-preference', 'auto');
    await expect(button).toHaveAttribute('data-locale', 'en');
    // The document's own language, which a screen reader picks a voice from.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('says in its tooltip that pressing it reloads the game, because it does', async ({ page }) => {
    await openApp(page);
    // AGENTS.md's fourth reservation: the wording is ours, the truth is not.
    // The sentence promises a reload; the test below is what proves the code
    // keeps it.
    await expect(page.locator(CYCLE)).toHaveAttribute('title', text(EN, 'display.language.cycle'));
  });

  test('is one row of three controls, all of them real tap targets', async ({ page }) => {
    await openApp(page);
    // The measured constraint `src/ui/theme.ts` records: the aside cannot
    // afford a second row, so a third preference has to share the first. One
    // row means one height; three controls mean three boxes at the same top.
    const boxes = await page.evaluate(() => {
      const row = document.querySelector('.hud-chrome-prefs');
      if (row === null) return null;
      const children = [...row.children].map((child) => child.getBoundingClientRect());
      return {
        rowHeight: row.getBoundingClientRect().height,
        tops: children.map((box) => Math.round(box.top)),
        count: children.length,
        // A row that overflows its own box is the failure mode a third control
        // introduces, and it is silent: the contents simply leave the rail.
        overflows: row.scrollWidth > row.clientWidth + 1,
      };
    });
    expect(boxes, 'the chrome row is not on the page').not.toBeNull();
    expect(boxes!.count).toBe(3);
    expect(new Set(boxes!.tops).size, 'the chrome controls are on more than one row').toBe(1);
    expect(boxes!.overflows, 'the chrome row is wider than the rail it sits in').toBe(false);

    const target = await page.locator(CYCLE).boundingBox();
    expect(target, 'the language button has no box').not.toBeNull();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.width).toBeGreaterThanOrEqual(44);
  });
});

test.describe('pressing the control', () => {
  test('changes every visible string in the interface, not one panel (#663)', async ({ page }) => {
    await openApp(page);
    // Several panels laid out at once, which is the condition #663 names. The
    // Build tab carries the largest catalogue of labels in the interface and
    // the save panel is a separate mount with a localizer of its own history.
    await page.getByRole('tab', { name: /build/i }).click();
    await page.waitForTimeout(100);

    const before = await visibleStrings(page);
    expect(before.length, 'the sweep found almost nothing, so it is proving nothing').toBeGreaterThan(20);

    // Automatic -> English -> Polski: two presses, each reloading.
    for (let press = 0; press < 2; press += 1) {
      await page.locator(CYCLE).click();
      await page.waitForSelector(CYCLE);
      await page.waitForSelector('.save-panel');
    }
    await expect(page.locator(CYCLE)).toHaveAttribute('data-preference', 'pl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await page.getByRole('tab', { name: /budow|zarz|przegl/i }).first().click();
    await page.waitForTimeout(100);

    const after = new Set(await visibleStrings(page));

    /*
     * The assertion, and the reason it is a subtraction rather than a
     * comparison of two blobs. A string that survives the switch is either a
     * word Polish shares with English (a wordmark, a version, a number) or it
     * is a label that did not follow -- and only the second is a defect. So
     * the survivors are listed and checked against what the *catalogues*
     * themselves say is untranslated, rather than against a hand-written
     * allowance that would grow whenever something failed to change.
     */
    const identicalInBothCatalogues = new Set(
      Object.keys(EN)
        .filter((key) => typeof EN[key] === 'string' && EN[key] === PL[key])
        .map((key) => EN[key] as string),
    );
    const survivors = before.filter((value) => after.has(value)).filter((value) => {
      // Numbers, times, money and ids are not translations and are expected to
      // survive; so is anything the two catalogues agree on word for word.
      if (!/[A-Za-z]{2,}/.test(value)) return false;
      if (identicalInBothCatalogues.has(value)) return false;
      // A string that is one of those identical entries with a number
      // interpolated into it (`v0.0.616 · abc1234`) survives for the same
      // reason and is not a defect either.
      return ![...identicalInBothCatalogues].some((shared) => shared.includes(value) || value.includes(shared));
    });

    expect(
      survivors,
      'these strings stayed in English after the language changed: the switch reached part of the interface only',
    ).toEqual([]);
  });

  test('keeps the prison it was showing, because the save is awaited before the reload', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.waitForSelector('.save-panel__item-label');
    const before = await page.locator('.save-panel__item-label').first().innerText();

    await page.locator(CYCLE).click();
    await page.waitForSelector('.save-panel__item-label');

    // The reload is the application of the change; it must not also be a
    // loss. `src/main.ts` awaits `SessionController.saveNow()` before it
    // navigates, which `LifecycleSaveHandler`'s `pagehide` save explicitly
    // does not.
    await expect(page.locator('.save-panel__item-label').first()).toHaveText(before);
    await expect(page.locator(CYCLE)).toHaveAttribute('data-preference', 'en');
  });
});

test.describe('a browser that asks for Polish', () => {
  test.use({ locale: 'pl-PL' });

  test('boots in Polish with nothing chosen, and the control says so', async ({ page }) => {
    await openApp(page);
    await expect(page.locator(CYCLE)).toHaveText(
      text(PL, 'display.language.automatic').replace('{language}', text(PL, 'display.language.polish')),
    );
    await expect(page.locator(CYCLE)).toHaveAttribute('data-preference', 'auto');
    await expect(page.locator(CYCLE)).toHaveAttribute('data-locale', 'pl');
  });

  test('stays in English when the player chose English, whatever the browser asks for', async ({ page }) => {
    /*
     * The property a stored locale tag alone cannot express, in the one place
     * it is real. Seeded through `localStorage` rather than by pressing the
     * control, because the point is what a *returning* player gets: the choice
     * has to beat the browser on a load that never saw the press.
     */
    await page.addInitScript(() => {
      globalThis.localStorage.setItem(
        'lockstate.settings.language',
        JSON.stringify({ version: 1, preference: 'en' }),
      );
    });
    await openApp(page);

    await expect(page.locator(CYCLE)).toHaveText(text(EN, 'display.language.english'));
    await expect(page.locator(CYCLE)).toHaveAttribute('data-preference', 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // And the interface really is English, not merely the control.
    await expect(page.locator('#app')).toHaveAttribute('aria-label', text(EN, 'app.shell.label'));
  });

  test('offers the two endonyms and never the pseudo-locale', async ({ page }) => {
    await openApp(page);
    const readings: string[] = [];
    for (let press = 0; press < 3; press += 1) {
      readings.push(await page.locator(CYCLE).innerText());
      await page.locator(CYCLE).click();
      await page.waitForSelector(CYCLE);
      await page.waitForSelector('.save-panel');
    }
    // Every language is named in itself, so the entry a player is looking for
    // is readable whatever the page is currently in -- `English` is `English`
    // on a Polish page.
    expect(readings).toContain(text(EN, 'display.language.english'));
    expect(readings).toContain(text(EN, 'display.language.polish'));
    // `PSEUDO_LOCALE` is documented as "never offered to players"; three
    // presses is the whole cycle, so this is exhaustive rather than a sample.
    expect(readings.join(' ')).not.toContain('XA');
    expect(readings.join(' ')).not.toContain('⟦');
  });
});
