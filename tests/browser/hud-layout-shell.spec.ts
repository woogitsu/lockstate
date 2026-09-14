import { expect, test, type Page } from './network-changed-fixture';
import {
  INSPECTOR_WIDTH_RANGE,
  MAP_WIDTH_RESERVE_PX,
  NAVIGATION_WIDTH_RANGE,
  SHEET_MAX_VIEWPORT_FRACTION,
  SHEET_MIN_HEIGHT_PX,
} from '../../src/ui/hud/hud-layout';
import { SEPARATOR_COARSE_STEP, SEPARATOR_STEP } from '../../src/ui/primitives/resize-separator';

/**
 * The HUD shell's layout, on the page a player loads (#1159, stage 3 of the
 * 2026-09-13 identity rollout).
 *
 * ## What this file is for, and what it deliberately leaves to two others
 *
 * `tests/unit/hud-layout.test.ts` proves the arithmetic -- every ruled limit,
 * every tier, every "not chosen yet" -- in `node`, where a mutation of it can
 * be watched going red. `tests/browser/resize-separator.spec.ts` proves the
 * *gesture*: nine ways a drag can end, each against a real Phaser canvas, with
 * pointer capture keeping every one of them out of the world.
 *
 * What neither can settle is the thing this file is: **the wiring reaches
 * them on the assembled page**. A limit that is right in a pure function and
 * applied to nothing, a separator whose `aria-valuemax` disagrees with the
 * width the rail actually paints, a fold that hides a panel and leaves the
 * keyboard inside it, a preference written to a key nothing reads back -- all
 * of those are green one layer down and broken for a player.
 *
 * ## Three device widths, named rather than swept
 *
 * `DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md` gives the three tiers
 * different layouts, not different numbers: *"Telefon ma dolną nawigację i
 * panel; tablet/desktop mają mapę między bokami."* So the cases below are
 * written per tier rather than looped over one set of assertions, because the
 * assertion that matters is a different one at each.
 */

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 375, height: 812 };

const LAYOUT_STORAGE_KEY = 'lockstate.settings.layout';

/** Everything the shell painted onto `.hud`, in one round trip. */
async function layout(page: Page): Promise<{
  readonly navigationWidth: number;
  readonly inspectorWidth: number;
  readonly railWidth: number;
  readonly sheetHeight: number;
  readonly placement: string;
  readonly collapsed: Record<string, string>;
  readonly mapOnly: string;
}> {
  return page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>('.hud')!;
    const style = getComputedStyle(hud);
    const px = (name: string): number => Number.parseFloat(style.getPropertyValue(name));
    const tabs = document.querySelector<HTMLElement>('.hud__tabs')!;
    const rail = document.querySelector<HTMLElement>('.hud__rail')!;
    const side = document.querySelector<HTMLElement>('.hud__side')!;
    return {
      navigationWidth: tabs.getBoundingClientRect().width,
      inspectorWidth: px('--hud-inspector-width'),
      railWidth: rail.getBoundingClientRect().width,
      sheetHeight: side.getBoundingClientRect().height,
      placement: hud.dataset['layoutNavigationPlacement'] ?? '',
      collapsed: {
        navigation: hud.dataset['layoutNavigation'] ?? '',
        inspector: hud.dataset['layoutInspector'] ?? '',
        metrics: hud.dataset['layoutMetrics'] ?? '',
      },
      mapOnly: hud.dataset['layoutMapOnly'] ?? '',
    };
  });
}

/** The separator's announced contract, which is what a screen reader is told. */
async function aria(page: Page, selector: string): Promise<Record<string, string | null>> {
  return page.evaluate((css: string) => {
    const node = document.querySelector(css)!;
    return {
      role: node.getAttribute('role'),
      orientation: node.getAttribute('aria-orientation'),
      label: node.getAttribute('aria-label'),
      now: node.getAttribute('aria-valuenow'),
      min: node.getAttribute('aria-valuemin'),
      max: node.getAttribute('aria-valuemax'),
    };
  }, selector);
}

async function storedLayout(page: Page): Promise<unknown> {
  return page.evaluate((key: string) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  }, LAYOUT_STORAGE_KEY);
}

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function open(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.locator('.hud').waitFor();
  // The layout is re-resolved once after the interface scale is installed, and
  // the scale is installed after the HUD mounts. Waiting for the attribute the
  // shell stamps is waiting for that second pass rather than for a duration.
  await expect(page.locator('.hud[data-layout-navigation-placement]')).toHaveCount(1);
}

test.describe('the HUD layout shell', () => {
  test('opens at exactly the layout this repository drew before it existed', async ({ page }) => {
    await open(page, DESKTOP);

    const state = await layout(page);
    // 264px is `--hud-rail-panel-width`'s own value, and the default is that
    // number on purpose: every pinned panel measurement in `app-shell.spec.ts`
    // was taken against a 264px rail, so arriving at this stage moves none of
    // them. The rail is that plus its two gutters.
    expect(state.inspectorWidth).toBe(264);
    expect(state.railWidth).toBeCloseTo(264 + 24, 1);
    expect(state.navigationWidth).toBe(180);
    expect(state.placement).toBe('rail');
    expect(state.collapsed).toEqual({ navigation: 'open', inspector: 'open', metrics: 'open' });
    // And nothing is written until the player asks for something.
    expect(await storedLayout(page)).toBeNull();
  });

  test('announces the delivery’s own limits on both separators, in the unit it drags in', async ({ page }) => {
    await open(page, DESKTOP);

    const navigation = await aria(page, '.hud-layout__separator--navigation');
    expect(navigation.role).toBe('separator');
    // A separator between a LEFT and a RIGHT pane is itself a VERTICAL line.
    expect(navigation.orientation).toBe('vertical');
    expect(navigation.label).toBe('Resize the sections');
    expect(navigation.min).toBe(String(NAVIGATION_WIDTH_RANGE.min));
    expect(navigation.max).toBe(String(NAVIGATION_WIDTH_RANGE.max));
    expect(navigation.now).toBe('180');

    const inspector = await aria(page, '.hud-layout__separator--inspector');
    expect(inspector.orientation).toBe('vertical');
    expect(inspector.label).toBe('Resize the panels');
    expect(inspector.min).toBe(String(INSPECTOR_WIDTH_RANGE.min));
    // 1440 - 180 navigation - 320 map reserve = 940, so the delivery's own 600
    // is what binds at this width rather than the map's share.
    expect(inspector.max).toBe(String(INSPECTOR_WIDTH_RANGE.max));
    expect(inspector.now).toBe('264');
  });

  test('narrows the inspector’s ceiling by the map’s share where the window cannot afford both', async ({
    page,
  }) => {
    await open(page, TABLET);

    // 1024 - 180 - 320 = 524, below the ruled 600. The announced maximum is the
    // one that is actually reachable, which is the whole point of announcing it.
    const inspector = await aria(page, '.hud-layout__separator--inspector');
    expect(inspector.max).toBe(String(TABLET.width - 180 - MAP_WIDTH_RESERVE_PX));

    // And End takes it there, so the number announced is the number reachable.
    await page.locator('.hud-layout__separator--inspector').focus();
    await page.keyboard.press('End');
    expect((await layout(page)).inspectorWidth).toBe(TABLET.width - 180 - MAP_WIDTH_RESERVE_PX);
  });

  test('the keyboard reaches every step the delivery specifies, on the assembled page', async ({ page }) => {
    await open(page, DESKTOP);
    const separator = page.locator('.hud-layout__separator--inspector');
    await separator.focus();

    // The handle is on the inspector's LEFT edge, so Left makes it wider and
    // Right makes it narrower: the arrow moves the separator, not the number.
    await page.keyboard.press('ArrowLeft');
    expect((await layout(page)).inspectorWidth).toBe(264 + SEPARATOR_STEP);

    await page.keyboard.press('ArrowRight');
    expect((await layout(page)).inspectorWidth).toBe(264);

    await page.keyboard.press('Shift+ArrowLeft');
    expect((await layout(page)).inspectorWidth).toBe(264 + SEPARATOR_COARSE_STEP);

    await page.keyboard.press('Home');
    expect((await layout(page)).inspectorWidth).toBe(INSPECTOR_WIDTH_RANGE.min);

    await page.keyboard.press('End');
    expect((await layout(page)).inspectorWidth).toBe(INSPECTOR_WIDTH_RANGE.max);

    // A double-click puts it back to the default, which is the rail this
    // repository has always drawn rather than the widest the range allows.
    await separator.dblclick();
    expect((await layout(page)).inspectorWidth).toBe(264);

    // And Enter folds it, which is the fifth step in the same list.
    await page.keyboard.press('Enter');
    expect((await layout(page)).collapsed.inspector).toBe('collapsed');
  });

  test('the slider offers exactly the range the separator does, and moves the same panel', async ({ page }) => {
    await open(page, DESKTOP);
    await page.locator('.hud-layout__button').click();

    const slider = page.locator('#hud-layout-inspector');
    expect(await slider.getAttribute('min')).toBe(String(INSPECTOR_WIDTH_RANGE.min));
    expect(await slider.getAttribute('max')).toBe(String(INSPECTOR_WIDTH_RANGE.max));
    expect(await slider.inputValue()).toBe('264');

    await slider.fill('420');
    expect((await layout(page)).inspectorWidth).toBe(420);
    // The separator agrees, because there is one size and three controls over
    // it rather than three sizes.
    expect((await aria(page, '.hud-layout__separator--inspector')).now).toBe('420');
  });

  test('a pointer drag resizes the rail and is written down once, when the hand lets go', async ({ page }) => {
    await open(page, DESKTOP);
    const start = await centreOf(page, '.hud-layout__separator--inspector');

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(start.x - 100, start.y, { steps: 10 });

    // Followed live...
    expect((await layout(page)).inspectorWidth).toBe(364);
    // ...and not persisted yet: a drag reports sixty sizes a second and exactly
    // one of them is a decision.
    expect(await storedLayout(page)).toBeNull();

    await page.mouse.up({ button: 'left' });
    expect(await storedLayout(page)).toEqual({ version: 1, collapsed: [], inspectorWidth: 364 });
  });

  test('a pointercancel mid-drag puts the rail back and writes nothing', async ({ page }) => {
    await open(page, DESKTOP);
    const start = await centreOf(page, '.hud-layout__separator--inspector');

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(start.x - 120, start.y, { steps: 6 });
    expect((await layout(page)).inspectorWidth).toBe(384);

    /*
     * A real `pointercancel`, dispatched at the element the capture retargets
     * to -- which is the handle, because it is holding the pointer.
     *
     * Synthesised rather than provoked, and that is the honest description:
     * Chromium raises this one when it decides a gesture was something else
     * (a touch that became a scroll, a pen leaving range), and a desktop mouse
     * drag has no way to ask for it. What is being proved here is the
     * *wiring* -- that the assembled page's separator listens for it and puts
     * the panel back -- and `resize-separator.spec.ts` proves the same path
     * from a real touch sequence through CDP.
     */
    await page.evaluate(() => {
      const handle = document.querySelector('.hud-layout__separator--inspector')!;
      handle.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    });

    // Back where the drag started, and nothing written: an abnormal end is not
    // a size the player chose.
    expect((await layout(page)).inspectorWidth).toBe(264);
    expect(await storedLayout(page)).toBeNull();
  });

  test('the cursor leaving the window ends the drag and puts the rail back', async ({ page }) => {
    await open(page, DESKTOP);
    const start = await centreOf(page, '.hud-layout__separator--inspector');

    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(start.x - 80, start.y, { steps: 4 });
    expect((await layout(page)).inspectorWidth).toBe(344);

    /*
     * `pointerout` on the **document** with a null `relatedTarget`, which is
     * the signal that survives pointer capture: `pointerleave` on the element
     * cannot fire while that element is the capture target, because under
     * capture the pointer counts as inside it wherever it goes.
     */
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerId: 1, relatedTarget: null }));
    });

    expect((await layout(page)).inspectorWidth).toBe(264);
    expect(await storedLayout(page)).toBeNull();
  });

  test('every region folds, keeps a handle on screen, and never leaves the keyboard inside itself', async ({
    page,
  }) => {
    await open(page, DESKTOP);

    for (const region of ['navigation', 'inspector', 'metrics'] as const) {
      const arrow = page.locator(`.hud-layout__arrow[data-layout-region="${region}"]`);
      // The keyboard starts inside the region, which is the case constitution
      // article 16 is actually about: "Ukryty panel nie przechwytuje
      // klawiatury."
      await page.locator(`.hud-layout__arrow[data-layout-region="${region}"]`).focus();
      await arrow.click();

      expect((await layout(page)).collapsed[region]).toBe('collapsed');
      // The handle is still there, still laid out, and still the thing the
      // keyboard is standing on.
      await expect(arrow).toBeVisible();
      expect(await arrow.evaluate((node) => node === document.activeElement)).toBe(true);
      expect(await arrow.getAttribute('aria-expanded')).toBe('false');

      await arrow.click();
      expect((await layout(page)).collapsed[region]).toBe('open');
      expect(await arrow.getAttribute('aria-expanded')).toBe('true');
    }
  });

  test('folding a panel while the keyboard is inside it hands the keyboard to the panel’s own arrow', async ({
    page,
  }) => {
    await open(page, DESKTOP);

    // Focus a control that is genuinely inside the inspector, then fold the
    // inspector from the Layout menu rather than from its own arrow -- so the
    // hand-off is the code's decision and not a side effect of what was
    // pressed.
    await page.locator('.ui-tab[data-tab="build"]').click();
    await page.locator('.hud-build .ui-action').first().focus();
    expect(
      await page.evaluate(() => document.querySelector('.hud__rail')!.contains(document.activeElement)),
      'the control this test is about is not inside the rail',
    ).toBe(true);

    await page.locator('.hud-layout__arrow[data-layout-region="inspector"]').click();

    const active = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(active).toContain('hud-layout__arrow');
    expect(
      await page.evaluate(() => document.body.contains(document.activeElement)),
      'the browser blurred to <body>, which is the defect article 16 names',
    ).toBe(true);
  });

  test('map only folds all three at once and brings them all back', async ({ page }) => {
    await open(page, DESKTOP);
    await page.locator('.hud-layout__button').click();

    const mapOnly = page.locator('.hud-layout__map-only');
    await mapOnly.click();
    let state = await layout(page);
    expect(state.mapOnly).toBe('true');
    expect(state.collapsed).toEqual({
      navigation: 'collapsed',
      inspector: 'collapsed',
      metrics: 'collapsed',
    });
    expect(await mapOnly.getAttribute('aria-pressed')).toBe('true');
    // And the control that folded everything is still reachable, which is what
    // makes it a mode rather than a trap.
    await expect(page.locator('.hud-layout__button')).toBeVisible();

    await mapOnly.click();
    state = await layout(page);
    expect(state.mapOnly).toBe('false');
    expect(state.collapsed).toEqual({ navigation: 'open', inspector: 'open', metrics: 'open' });
  });

  test('the clock is still readable with the counters folded away', async ({ page }) => {
    await open(page, DESKTOP);

    // The strip's own clock, before.
    await expect(page.locator('.hud-strip__clock')).toBeVisible();

    await page.locator('.hud-layout__arrow[data-layout-region="metrics"]').click();
    await expect(page.locator('.hud-strip__clock')).toBeHidden();

    await page.locator('.hud-layout__button').click();
    const clock = page.locator('.hud-layout__clock');
    await expect(clock).toBeVisible();
    // The same three readouts the strip carries, from the same view model on
    // the same tick -- a day number (or the honest `--` before any session has
    // reported one), a day-progress percentage, and the speed or the word a
    // stopped clock is written with (#639).
    await expect(clock.locator('.hud-clock__day')).toHaveCount(1);
    await expect(clock.locator('.hud-clock__day-progress')).toHaveCount(1);
    await expect(clock.locator('.hud-clock__speed')).toHaveText(/PAUSED|×/);
  });

  test('reset clears the layout key and nothing else', async ({ page }) => {
    await open(page, DESKTOP);

    await page.locator('.hud-layout__separator--inspector').focus();
    await page.keyboard.press('End');
    await page.locator('.hud-layout__arrow[data-layout-region="metrics"]').click();
    expect(await storedLayout(page)).toEqual({
      version: 1,
      collapsed: ['metrics'],
      inspectorWidth: INSPECTOR_WIDTH_RANGE.max,
    });

    // The interface scale is a different key and must survive the reset --
    // constitution article 13's "niezależny reset", which is the whole reason
    // the layout has a key of its own.
    await page.locator('.display-scale__cycle').click();
    const scaleBefore = await page.evaluate(() =>
      window.localStorage.getItem('lockstate.settings.accessibility'),
    );

    await page.locator('.hud-layout__button').click();
    await page.locator('.hud-layout__reset').click();

    expect(await storedLayout(page)).toEqual({ version: 1, collapsed: [] });
    // 264 design pixels at the 125 % the press above installed. A stored size
    // is scale-independent and a painted one is not, which is the contract
    // `hud-layout.ts` states -- and this line is where the two meet.
    expect((await layout(page)).inspectorWidth).toBe(264 * 1.25);
    expect(await page.evaluate(() => window.localStorage.getItem('lockstate.settings.accessibility'))).toBe(
      scaleBefore,
    );
  });

  test('a layout survives a reload and is nowhere in the save payload', async ({ page }) => {
    await open(page, DESKTOP);

    await page.locator('.hud-layout__separator--navigation').focus();
    await page.keyboard.press('Home');
    await page.locator('.hud-layout__arrow[data-layout-region="inspector"]').click();

    await page.reload();
    await page.locator('.hud').waitFor();
    await expect(page.locator('.hud[data-layout-navigation-placement]')).toHaveCount(1);

    const state = await layout(page);
    expect(state.navigationWidth).toBe(NAVIGATION_WIDTH_RANGE.min);
    expect(state.collapsed.inspector).toBe('collapsed');

    /*
     * And the save is untouched. The layout lives under its own key and the
     * prison's snapshot has no field for it -- constitution article 13:
     * *"Nie zmieniają ... schematu zapisu gry."*
     *
     * Checked by reading every other `lockstate.*` key on the origin for the
     * numbers this test just chose, rather than by naming the save's own key:
     * a field added to the save under a different name would slip past a
     * check that only knew one place to look.
     */
    const elsewhere = await page.evaluate((layoutKey: string) => {
      const leaks: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key === null || key === layoutKey) continue;
        const value = window.localStorage.getItem(key) ?? '';
        if (value.includes('inspectorWidth') || value.includes('navigationWidth') || value.includes('sheetHeight')) {
          leaks.push(key);
        }
      }
      return leaks;
    }, LAYOUT_STORAGE_KEY);
    expect(elsewhere).toEqual([]);
  });

  test('a phone drags the sheet by height, between 180px and two thirds of the screen', async ({ page }) => {
    await open(page, PHONE);

    const state = await layout(page);
    // A phone has bottom navigation, so there is no width to drag and the
    // navigation's own separator is not laid out at all.
    expect(state.placement).toBe('bar');
    await expect(page.locator('.hud-layout__separator--navigation')).toBeHidden();

    const sheet = await aria(page, '.hud-layout__separator--inspector');
    // A separator between an ABOVE and a BELOW pane is itself a HORIZONTAL line.
    expect(sheet.orientation).toBe('horizontal');
    expect(sheet.min).toBe(String(SHEET_MIN_HEIGHT_PX));
    expect(sheet.max).toBe(String(Math.round(PHONE.height * SHEET_MAX_VIEWPORT_FRACTION)));

    // The handle is on the sheet's TOP edge, so Down makes it shorter.
    await page.locator('.hud-layout__separator--inspector').focus();
    await page.keyboard.press('Home');
    expect((await aria(page, '.hud-layout__separator--inspector')).now).toBe(String(SHEET_MIN_HEIGHT_PX));
    expect(await storedLayout(page)).toEqual({ version: 1, collapsed: [], sheetHeight: SHEET_MIN_HEIGHT_PX });
  });

  test('a tablet lays the map between the two sides, with the navigation on the left', async ({ page }) => {
    await open(page, TABLET);

    const geometry = await page.evaluate(() => {
      const rect = (css: string) => {
        const node = document.querySelector(css)!;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right };
      };
      return { tabs: rect('.hud__tabs'), rail: rect('.hud__rail'), width: window.innerWidth };
    });

    // The sections on the left edge, the panels on the right, and a map
    // between them -- "tablet/desktop mają mapę między bokami".
    expect(geometry.tabs.left).toBe(0);
    expect(geometry.rail.right).toBe(geometry.width);
    expect(geometry.rail.left - geometry.tabs.right).toBeGreaterThanOrEqual(MAP_WIDTH_RESERVE_PX);
  });
});
