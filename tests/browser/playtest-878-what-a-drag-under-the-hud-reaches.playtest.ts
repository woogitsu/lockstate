import { expect, test } from '@playwright/test';
import { TILE, armBuildable, calibrate, installTee, openApp, tab } from './playtest-harness';

/**
 * **What a wall drag can actually reach, and where the moves that carry it
 * go (issue #878).**
 *
 * ## Why this instrument exists rather than a third assertion in the gate
 *
 * `tests/browser/world-scene-drag-under-the-hud.spec.ts` is the gate: it
 * asserts that one drag per axis per viewport builds every tile it drew. That
 * is the contract, and it is deliberately narrow -- three short runs, so it
 * fits a CI budget.
 *
 * This file answers the two questions the gate cannot afford to, and it is a
 * playtest rather than a spec for exactly that reason: nothing in CI collects
 * `*.playtest.ts` (`tests/browser/playwright.playtest.config.ts`), and both
 * questions cost dozens of real drags.
 *
 * 1. **Where does a move that crosses an island go?** The gate can only see
 *    the consequence -- fewer walls than tiles. This instruments the canvas
 *    itself and reports, move by move, what the canvas heard and what
 *    `document.elementFromPoint` says was under the cursor at that instant.
 *    That is the difference between *measuring* the truncation and
 *    *diagnosing* it.
 * 2. **How much of the visible world can a drag build on?** Four numbers,
 *    which are four different things and were conflated once:
 *    - **Press-reachable tiles.** Tile centres where `elementFromPoint` is the
 *      canvas. A property of `hud.css` alone; no renderer change moves it, and
 *      a renderer fix that appeared to move it would be measuring something
 *      else.
 *    - **The largest wholly free rectangle.** The region inside which a drag
 *      of any length in any direction never leaves reachable canvas -- so, on
 *      an unfixed renderer, the region where a drag can be trusted.
 *    - **Drag-reachable tiles.** Measured, not derived: for every row and
 *      every column, a real drag is started on reachable canvas and pulled to
 *      the far edge of the visible world, and the tiles it actually produced
 *      commands for are counted. This one is a weaker discriminator than it
 *      looks and the file says so where it prints it: a drag whose *last* move
 *      lands back on canvas recovers its whole run even unfixed, because the
 *      run is re-derived from the press on every move it does hear.
 *    - **Drawn versus built.** The player-facing number, and the sharp one:
 *      across every drag in the sweep, how many tiles were drawn and how many
 *      walls came back. A drag that builds five of the seven tiles it drew is
 *      the defect, whatever the reachability counts say.
 *
 * ## Reading the output
 *
 * Run it against an unmodified renderer and against the fix, and compare the
 * four numbers and the move log. The first must not move -- the HUD did not --
 * and the last must reach 100%.
 *
 * ## What it costs
 *
 * One page load, one prison, one calibration and about seventy drags. The
 * playtest config gives a test 600 s; this uses a fraction of it on an idle
 * box, and it is not a gate, so a slow run is a slow measurement rather than a
 * red build.
 */

/** One `mousemove` the canvas heard, and what was on top where it happened. */
interface MoveRecord {
  readonly x: number;
  readonly y: number;
  /** `CANVAS`, or the class name of the island `elementFromPoint` returned. */
  readonly over: string;
  readonly target: string;
}

interface ProbeWindow {
  __dragProbeMoves?: MoveRecord[];
  __dragProbeCaptured?: boolean[];
}

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

/**
 * The largest rectangle of tiles every one of whose centres reaches the canvas.
 *
 * This is the number that answers "how much of the world can a drag be trusted
 * in" on an unfixed renderer, and it is much smaller than the count of free
 * tiles: a free tile with an island on both sides of it is reachable by a
 * *press* and useless to a *drag*. Computed by the ordinary largest-rectangle
 * scan -- a histogram of consecutive free rows per column, and a stack over
 * each row -- because the map is small and clarity is worth more here than the
 * asymptotics.
 */
function largestFreeRectangle(
  map: ReachabilityMap,
): { readonly area: number; readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number } {
  const all = [...map.free, ...map.blocked];
  const rows = [...new Set(all.map((cell) => cell.ty))].sort((left, right) => left - right);
  const cols = [...new Set(all.map((cell) => cell.tx))].sort((left, right) => left - right);
  const isFree = new Set(map.free.map((cell) => `${cell.tx},${cell.ty}`));

  let best = { area: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  const heights = new Array<number>(cols.length).fill(0);
  for (const ty of rows) {
    for (let index = 0; index < cols.length; index += 1) {
      heights[index] = isFree.has(`${cols[index]!},${ty}`) ? heights[index]! + 1 : 0;
    }
    // Widest rectangle ending at this row, per left edge.
    for (let left = 0; left < cols.length; left += 1) {
      let minHeight = heights[left]!;
      for (let right = left; right < cols.length; right += 1) {
        minHeight = Math.min(minHeight, heights[right]!);
        if (minHeight === 0) break;
        const area = minHeight * (right - left + 1);
        if (area > best.area) {
          best = { area, x0: cols[left]!, x1: cols[right]!, y0: ty - minHeight + 1, y1: ty };
        }
      }
    }
  }
  return best;
}

test.describe('what a drag under the HUD reaches (#878)', () => {
  test('the moves, the map and the tiles a drag can build on', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[878] ${line}`);
    };

    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();

    /*
     * The "saved" panel is a transient island: it covers four tile centres at
     * the top right for a few seconds after the prison is created, so a map
     * read while it is up is not the map the sweep below runs against. Waited
     * out rather than ignored, so the before and after runs of this file are
     * reading the same page.
     */
    await page.locator('.save-panel').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);

    /*
     * A quarter of a tile is enough: every point below is a tile centre, so an
     * origin known to 16px still names the tile it means with 16px to spare,
     * and it is four presses cheaper per axis than the default. `(700, 300)` is
     * canvas at this config's 1440x900 viewport -- see `calibrate`'s docblock
     * for the viewports where it is not.
     */
    const origin = await calibrate(page, { x: 700, y: 300 }, TILE / 4);
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    log(`origin ${JSON.stringify(origin)}; viewport ${viewport.width}x${viewport.height}`);

    const readMap = async (): Promise<ReachabilityMap> =>
      page.evaluate(
        ({ originX, originY, tile }) => {
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
              if (hit.tagName === 'CANVAS') {
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
        { originX: origin.originX, originY: origin.originY, tile: TILE },
      ) as Promise<ReachabilityMap>;

    const map = await readMap();
    const visible = map.free.length + map.blocked.length;
    const rows = [...new Set([...map.free, ...map.blocked].map((cell) => cell.ty))].sort((l, r) => l - r);
    const cols = [...new Set([...map.free, ...map.blocked].map((cell) => cell.tx))].sort((l, r) => l - r);
    const freeInRow = (ty: number): readonly number[] =>
      map.free.filter((cell) => cell.ty === ty).map((cell) => cell.tx).sort((l, r) => l - r);
    const freeInCol = (tx: number): readonly number[] =>
      map.free.filter((cell) => cell.tx === tx).map((cell) => cell.ty).sort((l, r) => l - r);

    log(`visible rows ${JSON.stringify(rows)}; visible columns ${JSON.stringify(cols)}`);
    for (const ty of rows) {
      const blocked = map.blocked.filter((cell) => cell.ty === ty);
      log(
        `  y=${ty}: press-reachable x ${JSON.stringify(freeInRow(ty))};` +
          ` blocked ${blocked.length} by ${JSON.stringify([...new Set(blocked.map((cell) => cell.by))])}`,
      );
    }
    const rectangle = largestFreeRectangle(map);
    log(`PRESS-REACHABLE TILE CENTRES: ${map.free.length} of ${visible} visible`);
    log(
      `LARGEST WHOLLY FREE RECTANGLE: ${rectangle.area} of ${visible}` +
        ` (x ${rectangle.x0}..${rectangle.x1}, y ${rectangle.y0}..${rectangle.y1})`,
    );

    // ---- instrument the canvas ---------------------------------------------
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas === null) throw new Error('no canvas on the page');
      const probe = window as unknown as ProbeWindow;
      probe.__dragProbeMoves = [];
      probe.__dragProbeCaptured = [];
      canvas.addEventListener('mousemove', (event) => {
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        probe.__dragProbeMoves?.push({
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
          over: hit === null ? 'null' : hit.tagName === 'CANVAS' ? 'CANVAS' : hit.className || hit.tagName,
          target: (event.target as HTMLElement).tagName,
        });
      });
      canvas.addEventListener('pointerdown', (event) => {
        probe.__dragProbeCaptured?.push(canvas.hasPointerCapture(event.pointerId));
      });
    });

    await armBuildable(page, 'wall-brick');

    const point = (tx: number, ty: number): { readonly x: number; readonly y: number } => ({
      x: origin.originX + tx * TILE + TILE / 2,
      y: origin.originY + ty * TILE + TILE / 2,
    });

    /*
     * The sweep below is seventy drags, and the tee's array is a thousand
     * commands long by the end of it. `sentCommands` serialises the whole
     * array over the wire, so calling it twice a drag is most of what this
     * file would cost -- the slice is taken *in the page* instead, and only
     * the handful of commands one drag produced crosses the boundary. Measured
     * on this container: 8.2 min the other way.
     */
    const submittedCount = async (): Promise<number> =>
      page.evaluate(() => ((window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? []).length);
    const placedSince = async (index: number): Promise<readonly Record<string, unknown>[]> =>
      page.evaluate((from) => {
        const raw = (window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker ?? [];
        return raw
          .slice(from)
          .map((message) => message as { kind?: string; payload?: { command?: { data?: Record<string, unknown> } } })
          .filter((message) => message.kind === 'simulation/submit-command')
          .map((message) => message.payload?.command?.data ?? {})
          .filter((data) => data['type'] === 'PlaceBuildOrder');
      }, index);

    /** Drawn tiles and built walls, summed over every drag the sweep performs. */
    let drawnTiles = 0;
    let builtWalls = 0;
    let dragCount = 0;
    const shortfalls: string[] = [];

    /**
     * One drag, the shape a hand makes: press, half way in four steps, the rest
     * in four more, release. The intermediate moves are the whole subject --
     * a single jump to the end has none to lose.
     */
    const drag = async (
      a: { readonly tx: number; readonly ty: number },
      b: { readonly tx: number; readonly ty: number },
    ): Promise<readonly Record<string, unknown>[]> => {
      const from = point(a.tx, a.ty);
      const to = point(b.tx, b.ty);
      const before = await submittedCount();
      await page.evaluate(() => {
        const probe = window as unknown as ProbeWindow;
        probe.__dragProbeMoves = [];
        probe.__dragProbeCaptured = [];
      });
      await page.mouse.move(from.x, from.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
      await page.mouse.move(to.x, to.y, { steps: 4 });
      await page.mouse.up({ button: 'left' });
      // The submission is synchronous with the release; this is the tee's round
      // trip and not a wait on the simulation.
      await page.waitForTimeout(150);
      const placed = await placedSince(before);
      const intent = Math.abs(a.tx === b.tx ? b.ty - a.ty : b.tx - a.tx) + 1;
      drawnTiles += intent;
      builtWalls += placed.length;
      dragCount += 1;
      if (placed.length !== intent) {
        shortfalls.push(`(${a.tx},${a.ty})->(${b.tx},${b.ty}) drew ${intent} got ${placed.length}`);
      }
      return placed;
    };

    // ---- 1. the mechanism, one drag, move by move --------------------------
    //
    // The longest row that starts on reachable canvas and ends two tiles inside
    // the island to its right, so the run cannot be satisfied by a pointer that
    // merely grazed an edge.
    let crossing: { ty: number; from: number; to: number } | undefined;
    for (const ty of rows) {
      const free = freeInRow(ty);
      if (free.length < 5) continue;
      const edge = free[free.length - 1]!;
      const blockedRight =
        map.blocked.some((cell) => cell.ty === ty && cell.tx === edge + 1) &&
        map.blocked.some((cell) => cell.ty === ty && cell.tx === edge + 2);
      if (!blockedRight) continue;
      crossing = { ty, from: edge - 4, to: edge + 2 };
      break;
    }
    expect(crossing, 'no row on this page runs from reachable canvas into a HUD island').toBeDefined();

    const intended = crossing!.to - crossing!.from + 1;
    const produced = await drag({ tx: crossing!.from, ty: crossing!.ty }, { tx: crossing!.to, ty: crossing!.ty });
    const moves = await page.evaluate(() => (window as unknown as ProbeWindow).__dragProbeMoves ?? []);
    const captured = await page.evaluate(() => (window as unknown as ProbeWindow).__dragProbeCaptured ?? []);
    log(`MECHANISM DRAG: row ${crossing!.ty}, x ${crossing!.from} -> ${crossing!.to}, ${intended} tile(s) drawn`);
    log(`  canvas held pointer capture at pointerdown: ${JSON.stringify(captured)}`);
    log(`  the canvas heard ${moves.length} mousemove(s):`);
    for (const move of moves) {
      log(`    (${move.x},${move.y}) target=${move.target} elementFromPoint=${move.over}`);
    }
    log(
      `  moves delivered to the canvas while the cursor was over an island: ` +
        `${moves.filter((move) => move.over !== 'CANVAS').length}`,
    );
    log(
      `  COMMANDS: ${produced.length} of ${intended} intended -> ` +
        JSON.stringify(produced.map((command) => `${String(command['x'])},${String(command['y'])} ${String(command['edge'])}`)),
    );

    // The mechanism drag above is reported on its own terms; the fidelity
    // counters below are the sweep's, so they start here.
    drawnTiles = 0;
    builtWalls = 0;
    dragCount = 0;
    shortfalls.length = 0;

    // ---- 2. every row and every column, to the far edge --------------------
    //
    // A drag along a row produces one command per column it spanned; a drag
    // down a column produces one per row. Two drags a line -- outward from the
    // free tile nearest each end -- so their union is the whole visible line
    // whenever the moves survive the crossing. A line with no free tile at all
    // cannot be started on and is counted as reaching nothing, which is the
    // truthful answer for it.
    const reachedByRowDrag = new Set<string>();
    for (const ty of rows) {
      const free = freeInRow(ty);
      if (free.length === 0) {
        log(`  row ${ty}: no press-reachable tile, so no drag can start on it`);
        continue;
      }
      const first = cols[0]!;
      const last = cols[cols.length - 1]!;
      for (const [start, end] of [
        [free[0]!, last],
        [free[free.length - 1]!, first],
      ] as const) {
        if (start === end) continue;
        const commands = await drag({ tx: start, ty }, { tx: end, ty });
        for (const command of commands) reachedByRowDrag.add(`${String(command['x'])},${ty}`);
      }
    }
    const reachedByColumnDrag = new Set<string>();
    for (const tx of cols) {
      const free = freeInCol(tx);
      if (free.length === 0) {
        log(`  column ${tx}: no press-reachable tile, so no drag can start on it`);
        continue;
      }
      const first = rows[0]!;
      const last = rows[rows.length - 1]!;
      for (const [start, end] of [
        [free[0]!, last],
        [free[free.length - 1]!, first],
      ] as const) {
        if (start === end) continue;
        const commands = await drag({ tx, ty: start }, { tx, ty: end });
        for (const command of commands) reachedByColumnDrag.add(`${tx},${String(command['y'])}`);
      }
    }

    // Edge coordinates can land one outside the visible grid -- the north edge
    // of the row below the last visible one is a real edge -- so the counts are
    // taken over visible tiles only.
    const inVisible = (key: string): boolean => {
      const [left, right] = key.split(',').map((part) => Number(part));
      return cols.includes(left!) && rows.includes(right!);
    };
    const rowReached = [...reachedByRowDrag].filter((key) => inVisible(key));
    const columnReached = [...reachedByColumnDrag].filter((key) => inVisible(key));
    const union = new Set([...rowReached, ...columnReached]);
    log(`DRAG-REACHABLE BY A ROW DRAG: ${rowReached.length} of ${visible} visible tiles`);
    log(`DRAG-REACHABLE BY A COLUMN DRAG: ${columnReached.length} of ${visible} visible tiles`);
    log(`DRAG-REACHABLE TILES (either axis): ${union.size} of ${visible} visible`);
    const unreached = [...map.free, ...map.blocked]
      .filter((cell) => !union.has(`${cell.tx},${cell.ty}`))
      .map((cell) => `${cell.tx},${cell.ty}`);
    log(`NOT REACHED BY ANY DRAG: ${unreached.length} -> ${JSON.stringify(unreached.slice(0, 40))}`);
    log(
      `DRAWN vs BUILT over ${dragCount} drags: ${drawnTiles} tile(s) drawn, ${builtWalls} wall(s) placed` +
        ` (${((100 * builtWalls) / Math.max(1, drawnTiles)).toFixed(1)}%)`,
    );
    log(`DRAGS THAT BUILT LESS THAN THEY DREW: ${shortfalls.length} of ${dragCount}`);
    for (const line of shortfalls) log(`    ${line}`);

    // ---- 3. did the HUD move while we measured? ----------------------------
    //
    // A thousand refused orders put lines in the Build panel and rows in the
    // alerts list, either of which could change the geometry the map above
    // recorded. Re-read it, so a drifted map is a reported fact rather than a
    // silent one.
    const after = await readMap();
    const drifted = after.free.length !== map.free.length || after.blocked.length !== map.blocked.length;
    log(
      `MAP AFTER THE SWEEP: ${after.free.length} free / ${after.blocked.length} blocked` +
        ` (${drifted ? 'DRIFTED -- read the numbers above with that in mind' : 'unchanged'})`,
    );
  });
});
