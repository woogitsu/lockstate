import { expect, test } from './network-changed-fixture';

/**
 * The Polish catalogue reaching a running page, in a real browser (#662).
 *
 * ## Why this needs a browser at all
 *
 * `tests/unit/localization-startup-locale.test.ts` drives the same route over
 * the same real chunk, and proves everything about it that a module graph can
 * prove. Three things sit outside that layer entirely, and every one of them
 * is a thing the wiring -- not the route -- can get wrong:
 *
 * 1. **`navigator.languages`.** The composition root reads it; Vitest runs in
 *    `environment: 'node'`, where there is no `navigator` to read. A browser
 *    that asks for Polish is the only place the selection input is real.
 * 2. **The top-level `await` in `src/main.ts`.** It makes the entry module an
 *    async module, so the page's whole boot -- Phaser, the HUD, the save panel,
 *    the worker -- now happens after a promise settles. Nothing below this
 *    layer evaluates that module at all.
 * 3. **Silence rather than a crash**, which is #662's third requirement. A
 *    rejected dynamic `import()` inside a top-level `await` is the exact shape
 *    that produces a blank page and an `unhandledrejection` if it is caught
 *    anywhere but where it should be. Here the chunk is blocked at the network
 *    and the page is required to come up complete, in English, with a report.
 *
 * ## The assertion anchor, and why it is this one
 *
 * `<main id="app">`'s accessible name (`app.shell.label`), which `src/main.ts`
 * sets from the page's one localizer as soon as that localizer exists -- the
 * earliest translated text on the page and the only one produced by the
 * composition root itself rather than by a panel. It is deliberately not a HUD
 * label: those are being rewritten for the navigation move, and a spec that
 * asserted one would be reporting on someone else's branch.
 */

const APP_URL = '/index.html';
const ENGLISH_SHELL_LABEL = 'Lockstate game application';
const POLISH_SHELL_LABEL = 'Aplikacja gry Lockstate';

/** The dev server's URL for the chunk `src/main.ts` registers for `pl`. */
const PL_CHUNK_URL = '**/services/localization/pl-catalog.ts*';

test.describe('a browser that asks for Polish', () => {
  test.use({ locale: 'pl-PL' });

  test('boots in Polish, having fetched the catalogue chunk', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await page.goto(APP_URL);
    await page.waitForSelector('.hud');

    await expect(page.locator('#app')).toHaveAttribute('aria-label', POLISH_SHELL_LABEL);
    expect(
      requested.filter((url) => url.includes('pl-catalog')),
      'the page never requested the Polish catalogue chunk, so the text above came from somewhere else',
    ).not.toEqual([]);
  });
});

test.describe('a browser that asks for a language nothing is published for', () => {
  test.use({ locale: 'de-DE' });

  test('boots in English and downloads no catalogue at all', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await page.goto(APP_URL);
    await page.waitForSelector('.hud');

    await expect(page.locator('#app')).toHaveAttribute('aria-label', ENGLISH_SHELL_LABEL);
    // The whole point of the split: a player who does not read Polish never
    // pays for it. In the built artefact this is a chunk `index.html` neither
    // names nor preloads; over the dev server it is a module never requested.
    expect(requested.filter((url) => url.includes('pl-catalog'))).toEqual([]);
  });
});

test.describe('a browser that asks for Polish and cannot have it', () => {
  test.use({ locale: 'pl-PL' });

  test('comes up complete in English, reports the reason, and raises nothing', async ({ page }) => {
    const warnings: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // The failure a player actually meets: the chunk is published, the network
    // refuses it. Aborting the request is what makes the `import()` reject.
    await page.route(PL_CHUNK_URL, (route) => route.abort());

    await page.goto(APP_URL);
    await page.waitForSelector('.hud');

    // Not a page of raw keys and not a blank screen: the bundled English
    // catalogue is complete and the page renders from it.
    await expect(page.locator('#app')).toHaveAttribute('aria-label', ENGLISH_SHELL_LABEL);
    expect(pageErrors, 'a failed catalogue load must never reach the player as an error').toEqual([]);
    expect(
      warnings.filter((text) => text.includes('"pl" message catalogue could not be loaded')),
      `the failure was silent in both directions, which is worse than either. Warnings seen: ${JSON.stringify(warnings)}`,
    ).not.toEqual([]);
  });
});

/**
 * **The Polish section names fit the phone's tab bar without landing on each
 * other**, re-measured after the navigation move (#1190) and pinned here so it
 * cannot come back unnoticed.
 *
 * Before that move, at 375x812 with the Polish catalogue reachable, four of the
 * five adjacent label pairs **overlapped**: PRZEGLĄD/BUDOWA -2.78px,
 * BUDOWA/POMIESZCZENIA -8.36, POMIESZCZENIA/OCHRONA -12.20, OCHRONA/ROZKŁAD
 * -1.73 -- 380px of label in a 375px bar, against English's 286px. The move
 * renamed the sections (`Pomieszczenia`, thirteen characters, became `Strefy`)
 * and re-measured on today's tree the same five labels total **304.81px** in a
 * 351px `.hud-tabs__inner`, with every gap positive and the tightest
 * `Strefy/Zarządzaj` at **5.14px**.
 *
 * ## Why this is its own assertion and not a corollary of the two beside it
 *
 * `ui-shell.spec.ts` already pins that the bar's right edge stays inside 375px
 * and that no section name wraps to a second line. Neither catches this: a bar
 * that fits and labels that each sit on one line can still be laid out with the
 * labels **overflowing their own buttons** into their neighbours, which is
 * exactly what the pre-move measurement found. And both of those run in the
 * default locale, where the names are short; this one runs where they are not.
 *
 * **A shortest-gap number is deliberately not pinned.** The claim is that the
 * labels do not collide, not that any particular slack survives a type ramp
 * change; a pixel floor here would fail on a change that is fine and would say
 * nothing about a change that is not.
 *
 * **The adjacent defect this used to record as unfixed is #1192, and it is
 * closed** -- the paragraph is kept in its own words because it is what this
 * spec described for a day: *"`Plan dnia` is laid out in two line boxes at
 * this viewport (26.38px against every other label's 13.19px), because
 * `.ui-tab__label` sets no `white-space` and that name has a space in it -- the
 * mechanism `ui-shell.spec.ts`'s wrap test records, in the locale that test
 * cannot see."*
 *
 * The label is `white-space: nowrap` everywhere now, and below 721px the tab
 * bar tracks it at `--label-tracking-tight` to pay for the width that costs --
 * `nowrap` alone overlapped `Zarządzaj/Plan dnia` by 2.50px, which is why the
 * height fix and the width assertion below are one subject after all. The
 * second `it` in this block is the gate #1192 asks for: the wrap spec, run in
 * the locale that has the defect.
 */
/**
 * **RE-POINTED FROM 375x812 TO 768x812 ON 2026-09-16, AND EVERY MEASUREMENT
 * ABOVE IS KEPT BECAUSE IT IS WHAT THE OWNER'S RULING WAS MADE AGAINST.**
 *
 * They ruled that below 721px a tab shows its icon and not its name (#1192,
 * `docs/VISUAL_IDENTITY.md` item 5). At 375x812 every label is now a 1px
 * `.ui-sr-only` box, so **both tests below would have stayed green and meant
 * nothing** -- five 1px boxes never overlap and never wrap. That is the
 * vacuous-green failure this file's own comments warn about elsewhere, and the
 * answer is to follow the label to where it is still drawn rather than to
 * delete the gate with it.
 *
 * **721x420, and the short height is not a typo.** Above 720px the navigation
 * is laid out as a *column* wherever it fits (`navigationPlacement` in
 * `src/ui/hud/hud-layout.ts` is a fit test, not a breakpoint), and a column
 * cannot have two names side by side -- measured at 768x812 the five labels
 * stack and every "gap" reads -46 to -76px, so the overlap test would have
 * failed on its own arithmetic while nothing was wrong. 721px is the narrowest
 * width above the break, and 420px is short enough that the five tabs do not
 * fit a rail, which is the one state where Polish names sit beside each other
 * above the break at all.
 *
 * **AND A WEAKNESS THAT HAS TO BE DECLARED RATHER THAN LEFT TO BE
 * REDISCOVERED, MEASURED 2026-09-16: MUTATING `white-space: nowrap` IN
 * `primitives.css` NO LONGER TURNS THE WRAP TEST BELOW RED.** At 721x420 the
 * bar is `fit-content` and every tab is wider than its own name (103.41px
 * against `Zarządzaj`'s 78.41), so nothing is squeezed and nothing wraps with
 * or without that declaration. The widths where the bar *did* squeeze a tab
 * are the widths where the name is no longer drawn. Both tests below are
 * regression gates on the layout, not mutation gates on that declaration.
 *
 * What is no longer gated
 * anywhere is the phone bar's *tracking*, because there is no phone label to
 * track; what replaces it at 375x812 is
 * `ui-shell.spec.ts`'s "every tab still has an accessible name", plus the
 * Polish test at the foot of this block.
 */
test.describe('the Polish section names on a phone', () => {
  test.use({ locale: 'pl-PL' });

  test('no two adjacent tab labels overlap at 721x420', async ({ page }) => {
    await page.setViewportSize({ width: 721, height: 420 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    // The bar is measured in Polish or the measurement is about nothing.
    await expect(page.locator('#app')).toHaveAttribute('aria-label', POLISH_SHELL_LABEL);

    const labels = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab]')].map((tab) => {
        const span = tab.querySelector<HTMLElement>('.ui-tab__label');
        const rect = span === null ? null : span.getBoundingClientRect();
        return {
          id: tab.dataset['tab'] ?? '',
          text: span?.textContent ?? '',
          left: rect === null ? 0 : rect.left,
          right: rect === null ? 0 : rect.right,
        };
      }),
    );

    // Not vacuous: five sections, each with a label that was actually laid out,
    // and every one of them Polish rather than an English fallback.
    expect(labels.map((label) => label.text)).toEqual(['Przegląd', 'Buduj', 'Strefy', 'Zarządzaj', 'Plan dnia']);

    const collisions = labels.slice(0, -1).flatMap((label, index) => {
      const next = labels[index + 1]!;
      const gap = next.left - label.right;
      return gap > 0 ? [] : [{ pair: `${label.text}/${next.text}`, gap: Math.round(gap * 100) / 100 }];
    });
    expect(
      collisions,
      'these Polish section names are drawn on top of each other -- a layout defect, not a word to shorten',
    ).toEqual([]);
  });

  test('no section name wraps to a second line at 721x420 (#1192)', async ({ page }) => {
    /*
     * `ui-shell.spec.ts`'s wrap test, in the locale that finds the defect.
     *
     * That one drives the harness in the default locale, where the label that
     * used to wrap (`Day plan`) was renamed to the one-word `Schedule` for
     * exactly this reason -- so it has been green over a page that wraps since
     * the Polish names landed. This drives the real app with the Polish
     * catalogue reachable, which is the only place `Plan dnia` is laid out at
     * all.
     *
     * Asserted as line boxes **and** as a height, because they fail
     * differently: a label can be two line boxes inside a button tall enough
     * to hide it, and a label can be one line box at a font size nothing else
     * on the bar uses. The height comparison is against the other labels
     * rather than a pinned pixel count, for the reason the overlap test above
     * pins no gap floor.
     */
    await page.setViewportSize({ width: 721, height: 420 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await expect(page.locator('#app')).toHaveAttribute('aria-label', POLISH_SHELL_LABEL);

    const labels = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud__tabs [data-tab] .ui-tab__label')].map((label) => ({
        text: label.textContent ?? '',
        lineBoxes: label.getClientRects().length,
        height: Math.round(label.getBoundingClientRect().height * 10) / 10,
      })),
    );

    // Not vacuous, and Polish rather than an English fallback: the same five
    // names the test above reads, laid out.
    expect(labels.map((label) => label.text)).toEqual(['Przegląd', 'Buduj', 'Strefy', 'Zarządzaj', 'Plan dnia']);
    const shortest = Math.min(...labels.map((label) => label.height));
    expect(shortest, 'no tab label was laid out at all').toBeGreaterThan(0);
    expect(
      labels.filter((label) => label.height > shortest + 1),
      'these Polish section names wrap, and every line they wrap to comes off the rail',
    ).toEqual([]);
    expect(labels.every((label) => label.lineBoxes === 1)).toBe(true);
  });

  /**
   * **The Polish section names reach a screen reader on a phone, where they no
   * longer reach the screen** (#1192, the owner's ruling of 2026-09-16).
   *
   * `ui-shell.spec.ts` asserts the same property in the default catalogue.
   * This one exists for the same reason the two tests above it do: the default
   * catalogue is not where a localisation defect shows. A tab whose accessible
   * name fell back to English, or to nothing, would leave a Polish player with
   * five unnamed glyphs and no other navigation surface on the device.
   */
  test('every tab is announced by its Polish name at 375x812', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(APP_URL);
    await page.waitForSelector('.hud');
    await expect(page.locator('#app')).toHaveAttribute('aria-label', POLISH_SHELL_LABEL);

    const sections = [
      ['overview', 'Przegląd'],
      ['build', 'Buduj'],
      ['zones', 'Strefy'],
      ['manage', 'Zarządzaj'],
      ['day-plan', 'Plan dnia'],
    ] as const;
    for (const [id, name] of sections) {
      const tab = page.locator(`.hud__tabs .ui-tab[data-tab="${id}"]`);
      await expect(tab, `the ${id} tab is not on screen`).toBeVisible();
      await expect(tab, `the ${id} tab reaches a screen reader as nothing`).toHaveAccessibleName(name);
    }

    // Not vacuous the other way either: the names really are off the screen
    // here, so what the assertions above read is the accessibility tree and
    // not the drawn bar.
    const drawn = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud__tabs .ui-tab__label')].map(
        (label) => Math.round(label.getBoundingClientRect().width * 100) / 100,
      ),
    );
    expect(drawn, 'the Polish section names are still being drawn below the break').toEqual([1, 1, 1, 1, 1]);
  });
});
