import { test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
  buy,
  centreOf,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  press,
  runUntilTick,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Is the first bed drawn the right way up, does a furnished cell read as
 * furnished, and can a player use the zoom control they were finally given?**
 *
 * Three things landed in the hours before this ran and none of them had been
 * looked at in a running game: #1028 drew `object.bed` from the environment
 * atlas -- the first catalogued object with art -- #1026 put a zoom pair on
 * screen for a range (`ZOOM_BOUNDS` `{min: 0.2, max: 3}`,
 * `src/rendering/scene/world-scene.ts:68`) the game had never mentioned, and
 * ADR 0097's option D observed that a furnished cell drawn as furnished
 * answers the "what is here" half of the world view's obligation on its own.
 *
 * **The claim this instrument exists to settle** is the one #1028's own author
 * named and left standing: *"The browser test proves the bed is drawn from the
 * atlas; it does not prove the bed is drawn right way up. Its pixel probe would
 * pass on a frame rotated 180 deg or mirrored, because it only requires the
 * colour to differ from the slab."* Everything below is arranged so that a
 * reader can decide that by looking, and so that the looking is not the only
 * evidence: act 1 reproduces the packer's own transform on the shipped source
 * sheet, in the page, from the same numbers `environment-sprites.ts` declares,
 * and writes the result beside the screenshot of the bed as the game drew it.
 *
 * Findings live in `docs/research/2026-09-06-the-first-furnished-cell.md`.
 *
 * **The art must be present or every picture here is worthless**, because the
 * simulation lives in the worker and a page that decoded nothing still passes:
 * this was run in a tree where `file
 * public/assets/actors/actor.guard.base.idle.png` answers `PNG image data,
 * 260 x 3104` and all 62 git-LFS paths are real bytes. Every act prints its
 * whole browser console for the same reason.
 *
 * Nothing in CI collects this: `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, and only
 * `tests/browser/playwright.playtest.config.ts` matches `*.playtest.ts`. A
 * playtest is evidence, never a gate.
 */

const SHOTS = 'docs/research/2026-09-06-the-first-furnished-cell';

mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** A rectangle of the *page* in CSS pixels: exactly the pixels a player's eye receives. */
async function shotRect(
  page: Page,
  name: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const size = page.viewportSize() ?? { width: 1440, height: 900 };
  const x = Math.max(0, Math.min(Math.round(rect.x), size.width - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), size.height - 1));
  const width = Math.max(1, Math.min(Math.round(rect.width), size.width - x));
  const height = Math.max(1, Math.min(Math.round(rect.height), size.height - y));
  const path = `${SHOTS}/${name}.png`;
  await page.screenshot({ path, clip: { x, y, width, height } });
  return path;
}

/**
 * Nearest-neighbour upscale of a PNG already on disk, done in the page so this
 * file needs no image dependency. `imageSmoothingEnabled = false` means it
 * invents nothing: every output pixel is a source pixel repeated, so a shape
 * read off the upscale is a shape that was on screen.
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
 * Two PNGs on disk, compared pixel by pixel in the page, with a per-tile
 * breakdown on a grid whose origin and pitch the caller names.
 *
 * This is the instrument `2026-09-05-what-the-world-shows.md` used to find that
 * a sealed cell and a working one differ by 4.11%, and that the 4.11% was a
 * door. It lives in the committed instrument here rather than in a scratch
 * script so the number can be re-derived from the committed screenshots.
 *
 * "Differing" is any channel differing at all -- no tolerance -- because both
 * frames come from the same browser at the same size and a tolerance would be
 * a place to hide a real difference.
 */
async function diff(
  page: Page,
  aPath: string,
  bPath: string,
  grid: { readonly tilePx: number; readonly cols: number; readonly rows: number },
): Promise<{ total: number; differing: number; percent: string; perTile: number[][] }> {
  const a = readFileSync(aPath).toString('base64');
  const b = readFileSync(bPath).toString('base64');
  return page.evaluate(
    async ({ aData, bData, tilePx, cols, rows }) => {
      const load = async (data: string): Promise<ImageData> => {
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
        return context.getImageData(0, 0, image.width, image.height);
      };
      const left = await load(aData);
      const right = await load(bData);
      if (left.width !== right.width || left.height !== right.height) {
        throw new Error(`sizes differ: ${left.width}x${left.height} vs ${right.width}x${right.height}`);
      }
      const perTile: number[][] = [];
      for (let row = 0; row < rows; row += 1) perTile.push(new Array<number>(cols).fill(0));
      let differing = 0;
      for (let y = 0; y < left.height; y += 1) {
        for (let x = 0; x < left.width; x += 1) {
          const index = (y * left.width + x) * 4;
          if (
            left.data[index] !== right.data[index] ||
            left.data[index + 1] !== right.data[index + 1] ||
            left.data[index + 2] !== right.data[index + 2] ||
            left.data[index + 3] !== right.data[index + 3]
          ) {
            differing += 1;
            const col = Math.floor(x / tilePx);
            const rowIndex = Math.floor(y / tilePx);
            if (rowIndex < rows && col < cols) perTile[rowIndex]![col]! += 1;
          }
        }
      }
      const total = left.width * left.height;
      return { total, differing, percent: ((differing / total) * 100).toFixed(2), perTile };
    },
    { aData: a, bData: b, tilePx: grid.tilePx, cols: grid.cols, rows: grid.rows },
  );
}

/**
 * Every browser console line, kept. **This is the check that makes every
 * screenshot worth anything**: a tree whose atlases are git-LFS pointers logs
 * `Failed to process file` and `InvalidStateError: The source image could not
 * be decoded` here and passes anyway.
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

/** The room `buildAndPopulate` draws, in tiles. Every crop below is this rectangle. */
const ROOM = { x0: 12, y0: 12, x1: 17, y1: 17 } as const;

function roomRect(
  origin: { originX: number; originY: number },
  pad = 0,
): { x: number; y: number; width: number; height: number } {
  return {
    x: origin.originX + ROOM.x0 * TILE - pad,
    y: origin.originY + ROOM.y0 * TILE - pad,
    width: (ROOM.x1 - ROOM.x0 + 1) * TILE + pad * 2,
    height: (ROOM.y1 - ROOM.y0 + 1) * TILE + pad * 2,
  };
}

/**
 * What the packer is fed and what it should produce, reconstructed in the page
 * from the numbers `src/rendering/assets/environment-sprites.ts` declares for
 * `env.object.bed` and the transform
 * `src/rendering/phaser/environment-textures.ts:141-152` applies.
 *
 * **Why reproduce rather than read the live atlas.** The live atlas is a Phaser
 * canvas texture inside the scene and the page exposes no handle to it (a sweep
 * for `window.lockstate*` returns `[]`). What can be had without instrumenting
 * `src/` is the two ends: the *input*, which is a shipped file this page can
 * fetch, and the *output on screen*, which is a screenshot. If the crop's
 * pillow is at the west, the declared turn is clockwise, and the bed on screen
 * has its pillow at the north, then the three agree; if the screenshot
 * disagrees with this reconstruction, the defect is in between and this file
 * says where to look.
 */
const BED_SHEET_URL = '/game-content/source-art/furniture.cell.bed.single.variants.45bfa2e0ab8d.png';
const BED_SOURCE_RECT = { x: 740, y: 288, width: 460, height: 230 } as const;

async function reconstructBedFrame(page: Page): Promise<{ crop: string; turned: string }> {
  const out = await page.evaluate(
    async ({ url, rect }) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`could not decode ${url}`));
        image.src = url;
      });
      const draw = (width: number, height: number, paint: (c: CanvasRenderingContext2D) => void): string => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d')!;
        // The sheets are transparent between renders; a dark ground makes the
        // pale bed legible without altering a pixel of the bed itself.
        context.fillStyle = '#18181c';
        context.fillRect(0, 0, width, height);
        paint(context);
        return canvas.toDataURL('image/png').split(',')[1]!;
      };
      const crop = draw(rect.width, rect.height, (context) => {
        context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      });
      // `drawFrame`'s quarter turn, verbatim: translate to the destination's
      // top-right, rotate +90 deg (clockwise on a canvas), draw at the origin
      // with the axes swapped.
      const turned = draw(rect.height, rect.width, (context) => {
        context.save();
        context.translate(rect.height, 0);
        context.rotate(Math.PI / 2);
        context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
        context.restore();
      });
      return { crop, turned, sheet: { width: image.width, height: image.height } };
    },
    { url: BED_SHEET_URL, rect: BED_SOURCE_RECT },
  );
  console.log(`bed sheet decoded at ${JSON.stringify((out as { sheet: unknown }).sheet)}`);
  writeFileSync(`${SHOTS}/act1-bed-source-crop.png`, Buffer.from(out.crop, 'base64'));
  writeFileSync(`${SHOTS}/act1-bed-source-crop-turned.png`, Buffer.from(out.turned, 'base64'));
  return { crop: `${SHOTS}/act1-bed-source-crop.png`, turned: `${SHOTS}/act1-bed-source-crop-turned.png` };
}

/**
 * Places one object and **verifies what was actually placed**, which issue
 * #1017 makes necessary: `armBuildable` reads the arm button's label
 * immediately after clicking with no wait for the panel to redraw, so under
 * load it arms the *previous* buildable and nothing fails. 4 of 18 presses in
 * one act of the 2026-09-05 pass placed the wrong object.
 *
 * The verification is the `PlaceObject` command the press produced: it carries
 * `definitionId` (`src/main.ts:2647`), which is the id the *world gesture*
 * submitted rather than the id the panel thinks is selected. A mismatch is
 * reported and counted rather than thrown, because a run that dies produces no
 * evidence at all.
 */
async function placeVerified(
  page: Page,
  origin: { originX: number; originY: number },
  definitionId: string,
  tileX: number,
  tileY: number,
): Promise<boolean> {
  const point = centreOf(origin, tileX, tileY);
  const commands = await press(page, point.x, point.y);
  const placements = commands.filter((command) => command['type'] === 'PlaceObject');
  if (placements.length !== 1) {
    console.log(`PLACEMENT at (${tileX},${tileY}) wanted ${definitionId}: produced ${JSON.stringify(commands)}`);
    return false;
  }
  const actual = placements[0]!['definitionId'];
  const at = `${String(placements[0]!['x'])},${String(placements[0]!['y'])}`;
  if (actual !== definitionId) {
    console.log(`PLACEMENT MISMATCH at (${tileX},${tileY}): wanted ${definitionId}, submitted ${String(actual)} at ${at}`);
    return false;
  }
  console.log(`placed ${definitionId} at tile ${at} (asked for ${tileX},${tileY})`);
  return true;
}

/** Presses one of the zoom buttons `n` times, checking each press actually lands on it. */
async function zoomBy(page: Page, direction: 'in' | 'out', presses: number): Promise<void> {
  const button = page.locator(`.hud-zoom__${direction}`);
  for (let index = 0; index < presses; index += 1) {
    const box = await button.boundingBox();
    if (box === null) throw new Error(`the zoom ${direction} button has no box`);
    // The icon `<svg>` is what is under the point; `closest` is what says
    // whether the press reaches the button, and a bare `elementFromPoint`
    // read would have called every one of these a miss.
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
  await page.waitForTimeout(400);
}

/**
 * Puts the world back into the state a player sees when they are *looking* at
 * it rather than building on it, which act 2's measurement requires and the
 * first run of this act did not have.
 *
 * Two things follow the mouse while the object tool is armed and both landed
 * in the first pair of screenshots: the placement **preview**, drawn as a
 * translucent copy of the object at the hovered tile -- so the last bed
 * appeared ghosted over the real one -- and nothing else. Disarming the tool
 * and parking the pointer on empty ground away from the room removes it, and
 * makes `bare` and `furnished` differ by the beds and by nothing else.
 */
async function stopBuildingAndLookAway(page: Page): Promise<void> {
  await tab(page, 'build').click();
  const arm = page.locator('.hud-build__arm');
  const label = (await arm.innerText()).trim();
  if (/^stop/i.test(label)) {
    await arm.click();
    console.log(`disarmed the build tool (its label read ${JSON.stringify(label)})`);
  } else console.log(`the build tool was not armed (its label reads ${JSON.stringify(label)})`);
  await tab(page, 'overview').click();
  const park = { x: 1080, y: 700 };
  console.log(
    `parking the pointer at ${JSON.stringify(park)}, which is over ${await page.evaluate(
      (point) => {
        const node = document.elementFromPoint(point.x, point.y);
        return node === null ? '(nothing)' : `${node.tagName} .${String(node.className)}`;
      },
      park,
    )}`,
  );
  await page.mouse.move(park.x, park.y);
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------

test('act 0 — what the page offers on arrival, and where the zoom control is', async ({ page }) => {
  const console_ = watchConsole(page);
  await installTee(page);
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.waitForTimeout(1500);

  console.log(`viewport: ${JSON.stringify(page.viewportSize())} dpr ${await page.evaluate(() => window.devicePixelRatio)}`);
  await shot(page, 'act0-arrival-full');

  // Everything on the page that could be a camera control, named -- the same
  // sweep 2026-09-05 ran, which returned nothing at all.
  console.log(
    `\nCAMERA-ISH CONTROLS:\n${(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
          .map((n) => {
            const box = n.getBoundingClientRect();
            return `  <${n.tagName.toLowerCase()} class="${n.className}"> text=${JSON.stringify((n.innerText ?? '').replace(/\s+/g, ' ').trim())} aria-label=${JSON.stringify(n.getAttribute('aria-label'))} title=${JSON.stringify(n.getAttribute('title'))} box=${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`;
          })
          .filter((line) => /zoom|camera|centre|center|minimap|fit/i.test(line)),
      )
    ).join('\n')}`,
  );

  // Every occurrence of the word in the assembled page, which is what "is it
  // findable" comes down to for a player reading the screen.
  console.log(
    `visible text containing "zoom": ${JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('*')]
          .filter((n) => n.children.length === 0 && /zoom/i.test(n.innerText ?? ''))
          .map((n) => `${n.className}: ${(n.innerText ?? '').trim()}`),
      ),
    )}`,
  );
  console.log(`the substring "zoom" occurs ${await page.evaluate(() => (document.body.innerHTML.match(/zoom/gi) ?? []).length)} times in body.innerHTML`);

  const zoomBox = await page.locator('.hud-zoom').boundingBox();
  console.log(`.hud-zoom box: ${JSON.stringify(zoomBox)}`);
  if (zoomBox !== null) {
    const shotPath = await shotRect(page, 'act0-zoom-control', {
      x: zoomBox.x - 12,
      y: zoomBox.y - 12,
      width: zoomBox.width + 24,
      height: zoomBox.height + 24,
    });
    await upscale(page, shotPath, 'act0-zoom-control-x4', 4);
  }

  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  console.log(`\nBROWSER CONSOLE (${console_.length} lines):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * **Act 1 — the bed, at three zooms, beside the frame the packer should have
 * made of it.**
 *
 * One 6x6 cell, four beds, one toilet, nobody in it. Nobody, deliberately: the
 * question is which way up the furniture is drawn, and an actor standing on a
 * bed is exactly the thing that would hide the answer. `buildAndPopulate`'s
 * canonical cell contains `NEW_PRISON_ORIGIN_TILE` `{16,16}`, so `admits: 0`
 * and `guards: 0` is the only way to get an empty room.
 */
test('act 1 — is the bed the right way up', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(900_000);
  await installTee(page);
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 0, admits: 0, guards: 0, label: 'act1' });
  // Long enough for the toilet order to finish building: the first run of this
  // act photographed it mid-construction, at the reduced alpha
  // `alphaFor(structure.phase)` gives a planned order, and that difference
  // would have been counted as part of act 2's measurement.
  await fastForwardToMax(page);
  await page.waitForTimeout(12_000);
  await stopBuildingAndLookAway(page);
  console.log(`counts with the bare cell: ${JSON.stringify(await latestCounts(page))}`);
  const bare = await shotRect(page, 'act1-cell-bare', roomRect(origin));
  await upscale(page, bare, 'act1-cell-bare-x3', 3);

  // Beds. `buildAndPopulate` bought `beds + 2` = 2 with `beds: 0`, so buy the
  // rest, and let the delivery arrive before arming anything.
  await tab(page, 'build').click();
  await buy(page, 'bed-wooden', 6);
  await fastForwardToMax(page);
  await page.waitForTimeout(6000);
  console.log(`deliveries: ${JSON.stringify(await panelText(page, '.hud-build__deliveries'))}`);

  await armBuildable(page, 'bed-wooden');
  console.log(`arm control reads: ${JSON.stringify((await page.locator('.hud-build__arm').innerText()).trim())}`);
  let placed = 0;
  // Row y=12, columns 13..16. A bed's footprint is 1x2 (`object-catalog.ts`),
  // so each occupies (column, 12)-(column, 13) and none reaches the toilet at
  // (12,16) or the spawn tile (16,16).
  for (const column of [13, 14, 15, 16]) {
    if (await placeVerified(page, origin, 'bed-wooden', column, 12)) placed += 1;
  }
  console.log(`${placed} of 4 bed presses submitted bed-wooden`);

  // What a player sees *while* the tool is armed: the placement preview under
  // the pointer, which is the last bed drawn twice -- once built and once as a
  // translucent copy. Recorded on purpose, then removed before anything is
  // measured.
  await waitForQueueEmpty(page);
  await page.waitForTimeout(3000);
  const ghost = await shotRect(page, 'act1-armed-preview', {
    x: origin.originX + 15 * TILE,
    y: origin.originY + 12 * TILE,
    width: TILE * 2,
    height: TILE * 2,
  });
  await upscale(page, ghost, 'act1-armed-preview-x4', 4);

  await fastForwardToMax(page);
  await page.waitForTimeout(12_000);
  await stopBuildingAndLookAway(page);

  const built = await latestCounts(page);
  console.log(`counts with the furnished cell: ${JSON.stringify(built)}`);
  console.log(
    `INDEPENDENT VERIFICATION of what was placed: accommodationCapacity=${built?.accommodationCapacity}` +
      ` (a bed is the only 'sleep-surface' object a cell here can hold), roomCapacity=${built?.roomCapacity}`,
  );
  await tab(page, 'zones').click();
  await page.waitForTimeout(300);
  console.log(`rooms panel: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);
  await tab(page, 'overview').click();
  // Back to exactly the pointer position `act1-cell-bare` was taken at, so the
  // two frames differ by the beds and not by where the mouse happened to be.
  await page.mouse.move(1080, 700);
  await page.waitForTimeout(800);

  const furnished = await shotRect(page, 'act1-cell-furnished', roomRect(origin));
  await upscale(page, furnished, 'act1-cell-furnished-x3', 3);
  await shot(page, 'act1-cell-furnished-full');

  // One bed alone, at 1:1 and magnified eight times. This crop is where the
  // orientation question is decided by eye.
  const oneBed = {
    x: origin.originX + 14 * TILE,
    y: origin.originY + 12 * TILE,
    width: TILE,
    height: TILE * 2,
  };
  const bedShot = await shotRect(page, 'act1-one-bed', oneBed);
  await upscale(page, bedShot, 'act1-one-bed-x8', 8);

  // The bed and the toilet in one frame: the atlas object beside the coloured
  // slab every other object still is.
  const pair = await shotRect(page, 'act1-bed-and-toilet', {
    x: origin.originX + 12 * TILE,
    y: origin.originY + 12 * TILE,
    width: TILE * 4,
    height: TILE * 6,
  });
  await upscale(page, pair, 'act1-bed-and-toilet-x3', 3);

  // What the packer is fed, and what its own transform makes of it.
  await reconstructBedFrame(page);

  // The same bed at the two ends of the range #1026 exposed.
  await zoomBy(page, 'in', 5); // 1.25^5 = 3.05, clamped to ZOOM_BOUNDS.max = 3
  await page.waitForTimeout(600);
  await shot(page, 'act1-zoom-max-full');
  const boxIn = await page.locator('#game-root canvas').boundingBox();
  if (boxIn !== null) {
    const inShot = await shotRect(page, 'act1-zoom-max-centre', {
      x: boxIn.x + boxIn.width / 2 - 200,
      y: boxIn.y + boxIn.height / 2 - 200,
      width: 400,
      height: 400,
    });
    await upscale(page, inShot, 'act1-zoom-max-centre-x2', 2);
  }

  await zoomBy(page, 'out', 13); // back through 1 and on to the far end
  await page.waitForTimeout(600);
  await shot(page, 'act1-zoom-min-full');
  const boxOut = await page.locator('#game-root canvas').boundingBox();
  if (boxOut !== null) {
    const outShot = await shotRect(page, 'act1-zoom-min-centre', {
      x: boxOut.x + boxOut.width / 2 - 200,
      y: boxOut.y + boxOut.height / 2 - 200,
      width: 400,
      height: 400,
    });
    await upscale(page, outShot, 'act1-zoom-min-centre-x4', 4);
  }

  // And back to where a player started, to see whether the round trip returns.
  await zoomBy(page, 'in', 8);
  await shot(page, 'act1-zoom-round-trip-full');

  console.log(`ambient at the end: ${JSON.stringify(await ambient(page))}`);
  console.log(`tick ${await currentTick(page)}`);
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * **Act 2 — what four beds are worth, in pixels.**
 *
 * The same crop as act 1, measured: `act1-cell-bare.png` against
 * `act1-cell-furnished.png` is one prison photographed twice, so nothing but
 * the beds differs -- same walls, same toilet, same floor, same zero actors,
 * same camera. `2026-09-05-what-the-world-shows.md` found a sealed cell and a
 * working one differ by 4.11% and that the 4.11% was a door; this is the same
 * measurement pointed at the first object with art.
 */
test('act 2 — the pixel difference four beds make', async ({ page }) => {
  const console_ = watchConsole(page);
  await installTee(page);
  await openApp(page);
  const result = await diff(
    page,
    `${SHOTS}/act1-cell-bare.png`,
    `${SHOTS}/act1-cell-furnished.png`,
    { tilePx: TILE, cols: 6, rows: 6 },
  );
  console.log(`bare vs furnished: ${result.differing} differing of ${result.total} — ${result.percent}%`);
  console.log('per tile, out of 4096 each:');
  console.log(`      ${['x12', 'x13', 'x14', 'x15', 'x16', 'x17'].map((h) => h.padEnd(7)).join('')}`);
  result.perTile.forEach((row, index) => {
    console.log(`y${12 + index}:  ${row.map((n) => String(n).padEnd(7)).join('')}`);
  });
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * **Act 3 — the same cell, lived in, and the zoom a player would actually
 * reach for.**
 *
 * Four beds, four prisoners, two guards, run on. Two questions here that act 1
 * cannot answer with an empty room: whether a furnished cell still reads as
 * furnished once people are standing in it, and whether zoom 3 is close enough
 * to see which way an actor faces -- which is the thing the 2026-09-05 pass
 * said the hidden zoom was the only substitute for.
 */
test('act 3 — a furnished cell with people in it, at both ends of the zoom', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(1_200_000);
  await installTee(page);
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 4, admits: 4, guards: 2, label: 'act3' });
  await fastForwardToMax(page);
  await page.waitForTimeout(25_000);
  await tab(page, 'overview').click();
  await page.waitForTimeout(500);
  console.log(`tick ${await currentTick(page)} counts ${JSON.stringify(await latestCounts(page))}`);
  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);

  await shot(page, 'act3-lived-in-full');
  const lived = await shotRect(page, 'act3-lived-in', roomRect(origin));
  await upscale(page, lived, 'act3-lived-in-x3', 3);

  await zoomBy(page, 'in', 5);
  await shot(page, 'act3-zoom-max-full');
  const box = await page.locator('#game-root canvas').boundingBox();
  if (box !== null) {
    const centre = await shotRect(page, 'act3-zoom-max-centre', {
      x: box.x + box.width / 2 - 240,
      y: box.y + box.height / 2 - 240,
      width: 480,
      height: 480,
    });
    await upscale(page, centre, 'act3-zoom-max-centre-x2', 2);
  }

  await zoomBy(page, 'out', 13);
  await shot(page, 'act3-zoom-min-full');

  // Does the far end still let a player find their prison? The whole canvas,
  // magnified twice, is what a 32x32 world at zoom 0.2 looks like.
  const boxOut = await page.locator('#game-root canvas').boundingBox();
  if (boxOut !== null) {
    const whole = await shotRect(page, 'act3-zoom-min-centre', {
      x: boxOut.x + boxOut.width / 2 - 180,
      y: boxOut.y + boxOut.height / 2 - 180,
      width: 360,
      height: 360,
    });
    await upscale(page, whole, 'act3-zoom-min-centre-x4', 4);
  }

  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});

/**
 * **Act 4 — the fourth bed.**
 *
 * Act 1 placed four beds, verified all four presses submitted `bed-wooden`,
 * watched `accommodationCapacity` reach `4`, and photographed **three solid
 * beds and one translucent one** -- and the translucent one was still
 * translucent thousands of ticks later, with the build tool disarmed and the
 * pointer parked on empty ground far away.
 *
 * **It is not the placement preview**, which was the first guess and is wrong:
 * the preview is an `AreaOverlay` -- a tinted rectangle with an outline
 * (`src/rendering/scene/world-scene.ts:1197`, `src/rendering/phaser/area-overlay.ts`)
 * -- and cannot draw a bed. A translucent *bed* can only come from
 * `acquireObjectSprite` with `alphaFor(structure.phase)` below 1
 * (`src/rendering/phaser/tile-layer.ts:508-521`, `:622-631`), which is
 * `PLANNED_ALPHA` `0.35` or `BUILDING_ALPHA` `0.65`
 * (`src/rendering/world/appearance.ts:275-276`). So the fourth order had not
 * finished.
 *
 * This act asks whether that is the game working (a slow queue, a material it
 * is waiting for, and a panel that says so) or the game failing quietly. It
 * places the beds **one at a time**, reading the queue, the deliveries and the
 * counts after each, then runs a long way and photographs the result.
 */
test('act 4 — three beds appear and the fourth does not: which is it', async ({ page }) => {
  const console_ = watchConsole(page);
  test.setTimeout(1_200_000);
  await installTee(page);
  await openApp(page);

  const origin = await buildAndPopulate(page, { beds: 0, admits: 0, guards: 0, label: 'act4' });

  const readBuild = async (label: string): Promise<void> => {
    await tab(page, 'build').click();
    await page.waitForTimeout(250);
    const read = async (selector: string): Promise<string> => {
      const node = page.locator(selector);
      if ((await node.count()) === 0) return '(absent)';
      if (await node.first().isHidden()) return '(hidden)';
      return (await node.first().innerText()).replace(/\s+/g, ' ').trim();
    };
    console.log(
      `${label}: tick ${await currentTick(page)} | queue ${JSON.stringify(await read('.hud-build__queue'))}` +
        ` | deliveries ${JSON.stringify(await read('.hud-build__deliveries'))}` +
        ` | counts ${JSON.stringify(await latestCounts(page))}`,
    );
  };

  await readBuild('after the bare cell');
  await buy(page, 'bed-wooden', 6);
  await readBuild('right after buying six beds');
  await fastForwardToMax(page);
  await page.waitForTimeout(20_000);
  await readBuild('twenty seconds later, before placing anything');

  await armBuildable(page, 'bed-wooden');
  for (const column of [13, 14, 15, 16]) {
    await placeVerified(page, origin, 'bed-wooden', column, 12);
    await page.waitForTimeout(2500);
    await readBuild(`after the bed at column ${column}`);
  }

  await stopBuildingAndLookAway(page);
  const early = await shotRect(page, 'act4-just-after-placing', roomRect(origin));
  await upscale(page, early, 'act4-just-after-placing-x3', 3);

  // A long run: whatever the fourth order is waiting for has a full in-game day
  // and more to arrive.
  const target = (await currentTick(page)) + 12_000;
  try {
    await runUntilTick(page, target, 900_000);
  } catch (error) {
    console.log(`did not reach tick ${target}: ${String(error)}`);
  }
  await readBuild('after a long run');
  await stopBuildingAndLookAway(page);
  const late = await shotRect(page, 'act4-long-after-placing', roomRect(origin));
  await upscale(page, late, 'act4-long-after-placing-x3', 3);
  await shot(page, 'act4-long-after-placing-full');

  const moved = await diff(page, early, late, { tilePx: TILE, cols: 6, rows: 6 });
  console.log(`just-after vs long-after: ${moved.differing} of ${moved.total} — ${moved.percent}%`);
  moved.perTile.forEach((row, index) => console.log(`y${12 + index}:  ${row.map((n) => String(n).padEnd(7)).join('')}`));

  console.log(`ambient: ${JSON.stringify(await ambient(page))}`);
  console.log(`\nBROWSER CONSOLE (${console_.length}):\n${console_.map((l) => `  ${l}`).join('\n')}`);
});
