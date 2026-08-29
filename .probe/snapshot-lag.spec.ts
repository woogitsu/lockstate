import { expect, test } from '@playwright/test';
import { armBuild, attachConsole, calibrate, centreOf, drag, openApp, panelText, tab, TILE } from './lib';

/**
 * The mechanism behind the enclosure note's window, measured rather than
 * argued: when does a `simulation/snapshot` carrying the finished walls reach
 * the main thread, relative to the wall actually finishing and to the moment
 * the panel stops calling the rectangle open?
 *
 * `src/rendering/feed/simulation-snapshot-feed.ts:84-86` states the premise
 * this tests: "geometry ... changes when the player builds something -- and a
 * build is a command, which already sets `dirty` and polls immediately."
 */
test('when does the world the panel reads catch up with the walls?', async ({ page }) => {
  test.setTimeout(600_000);
  const console_ = attachConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const log: { t: number; kind: string; tick: number | undefined }[] = [];
    class TeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const kind = (event.data as { kind?: string }).kind ?? '';
          if (kind === 'simulation/snapshot' || kind === 'simulation/status-counts') {
            const payload = (event.data as { payload?: { tick?: number } }).payload;
            log.push({ t: Math.round(performance.now()), kind, tick: payload?.tick });
          }
        });
      }
      public override postMessage(m: unknown, t?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(m);
        if (t === undefined) super.postMessage(m);
        else if (Array.isArray(t)) super.postMessage(m, t);
        else super.postMessage(m, t);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = TeeWorker as unknown as typeof Worker;
    (window as unknown as { lockstateSentToWorker?: unknown[] }).lockstateSentToWorker = sent;
    (window as unknown as { lockstateMessageLog?: unknown[] }).lockstateMessageLog = log;
  });

  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await tab(page, 'build');
  const o = await calibrate(page);

  await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
  if (!(await page.locator('.hud-build__buy').isVisible())) await page.locator('.hud-build__buy-toggle').click();
  await page.waitForTimeout(200);
  await page.locator('.hud-build__buy .ui-number__input').fill('60');
  await page.locator('.hud-build__buy-submit').click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.waitForTimeout(8000);

  await armBuild(page, 'wall-brick');
  const north = o.originY + 12 * TILE;
  const south = o.originY + 16 * TILE;
  const west = o.originX + 12 * TILE;
  const east = o.originX + 16 * TILE;
  for (const r of [
    { a: { x: west + TILE / 2, y: north }, b: { x: east - TILE / 2, y: north } },
    { a: { x: west + TILE / 2, y: south }, b: { x: east - TILE / 2, y: south } },
    { a: { x: west, y: north + TILE / 2 }, b: { x: west, y: south - TILE / 2 } },
    { a: { x: east, y: north + TILE / 2 }, b: { x: east, y: south - TILE / 2 } },
  ]) {
    await drag(page, r.a, r.b);
  }

  // Poll the queue at 1s, so "the last wall finished" is pinned to a second.
  let queueEmptyAt: number | undefined;
  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(1000);
    const q = await panelText(page, '.hud-build__queue');
    if (q.includes('not laid out')) {
      queueEmptyAt = await page.evaluate(() => Math.round(performance.now()));
      console.log(`queue empty at page t=${queueEmptyAt}ms (poll ${i + 1})`);
      break;
    }
  }

  // Now re-drag every second and record when the note stops saying "open".
  await tab(page, 'rooms');
  if (!(await page.locator('.hud-rooms__list').isVisible()))
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const label = (await page.locator('.hud-rooms__arm').innerText()).trim().toLowerCase();
    if (label.startsWith('draw')) await page.locator('.hud-rooms__arm').click();
    await drag(page, centreOf(o, 12, 12), centreOf(o, 15, 15));
    const now = await page.evaluate(() => Math.round(performance.now()));
    const map = (await panelText(page, '.hud-rooms__map')).replace(/\n/g, ' | ');
    const open = map.includes('OPEN ON AT LEAST ONE SIDE');
    console.log(`t=${now}ms (+${queueEmptyAt === undefined ? '?' : now - queueEmptyAt}ms after queue empty) open=${open}`);
    if (!open) break;
    await page.locator('.hud-rooms__cancel').click().catch(() => undefined);
    await page.waitForTimeout(900);
    if (!(await page.locator('.hud-rooms__list').isVisible()))
      await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
  }

  console.log('=== snapshot / counts arrivals (t ms, kind, tick) ===');
  const log = await page.evaluate(() => (window as unknown as { lockstateMessageLog?: unknown[] }).lockstateMessageLog ?? []);
  const snaps = (log as { t: number; kind: string; tick: number | undefined }[]).filter(
    (e) => e.kind === 'simulation/snapshot',
  );
  console.log(`snapshots: ${JSON.stringify(snaps)}`);
  console.log(`counts messages: ${(log as unknown[]).length - snaps.length}`);
  console.log('=== console ===');
  console.log(console_.join('\n') || '(nothing)');
});
