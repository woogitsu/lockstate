import { expect, test, type Page } from './network-changed-fixture';
import { TILE, armBuildable, calibrate, installTee, openApp, sentCommands, tab } from './playtest-harness';

/**
 * **A wall drag that passes under a HUD island must still build what it drew
 * (issue #878).**
 *
 * ## The defect this gate exists for
 *
 * `.hud` is `pointer-events: none`, but `hud.css`'s *"Every interactive island
 * opts back in"* rule restores `auto` on `.hud-strip`, `.hud__corner > *`,
 * `.hud__aside > *`, `.hud__side > *` and `.hud-tabs__inner`. Those islands sit
 * over the map, and Phaser 4 listens for `mousemove`/`mouseup` **on the game
 * canvas** (`node_modules/phaser/src/input/mouse/MouseManager.js`,
 * `startListeners`), so a drag that crosses one stops being delivered: the last
 * move the canvas heard is the last move `extendBuild` saw, and `commitBuild`
 * then places the run as it stood there. Issue #878 measured a four-segment run
 * at tiles (6,12)-(6,15) producing **one** command, with nothing in the refusal
 * band, nothing in the alerts list and nothing in the console. The player drew
 * four tiles, got one wall, and was told nothing.
 *
 * **The defect is the silence, not the blocking.** The HUD has to sit
 * somewhere. What was indefensible is that the rule deciding which parts of the
 * map answer a drag was invisible, undocumented in play, and different at every
 * viewport.
 *
 * ## Why this file measures commands and not reachable pixels
 *
 * A count of *reachable tiles* is a measurement of the CSS, and the CSS is not
 * the defect -- a HUD covering a different band would score differently and be
 * no better. What a player experiences is the difference between the tiles they
 * dragged across and the walls they got, so that difference is what is
 * asserted: one `PlaceBuildOrder` per tile the drag spanned, at each of those
 * tiles, whatever the pointer passed over on the way.
 *
 * ## Why it needs the assembled page
 *
 * `world-scene-harness.html` has no HUD, so nothing there can swallow a
 * pointer: the scene's own specs in `world-scene-input.spec.ts` could not see
 * this defect and still cannot. The islands exist only on `index.html`, so this
 * drives the real application -- a real prison, the real Build panel, the real
 * rail.
 *
 * ## Several viewports, and that is the point
 *
 * The island geometry moves with the page, so the blocked band is a different
 * shape at every size and a gate pinned to one viewport would be a gate for one
 * shape. Each viewport is a test of its own: they cost a page load each, and one
 * test covering three would report the first failure and hide the rest -- and,
 * more practically, would have to fit all three inside one `test.slow()`
 * budget, which measurement says it would not on a loaded machine.
 *
 * ## What it costs, and where that went
 *
 * Measured on this container under a load average of about 24, with six other
 * agents running suites: 174 s for one viewport, of which the calibration
 * bisection was 72 s, the three drags 45 s, the page load 18 s and arming the
 * tool 11 s. Almost all of it is Playwright round trips rather than work, so the
 * cuts are round-trip cuts: `calibrate` at a quarter-tile precision instead of
 * a pixel (four presses fewer per axis), four mouse steps a leg instead of
 * eight, and the counter-assertions folded in here instead of costing a fourth
 * page load and a fourth prison.
 */

/** A tile centre in page pixels, carrying the tile it belongs to. */
interface TileCentre {
  readonly tx: number;
  readonly ty: number;
  readonly x: number;
  readonly y: number;
}

/** What took the pointer at each visible tile centre. */
interface ReachabilityMap {
  readonly free: readonly { readonly tx: number; readonly ty: number }[];
  readonly blocked: readonly { readonly tx: number; readonly ty: number; readonly by: string }[];
}

/**
 * A straight run of tiles to drag along, and what it is expected to build.
 *
 * `axis` is which way it runs, because the two directions meet different
 * islands -- the right-hand rail across x, the tab bar and the minimap frame
 * down y -- and an implementation could plausibly fix one and not the other.
 * `endsUnder` names the island the run finishes beneath, or is `undefined` for
 * a run that stays on reachable canvas throughout (the control).
 */
interface Run {
  readonly axis: 'x' | 'y';
  /** The fixed coordinate: the row for an x run, the column for a y run. */
  readonly line: number;
  readonly from: number;
  readonly to: number;
  readonly spanned: number;
  readonly endsUnder?: string;
}

const CANVAS_ONLY = 'CANVAS';

/**
 * A 64x64 square of canvas a pointer can reach, for `calibrate` to bisect from.
 *
 * `calibrate`'s default probe is `(700, 300)`, which is on the rail at the
 * narrower viewports here -- every press would land on a panel, produce no
 * `RemoveObject`, and the calibration would throw. So the square is found
 * first, by asking the page what is on top at its four corners and its centre.
 * Nearest the viewport centre wins, so the bisection stays as far from every
 * island as the page allows.
 */
async function freeCalibrationSquare(page: Page): Promise<{ readonly x: number; readonly y: number }> {
  const square = await page.evaluate(
    ({ tile, canvasTag }) => {
      const onCanvas = (x: number, y: number): boolean => document.elementFromPoint(x, y)?.tagName === canvasTag;
      const centreX = window.innerWidth / 2;
      const centreY = window.innerHeight / 2;
      let best: { x: number; y: number; distance: number } | undefined;
      for (let y = 8; y + tile < window.innerHeight - 8; y += 8) {
        for (let x = 8; x + tile < window.innerWidth - 8; x += 8) {
          if (
            !onCanvas(x, y) ||
            !onCanvas(x + tile, y) ||
            !onCanvas(x, y + tile) ||
            !onCanvas(x + tile, y + tile) ||
            !onCanvas(x + tile / 2, y + tile / 2)
          ) {
            continue;
          }
          const distance = Math.hypot(x + tile / 2 - centreX, y + tile / 2 - centreY);
          if (best === undefined || distance < best.distance) best = { x, y, distance };
        }
      }
      return best;
    },
    { tile: TILE, canvasTag: CANVAS_ONLY },
  );

  expect(
    square,
    'no 64x64 square of this page is canvas a pointer can reach, so there is nowhere to calibrate the tile transform from. That is a finding about the HUD covering the whole world, not a broken test.',
  ).toBeDefined();
  return { x: square!.x, y: square!.y };
}

/**
 * Which visible tile centres reach the canvas, and which island takes the rest.
 *
 * The island is named by walking up from the hit element to the outermost
 * ancestor *inside the HUD* that opts back into pointer events, so a failure
 * message says `hud__aside` or `hud-tabs__inner` rather than a leaf `<span>`.
 * The walk stops at the HUD root on purpose: `<html>` is `pointer-events: auto`
 * too, and a walk that ran past the root would name it every time.
 */
async function reachability(
  page: Page,
  origin: { readonly originX: number; readonly originY: number },
): Promise<ReachabilityMap> {
  return page.evaluate(
    ({ originX, originY, tile, canvasTag }) => {
      const free: { tx: number; ty: number }[] = [];
      const blocked: { tx: number; ty: number; by: string }[] = [];
      for (let ty = 0; ty <= 60; ty += 1) {
        const centreY = originY + ty * tile + tile / 2;
        if (centreY < 0 || centreY > window.innerHeight) continue;
        for (let tx = 0; tx <= 70; tx += 1) {
          const centreX = originX + tx * tile + tile / 2;
          if (centreX < 0 || centreX > window.innerWidth) continue;
          const hit = document.elementFromPoint(centreX, centreY);
          if (hit === null) continue;
          if (hit.tagName === canvasTag) {
            free.push({ tx, ty });
            continue;
          }
          const island = hit.closest('.hud, .save-panel');
          let owner: HTMLElement = hit as HTMLElement;
          for (let node: HTMLElement | null = hit as HTMLElement; node !== null; node = node.parentElement) {
            if (getComputedStyle(node).pointerEvents === 'auto') owner = node;
            if (node === island) break;
          }
          blocked.push({ tx, ty, by: owner.className || owner.tagName });
        }
      }
      return { free, blocked };
    },
    { originX: origin.originX, originY: origin.originY, tile: TILE, canvasTag: CANVAS_ONLY },
  );
}

/** Every free coordinate along one line, ascending. */
function freeAlong(map: ReachabilityMap, axis: 'x' | 'y', line: number): readonly number[] {
  return map.free
    .filter((cell) => (axis === 'x' ? cell.ty === line : cell.tx === line))
    .map((cell) => (axis === 'x' ? cell.tx : cell.ty))
    .sort((left, right) => left - right);
}

/** Every line that has at least one free tile on it. */
function linesWithFreeTiles(map: ReachabilityMap, axis: 'x' | 'y'): readonly number[] {
  return [...new Set(map.free.map((cell) => (axis === 'x' ? cell.ty : cell.tx)))].sort((left, right) => left - right);
}

/**
 * The longest run on this page that starts on canvas and ends under an island,
 * along one axis.
 *
 * Derived from the reachability map rather than from a remembered tile band:
 * the band is a property of the viewport and of whatever the HUD currently
 * contains, and a hard-coded pair of tiles would silently stop crossing an
 * island the first time a panel changed width. It ends **two tiles inside** the
 * island, so the run cannot be satisfied by a pointer that merely grazed the
 * edge, and it starts at most four tiles before it, so a run stays well inside
 * `MAX_RUN_SEGMENTS`.
 */
function longestCrossing(map: ReachabilityMap, axis: 'x' | 'y'): Run | undefined {
  const isFree = (line: number, along: number): boolean =>
    map.free.some((cell) =>
      axis === 'x' ? cell.ty === line && cell.tx === along : cell.tx === line && cell.ty === along,
    );
  const blockedBy = (line: number, along: number): string | undefined =>
    map.blocked.find((cell) =>
      axis === 'x' ? cell.ty === line && cell.tx === along : cell.tx === line && cell.ty === along,
    )?.by;

  let best: Run | undefined;
  for (const line of linesWithFreeTiles(map, axis)) {
    const along = freeAlong(map, axis, line);
    for (const direction of [1, -1] as const) {
      const edge = direction === 1 ? along[along.length - 1] : along[0];
      if (edge === undefined) continue;
      const owner = blockedBy(line, edge + 2 * direction);
      if (owner === undefined || blockedBy(line, edge + direction) === undefined) continue;

      let start = edge;
      while (Math.abs(start - edge) < 4 && isFree(line, start - direction)) start -= direction;
      const spanned = Math.abs(edge + 2 * direction - start) + 1;
      if (spanned < 4) continue;
      if (best === undefined || spanned > best.spanned) {
        best = { axis, line, from: start, to: edge + 2 * direction, spanned, endsUnder: owner };
      }
    }
  }
  return best;
}

/**
 * The control: a run of the same shape that never leaves reachable canvas.
 *
 * Without it, a page where *no* drag builds anything -- an unaffordable wall, a
 * tool that failed to arm, a calibration off by a tile -- would look exactly
 * like the defect, and this file would report the defect it was written to find
 * whatever happened. `avoidLines` keeps it off the rows the crossing runs use,
 * because two x runs on one row would ask for the same edges twice.
 */
function longestFreeRun(map: ReachabilityMap, axis: 'x' | 'y', avoidLines: readonly number[]): Run | undefined {
  let best: Run | undefined;
  for (const line of linesWithFreeTiles(map, axis)) {
    if (avoidLines.includes(line)) continue;
    const along = freeAlong(map, axis, line);
    let runStart = 0;
    for (let index = 1; index <= along.length; index += 1) {
      const contiguous = index < along.length && along[index]! === along[index - 1]! + 1;
      if (contiguous) continue;
      const from = along[runStart]!;
      const last = along[index - 1]!;
      const spanned = Math.min(last - from + 1, 6);
      if (spanned >= 4 && (best === undefined || spanned > best.spanned)) {
        best = { axis, line, from, to: from + spanned - 1, spanned };
      }
      runStart = index;
    }
  }
  return best;
}

/**
 * Drags along a run and answers the `PlaceBuildOrder` commands it produced.
 *
 * The gesture is the shape `playtest-harness.ts`'s `drag` performs -- press, a
 * move to the midpoint in several steps, a move to the end in several more,
 * release -- because a single jump to the end is a gesture no hand makes and
 * would hide exactly the defect under test: the truncation comes from the
 * *intermediate* moves stopping, so a drag with no intermediate moves has
 * nothing to lose. Four steps a leg rather than that helper's eight: each step
 * is a separate dispatch and a separate round trip, and four is already several
 * moves inside the island.
 */
async function dragAlong(
  page: Page,
  a: TileCentre,
  b: TileCentre,
): Promise<readonly Record<string, unknown>[]> {
  const before = (await sentCommands(page)).length;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up({ button: 'left' });
  /*
   * Submission is synchronous with the release, so this is the tee's round trip
   * and not a wait on the simulation. A command executes 36-55 ticks after it is
   * submitted (`DEFAULT_LEAD_TICKS`, `src/ui/simulation-commands.ts`); nothing
   * here waits for that, because what is measured is what the page *asked* for.
   */
  await page.waitForTimeout(400);
  return (await sentCommands(page)).slice(before).filter((command) => command['type'] === 'PlaceBuildOrder');
}

const VIEWPORTS = [
  // The viewport issue #878 mapped tile by tile.
  { width: 1440, height: 900 },
  // Narrower, where the right-hand rail reaches further across the world.
  { width: 1280, height: 720 },
  // Wider, where the free band is at its most generous -- a fix that worked
  // only while the islands were far apart would pass here and fail above.
  { width: 1920, height: 1080 },
] as const;

test.describe('a wall drag that passes under a HUD island (#878)', () => {
  for (const viewport of VIEWPORTS) {
    test(`builds every segment it drew at ${viewport.width}x${viewport.height} (#878)`, async ({ page }) => {
      // A real page load, a real prison, a calibration bisection and three
      // drags. `test.slow()` triples the suite's 60 s budget; it does not make
      // this test do less. Without it a loaded runner would fail this for being
      // slow rather than for finding anything, which is the worst kind of red.
      test.slow();

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installTee(page);
      await openApp(page);
      await page.getByRole('button', { name: 'New prison' }).click();
      await expect(page.locator('.hud-clock__day')).toHaveText('1');
      await tab(page, 'build').click();

      /*
       * A quarter of a tile is all the precision this file needs, and it is
       * four presses cheaper per axis than `calibrate`'s default. Every point
       * below is a tile *centre*, so an origin known to 16px still names the
       * right tile with 16px to spare -- and the presses were the single
       * largest cost in this test, measured at 72 s of a 174 s run before the
       * dial existed.
       */
      const origin = await calibrate(page, await freeCalibrationSquare(page), TILE / 4);
      const map = await reachability(page, origin);
      const centre = (line: number, along: number, axis: 'x' | 'y'): TileCentre => {
        const tx = axis === 'x' ? along : line;
        const ty = axis === 'x' ? line : along;
        return { tx, ty, x: origin.originX + tx * TILE + TILE / 2, y: origin.originY + ty * TILE + TILE / 2 };
      };

      // Vacuity guards. Every assertion below is about a drag that crosses an
      // island, so a page with nothing over the world would pass this file
      // without exercising a line of it.
      expect(
        map.blocked.length,
        `no visible tile centre at ${viewport.width}x${viewport.height} is covered by a HUD island, so nothing here can swallow a drag and this test proves nothing. Either the HUD has moved off the world entirely -- which would be worth knowing -- or the probe is broken.`,
      ).toBeGreaterThan(0);
      expect(
        map.free.length,
        'no visible tile centre reaches the canvas at all, so no drag can even start',
      ).toBeGreaterThan(0);

      const crossings = (['x', 'y'] as const)
        .map((axis) => longestCrossing(map, axis))
        .filter((run): run is Run => run !== undefined);
      expect(
        crossings.length,
        `no drag at ${viewport.width}x${viewport.height} runs from canvas into a HUD island along either axis, so this test cannot exercise the defect. Blocked cells: ${JSON.stringify(
          map.blocked.slice(0, 24),
        )}. If the islands have moved off the tile grid this needs re-deriving, not deleting.`,
      ).toBeGreaterThan(0);

      const control = longestFreeRun(
        map,
        'x',
        crossings.filter((run) => run.axis === 'x').map((run) => run.line),
      );
      expect(
        control,
        `no run of four tiles at ${viewport.width}x${viewport.height} stays on reachable canvas, so there is no control to measure the crossings against.`,
      ).toBeDefined();

      await armBuildable(page, 'wall-brick');

      const report = (run: Run, produced: readonly Record<string, unknown>[]): string =>
        `${viewport.width}x${viewport.height}, along ${run.axis} on line ${run.line}:` +
        ` ${run.from} -> ${run.to} spans ${run.spanned} tile(s)` +
        (run.endsUnder === undefined ? ' and stays on canvas' : ` and ends two tiles inside \`${run.endsUnder}\``) +
        `. Produced ${produced.length}: ${JSON.stringify(
          produced.map((command) => `${String(command['x'])},${String(command['y'])} ${String(command['edge'])}`),
        )}`;

      /*
       * Asserts one run: the count, the tiles and the axis. The count alone
       * would pass on the same number of walls in the wrong places, which is a
       * different defect wearing this one's clothes.
       */
      const assertRunBuilt = async (run: Run): Promise<void> => {
        const produced = await dragAlong(page, centre(run.line, run.from, run.axis), centre(run.line, run.to, run.axis));
        const detail = report(run, produced);
        expect(
          produced.length,
          run.endsUnder === undefined
            ? `the control drag did not build what it drew, so nothing else in this test can be read as evidence about the HUD. ${detail}`
            : `a drag that dipped under a HUD island built fewer walls than it drew, and said nothing. ${detail}`,
        ).toBe(run.spanned);

        const along = produced
          .map((command) => (run.axis === 'x' ? (command['x'] as number) : (command['y'] as number)))
          .sort((left, right) => left - right);
        expect(along, `the run is not the contiguous span the drag covered. ${detail}`).toEqual(
          Array.from({ length: run.spanned }, (_, index) => Math.min(run.from, run.to) + index),
        );
        expect(
          [...new Set(produced.map((command) => command['edge']))],
          `the run changed axis part way. ${detail}`,
        ).toEqual([run.axis === 'x' ? 'north' : 'west']);
      };

      // The control first: if it fails, nothing after it is evidence.
      await assertRunBuilt(control!);
      for (const crossing of crossings) await assertRunBuilt(crossing);

      /*
       * ---- and now the other half of the contract ---------------------
       *
       * A fix that made the drag work by taking the pointer away from the HUD
       * would be a worse defect than the one it closed, so the counter-claims
       * are asserted at every viewport, in the page state the drags just left,
       * rather than once in a test of their own -- they cost six round trips
       * here against a whole page load and a whole prison there.
       *
       * First: a press that *starts* on an island belongs to the island. The
       * gesture is the one a player makes when they mean to scroll the
       * catalogue and overshoot onto the world -- press on the panel, drag off
       * it, release over the map. It must place no wall.
       */
      const list = (await page.locator('.hud-build__list').boundingBox())!;
      const beforeIslandPress = (await sentCommands(page)).length;
      await page.mouse.move(list.x + list.width / 2, list.y + 8);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(list.x - 320, list.y + 8, { steps: 4 });
      await page.mouse.up({ button: 'left' });
      await page.waitForTimeout(400);
      expect(
        (await sentCommands(page)).slice(beforeIslandPress).filter((command) => command['type'] === 'PlaceBuildOrder'),
        `a drag that started on the Build panel placed a wall at ${viewport.width}x${viewport.height}. A press that lands on an island belongs to the island.`,
      ).toEqual([]);

      /*
       * Second: the islands still answer their own clicks. The tab bar is
       * `.hud-tabs__inner`, one of the five selectors in the rule that causes
       * the truncation, and `Remove` is a rail control with a state only the
       * panel can change.
       */
      await tab(page, 'overview').click();
      await expect(page.locator('.ui-tab[data-tab="overview"]')).toHaveAttribute('aria-current', 'true');
      await tab(page, 'build').click();
      await expect(page.locator('.ui-tab[data-tab="build"]')).toHaveAttribute('aria-current', 'true');
      await page.locator('.hud-build__remove').click();
      await expect(page.locator('.hud-build__remove')).toHaveAttribute('aria-pressed', 'true');
      await page.locator('.hud-build__remove').click();
      await expect(page.locator('.hud-build__remove')).toHaveAttribute('aria-pressed', 'false');
    });
  }
});
