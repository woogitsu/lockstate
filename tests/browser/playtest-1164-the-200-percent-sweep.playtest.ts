import { expect, test } from '@playwright/test';

import { UI_SCALES, WINDOWS, fails, faults, sweep } from './page-zoom-sweep';

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
 * ## Why it is a playtest and not a gate -- and what now is one beside it
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
 * **That left the number itself ungated, and #1312 records what it cost**:
 * *"A number that moves only when a person runs it by hand cannot announce
 * that it has gone stale. Between `2559eb14` and `ab3bf7ba` nobody ran it."*
 * So the measurement moved out into `page-zoom-sweep.ts`, which this file and
 * `ui-200-percent-zoom-sweep-ratchet.spec.ts` now share. The spec is collected
 * by the `browser` gate and asserts the one thing that is not a pin: the
 * failing set may shrink and may not grow. This file keeps the job it was
 * written for -- printing every fault at every combination, as a research
 * document -- and no longer keeps the only copy of how they are measured.
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
 * These now live in `page-zoom-sweep.ts`, unchanged in substance; they are
 * repeated here because this file's report is only readable beside them.
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


test('the 200 % page zoom sweep: 36 combinations, reported rather than asserted (#1164)', async ({ page }) => {
  test.slow();

  const reports = await sweep(page, (row, css) => {
    const verdict = fails(row) ? 'FAIL' : 'pass';
    console.log(
      `[1164] ${row.window} (CSS ${css.width}x${css.height}) at ${Math.round(row.scale * 100)}% ` +
        `(--ui-scale=${row.appliedScale}): ${verdict}` +
        (fails(row)
          ? ` -- outside: ${row.outside.length}, unreachable: ${row.covered.length}, overflow: ${row.overflow.length}` +
            `\n        ${faults(row).join('\n        ')}`
          : ''),
    );
  });

  const failing = reports.filter(fails);
  console.log(`[1164] SWEEP: ${failing.length} of ${reports.length} combinations fail.`);
  console.log(`[1164] failing set: ${failing.map((row) => row.label).join(', ')}`);

  // The one assertion, and it is about the harness rather than the interface:
  // every combination was visited and something was measured at each.
  expect(reports).toHaveLength(WINDOWS.length * UI_SCALES.length);
});
