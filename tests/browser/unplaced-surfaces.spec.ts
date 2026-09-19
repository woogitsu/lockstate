import { type Page, expect, test } from './network-changed-fixture';

/**
 * **The eleven surfaces the direction does not place are still there, and
 * still work** (issue [#1161](https://github.com/matmaxalez/lockstate/issues/1161),
 * stage 5 of the 2026-09-13 identity rollout).
 *
 * ## Why a file exists for surfaces no stage is about
 *
 * ADR 0112 and `docs/IDENTITY_V5_ROLLOUT.md` stage 0 say the same thing twice:
 * *"a surface the direction does not place is still not an agent's to
 * delete"*, and *"an unplaced surface is a question for the owner, not a
 * deletion"*.
 * `docs/research/2026-09-13-every-hud-surface-and-where-the-five-sections-put-it.md`
 * §1 is the list, and
 * `docs/research/2026-09-14-the-mechanical-navigation-move.md` §3 restates it
 * flat. Nothing in stages 1-5 owns any of them, which is exactly the problem: a
 * surface no stage is responsible for is a surface no stage's gate covers, and
 * six changes landed over the two days before this file was written.
 *
 * So this is a **presence and reachability** gate and deliberately nothing
 * more. It asserts no wording, no geometry and no behaviour any other spec
 * already owns -- `ui-shell.spec.ts` has the strip and the alerts list,
 * `hud-layout-shell.spec.ts` has the layout regions, `ui-save-delete-confirmation.spec.ts`
 * has the save panel's own flows. What none of them asks is the question this
 * stage was given: *is each of these eleven still on the page, and can a player
 * still reach it, at every device width?*
 *
 * ## "Present with no box" is a pass for four of them, and why
 *
 * Four are conditional by design and a box on arrival would be the defect:
 *
 * - the **unavailable band** appears only when the worker could not start (#220);
 * - the **refusal line** only after a refused command (#207);
 * - the **events band** only when an event arrives, with a 600ms dwell floor;
 * - the **language picker** and the rest of the Layout menu only when the menu
 *   is open -- `layout-shell.ts:543`'s `preferencesSlot` lives inside
 *   `.hud-layout__body`, which is the menu.
 *
 * For those, `present` is the assertion and a box is checked in the state that
 * produces one. Everything else is asserted laid out **and** owning the pixel
 * at its own centre, because a preference control under another layer is a
 * preference control a player does not have.
 *
 * ## One surface set is measured rather than required, and it is the finding
 *
 * `.hud__corner` -- the minimap frame, the zoom control and the alerts list
 * nested inside the minimap panel -- is `display: none` at 720 CSS px and
 * below. That is deliberate and documented three times in `hud.css` (the
 * correction under #1117), and `app-shell.spec.ts`'s `NEVER_LAID_OUT_BELOW_720`
 * exempts the controls that fall with it.
 *
 * **It is also how `DismissAlert` -- one of the seventeen commands -- becomes
 * unreachable on a phone**, which no document in the rollout says out loud.
 * This file records the state at all three tiers rather than asserting the
 * phone one is right, so that the day someone changes it the change is visible
 * in a diff. The question of whether a player on a phone should be able to
 * dismiss an alert is the owner's, and
 * `docs/research/2026-09-14-what-stage-5-checked-and-what-it-found.md` §4 is
 * where it is asked.
 *
 * ## What was watched going red
 *
 * Three mutations, each restored from a copy taken before it:
 *
 * Baseline on `e221e927`: **7 passed (57.1s)**. Each mutation was restored
 * from a copy taken before it, and `git status` checked clean before the next.
 *
 * | mutation | result |
 * | --- | --- |
 * | `hud.brandSlot.append(createBrandBadge(...).element)` commented out (`main.ts:3495`) | **3 failed, 4 passed** -- one per tier |
 * | `hud.preferencesSlot.append(languageControl.element)` commented out (`main.ts:3732`) | **6 failed, 1 passed** -- the three presence cases *and* the three Layout-menu cases, which is the right shape: the picker is both a surface that must exist and a route that must open |
 * | `.hud__corner { display: none; }` commented out of the `max-width: 720px` block (`hud.css:4704`) | **1 failed, 6 passed** -- the phone case, which is the point: the recording is a recording, and it moves when the thing it records moves |
 */

const TIERS = [
  ['desktop', 1440, 900],
  ['tablet', 1024, 768],
  ['phone', 375, 812],
] as const;

/** How a surface answers: absent, present without a box, or a box it owns the centre of. */
interface SurfaceReading {
  readonly present: boolean;
  readonly laidOut: boolean;
  /** `elementFromPoint` at the surface's centre answers it or something inside it. */
  readonly ownsItsCentre: boolean;
  /** What answered instead, so a failure names the layer that is over it. */
  readonly coveredBy: string;
}

async function read(page: Page, selector: string): Promise<SurfaceReading> {
  return page.evaluate((css: string) => {
    const node = document.querySelector<HTMLElement>(css);
    if (node === null) return { present: false, laidOut: false, ownsItsCentre: false, coveredBy: 'absent' };
    if (node.getClientRects().length === 0) {
      return { present: true, laidOut: false, ownsItsCentre: false, coveredBy: 'no box' };
    }
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      present: true,
      laidOut: true,
      ownsItsCentre: hit !== null && (node === hit || node.contains(hit)),
      coveredBy: hit === null ? 'nothing' : ((hit as HTMLElement).closest('[class]')?.className ?? hit.nodeName),
    };
  }, selector);
}

async function open(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.locator('.hud').waitFor();
  // The layout is re-resolved once after the interface scale is installed;
  // waiting for the attribute the shell stamps waits for that second pass
  // rather than for a duration (`hud-layout-shell.spec.ts` does the same).
  await expect(page.locator('.hud[data-layout-navigation-placement]')).toHaveCount(1);
}

/**
 * The surfaces that must be on screen the moment the page settles.
 *
 * `ownsItsCentre` is **not** asked of these, and the reason is a property of
 * this HUD rather than a relaxation: `.hud` is `pointer-events: none` so that
 * anything which is not a control passes a click through to the canvas
 * (`hud.ts:58-70`), and `hud.css` re-enables it on controls only. A readout
 * therefore correctly does not answer `elementFromPoint` at its own centre --
 * its container does. Asking the question of a readout would pin the opposite
 * of what article 17 wants.
 */
const ALWAYS_LAID_OUT: readonly (readonly [string, string])[] = [
  ['status strip', '.hud-strip'],
  ['brand badge', '.brand'],
  ['save panel', '.save-panel'],
  ['display-scale control', '.display-scale'],
  ['theme control', '.theme-control'],
  ['tab bar', '.hud__tabs'],
];

/**
 * The **controls** among them, which do have to own their own centre: these are
 * the presses, and a press under another layer is the failure #88 is about.
 */
const ALWAYS_PRESSABLE: readonly (readonly [string, string])[] = [
  ['the layout menu button', '.hud-layout__button'],
  ["the display scale's cycle control", '.display-scale__cycle'],
  ["the theme control's cycle control", '.theme-control__cycle'],
  ['the save panel\'s first control', '.save-panel button'],
  ['the Manage tab', '.ui-tab[data-tab="manage"]'],
];

/** The surfaces that are in the DOM from first paint and correctly have no box yet. */
const CONDITIONAL: readonly (readonly [string, string, string])[] = [
  ['simulation-unavailable band', '.hud__unavailable', 'only when the worker could not start (#220)'],
  ['refusal line', '.hud__refusal', 'only after a refused command (#207)'],
  ['events band', '.hud__event', 'only when an event arrives'],
  ['language picker', '.language-control', 'only while the Layout menu is open (#663)'],
];

test.describe('the surfaces the direction does not place (#1161)', () => {
  for (const [tier, width, height] of TIERS) {
    test(`every unplaced surface is on the page at ${tier} (${String(width)}x${String(height)})`, async ({ page }) => {
      await open(page, width, height);
      const where = `${tier} ${String(width)}x${String(height)}`;

      for (const [name, selector] of ALWAYS_LAID_OUT) {
        const reading = await read(page, selector);
        expect(reading.present, `${name} (${selector}) is not on the page at ${where}`).toBe(true);
        expect(reading.laidOut, `${name} has no box at ${where}`).toBe(true);
      }

      for (const [name, selector] of ALWAYS_PRESSABLE) {
        const reading = await read(page, selector);
        expect(reading.laidOut, `${name} has no box at ${where}`).toBe(true);
        expect(reading.ownsItsCentre, `${name} is covered by ${reading.coveredBy} at ${where}`).toBe(true);
      }

      for (const [name, selector, why] of CONDITIONAL) {
        const reading = await read(page, selector);
        expect(reading.present, `${name} (${selector}) is not on the page at ${where} -- ${why}`).toBe(true);
        expect(reading.laidOut, `${name} has a box before it should at ${where} -- ${why}`).toBe(false);
      }
    });
  }

  /**
   * The Layout menu is the one route to the language picker, so the route is
   * asserted rather than the mount: a control appended to a slot inside a menu
   * that cannot be opened is a control nobody has.
   */
  for (const [tier, width, height] of TIERS) {
    test(`the Layout menu opens onto a reachable language picker at ${tier}`, async ({ page }) => {
      await open(page, width, height);
      const where = `${tier} ${String(width)}x${String(height)}`;
      await page.locator('.hud-layout__button').click();

      for (const [name, selector] of [
        ['the menu body', '.hud-layout__body'],
        ['the clock the metric strip may be hiding', '.hud-layout__clock'],
        ['the language picker', '.language-control'],
      ] as const) {
        const reading = await read(page, selector);
        expect(reading.laidOut, `${name} has no box with the menu open at ${where}`).toBe(true);
      }
      // And the picker's own press, which is the half a readout cannot answer
      // for (see `ALWAYS_LAID_OUT` on why `pointer-events` makes those two
      // different questions).
      {
        const cycle = await read(page, '.language-control__cycle');
        expect(cycle.ownsItsCentre, `the language picker is covered by ${cycle.coveredBy} at ${where}`).toBe(true);
      }
    });
  }

  /**
   * `.hud__corner` and the three surfaces inside it, **recorded at all three
   * tiers rather than required at any of them.**
   *
   * This is not a floor and it is not an endorsement. It is the one measurement
   * in this file whose current value is arguably wrong for a player -- the
   * alerts list is where `DismissAlert` is issued from, and at 375x812 it has
   * no box -- and it is written down so that the state is in a gate rather than
   * only in three paragraphs of `hud.css` prose. Changing the behaviour changes
   * this assertion, which is exactly what should happen.
   */
  test('the map corner drops at 720px and below, which is where three unplaced surfaces go', async ({ page }) => {
    const readings: string[] = [];
    for (const [tier, width, height] of TIERS) {
      await open(page, width, height);
      const display = await page.evaluate(() => {
        const corner = document.querySelector<HTMLElement>('.hud__corner');
        return corner === null ? 'ABSENT' : getComputedStyle(corner).display;
      });
      readings.push(`${tier}: ${display}`);

      // The container is in the DOM at every tier -- it is `display`, not the
      // mount, that changes. A missing node would be a deletion and is a
      // different failure from a hidden one.
      expect(await read(page, '.hud__corner'), `the map corner at ${tier}`).toMatchObject({ present: true });

      const expected = width > 720;
      for (const [name, selector] of [
        ['the minimap frame', '.hud-minimap'],
        ['the zoom control', '.hud-zoom'],
        ['the alerts list', '.hud-alerts__list'],
      ] as const) {
        const reading = await read(page, selector);
        expect(reading.present, `${name} is not on the page at ${tier}`).toBe(true);
        if (name === 'the alerts list') continue; // its own fold and emptiness are `ui-shell.spec.ts`'s
        expect(reading.laidOut, `${name} at ${tier}`).toBe(expected);
      }
    }
    expect(readings.join(' / ')).toBe('desktop: flex / tablet: flex / phone: none');
  });
});
