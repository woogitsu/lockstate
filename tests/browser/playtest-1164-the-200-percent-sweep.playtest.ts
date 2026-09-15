import { expect, test, type Page } from '@playwright/test';

/**
 * The 200 %-page-zoom sweep, re-measured for stage 8 acceptance (#1164),
 * and committed this time.
 *
 * ## Why this file exists rather than a paragraph quoting a number
 *
 * `docs/VISUAL_IDENTITY.md` and `docs/IDENTITY_V5_ROLLOUT.md` both carry the
 * figure **23 of 36** for the interface's behaviour under a 200 % browser page
 * zoom, and both trace it to commit `d7aab8d8` (stage 3, #1159). That commit's
 * own message says what the figure rests on:
 *
 * > The harness was a throwaway spec and is not committed: it loads 36 pages
 * > and asserts nothing, so it is a measurement rather than a gate.
 *
 * So the repository's most-cited accessibility debt has been a number with no
 * re-runnable source behind it for a day. Stage 8's job is to check the
 * delivery's thirteen areas against what this codebase actually does, and its
 * "Tekst" row -- *"Powiększenie 200%, długie tłumaczenia"* against *"Brak
 * utraty treści i działań"* -- cannot be worked by quoting a figure somebody
 * else measured with a file they deleted.
 *
 * ## Why it is a playtest and not a gate
 *
 * It asserts nothing about the failing set. `tests/browser/browser-suites.ts`
 * explains why `playwright.playtest.config.ts` is excluded from the two CI
 * gates -- *"its output is a research document rather than a pass or a
 * fail"* -- and that is exactly what this is. Turning the current failing set
 * into an assertion would pin a defect in place: the next person to fix the
 * strip would have to edit this file to go green, which is the shape of a test
 * that discourages the repair it is supposed to describe.
 *
 * It does carry **one** assertion, and only one: that the sweep visited all 36
 * combinations and measured something at each. That is a check on the harness,
 * not on the interface.
 *
 * ## What a "200 % page zoom" is here, and why the window is halved
 *
 * Playwright's Chromium cannot be driven to a browser page zoom through the
 * public API. A 200 % page zoom's effect on layout is that every CSS pixel
 * becomes two device pixels, so the CSS viewport the page is laid out in is
 * **half** the window in each axis. Halving `setViewportSize` reproduces that
 * layout exactly, which is what `d7aab8d8`'s harness did and what this does.
 * It does not reproduce the *rasterisation*, which no layout invariant below
 * asks about.
 *
 * ## The four things measured, taken verbatim from `d7aab8d8`
 *
 * > any of `.hud-strip`, `.brand`, `.display-scale`, `.hud-tabs__inner`,
 * > `.save-panel`, `.hud-build` laid outside the viewport; any `.ui-tab` or
 * > `.display-scale__cycle` whose centre pixel belongs to something else; the
 * > rail's own overflow; and the strip's.
 *
 * A combination fails if any one of the four reports anything.
 *
 * ## The two axes
 *
 * Six window sizes and six interface scales, the same 36 pairs `d7aab8d8`
 * swept. The scales are the whole of `UI_SCALE_STEPS`
 * (`src/input/accessibility.ts:52`) rather than a sample; the sizes are the
 * five of `HUD_LAYOUT_VIEWPORTS` (`tests/browser/app-shell.spec.ts:3085`) plus
 * 390x844, which is the phone the delivery's own test plan names first.
 */

const APP_URL = '/index.html';

const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'lockstate.settings.accessibility';

/** `UI_SCALE_STEPS`, `src/input/accessibility.ts:52`. */
const UI_SCALES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const WINDOWS = [
  [1280, 720],
  [1440, 900],
  [1024, 768],
  [900, 600],
  [390, 844],
  [375, 812],
] as const;

/** Must be laid out inside the viewport, if it is laid out at all. */
const CONTAINED = ['.hud-strip', '.brand', '.display-scale', '.hud-tabs__inner', '.save-panel', '.hud-build'] as const;

/** Must own its own centre pixel, if it is laid out at all. */
const REACHABLE = ['.ui-tab', '.display-scale__cycle'] as const;

/** The two boxes whose own scroll overflow is reported separately. */
const OVERFLOWING = ['.hud__aside', '.hud-strip'] as const;

interface CombinationReport {
  readonly window: string;
  readonly scale: number;
  readonly outside: readonly string[];
  readonly covered: readonly string[];
  readonly overflow: readonly string[];
}

function fails(report: CombinationReport): boolean {
  return report.outside.length > 0 || report.covered.length > 0 || report.overflow.length > 0;
}

async function measure(page: Page): Promise<Omit<CombinationReport, 'window' | 'scale'>> {
  return page.evaluate(
    ({ contained, reachable, overflowing }) => {
      const outside: string[] = [];
      const covered: string[] = [];
      const overflow: string[] = [];

      const width = window.innerWidth;
      const height = window.innerHeight;
      const round = (value: number): number => Math.round(value * 10) / 10;

      for (const selector of contained) {
        for (const node of document.querySelectorAll(selector)) {
          const box = node.getBoundingClientRect();
          // A box with no area is not laid out; `display: none` below 720px is
          // deliberate and is not what this is looking for.
          if (box.width === 0 && box.height === 0) continue;
          const over: string[] = [];
          if (box.left < -0.5) over.push(`left=${round(box.left)}`);
          if (box.top < -0.5) over.push(`top=${round(box.top)}`);
          if (box.right > width + 0.5) over.push(`right=${round(box.right)}>${width}`);
          if (box.bottom > height + 0.5) over.push(`bottom=${round(box.bottom)}>${height}`);
          if (over.length > 0) outside.push(`${selector} ${over.join(' ')}`);
        }
      }

      for (const selector of reachable) {
        for (const node of document.querySelectorAll(selector)) {
          const box = node.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          const x = box.left + box.width / 2;
          const y = box.top + box.height / 2;
          if (x < 0 || y < 0 || x > width || y > height) {
            covered.push(`${selector} centre (${round(x)},${round(y)}) is off the viewport`);
            continue;
          }
          const hit = document.elementFromPoint(x, y);
          if (hit === null) {
            covered.push(`${selector} centre hits nothing`);
            continue;
          }
          if (hit !== node && !node.contains(hit)) {
            const label = `${hit.tagName.toLowerCase()}${hit.className === '' ? '' : `.${String(hit.className).split(/\s+/)[0]}`}`;
            covered.push(`${selector} centre belongs to ${label}`);
          }
        }
      }

      for (const selector of overflowing) {
        for (const node of document.querySelectorAll(selector)) {
          const element = node as HTMLElement;
          const box = element.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          const spill = element.scrollHeight - element.clientHeight;
          if (spill > 1) overflow.push(`${selector} spills ${round(spill)}px of its own box`);
        }
      }

      return { outside, covered, overflow };
    },
    { contained: [...CONTAINED], reachable: [...REACHABLE], overflowing: [...OVERFLOWING] },
  );
}

test('the 200 % page zoom sweep: 36 combinations, reported rather than asserted (#1164)', async ({ page }) => {
  test.slow();

  const reports: CombinationReport[] = [];

  for (const [windowWidth, windowHeight] of WINDOWS) {
    // A 200 % page zoom halves the CSS viewport in each axis.
    const width = Math.round(windowWidth / 2);
    const height = Math.round(windowHeight / 2);

    for (const scale of UI_SCALES) {
      await page.setViewportSize({ width, height });

      // The page has to exist before its origin has a `localStorage` to write
      // to, so the scale is written on the page already loaded and picked up
      // by the reload below. `addInitScript` is deliberately not used: it
      // accumulates across a loop of 36, and a harness that quietly runs 36
      // copies of itself is not one whose numbers should be believed.
      await page.goto(APP_URL);
      await page.evaluate(
        ({ key, uiScale }) => {
          try {
            window.localStorage.setItem(key, JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
          } catch {
            // A browser that will not store anything still boots; the scale
            // simply stays at 1, and the `--ui-scale` logged below says so.
          }
        },
        { key: ACCESSIBILITY_SETTINGS_STORAGE_KEY, uiScale: scale },
      );
      await page.reload();
      await page.waitForSelector('.hud');
      await page.waitForSelector('.save-panel');

      const applied = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      );

      const measured = await measure(page);
      reports.push({ window: `${windowWidth}x${windowHeight}`, scale, ...measured });

      const row = reports[reports.length - 1] as CombinationReport;
      const verdict = fails(row) ? 'FAIL' : 'pass';
      console.log(
        `[1164] ${row.window} (CSS ${width}x${height}) at ${Math.round(scale * 100)}% ` +
          `(--ui-scale=${applied}): ${verdict}` +
          (fails(row)
            ? ` -- outside: ${row.outside.length}, unreachable: ${row.covered.length}, overflow: ${row.overflow.length}` +
              `\n        ${[...row.outside, ...row.covered, ...row.overflow].join('\n        ')}`
            : ''),
      );
    }
  }

  const failing = reports.filter(fails);
  console.log(`[1164] SWEEP: ${failing.length} of ${reports.length} combinations fail.`);
  console.log(`[1164] failing set: ${failing.map((row) => `${row.window}@${Math.round(row.scale * 100)}%`).join(', ')}`);

  // The one assertion, and it is about the harness rather than the interface:
  // every combination was visited and something was measured at each.
  expect(reports).toHaveLength(WINDOWS.length * UI_SCALES.length);
});
