import { expectNotClipped } from './clipping';
import { type Page, expect, test } from './network-changed-fixture';
import type { BuildProbe } from './ui-harness-api';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * **A gate whose unit is a box cannot see an overflow that paints outside that
 * box** (issue #926).
 *
 * ## What was already gated, and what it could not answer
 *
 * `ui-shell.spec.ts`'s *"fits three buttons in the actions row at every
 * viewport, including 375px"* asserts `BuildProbe.actionsOverflowPx <= 0` at
 * all five viewports and in both modes, and it is a better test than the
 * obvious one -- its probe's own comment refuses the row's `scrollWidth` and
 * explains why that reading would lie. It measures the right thing about the
 * row and it passes.
 *
 * It cannot see #926, and not by oversight: `hud.css` gives
 * `.hud-build__actions > .hud-build__arm` `min-width: 0` deliberately, because
 * ADR 0022 measured a third button overflowing this row by 37.9px and a flex
 * item's default `min-width: auto` is why. That declaration **guarantees the
 * button box fits**. The overflowing content was outside the box being
 * measured: `.ui-action__label` was `white-space: nowrap`, `.ui-action`
 * declared no `overflow`, and the label rendered at its full intrinsic width
 * from a narrower box.
 *
 * Measured on `main` at `9ef67944` before the fix, with the existing
 * assertion's own figure in the last column:
 *
 *   | viewport | state    | arm button | label | past button | over `Remove` | `actionsOverflowPx` |
 *   | -------- | -------- | ---------- | ----- | ----------- | ------------- | ------------------- |
 *   | 1280x720 | arrival  |       76.4 |  87.9 |    **17.8** |       **9.8** |             **-12** |
 *   | 1280x720 | armed    |       76.4 |  80.8 |    **14.2** |       **6.2** |             **-12** |
 *   | 1280x720 | removing |      100.8 |  87.9 |     **5.5** |          -2.5 |             **-12** |
 *   | 1440x900 | all three, identical to 1280x720                                                  |
 *   | 1024x768 | all three, identical to 1280x720                                                  |
 *   | 900x600  | all three, identical to 1280x720                                                  |
 *   | 375x812  | arrival  |      171.4 |  87.9 |       -29.7 |         -37.7 |               -12   |
 *
 * The rail is 264px at the four widest viewports, which is why they read
 * identically; 375x812 gives the panel the screen and the label fits there.
 *
 * ## Why this is a file of its own rather than three lines in that test
 *
 * Because the subject is different. That test is about the *row* -- whether a
 * third button gets a box and whether the row fits the panel -- and it should
 * keep answering exactly that, unweakened. This one is about a *label against
 * its own control*, it covers the Rooms panel's row too (the sweep that found
 * the Build panel's 17.8px found 6.3px on `.hud-rooms__arm` in the same pass,
 * and `hud.css` says `min-width: 0` was copied from there), and it asserts the
 * height that the fix was chosen to preserve.
 */

/**
 * The five viewports every layout gate in `ui-shell.spec.ts` visits.
 *
 * Copied rather than imported: that file declares them inside a `describe`, and
 * a gate about the same rows that looped over a different set would be
 * answering about a different screen.
 */
const VIEWPORTS = [
  [1280, 720],
  [1440, 900],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/**
 * The tap target, which is what makes the wrap free.
 *
 * Both rows are `align-items: stretch`, so the row is as tall as its tallest
 * member and everything below it moves when that grows. Two 15px lines are
 * 30px inside a 44px button; three are 45px and grow the row to 47. Asserted
 * as an equality rather than a bound so a *shrink* fails here too -- a row
 * under 44px is a tap target this repository has already paid for twice
 * (ADR 0022, boundary 10).
 */
const TAP_TARGET_PX = 44;

async function buildProbe(page: Page): Promise<BuildProbe> {
  return page.evaluate(() => window.lockstateUiHarness.buildProbe());
}

/**
 * Every laid-out `.ui-action` in the HUD, its label measured against its own
 * button -- **not** scoped to the Build panel.
 *
 * The class is what is under test. `.ui-action__label`'s wrap is a primitive,
 * a sweep in this shape is what found the second instance, and a check scoped
 * to one panel would let the third be found by a player.
 */
async function labelsOutsideTheirButtons(
  page: Page,
): Promise<readonly { readonly control: string; readonly label: string; readonly overflowPx: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.ui-action')]
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => {
        const label = button.querySelector<HTMLElement>('.ui-action__label');
        if (label === null) return null;
        const buttonBox = button.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        return {
          control: [...button.classList].filter((name) => name !== 'ui-action').join('.'),
          label: label.textContent?.trim() ?? '',
          // Both edges. `.ui-action` is `justify-content: center`, so content
          // wider than the box spills at *both* ends -- a check on the right
          // edge alone would have reported half of this defect and called the
          // panel's own left gutter clean.
          overflowPx:
            Math.round(Math.max(labelBox.right - buttonBox.right, buttonBox.left - labelBox.left) * 10) / 10,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.overflowPx > 0.5),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => 'lockstateUiHarness' in window);
});

test('the arm label stays inside its own button at every viewport (#926)', async ({ page }) => {
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

    /*
     * Three states, because the widest label is not in the state the panel
     * arrives in. `Place on map` is 87.9 and `Stop placing` 80.8 in a row of
     * three; the removal mode takes the buy toggle out and gives the width
     * back, and `Stop removing` (95.2) takes some of it again.
     */
    const states: readonly (readonly [string, () => Promise<void>])[] = [
      ['arrival', async (): Promise<void> => {}],
      [
        'armed',
        async (): Promise<void> => {
          await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
        },
      ],
      [
        'removing',
        async (): Promise<void> => {
          // Off the armed state the line above left, then into removal.
          await page.evaluate(() => window.lockstateUiHarness.clickArmBuild());
          await page.evaluate(() => window.lockstateUiHarness.clickRemoveObject());
        },
      ],
    ];

    for (const [state, drive] of states) {
      await drive();
      const probe = await buildProbe(page);
      const where = `${width}x${height} (${state})`;

      // The page rendered before anything here is trusted: a probe taken
      // against a panel with no box would report 0px of overflow and mean
      // nothing. `ui-shell.spec.ts` pairs its own row assertions the same way.
      expect(probe.visible, `the Build panel is not laid out at ${where}`).toBe(true);
      expect(
        probe.actionLabelFits.length,
        `no control in the actions row is laid out at ${where}, so nothing below is measured`,
      ).toBeGreaterThan(0);

      for (const fit of probe.actionLabelFits) {
        expect(
          fit.labelOverflowPx,
          `${fit.control}'s label "${fit.label}" paints ${String(fit.labelOverflowPx)}px outside its own button at ${where}`,
        ).toBeLessThanOrEqual(0);
        expect(
          fit.neighbourOverlapPx,
          `${fit.control}'s label "${fit.label}" paints ${String(fit.neighbourOverlapPx)}px over ${String(fit.neighbour)} at ${where}`,
        ).toBeLessThanOrEqual(0);
        // The wrap is only free while the label fits the tap target it already
        // had. A third line grows the button, `align-items: stretch` grows the
        // row, and every control below it moves -- in the panel that has 7.8px
        // of spare height at 900x600 (#174, #143).
        expect(
          fit.buttonHeightPx,
          `${fit.control} is ${String(fit.buttonHeightPx)}px tall at ${where}, so its label no longer fits the tap target`,
        ).toBe(TAP_TARGET_PX);
      }

      expect(
        probe.actionsHeightPx,
        `the actions row is ${String(probe.actionsHeightPx)}px tall at ${where}: a wrapped label has grown it and every control below it has moved`,
      ).toBe(TAP_TARGET_PX);

      /*
       * And the row itself still fits, read off the assertion that could not
       * see this defect. Kept here rather than left to `ui-shell.spec.ts`
       * because the contrast is the finding: before the fix this figure was
       * **-12 in all fifteen cells above** while the label was 17.8px outside
       * its button. A fix that bought the label's containment by letting the
       * row overflow instead would pass every assertion above and fail this
       * one.
       */
      expect(probe.actionsOverflowPx, `the actions row overflows the panel at ${where}`).toBeLessThanOrEqual(0);

      /*
       * The instrument #720 built for exactly this question, pointed at this
       * row for the first time. It reads `scrollWidth` against `clientWidth`
       * and the element's computed `overflow`, so it reports `spilled` for
       * content painted outside a `visible` box and `cut` for content a
       * `hidden` one never painted -- which means it fails for a clip fix as
       * well as for the original spill. It was never applied here; that, and
       * not its absence, is why this defect survived a suite that owns the
       * check.
       */
      await expectNotClipped(page, '.hud-build__actions .ui-action', `the Build actions row at ${where}`);
    }
  }
});

test('no label in the HUD paints outside its own control (#926)', async ({ page }) => {
  /*
   * The class sweep. `.ui-action__label` is a primitive and the fix is in the
   * primitive, so the assertion is over every button the HUD lays out rather
   * than over the two rows that were measured overflowing.
   *
   * On `main` at `9ef67944` this found exactly two, in this shape:
   * `.hud-build__arm` at 17.8px and `.hud-rooms__arm` at 6.3px, both at every
   * viewport 900px wide or wider and neither at 375x812.
   */
  let seen = 0;
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    for (const tab of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
      expect(
        await page.evaluate((name) => window.lockstateUiHarness.clickTab(name), tab),
        `the ${tab} tab has no control to press at ${width}x${height}`,
      ).toBe(true);

      /*
       * A sweep that matched nothing would pass, so what it saw is counted --
       * the reason `expectNotClipped` fails an empty match. Counted across
       * the whole walk rather than asserted per tab, because **the Regime tab
       * lays out no labelled `.ui-action` at all** in the state
       * `mountHudShell()` produces: measured, `0` at every viewport, while
       * every other tab has some. A per-tab floor would have made that
       * measurement look like a broken harness, which is the shape
       * `docs/AGENT_WORKFLOW.md` §2 warns about.
       */
      seen += await page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('.ui-action')].filter(
            (button) => button.getClientRects().length > 0 && button.querySelector('.ui-action__label') !== null,
          ).length,
      );

      expect(
        await labelsOutsideTheirButtons(page),
        `a label paints outside its own control on the ${tab} tab at ${width}x${height}`,
      ).toEqual([]);
    }
  }

  expect(seen, 'the sweep laid eyes on no labelled action button at all, so it proves nothing').toBeGreaterThan(0);
});

test('an unbreakable label is contained rather than painted over its neighbour (#926)', async ({ page }) => {
  /*
   * The guard, exercised rather than asserted.
   *
   * `min-width: 0` and `overflow-wrap: break-word` are one guard in two
   * declarations and neither works alone, which is the kind of claim that is
   * cheap to state and cheap to get wrong -- **it was got wrong once here**:
   * `overflow-wrap: break-word` on its own left this token 200.4px wide in a
   * 90.4px box, spilling 58px, because a flex item's default `min-width: auto`
   * is its min-content width and for a single token that is the whole token.
   * Measured, then fixed, then measured again.
   *
   * The text is written straight into the DOM rather than through the locale,
   * because what is under test is the stylesheet's behaviour on input the
   * catalogue does not contain today and a translation may.
   */
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => window.lockstateUiHarness.clickTab('build'));

  const applied = await page.evaluate(() => {
    const label = document.querySelector<HTMLElement>('.hud-build__arm .ui-action__label');
    if (label === null) return false;
    label.textContent = 'Unbreakablesupercalifragilistic';
    return true;
  });
  expect(applied, 'the arm button has no label element to lengthen').toBe(true);

  const probe = await buildProbe(page);
  const arm = probe.actionLabelFits.find((fit) => fit.control === 'hud-build__arm');
  expect(arm, 'the arm button is not laid out in the actions row').toBeDefined();
  if (arm === undefined) return;

  expect(arm.label, 'the long label did not reach the button').toBe('Unbreakablesupercalifragilistic');
  expect(
    arm.labelOverflowPx,
    `a token with no break opportunity paints ${String(arm.labelOverflowPx)}px outside its button`,
  ).toBeLessThanOrEqual(0);
  expect(
    arm.neighbourOverlapPx,
    `a token with no break opportunity paints ${String(arm.neighbourOverlapPx)}px over ${String(arm.neighbour)}`,
  ).toBeLessThanOrEqual(0);

  /*
   * And it is contained by *growing*, not by clipping: the row goes to 62px
   * here, four lines of it. That cost is why this is the guard and the wrap is
   * the fix -- a label this long is a defect in the catalogue, and a row that
   * grew rather than a name that vanished is the state a player can report.
   */
  expect(
    arm.buttonHeightPx,
    'the guard clipped the token instead of reflowing it, so the name is unreadable',
  ).toBeGreaterThan(TAP_TARGET_PX);
  expect(arm.labelWiderThanBox, 'the token is being clipped rather than wrapped').toBe(false);
});
