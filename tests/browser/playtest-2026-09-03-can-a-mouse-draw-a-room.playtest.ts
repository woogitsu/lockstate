import { expect, test } from '@playwright/test';
import {
  TILE,
  armBuildable,
  calibrate,
  centreOf,
  drag,
  installTee,
  latestCounts,
  openApp,
  panelText,
  sentCommands,
  tab,
  waitForQueueEmpty,
} from './playtest-harness';

/**
 * **Can a mouse draw a room, and if not, can anything else?**
 *
 * Act 1 re-measures the reachable tile set on today's `main` and then reports,
 * per drag of a 6x6 square, which of the tiles that drag crossed were
 * occluded -- so a short run is attributed rather than guessed at.
 *
 * Act 2 asks whether the typed-coordinate forms in the Build and Rooms panels
 * are a complete path: buy, wall, zone and furnish a cell with no world
 * gesture at all.
 *
 * Not a gate. Run with:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5291 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-03-can-a-mouse-draw-a-room.playtest.ts
 * ```
 */

interface Probe {
  readonly free: readonly { readonly tx: number; readonly ty: number }[];
  readonly blocked: readonly { readonly tx: number; readonly ty: number; readonly by: string }[];
}

test.describe('can a mouse draw a room', () => {
  test('act 1: the reachable band, and what each drag of a square actually crossed', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[reach2] ${line}`);
    };
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();
    const origin = await calibrate(page);
    log(`origin ${JSON.stringify(origin)}; viewport ${JSON.stringify(page.viewportSize())}`);

    const probe: Probe = await page.evaluate(
      ({ originX, originY, tile }) => {
        const free: { tx: number; ty: number }[] = [];
        const blocked: { tx: number; ty: number; by: string }[] = [];
        for (let ty = 0; ty <= 40; ty += 1) {
          const centreY = originY + ty * tile + tile / 2;
          if (centreY < 0 || centreY > window.innerHeight) continue;
          for (let tx = 0; tx <= 50; tx += 1) {
            const centreX = originX + tx * tile + tile / 2;
            if (centreX < 0 || centreX > window.innerWidth) continue;
            const hit = document.elementFromPoint(centreX, centreY);
            const island = hit === null ? null : (hit.closest('.hud, .save-panel') as HTMLElement | null);
            if (island === null) free.push({ tx, ty });
            else {
              let owner: HTMLElement = hit as HTMLElement;
              for (let node: HTMLElement | null = hit as HTMLElement; node !== null; node = node.parentElement) {
                if (getComputedStyle(node).pointerEvents === 'auto') owner = node;
                if (node === island) break;
              }
              blocked.push({ tx, ty, by: owner.className || owner.tagName });
            }
          }
        }
        return { free, blocked };
      },
      { originX: origin.originX, originY: origin.originY, tile: TILE },
    );
    const total = probe.free.length + probe.blocked.length;
    log(`REACHABLE ${probe.free.length} of ${total} visible tile centres (${((100 * probe.free.length) / total).toFixed(1)}%)`);
    const rows = [...new Set([...probe.free, ...probe.blocked].map((c) => c.ty))].sort((l, r) => l - r);
    for (const ty of rows) {
      const free = probe.free.filter((c) => c.ty === ty).map((c) => c.tx);
      const owners = [...new Set(probe.blocked.filter((c) => c.ty === ty).map((c) => c.by))];
      log(`  y=${ty}: reachable x ${free.length === 0 ? 'NONE' : `${free[0]}..${free[free.length - 1]} (${free.length})`}; blocked by ${JSON.stringify(owners)}`);
    }

    const reachable = (tx: number, ty: number): boolean => probe.free.some((c) => c.tx === tx && c.ty === ty);
    const blockedBy = (tx: number, ty: number): string =>
      probe.blocked.find((c) => c.tx === tx && c.ty === ty)?.by ?? 'reachable';

    // The exact square a player would draw around tiles 6..11 x 11..16.
    await armBuildable(page, 'wall-brick');
    const runs = [
      { name: 'north (6,11)->(11,11)', a: { tx: 6, ty: 11 }, b: { tx: 11, ty: 11 } },
      { name: 'south (6,16)->(11,16)', a: { tx: 6, ty: 16 }, b: { tx: 11, ty: 16 } },
      { name: 'west  (6,11)->(6,16)', a: { tx: 6, ty: 11 }, b: { tx: 6, ty: 16 } },
      { name: 'east  (11,11)->(11,16)', a: { tx: 11, ty: 11 }, b: { tx: 11, ty: 16 } },
    ];
    for (const run of runs) {
      const crossed: string[] = [];
      const dx = Math.sign(run.b.tx - run.a.tx);
      const dy = Math.sign(run.b.ty - run.a.ty);
      for (let tx = run.a.tx, ty = run.a.ty; ; tx += dx, ty += dy) {
        crossed.push(`(${tx},${ty})${reachable(tx, ty) ? '' : ` BLOCKED-BY[${blockedBy(tx, ty)}]`}`);
        if (tx === run.b.tx && ty === run.b.ty) break;
      }
      const before = (await sentCommands(page)).length;
      await drag(page, centreOf(origin, run.a.tx, run.a.ty), centreOf(origin, run.b.tx, run.b.ty));
      const produced = (await sentCommands(page)).slice(before);
      log(`DRAG ${run.name}: spans ${crossed.length}, produced ${produced.length}`);
      log(`  crossed: ${crossed.join(' ')}`);
      log(`  placed:  ${JSON.stringify(produced.map((c) => `${String(c['x'])},${String(c['y'])} ${String(c['edge'])}`))}`);
      log(`  refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    }
    expect(total).toBeGreaterThan(0);
  });

  test('act 2: a cell built and zoned entirely through the typed-coordinate forms', async ({ page }) => {
    const log = (line: string): void => {
      console.log(`[typed] ${line}`);
    };
    await installTee(page);
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await tab(page, 'build').click();

    // What the Build panel's coordinate form asks for.
    log(`build coordinates section present? ${await page.locator('.hud-build__coordinates').count()}`);
    const toggle = page.locator('.hud-build__coordinates > .ui-panel__header > .ui-panel__toggle');
    log(`build coordinates toggle count ${await toggle.count()}`);
    if ((await toggle.count()) > 0) await toggle.first().click();
    log(`build coordinates form text: ${(await panelText(page, '.hud-build__coordinates')).replace(/\n/g, ' | ')}`);
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll('.hud-build__coordinates input, .hud-build__coordinates button')].map((n) => {
        const el = n as HTMLElement;
        return `${el.tagName.toLowerCase()}:${el.className}:${(el.getAttribute('aria-label') ?? el.innerText ?? '').trim().slice(0, 40)}`;
      }),
    );
    log(`build coordinate controls: ${JSON.stringify(fields)}`);

    log(`--- rooms panel ---`);
    await tab(page, 'rooms').click();
    if ((await page.locator('.hud-rooms').getAttribute('data-collapsed')) === 'true') {
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    }
    const roomsToggle = page.locator('.hud-rooms__coordinates > .ui-panel__header > .ui-panel__toggle');
    if ((await roomsToggle.count()) > 0) await roomsToggle.first().click();
    log(`rooms coordinates form text: ${(await panelText(page, '.hud-rooms__coordinates')).replace(/\n/g, ' | ')}`);
    const roomFields = await page.evaluate(() =>
      [...document.querySelectorAll('.hud-rooms__coordinates input, .hud-rooms__coordinates button')].map((n) => {
        const el = n as HTMLElement;
        return `${el.tagName.toLowerCase()}:${el.className}:${(el.getAttribute('aria-label') ?? el.innerText ?? '').trim().slice(0, 40)}`;
      }),
    );
    log(`rooms coordinate controls: ${JSON.stringify(roomFields)}`);

    // Build a 4x4 walled square far off-screen, at tiles 40..43, entirely by typing.
    await tab(page, 'build').click();
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    if ((await page.locator('.hud-build__coordinates > .ui-panel__header > .ui-panel__toggle').count()) > 0) {
      const collapsed = await page.locator('.hud-build__coordinates').getAttribute('data-collapsed');
      if (collapsed === 'true') await page.locator('.hud-build__coordinates > .ui-panel__header > .ui-panel__toggle').click();
    }
    const xInput = page.locator('.hud-build__coords .ui-number__input').first();
    const inputs = page.locator('.hud-build__coords .ui-number__input');
    log(`build coordinate number inputs: ${await inputs.count()}`);
    const submit = page.locator('.hud-build__coordinates button').last();
    log(`build coordinate submit label: ${JSON.stringify((await submit.innerText()).trim())}`);

    let placed = 0;
    const orders: string[] = [];
    for (const spec of [
      ...[40, 41, 42, 43].map((x) => ({ x, y: 40 })),
      ...[40, 41, 42, 43].map((x) => ({ x, y: 44 })),
    ]) {
      const before = (await sentCommands(page)).length;
      if ((await inputs.count()) >= 2) {
        await inputs.nth(0).fill(String(spec.x));
        await inputs.nth(1).fill(String(spec.y));
        await submit.click();
        await page.waitForTimeout(150);
      }
      const produced = (await sentCommands(page)).slice(before);
      placed += produced.length;
      orders.push(`${spec.x},${spec.y}->${produced.length}:${produced.map((c) => String(c['edge'])).join('/')}`);
      void xInput;
    }
    log(`typed wall orders: ${JSON.stringify(orders)} (total commands ${placed})`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`queue: ${JSON.stringify(await panelText(page, '.hud-build__queue'))}`);
    log(`counts: ${JSON.stringify(await latestCounts(page))}`);

    // Does the typed form let a player say which EDGE? If not, a typed wall
    // cannot close a square and this path is not a workaround.
    log(`does the typed build form offer an edge control? ${JSON.stringify(
      await page.evaluate(() => (document.querySelector('.hud-build__coordinates') as HTMLElement | null)?.innerText?.replace(/\n/g, ' | ') ?? 'ABSENT'),
    )}`);

    await page.locator('.hud-strip__transport button').nth(2).click();
    await page.waitForTimeout(200);
    await page.locator('.hud-strip__transport button').nth(2).click();
    await waitForQueueEmpty(page, 90_000).catch((error: Error) => log(`queue never emptied: ${error.message}`));

    // And now zone by typing.
    await tab(page, 'rooms').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    const roomsCollapsed = await page.locator('.hud-rooms__coordinates').getAttribute('data-collapsed');
    if (roomsCollapsed === 'true') await page.locator('.hud-rooms__coordinates > .ui-panel__header > .ui-panel__toggle').click();
    const roomInputs = page.locator('.hud-rooms__coordinates .ui-number__input');
    log(`rooms coordinate number inputs: ${await roomInputs.count()}`);
    if ((await roomInputs.count()) >= 4) {
      await roomInputs.nth(0).fill('40');
      await roomInputs.nth(1).fill('40');
      await roomInputs.nth(2).fill('4');
      await roomInputs.nth(3).fill('4');
      await page.locator('.hud-rooms__coordinates-submit').click();
      await page.waitForTimeout(800);
    }
    log(`rooms panel after typed designation: ${(await panelText(page, '.hud-rooms')).replace(/\n/g, ' | ')}`);
    log(`refusal band: ${JSON.stringify(await panelText(page, '.hud__refusal'))}`);
    log(`counts: ${JSON.stringify(await latestCounts(page))}`);
    expect(true).toBe(true);
  });
});
