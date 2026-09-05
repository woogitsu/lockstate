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

  for (const id of ['overview', 'build', 'rooms', 'security', 'regime'] as const) {
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

  await tab(page, 'rooms').click();
  console.log(
    `\nROOM CATALOGUE:\n${(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-rooms__list [data-room]')].map(
          (n) => `  ${n.getAttribute('data-room')} :: ${(n.innerText ?? '').replace(/\s+/g, ' ').trim()}`,
        ),
      )
    ).join('\n')}`,
  );

  await tab(page, 'security').click();
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
