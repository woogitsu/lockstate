import { expect, test, type Page } from './network-changed-fixture';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';

/**
 * Two tabs of the same prison, in the assembled application (#1199).
 *
 * The defect this file was written against is a wiring one and the cheapest
 * kind to ship green: `subscribeToSettingsChanges` is unit-tested against a
 * fake target, every apply-path it calls has its own tests, and before
 * `src/main.ts` joined them nothing in `src/` bound the `storage` event at all.
 * `tests/foundation/composition-root-contract.test.ts` catches the deletion of
 * the call; only a browser can catch the rest, for three reasons:
 *
 *   1. **`storage` does not fire in the tab that wrote it.** That is the
 *      property the whole design leans on -- it is what makes an echo
 *      impossible without a loop guard -- and a `node` test that dispatches
 *      its own events cannot observe it. Two real pages can.
 *   2. **A preference is only followed if it *repaints*.** `data-theme` and
 *      `--ui-scale` are worth writing because a stylesheet selects on them,
 *      and only a browser resolves a cascade.
 *   3. **The language deliberately does not follow**, and the interesting
 *      half of that is negative: a second tab must be left *wholly* in its own
 *      language rather than partly moved. Only the assembled page has the
 *      nineteen surfaces that could disagree.
 *
 * Both pages come from `page.context().newPage()`, so they are one browsing
 * context, one origin and one `localStorage` -- which is what two tabs are.
 * `docs/adr/drafts/what-a-second-tab-follows.md` is the decision being held to.
 */

const APP_URL = '/index.html';

const THEME_CYCLE = '.theme-control__cycle';
const SCALE_CYCLE = '.display-scale__cycle';
const LANGUAGE_CYCLE = '.language-control__cycle';
const METRICS_TOGGLE = '.hud-layout__arrow[data-layout-region="metrics"]';

const EN = defaultMessageCatalogEn.messages;

function text(key: string): string {
  const value = EN[key];
  if (typeof value !== 'string') throw new Error(`${key} is not a flat string in this catalogue`);
  return value;
}

/** Loads the real application and waits for the same things `ui-language-picker.spec.ts` waits for. */
async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.waitForSelector(LANGUAGE_CYCLE, { state: 'attached' });
}

/** A second tab: the same context, so the same origin store and the same `storage` events. */
async function openSecondTab(page: Page): Promise<Page> {
  const second = await page.context().newPage();
  await openApp(second);
  return second;
}

/**
 * One press of the language control, and the reload it causes.
 *
 * Each press is a navigation: the preference is persisted, the prison is saved
 * and the page comes back in the new language
 * (`docs/adr/drafts/how-a-language-change-reaches-a-running-page.md`), which
 * is why the drawer has to be opened again for the next one. The attribute
 * assertion is what waits for the new document -- the old one's button still
 * carries the old value, so it cannot pass early.
 */
async function cycleLanguage(page: Page, expected: string): Promise<void> {
  await page.locator('.hud-layout__button').click();
  await expect(page.locator(LANGUAGE_CYCLE)).toBeVisible();
  await page.locator(LANGUAGE_CYCLE).click();
  await expect(page.locator(LANGUAGE_CYCLE)).toHaveAttribute('data-preference', expected);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.save-panel');
}

async function uiScale(page: Page): Promise<string> {
  return page.evaluate(() =>
    globalThis.getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
  );
}

test.describe('a preference changed in one tab', () => {
  test('moves the theme in the other, on screen and on the control', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page);
    const second = await openSecondTab(page);
    try {
      await second.emulateMedia({ colorScheme: 'light' });
      await expect(second.locator('html')).toHaveAttribute('data-theme', 'light');

      // Two presses in the first tab: `system` -> `light` -> `dark`.
      await page.locator(THEME_CYCLE).click();
      await page.locator(THEME_CYCLE).click();
      await expect(page.locator(THEME_CYCLE)).toHaveAttribute('data-preference', 'dark');

      // The attribute, which is the whole of applying a theme...
      await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark');
      // ...the paint it selects, because an attribute nothing draws from is
      // not a theme...
      expect(
        await second.evaluate(() => globalThis.getComputedStyle(document.body).backgroundColor),
      ).toBe('rgb(16, 35, 46)');
      // ...and the control, which must not be left naming the theme that used
      // to be on screen here.
      await expect(second.locator(THEME_CYCLE)).toHaveAttribute('data-preference', 'dark');
    } finally {
      await second.close();
    }
  });

  test('moves the interface scale in the other, and the layout limits with it', async ({ page }) => {
    await openApp(page);
    const second = await openSecondTab(page);
    try {
      expect(await uiScale(second)).toBe('1');

      // One press: 100 % -> 125 %.
      await page.locator(SCALE_CYCLE).click();
      await expect.poll(async () => uiScale(page)).toBe('1.25');

      await expect.poll(async () => uiScale(second)).toBe('1.25');
      // `--ui-scale` multiplies every length token, so the readout in the
      // other tab has to have been told as well -- a page at the new scale
      // whose own control still said 100 % would be two sources of truth.
      await expect(second.locator(SCALE_CYCLE)).toHaveText(
        await page.locator(SCALE_CYCLE).innerText(),
      );
    } finally {
      await second.close();
    }
  });

  test('collapses the same HUD region in the other', async ({ page }) => {
    await openApp(page);
    const second = await openSecondTab(page);
    try {
      await expect(second.locator('.hud')).toHaveAttribute('data-layout-metrics', 'open');

      await page.locator('.hud-layout__button').click();
      await page.locator(METRICS_TOGGLE).click();
      await expect(page.locator('.hud')).toHaveAttribute('data-layout-metrics', 'collapsed');

      await expect(second.locator('.hud')).toHaveAttribute('data-layout-metrics', 'collapsed');
    } finally {
      await second.close();
    }
  });
});

test.describe('the language, which deliberately does not follow', () => {
  test('leaves the other tab wholly in its own language, not partly moved', async ({ page }) => {
    await openApp(page);
    const second = await openSecondTab(page);
    try {
      // The first tab changes language. The control persists, saves the
      // prison and reloads -- that is this repository's decision about how a
      // language change reaches a running page, and the reason the second tab
      // cannot simply be told.
      await cycleLanguage(page, 'en');
      await cycleLanguage(page, 'pl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

      /*
       * And the second tab is untouched -- which is the assertion worth making
       * in a browser rather than in `node`, because the failure this rules out
       * is a *partial* move. The world's room names follow a localizer that is
       * re-read every refresh while a tab label is written once at
       * construction, so a tab that acted on the language key would end up
       * with one half in each language. Both halves are checked: the document
       * language a screen reader picks a voice from, and a HUD string that is
       * formatted once at mount.
       */
      await expect(second.locator('html')).toHaveAttribute('lang', 'en');
      await expect(second.locator(LANGUAGE_CYCLE)).toHaveAttribute('data-preference', 'auto');
      await expect(second.locator('.hud-layout__button')).toHaveAttribute(
        'title',
        text('hud.layout.menu'),
      );

      // The theme still follows in the same tab, so "the language does not"
      // is a decision about one key rather than a subscription that died.
      await page.locator(THEME_CYCLE).click();
      await page.locator(THEME_CYCLE).click();
      await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark');
    } finally {
      await second.close();
    }
  });
});
