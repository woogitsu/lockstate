import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { APP_URL, TILE, calibrate, currentTick, panelText, sentCommands, tab, type TeeWindow } from './playtest-harness';

/**
 * **What is a door drawn as, in the seconds after the simulation finishes it?**
 *
 * Issue #1027 argues a completed door is painted as a full-tile **opaque**
 * slab, because `tile-layer.ts`'s duplicate-suppression guard is conjunctive --
 * `isDrawnAsWorldEdge(structure) && edgeTileXs.has(structure.tileX)` -- and the
 * renderer's edge layer is fed by a channel that no build completion marks
 * dirty. That is a code-path argument and the issue says so: *"The reproduction
 * is the first thing to do here."* This is that reproduction, played rather
 * than reasoned about.
 *
 * ## What it measures, and why the tile centre is the discriminator
 *
 * A construction slab covers the whole tile. The edge bar a finished door is
 * drawn as is a fifth of a tile deep at the tile's northern boundary and does
 * not reach the tile's centre. So the centre pixel separates every state that
 * matters, and the alpha it is drawn at separates the rest:
 *
 * - the tile's own bare floor  -> no construction slab; the door is an edge
 * - door side fill at ~0.35    -> `PLANNED_ALPHA`, the ordered ghost
 * - door side fill at ~0.65    -> `BUILDING_ALPHA`, the under-construction ghost
 * - door side fill at ~1.00    -> #1027's opaque slab
 *
 * The **side** fill and not the top fill, because a slab fakes height by
 * lifting its top face north by `heightTiles` and filling the gap below with a
 * side face: `door-wooden` is 0.55 tiles tall, so the top face ends 28.8 px
 * into a 64 px tile and the centre at +32 px is side face. A second probe six
 * pixels below the tile's northern boundary reads the same colours from the
 * other direction and is what says the finished door really is on screen.
 *
 * The background every alpha is solved against is **this tile's own floor,
 * sampled before anything was ordered on it**, not a neighbour's: the floor is
 * drawn in two alternating shades, so a neighbouring tile is the wrong
 * background by about four counts per channel and turns 0.35 into 0.09.
 *
 * ## Not a gate
 *
 * `*.playtest.ts` is collected by `tests/browser/playwright.playtest.config.ts`
 * and nothing in CI runs it. Its output is the evidence, and the findings live
 * in `docs/research/2026-09-06-what-a-finished-door-is-drawn-as.md`.
 */

const OUT = 'docs/research/2026-09-06-what-a-finished-door-is-drawn-as';

/** `door-wooden`'s slab colours, from `src/rendering/world/appearance.ts`. */
const DOOR_TOP_FILL: readonly [number, number, number] = [0xb0, 0x8a, 0x4f];
const DOOR_SIDE_FILL: readonly [number, number, number] = [0x7c, 0x60, 0x37];

interface SnapshotDigest {
  readonly t: number;
  readonly tick: number;
  /**
   * Whether this snapshot is the *renderer's*.
   *
   * Not every `simulation/snapshot` on the wire feeds a frame. The feed
   * discards any reply it did not ask for -- `if (message.replyTo !==
   * this.pendingMessageId) return; // Somebody else's snapshot (a save).`
   * (`src/rendering/feed/simulation-snapshot-feed.ts:323`) -- and the local
   * save asks for one of its own. A run measured on 2026-09-06 had a snapshot
   * reporting the door `completed` arrive on the wire twenty-five seconds
   * before the tile stopped being a ghost, which reads as a contradiction
   * until this field says the snapshot was not the renderer's.
   *
   * Decided by matching `replyTo` against the `messageId` of the requests the
   * page sent, and the feed's are the ones carrying `reason:
   * 'consistency-check'` (`simulation-snapshot-feed.ts:384`).
   */
  readonly forRenderer: boolean;
  readonly orders: readonly { id: string; definitionId: string; state: string; x: number; y: number }[];
}

interface DigestWindow extends TeeWindow {
  lockstate1027Snapshots?: SnapshotDigest[];
}

/**
 * The worker tee, plus a digest of every `simulation/snapshot`.
 *
 * `installTee` in `playtest-harness.ts` deliberately drops snapshots so its
 * array cannot grow without bound, and the snapshot is exactly the message this
 * playtest is about -- it is the only thing that moves `RenderFrame.world` and
 * `RenderFrame.structures`. So this installs the same tee and keeps a *digest*
 * of each one: the tick, and every build order's state and location. Bounded,
 * and structured-clone-safe.
 */
async function installSnapshotTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    const snapshots: SnapshotDigest[] = [];
    /** Message ids of `simulation/request-snapshot`s the render feed sent. */
    const rendererRequests = new Set<string>();
    interface SnapshotMessage {
      kind?: string;
      payload?: {
        tick?: number;
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
          const data = event.data as SnapshotMessage;
          const kind = data.kind ?? '';
          if (kind === 'simulation/snapshot') {
            const replyTo = (data as { replyTo?: string }).replyTo;
            const orders = data.payload?.snapshot?.data?.construction?.orders ?? [];
            snapshots.push({
              t: performance.now(),
              tick: data.payload?.tick ?? -1,
              forRenderer: replyTo !== undefined && rendererRequests.has(replyTo),
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
          if (kind === 'simulation/delta' || kind === 'simulation/projection') return;
          received.push(event.data);
        });
      }

      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        const request = message as { kind?: string; messageId?: string; payload?: { reason?: string } };
        if (request.kind === 'simulation/request-snapshot' && request.payload?.reason === 'consistency-check' && request.messageId !== undefined) {
          rendererRequests.add(request.messageId);
        }
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = TeeWorker as unknown as typeof Worker;
    const target = window as unknown as DigestWindow;
    target.lockstateSentToWorker = sent;
    target.lockstateFromWorker = received;
    target.lockstate1027Snapshots = snapshots;
  });
}

async function snapshotDigests(page: Page): Promise<readonly SnapshotDigest[]> {
  return page.evaluate(() => (window as unknown as DigestWindow).lockstate1027Snapshots ?? []);
}

/**
 * The colour of one screen pixel, straight out of the compositor.
 *
 * `page.screenshot` is the only route: the Phaser canvas is WebGL without
 * `preserveDrawingBuffer`, so `toDataURL` and `getImageData` on it read a
 * cleared buffer and would report black however the world is drawn. The PNG
 * that comes back is decoded by handing it *back* to the browser, whose own
 * decoder is already there -- cheaper, and less to get wrong, than a PNG
 * decoder written here.
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

/**
 * The alpha `fill` would have to have been drawn at over `background` to give
 * `sample`, or `undefined` when no single alpha explains it.
 *
 * Solved per channel and cross-checked, because a blend of one known colour
 * over another has to agree on all three: a disagreement means the pixel is not
 * that fill over that background at all, and reporting an average of three
 * contradictory numbers as "the alpha" is how a wrong background turns into a
 * confident wrong reading.
 */
function alphaOf(
  sample: readonly [number, number, number],
  fill: readonly [number, number, number],
  background: readonly [number, number, number],
): number | undefined {
  const solved: number[] = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const target = fill[channel] as number;
    const base = background[channel] as number;
    if (Math.abs(target - base) < 8) continue; // this channel cannot separate them
    solved.push(((sample[channel] as number) - base) / (target - base));
  }
  if (solved.length === 0) return undefined;
  const mean = solved.reduce((total, value) => total + value, 0) / solved.length;
  for (const value of solved) if (Math.abs(value - mean) > 0.15) return undefined;
  return mean;
}

interface Sample {
  readonly ms: number;
  readonly centre: readonly [number, number, number];
  readonly centreAlpha: number | undefined;
  readonly north: readonly [number, number, number];
  readonly queue: string;
  readonly snapshotTick: number;
  readonly snapshotState: string;
}

test('a door is ordered, finished, and watched until the renderer agrees (#1027)', async ({ page }) => {
  test.setTimeout(600_000);
  const log: string[] = [];
  const say = (line: string): void => {
    log.push(line);
    console.log(line);
  };

  /*
   * The console, kept, because a browser run passes with every sprite failing
   * to decode and says nothing about it -- and every visual conclusion below
   * would then be worthless (`docs/AGENT_WORKFLOW.md` §2, the Git LFS chain).
   * Phaser's own banner is the only line a healthy run prints.
   */
  const console_: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('%c %c %c Phaser')) return;
    console_.push(`${message.type()}: ${text}`);
  });

  await installSnapshotTee(page);
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud-clock__day').first().waitFor();

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  say(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);

  // Two tiles near the calibration probe, so both are certainly on canvas and
  // clear of the HUD rails. The second is four tiles east: far enough that
  // nothing drawn on it can reach the first tile's probes.
  const tileX = Math.floor((700 - origin.originX) / TILE);
  const tileY = Math.floor((300 - origin.originY) / TILE);
  const secondTileX = tileX + 4;
  const tileLeft = origin.originX + tileX * TILE;
  const tileTop = origin.originY + tileY * TILE;
  const centre = { x: Math.round(tileLeft + TILE / 2), y: Math.round(tileTop + TILE / 2) };
  // Six pixels south of the tile's northern boundary: inside the side face of
  // the *edge* bar a finished door is drawn as, and inside the top face of the
  // construction slab while one is drawn.
  const north = { x: centre.x, y: Math.round(tileTop + 6) };
  say(`door tile (${tileX},${tileY}); centre probe ${JSON.stringify(centre)}; north probe ${JSON.stringify(north)}`);

  const floorAtCentre = await pixelAt(page, centre.x, centre.y);
  const floorAtNorth = await pixelAt(page, north.x, north.y);
  say(`this tile's own bare floor: centre ${JSON.stringify(floorAtCentre)}, north ${JSON.stringify(floorAtNorth)}`);
  say(
    `for reference, what the painter would put at the centre probe at each alpha, side fill ${JSON.stringify(DOOR_SIDE_FILL)} over that floor:` +
      ` 0.35 -> ${JSON.stringify(blend(DOOR_SIDE_FILL, floorAtCentre, 0.35))},` +
      ` 0.65 -> ${JSON.stringify(blend(DOOR_SIDE_FILL, floorAtCentre, 0.65))},` +
      ` 1.00 -> ${JSON.stringify(DOOR_SIDE_FILL)}`,
  );

  // Two planks: one for the door this measures, one for the door act two
  // orders to force a snapshot while the first is still being built.
  await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill('2');
  await page.locator('.hud-build__buy-submit').click();
  await page.waitForTimeout(300);

  const armLabel = (await page.locator('.hud-build__arm').innerText()).trim().toLowerCase();
  if (armLabel.startsWith('place') || armLabel.startsWith('draw')) await page.locator('.hud-build__arm').click();

  const placeDoorOn = async (screenX: number, screenY: number): Promise<Record<string, unknown>> => {
    const before = (await sentCommands(page)).length;
    await page.mouse.move(screenX, screenY);
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(200);
    const produced = (await sentCommands(page)).slice(before);
    const order = produced.find((command) => command['definitionId'] === 'door-wooden');
    if (order === undefined) throw new Error(`no door-wooden PlaceBuildOrder from a press at ${screenX},${screenY}: ${JSON.stringify(produced)}`);
    return order;
  };

  const order = await placeDoorOn(centre.x, tileTop + 6);
  say(`VERIFIED placed: definitionId=${String(order['definitionId'])} at (${String(order['x'])},${String(order['y'])}) edge=${String(order['edge'])}`);

  await page.locator('.hud-strip__transport button').nth(1).click();
  const started = Date.now();
  say(`clock started at t+0ms, tick ${await currentTick(page)}`);

  const samples: Sample[] = [];
  const sampleOnce = async (probeCentre: { x: number; y: number }, probeNorth: { x: number; y: number }, floor: readonly [number, number, number], at: number, tile: { x: number; y: number }): Promise<Sample> => {
    const centreColour = await pixelAt(page, probeCentre.x, probeCentre.y);
    const northColour = await pixelAt(page, probeNorth.x, probeNorth.y);
    const queue = (await panelText(page, '.hud-build__queue')).replace(/\n/g, ' | ');
    const digests = await snapshotDigests(page);
    const forRenderer = digests.filter((digest) => digest.forRenderer);
    const latestForRenderer = forRenderer[forRenderer.length - 1];
    const doorOrder = latestForRenderer?.orders.find((entry) => entry.x === tile.x && entry.y === tile.y);
    const sample: Sample = {
      ms: at,
      centre: centreColour,
      centreAlpha: alphaOf(centreColour, DOOR_SIDE_FILL, floor),
      north: northColour,
      queue,
      snapshotTick: latestForRenderer?.tick ?? -1,
      snapshotState: doorOrder?.state ?? 'absent',
    };
    samples.push(sample);
    return sample;
  };

  /*
   * ACT ONE, AND NOTHING ELSE TOUCHES THE SIMULATION WHILE IT RUNS.
   *
   * The window this measures is bounded by the feed's thirty-second
   * consistency poll, and *every* accepted command shortens it -- a command
   * acknowledgement is one of the five `dirty` marks. So act one presses
   * nothing: it orders one door, starts the clock, and watches. A second
   * gesture anywhere in here would measure the gesture rather than the window.
   */
  const doorTile = { x: order['x'] as number, y: order['y'] as number };
  for (;;) {
    const elapsed = Date.now() - started;
    if (elapsed > 75_000) break;
    const sample = await sampleOnce(centre, north, floorAtCentre, elapsed, doorTile);
    if ((sample.centreAlpha === undefined || sample.centreAlpha < 0.1) && samples.length > 2) break;
    await page.waitForTimeout(250);
  }
  const actOneEnd = samples.length;

  let previous = '';
  say('--- act one: one door, one clock, nothing else pressed');
  for (const sample of samples.slice(0, actOneEnd)) {
    const alpha = sample.centreAlpha === undefined ? 'no-slab' : sample.centreAlpha.toFixed(2);
    const key = `${alpha}|${sample.queue}|${sample.snapshotState}`;
    if (key === previous) continue;
    previous = key;
    say(
      `t+${String(sample.ms).padStart(6)}ms centre=${JSON.stringify(sample.centre)} slabAlpha=${alpha}` +
        ` north=${JSON.stringify(sample.north)} | queue: ${sample.queue}` +
        ` | last snapshot tick ${String(sample.snapshotTick)} says the order is "${sample.snapshotState}"`,
    );
  }

  const actOne = samples.slice(0, actOneEnd);
  const queueEmpty = actOne.find((sample) => /(?<![0-9])0 waiting . 0 being built/.test(sample.queue) || sample.queue.includes('not laid out'));
  const frameComplete = actOne.find((sample) => sample.snapshotState === 'completed');
  const slabGone = actOne.find((sample) => sample.centreAlpha === undefined || sample.centreAlpha < 0.1);
  say('---');
  say(`the Build panel stopped listing the order at t+${String(queueEmpty?.ms ?? -1)}ms`);
  say(`the renderer's own feed first held a snapshot saying "completed" at t+${String(frameComplete?.ms ?? -1)}ms`);
  const allDigests = await snapshotDigests(page);
  say(
    `snapshots on the wire during the run: ${String(allDigests.length)}, of which ${String(allDigests.filter((digest) => digest.forRenderer).length)} were the render feed's` +
      ` -- the rest are the local save's and the feed discards them (simulation-snapshot-feed.ts:323)`,
  );
  say(`the tile centre first stopped carrying a construction slab at t+${String(slabGone?.ms ?? -1)}ms`);
  if (queueEmpty !== undefined && slabGone !== undefined) {
    say(`THE WINDOW A PLAYER SEES: ${slabGone.ms - queueEmpty.ms}ms of a finished door still drawn as a construction ghost`);
  }

  /*
   * ACT TWO: THE SAME DOOR ON A SECOND TILE, WITH THE FEED KEPT FRESH.
   *
   * A player watching one door never sees the `building` ghost at all -- act
   * one went from the `planned` ghost straight to the finished edge, because
   * the only snapshot in between was the thirty-second poll. Resuming a paused
   * clock is a *clock transition*, which is one of the five `dirty` marks
   * (`simulation-snapshot-feed.ts`, the `simulation/clock-state` case), so this
   * act runs the simulation in short bursts -- play, a fifth of a second,
   * pause, sample -- and every burst brings the frame back in step.
   *
   * The bursts are short for a measured reason, and the *clicks* are dispatched
   * rather than driven through Playwright's actionability checks for the same
   * one. `in-progress` lasts thirty ticks, a second and a half at 20 Hz. A
   * first attempt pressed Play and Pause as ordinary clicks with a 200 ms wait
   * between them, which let the clock run for about a second and a half of
   * click latency per iteration -- one whole phase per sample -- and recorded
   * `materials-pending` followed by `completed` with nothing in between.
   * `dispatchEvent` costs no actionability wait, so the burst is the wait it is
   * given and a dozen ticks fit inside the phase.
   *
   * Nothing here is an artificial delay dressed as gameplay. Pause and Play are
   * the controls on the status strip, and what this act shows is what a
   * *fresh* feed draws -- not what a player sees in act one, which is the
   * measurement above and was taken with nothing pressed at all.
   */
  const secondCentre = { x: Math.round(origin.originX + secondTileX * TILE + TILE / 2), y: centre.y };
  const secondNorth = { x: secondCentre.x, y: north.y };
  const secondFloor = await pixelAt(page, secondCentre.x, secondCentre.y);
  say('---');
  say(`--- act two: a second door at tile (${secondTileX},${tileY}), with Pause/Play pressed once per sample so the feed stays fresh`);
  say(`that tile's own bare floor: ${JSON.stringify(secondFloor)}`);
  const secondOrder = await placeDoorOn(secondCentre.x, north.y);
  say(`VERIFIED placed: definitionId=${String(secondOrder['definitionId'])} at (${String(secondOrder['x'])},${String(secondOrder['y'])}) edge=${String(secondOrder['edge'])}`);
  const secondTile = { x: secondOrder['x'] as number, y: secondOrder['y'] as number };
  const play = page.locator('.hud-strip__transport button').nth(1);
  const pause = page.locator('.hud-strip__transport button').nth(0);
  await pause.dispatchEvent('click');
  const secondStarted = Date.now();
  previous = '';
  for (;;) {
    const elapsed = Date.now() - secondStarted;
    if (elapsed > 150_000) break;
    await play.dispatchEvent('click');
    await page.waitForTimeout(600);
    await pause.dispatchEvent('click');
    const sample = await sampleOnce(secondCentre, secondNorth, secondFloor, elapsed, secondTile);
    const alpha = sample.centreAlpha === undefined ? 'no-slab' : sample.centreAlpha.toFixed(2);
    const key = `${alpha}|${sample.snapshotState}`;
    if (key !== previous) {
      previous = key;
      say(
        `t+${String(sample.ms).padStart(6)}ms centre=${JSON.stringify(sample.centre)} slabAlpha=${alpha}` +
          ` north=${JSON.stringify(sample.north)} | last snapshot tick ${String(sample.snapshotTick)} says the order is "${sample.snapshotState}"`,
      );
    }
    if (sample.snapshotState === 'completed' && (sample.centreAlpha === undefined || sample.centreAlpha < 0.1)) break;
  }

  say('---');
  const opaque = samples.filter((sample) => sample.centreAlpha !== undefined && sample.centreAlpha > 0.85);
  const building = samples.filter((sample) => sample.centreAlpha !== undefined && sample.centreAlpha > 0.5 && sample.centreAlpha < 0.8);
  const planned = samples.filter((sample) => sample.centreAlpha !== undefined && sample.centreAlpha > 0.2 && sample.centreAlpha < 0.5);
  say(`across both acts, ${String(samples.length)} samples:`);
  say(`  at PLANNED_ALPHA (~0.35): ${planned.length}`);
  say(`  at BUILDING_ALPHA (~0.65): ${building.length}`);
  say(`  at full opacity -- what #1027 says a completed door is drawn at: ${opaque.length}`);
  for (const sample of opaque.slice(0, 10)) say(`  t+${sample.ms}ms alpha=${sample.centreAlpha?.toFixed(2)} ${JSON.stringify(sample.centre)}`);

  say('---');
  say(`console lines other than Phaser's banner: ${String(console_.length)}`);
  for (const line of console_.slice(0, 20)) say(`  ${line}`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/log.txt`, `${log.join('\n')}\n`);
  writeFileSync(`${OUT}/samples.json`, `${JSON.stringify(samples, null, 2)}\n`);
});

/** What the painter puts on screen for `fill` at `alpha` over `background`. */
function blend(
  fill: readonly [number, number, number],
  background: readonly [number, number, number],
  alpha: number,
): readonly [number, number, number] {
  return [0, 1, 2].map((channel) =>
    Math.round((fill[channel] as number) * alpha + (background[channel] as number) * (1 - alpha)),
  ) as unknown as readonly [number, number, number];
}
