import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  TILE,
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
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Can a player tell one room from another by looking at the map?**
 *
 * The play-test [ADR
 * 0098](../../docs/adr/0098-what-says-which-room-this-is.md) names as the
 * falsification of its own weakest claim. That claim is the comparison of a
 * **4.06** mean shift — `operations` against `food`, Reception against Kitchen,
 * after `ZONING_TINT_ALPHA_OVER_ART = 0.14` — against the **25.4** p5→p95
 * luminance spread of the one floor image every room shares. The arithmetic is
 * exact and the inference to "a player cannot tell" is established nowhere in
 * this repository. If the inference is wrong, option A (key the tint by room id)
 * is the whole answer and options C and D are waste.
 *
 * So this builds one prison holding three rooms that touch:
 *
 * - **Kitchen** and **Canteen**, both `food`, sharing one party wall.
 *   `zoningTint` is keyed by the room's *category*
 *   (`src/rendering/world/appearance.ts:113`), so these two are not 4 units
 *   apart — they are the **same pixels**.
 * - **Reception** (`operations`) sharing a party wall with the Kitchen. That is
 *   the 4.06-unit pair, the tightest of all 55 on screen today.
 *
 * and then measures the rendered floors and photographs them at three zooms.
 *
 * ## Two runs, and the second one is a local edit that is never committed
 *
 * `LOCKSTATE_PALETTE_LABEL` names the run and picks the screenshot
 * subdirectory. The alternative-palette run is produced by editing
 * `src/rendering/world/appearance.ts` in the working tree, running this file
 * again, and reverting. **No `src/` change is committed by this play-test.**
 *
 * ## Nothing in CI collects this
 *
 * `tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`; only
 * `tests/browser/playwright.playtest.config.ts` matches `*.playtest.ts`. A
 * play-test is evidence, never a gate.
 *
 * Findings live in `docs/research/2026-09-06-can-you-name-the-room.md`.
 */

const LABEL = process.env['LOCKSTATE_PALETTE_LABEL'] ?? 'shipped';
const SHOTS = `docs/research/2026-09-06-can-you-name-the-room/${LABEL}`;

mkdirSync(SHOTS, { recursive: true });

/**
 * The three rooms, in tiles, and the two adjacencies that are the whole
 * experiment: Canteen | Kitchen share a party wall (both `food`, so one tint
 * and literally one colour), and Kitchen | Reception share a party wall
 * (`food` against `operations`, the 4.06-unit pair, the tightest of all 55).
 *
 * **The block is where it is because the HUD covers the rest, and that was
 * measured rather than guessed.** Two earlier runs of this file put the block
 * at tiles 6-17 and lost a room to the interface twice: three of nine wall
 * drags produced zero commands, and then the Canteen's floor crop came back at
 * mean RGB 84/86/90 with a per-pixel σ of 54 — which is a screenshot of a
 * panel, not of a floor. `.hud__corner` is the bottom-left minimap frame with
 * the zoom island above it (`src/ui/hud/hud.css:229`: `grid-area: middle;
 * justify-self: start; align-self: end`) and the alerts column below that, and
 * together they own roughly x 0-420, y 230-820 of a 1440x900 canvas.
 *
 * So the block is 10 x 8 tiles (640 x 512 CSS px) placed at tile (12,11),
 * which lands at screen x 464-1104, y 130-642 — inside the measured clear
 * region on every side, and every crop below is probed before it is taken.
 *
 * **`NEW_PRISON_ORIGIN_TILE` is `{16,16}` (`src/main.ts:621`) and it falls
 * inside the Canteen.** That is stated rather than avoided, because avoiding it
 * and avoiding the HUD are not simultaneously possible at this camera. It is
 * only the tile a *hire* first stands on and an *admission* arrives on
 * (`src/main.ts:600-620`, `:3014`); this run hires and admits nobody, the
 * counts logged immediately before the pixels are read say `staff: 0` and
 * `prisoners: 0`, and the previous run — whose Reception contained the same
 * tile — measured a per-pixel σ indistinguishable from the room that did not.
 */
const ROOMS = [
  { roomId: 'room.canteen', name: 'Canteen', category: 'food', x: 12, y: 11, width: 6, height: 6 },
  { roomId: 'room.kitchen', name: 'Kitchen', category: 'food', x: 18, y: 11, width: 4, height: 4 },
  { roomId: 'room.reception', name: 'Reception', category: 'operations', x: 18, y: 15, width: 4, height: 4 },
] as const;

/** Every wall edge the three rectangles need, deduplicated — a shared wall is one stored edge. */
function wallRuns(): readonly {
  readonly name: string;
  readonly axis: 'h' | 'v';
  readonly line: number;
  readonly from: number;
  readonly to: number;
}[] {
  return [
    // Canteen 6x6 at (12,11); Kitchen 4x4 to its east; Reception 4x4 below the
    // Kitchen. Party walls are single stored edges shared by both rooms, so
    // these seven runs are 46 edges rather than the 88 three separate
    // perimeters would be.
    { name: 'north-of-canteen-and-kitchen', axis: 'h', line: 11, from: 12, to: 22 },
    { name: 'kitchen-reception-party-wall', axis: 'h', line: 15, from: 18, to: 22 },
    { name: 'south-of-canteen', axis: 'h', line: 17, from: 12, to: 18 },
    { name: 'south-of-reception', axis: 'h', line: 19, from: 18, to: 22 },
    { name: 'west-of-canteen', axis: 'v', line: 12, from: 11, to: 17 },
    { name: 'canteen-kitchen-party-wall', axis: 'v', line: 18, from: 11, to: 19 },
    { name: 'east-of-kitchen-and-reception', axis: 'v', line: 22, from: 11, to: 19 },
  ];
}

/** Every browser console line, so a run with a failed sprite decode cannot be read as evidence. */
function watchConsole(page: Page): string[] {
  const lines: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('[')) return; // this file's own logging, echoed back
    lines.push(`${message.type()}: ${text}`);
  });
  page.on('pageerror', (error) => lines.push(`pageerror: ${error.message}`));
  return lines;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** A clip of the page in CSS pixels, which for the canvas is exactly what the eye receives. */
async function shotRect(
  page: Page,
  name: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<string | undefined> {
  const size = page.viewportSize() ?? { width: 1440, height: 900 };
  const x = Math.max(0, Math.min(rect.x, size.width - 1));
  const y = Math.max(0, Math.min(rect.y, size.height - 1));
  const width = Math.max(1, Math.min(rect.width, size.width - x));
  const height = Math.max(1, Math.min(rect.height, size.height - y));
  if (width < 4 || height < 4) {
    console.log(`clip ${name} is off screen: asked ${JSON.stringify(rect)}, got ${width}x${height}`);
    return undefined;
  }
  const path = `${SHOTS}/${name}.png`;
  await page.screenshot({ path, clip: { x, y, width, height } });
  return path;
}

/**
 * Mean and spread of a PNG already on disk, computed in the page so this file
 * needs no image dependency.
 *
 * The mean is the quantity ADR 0098's arithmetic is about — the tint is a
 * uniform shift, so the difference of two room means *is* `α × |t₁ − t₂|` if
 * the renderer composites the way the arithmetic assumes. The per-pixel σ is
 * the floor's own speckle, which is the other half of the comparison.
 */
async function statistics(
  page: Page,
  sourcePath: string,
): Promise<{ mean: [number, number, number]; sigma: [number, number, number]; pixels: number }> {
  const base64 = readFileSync(sourcePath).toString('base64');
  return page.evaluate(async (data) => {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode failed'));
      image.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
    const count = pixels.length / 4;
    const sum: [number, number, number] = [0, 0, 0];
    const sumSquares: [number, number, number] = [0, 0, 0];
    for (let index = 0; index < pixels.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const value = pixels[index + channel]!;
        sum[channel]! += value;
        sumSquares[channel]! += value * value;
      }
    }
    const mean = sum.map((total) => total / count) as [number, number, number];
    const sigma = sumSquares.map((total, channel) => Math.sqrt(Math.max(0, total / count - mean[channel]! ** 2))) as [
      number,
      number,
      number,
    ];
    return { mean, sigma, pixels: count };
  }, base64);
}

/** Nearest-neighbour upscale, so a 64px crop is legible without inventing a pixel. */
async function upscale(page: Page, sourcePath: string, name: string, factor: number): Promise<void> {
  const base64 = readFileSync(sourcePath).toString('base64');
  const out = await page.evaluate(
    async ({ data, scale }) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('decode failed'));
        image.src = `data:image/png;base64,${data}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1]!;
    },
    { data: base64, scale: factor },
  );
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(out, 'base64'));
}

/**
 * What is actually on top of a rectangle of the page, at nine points.
 *
 * **This exists because the first run of this file was wrong about it.** Three
 * of nine wall drags produced no command at all, and the reason was not the
 * world: the HUD's islands opt back into pointer events over parts of the
 * canvas, so a gesture that starts on one never reaches `WorldScene`. The same
 * geometry decides whether a screenshot clip captures *floor* or captures a
 * panel — so every crop this file measures is probed first, and the probe is
 * reported whether it is clean or not.
 */
async function probeOcclusion(
  page: Page,
  label: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<boolean> {
  const points: { x: number; y: number }[] = [];
  for (const fx of [0.02, 0.5, 0.98]) for (const fy of [0.02, 0.5, 0.98]) {
    points.push({ x: Math.round(rect.x + rect.width * fx), y: Math.round(rect.y + rect.height * fy) });
  }
  const owners = await page.evaluate((probes) => {
    return probes.map((point) => {
      const node = document.elementFromPoint(point.x, point.y);
      if (node === null) return `${point.x},${point.y}: (nothing)`;
      const island = node.closest('.hud, .save-panel, .hud-strip');
      const what = island === null ? node.tagName.toLowerCase() : `${island.className.split(' ')[0]}`;
      return `${point.x},${point.y}: ${what}`;
    });
  }, points);
  const clean = owners.every((line) => line.endsWith('canvas'));
  console.log(`OCCLUSION ${label}: ${clean ? 'clear canvas at all nine points' : 'NOT CLEAR'} — ${JSON.stringify(owners)}`);
  return clean;
}

/** Presses a zoom button `n` times, checking each press actually lands on it. */
async function zoomBy(page: Page, direction: 'in' | 'out', presses: number): Promise<void> {
  const button = page.locator(`.hud-zoom__${direction}`);
  for (let index = 0; index < presses; index += 1) {
    const box = await button.boundingBox();
    if (box === null) throw new Error(`the zoom ${direction} button has no box`);
    const landedOn = await page.evaluate(
      ({ x, y }) => {
        const node = document.elementFromPoint(x, y);
        if (node === null) return '(nothing)';
        const owner = node.closest('.hud-zoom__in, .hud-zoom__out');
        return owner === null ? `MISS ${node.tagName}` : `HIT ${owner.className}`;
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    if (!landedOn.startsWith('HIT')) console.log(`zoom ${direction} press ${index}: ${landedOn}`);
    await button.click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
}

/** Disarms whatever tool is holding the pointer and parks the mouse off the world. */
async function stopBuildingAndLookAway(page: Page): Promise<void> {
  await tab(page, 'build').click();
  const arm = page.locator('.hud-build__arm');
  const label = (await arm.innerText()).trim();
  if (/^stop/i.test(label)) {
    await arm.click();
    console.log(`disarmed the build tool (its label read ${JSON.stringify(label)})`);
  }
  await tab(page, 'zones').click();
  const roomsArm = page.locator('.hud-rooms__arm');
  if ((await roomsArm.count()) > 0) {
    const roomsLabel = (await roomsArm.innerText()).trim();
    if (/^stop/i.test(roomsLabel)) {
      await roomsArm.click();
      console.log(`disarmed the rooms tool (its label read ${JSON.stringify(roomsLabel)})`);
    }
  }
  await tab(page, 'overview').click();
  await page.mouse.move(1300, 820);
  await page.waitForTimeout(900);
}

// ---------------------------------------------------------------------------

test.setTimeout(1_500_000);

test(`can you name the room — ${LABEL} palette`, async ({ page }) => {
  const console_ = watchConsole(page);
  await installTee(page);
  await openApp(page);

  console.log(`RUN LABEL: ${LABEL}`);
  console.log(`viewport: ${JSON.stringify(page.viewportSize())} dpr ${await page.evaluate(() => window.devicePixelRatio)}`);

  // What the shipped tint table actually holds in *this* tree, read out of the
  // running bundle rather than out of the file, so a local palette edit that
  // failed to reach the browser cannot be mistaken for one that did.
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');

  // --- Act 1: build the three rooms -----------------------------------------

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`calibration: tile (0,0) top-left = (${origin.originX}, ${origin.originY})`);
  for (const room of ROOMS) {
    const topLeft = centreOf(origin, room.x, room.y);
    const bottomRight = centreOf(origin, room.x + room.width - 1, room.y + room.height - 1);
    console.log(
      `${room.name} tiles (${room.x},${room.y})..(${room.x + room.width - 1},${room.y + room.height - 1})` +
        ` -> screen centres ${JSON.stringify(topLeft)}..${JSON.stringify(bottomRight)}`,
    );
  }

  const runs = wallRuns();
  const edgeCount = runs.reduce((total, run) => total + (run.to - run.from), 0);
  console.log(`${runs.length} wall runs, ${edgeCount} edges, so ${edgeCount * 2} bricks are needed`);
  await buy(page, 'wall-brick', edgeCount * 2 + 20);
  console.log(`after buying: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);

  await fastForwardToMax(page);
  await page.waitForTimeout(4000);
  console.log(`deliveries after running: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  /*
   * WALLS GO IN THROUGH THE BUILD PANEL'S NUMERIC ROUTE, NOT THROUGH A DRAG,
   * AND THE FIRST RUN OF THIS FILE IS WHY.
   *
   * Dragging along a wall line is how a player builds, and it worked for six of
   * the nine runs below. The other three produced **zero** commands, because
   * the drag's first point landed on a HUD island rather than on the canvas —
   * `hud.css`'s "Every interactive island opts back in" — and a gesture a panel
   * captures never reaches `WorldScene` at all. A play-test that silently built
   * two thirds of a prison and then measured the floor of a room that was never
   * enclosed would have reported the wrong thing entirely.
   *
   * The numeric route is the same command, produced from the panel the code
   * calls "the keyboard route" (`src/main.ts`'s `place-object` note, and
   * `hud.rooms.coordinates-hint`: *"The keyboard route. Dragging on the map is
   * quicker."*). It places one edge per submission, and every submission is
   * checked against the `PlaceBuildOrder` it produced — `definitionId`, `x`,
   * `y` and `edge` — which is how the count below is verified rather than
   * assumed.
   */
  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  if ((await page.locator('.hud-build__coordinates').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-build__coordinates > .ui-section__header').click();
  }
  const xInput = page.locator('.hud-build__coords .ui-number__input').first();
  const yInput = page.locator('.hud-build__coords .ui-number__input').nth(1);
  const submitOrder = page.locator('.hud-build__coordinates .ui-action');

  let ordered = 0;
  let wrongDefinition = 0;
  let misplaced = 0;
  for (const run of runs) {
    const produced: string[] = [];
    for (let step = run.from; step < run.to; step += 1) {
      const tileX = run.axis === 'h' ? step : run.line;
      const tileY = run.axis === 'h' ? run.line : step;
      const edge = run.axis === 'h' ? 'north' : 'west';
      await xInput.fill(String(tileX));
      await yInput.fill(String(tileY));
      await page.locator(`.hud-build__coordinates [data-choice="${edge}"]`).click();
      const before = (await sentCommands(page)).length;
      await submitOrder.click();
      await page.waitForTimeout(60);
      const commands = (await sentCommands(page)).slice(before);
      const order = commands.find((c) => c['type'] === 'PlaceBuildOrder');
      // VERIFY WHAT WAS PLACED, off the command rather than off the arm label.
      // #1017's race — `armBuildable` reading a label that can be stale — is
      // fixed on `agent/1017-arm-buildable-race` and not on this tree, so the
      // label is never trusted here for anything.
      if (order === undefined) {
        produced.push(`(${tileX},${tileY} ${edge}) NO COMMAND`);
        continue;
      }
      if (order['definitionId'] !== 'wall-brick') wrongDefinition += 1;
      if (order['x'] !== tileX || order['y'] !== tileY || order['edge'] !== edge) {
        misplaced += 1;
        produced.push(`(${tileX},${tileY} ${edge}) LANDED ON ${String(order['x'])},${String(order['y'])} ${String(order['edge'])}`);
        continue;
      }
      ordered += 1;
      produced.push(`${tileX},${tileY} ${edge}`);
    }
    console.log(`wall run ${run.name} (${run.axis} line ${run.line}, ${run.from}..${run.to}): ${JSON.stringify(produced)}`);
  }
  console.log(
    `TOTAL wall orders verified: ${ordered} of ${edgeCount} asked for;` +
      ` off-brand definitionIds: ${wrongDefinition}; landed on the wrong edge: ${misplaced}`,
  );

  const queueEmptyAt = await waitForQueueEmpty(page, 300_000);
  console.log(`Build panel says the queue is empty at page t=${queueEmptyAt}ms, tick ${await currentTick(page)}`);

  // --- Act 2: zone the three rooms ------------------------------------------

  /*
   * ZONING GOES IN THROUGH THE ROOMS PANEL'S COORDINATE FORM, for the same
   * reason. The drag route did reach the world on the first run — every
   * `ZoneRoom` carried the exact rectangle asked for — but a rectangle typed
   * into four fields cannot be off by a pixel at all, and the retry loop below
   * exists for the *enclosure* verdict rather than for the gesture.
   *
   * The retry is not superstition: the Rooms panel reads its enclosure verdict
   * off a world view that a snapshot replaces, and a completed wall does not
   * mark it dirty (`docs/research/2026-08-29-playtest-ordering-and-the-second-room.md`
   * §7). How many attempts each room takes is itself a measurement.
   */
  const zoned: string[] = [];
  await tab(page, 'zones').click();
  if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }
  if ((await page.locator('.hud-rooms__coordinates').getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-rooms__coordinates > .ui-section__header').click();
  }
  for (const room of ROOMS) {
    let accepted = false;
    for (let attempt = 1; attempt <= 10 && !accepted; attempt += 1) {
      await tab(page, 'zones').click();
      await page.locator(`.hud-rooms__list [data-room="${room.roomId}"]`).click();
      if ((await page.locator('.hud-rooms__coordinates').getAttribute('data-collapsed')) === 'true') {
        await page.locator('.hud-rooms__coordinates > .ui-section__header').click();
      }
      await page.locator('.hud-rooms__coord-x .ui-number__input').fill(String(room.x));
      await page.locator('.hud-rooms__coord-y .ui-number__input').fill(String(room.y));
      await page.locator('.hud-rooms__coord-width .ui-number__input').fill(String(room.width));
      await page.locator('.hud-rooms__coord-height .ui-number__input').fill(String(room.height));
      const before = (await sentCommands(page)).length;
      /*
       * TWO PRESSES, AND THE FIRST RUN THROUGH THIS ROUTE PROVED IT.
       *
       * `.hud-rooms__coordinates-submit` does not zone anything: its handler is
       * `adoptPendingArea(next, options.classifyArea(next))`
       * (`src/ui/hud/rooms-panel.ts:845-858`), which makes the rectangle
       * *pending* so the panel can show its minimum-size and enclosure
       * verdicts. `.hud-rooms__confirm` is what submits `ZoneRoom`. Pressing
       * only the first produced no command at all and left the refusal band
       * showing a stale line from the calibration presses, which reads exactly
       * like a refusal of the zoning and is not one.
       */
      await page.locator('.hud-rooms__coordinates-submit').click();
      await page.waitForTimeout(250);
      console.log(`${room.name} attempt ${attempt}: after "use these tiles" the panel says ${JSON.stringify(
        (await panelText(page, '.hud-rooms')).split('\n').filter((l) => /OPEN|ENCLOS|SMALL|AREA|TILES/i.test(l)),
      )}`);
      await page.locator('.hud-rooms__confirm').click();
      await page.waitForTimeout(900);
      const produced = (await sentCommands(page)).slice(before);
      const zone = produced.find((c) => c['type'] === 'ZoneRoom');
      const counts = await latestCounts(page);
      // VERIFY WHAT WAS ZONED, off the command: the room id and the rectangle
      // both travel on `ZoneRoom` (`src/main.ts:2718-2725`).
      console.log(
        `${room.name} attempt ${attempt}: ZoneRoom=${JSON.stringify(zone)} | rooms=${counts?.rooms}` +
          ` | refusal band ${JSON.stringify(await panelText(page, '.hud__refusal'))}`,
      );
      if (
        zone !== undefined &&
        zone['roomId'] === room.roomId &&
        zone['x'] === room.x &&
        zone['y'] === room.y &&
        zone['width'] === room.width &&
        zone['height'] === room.height &&
        (counts?.rooms ?? 0) > zoned.length
      ) {
        accepted = true;
        zoned.push(room.roomId);
      } else await page.waitForTimeout(4000);
    }
    console.log(`${room.name}: ${accepted ? 'ZONED' : 'NOT ZONED'} (rooms now ${(await latestCounts(page))?.rooms})`);
  }
  console.log(`ROOMS VERIFIED ZONED: ${zoned.length}/${ROOMS.length} — ${JSON.stringify(zoned)}`);
  console.log(`rooms panel:\n${await panelText(page, '.hud-rooms')}`);

  await stopBuildingAndLookAway(page);
  console.log(`counts before any pixel is read: ${JSON.stringify(await latestCounts(page))}`);

  // --- Act 3: the pixels ----------------------------------------------------

  /*
   * The interior of each room, inset by half a tile on every side so no wall
   * line, no wall shadow and no room-boundary pixel enters the sample. What is
   * left is floor and the tint over it, which is the only thing the arithmetic
   * is about.
   */
  const interior = (room: (typeof ROOMS)[number]) => ({
    x: Math.round(origin.originX + room.x * TILE + TILE / 2),
    y: Math.round(origin.originY + room.y * TILE + TILE / 2),
    width: Math.round((room.width - 1) * TILE),
    height: Math.round((room.height - 1) * TILE),
  });

  const measured = new Map<string, { mean: [number, number, number]; sigma: [number, number, number] }>();
  for (const room of ROOMS) {
    const rect = interior(room);
    await probeOcclusion(page, `${room.name} interior`, rect);
    const path = await shotRect(page, `floor-${room.name.toLowerCase()}`, rect);
    if (path === undefined) continue;
    const stats = await statistics(page, path);
    measured.set(room.name, { mean: stats.mean, sigma: stats.sigma });
    console.log(
      `FLOOR ${room.name} (${room.category}) over ${stats.pixels} px at ${JSON.stringify(rect)}:` +
        ` mean RGB ${stats.mean.map((v) => v.toFixed(2)).join(' / ')}` +
        ` | per-pixel σ ${stats.sigma.map((v) => v.toFixed(2)).join(' / ')}`,
    );
  }

  for (const [a, b] of [
    ['Canteen', 'Kitchen'],
    ['Kitchen', 'Reception'],
    ['Canteen', 'Reception'],
  ] as const) {
    const left = measured.get(a);
    const right = measured.get(b);
    if (left === undefined || right === undefined) continue;
    const delta = left.mean.map((value, index) => value - right.mean[index]!) as [number, number, number];
    const euclid = Math.sqrt(delta.reduce((total, value) => total + value * value, 0));
    console.log(
      `PAIR ${a} vs ${b}: ΔRGB ${delta.map((v) => v.toFixed(2)).join(' / ')}` +
        ` | Euclidean ${euclid.toFixed(2)} | mean per-pixel σ of the two ${(
          (left.sigma.reduce((t, v) => t + v, 0) + right.sigma.reduce((t, v) => t + v, 0)) /
          6
        ).toFixed(2)}`,
    );
  }

  // --- Act 4: what a player actually sees, at three zooms --------------------

  const wideRect = {
    x: Math.round(origin.originX + 12 * TILE) - 8,
    y: Math.round(origin.originY + 11 * TILE) - 8,
    width: 10 * TILE + 16,
    height: 8 * TILE + 16,
  };
  await probeOcclusion(page, 'the three-room block', wideRect);
  const wide = await shotRect(page, 'zoom1-three-rooms', wideRect);
  console.log(`wide crop at zoom 1: ${JSON.stringify(wideRect)} -> ${wide ?? 'OFF SCREEN'}`);

  /*
   * The seams themselves, at native scale and magnified. `seam-canteen-kitchen`
   * straddles the party wall between two rooms of the same category, which
   * `zoningTint` paints with one colour; `seam-kitchen-reception` straddles the
   * 4.06-unit `operations`/`food` pair.
   */
  const seamFood = {
    x: Math.round(origin.originX + 16 * TILE),
    y: Math.round(origin.originY + 11 * TILE),
    width: 4 * TILE,
    height: 4 * TILE,
  };
  const seamOps = {
    x: Math.round(origin.originX + 18 * TILE),
    y: Math.round(origin.originY + 13 * TILE),
    width: 4 * TILE,
    height: 4 * TILE,
  };
  await probeOcclusion(page, 'the Canteen/Kitchen seam', seamFood);
  await probeOcclusion(page, 'the Kitchen/Reception seam', seamOps);
  const foodPath = await shotRect(page, 'seam-canteen-kitchen', seamFood);
  const opsPath = await shotRect(page, 'seam-kitchen-reception', seamOps);
  if (foodPath !== undefined) await upscale(page, foodPath, 'seam-canteen-kitchen-x3', 3);
  if (opsPath !== undefined) await upscale(page, opsPath, 'seam-kitchen-reception-x3', 3);

  await shot(page, 'zoom1-full-page');

  await zoomBy(page, 'out', 3);
  await shot(page, 'zoomed-out-full-page');
  await zoomBy(page, 'in', 6);
  await shot(page, 'zoomed-in-full-page');
  await zoomBy(page, 'out', 3);
  await page.waitForTimeout(400);
  await shot(page, 'back-at-zoom1-full-page');

  // --- Act 5: the legend ----------------------------------------------------

  /*
   * `HudRoomViewModel.tint` is produced at `src/main.ts:980` from the same
   * `zoningTint`. What the panel *does* with it is the question, and it is read
   * here off the live DOM rather than off the file.
   */
  await tab(page, 'zones').click();
  const collapsed = await page.locator('.hud-rooms').getAttribute('data-collapsed');
  if (collapsed === 'true') await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  await page.waitForTimeout(300);
  const legend = await page.evaluate(() => {
    const out: Record<string, unknown>[] = [];
    for (const row of document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')) {
      const colours = new Set<string>();
      for (const node of [row, ...row.querySelectorAll<HTMLElement>('*')]) {
        const style = getComputedStyle(node);
        colours.add(`bg=${style.backgroundColor} fill=${style.fill} color=${style.color} border=${style.borderColor}`);
      }
      out.push({
        room: row.dataset['room'],
        text: (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
        distinctComputedColours: [...colours],
      });
    }
    return out;
  });
  console.log(`ROOMS CATALOGUE ROWS (${legend.length}):`);
  for (const row of legend) console.log(`  ${JSON.stringify(row)}`);
  const roomsBox = await page.locator('.hud-rooms').boundingBox();
  if (roomsBox !== null) await shotRect(page, 'rooms-catalogue', roomsBox);

  await tab(page, 'build').click();
  const buildBox = await page.locator('.hud-build').boundingBox();
  if (buildBox !== null) await shotRect(page, 'build-catalogue', buildBox);

  // --- The console, which is what makes every visual claim above admissible --

  console.log(`\nBROWSER CONSOLE (${console_.length} lines):\n${console_.map((line) => `  ${line}`).join('\n')}`);
});
