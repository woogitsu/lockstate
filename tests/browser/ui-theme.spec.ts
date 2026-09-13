import { type Page, expect, test } from './network-changed-fixture';

/**
 * The theme, in a real browser (#1157).
 *
 * `tests/unit/ui-theme.test.ts` proves the decisions -- which preference
 * resolves to which theme, what a blocked store costs, that an expressed
 * preference stops following the device -- against a fake element and a `Map`.
 * Three things it cannot prove, and they are the reason this file exists:
 *
 *   1. **That the attribute repaints anything.** `data-theme` is only worth
 *      writing if `src/ui/tokens.css` selects on it, and only a browser
 *      resolves a cascade. Every assertion below reads a *painted* colour off
 *      a real element rather than the custom property it came from.
 *   2. **That "follow the system" reaches the system.** `resolveSystemThemeQuery`
 *      is the one `matchMedia` call in the tree; a port stands in for it
 *      headlessly, and `page.emulateMedia` is what drives the real one.
 *   3. **That a browser which throws on `localStorage` still boots and still
 *      switches.** That throw is a property of the browser, not of a store
 *      object: Chrome raises from the property *getter* when site data is
 *      blocked, which is what `resolveBrowserKeyValueStore` exists for and
 *      what no `node` test can reproduce.
 *
 * The harness is `theme-harness.html`, which wires the same four calls in the
 * same order as `src/main.ts`'s `mountInterface`. It is not the app: booting a
 * worker and a Phaser canvas proves nothing about a palette, and the app's own
 * shell is already held by `app-shell.spec.ts`.
 */

const HARNESS_URL = '/tests/browser/theme-harness.html';

/** `--surface-base` in each theme, as `getComputedStyle` reports a colour. */
const DAY_BACKGROUND = 'rgb(242, 246, 248)';
const NIGHT_BACKGROUND = 'rgb(16, 35, 46)';

async function paintedBackground(page: Page): Promise<string> {
  return page.evaluate(() => globalThis.getComputedStyle(document.body).backgroundColor);
}

async function paintedBodyText(page: Page): Promise<string> {
  return page.evaluate(() => globalThis.getComputedStyle(document.body).color);
}

test.describe('the theme follows the device until the player says otherwise', () => {
  test('paints the day palette when the device asks for light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(HARNESS_URL);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await paintedBackground(page)).toBe(DAY_BACKGROUND);
  });

  test('paints the night palette when the device asks for dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(HARNESS_URL);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await paintedBackground(page)).toBe(NIGHT_BACKGROUND);
  });

  test('changes with the device, live, while no preference has been expressed', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(HARNESS_URL);
    expect(await paintedBackground(page)).toBe(DAY_BACKGROUND);

    // The device switching at sunset, without a reload and without anything
    // being pressed. This is the `matchMedia('change')` subscription, which is
    // the half of "follow the system" that a first paint does not prove.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await paintedBackground(page)).toBe(NIGHT_BACKGROUND);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('stops following the device once the player has chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(HARNESS_URL);
    await page.locator("[data-choice='dark']").click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // A player who has said "dark" is not moved by a device that says light.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await paintedBackground(page)).toBe(NIGHT_BACKGROUND);
    await expect(page.locator("[data-choice='dark']")).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('switching repaints the interface, not just an attribute', () => {
  test('moves the surface, the body text and a badge chip together', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(HARNESS_URL);

    const caution = page.locator(".ui-badge[data-tone='caution']");
    const readCaution = async (): Promise<{ color: string; background: string }> =>
      caution.evaluate((node) => {
        const style = globalThis.getComputedStyle(node);
        return { color: style.color, background: style.backgroundColor };
      });

    const dayBody = await paintedBodyText(page);
    const dayCaution = await readCaution();

    await page.locator("[data-choice='dark']").click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const nightBody = await paintedBodyText(page);
    const nightCaution = await readCaution();

    // Every one of the three moved. Asserting *inequality* rather than three
    // more hex literals is deliberate: `tests/unit/ui-design-tokens.test.ts`
    // already pins both palettes by value and computes every contrast ratio
    // from the file, so a second copy of those literals here would be a second
    // thing to update and would fail for the wrong reason when a rung legally
    // moves. What only a browser can say is that the cascade reaches all of
    // them at once.
    expect(nightBody).not.toBe(dayBody);
    expect(nightCaution.color).not.toBe(dayCaution.color);
    expect(nightCaution.background).not.toBe(dayCaution.background);

    // And the caution chip is the inverted one in both themes -- light text on
    // a dark chip by day, dark text on a light chip by night -- which is the
    // visible consequence of the contrast argument recorded on `--straw-300`.
    const luminance = (colour: string): number => {
      const [r, g, b] = colour.match(/\d+/g)!.map(Number) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(luminance(dayCaution.color)).toBeGreaterThan(luminance(dayCaution.background));
    expect(luminance(nightCaution.color)).toBeLessThan(luminance(nightCaution.background));
  });

  test('remembers the choice across a reload, under its own storage key', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(HARNESS_URL);
    await page.locator("[data-choice='dark']").click();

    const stored = await page.evaluate(() => ({
      theme: globalThis.localStorage.getItem('lockstate.settings.theme'),
      // Constitution article 13: the theme is a preference with its own key,
      // and choosing one must not have written anything else.
      accessibility: globalThis.localStorage.getItem('lockstate.settings.accessibility'),
      input: globalThis.localStorage.getItem('lockstate.settings.input'),
    }));
    expect(stored.theme).toBe('{"version":1,"preference":"dark"}');
    expect(stored.accessibility).toBeNull();
    expect(stored.input).toBeNull();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await paintedBackground(page)).toBe(NIGHT_BACKGROUND);
  });
});

test.describe('a browser that will not store anything', () => {
  test('still boots and still switches, it merely does not remember', async ({ page }) => {
    /*
     * The shape Chrome actually takes when site data is blocked for the
     * origin: the **property getter** throws, so a guard that only wrapped
     * `getItem` would never run. `src/input/storage.ts` says so in its own
     * comment and `resolveBrowserKeyValueStore` is written around it; this is
     * that claim, driven rather than quoted.
     */
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('SecurityError: site data is blocked for this origin');
        },
      });
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(HARNESS_URL);

    // It booted at all, which is issue #199's lesson: a hostile store used to
    // abort the rest of the module and leave an empty page.
    await expect(page.locator("[data-choice='dark']")).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.locator("[data-choice='dark']").click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await paintedBackground(page)).toBe(NIGHT_BACKGROUND);

    // Not remembered, because it could not be -- the honest consequence.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
