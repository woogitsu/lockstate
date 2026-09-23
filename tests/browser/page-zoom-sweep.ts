import type { Page } from '@playwright/test';

/**
 * The 200 %-page-zoom sweep, as one instrument two callers share.
 *
 * ## Why this is a module and not a copy
 *
 * `playtest-1164-the-200-percent-sweep.playtest.ts` measures 36 viewport x
 * interface-scale combinations and **asserts nothing about the failing set**,
 * on the ground its own docblock gives: turning the failing set into an
 * assertion would pin a defect in place. No CI job collects it, deliberately
 * (`browser-suites.ts` gives that reason), and
 * [#1312](https://github.com/woogitsu/lockstate/issues/1312) records the
 * consequence in one sentence: *"A number that moves only when a person runs
 * it by hand cannot announce that it has gone stale. Between `2559eb14` and
 * `ab3bf7ba` nobody ran it."*
 *
 * `ui-200-percent-zoom-sweep-ratchet.spec.ts` is collected by the `browser`
 * gate and asserts the one thing that is not a pin: the failing set may shrink
 * and may not grow. Both need the same 36 combinations measured the same way,
 * and a second copy of the measurement is a second thing to keep in step with
 * the first -- so the measurement lives here and neither caller owns it.
 *
 * ## What a "200 % page zoom" is here, and why the window is halved
 *
 * Playwright's Chromium cannot be driven to a browser page zoom through the
 * public API. A 200 % page zoom's effect on layout is that every CSS pixel
 * becomes two device pixels, so the CSS viewport the page is laid out in is
 * **half** the window in each axis. Halving `setViewportSize` reproduces that
 * layout exactly, which is what `d7aab8d8`'s original harness did. It does not
 * reproduce the *rasterisation*, which no invariant here asks about.
 */

const APP_URL = '/index.html';

const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'lockstate.settings.accessibility';

/** `UI_SCALE_STEPS`, in `src/input/accessibility.ts`. */
export const UI_SCALES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * The five of `HUD_LAYOUT_VIEWPORTS` that `app-shell.spec.ts` sweeps, plus
 * 390x844, which is the phone the 2026-09-13 delivery's own test plan names
 * first.
 */
export const WINDOWS = [
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

export interface CombinationReport {
  readonly window: string;
  readonly scale: number;
  /** `1280x720@200%`, the name both callers print and the ratchet lists. */
  readonly label: string;
  /** The `--ui-scale` the page reported, so a scale that did not arrive shows. */
  readonly appliedScale: string;
  readonly outside: readonly string[];
  readonly covered: readonly string[];
  readonly overflow: readonly string[];
}

/** A combination fails if any one of the three measurements reports anything. */
export function fails(report: CombinationReport): boolean {
  return report.outside.length > 0 || report.covered.length > 0 || report.overflow.length > 0;
}

/** Every line a failing combination reported, in the order they were measured. */
export function faults(report: CombinationReport): readonly string[] {
  return [...report.outside, ...report.covered, ...report.overflow];
}

async function measure(page: Page): Promise<Pick<CombinationReport, 'outside' | 'covered' | 'overflow'>> {
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

/**
 * Measure all 36 combinations on one page, in the order they are declared.
 *
 * `onCombination` is called as each one lands, so the playtest can print its
 * research log while the spec prints nothing. The whole sweep is one page
 * driven through 36 reloads rather than 36 pages, and one `goto` before the
 * first of them -- one boot per combination.
 */
export async function sweep(
  page: Page,
  onCombination?: (report: CombinationReport, css: { readonly width: number; readonly height: number }) => void,
): Promise<readonly CombinationReport[]> {
  const reports: CombinationReport[] = [];

  // The page has to exist before its origin has a `localStorage` to write to,
  // so it is opened once, here. Every combination after that writes its scale
  // on the page the previous one left loaded and boots once, on the reload.
  //
  // **This used to be a `goto` inside the loop, before every write**, which
  // booted the whole application twice per combination -- 72 boots for 36
  // measurements -- where only the first iteration is on `about:blank`. The
  // measurement never saw the extra boot: the `goto`'s page was only ever the
  // page the scale was written on, and the reload below is what is measured,
  // exactly as before. What it cost is recorded because it is what turned the
  // ratchet red: run 35849375154 attempt 2's trace (runner `woogitsu-wsl-04`)
  // prices `goto` at a 1.88 s mean and `reload` at 1.65 s, ~5.3 s a
  // combination all in, and the test reached combination 34 of 36 when
  // `test.slow()`'s 180 s ran out.
  await page.goto(APP_URL);

  for (const [windowWidth, windowHeight] of WINDOWS) {
    // A 200 % page zoom halves the CSS viewport in each axis.
    const width = Math.round(windowWidth / 2);
    const height = Math.round(windowHeight / 2);

    for (const scale of UI_SCALES) {
      await page.setViewportSize({ width, height });

      // The scale is written on the page already loaded and picked up by the
      // reload below. `addInitScript` is deliberately not used: it
      // accumulates across a loop of 36, and a harness that quietly runs 36
      // copies of itself is not one whose numbers should be believed.
      await page.evaluate(
        ({ key, uiScale }) => {
          try {
            window.localStorage.setItem(key, JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
          } catch {
            // A browser that will not store anything still boots; the scale
            // simply stays at 1, and `appliedScale` below says so.
          }
        },
        { key: ACCESSIBILITY_SETTINGS_STORAGE_KEY, uiScale: scale },
      );
      await page.reload();
      await page.waitForSelector('.hud');
      await page.waitForSelector('.save-panel');

      const appliedScale = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      );

      const measured = await measure(page);
      const report: CombinationReport = {
        window: `${windowWidth}x${windowHeight}`,
        scale,
        label: `${windowWidth}x${windowHeight}@${Math.round(scale * 100)}%`,
        appliedScale,
        ...measured,
      };
      reports.push(report);
      onCombination?.(report, { width, height });
    }
  }

  return reports;
}
