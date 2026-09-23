import { expect, test, type Page } from './network-changed-fixture';
import { UI_SCALES, WINDOWS } from './page-zoom-sweep';
import { installTee, press, sentCommands } from './playtest-harness';

/**
 * **The measurement ADR 0122 §8 names as its own weakest claim, taken -- and
 * it refutes two of §8's three premises and finds a third thing §8 did not
 * ask about.**
 *
 * §8 says of the shape the owner ruled for on 2026-09-22 -- the message row
 * itself becomes the press, no action-verb label -- that its zero-cost claim
 * is an argument from the DOM's shape rather than a measurement:
 *
 * > A focus ring is drawn inside the row's box in this stylesheet's other
 * > rows, and a press target that must clear `--tap-target` at 200 % may not
 * > fit a 76px four-line row beside a dismiss control that already claims 44
 * > scaled pixels of it. **That is one Playwright run against
 * > `page-zoom-sweep.ts`'s own harness and it was not taken here**, because
 * > this draft's brief was research and an ADR, and because the thing to
 * > measure does not exist yet to measure.
 *
 * It exists now, and this file is that run. It imports `WINDOWS` and
 * `UI_SCALES` from `page-zoom-sweep.ts` so the combinations are that
 * harness's rather than a second list, and it reproduces a 200 % page zoom
 * the same way that module does and for the reason its docblock gives:
 * Playwright's Chromium cannot be driven to a browser page zoom, and halving
 * the CSS viewport in each axis reproduces the layout exactly.
 *
 * ## What it found, in the order the findings matter
 *
 * **1. The press clears `--tap-target` at every combination, and by a rule
 * rather than by luck.** `--tap-target` resolves to 88px at `--ui-scale: 2`,
 * and the row's own box measured **92px to 1,352px** there.
 * `.ui-row--interactive` declares `min-height: var(--tap-target)` for itself,
 * which is asserted below, so the clearance does not depend on this
 * sentence's length.
 *
 * **2. §8's premise about the focus ring is wrong about this stylesheet.**
 * `primitives.css` gives `.ui-row--interactive:focus-visible` an
 * `outline-offset` of **+2px** -- outside the box, not inside it -- and the
 * three rules that draw inside (`-2px`) are `.ui-number__step`,
 * `.ui-number__input` and `.ui-choice__option`, none of which is a row. The
 * consequence is measured and printed rather than asserted: the ring reaches
 * 4px past the row on each side, `.hud-alerts__list`'s `overflow-y: auto`
 * makes its `overflow-x` compute to `auto` as well, and a row that fills the
 * list's width therefore has its ring at the edge of a clipping box on all
 * four sides.
 *
 * **3. §8's second premise does not arise on this row at all.** There is no
 * dismiss control beside the press to share 44 scaled pixels with:
 * `hud.ts` gives the press only to a row that is *not* dismissible, and the
 * two producers never overlap in the first place.
 *
 * **4. And the thing §8 did not ask about, which is the finding: at 200 %
 * page zoom the alerts log is not on screen at any of the six windows --
 * row, readout or anything else.** Hit-tested on a 2px grid over the row's
 * box, the row owns **zero** of 2,024 to 15,624 sampled points at every one
 * of the six. The cause was read off the ancestor chain rather than guessed:
 * the Overview panel that holds the log below 720px (`section.ui-panel`,
 * `overflow: hidden auto`) collapses to a **2px** box while its content is
 * laid out 200 to 1,700px below, so everything inside it is clipped away.
 *
 * **That is the deferred zero-sum vertical budget, reached through a
 * different door, and it is not something the press introduced.** Two
 * measurements say so. It happens identically at `--ui-scale: 1` in a halved
 * viewport -- 0 of 0 owned points at a halved 1280x720 with the panel already
 * at 2px -- so it is the halved *viewport* and not the interface scale; and
 * with `hud.ts`'s press suppressed (`place` forced to `undefined`, so the row
 * is the `<div>` readout it was before this change) the same probe returns
 * the same zero at the same six combinations. A readout nobody can see and a
 * press nobody can reach are the same fact about the same box.
 *
 * `ui-200-percent-zoom-sweep-ratchet.spec.ts`'s twelve `KNOWN_FAILING`
 * entries are where the decision about that box lives -- *"which of the
 * strip, the tab bar and the rail gives way"* -- and its own note that the
 * twelve *"are one group waiting on one decision"* covers this. **This change
 * does not move that number in either direction**, which that file's own run
 * is the check on.
 *
 * ## What is asserted, and where
 *
 * **At 100 % page zoom (the unhalved windows), reachability is asserted**:
 * the row owns its pixels, measured by the same `elementFromPoint` test
 * `page-zoom-sweep.ts` applies to `.ui-tab`, over the whole box rather than
 * at one point. That is where the press has to work and it does.
 *
 * **At 200 % page zoom the unreachable set is a ceiling in the ratchet's own
 * shape**: `UNREACHABLE_AT_200` below may lose an entry and may never gain
 * one. A combination that starts failing there is either a regression this
 * change is responsible for or a repair of the vertical budget that has gone
 * backwards, and either way it is named on the way in.
 */

const APP_URL = '/index.html';

/** The interface scale §8 asks about: the largest step `UI_SCALES` carries. */
const ZOOM_SCALE = UI_SCALES[UI_SCALES.length - 1]!;

/**
 * The tile the order names, outside the one 32x32 chunk a new prison owns, so
 * the simulation answers `build.out-of-bounds` -- which publishes a tile.
 */
const OFF_MAP_TILE = { x: 100, y: 100 } as const;

const ROW = '.hud-alerts__list [data-alert]:not([data-alert="empty"])';

/**
 * Where the camera readout is taken, in canvas pixels.
 *
 * The same point `hud-minimap-navigates.spec.ts` probes from and the same
 * `calibrate()` default: canvas rather than HUD at 1280x800.
 */
const PROBE = { x: 700, y: 300 } as const;

/**
 * Which tile sits under `PROBE` right now -- the one camera readout the
 * assembled page offers, and the one `hud-minimap-navigates.spec.ts` reads for
 * the same purpose.
 *
 * It arms the removal tool, presses a fixed *screen* point and reads the tile
 * off the `RemoveWall` the press builds (ADR 0106), then disarms. So the tile
 * it returns moves exactly as the camera does, and a camera that did not move
 * returns the same tile.
 *
 * **A screenshot comparison was tried first and is not good enough, which is
 * recorded because it looked convincing.** Comparing the canvas before and
 * after the press, with the clock paused and a stability control between two
 * immediate reads, reported a difference -- and reported the same difference
 * with `src/main.ts`'s `case 'show-alert-place'` gutted, so it was measuring
 * the renderer rather than the camera. A readout that cannot tell a mutation
 * from the truth is not a readout.
 */
async function probeCameraTile(page: Page): Promise<{ readonly tileX: number; readonly tileY: number }> {
  await page.locator('.hud-build__remove').click();
  const commands = await press(page, PROBE.x, PROBE.y);
  await page.locator('.hud-build__remove').click();
  const removal = commands.find((command) => command['type'] === 'RemoveWall');
  if (removal === undefined) {
    throw new Error(`no RemoveWall from a press at ${String(PROBE.x)},${String(PROBE.y)}: ${JSON.stringify(commands)}`);
  }
  return { tileX: removal['x'] as number, tileY: removal['y'] as number };
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface RowReading {
  readonly tag: string;
  readonly laidOut: boolean;
  readonly height: number;
  readonly width: number;
  readonly tapTarget: number;
  readonly minHeight: number;
  readonly controls: number;
  readonly accessibleText: string;
  /** `elementFromPoint` at the row's geometric centre -- the sweep's probe. */
  readonly rowCentreBelongsTo: string;
  /** The bounding box of every sampled point the row owns; see `readRow`. */
  readonly reachable: Box;
  readonly sampled: number;
  readonly owned: number;
  readonly reachableCentreBelongsTo: string;
  readonly focusVisible: boolean;
  readonly focusRing: { readonly width: number; readonly offset: number };
  readonly listOverflowX: string;
  /**
   * How far the focus ring reaches past the list's clipping box on each side,
   * positive meaning clipped.
   */
  readonly ringClipped: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
}

/**
 * Creates a prison and starts its clock, stopping just short of the order
 * below -- `app-shell.spec.ts`'s #261 recipe, which is where every step's own
 * reason is written down.
 */
async function startAPrison(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day'), 'the prison was never created').toHaveText('1');
  await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
  await expect(page.locator('.hud-strip__transport [title="Play at normal speed"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => page.locator('.hud-clock__day-progress').textContent(), {
      message: 'the simulation never advanced, so no order could be dispatched',
      timeout: 15_000,
    })
    .not.toBe('0%');
  await page.getByRole('button', { name: 'Build' }).click();
}

/**
 * Submits a build order at `OFF_MAP_TILE` through the Build panel's numeric
 * route and waits for the simulation to refuse it onto the alerts list.
 *
 * The numeric route rather than a press on the world, deliberately: it names
 * the tile exactly, it works at every viewport, and it moves no camera -- a
 * world press would move the thing this file measures.
 */
async function refuseAnOrderOffTheMap(page: Page): Promise<void> {
  const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
  if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
  await page.getByRole('spinbutton', { name: 'Tile X' }).fill(String(OFF_MAP_TILE.x));
  await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(OFF_MAP_TILE.y));
  await page.locator('.hud-build__coordinates .ui-action').click();

  // The sentence rather than the count: a row that is present may be an
  // *earlier* refusal, which is exactly the trap the camera probe below sets
  // (its own `RemoveWall` is refused too, and `remove-wall.*` is one of the
  // six domains that carry a tile).
  //
  // **The comment here used to say the log holds at most one refusal row at a
  // time, replaced by ordinal. Since the owner's ruling 26 of 2026-09-23
  // (#985) it keeps every refusal its history still holds**
  // (`docs/adr/drafts/what-a-refusal-leaves-in-the-history.md`). So the
  // probe's refusal is now a *second* row beside this one rather than a row
  // this one replaces. The row under test is therefore found by its sentence,
  // `offMapRow`, and never by being the only row.
  await expect(offMapRow(page), 'the simulation refused the order and the alerts list never heard about it').toHaveCount(1, {
    timeout: 20_000,
  });
}

/** The build refusal's own row, found by its sentence -- see `refuseAnOrderOffTheMap`. */
function offMapRow(page: Page) {
  return page.locator(ROW).filter({ hasText: 'that tile is outside the map' });
}

/**
 * Puts the alerts log on the tab that is showing it at this viewport, and
 * returns the page to keyboard input modality.
 *
 * **Below 720px the log is not in `.hud__corner` -- and that narrows ADR 0122
 * §5c.** That section reads *"the phone tier does not have the row at all"* on
 * the ground that `hud.css` drops `.hud__corner` there; what it does not carry
 * is that `hud.ts` re-parents the alerts fold into the Overview panel's
 * `foldSlot` for exactly that case (issue #1201), so the row *is* there and is
 * reached from the Overview section instead. Every halved viewport in this
 * file is 720 CSS px or narrower -- a halved 1440x900 is 720x450, the widest
 * of the six -- so the 200 % test is entirely a test of that arrangement.
 *
 * The tab is activated by calling `click()` on the element rather than through
 * Playwright's pointer, deliberately: whether the *tab* is reachable at these
 * combinations is `page-zoom-sweep.ts`'s question and the subject of the
 * twelve entries on `ui-200-percent-zoom-sweep-ratchet.spec.ts`'s
 * `KNOWN_FAILING`. Driving it through the pointer would make this file fail
 * for their reason instead of reporting its own.
 *
 * The key press at the end is not idle: `:focus-visible` is a function of the
 * last input *modality*, and every step of the recipe above is a pointer
 * press, so without it the ring is not drawn and every ring figure would read
 * zero while the rule sits in the stylesheet unmeasured.
 */
async function showTheLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll<HTMLElement>('.ui-tab')].find(
      (node) => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().startsWith('Overview'),
    );
    tab?.click();
  });
  await page.keyboard.press('Tab');
}

function readRow(selector: string): RowReading | 'no such row' {
  const row = document.querySelector<HTMLElement>(selector);
  const list = document.querySelector<HTMLElement>('.hud-alerts__list');
  if (row === null || list === null) return 'no such row';
  const round = (value: number): number => Math.round(value * 100) / 100;
  const name = (node: Element | null): string =>
    node === null
      ? 'nothing'
      : `${node.tagName.toLowerCase()}${node.className === '' ? '' : `.${String(node.className).split(/\s+/)[0]}`}`;

  row.focus();
  const style = getComputedStyle(row);
  const box = row.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  const ringWidth = Number.parseFloat(style.outlineWidth);
  const ringOffset = Number.parseFloat(style.outlineOffset);
  const ring = ringWidth + ringOffset;

  /*
   * **The part of the press a player actually has, found by hit-testing
   * rather than by arithmetic on boxes.**
   *
   * Two earlier readings of this were wrong and the reason is worth keeping.
   * `page-zoom-sweep.ts` probes a control's geometric *centre*, which is the
   * right probe for a tab or an icon button and the wrong one for a row whose
   * height is measured in four figures at the phone tier: the centre of a
   * 1,352px row in a 406px viewport is off the screen, so the probe reports
   * the sentence's length rather than the press. Intersecting the row's box
   * with the list's box and the viewport was wrong too, and more quietly:
   * `getBoundingClientRect` says nothing about *ancestor* clipping, and every
   * `.ui-panel` here is `overflow: hidden`, so that arithmetic reported 112px
   * of reachable press at a combination where `elementFromPoint` in the
   * middle of it returned the world canvas.
   *
   * So the region is sampled. Every point on a 2px grid over the row's box
   * that is inside the viewport is hit-tested, and a point counts only when
   * the topmost element there is the row or something inside it -- which is
   * exactly the test `page-zoom-sweep.ts` applies to one point, applied to
   * the whole box. The result is the bounding box of the points a press would
   * reach.
   */
  const STEP = 2;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let owned = 0;
  let sampled = 0;
  for (let y = Math.max(box.top, 0) + STEP / 2; y < Math.min(box.bottom, window.innerHeight); y += STEP) {
    for (let x = Math.max(box.left, 0) + STEP / 2; x < Math.min(box.right, window.innerWidth); x += STEP) {
      sampled += 1;
      const hit = document.elementFromPoint(x, y);
      if (hit === null || (hit !== row && !row.contains(hit))) continue;
      owned += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const reachable: Box =
    owned === 0
      ? { x: 0, y: 0, width: 0, height: 0 }
      : {
          x: round(minX),
          y: round(minY),
          width: round(maxX - minX + STEP),
          height: round(maxY - minY + STEP),
        };

  return {
    tag: row.tagName,
    laidOut: row.offsetParent !== null,
    height: round(box.height),
    width: round(box.width),
    tapTarget: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap-target')),
    minHeight: Number.parseFloat(style.minHeight),
    // Every `<button>` inside the row. A row that was both the press and a
    // dismiss control would be a button inside a button, which
    // `ListRowAction`'s own comment names as invalid HTML.
    controls: row.querySelectorAll('button').length,
    accessibleText: (row.textContent ?? '').trim(),
    rowCentreBelongsTo: name(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
    reachable,
    sampled,
    owned,
    reachableCentreBelongsTo: name(
      owned === 0 ? null : document.elementFromPoint(reachable.x + reachable.width / 2, reachable.y + reachable.height / 2),
    ),
    focusVisible: row.matches(':focus-visible'),
    focusRing: { width: ringWidth, offset: ringOffset },
    listOverflowX: getComputedStyle(list).overflowX,
    ringClipped: {
      left: round(listBox.left - (box.left - ring)),
      right: round(box.right + ring - listBox.right),
      top: round(listBox.top - (box.top - ring)),
      bottom: round(box.bottom + ring - listBox.bottom),
    },
  };
}

/**
 * The 200 %-page-zoom combinations at which the alerts log is not on screen at
 * all, so no part of the press can be hit-tested.
 *
 * **A ceiling in `ui-200-percent-zoom-sweep-ratchet.spec.ts`'s shape: an entry
 * may leave this list and none may join it.** Every one of the six is here,
 * and the reason is one fact measured off the ancestor chain rather than six:
 * below 720px `hud.ts` re-parents the alerts fold into the Overview panel's
 * `foldSlot` (issue #1201), that `section.ui-panel` is `overflow: hidden auto`
 * and collapses to a 2px box under the halved viewport, and its content --
 * fold, list and row -- is laid out hundreds of pixels below the box that
 * clips it.
 *
 * **Not introduced by the press, measured twice**: identical at
 * `--ui-scale: 1` in the same halved viewport, where the row is the box it has
 * always been, and identical with `hud.ts`'s press suppressed so the row is
 * the `<div>` readout. The decision about that box is the one
 * `KNOWN_FAILING`'s twelve entries are deferred against, and this file does
 * not make it.
 *
 * The value is what the row's own geometric centre resolves to at that
 * combination, which is the diagnostic worth keeping: a tab drawn over the
 * fold and a fold clipped out of existence are different repairs.
 */
const UNREACHABLE_AT_200: Readonly<Record<string, string>> = {
  '1280x720@200%': 'button.ui-tab',
  '1440x900@200%': 'div.ui-separator',
  '1024x768@200%': 'button.ui-tab',
  '900x600@200%': 'nothing',
  '390x844@200%': 'nothing',
  '375x812@200%': 'nothing',
};

test.describe('a refusal row that carries a tile is the press (ADR 0122, the owner ruling of 2026-09-22)', () => {
  test('the press is a real button, clears --tap-target and is reachable at 100 % page zoom, at every viewport page-zoom-sweep.ts measures', async ({
    page,
  }) => {
    test.slow();

    // The refusal is produced once and then read at each viewport: the row is
    // a *level*, republished unchanged on `simulation/status-counts`, so it
    // survives every resize below and the measurement is of its geometry
    // rather than of whether it can be re-provoked six times.
    await page.setViewportSize({ width: 1280, height: 800 });
    await startAPrison(page);
    await refuseAnOrderOffTheMap(page);

    for (const [width, height] of WINDOWS) {
      const label = `${width}x${height}@100%`;
      await page.setViewportSize({ width, height });
      await showTheLog(page);
      await expect(page.locator(ROW), `${label}: the refusal row left the list`).toHaveCount(1);

      const reading = await page.evaluate(readRow, ROW);
      expect(reading, `${label}: the refusal row is not on the page`).not.toBe('no such row');
      if (reading === 'no such row') continue;
      console.log(`[0122 §8] ${label} ${JSON.stringify(reading)}`);

      expect(reading.tag, `${label}: the pressable row must be a real button, not a div with a handler`).toBe('BUTTON');
      expect(reading.laidOut, `${label}: the pressable row is not laid out`).toBe(true);

      // §8's first worry: the press target against `--tap-target`.
      expect(
        reading.minHeight,
        `${label}: the row's own min-height floor is not --tap-target, so any clearance is this sentence's length rather than a rule`,
      ).toBe(reading.tapTarget);
      expect(
        reading.height,
        `${label}: the press target (${reading.height}px) is under --tap-target (${reading.tapTarget}px)`,
      ).toBeGreaterThanOrEqual(reading.tapTarget);

      // §8's second worry does not arise on this row: `hud.ts` gives the
      // press only to a row that is not dismissible, so there is no second
      // control to share the width with -- and a nested one would be a button
      // inside a button, which `ListRowAction`'s comment names as invalid.
      expect(
        reading.controls,
        `${label}: the pressable row carries ${reading.controls} nested control(s) -- a button inside a button`,
      ).toBe(0);

      // §8's premise about the ring, refuted: it is drawn outside the box.
      expect(reading.focusVisible, `${label}: the row took focus without drawing a ring`).toBe(true);
      expect(
        reading.focusRing.offset,
        `${label}: the ring's offset is ${reading.focusRing.offset}px; a negative offset is drawn inside the row, which is what ADR 0122 §8 assumed of this stylesheet`,
      ).toBeGreaterThan(0);

      // No new string was authored for this affordance: the accessible name is
      // the catalogue sentence plus the severity word, and a sighted player
      // reads both off the same row.
      expect(reading.accessibleText, `${label}: the row's accessible text lost the severity word`).toContain('Warning');
      expect(reading.accessibleText, `${label}: the row's accessible text lost the sentence`).toContain(
        'that tile is outside the map',
      );

      // Non-vacuity: a probe that hit-tested nothing would satisfy the
      // reachability assertion by measuring less.
      expect(reading.sampled, `${label}: the reachability probe sampled no points inside the row`).toBeGreaterThan(100);
      expect(
        reading.reachable.height,
        `${label}: only ${reading.reachable.height}px of the press is reachable, under --tap-target (${reading.tapTarget}px) -- ` +
          `the middle of what is left belongs to ${reading.reachableCentreBelongsTo}`,
      ).toBeGreaterThanOrEqual(reading.tapTarget);
      expect(
        reading.reachable.width,
        `${label}: only ${reading.reachable.width}px of the press is reachable across, under --tap-target (${reading.tapTarget}px)`,
      ).toBeGreaterThanOrEqual(reading.tapTarget);
    }
  });

  test('at 200 % page zoom the log is off screen at every viewport, and the set may shrink but not grow', async ({
    page,
  }) => {
    test.slow();

    await page.setViewportSize({ width: 1280, height: 800 });
    await startAPrison(page);
    await refuseAnOrderOffTheMap(page);

    const unreachable: string[] = [];
    const reachable: string[] = [];

    for (const [windowWidth, windowHeight] of WINDOWS) {
      const label = `${windowWidth}x${windowHeight}@${Math.round(ZOOM_SCALE * 100)}%`;
      // A 200 % page zoom halves the CSS viewport in each axis
      // (`page-zoom-sweep.ts`), and the interface scale is applied with the
      // production call: `src/ui/display-scale.ts` sets exactly this property
      // on exactly this element.
      await page.setViewportSize({ width: Math.round(windowWidth / 2), height: Math.round(windowHeight / 2) });
      await page.evaluate((scale) => {
        document.documentElement.style.setProperty('--ui-scale', String(scale));
      }, ZOOM_SCALE);
      await showTheLog(page);
      await expect(page.locator(ROW), `${label}: the refusal row left the list`).toHaveCount(1);

      const reading = await page.evaluate(readRow, ROW);
      expect(reading, `${label}: the refusal row is not on the page`).not.toBe('no such row');
      if (reading === 'no such row') continue;
      console.log(`[0122 §8] ${label} ${JSON.stringify(reading)}`);

      // The affordance's own properties hold here too, and they are the half
      // of §8 that has a right answer at every combination.
      expect(reading.tag, `${label}: the pressable row must be a real button`).toBe('BUTTON');
      expect(
        reading.minHeight,
        `${label}: the row's own min-height floor is not --tap-target`,
      ).toBe(reading.tapTarget);
      expect(
        reading.height,
        `${label}: the press target (${reading.height}px) is under --tap-target (${reading.tapTarget}px)`,
      ).toBeGreaterThanOrEqual(reading.tapTarget);
      expect(reading.controls, `${label}: the pressable row carries a nested control`).toBe(0);
      expect(reading.focusRing.offset, `${label}: the ring is drawn inside the row`).toBeGreaterThan(0);

      if (reading.owned === 0) unreachable.push(`${label} -> ${reading.rowCentreBelongsTo}`);
      else reachable.push(`${label} (${reading.reachable.width}x${reading.reachable.height} of ${reading.height}px)`);
    }

    // The ceiling. An entry may leave and none may join.
    expect(
      unreachable.filter((entry) => UNREACHABLE_AT_200[entry.split(' -> ')[0]!] === undefined),
      'the alerts log became unreachable at a 200 % combination that was not already on UNREACHABLE_AT_200. ' +
        'Either this change put something over the log, or the vertical budget has moved -- the entry names what the ' +
        "row's centre resolves to.",
    ).toEqual([]);

    // Not an assertion: the combinations that have *cleared*, printed so a
    // green run still says whether the ceiling over-describes the tree. The
    // list may be lowered and must never be raised.
    console.log(
      `[0122 §8] unreachable at 200 %: ${unreachable.length} of ${WINDOWS.length}` +
        (reachable.length === 0 ? '' : `; now reachable: ${reachable.join(', ')}`),
    );
  });

  test('a press on the row takes the camera to the tile the message names, and reaches the simulation with nothing', async ({
    page,
  }) => {
    test.slow();

    // The tee has to be planted before the navigation or `sentCommands` reads
    // back `[]` whatever happened, which looks exactly like "nothing was sent"
    // -- `hud-minimap-navigates.spec.ts`'s own note.
    await installTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await startAPrison(page);

    /*
     * **The camera is read BEFORE the refusal is provoked, and the order of
     * those two steps is the whole of what an earlier draft got wrong.**
     * `probeCameraTile` submits a `RemoveWall` to take its reading, the
     * simulation refuses it -- there is no wall on that tile -- and
     * `remove-wall.*` is one of the six refusal domains that publish a tile.
     * The log held one refusal row at a time, replaced by ordinal, so a probe
     * taken after the build order silently swapped the row under test for one
     * aimed at the tile the probe had just pressed. The press then moved the
     * camera by a tile and the test read that as the affordance not working.
     * Reading first leaves the build refusal as the newest, which
     * `refuseAnOrderOffTheMap` waits for by its sentence rather than by a
     * count for the same reason.
     *
     * **Since ruling 26 (2026-09-23, #985) the probe's refusal stays as a
     * second row instead of replacing this one**, so the press below targets
     * `offMapRow` by its sentence. The ordering is kept anyway: it still
     * guarantees the camera reading is taken before anything is pressed.
     */
    const before = await probeCameraTile(page);
    await refuseAnOrderOffTheMap(page);

    // Ruling 26 (2026-09-23, #985), seen on the assembled page: the probe's
    // refused `RemoveWall` and the refused build order are two rows in the
    // history, and the newer one did not erase the older. Before the ruling
    // this read 1, because the list held one refusal row replaced by ordinal.
    await expect(page.locator(ROW), 'the older refusal left the history when a newer one arrived').toHaveCount(2);
    await expect(page.locator(ROW).filter({ hasText: 'no finished wall there either' })).toHaveCount(1);

    // Paused, so nothing the simulation does moves the world under the probe
    // between the two readings.
    await page.locator('.hud-strip__transport [title="Pause"]').click();
    await expect(page.locator('.hud-strip__transport [title="Pause"]')).toHaveAttribute('aria-pressed', 'true');

    const submittedBefore = (await sentCommands(page)).length;

    await offMapRow(page).click();
    // The camera move is synchronous inside the click handler; the probe below
    // takes a real press of its own, which is several round trips of settling
    // on its own account.
    const after = await probeCameraTile(page);

    /*
     * **The arithmetic, so this is an assertion and not an inequality.** A
     * fresh prison owns one 32x32 chunk at the origin, so
     * `frameCameraOnFirstWorld` leaves the camera centred on tile 16 in both
     * axes; the refused order names tile (100,100), and
     * `WorldScene.navigateToTile` centres on that tile's centre. `PROBE` is a
     * fixed *screen* point, so the tile under it shifts by exactly the shift
     * of the camera centre -- 84.5 tiles in each axis, read back as 84 or 85
     * because the probe answers in whole tiles.
     *
     * The two axes are asserted to agree with each other as well as to move:
     * the before and after centres are both symmetric, so a transposed pair
     * would still move both axes and would not keep them equal only if the
     * shift differed -- which it does not here, and the `>= 60` floor below is
     * what makes the movement claim independent of the exact framing.
     */
    const shiftX = after.tileX - before.tileX;
    const shiftY = after.tileY - before.tileY;
    expect(
      shiftX,
      `the press moved the camera ${shiftX} tiles on X; the tile the message names is 84 or 85 tiles from where a fresh prison frames`,
    ).toBeGreaterThanOrEqual(60);
    expect(
      shiftY,
      `the press moved the camera ${shiftY} tiles on Y; the tile the message names is 84 or 85 tiles from where a fresh prison frames`,
    ).toBeGreaterThanOrEqual(60);
    expect(
      Math.abs(shiftX - shiftY),
      `the two axes moved by different amounts (${shiftX} and ${shiftY}) for a move that is diagonal and symmetric`,
    ).toBeLessThanOrEqual(1);

    /*
     * `AGENTS.md` boundary 1: moving a camera is presentational, so the press
     * must build no command at all. `probeCameraTile` submits a `RemoveWall`
     * of its own to take its reading (ADR 0106), which is the one type
     * filtered out here -- exactly as `hud-minimap-navigates.spec.ts` filters
     * it for the same reason.
     */
    expect(
      (await sentCommands(page)).slice(submittedBefore).filter((command) => command['type'] !== 'RemoveWall'),
      'a press on a message row reached the simulation -- leading to a place is presentational only',
    ).toEqual([]);
  });
});
