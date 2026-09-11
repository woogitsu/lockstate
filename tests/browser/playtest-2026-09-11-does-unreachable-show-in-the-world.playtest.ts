import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {
  TILE,
  armBuildable,
  buildAndPopulate,
  centreOf,
  installTee,
  openApp,
  panelText,
  press,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Now that ADR 0108 tells `roomAccess` about reachability, does the WORLD
 * VIEW carry any of that state, for the specific case #1022 and ADR 0097 are
 * about -- a door that leads nowhere?**
 *
 * This is not #1018/#1022's original act 3 (a door against no door at all,
 * which is `'doorway'` vs `'no-way-in'` and predates ADR 0108). It builds the
 * state ADR 0108 actually added a fourth value for: a real door on the room's
 * perimeter, boxed in from outside so nothing can reach it --
 * `'unreachable'`, shipped string `hud.rooms.needs-unreachable`, *"a way in --
 * nothing outside can reach its door"*.
 *
 * Findings recorded in `docs/research/2026-09-11-does-unreachable-show-in-the-world.md`.
 */

const SHOTS = 'docs/research/2026-09-11-does-unreachable-show-in-the-world';
mkdirSync(SHOTS, { recursive: true });

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

function roomRect(origin: { originX: number; originY: number }, pad = 0) {
  return {
    x: origin.originX + 12 * TILE - pad,
    y: origin.originY + 12 * TILE - pad,
    width: 6 * TILE + 2 * pad,
    height: 6 * TILE + 2 * pad,
  };
}

/** Builds the 6x6 cell `buildAndPopulate` makes, then a door on its south edge at (14,17). */
async function buildCellWithDoor(page: Page, label: string): Promise<{ originX: number; originY: number }> {
  const origin = await buildAndPopulate(page, { beds: 2, admits: 0, guards: 0, label });
  await tab(page, 'build').click();
  await armBuildable(page, 'door-wooden');
  const point = centreOf(origin, 14, 17);
  const commands = await press(page, point.x, point.y + TILE / 2 - 4);
  console.log(`[${label}] door order: ${JSON.stringify(commands)}`);
  await waitForQueueEmpty(page);
  await page.waitForTimeout(1500);
  return origin;
}

/**
 * Boxes in the one tile the door opens onto -- (14,18) -- on its other three
 * sides (west, south, east; north is the door itself), which is exactly
 * ADR 0108's own act-4a fixture: *"a furnished cell, a real door on its south
 * boundary, and the one tile that door opens onto boxed in on its other three
 * sides."*
 */
async function boxInTheDoorway(page: Page, origin: { originX: number; originY: number }): Promise<void> {
  await tab(page, 'build').click();
  await armBuildable(page, 'wall-brick');
  const point = centreOf(origin, 14, 18);
  const west = await press(page, point.x - TILE / 2 + 4, point.y);
  const south = await press(page, point.x, point.y + TILE / 2 - 4);
  const east = await press(page, point.x + TILE / 2 - 4, point.y);
  console.log(`boxing-in orders: west=${JSON.stringify(west)} south=${JSON.stringify(south)} east=${JSON.stringify(east)}`);
  await waitForQueueEmpty(page);
  // ADR 0099 marks the drawn-world revision dirty when a build order
  // completes, so this does not need the pre-ADR-0099 30-second poll window --
  // but it does need a moment for the navigation graph rebuild and the next
  // render-feed geometry request to land.
  await page.waitForTimeout(3000);
}

async function run(page: Page, label: string, seal: boolean): Promise<{ shot: string; roomsPanel: string }> {
  const origin = await buildCellWithDoor(page, label);
  if (seal) await boxInTheDoorway(page, origin);

  await tab(page, 'rooms').click();
  await page.waitForTimeout(500);
  const roomsPanel = await panelText(page, '.hud-rooms');
  console.log(`[${label}] rooms panel:\n${roomsPanel}`);

  await tab(page, 'overview').click();
  await page.waitForTimeout(500);
  const shot = await shotRect(page, `world-${label}`, roomRect(origin, 0));
  return { shot, roomsPanel };
}

test('a door that leads nowhere: the Rooms panel and the world view, side by side', async ({ page }) => {
  test.setTimeout(600_000);
  await installTee(page);
  await openApp(page);
  const reachable = await run(page, 'reachable', false);

  await installTee(page);
  await openApp(page);
  const blocked = await run(page, 'blocked', true);

  console.log(
    `\nSUMMARY\n` +
      `reachable panel mentions 'nothing outside can reach': ${reachable.roomsPanel.includes('nothing outside can reach')}\n` +
      `blocked   panel mentions 'nothing outside can reach': ${blocked.roomsPanel.includes('nothing outside can reach')}\n` +
      `reachable panel mentions 'nobody can get in': ${reachable.roomsPanel.includes('nobody can get in')}\n` +
      `blocked   panel mentions 'nobody can get in': ${blocked.roomsPanel.includes('nobody can get in')}\n`,
  );
});
