import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { APP_URL, TILE, calibrate, currentTick, panelText, sentCommands, tab, type TeeWindow } from './playtest-harness';

/**
 * **How long, to the tenth of a second, between the simulation finishing a
 * door and the renderer holding it?**
 *
 * ## Why this exists beside
 * ## `playtest-1027-what-a-finished-door-is-drawn-as.playtest.ts`
 *
 * That instrument is the one that found the defect and it samples the *screen*
 * — which is the ground truth, and which is also why it cannot resolve what
 * ADR 0099 leaves behind. Each of its samples takes two WebGL screenshots, and
 * under this container's software rasteriser each screenshot stalls on
 * `ReadPixels`: measured on 2026-09-06, a run of it took **fifteen samples in
 * two acts**, so consecutive samples are two to four seconds apart. Against a
 * 22–28 second window that is fine. Against a window ADR 0099 predicts at
 * under 200 ms it is not: re-run on the branch that implements the ADR, it
 * reported 4,062 ms, and every millisecond of that is the gap between two of
 * its own samples rather than anything the renderer did.
 *
 * So this instrument measures the same window with **no screenshot in the
 * loop**. It polls the Build panel's text and the worker tee every 100 ms,
 * both of which are DOM and array reads, and it takes exactly two screenshots
 * — at the end — to confirm that the frame it timed really is the finished
 * door on the screen.
 *
 * ## What it times, and against what clock
 *
 * One page clock, `performance.now()`, for everything:
 *
 * - **the Build panel stops listing the order** — the moment a player is told
 *   in words that the queue is empty. Polled at 100 ms; the panel itself
 *   refreshes on the clock heartbeat, so this is bounded below by that.
 * - **a `simulation/snapshot` the render feed asked for reports the order
 *   `completed`** — the moment `SimulationSnapshotFeed.apply` can build a
 *   frame in which the door is `built`. Timestamped in the tee at the instant
 *   the message arrives, so this one is exact rather than polled. The
 *   `forRenderer` join is the same one the #1027 instrument makes and for the
 *   same reason: the local save asks for snapshots of its own and the feed
 *   discards them.
 * - **the drawn world's marker moves** — ADR 0099's notification, read out of
 *   `u32[4]` of every `simulation/delta` buffer. This is the cause; the two
 *   above are the effect either side of it.
 *
 * **The window a player sees is the second minus the first.** It is what
 * `docs/research/2026-09-06-what-a-finished-door-is-drawn-as.md` measured at
 * 22.0, 25.8, 26.1, 27.6 and 28.0 seconds, and what ADR 0099 exists to close.
 * It can legitimately come out *negative*: the renderer learns from the
 * simulation directly now, while the panel waits for a heartbeat.
 *
 * ## Not a gate
 *
 * `*.playtest.ts` is collected by `tests/browser/playwright.playtest.config.ts`
 * and nothing in CI runs it. The gate that keeps this closed is
 * `tests/integration/a-finished-build-reaches-the-drawn-frame.test.ts`.
 */

const OUT = 'docs/research/2026-09-06-what-a-finished-door-is-drawn-as/after-adr-0099';

/** `door-wooden`'s slab colours, from `src/rendering/world/appearance.ts`. */
const DOOR_SIDE_FILL: readonly [number, number, number] = [0x7c, 0x60, 0x37];

interface OrderDigest {
  readonly id: string;
  readonly definitionId: string;
  readonly state: string;
  readonly x: number;
  readonly y: number;
}

interface SnapshotDigest {
  readonly t: number;
  readonly tick: number;
  readonly forRenderer: boolean;
  readonly orders: readonly OrderDigest[];
}

interface DeltaDigest {
  readonly t: number;
  readonly tick: number;
  /** `u32[4]`: ADR 0099's marker, read straight off the bytes. */
  readonly worldRevision: number;
}

interface Watch1037Window extends TeeWindow {
  lockstate1037Snapshots?: SnapshotDigest[];
  lockstate1037Deltas?: DeltaDigest[];
}

/**
 * A worker tee that keeps a digest of both channels this question is about.
 *
 * The delta buffer is read by literal offset rather than by importing the
 * production decoder, the same discipline `tests/helpers/render-actors-reader.ts`
 * keeps: `u32[4]`, little-endian, four bytes a word. A page init script cannot
 * import from `src/` anyway, which is why the constant is written out.
 */
async function installTees(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    const snapshots: SnapshotDigest[] = [];
    const deltas: DeltaDigest[] = [];
    const rendererRequests = new Set<string>();
    /** `u32[4]`. Five-word header since ADR 0099; four before it. */
    const WORLD_REVISION_BYTE_OFFSET = 16;
    interface TeedMessage {
      kind?: string;
      replyTo?: string;
      payload?: {
        tick?: number;
        delta?: { contentType?: string; data?: ArrayBuffer };
        snapshot?: {
          data?: {
            construction?: { orders?: { id: string; definitionId: string; state: string; location: { x: number; y: number } }[] };
          };
        };
      };
    }
    class TeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as TeedMessage;
          const kind = data.kind ?? '';
          if (kind === 'simulation/snapshot') {
            const orders = data.payload?.snapshot?.data?.construction?.orders ?? [];
            snapshots.push({
              t: performance.now(),
              tick: data.payload?.tick ?? -1,
              forRenderer: data.replyTo !== undefined && rendererRequests.has(data.replyTo),
              orders: orders.map((order) => ({
                id: order.id,
                definitionId: order.definitionId,
                state: order.state,
                x: order.location.x,
                y: order.location.y,
              })),
            });
            if (snapshots.length > 400) snapshots.shift();
            return;
          }
          if (kind === 'simulation/delta') {
            const buffer = data.payload?.delta?.data;
            if (buffer !== undefined && buffer.byteLength > WORLD_REVISION_BYTE_OFFSET + 3) {
              deltas.push({
                t: performance.now(),
                tick: data.payload?.tick ?? -1,
                worldRevision: new DataView(buffer).getUint32(WORLD_REVISION_BYTE_OFFSET, true),
              });
              if (deltas.length > 4_000) deltas.shift();
            }
            return;
          }
          if (kind === 'simulation/projection') return;
          received.push(event.data);
        });
      }

      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        const request = message as { kind?: string; messageId?: string; payload?: { reason?: string } };
        if (
          request.kind === 'simulation/request-snapshot' &&
          request.payload?.reason === 'consistency-check' &&
          request.messageId !== undefined
        ) {
          rendererRequests.add(request.messageId);
        }
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = TeeWorker as unknown as typeof Worker;
    const target = window as unknown as Watch1037Window;
    target.lockstateSentToWorker = sent;
    target.lockstateFromWorker = received;
    target.lockstate1037Snapshots = snapshots;
    target.lockstate1037Deltas = deltas;
  });
}

/**
 * The colour of one screen pixel, straight out of the compositor.
 *
 * Copied from the #1027 instrument, which explains at length why
 * `page.screenshot` is the only route: the Phaser canvas is WebGL without
 * `preserveDrawingBuffer`, so `getImageData` on it reads a cleared buffer.
 * Called twice in this file, both after the timing is over.
 */
async function pixelAt(page: Page, x: number, y: number): Promise<readonly [number, number, number]> {
  const png = await page.screenshot({ clip: { x: x - 1, y: y - 1, width: 3, height: 3 } });
  return page.evaluate(async (data) => {
    const response = await fetch(`data:image/png;base64,${data}`);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no 2d context to decode the screenshot with');
    context.drawImage(bitmap, 0, 0);
    const pixel = context.getImageData(1, 1, 1, 1).data;
    return [pixel[0] ?? -1, pixel[1] ?? -1, pixel[2] ?? -1] as [number, number, number];
  }, png.toString('base64'));
}

/** The alpha `fill` would have to have been drawn at over `background` to give `sample`, or `undefined`. */
function alphaOf(
  sample: readonly [number, number, number],
  fill: readonly [number, number, number],
  background: readonly [number, number, number],
): number | undefined {
  const solved: number[] = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const target = fill[channel] as number;
    const base = background[channel] as number;
    if (Math.abs(target - base) < 8) continue;
    solved.push(((sample[channel] as number) - base) / (target - base));
  }
  if (solved.length === 0) return undefined;
  const mean = solved.reduce((total, value) => total + value, 0) / solved.length;
  for (const value of solved) if (Math.abs(value - mean) > 0.15) return undefined;
  return mean;
}

test('how long between the simulation finishing a door and the renderer holding it (#1037)', async ({ page }) => {
  test.setTimeout(600_000);
  const log: string[] = [];
  const say = (line: string): void => {
    log.push(line);
    console.log(line);
  };

  const console_: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('%c %c %c Phaser')) return;
    console_.push(`${message.type()}: ${text}`);
  });

  await installTees(page);
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud-clock__day').first().waitFor();

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  const tileX = Math.floor((700 - origin.originX) / TILE);
  const tileY = Math.floor((300 - origin.originY) / TILE);
  const tileLeft = origin.originX + tileX * TILE;
  const tileTop = origin.originY + tileY * TILE;
  const centre = { x: Math.round(tileLeft + TILE / 2), y: Math.round(tileTop + TILE / 2) };
  const north = { x: centre.x, y: Math.round(tileTop + 6) };
  say(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  say(`door tile (${tileX},${tileY}); centre probe ${JSON.stringify(centre)}; north probe ${JSON.stringify(north)}`);

  const floorAtCentre = await pixelAt(page, centre.x, centre.y);
  say(`this tile's own bare floor at the centre probe: ${JSON.stringify(floorAtCentre)}`);

  await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill('1');
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(300);

  const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (armLabel.startsWith('place') || armLabel.startsWith('draw')) await page.locator('.hud-build__arm').click();

  const before = (await sentCommands(page)).length;
  await page.mouse.move(centre.x, tileTop + 6);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(200);
  const produced = (await sentCommands(page)).slice(before);
  const order = produced.find((command) => command['definitionId'] === 'door-wooden');
  if (order === undefined) throw new Error(`no door-wooden PlaceBuildOrder: ${JSON.stringify(produced)}`);
  const doorTile = { x: order['x'] as number, y: order['y'] as number };
  say(`VERIFIED placed: definitionId=${String(order['definitionId'])} at (${String(doorTile.x)},${String(doorTile.y)}) edge=${String(order['edge'])}`);

  /*
   * NOTHING IS PRESSED FROM HERE UNTIL THE WINDOW HAS BEEN MEASURED.
   *
   * Every accepted command is one of the five `dirty` marks that predate ADR
   * 0099, so a second gesture inside the loop would measure the gesture.
   */
  await page.locator('.hud-strip__transport button').nth(1).click();
  const startedAt = await page.evaluate(() => performance.now());
  say(`clock started at page t=${startedAt.toFixed(1)}ms, tick ${await currentTick(page)}`);

  let queueEmptyAt: number | undefined;
  let completedSnapshotAt: number | undefined;
  let completedSnapshotTick = -1;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (Date.now() > deadline) break;
    const now = await page.evaluate(() => performance.now());
    if (queueEmptyAt === undefined) {
      const queue = (await panelText(page, '.hud-build__queue')).replace(/\n/g, ' | ');
      if (/(?<![0-9])0 waiting . 0 being built/.test(queue) || queue.includes('not laid out')) {
        queueEmptyAt = now;
        say(`the Build panel stopped listing the order at t+${(now - startedAt).toFixed(0)}ms — queue reads: ${queue}`);
      }
    }
    if (completedSnapshotAt === undefined) {
      const digests = await page.evaluate(() => (window as unknown as Watch1037Window).lockstate1037Snapshots ?? []);
      const hit = digests.find(
        (digest) =>
          digest.forRenderer &&
          digest.orders.some((entry) => entry.x === doorTile.x && entry.y === doorTile.y && entry.state === 'completed'),
      );
      if (hit !== undefined) {
        completedSnapshotAt = hit.t;
        completedSnapshotTick = hit.tick;
        say(
          `the render feed's own snapshot first reported the door "completed" at t+${(hit.t - startedAt).toFixed(0)}ms, tick ${String(hit.tick)}`,
        );
      }
    }
    if (queueEmptyAt !== undefined && completedSnapshotAt !== undefined) break;
    await page.waitForTimeout(100);
  }

  say('---');
  if (queueEmptyAt === undefined || completedSnapshotAt === undefined) {
    say(`INCOMPLETE: queueEmptyAt=${String(queueEmptyAt)} completedSnapshotAt=${String(completedSnapshotAt)}`);
  } else {
    const window_ = completedSnapshotAt - queueEmptyAt;
    say(
      `THE WINDOW A PLAYER SEES: ${window_.toFixed(0)}ms between the Build panel saying the queue is empty` +
        ` and the renderer holding a world in which the door is built` +
        (window_ < 0 ? ' (negative: the renderer learned first)' : ''),
    );
  }

  // ADR 0099's notification, and what it cost on the wire.
  const deltas = await page.evaluate(() => (window as unknown as Watch1037Window).lockstate1037Deltas ?? []);
  const moves: DeltaDigest[] = [];
  let previous: number | undefined;
  for (const delta of deltas) {
    if (previous !== undefined && delta.worldRevision !== previous) moves.push(delta);
    previous = delta.worldRevision;
  }
  say('---');
  say(`deltas seen: ${String(deltas.length)}; the drawn world's marker moved on ${String(moves.length)} of them`);
  for (const move of moves.slice(0, 12)) {
    say(`  t+${(move.t - startedAt).toFixed(0)}ms tick ${String(move.tick)} marker -> ${String(move.worldRevision)}`);
  }
  const allSnapshots = await page.evaluate(() => (window as unknown as Watch1037Window).lockstate1037Snapshots ?? []);
  say(
    `snapshots on the wire: ${String(allSnapshots.length)}, of which ${String(allSnapshots.filter((digest) => digest.forRenderer).length)} were the render feed's`,
  );

  // Only now, with the timing over, does anything stall on ReadPixels.
  const centreColour = await pixelAt(page, centre.x, centre.y);
  const northColour = await pixelAt(page, north.x, north.y);
  const alpha = alphaOf(centreColour, DOOR_SIDE_FILL, floorAtCentre);
  say('---');
  say(
    `the screen, after the window closed: centre=${JSON.stringify(centreColour)}` +
      ` slabAlpha=${alpha === undefined ? 'no-slab' : alpha.toFixed(2)} north=${JSON.stringify(northColour)}`,
  );
  say(
    alpha === undefined || alpha < 0.1
      ? 'the tile centre carries no construction slab: the door is on screen as its edge, which is what the timing above claimed'
      : 'A SLAB IS STILL ON THE TILE — the timing above measured a frame the painter has not drawn',
  );
  say(`last render-feed snapshot tick that reported the door completed: ${String(completedSnapshotTick)}`);

  say('---');
  say(`console lines other than Phaser's banner: ${String(console_.length)}`);
  for (const line of console_.slice(0, 20)) say(`  ${line}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/log.txt`, `${log.join('\n')}\n`);
  writeFileSync(`${OUT}/deltas.json`, `${JSON.stringify({ startedAt, deltas, moves }, null, 2)}\n`);
});
