import { expect, test, type Page } from './network-changed-fixture';

const APP_URL = '/index.html';

/**
 * A HUD box that hides part of its own content paints a sign that it does
 * (issue #902).
 *
 * ## What was wrong
 *
 * The two catalogues a player builds their prison from are deliberate
 * scrollers. `app-shell.spec.ts` calls `.hud-rooms__list` *"the one box here
 * that is meant to hold more than it shows"*, and the height budgets in
 * `hud.css` are derived around both lists being the donor. None of that is
 * disputed here. What nothing on screen did was tell the player. Measured on
 * this page at 1440x900 on a fresh prison, before the rule this spec guards:
 *
 * | box | hidden / total | what that is |
 * | --- | --- | --- |
 * | `.hud-build__list` | 701px of 924px (76%) | ~5 of 19 buildables on screen |
 * | `.hud-rooms__list` | 585px of 837px (70%) | ~4 of 18 room types, `Cell` below the fold |
 * | `.hud-build` | 271px of 801px, queue and coordinates open | the QUEUED header at y=1042 in a 900px viewport |
 *
 * with no chevron, fade or count anywhere. The owner's standing design
 * directive names this case: the game is to be easy and friendly to play, not
 * full of hidden features.
 *
 * ## Why this asserts pixels
 *
 * Because every cheaper channel is either blind or vacuous here.
 *
 * 1. **The scrollbar cannot be measured in this suite at all.** Playwright
 *    launches headless Chromium with `--hide-scrollbars`, so every scroll
 *    container on the page reports `offsetWidth - clientWidth = 0` whatever
 *    the stylesheet says. Removing that one flag from the same browser at the
 *    same viewport turns all three boxes above into a 15px gutter, which is
 *    also why the two playtests that measured "0.0px scrollbar gutter" were
 *    measuring the harness rather than the game. The sign therefore has to be
 *    something this stylesheet paints, and the assertion has to read paint.
 * 2. **`scrollHeight > clientHeight` was already asserted and was green
 *    throughout.** Being scrollable is the state; the defect was the absence
 *    of a sign for it.
 * 3. **A computed `background-image` proves only that something was
 *    authored** -- not that it lands where a player looks, and not that it
 *    tracks the scroll position. A static fade would be the same defect with
 *    a different lie: a list claiming more below when the player is already
 *    at the bottom.
 *
 * So this reads the rendered pixels of a 6px column of row padding down the
 * left edge of the list -- no glyph can be there, `.ui-row`'s padding is 8px
 * -- and averages the luminance of the top 18px and the bottom 18px of it, at
 * two scroll positions. The claim is a difference between the same band at
 * two scroll positions, so the surface colour, the interface scale and the
 * theme all cancel.
 *
 * ## What it does not assert
 *
 * `aside.save-panel` hides 105px of 225px in the same rail and is the same
 * class of defect. It is styled in `src/styles.css` rather than
 * `src/ui/hud/hud.css`, so it is a separate change, and a spec that asserted
 * it would go red on a file this one's fix does not touch.
 */

/** The height of the band sampled at each edge, in CSS pixels. */
const BAND = 18;

interface EdgeLuminance {
  readonly top: number;
  readonly bottom: number;
}

interface ListGeometry {
  readonly left: number;
  readonly top: number;
  readonly height: number;
  readonly hiddenPx: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly rows: number;
}

async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

/** A prison, so the panels hold what a player's first session holds. */
async function newPrison(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day'), 'the prison was never created').toHaveText('1');
}

async function listGeometry(page: Page, selector: string): Promise<ListGeometry | null> {
  return page.evaluate((target) => {
    const list = document.querySelector<HTMLElement>(target);
    if (list === null) return null;
    const box = list.getBoundingClientRect();
    return {
      left: Math.round(box.left),
      top: Math.round(box.top),
      height: Math.round(box.height),
      hiddenPx: list.scrollHeight - list.clientHeight,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      rows: list.querySelectorAll('[data-buildable], [data-room]').length,
    };
  }, selector);
}

/**
 * The average luminance of the top and bottom bands of the list, off the
 * rendered page.
 *
 * The screenshot is taken of a 6px column starting 2px inside the list's left
 * edge. `.ui-row` pads its content by 8px, so that column is row background
 * and nothing else in every row of every catalogue -- which is what makes the
 * two numbers comparable across a scroll that moves different rows under them.
 */
async function edgeLuminance(page: Page, geometry: ListGeometry): Promise<EdgeLuminance> {
  const shot = await page.screenshot({
    clip: { x: geometry.left + 2, y: geometry.top, width: 6, height: geometry.height },
  });
  return page.evaluate(
    async ({ data, band }) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2d context to decode the screenshot into');
      context.drawImage(bitmap, 0, 0);
      const width = bitmap.width;
      const height = bitmap.height;
      const pixels = context.getImageData(0, 0, width, height).data;
      // Closed only after its size has been read off it: an `ImageBitmap`
      // reports `0 x 0` once closed, and reading the width after this line is
      // how the first version of this helper measured every band as `NaN`.
      bitmap.close();
      const mean = (fromRow: number): number => {
        let sum = 0;
        let count = 0;
        for (let y = fromRow; y < fromRow + band; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            sum += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
            count += 1;
          }
        }
        return Math.round((sum / count) * 100) / 100;
      };
      return { top: mean(0), bottom: mean(height - band) };
    },
    { data: shot.toString('base64'), band: BAND },
  );
}

async function scrollTo(page: Page, selector: string, where: 'start' | 'end'): Promise<number> {
  return page.evaluate(
    ({ target, edge }) => {
      const list = document.querySelector<HTMLElement>(target);
      if (list === null) return -1;
      list.scrollTop = edge === 'start' ? 0 : list.scrollHeight;
      return list.scrollTop;
    },
    { target: selector, edge: where },
  );
}

test.describe('a HUD box that hides its own content shows that it does (#902)', () => {
  for (const [tabName, selector] of [
    ['Build', '.hud-build__list'],
    ['Rooms', '.hud-rooms__list'],
  ] as const) {
    test(`the ${tabName} catalogue paints an edge that says it continues`, async ({ page }) => {
      test.slow();
      await page.setViewportSize({ width: 1440, height: 900 });
      await openApp(page);
      await newPrison(page);
      await page.getByRole('button', { name: tabName, exact: true }).click();
      // Off every row, so no `:hover` background reaches a sampled band.
      await page.mouse.move(20, 20);
      await expect(page.locator(selector)).toBeVisible();

      const geometry = await listGeometry(page, selector);
      expect(geometry, `${selector} is not laid out on the ${tabName} tab`).not.toBeNull();
      if (geometry === null) return;

      /*
       * The first half of the claim, and the half that refuses the wrong fix:
       * the list still hides most of itself. Making the catalogues fit is not
       * what #902 asks for -- the scrolling is deliberate and the height
       * budgets above it are derived from it -- so a change that shortened
       * them would satisfy the paint assertion vacuously and goes red here
       * instead.
       */
      expect(
        geometry.hiddenPx,
        `${selector} no longer hides its content, so the sign asserted below is not the subject any more: ` +
          `${geometry.scrollHeight}px of rows in a ${geometry.clientHeight}px box`,
      ).toBeGreaterThan(200);

      const startScrollTop = await scrollTo(page, selector, 'start');
      const atStart = await edgeLuminance(page, geometry);
      const endScrollTop = await scrollTo(page, selector, 'end');
      const atEnd = await edgeLuminance(page, geometry);

      // eslint-disable-next-line no-console
      console.log(
        `[#902] ${selector} @1440x900: hides ${geometry.hiddenPx}px of ${geometry.scrollHeight}px over ` +
          `${geometry.rows} rows; scrollTop ${startScrollTop} -> top ${atStart.top} bottom ${atStart.bottom}; ` +
          `scrollTop ${endScrollTop} -> top ${atEnd.top} bottom ${atEnd.bottom}`,
      );

      expect(endScrollTop, `${selector} did not scroll, so neither edge state was reached`).toBeGreaterThan(200);

      /*
       * A shadow at an edge exactly while there is content past it. Four
       * numbers, two claims, and each claim is one band against itself at the
       * two scroll positions -- so the surface colour and the interface scale
       * cancel and only the shadow is left.
       *
       * The margin is 4 of 255. The step this paints is `--surface-raised` to
       * `--surface-sunken`, which is 13.8 of 255 at the shadow's full strength
       * and about 8.6 averaged over the band; the residue of the cover over
       * the shadow at the far end of the scroll is about a tenth of one step.
       * So 4 sits above the hairlines a scroll moves under the band and below
       * what the rule paints, with room either side.
       */
      expect(
        atStart.bottom,
        `the bottom edge of ${selector} looks the same with ${geometry.hiddenPx}px of catalogue below it as it ` +
          `does at the end of the scroll: ${atStart.bottom} against ${atEnd.bottom}`,
      ).toBeLessThan(atEnd.bottom - 4);
      expect(
        atEnd.top,
        `the top edge of ${selector} looks the same with the catalogue scrolled above it as it does at the start ` +
          `of the scroll: ${atEnd.top} against ${atStart.top}`,
      ).toBeLessThan(atStart.top - 4);
    });
  }

  /**
   * The class rather than the two instances, so the next scroll region added
   * to `hud.css` cannot arrive without the sign.
   *
   * The panels are in the walk as well as the lists: with one wall run queued
   * and the coordinate form open, `.hud-build` hides 271px of 801px and the
   * QUEUED section's own header is laid out at y=1042 in a 900px viewport.
   * `docs/research/2026-09-03-does-building-feel-good.md` §4 read that as a
   * panel that *"does not scroll"* and named the sample that would settle it;
   * the sample was taken and the panel does scroll -- a wheel over its map
   * block moves `scrollTop` 1 -> 270 of 271 and brings the QUEUED header from
   * y=1042 to y=773, inside a fold at y=818. So it is not a clip, it is this
   * same defect: reachable content with nothing saying it is there.
   *
   * `background-attachment` is the mechanism and is what is read here, rather
   * than the paint, because this test's subject is coverage across boxes and
   * states -- the paint itself is proven on the two catalogues above.
   * `.hud-strip__metrics` is excluded by name: its scrollbar is suppressed on
   * purpose (#634) and its axis is horizontal.
   */
  test('every vertical scroll region in the HUD carries the sign', async ({ page }) => {
    test.slow();
    await openApp(page);
    await newPrison(page);

    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [900, 600],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const tabName of ['Overview', 'Build', 'Rooms', 'Security', 'Regime'] as const) {
        await page.getByRole('button', { name: tabName, exact: true }).click();
        const scrollers = await page.evaluate(() => {
          const root = document.querySelector<HTMLElement>('.hud');
          if (root === null) return [];
          const describe = (element: HTMLElement): string => {
            const classes = (element.getAttribute('class') ?? '')
              .split(/\s+/)
              .filter((name) => name.startsWith('hud') || name.startsWith('ui-'))
              .slice(0, 3)
              .join('.');
            return `${element.tagName.toLowerCase()}${classes === '' ? '' : `.${classes}`}`;
          };
          const found: { what: string; hiddenPx: number; attachment: string }[] = [];
          for (const node of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
            if (node.hidden) continue;
            if (node.getClientRects().length === 0) continue;
            if (node.classList.contains('hud-strip__metrics')) continue;
            // The one known box in this rail that this change does not reach,
            // named rather than silently skipped. It lives in
            // `src/styles.css`; see the file docblock.
            if (node.closest('.save-panel') !== null) continue;
            const style = getComputedStyle(node);
            if (!/auto|scroll/.test(style.overflowY)) continue;
            const hidden = node.scrollHeight - node.clientHeight;
            if (hidden <= 1) continue;
            found.push({
              what: describe(node),
              hiddenPx: Math.round(hidden * 10) / 10,
              attachment: style.backgroundAttachment,
            });
          }
          return found;
        });

        // eslint-disable-next-line no-console
        console.log(
          `[#902] ${width}x${height} ${tabName}: ${
            scrollers.length === 0
              ? 'nothing hides its own content'
              : scrollers.map((s) => `${s.what} hides ${s.hiddenPx}px, attachment [${s.attachment}]`).join(' | ')
          }`,
        );

        expect(
          scrollers.filter((entry) => !entry.attachment.includes('local')),
          `boxes on the ${tabName} tab at ${width}x${height} that hide their own content with no sign that they do`,
        ).toEqual([]);
      }
    }
  });
});
