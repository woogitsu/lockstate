import { type Page, expect, test } from './network-changed-fixture';
import { acceptFirstCandidate, buy, currentTick, installTee, openApp, sentCommands, showPanel, tab, waitForQueueEmpty } from './playtest-harness';

/**
 * **`ReleaseGuardAssignment` can be pressed in a real session, at every width
 * the `#88` sweep visits** (issue
 * [#1357](https://github.com/woogitsu/lockstate/issues/1357)).
 *
 * ## The hole this file closes, and the one it deliberately does not
 *
 * The command's only producer is the `Release` button on a held-guard row
 * (`src/ui/hud/staff-panel.ts`, the block that builds `hud-staff__held-row`).
 * Those rows are the whole of `app-shell.spec.ts`'s
 * `NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD`, so the `#88` sweep has never laid
 * them out or pressed them at any viewport, and
 * `tests/foundation/command-control-reachability-contract.test.ts` records
 * that as `SWEEP_NEVER_PRESSES_ITS_CONTROL`. `ui-held-guards.spec.ts` and
 * `ui-pooled-rows-aim.spec.ts` drive the same rows, but from a synthetic
 * `HudHeldGuardsViewModel` through the UI harness -- so until this file
 * nothing measured that the button is laid out, unobscured and pressable in a
 * session the simulation actually put a guard into.
 *
 * This is issue #1357 §5's second shape: **outside the sweep, in a spec of its
 * own**, on the model of `ui-alert-dismiss-on-a-phone.spec.ts` (#1201). It
 * buys the claim without spending any of the sweep's budget -- #1357 §4
 * measured that part at 2.7 minutes of a 3.0-minute cap -- and for the same
 * reason it **shortens neither exemption list**: those lists are about what
 * the sweep lays out, and the sweep still lays none of these rows out.
 *
 * ## Why the preamble is five steps and not one
 *
 * A running clock is necessary and nowhere near sufficient. Issue #533 /
 * ADR 0070 decision 1: `resolveOccupancyScaledGuardCount` answers `0` for a
 * sector whose occupant count is complete and zero, so **an empty prison
 * requires no guards** and `DeploymentSystem.assignUnassignedGuards` claims
 * nobody however many ticks run -- #1357 §3 measured three hired guards and
 * 8 % of a day of real ticks with nobody held. So the state a `Release` row
 * needs is the one `tests/integration/security-default-sector.test.ts`'s
 * `admitOne` builds, reached here through the HUD a player uses:
 *
 * 1. **walls** round the smallest legal `room.cell` (2x3, ten segments),
 *    because `room.cell` authors `{ type: 'enclosed' }` and ADR 0045 refuses
 *    zoning an open perimeter;
 * 2. **a `ZoneRoom`**, typed into the Rooms panel's coordinate form;
 * 3. **an `AdmitPrisoner`**, which is refused `no-accommodation` without 2;
 * 4. **a `HireStaff`**;
 * 5. **and then the clock**, until `security.deployment`'s ten-tick cadence
 *    claims the guard -- and it is paused again the moment the row appears.
 *
 * The walls go in through the Build panel's numeric route rather than a drag,
 * because tile coordinates need no camera calibration and no viewport can move
 * them; that is the route `app-shell.spec.ts`'s `wallRectanglesFromTheKeyboard`
 * takes, with `fill` and `click` in place of `Tab` walks because this file's
 * subject is not the keyboard. That helper, `perimeterSegments` and
 * `typeCoordinate` cannot be imported -- Playwright refuses a spec that imports
 * another spec -- so the ten lines of perimeter arithmetic are repeated below
 * and the shared primitives (`openApp`, `tab`, `showPanel`, `buy`, the worker
 * tee) come from `playtest-harness.ts`, as `command-lead-at-speed.spec.ts`'s do.
 *
 * ## What is asserted at each viewport
 *
 * The same three questions `ui-alert-dismiss-on-a-phone.spec.ts` asks, plus
 * the effect the press is for:
 *
 * 1. the held row's `Release` has a box (`getClientRects()`), after bringing it
 *    into view **with only the scrolls a player has** -- `auto`/`scroll`
 *    boxes, never an `overflow: hidden` one, which is
 *    `revealTheWayAPlayerCan`'s rule in `app-shell.spec.ts`;
 * 2. its centre is inside the viewport and `elementFromPoint` there answers the
 *    control or something inside it, so nothing is layered over it;
 * 3. a real `click` sends exactly one `ReleaseGuardAssignment` naming the guard
 *    the row's `data-guard` names;
 * 4. and the simulation answered it: the held block reports `0 held · 1 free`,
 *    no row names a guard, and the guard is still on the payroll (ADR 0034
 *    decision 5 -- a release is not a dismissal).
 *
 * The clock stays paused through 3 and 4, so the release is answered by
 * ADR 0051's paused drain and nothing can re-post the guard underneath the
 * assertion. Re-posting is what the next viewport relies on instead: ADR 0034
 * decision 6 records that releasing a deployed guard is a re-shuffle --
 * `DeploymentSystem` claims a free guard again on its next cycle while the
 * sector still asks for one -- so each later viewport runs the clock again,
 * pauses on the row, and presses again. One prison serves all five.
 *
 * ## Two load widths, because a resize is not a load
 *
 * Five viewports are the sweep's `HUD_LAYOUT_VIEWPORTS`, walked by resizing a
 * live page. The layout shell re-resolves its tier on every resize
 * (`src/ui/hud/layout-shell.ts`'s `refresh`), and each step waits for
 * `.hud[data-layout-tier]` to name the tier the width implies -- but a phone
 * player *loads* at 375x812, and a resize reaching the same tier is an
 * argument, not a measurement, that nothing is resolved only at mount. So the
 * walk runs twice: from a page loaded at 1280x720, and from one loaded at
 * 375x812, each starting at its own load width.
 *
 * ## How long the clock runs
 *
 * Every hold is bounded by the row appearing, not by a duration: Play, wait
 * for a row to name a guard (20 s ceiling), Pause. Measured across the
 * mutation runs below, each hold cost **15-32 ticks** at x1 -- the ten-tick
 * deployment cadence plus the held-guards reader's own cadence plus the
 * latency of the Pause press. The figure is in every failure message, so a
 * red run says how much clock it spent.
 *
 * ## What was watched going red
 *
 * Three throwaway mutations of production code, each restored from a copy
 * and checked with `sha256sum` before the next. Baseline: **2 passed**.
 *
 * | mutation | result |
 * | --- | --- |
 * | `options.onRelease({ guardId })` in the held row's `onActivate` (`staff-panel.ts`) replaced by `void guardId` | **2 failed** -- *"pressing Release sent no command at 1280x720 (loaded at 1280x720), after 32 ticks of clock"*, and the same at 375x812 |
 * | a `::after` overlay, `position: absolute; inset: 0`, on `.hud-staff__held-row` (`hud.css`) | **2 failed** -- *"the held row's Release is covered by hud-staff__held-row at 1280x720"*, and at 375x812 |
 * | `@media (max-width: 720px) { .hud-staff__held { display: none !important; } }` | **2 failed** -- *"the held row's Release has no box at 375x812 (loaded at 1280x720)"*: the desktop-loaded walk passed its first four widths and went red on the fifth, which is the evidence the walk reaches every width rather than stopping at the first |
 *
 * ## Slow, and why
 *
 * `test.slow()` (3.0 minutes) and no raised cap. The preamble is the cost:
 * the ten wall orders and the crew that builds them at x4 were about 37 s of
 * the desktop-loaded test on the container this was written on (4 cores,
 * SwiftShader, another agent's browser suite beside it), which puts that
 * test at 1.1-1.6 m against the default 60 s -- 1.6 m on three consecutive
 * green runs at load average 3.8-8.9, so ~84 s of margin under the cap on a
 * loaded box. The phone-loaded one ran 28 s-1.3 m across the same runs. Read
 * none of these as a figure for another host: `app-shell.spec.ts`'s keyboard
 * zoning test records the same commit differing by 40 % on this one.
 */

interface TileRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface WallSegment {
  readonly x: number;
  readonly y: number;
  readonly edge: 'north' | 'west';
}

/**
 * `room.cell`'s authored minimum exactly (`minWidth: 2, minHeight: 3,
 * minTiles: 6`), inside the starting parcel -- the rectangle
 * `app-shell.spec.ts`'s keyboard-only zoning test uses, for the same reason:
 * every tile of perimeter beyond it is another wall to order and build.
 */
const CELL: TileRectangle = { x: 4, y: 4, width: 2, height: 3 };

/** The perimeter as the wall grid stores it: `north` and `west` edges only. */
function perimeterSegments(rectangle: TileRectangle): readonly WallSegment[] {
  const segments: WallSegment[] = [];
  for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
    segments.push({ x, y: rectangle.y, edge: 'north' });
    segments.push({ x, y: rectangle.y + rectangle.height, edge: 'north' });
  }
  for (const x of [rectangle.x, rectangle.x + rectangle.width]) {
    for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) segments.push({ x, y, edge: 'west' });
  }
  return segments;
}

const metric = (page: Page, id: string) => page.locator(`[data-metric="${id}"] .ui-stat__value`);
const transport = (page: Page, title: string) => page.locator(`.hud-strip__transport [title="${title}"]`);

/**
 * A held row that names a guard. `[data-guard]` rather than `:not([hidden])`,
 * because a pooled place inside its settle window keeps its box and names
 * nobody (`staff-panel.ts`'s `holds-open` branch) -- measured: with nothing
 * held, one such place is unhidden -- and its `Release` stops a press on
 * `guardId === undefined`, so it is not the control this file is about.
 * Scoped to the held list, because the roster's rows carry the
 * `hud-staff__held-row` class as well.
 */
const HELD_ROW = '.hud-staff__held-list .hud-staff__held-row[data-guard]';

async function pause(page: Page): Promise<void> {
  await transport(page, 'Pause').click();
  await expect(transport(page, 'Pause')).toHaveAttribute('aria-pressed', 'true');
}

async function wallTheCell(page: Page): Promise<void> {
  const segments = perimeterSegments(CELL);
  await tab(page, 'build').click();
  await expect(page.locator('.hud-build')).toBeVisible();
  // Two bricks per segment, out of `wall-brick`'s `materialsRequired`. `buy`
  // selects the row and waits for the panel to say so, so the orders below are
  // for walls rather than whatever the catalogue arrived holding.
  await buy(page, 'wall-brick', 2 * segments.length);
  await expect(page.locator('.hud__refusal'), 'the brick purchase was refused').toBeHidden();

  const coordinates = page.locator('.hud-build__coordinates');
  if ((await coordinates.getAttribute('data-collapsed')) === 'true') {
    await coordinates.locator('> .ui-section__header').click();
  }
  await expect(coordinates).toHaveAttribute('data-collapsed', 'false');
  for (const segment of segments) {
    await page.getByRole('spinbutton', { name: 'Tile X' }).fill(String(segment.x));
    await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(segment.y));
    await coordinates.locator(`[data-choice="${segment.edge}"]`).click();
    await coordinates.locator('.ui-action').click();
  }
  await expect(
    page.locator('.hud-build'),
    'the worker did not receive one build order per perimeter segment',
  ).toHaveAttribute('data-queued', String(segments.length));
  await expect(page.locator('.hud__refusal'), 'a wall order was refused').toBeHidden();

  // The crew, at x4 -- the speed `wallRectanglesFromTheKeyboard` builds at.
  await transport(page, 'Play at normal speed').click();
  const fastForward = page.locator('.hud-strip__transport button').nth(2);
  await fastForward.click();
  await expect(page.locator('.hud-clock__speed')).toHaveText('×2');
  await fastForward.click();
  await expect(page.locator('.hud-clock__speed')).toHaveText('×4');
  await expect
    .poll(async () => page.locator('.hud-build').getAttribute('data-queued'), {
      message: `the crew never finished the ${String(segments.length)} wall segments`,
      timeout: 90_000,
    })
    .toBeNull();
  await pause(page);
}

async function zoneTheCell(page: Page): Promise<void> {
  await tab(page, 'zones').click();
  const rooms = page.locator('.hud-rooms');
  await expect(rooms).toBeVisible();
  if ((await rooms.getAttribute('data-collapsed')) === 'true') {
    await rooms.locator('> .ui-panel__header > .ui-panel__toggle').click();
  }
  const row = page.locator('.hud-rooms__list [data-room="room.cell"]');
  await row.click();
  await expect(row).toHaveAttribute('data-selected', 'true');
  const form = page.locator('.hud-rooms__coordinates');
  if ((await form.getAttribute('data-collapsed')) === 'true') await form.locator('> .ui-section__header').click();
  await expect(form).toHaveAttribute('data-collapsed', 'false');
  for (const [field, value] of [
    ['x', CELL.x],
    ['y', CELL.y],
    ['width', CELL.width],
    ['height', CELL.height],
  ] as const) {
    await page.locator(`.hud-rooms__coord-${field} input`).fill(String(value));
  }
  await page.locator('.hud-rooms__coordinates-submit').click();
  // The typed rectangle reached the panel, read off the attribute a drag writes.
  await expect(page.locator('.hud-rooms__area')).toHaveAttribute(
    'data-area',
    `${String(CELL.x)},${String(CELL.y)},${String(CELL.width)},${String(CELL.height)}`,
  );
  await page.locator('.hud-rooms__confirm').click();
  await expect(metric(page, 'rooms'), 'the walled cell was never zoned').toHaveText('1');
}

/** #590 only places a candidate after a real bed exists in a completed cell. */
async function furnishTheCell(page: Page): Promise<void> {
  await tab(page, 'build').click();
  await buy(page, 'bed-wooden', 1);
  await buy(page, 'toilet-brick', 1);
  const coordinates = page.locator('.hud-build__coordinates');
  if ((await coordinates.getAttribute('data-collapsed')) === 'true') {
    await coordinates.locator('> .ui-section__header').click();
  }
  for (const [buildable, x, y] of [['bed-wooden', CELL.x, CELL.y], ['toilet-brick', CELL.x + 1, CELL.y]] as const) {
    await page.locator(`.hud-build__list [data-buildable="${buildable}"]`).click();
    await page.getByRole('spinbutton', { name: 'Tile X' }).fill(String(x));
    await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(y));
    await coordinates.locator('.ui-action').click();
  }
  await expect(page.locator('.hud__refusal'), 'the furniture order was refused').toBeHidden();
  await transport(page, 'Play at normal speed').click();
  await waitForQueueEmpty(page, 90_000);
  await pause(page);
}

interface ReleaseReading {
  /** A row naming a guard exists, so a miss below is not read as an unreachable control. */
  readonly present: boolean;
  /** `getClientRects().length > 0`, after the scrolls a player has. */
  readonly laidOut: boolean;
  /** The control's centre is inside the window at all. */
  readonly insideViewport: boolean;
  /** `elementFromPoint` at that centre answers the control or something inside it. */
  readonly ownsItsCentre: boolean;
  /** What answered instead, so a failure names the layer over it. */
  readonly coveredBy: string;
  /** The row's `data-guard`, which the press must name. */
  readonly guardId: string | null;
}

/**
 * The held row's `Release`, measured the way a player meets it.
 *
 * The reveal is `ui-alert-dismiss-on-a-phone.spec.ts`'s `reachLastRow`, which
 * lifted it from `app-shell.spec.ts`'s `revealTheWayAPlayerCan`: only boxes
 * whose computed `overflow-y` is `auto` or `scroll` are moved, because a bare
 * `scrollIntoView` also scrolls `overflow: hidden` boxes and would certify a
 * control no finger, wheel or key can bring back.
 */
async function readRelease(page: Page): Promise<ReleaseReading> {
  return page.evaluate((selector: string) => {
    const row = document.querySelector<HTMLElement>(selector);
    const control = row?.querySelector<HTMLButtonElement>('button.ui-action') ?? null;
    const guardId = row?.dataset['guard'] ?? null;
    const unmeasured = { insideViewport: false, ownsItsCentre: false, guardId };
    if (row === null || control === null) return { ...unmeasured, present: false, laidOut: false, coveredBy: 'absent' };

    const playerScrollable = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';
    for (let ancestor = control.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (!playerScrollable(style.overflowY) || ancestor.scrollHeight <= ancestor.clientHeight) continue;
      const border = ancestor.getBoundingClientRect();
      const top = border.top + ancestor.clientTop;
      const bottom = top + ancestor.clientHeight;
      const rect = control.getBoundingClientRect();
      if (rect.bottom > bottom) ancestor.scrollTop += rect.bottom - bottom;
      else if (rect.top < top) ancestor.scrollTop += rect.top - top;
    }

    if (control.getClientRects().length === 0) {
      return { ...unmeasured, present: true, laidOut: false, coveredBy: 'no box' };
    }
    const box = control.getBoundingClientRect();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      present: true,
      laidOut: true,
      insideViewport: x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight,
      ownsItsCentre: hit !== null && (control === hit || control.contains(hit)),
      coveredBy:
        hit === null ? 'nothing (outside the viewport)' : ((hit as HTMLElement).closest('[class]')?.className ?? hit.nodeName),
      guardId,
    };
  }, HELD_ROW);
}

async function releasesSent(page: Page): Promise<readonly unknown[]> {
  return (await sentCommands(page))
    .filter((command) => command['type'] === 'ReleaseGuardAssignment')
    .map((command) => command['guardId']);
}

/** `app-shell.spec.ts`'s `HUD_LAYOUT_VIEWPORTS`, in its order: the sweep's five. */
const SWEEP_VIEWPORTS = [
  [1280, 720],
  [1440, 900],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

/** Where each walk loads the page; each walk starts at its own load width. */
const LOAD_VIEWPORTS = [
  ['desktop', 1280, 720],
  ['phone', 375, 812],
] as const;

test.describe('ReleaseGuardAssignment is pressable in a real session (#1357)', () => {
  for (const [tier, loadWidth, loadHeight] of LOAD_VIEWPORTS) {
    test(`a guard the simulation holds is released from its own row, loaded at ${tier} (${String(loadWidth)}x${String(loadHeight)})`, async ({
      page,
    }) => {
      test.slow();
      await page.setViewportSize({ width: loadWidth, height: loadHeight });
      await installTee(page);
      await openApp(page);
      await page.getByRole('button', { name: 'New prison' }).click();
      await expect(page.locator('.hud-clock__day')).toHaveText('1');

      await wallTheCell(page);
      await zoneTheCell(page);
      await furnishTheCell(page);

      await showPanel(page, 'manage', '.hud-intake');
      await acceptFirstCandidate(page);
      await expect(metric(page, 'prisoners'), 'the admission was refused, so the sector asks for nobody').toHaveText('1');
      await page.locator('.hud-staff__hire').click();
      await expect(metric(page, 'staff'), 'the hire was refused').toHaveText('1');

      // Pre-state, and the half of #1357 §3 a paused clock answers: a guard on
      // the payroll and a prisoner to guard, and still nobody held, because
      // nothing claims a guard except a deployment tick.
      const held = page.locator('.hud-staff__held');
      const heldRows = page.locator(HELD_ROW);
      await expect(held).toHaveAttribute('data-held', '0');
      await expect(heldRows).toHaveCount(0);
      expect(await releasesSent(page), 'a release left this page before any was pressed').toEqual([]);

      const walk = [
        [loadWidth, loadHeight] as const,
        ...SWEEP_VIEWPORTS.filter(([width, height]) => width !== loadWidth || height !== loadHeight),
      ];
      for (const [presses, [width, height]] of walk.entries()) {
        const where = `${String(width)}x${String(height)} (loaded at ${String(loadWidth)}x${String(loadHeight)})`;
        await page.setViewportSize({ width, height });
        await expect(page.locator(`.hud[data-layout-tier="${width <= 720 ? 'phone' : 'desktop'}"]`)).toHaveCount(1);
        await tab(page, 'manage').click();

        // ---- the clock, bounded: run until the row names a guard, then stop --
        const from = await currentTick(page);
        await transport(page, 'Play at normal speed').click();
        await expect(heldRows, `no guard became held at ${where}`).toHaveCount(1, { timeout: 20_000 });
        await pause(page);
        const ran = (await currentTick(page)) - from;

        // ---- laid out, in view, and nothing over it -------------------------
        const reading = await readRelease(page);
        const context = `at ${where}, after ${String(ran)} ticks of clock`;
        expect(reading.present, `no held row named a guard ${context}`).toBe(true);
        expect(reading.laidOut, `the held row's Release has no box ${context} -- ${reading.coveredBy}`).toBe(true);
        expect(reading.insideViewport, `the held row's Release is outside the window ${context}`).toBe(true);
        expect(reading.ownsItsCentre, `the held row's Release is covered by ${reading.coveredBy} ${context}`).toBe(true);

        // ---- the press, and what it is for -----------------------------------
        await heldRows.first().locator('button.ui-action').click();
        await expect
          .poll(async () => releasesSent(page), { message: `pressing Release sent no command ${context}` })
          .toHaveLength(presses + 1);
        expect((await releasesSent(page)).at(-1), `the press released a guard its row did not name ${context}`).toBe(
          Number(reading.guardId),
        );
        await expect(held, `the simulation never answered the release ${context}`).toHaveAttribute('data-held', '0');
        await expect(heldRows).toHaveCount(0);
        await expect(page.locator('.hud-staff__held-summary')).toHaveText('0 held · 1 free');
        // Released, not dismissed (ADR 0034 decision 5).
        await expect(metric(page, 'staff'), `the release took the guard off the payroll ${context}`).toHaveText('1');
        await expect(transport(page, 'Pause')).toHaveAttribute('aria-pressed', 'true');
      }
    });
  }
});
