import { test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  runUntilTick,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **What does the world view actually show a player, now that the sprites are
 * real?**
 *
 * Every visual claim in this repository was made either from a tree whose
 * `public/assets/**` was git-LFS pointer text -- in which case the browser
 * loses every actor atlas, logs `InvalidStateError: The source image could not
 * be decoded`, and *passes anyway*, because the simulation lives in the worker
 * and does not care whether anything was drawn -- or by reading code. This
 * instrument is run in a tree where
 * `file public/assets/actors/actor.guard.base.idle.png` answers
 * `PNG image data, 260 x 3104` and all 62 git-LFS paths are real bytes.
 *
 * Findings live in `docs/research/2026-09-05-what-the-world-shows.md`.
 *
 * Nothing in CI collects this: `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, and only
 * `tests/browser/playwright.playtest.config.ts` matches `*.playtest.ts`. A
 * playtest is evidence, never a gate.
 */

const SHOTS = 'docs/research/2026-09-05-what-the-world-shows';

mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/**
 * A rectangle of the *page* in CSS pixels, which for a canvas region is exactly
 * what a player's eye receives at the default zoom. Clipped to the viewport,
 * because a clip that leaves it throws rather than truncating.
 */
async function shotRect(
  page: Page,
  name: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const size = page.viewportSize() ?? { width: 1440, height: 900 };
  const x = Math.max(0, Math.min(rect.x, size.width - 1));
  const y = Math.max(0, Math.min(rect.y, size.height - 1));
  const width = Math.max(1, Math.min(rect.width, size.width - x));
  const height = Math.max(1, Math.min(rect.height, size.height - y));
  const path = `${SHOTS}/${name}.png`;
  await page.screenshot({ path, clip: { x, y, width, height } });
  return path;
}

/**
 * Nearest-neighbour upscale of a PNG already on disk, done in the page so this
 * file needs no image dependency.
 *
 * **Why this exists at all.** The question "can a player tell a guard from a
 * prisoner" is answered by looking at the pixels a player gets, and those are
 * 64 CSS px per tile. A 64x64 crop is a faithful record and an unreadable
 * artefact. So the crop above is the evidence and this is the magnifying glass
 * beside it: `imageSmoothingEnabled = false` means it invents nothing -- every
 * output pixel is a source pixel repeated, so a colour read off the upscale is
 * a colour that was on screen.
 */
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
 * Buys `quantity` of one buildable, or reports that the game would not sell it.
 *
 * **Why this is not `buy` from the harness.** That one presses the submit
 * control unconditionally, and #772 landed a Buy button that *disables itself
 * when the press would be refused* -- so on an order the treasury cannot cover,
 * `locator.click()` waits for an actionable control until the test timeout.
 * A showroom of eighteen buildables is exactly the order that runs out of
 * money, and the first attempt at this act sat on a disabled Buy for six
 * minutes before it was killed. So this reads the control first and reports
 * the refusal as data.
 */
async function buyOrReport(page: Page, buildableId: string, quantity: number): Promise<boolean> {
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  const buyRow = page.locator('.hud-build__buy');
  if (await buyRow.isHidden()) await page.locator('.hud-build__buy-toggle').click();
  await page.locator('.hud-build__buy .ui-number__input').fill(String(quantity));
  const submit = page.locator('.hud-build__buy-submit');
  await page.waitForTimeout(150);
  if (await submit.isDisabled()) {
    console.log(`buy ${buildableId} x${quantity}: REFUSED, control disabled — ${JSON.stringify((await page.locator('.hud-build__buy').innerText()).replace(/\s+/g, ' ').trim())}`);
    return false;
  }
  await submit.click();
  await page.waitForTimeout(200);
  return true;
}

/** The canvas's own box, in CSS pixels, so a clip can be checked against it. */
async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#game-root canvas').boundingBox();
  if (box === null) throw new Error('no canvas box');
  return box;
}

/**
 * Every browser console line, kept.
 *
 * **This is the check that makes every screenshot below worth anything.** A
 * tree whose actor atlases are git-LFS pointers logs ten
 * `Failed to process file: image "..."` lines and an
 * `InvalidStateError: The source image could not be decoded` here, and the run
 * still passes. So the absence of those lines is reported beside the pictures,
 * not assumed.
 */
function watchConsole(page: Page): string[] {
  const lines: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('[')) return; // the harness's own logging
    lines.push(`${message.type()}: ${text}`);
  });
  page.on('pageerror', (error) => lines.push(`pageerror: ${error.message}`));
  return lines;
}

/** Everything a player can read without changing tab. */
async function ambient(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const read = (selector: string): string => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) return '(absent)';
      if (node.hidden || node.getClientRects().length === 0) return '(not laid out)';
      return (node.innerText ?? '').replace(/\s+/g, ' ').trim();
    };
    return {
      strip: read('.hud-strip'),
      refusal: read('.hud__refusal'),
      event: read('.hud__event'),
      alerts: read('.hud-alerts__list'),
    };
  });
}

test('act 0 — recon: what the page offers, and what the empty world looks like', async ({ page }) => {
  const console_ = watchConsole(page);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1200);

  const box = await canvasBox(page);
  console.log(`canvas box: ${JSON.stringify(box)}`);
  console.log(`viewport: ${JSON.stringify(page.viewportSize())}`);
  console.log(`devicePixelRatio: ${await page.evaluate(() => window.devicePixelRatio)}`);
  console.log(
    `canvas attrs: ${await page.evaluate(() => {
      const c = document.querySelector('#game-root canvas') as HTMLCanvasElement | null;
      return c === null ? 'none' : JSON.stringify({ width: c.width, height: c.height, style: c.getAttribute('style') });
    })}`,
  );

  await shot(page, 'act0-arrival-full');
  const empty = await shotRect(page, 'act0-arrival-canvas-400', { x: box.x + 40, y: box.y + 40, width: 400, height: 400 });
  await upscale(page, empty, 'act0-arrival-canvas-400-x3', 3);

  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);

  for (const id of ['overview', 'build', 'zones', 'manage', 'day-plan'] as const) {
    await tab(page, id).click();
    await page.waitForTimeout(250);
    console.log(`\n----- TAB ${id} -----\n${await panelText(page, '.hud__panels')}`);
  }

  await tab(page, 'build').click();
  console.log(
    `\nBUILD CATALOGUE:\n${(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')].map(
          (n) => `  ${n.getAttribute('data-buildable')} :: ${(n.innerText ?? '').replace(/\s+/g, ' ').trim()}`,
        ),
      )
    ).join('\n')}`,
  );

  await tab(page, 'zones').click();
  console.log(
    `\nROOM CATALOGUE:\n${(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')].map(
          (n) => `  ${n.getAttribute('data-room')} :: ${(n.innerText ?? '').replace(/\s+/g, ' ').trim()}`,
        ),
      )
    ).join('\n')}`,
  );

  await tab(page, 'manage').click();
  console.log(
    `\nSTAFF CATALOGUE:\n${(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-staff__list [data-staff-role]')].map(
          (n) => `  ${n.getAttribute('data-staff-role')} :: ${(n.innerText ?? '').replace(/\s+/g, ' ').trim()}`,
        ),
      )
    ).join('\n')}`,
  );

  // Anything on the page that could be a camera control, named.
  console.log(
    `\nCAMERA-ISH CONTROLS:\n${(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
          .map((n) => `  <${n.tagName.toLowerCase()} class="${n.className}"> ${JSON.stringify((n.innerText ?? '').replace(/\s+/g, ' ').trim())} aria-label=${JSON.stringify(n.getAttribute('aria-label'))}`)
          .filter((line) => /zoom|camera|centre|center|minimap|fit/i.test(line)),
      )
    ).join('\n')}`,
  );

  console.log(`\nBROWSER CONSOLE (${console_.length} lines):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * The room `buildAndPopulate` draws, in tiles, and the page rectangle it
 * occupies. Everything below crops to this, so every picture in the record is
 * the same patch of world at the same scale.
 */
const ROOM = { x0: 12, y0: 12, x1: 17, y1: 17 } as const;

function roomRect(origin: { originX: number; originY: number }, pad = TILE): { x: number; y: number; width: number; height: number } {
  return {
    x: origin.originX + ROOM.x0 * TILE - pad,
    y: origin.originY + ROOM.y0 * TILE - pad,
    width: (ROOM.x1 - ROOM.x0 + 1) * TILE + pad * 2,
    height: (ROOM.y1 - ROOM.y0 + 1) * TILE + pad * 2,
  };
}

/**
 * Where the renderer put every actor, read off the worker feed rather than off
 * the pixels.
 *
 * The tee drops `simulation/delta` and `simulation/snapshot` on purpose (they
 * are the big ones), so actor positions are not in it. This asks the page
 * instead: whatever `window.lockstate*` exposes about actors, dumped. If
 * nothing is exposed it says so, and the pixel evidence stands alone.
 */
async function actorProbe(page: Page): Promise<string> {
  return page.evaluate(() => {
    const globals = Object.keys(window).filter((key) => key.toLowerCase().startsWith('lockstate'));
    return JSON.stringify(globals);
  });
}

test('act 1 — four prisoners and two guards, and whether you can tell them apart', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 2, label: 'act1' });
  console.log(`globals: ${await actorProbe(page)}`);

  await fastForwardToMax(page);
  await page.waitForTimeout(20_000);

  await tab(page, 'overview').click();
  await page.waitForTimeout(400);
  console.log(`ambient at tick ${await currentTick(page)}: ${JSON.stringify(await ambient(page))}`);
  console.log(`counts: ${JSON.stringify(await latestCounts(page))}`);

  await shot(page, 'act1-full');
  const rect = roomRect(origin);
  console.log(`room rect: ${JSON.stringify(rect)} origin=${JSON.stringify(origin)}`);
  const room = await shotRect(page, 'act1-room', rect);
  await upscale(page, room, 'act1-room-x3', 3);

  // The single tile every arrival is written to, magnified hard: this is where
  // the "can you tell them apart" question is actually decided.
  const anchor = { x: origin.originX + ROOM.x0 * TILE, y: origin.originY + ROOM.y0 * TILE, width: TILE * 2, height: TILE * 2 };
  const anchorShot = await shotRect(page, 'act1-anchor-tile', anchor);
  await upscale(page, anchorShot, 'act1-anchor-tile-x8', 8);

  // And the guards, who are not in the room: the whole canvas, magnified twice,
  // in two halves so the upscale stays a sane size.
  const half = await shotRect(page, 'act1-canvas-left', { x: 0, y: 80, width: 720, height: 740 });
  await upscale(page, half, 'act1-canvas-left-x2', 2);

  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * Every object in the build catalogue, one per tile, on bare ground, in the
 * order the catalogue lists them.
 *
 * **Why on bare ground rather than inside a room.** A room paints its own floor
 * and the question here is what the *object* draws, so a designated floor under
 * it would be one more thing to subtract. If a placement is refused outside a
 * room the refusal is logged and the tile stays empty, which is itself an
 * answer.
 */
const SHOWROOM: readonly string[] = [
  'bed-wooden',
  'toilet-brick',
  'desk-wooden',
  'chair-wooden',
  'dining-table-wooden',
  'bench-wooden',
  'bookshelf-wooden',
  'fridge-brick',
  'stove-brick',
  'prep-counter-brick',
  'washing-machine-brick',
  'shower-head-brick',
  'storage-rack-wooden',
  'medical-bed-wooden',
  'medicine-cabinet-wooden',
  'security-console-brick',
  'utility-panel-brick',
  'waste-bin-brick',
];

test('act 2 — the showroom: what each buildable actually draws', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(500);

  await tab(page, 'build').click();
  const origin = await calibrate(page);
  console.log(`origin: ${JSON.stringify(origin)}`);

  /*
   * **The first shape of this act placed the objects on bare ground and got
   * nothing at all**, and the game said why, in the refusal band, in a
   * sentence worth quoting: *"The object was not placed -- it has to stand in
   * a room you have zoned."* So the showroom is a zoned room.
   *
   * Its bounds are chosen against the HUD rather than against the world. The
   * right-hand rail, the minimap column and the tab bar all opt back into
   * pointer events, so a press at tile x=24 or at tile (10,17) lands on a
   * panel and produces no command -- which is exactly what happened to
   * `fridge-brick`, `stove-brick`, `prep-counter-brick`, `utility-panel-brick`
   * and `waste-bin-brick` on the first attempt, and to the whole **east wall
   * run** on the second -- a drag along the edge of tile x=23 sits at page
   * x=1168, four pixels inside the rail, and produced *zero* commands, so the
   * rectangle was never enclosed and the designation was refused ten times
   * over. Tiles 12..21 by 12..20 are canvas a pointer can actually reach at
   * 1440x900.
   */
  const sold: string[] = [];
  const unsold: string[] = [];
  await buyOrReport(page, 'wall-brick', 100);
  await buyOrReport(page, 'door-wooden', 2);
  for (const id of SHOWROOM) {
    if (await buyOrReport(page, id, 1)) sold.push(id);
    else unsold.push(id);
  }
  console.log(`sold: ${JSON.stringify(sold)}`);
  console.log(`unsold: ${JSON.stringify(unsold)}`);
  console.log(`funds after buying: ${JSON.stringify((await latestCounts(page))?.treasuryMinorUnits)}`);
  await fastForwardToMax(page);
  await page.waitForTimeout(4000);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 22 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 21 * TILE;
  for (const run of [
    { name: 'north', a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { name: 'south', a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { name: 'west', a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { name: 'east', a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    const before = (await sentCommands(page)).length;
    await drag(page, run.a, run.b);
    console.log(`wall run ${run.name}: ${(await sentCommands(page)).length - before} command(s)`);
  }
  await waitForQueueEmpty(page);

  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'zones').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 21, 20));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    if (((await latestCounts(page))?.rooms ?? 0) > 0) break;
    if (attempts >= 10) throw new Error('the showroom rectangle was never accepted as a room');
    await page.waitForTimeout(4000);
  }
  console.log(`showroom zoned after ${attempts} attempt(s)`);

  await tab(page, 'build').click();
  const placed: { id: string; tx: number; ty: number }[] = [];
  for (const [index, id] of sold.entries()) {
    const tx = 13 + (index % 5) * 2;
    const ty = 13 + Math.floor(index / 5) * 2;
    await armBuildable(page, id);
    const point = centreOf(origin, tx, ty);
    const commands = await press(page, point.x, point.y);
    console.log(`${id} at (${tx},${ty}): ${JSON.stringify(commands)}`);
    if (commands.length > 0) placed.push({ id, tx, ty });
  }

  // A door in the south wall, as the reference: act 1 showed walls drawn with
  // real texture, so the door beside them says whether that generalises.
  await armBuildable(page, 'door-wooden');
  const doorPoint = centreOf(origin, 16, 20);
  console.log(`door: ${JSON.stringify(await press(page, doorPoint.x, doorPoint.y + TILE / 2 - 4))}`);

  try {
    await waitForQueueEmpty(page, 300_000);
  } catch (error) {
    console.log(`the queue never emptied: ${String(error)}`);
  }
  await page.waitForTimeout(4000);
  console.log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
  console.log(`placed ${placed.length} of ${sold.length} sold (${SHOWROOM.length} in the catalogue): ${JSON.stringify(placed)}`);
  console.log(`refusal: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
  await tab(page, 'overview').click();
  await page.waitForTimeout(600);

  await shot(page, 'act2-showroom-full');
  const rect = {
    x: origin.originX + 12 * TILE,
    y: origin.originY + 12 * TILE,
    width: 10 * TILE,
    height: 9 * TILE,
  };
  console.log(`showroom rect: ${JSON.stringify(rect)}`);
  const showroom = await shotRect(page, 'act2-showroom', rect);
  await upscale(page, showroom, 'act2-showroom-x2', 2);

  // Row one alone, magnified, so each object is 256px wide on the page.
  const rowOne = await shotRect(page, 'act2-row-one', {
    x: origin.originX + 12 * TILE,
    y: origin.originY + 12 * TILE,
    width: 10 * TILE,
    height: 3 * TILE,
  });
  await upscale(page, rowOne, 'act2-row-one-x4', 4);

  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * A cell that works and a cell that is sealed shut, drawn at the same tick,
 * cropped to the same rectangle, so the two files can be compared byte for
 * byte.
 *
 * **This re-measures issue #944's headline result with the art present.** That
 * report compared a working cell and a dead cell and found the screenshots
 * *byte-identical* -- measured in a tree with no actor sprites at all, where
 * every screenshot was of an empty floor, so the identity was guaranteed by
 * the missing art rather than by the game. With sprites, the question is open
 * again and worth asking honestly.
 */
async function cellRun(page: Page, options: { readonly door: boolean; readonly label: string; readonly untilTick: number }): Promise<{ origin: { originX: number; originY: number }; shot: string }> {
  const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 2, label: options.label });

  if (options.door) {
    await tab(page, 'build').click();
    await armBuildable(page, 'door-wooden');
    // The south edge of tile (14,17) -- an edge that already carries a brick
    // wall, which the game accepts without a removal first.
    const point = centreOf(origin, 14, 17);
    const commands = await press(page, point.x, point.y + TILE / 2 - 4);
    console.log(`[${options.label}] door order: ${JSON.stringify(commands)}`);
    await waitForQueueEmpty(page);
    await page.waitForTimeout(2000);
  }

  await tab(page, 'zones').click();
  await page.waitForTimeout(300);
  console.log(`[${options.label}] rooms panel: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);

  await fastForwardToMax(page);
  /*
   * **`runUntilTick`'s default 180 s budget is not enough for this on a loaded
   * box, and it cost act 3b its screenshot.** The first attempt threw
   * `stuck at tick 20031, wanted 24000` at load average around 9 with another
   * agent's browser suite running, and a thrown act produces no evidence at
   * all -- which is the worst outcome for an instrument whose only product is
   * evidence. So the budget is fifteen minutes, and falling short is a logged
   * reading rather than a failure: the act screenshots whatever tick it
   * reached and says so.
   */
  try {
    await runUntilTick(page, options.untilTick, 900_000);
  } catch (error) {
    console.log(`[${options.label}] did not reach tick ${options.untilTick}: ${String(error)}`);
  }
  await tab(page, 'overview').click();
  await page.waitForTimeout(600);

  console.log(`[${options.label}] tick ${await currentTick(page)} counts ${JSON.stringify(await latestCounts(page))}`);
  console.log(`[${options.label}] ambient: ${JSON.stringify(await ambient(page))}`);

  const shotPath = await shotRect(page, `act3-${options.label}`, roomRect(origin, 0));
  await upscale(page, shotPath, `act3-${options.label}-x3`, 3);
  await shot(page, `act3-${options.label}-full`);
  return { origin, shot: shotPath };
}

test('act 3a — a cell with a door, run to tick 24000', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  await cellRun(page, { door: true, label: 'working', untilTick: 24_000 });
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

test('act 3b — the same cell sealed shut, run to tick 24000', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  await cellRun(page, { door: false, label: 'sealed', untilTick: 24_000 });
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * Twelve, then fifty. `buildAndPopulate` lays at most twelve beds (two rows of
 * six), so the second half of this run admits into a prison with no free bed,
 * which is the case a player reaches by pressing Admit one more time than they
 * should.
 */
test('act 4 — stacking at twelve and at fifty', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(1_200_000);
  await installTee(page);
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 12, admits: 12, guards: 2, label: 'act4' });
  await fastForwardToMax(page);
  await page.waitForTimeout(15_000);
  await tab(page, 'overview').click();
  await page.waitForTimeout(400);
  console.log(`twelve: tick ${await currentTick(page)} counts ${JSON.stringify(await latestCounts(page))}`);
  await shot(page, 'act4-twelve-full');
  const twelve = await shotRect(page, 'act4-twelve', roomRect(origin, 0));
  await upscale(page, twelve, 'act4-twelve-x3', 3);
  const twelveAnchor = await shotRect(page, 'act4-twelve-anchor', {
    x: origin.originX + ROOM.x0 * TILE - TILE,
    y: origin.originY + ROOM.y0 * TILE - TILE,
    width: TILE * 4,
    height: TILE * 4,
  });
  await upscale(page, twelveAnchor, 'act4-twelve-anchor-x4', 4);

  /*
   * Guarded rather than pressed blind, for the reason `buyOrReport` above is
   * guarded: a control that disables itself when the press would be refused
   * (#772) turns `locator.click()` into a wait for the test timeout. Twelve
   * beds and fifty arrivals is exactly the state where a capacity guard would
   * bite, and "the control went dead at N" is a better reading than a hang.
   */
  const admitStarted = Date.now();
  let admitted = 0;
  for (let index = 0; index < 38; index += 1) {
    const admit = page.locator('.hud-intake__admit');
    if (await admit.isDisabled()) {
      console.log(`the Admit control went dead after ${admitted} further admissions`);
      break;
    }
    await admit.click();
    admitted += 1;
    await page.waitForTimeout(60);
  }
  console.log(`${admitted} further admissions took ${Date.now() - admitStarted}ms`);
  await page.waitForTimeout(20_000);
  console.log(`fifty: tick ${await currentTick(page)} counts ${JSON.stringify(await latestCounts(page))}`);
  console.log(`fifty ambient: ${JSON.stringify(await ambient(page))}`);
  console.log(`intake panel: ${(await panelText(page, '.hud-intake')).replace(/\n/g, ' | ')}`);

  await shot(page, 'act4-fifty-full');
  const fifty = await shotRect(page, 'act4-fifty', roomRect(origin, 0));
  await upscale(page, fifty, 'act4-fifty-x3', 3);
  const fiftyAnchor = await shotRect(page, 'act4-fifty-anchor', {
    x: origin.originX + ROOM.x0 * TILE - TILE,
    y: origin.originY + ROOM.y0 * TILE - TILE,
    width: TILE * 4,
    height: TILE * 4,
  });
  await upscale(page, fiftyAnchor, 'act4-fifty-anchor-x4', 4);

  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * Is anything moving? Four crops of the same rectangle, two seconds apart, at
 * 4x speed. Identical files mean the world view is a still picture.
 */
test('act 5 — does anything on screen move', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 2, label: 'act5' });
  await fastForwardToMax(page);
  await tab(page, 'overview').click();
  await page.waitForTimeout(5000);

  const rect = roomRect(origin, TILE * 2);
  for (let frame = 0; frame < 6; frame += 1) {
    console.log(`frame ${frame} at tick ${await currentTick(page)}`);
    await shotRect(page, `act5-frame-${frame}`, rect);
    await page.waitForTimeout(2000);
  }
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * Does a room read as the thing it was designated?
 *
 * The same 6x6 enclosure, designated four different ways in four fresh
 * prisons, cropped identically. Only two floor images ship at all --
 * `floor.concrete.variants` and `floor.linoleum.institutional`
 * (`public/game-content/source-art.v1.json`) -- so the ceiling on this
 * question is low, but "low" and "one" are different answers and only a
 * picture separates them.
 */
async function designateOnly(page: Page, roomId: string, label: string): Promise<void> {
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(800);
  await tab(page, 'build').click();
  const origin = await calibrate(page);
  await buy(page, 'wall-brick', 60);
  await fastForwardToMax(page);
  await page.waitForTimeout(3000);

  await armBuildable(page, 'wall-brick');
  const westX = origin.originX + 12 * TILE;
  const eastX = origin.originX + 18 * TILE;
  const northY = origin.originY + 12 * TILE;
  const southY = origin.originY + 18 * TILE;
  for (const run of [
    { a: { x: westX + TILE / 2, y: northY }, b: { x: eastX - TILE / 2, y: northY } },
    { a: { x: westX + TILE / 2, y: southY }, b: { x: eastX - TILE / 2, y: southY } },
    { a: { x: westX, y: northY + TILE / 2 }, b: { x: westX, y: southY - TILE / 2 } },
    { a: { x: eastX, y: northY + TILE / 2 }, b: { x: eastX, y: southY - TILE / 2 } },
  ]) {
    await drag(page, run.a, run.b);
  }
  await waitForQueueEmpty(page);

  let attempts = 0;
  for (;;) {
    attempts += 1;
    await tab(page, 'zones').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    await page.locator(`.hud-rooms__list [data-room="${roomId}"]`).click();
    await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(origin, 12, 12), centreOf(origin, 17, 17));
    await page.locator('.hud-rooms__confirm').click();
    await page.waitForTimeout(800);
    if (((await latestCounts(page))?.rooms ?? 0) > 0) break;
    if (attempts >= 10) throw new Error(`${roomId} was never accepted`);
    await page.waitForTimeout(4000);
  }
  await tab(page, 'overview').click();
  await page.waitForTimeout(600);
  console.log(`${label}: rooms=${(await latestCounts(page))?.rooms} after ${attempts} attempt(s)`);
  const path = await shotRect(page, `act6-${label}`, roomRect(origin, 0));
  await upscale(page, path, `act6-${label}-x2`, 2);
}

test('act 6 — the same box, designated four different ways', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(1_800_000);
  await installTee(page);
  await openApp(page);
  for (const [roomId, label] of [
    /*
     * Four different hues, chosen from what was then
     * `ZONING_TINT_BY_CATEGORY` in `src/rendering/world/appearance.ts` rather
     * than at random: housing was `0x4f7fd0`, food `0xd0854f`, security
     * `0xd05a4f` and education `0x9a4fd0`. That table no longer exists --
     * ADR 0098 option A replaced it with `ZONING_TINT_BY_ROOM_ID`, so these
     * four room types now carry different (also distinct) hues -- and the
     * record is kept because the question this act asks is unchanged: if a
     * player cannot tell these four apart on screen, no pair of room types in
     * the game is distinguishable.
     */
    ['room.cell', 'cell'],
    ['room.kitchen', 'kitchen'],
    ['room.solitary-cell', 'solitary'],
    ['room.classroom', 'classroom'],
  ] as const) {
    await designateOnly(page, roomId, label);
  }
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * Zoom, which no control on the page offers.
 *
 * Act 0's DOM sweep for `zoom|camera|centre|center|minimap|fit` over every
 * `button` and `[role="button"]` found **nothing**, and the Build panel's own
 * hint names panning only: *"Two fingers, the middle button or the arrow keys
 * still move the camera."* `WorldScene` nevertheless zooms on the wheel, at
 * `camera.zoom * (deltaY > 0 ? 0.9 : 1.1)`. So this act asks the question a
 * player cannot: **does the world stay legible when you can see more of it?**
 */
test('act 7 — what the wheel does, and whether a zoomed-out prison is readable', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 2, label: 'act7' });
  await fastForwardToMax(page);
  await tab(page, 'overview').click();
  await page.waitForTimeout(8000);

  const centre = centreOf(origin, 15, 15);
  await shot(page, 'act7-zoom-default');
  // Out, then further out, then back in past 1:1. Each step is one wheel
  // notch's 0.9 or 1.1, applied at a point on canvas the HUD does not cover.
  for (const [label, notches, direction] of [
    ['out-5', 5, 1],
    ['out-12', 7, 1],
    ['in-6', 18, -1],
  ] as const) {
    for (let notch = 0; notch < notches; notch += 1) {
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.wheel(0, direction * 120);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(800);
    console.log(`after ${label}: strip ${JSON.stringify((await ambient(page))['strip']?.slice(0, 90))}`);
    await shot(page, `act7-zoom-${label}`);
  }
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * Act 5 again, in a cell that has a door.
 *
 * **Act 5 measured zero moving pixels over six frames and 1,144 ticks, and it
 * measured them in the doorless cell `buildAndPopulate` builds.** That is a
 * prison where nothing legal can happen, so "nothing moved" has an innocent
 * explanation and the act cannot tell the two apart. This one builds the door
 * first, waits for the room to be ready, and takes the same six frames.
 */
test('act 8 — does anything move once the cell has a door', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);
  const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 2, label: 'act8' });

  await tab(page, 'build').click();
  await armBuildable(page, 'door-wooden');
  const point = centreOf(origin, 14, 17);
  console.log(`door order: ${JSON.stringify(await press(page, point.x, point.y + TILE / 2 - 4))}`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(2000);
  await tab(page, 'zones').click();
  await page.waitForTimeout(300);
  console.log(`rooms panel: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ').slice(0, 400)}`);

  await fastForwardToMax(page);
  await tab(page, 'overview').click();
  await page.waitForTimeout(8000);

  const rect = roomRect(origin, TILE * 2);
  for (let frame = 0; frame < 8; frame += 1) {
    console.log(`act8 frame ${frame} at tick ${await currentTick(page)}`);
    await shotRect(page, `act8-frame-${frame}`, rect);
    await page.waitForTimeout(2500);
  }
  console.log(`counts at the end: ${JSON.stringify(await latestCounts(page))}`);
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});
