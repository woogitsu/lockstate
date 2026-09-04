/**
 * Playtest, 2026-09-04 — **can a player see their prison?**
 *
 * Not a gate. `.playtest.ts`, collected only by
 * `tests/browser/playwright.playtest.config.ts`, never by the CI config.
 *
 * The question: *a player builds a prison, sets it running, and then just
 * watches it. Looking at the screen — the world, not the panels — can they
 * tell what is going on?*
 *
 * Every act below writes PNGs into
 * `…/scratchpad/can-i-see-my-prison/` and prints, beside each one, what the
 * **worker** said was true at the moment it was taken. The gap between the two
 * is the measurement: the screenshots are what a player can know, and the
 * decoded render-actors payload is what the simulation knows.
 *
 * Run one act:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5312 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-can-i-see-my-prison.playtest.ts -g "act 1"
 * ```
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  TILE,
  armBuildable,
  buildAndPopulate,
  buy,
  calibrate,
  centreOf,
  currentTick,
  drag,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

const SHOTS = '/tmp/claude-0/-workspace-lockstate/317b5b29-acc0-5270-82e4-ccecba312c95/scratchpad/can-i-see-my-prison';

/* ------------------------------------------------------------------ */
/* the two channels, kept apart                                        */
/* ------------------------------------------------------------------ */

/**
 * A second tee, for the one message kind `playtest-harness`'s tee deliberately
 * drops.
 *
 * `installTee` skips `simulation/delta` so its array cannot grow without
 * bound, and that is the *only* channel carrying where the actors are: ADR
 * 0040 slice 1 moved the live population off the snapshot and onto an
 * `array-buffer` keyframe posted every 100 ms while the tick moves. So this
 * decodes each one as it lands — the layout is four header words then five
 * words per record (`src/simulation/protocol/render-actors-payload.ts:115-124`)
 * — and keeps only the decoded rows, which is a few hundred numbers rather
 * than a few hundred kilobytes.
 *
 * `population` is the low byte of the packed-fields word: 0 prisoner, 1 guard
 * (`:148,:160`). Positions are sub-tile, 256 units to a tile (`:134`).
 */
async function installActorTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const HEADER_WORDS = 4;
    const RECORD_WORDS = 5;
    const WORD = 4;
    const SUBTILE = 256;
    interface ActorSample {
      readonly tick: number;
      readonly at: number;
      readonly actors: readonly {
        readonly id: number;
        readonly population: number;
        readonly x: number;
        readonly y: number;
        readonly vx: number;
        readonly vy: number;
      }[];
    }
    const samples: ActorSample[] = [];
    (window as unknown as { lockstateActorSamples: ActorSample[] }).lockstateActorSamples = samples;

    const RealWorker = Worker;
    class ActorTeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as {
            kind?: string;
            payload?: { tick?: number; payload?: { body?: ArrayBuffer } };
          };
          if (message.kind !== 'simulation/delta') return;
          const body = message.payload?.payload?.body;
          if (!(body instanceof ArrayBuffer)) return;
          try {
            const view = new DataView(body);
            const recordCount = view.getUint32(2 * WORD, true);
            const actors = [];
            for (let record = 0; record < recordCount; record += 1) {
              const offset = (HEADER_WORDS + record * RECORD_WORDS) * WORD;
              const packed = view.getUint32(offset + WORD, true);
              actors.push({
                id: view.getUint32(offset, true),
                population: packed & 0xff,
                x: view.getInt32(offset + 2 * WORD, true) / SUBTILE,
                y: view.getInt32(offset + 3 * WORD, true) / SUBTILE,
                vx: view.getInt16(offset + 4 * WORD, true) / SUBTILE,
                vy: view.getInt16(offset + 4 * WORD + 2, true) / SUBTILE,
              });
            }
            samples.push({ tick: message.payload?.tick ?? -1, at: Date.now(), actors });
            // Bounded: the last 400 publications is ~40 s of play at the
            // 100 ms ceiling, which is longer than any window read below.
            if (samples.length > 400) samples.splice(0, samples.length - 400);
          } catch {
            // A body this cannot read is not this playtest's finding.
          }
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ActorTeeWorker as unknown as typeof Worker;
  });
}

interface ActorSample {
  readonly tick: number;
  readonly at: number;
  readonly actors: readonly { readonly id: number; readonly population: number; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number }[];
}

async function actorSamples(page: Page): Promise<readonly ActorSample[]> {
  return page.evaluate(() => (window as unknown as { lockstateActorSamples?: ActorSample[] }).lockstateActorSamples ?? []);
}

/** The most recent thing the worker said about where everybody is. */
async function latestActors(page: Page): Promise<ActorSample | undefined> {
  const samples = await actorSamples(page);
  return samples[samples.length - 1];
}

function describeActors(sample: ActorSample | undefined): string {
  if (sample === undefined) return 'the worker has published no actor keyframe at all';
  const prisoners = sample.actors.filter((a) => a.population === 0);
  const guards = sample.actors.filter((a) => a.population === 1);
  const moving = sample.actors.filter((a) => Math.abs(a.vx) > 0 || Math.abs(a.vy) > 0);
  return (
    `tick ${sample.tick}: ${prisoners.length} prisoner(s), ${guards.length} guard(s), ${moving.length} of them with a non-zero velocity\n` +
    `  prisoners at ${JSON.stringify(prisoners.map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}${a.vx || a.vy ? ` v=${a.vx.toFixed(2)},${a.vy.toFixed(2)}` : ''}`))}\n` +
    `  guards at    ${JSON.stringify(guards.map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)}${a.vx || a.vy ? ` v=${a.vx.toFixed(2)},${a.vy.toFixed(2)}` : ''}`))}`
  );
}

/* ------------------------------------------------------------------ */
/* looking at the screen                                               */
/* ------------------------------------------------------------------ */

/**
 * A PNG of the whole page, and one of just the world under the HUD.
 *
 * The full frame is what a player sees. The clip is so a difference between
 * two frames can be attributed to the world rather than to a panel repainting
 * a number — the HUD is a live readout and changes constantly.
 */
async function look(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<string> {
  mkdirSync(SHOTS, { recursive: true });
  const file = `${SHOTS}/${name}.png`;
  const shot = await page.screenshot(clip === undefined ? { animations: 'disabled' } : { clip, animations: 'disabled' });
  writeFileSync(file, shot);
  console.log(`  [shot] ${name}.png (${shot.length} bytes)`);
  return file;
}

/**
 * Where a tile is on screen, for cropping a screenshot to a thing rather than
 * to a rectangle chosen by eye.
 */
function tileBox(
  origin: { originX: number; originY: number },
  from: { tx: number; ty: number },
  to: { tx: number; ty: number },
  pad = 0,
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.max(0, origin.originX + from.tx * TILE - pad),
    y: Math.max(0, origin.originY + from.ty * TILE - pad),
    width: (to.tx - from.tx + 1) * TILE + 2 * pad,
    height: (to.ty - from.ty + 1) * TILE + 2 * pad,
  };
}

/* ------------------------------------------------------------------ */
/* act 1 — bare ground, an order, a wall, a room                        */
/* ------------------------------------------------------------------ */

/**
 * Watches one small patch of world for `seconds`, taking a magnified picture
 * every `everyMs`, and reports which of them differ from the one before.
 *
 * **Written this way because the first attempt trusted a panel.** It waited on
 * `waitForQueueEmpty` and then compared two pictures; the queue readout
 * answered `".hud-build__queue: not laid out"`, the helper reads that as
 * "empty", and the two pictures came back byte-identical — which is either
 * *"a built wall looks exactly like a planned one"* or *"the wall was never
 * built"*, and the run could not tell the two apart. A sequence with the
 * simulation tick printed beside every frame can: if the world never changes
 * while the tick advances by hundreds, that is the finding; if it changes at
 * frame four, the picture before and the picture after are the comparison the
 * question actually wants.
 */
async function watchPatch(
  page: Page,
  name: string,
  region: { x: number; y: number; width: number; height: number },
  options: { readonly frames: number; readonly everyMs: number; readonly scale?: number },
): Promise<void> {
  let previous = '';
  for (let frame = 0; frame < options.frames; frame += 1) {
    const tick = await currentTick(page);
    const shot = await page.screenshot({ clip: region, animations: 'disabled' });
    let hash = 0;
    for (const byte of shot) hash = (hash * 31 + byte) >>> 0;
    const fingerprint = hash.toString(16);
    const changed = frame > 0 && fingerprint !== previous;
    await magnify(page, `${name}-f${frame}-tick${tick}`, region, options.scale ?? 6);
    console.log(`    frame ${frame} at tick ${tick}: ${fingerprint}${changed ? '  <-- THE WORLD CHANGED' : frame === 0 ? '' : '  (identical to the frame before)'}`);
    previous = fingerprint;
    if (frame < options.frames - 1) await page.waitForTimeout(options.everyMs);
  }
}

test('act 1 — what the world looks like at each step of building one thing', async ({ page }) => {
  await installActorTee(page);
  await installTee(page);
  await openApp(page);

  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await look(page, '01-a-brand-new-prison-full-frame');

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  const roomBox = tileBox(origin, { tx: 10, ty: 10 }, { tx: 20, ty: 20 });
  // Two tiles either side of the edge the wall will be laid on, so a reader
  // can see a wall rather than a landscape.
  const edgeBox = tileBox(origin, { tx: 12, ty: 11 }, { tx: 14, ty: 13 });
  await look(page, '02-bare-ground-close', roomBox);
  await magnify(page, '02b-bare-ground-magnified', edgeBox, 8);

  await buy(page, 'wall-brick', 24);
  // The bricks have to arrive before anything can be built with them, and that
  // takes simulated time: the clock is started here rather than after the
  // orders, so the delivery and the building are both inside the window below.
  await fastForwardToMax(page);
  await page.waitForTimeout(4000);
  console.log(`deliveries after running the clock: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  await armBuildable(page, 'wall-brick');
  await drag(
    page,
    { x: origin.originX + 12 * TILE + TILE / 2, y: origin.originY + 12 * TILE },
    { x: origin.originX + 18 * TILE - TILE / 2, y: origin.originY + 12 * TILE },
  );
  console.log(`queue right after the run: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);

  console.log('\n---- the same three tiles, from the order to the wall ----');
  await watchPatch(page, '03-order-to-wall', edgeBox, { frames: 10, everyMs: 4000, scale: 8 });
  console.log(`queue at the end of the window: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  await look(page, '04-after-the-wall-window', roomBox);

  // Three more runs, so there is something enclosed to zone.
  await tab(page, 'build').click();
  await buy(page, 'wall-brick', 60);
  await page.waitForTimeout(4000);
  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  for (const run of [
    { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    await drag(page, run.a, run.b);
  }
  await waitForQueueEmpty(page);
  await page.waitForTimeout(4000);
  await look(page, '05-an-enclosed-box-of-wall', roomBox);
  await magnify(page, '05b-a-corner-of-it', tileBox(origin, { tx: 11, ty: 11 }, { tx: 14, ty: 14 }), 8);

  // Zone it as a cell.
  let zoned = false;
  for (let attempt = 1; attempt <= 8 && !zoned; attempt += 1) {
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    if (attempt === 1) await look(page, '06-a-pending-rectangle', roomBox);
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(1200);
    zoned = ((await latestCounts(page))?.rooms ?? 0) > 0;
    console.log(`designate attempt ${attempt}: rooms=${(await latestCounts(page))?.rooms} | band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    if (!zoned) await page.waitForTimeout(5000);
  }
  expect(zoned, 'nothing was zoned, so there is no room to look at').toBe(true);
  await page.waitForTimeout(2000);
  await look(page, '07-a-zoned-cell', roomBox);
  await look(page, '07b-a-zoned-cell-full-frame');
  await magnify(page, '07c-the-zoned-floor', tileBox(origin, { tx: 12, ty: 12 }, { tx: 15, ty: 15 }), 8);

  // A bed: ordered, then built, watched the same way.
  await tab(page, 'build').click();
  await buy(page, 'bed-wooden', 2);
  await page.waitForTimeout(4000);
  await armBuildable(page, 'bed-wooden');
  await press(page, centreOf(origin, 13, 14).x, centreOf(origin, 13, 14).y);
  console.log('\n---- the same three tiles, from the bed order to the bed ----');
  await watchPatch(page, '08-order-to-bed', tileBox(origin, { tx: 12, ty: 13 }, { tx: 14, ty: 15 }), {
    frames: 8,
    everyMs: 4000,
    scale: 8,
  });

  console.log(`\ncounts at the end of act 1: ${JSON.stringify(await latestCounts(page))}`);
  console.log(`the worker on actors: ${describeActors(await latestActors(page))}`);
  console.log(`commands this act submitted: ${(await sentCommands(page)).length}`);
});

/* ------------------------------------------------------------------ */
/* act 2 — who is who, and what a place is                              */
/* ------------------------------------------------------------------ */

/**
 * A magnified crop of the live canvas, drawn back into the page so it can be
 * screenshotted at a size a human can actually judge.
 *
 * `canvas.toDataURL()` on the WebGL canvas returns an empty buffer — the game
 * config sets no `preserveDrawingBuffer` (`src/main.ts:417-436`) — so this does
 * not touch the game canvas at all. It takes the *screenshot* Playwright
 * already composites, hands it back to the page as an image, and blits the
 * region of interest into a plain 2D canvas at `scale`, nearest-neighbour, so
 * a 64px tile becomes something a reader can look at.
 */
async function magnify(
  page: Page,
  name: string,
  region: { x: number; y: number; width: number; height: number },
  scale = 6,
): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const frame = await page.screenshot({ animations: 'disabled' });
  const dataUrl = `data:image/png;base64,${frame.toString('base64')}`;
  const magnified = await page.evaluate(
    async ({ url, box, factor }) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('the frame could not be read back'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(box.width * factor);
      canvas.height = Math.round(box.height * factor);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('no 2d context to magnify into');
      context.imageSmoothingEnabled = false;
      context.drawImage(image, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    },
    { url: dataUrl, box: region, factor: scale },
  );
  const bytes = Buffer.from(magnified.split(',')[1] ?? '', 'base64');
  writeFileSync(`${SHOTS}/${name}.png`, bytes);
  console.log(`  [magnified x${scale}] ${name}.png (${bytes.length} bytes) from ${JSON.stringify(region)}`);
}

test('act 2 — a running prison with people in it', async ({ page }) => {
  await installActorTee(page);
  await installTee(page);
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 6, admits: 6, guards: 3, label: 'see' });
  await fastForwardToMax(page);
  await page.waitForTimeout(6000);

  console.log(`\ncounts: ${JSON.stringify(await latestCounts(page))}`);
  const sample = await latestActors(page);
  console.log(`the worker on actors: ${describeActors(sample)}`);

  await look(page, '20-a-populated-prison-full-frame');
  await look(page, '21-the-cell-block', tileBox(origin, { tx: 9, ty: 9 }, { tx: 21, ty: 21 }));

  // Every actor the worker says exists, magnified at the screen position its
  // own tile maps to. If a figure is not there, that is the finding.
  if (sample !== undefined) {
    const shown = sample.actors.slice(0, 8);
    for (const [index, actor] of shown.entries()) {
      const centre = centreOf(origin, actor.x, actor.y);
      const box = { x: Math.max(0, centre.x - 48), y: Math.max(0, centre.y - 64), width: 96, height: 112 };
      await magnify(
        page,
        `22-actor-${index}-${actor.population === 1 ? 'guard' : 'prisoner'}-at-${actor.x.toFixed(1)}-${actor.y.toFixed(1)}`,
        box,
        6,
      );
    }
  }

  // Zoomed in, the way a player who wants a closer look does it: the wheel,
  // over the world and away from every HUD island.
  const overWorld = { x: Math.round(origin.originX + 15 * TILE), y: Math.round(origin.originY + 15 * TILE) };
  const onCanvas = await page.evaluate(
    (point) => document.elementFromPoint(point.x, point.y)?.tagName.toLowerCase() ?? 'nothing',
    overWorld,
  );
  console.log(`the point the wheel is used over holds: ${onCanvas}`);
  expect(onCanvas, 'the zoom point is covered by the HUD, so the wheel would not reach the world').toBe('canvas');
  await page.mouse.move(overWorld.x, overWorld.y);
  for (let notch = 0; notch < 6; notch += 1) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  await look(page, '23-zoomed-in-full-frame');

  // And out, to the "standing back from the prison" view the question asks for.
  for (let notch = 0; notch < 12; notch += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  await look(page, '24-standing-back-full-frame');
});

/* ------------------------------------------------------------------ */
/* act 3 — does anything move, and does a guard walk (#740)             */
/* ------------------------------------------------------------------ */

test('act 3 — watching it run: what moves on the wire, and what moves on the screen', async ({ page }) => {
  await installActorTee(page);
  await installTee(page);
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 6, admits: 6, guards: 3, label: 'watch' });
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);

  const box = tileBox(origin, { tx: 9, ty: 9 }, { tx: 21, ty: 21 });
  const startTick = await currentTick(page);
  const before = await latestActors(page);
  console.log(`\nat tick ${startTick}: ${describeActors(before)}`);
  await look(page, '30-watching-t0', box);

  // Six samples across a real stretch of simulated time, each one a picture
  // and the worker's own answer at the same moment.
  const frames: { tick: number; file: string }[] = [];
  for (let step = 1; step <= 6; step += 1) {
    await page.waitForTimeout(5000);
    const tick = await currentTick(page);
    const file = await look(page, `30-watching-t${step}`, box);
    frames.push({ tick, file });
    console.log(`  t${step} tick ${tick}: ${describeActors(await latestActors(page))}`);
  }

  // How far each actor actually travelled, per population, over the whole
  // window — the worker's answer, independent of anything drawn.
  const samples = await actorSamples(page);
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first !== undefined && last !== undefined) {
    console.log(`\n---- displacement between tick ${first.tick} and tick ${last.tick} ----`);
    const byId = new Map(first.actors.map((actor) => [actor.id, actor]));
    for (const actor of last.actors) {
      const started = byId.get(actor.id);
      if (started === undefined) {
        console.log(`  ${actor.population === 1 ? 'guard  ' : 'prisoner'} ${actor.id}: appeared during the window at ${actor.x.toFixed(2)},${actor.y.toFixed(2)}`);
        continue;
      }
      const distance = Math.hypot(actor.x - started.x, actor.y - started.y);
      console.log(
        `  ${actor.population === 1 ? 'guard  ' : 'prisoner'} ${actor.id}: ${started.x.toFixed(2)},${started.y.toFixed(2)} -> ${actor.x.toFixed(2)},${actor.y.toFixed(2)} = ${distance.toFixed(3)} tiles`,
      );
    }
    const everMoved = new Map<number, number>();
    for (const sample of samples) {
      for (const actor of sample.actors) {
        const seen = byId.get(actor.id);
        if (seen === undefined) continue;
        const distance = Math.hypot(actor.x - seen.x, actor.y - seen.y);
        everMoved.set(actor.id, Math.max(everMoved.get(actor.id) ?? 0, distance));
      }
    }
    console.log(`  furthest any actor ever got from where this window found it: ${JSON.stringify([...everMoved].map(([id, d]) => `${id}:${d.toFixed(2)}`))}`);
    console.log(`  actor keyframes published across the window: ${samples.length}`);
  }

  // What the worker said *happened*, in the same window, against what the
  // pictures above could possibly have shown.
  const events = await page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: unknown[] }).lockstateFromWorker ?? [])
      .filter((message) => String((message as { kind?: string }).kind ?? '').includes('event'))
      .slice(-40)
      .map((message) => JSON.stringify(message).slice(0, 300)),
  );
  console.log(`\n---- what the worker reported happening (last 40) ----`);
  events.forEach((line) => console.log(`  ${line}`));
  console.log(`\nthe alerts panel, meanwhile: ${JSON.stringify(await panelText(page, '.hud-alerts__list'))}`);
});
