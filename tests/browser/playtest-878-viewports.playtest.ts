import { expect, test, type Page } from '@playwright/test';
import { TILE, armBuildable, calibrate, installTee, openApp, tab } from './playtest-harness';

/**
 * **How much of the world a drag reaches, across the five viewports this
 * repository already tests (issue #878).**
 *
 * ## Why a table and not a number
 *
 * The HUD is a frame of roughly fixed pixel width around a playfield that
 * shrinks with the window, so *the reachable share of the world is a function
 * of viewport size* -- and a single headline figure for it is therefore a
 * figure about one window. Two measurements of "reachable tiles at 1440x900"
 * taken on the same tree by different instruments disagreed by 8 tiles on
 * 2026-09-03, and a third figure from a killed pass disagreed with both by a
 * hundred. This file exists so the answer is a table with the viewport in every
 * row, and so the disagreement is visible rather than averaged.
 *
 * The five viewports are the set `tests/browser/ui-shell.spec.ts` already uses
 * for its fold coverage (`CATALOGUE_VIEWPORTS`, `COVERAGE_VIEWPORTS`,
 * `ROOMS_VIEWPORTS`), reused rather than invented so this table lines up with
 * the layout coverage that exists.
 *
 * **375x812 is in the set and is a phone.** A mouse drag is not the gesture a
 * player makes there, and touch never had this defect -- `TouchManager`
 * registers `touchmove` on the same canvas and the Touch Events specification
 * captures a sequence to the element its `touchstart` hit. It is measured
 * anyway, and labelled, because a row that says "the mouse cannot do much
 * here" is worth more than a missing row.
 *
 * ## Two drags a viewport, and the second one is about somebody else's defect
 *
 * A tile *centre* is equidistant from the two edges either side of it, so a
 * press there lands exactly on the mid-line where `pickEdgeOnAxis`'s tie-break
 * decides which of the two parallel edge lines a run lies on. That tie-break is
 * a live defect of its own on `fix/886-four-drags-enclose-a-room` -- a drag
 * resolves the mid-line away from the pressed tile while a click resolves it
 * towards it -- and it is not this branch's to fix.
 *
 * It also cannot affect what this branch measures, and the second drag is how
 * that is shown rather than argued: it repeats the first with the *fixed* axis
 * moved a quarter of a tile off the mid-line, which removes the tie entirely.
 * The tie chooses the edge *line*; the count of segments and the coordinates
 * along the run come from the along-axis, which has no tie at a tile centre.
 * If the two drags produce the same count and the same along-axis
 * coordinates, differing only in the edge row, the tie-break is not in this
 * measurement. Where the counts differ the pair is not controlled -- a quarter
 * tile is also 16px of real space, and 16px can carry the line clear of the
 * island -- and the file says so where it prints it.
 *
 * ## The one number that does not depend on a calibrated origin
 *
 * Every tile count here is sampled on a grid whose phase comes from the
 * calibration bisection, and the phase matters: two runs of the same method on
 * the same tree read 198 and 202 free tile centres at 1440x900 purely because
 * they started the bisection from different squares, and a third measurement
 * elsewhere read 194. So this file also reports the **canvas share of the
 * viewport** on a fixed 16px grid, with no origin in it, which is the figure to
 * compare when the tile counts disagree.
 */

const CANVAS = 'CANVAS';

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 900, height: 600 },
  { width: 375, height: 812 },
] as const;

interface Cell {
  readonly tx: number;
  readonly ty: number;
}
interface BlockedCell extends Cell {
  readonly by: string;
}
interface ReachabilityMap {
  readonly free: readonly Cell[];
  readonly blocked: readonly BlockedCell[];
}

/** A 64x64 square of reachable canvas nearest the viewport centre, or none. */
async function freeSquare(page: Page): Promise<{ readonly x: number; readonly y: number } | undefined> {
  return page.evaluate(
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
      return best === undefined ? undefined : { x: best.x, y: best.y };
    },
    { tile: TILE, canvasTag: CANVAS },
  );
}

function largestFreeRectangle(map: ReachabilityMap): { readonly area: number; readonly label: string } {
  const all = [...map.free, ...map.blocked];
  const rows = [...new Set(all.map((cell) => cell.ty))].sort((l, r) => l - r);
  const cols = [...new Set(all.map((cell) => cell.tx))].sort((l, r) => l - r);
  const isFree = new Set(map.free.map((cell) => `${cell.tx},${cell.ty}`));
  let best = { area: 0, label: 'none' };
  const heights = new Array<number>(cols.length).fill(0);
  for (const ty of rows) {
    for (let index = 0; index < cols.length; index += 1) {
      heights[index] = isFree.has(`${cols[index]!},${ty}`) ? heights[index]! + 1 : 0;
    }
    for (let left = 0; left < cols.length; left += 1) {
      let minHeight = heights[left]!;
      for (let right = left; right < cols.length; right += 1) {
        minHeight = Math.min(minHeight, heights[right]!);
        if (minHeight === 0) break;
        const area = minHeight * (right - left + 1);
        if (area > best.area) {
          best = {
            area,
            label: `x ${cols[left]!}..${cols[right]!}, y ${ty - minHeight + 1}..${ty}`,
          };
        }
      }
    }
  }
  return best;
}

test.describe('what a drag reaches, viewport by viewport (#878)', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}x${viewport.height}`, async ({ page }) => {
      const tag = `${viewport.width}x${viewport.height}`;
      const log = (line: string): void => {
        console.log(`[878v] ${tag} ${line}`);
      };

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installTee(page);
      await openApp(page);
      await page.getByRole('button', { name: 'New prison' }).click();
      await expect(page.locator('.hud-clock__day')).toHaveText('1');
      await tab(page, 'build').click();

      /*
       * A calibration-independent measure, taken first and reported for every
       * viewport including the one where nothing else can be.
       *
       * Every tile-grid measurement below depends on the calibrated origin, and
       * the origin depends on which square the bisection started from: two runs
       * of the same instrument on the same tree, differing only in that, read
       * 198 and 202 free tile centres at 1440x900 -- because a grid shifted a
       * few pixels samples the panel edges differently. This one has no origin
       * in it. It is the number to compare across viewports and across trees
       * when the tile counts disagree.
       */
      const share = await page.evaluate(
        ({ canvasTag }) => {
          let canvasPoints = 0;
          let points = 0;
          for (let y = 8; y < window.innerHeight; y += 16) {
            for (let x = 8; x < window.innerWidth; x += 16) {
              points += 1;
              if (document.elementFromPoint(x, y)?.tagName === canvasTag) canvasPoints += 1;
            }
          }
          return { canvasPoints, points };
        },
        { canvasTag: CANVAS },
      );
      log(
        `CANVAS SHARE OF THE VIEWPORT (16px grid, no calibration): ${share.canvasPoints} of ${share.points} ` +
          `(${((100 * share.canvasPoints) / Math.max(1, share.points)).toFixed(1)}%)`,
      );

      const square = await freeSquare(page);
      if (square === undefined) {
        log('NO 64x64 SQUARE OF REACHABLE CANVAS -- there is nowhere to calibrate from, so no tile measurement follows');
        return;
      }
      const origin = await calibrate(page, square, TILE / 4);
      log(`origin ${JSON.stringify(origin)}; calibration square ${JSON.stringify(square)}`);

      const map = (await page.evaluate(
        ({ originX, originY, tile, canvasTag }) => {
          const free: Cell[] = [];
          const blocked: BlockedCell[] = [];
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
        { originX: origin.originX, originY: origin.originY, tile: TILE, canvasTag: CANVAS },
      )) as ReachabilityMap;

      const visible = map.free.length + map.blocked.length;
      const rows = [...new Set([...map.free, ...map.blocked].map((cell) => cell.ty))].sort((l, r) => l - r);
      const rectangle = largestFreeRectangle(map);
      const owners = new Map<string, number>();
      for (const cell of map.blocked) owners.set(cell.by, (owners.get(cell.by) ?? 0) + 1);
      log(
        `PRESS-REACHABLE ${map.free.length} of ${visible} visible ` +
          `(${((100 * map.free.length) / Math.max(1, visible)).toFixed(1)}%)`,
      );
      log(`LARGEST WHOLLY FREE RECTANGLE ${rectangle.area} of ${visible} (${rectangle.label})`);
      log(`WHAT TAKES THE POINTER ${JSON.stringify([...owners.entries()].sort((l, r) => r[1] - l[1]))}`);

      // The longest row that starts on reachable canvas and ends two tiles
      // inside the island to its right or to its left.
      let crossing: { line: number; from: number; to: number; by: string } | undefined;
      for (const ty of rows) {
        const free = map.free.filter((cell) => cell.ty === ty).map((cell) => cell.tx).sort((l, r) => l - r);
        if (free.length < 3) continue;
        for (const direction of [1, -1] as const) {
          const edge = direction === 1 ? free[free.length - 1]! : free[0]!;
          const near = map.blocked.find((cell) => cell.ty === ty && cell.tx === edge + direction);
          const far = map.blocked.find((cell) => cell.ty === ty && cell.tx === edge + 2 * direction);
          if (near === undefined || far === undefined) continue;
          let start = edge;
          while (Math.abs(start - edge) < 4 && free.includes(start - direction)) start -= direction;
          const spanned = Math.abs(edge + 2 * direction - start) + 1;
          if (spanned < 4) continue;
          if (crossing === undefined || spanned > Math.abs(crossing.to - crossing.from) + 1) {
            crossing = { line: ty, from: start, to: edge + 2 * direction, by: far.by };
          }
        }
      }
      if (crossing === undefined) {
        log('NO ROW RUNS FROM REACHABLE CANVAS INTO AN ISLAND -- no crossing drag to measure here');
        return;
      }

      await armBuildable(page, 'wall-brick');
      let submitted = await page.evaluate(
        () => ((window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? []).length,
      );
      const dragRow = async (line: number, from: number, to: number, offsetY: number): Promise<readonly Record<string, unknown>[]> => {
        const y = origin.originY + line * TILE + offsetY;
        const ax = origin.originX + from * TILE + TILE / 2;
        const bx = origin.originX + to * TILE + TILE / 2;
        await page.mouse.move(ax, y);
        await page.mouse.down({ button: 'left' });
        await page.mouse.move((ax + bx) / 2, y, { steps: 4 });
        await page.mouse.move(bx, y, { steps: 4 });
        await page.mouse.up({ button: 'left' });
        await page.waitForTimeout(300);
        const read = await page.evaluate((index) => {
          const raw = (window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? [];
          const placed = raw
            .slice(index)
            .map((message) => message as { kind?: string; payload?: { command?: { data?: Record<string, unknown> } } })
            .filter((message) => message.kind === 'simulation/submit-command')
            .map((message) => message.payload?.command?.data ?? {})
            .filter((data) => data['type'] === 'PlaceBuildOrder');
          return { placed, length: raw.length };
        }, submitted);
        submitted = read.length;
        return read.placed;
      };

      const intended = Math.abs(crossing.to - crossing.from) + 1;
      // On the mid-line, which is where every tile centre is.
      const onMidLine = await dragRow(crossing.line, crossing.from, crossing.to, TILE / 2);
      // A quarter of a tile off it, so `pickEdgeOnAxis` has no tie to break.
      const offMidLine = await dragRow(crossing.line, crossing.from, crossing.to, TILE / 4);
      log(
        `CROSSING DRAG row ${crossing.line}, x ${crossing.from} -> ${crossing.to},` +
          ` ${intended} tile(s) drawn, ends two tiles inside \`${crossing.by}\``,
      );
      log(
        `  at the tile centre (on the mid-line): built ${onMidLine.length} of ${intended} -> ` +
          JSON.stringify(onMidLine.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`)),
      );
      log(
        `  a quarter tile off the mid-line:      built ${offMidLine.length} of ${intended} -> ` +
          JSON.stringify(offMidLine.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`)),
      );
      /*
       * What the pair does and does not settle.
       *
       * It settles that the mid-line tie-break sets the perpendicular edge
       * *line* and not the count: the two runs above come back with the same
       * along-axis coordinates and an edge row one apart -- `away` from the
       * pressed tile on the mid-line, `towards` it off the mid-line, which is
       * the asymmetry issue #886's branch is fixing in `pickEdgeOnAxis`. The
       * count comes from the along-axis, where a tile centre has no tie.
       *
       * It does **not** settle it at a viewport where the counts differ,
       * because the second drag is not a controlled comparison: moving the
       * fixed axis a quarter tile also moves the drag 16px through real space,
       * and 16px can take the whole line clear of the island it was supposed to
       * cross. A differing count here means "these two drags did not meet the
       * same island", not "the tie-break changed the answer" -- read the edge
       * rows and the map above before concluding anything from it.
       */
      const alongOf = (commands: readonly Record<string, unknown>[]): readonly number[] =>
        commands.map((command) => command['x'] as number);
      log(
        `  same along-axis coordinates: ${JSON.stringify(alongOf(onMidLine)) === JSON.stringify(alongOf(offMidLine)) ? 'yes' : 'no'};` +
          ` same count: ${onMidLine.length === offMidLine.length ? 'yes' : 'no'}` +
          `${onMidLine.length === offMidLine.length ? '' : ' -- NOT a controlled pair, see the note above this line in the source'}`,
      );
    });
  }
});
