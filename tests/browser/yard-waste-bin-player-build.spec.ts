import { expect, test, type Page } from './network-changed-fixture';

interface ProbeWindow extends Window {
  askWorker?: (kind: string, payload: unknown) => Promise<unknown>;
}

async function installWorkerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let worker: Worker | undefined;
    const replies = new Map<string, (message: unknown) => void>();
    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        worker = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const replyTo = (event.data as { replyTo?: string }).replyTo;
          if (replyTo === undefined) return;
          const waiter = replies.get(replyTo);
          if (waiter === undefined) return;
          replies.delete(replyTo);
          waiter(event.data);
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as ProbeWindow).askWorker = (kind, payload) => new Promise((resolve, reject) => {
      if (worker === undefined) { reject(new Error('simulation worker absent')); return; }
      const messageId = crypto.randomUUID();
      const timer = setTimeout(() => { replies.delete(messageId); reject(new Error(`worker ${kind} timed out`)); }, 20_000);
      replies.set(messageId, message => { clearTimeout(timer); resolve(message); });
      worker.postMessage({ protocolVersion: 1, messageId, kind, payload });
    });
  });
}

async function binState(page: Page) {
  return page.evaluate(async () => {
    const reply = await (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) as {
      payload: { snapshot: { data: {
        construction: { orders: { definitionId: string; state: string }[] };
        simulation: { objects?: { placedObjects: { objectId: string; anchorTile: { x: number; y: number } }[] } };
      } } };
    };
    return reply.payload.snapshot.data;
  });
}

async function binRecessPixels(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // This rectangle covers the authored hood and dark recessed body at the
    // fixed Full HD camera pose, without including the dark HUD or map edge.
    const pixels = context.getImageData(885, 480, 75, 70).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index]!, g = pixels[index + 1]!, b = pixels[index + 2]!;
      if (r < 60 && g < 75 && b < 80) count += 1;
    }
    return count;
  }, png.toString('base64'));
}

test('player completes an existing waste bin in Yard and keeps it through Save/Load at Full HD', async ({ page }, info) => {
  await installWorkerProbe(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Yard', exact: true }).click();
  await dialog.locator('summary').filter({ hasText: 'Enter coordinates' }).click();
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('4');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('4');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Play at normal speed', exact: true }).click();
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('region', { name: 'Minimap', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('minimap absent');
  await minimap.click({ position: { x: bounds.width * .24, y: bounds.height * .24 } });
  await page.locator('[data-buildable="waste-bin-brick"]').click();
  await page.locator('.hud-build__arm').click();
  await page.mouse.move(940, 540);
  await expect(page.locator('.hud-build__target-value')).toContainText('7, 7');
  await page.mouse.click(940, 540);
  await page.locator('.hud-build__arm').click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await expect.poll(async () => (await binState(page)).simulation.objects?.placedObjects.filter(o => o.objectId === 'object.waste-bin').length,
    { timeout: 15_000 }).toBe(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const before = await binState(page);
  expect(before.construction.orders.filter(o => o.definitionId === 'waste-bin-brick').map(o => o.state)).toEqual(['completed']);
  expect(before.simulation.objects!.placedObjects.find(o => o.objectId === 'object.waste-bin')!.anchorTile).toEqual({ x: 7, y: 7 });
  await page.mouse.move(1300, 700);
  const painted = await page.screenshot({ path: info.outputPath('yard-waste-bin-completed.png') });
  expect(await binRecessPixels(page, painted), 'authored hood and recessed body must appear in the actual completed scene').toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  const loaded = await binState(page);
  expect(loaded.simulation.objects!.placedObjects.filter(o => o.objectId === 'object.waste-bin').map(o => o.anchorTile)).toEqual([{ x: 7, y: 7 }]);
  await minimap.click({ position: { x: bounds.width * .24, y: bounds.height * .24 } });
  await page.mouse.move(1300, 700);
  const restored = await page.screenshot({ path: info.outputPath('yard-waste-bin-loaded.png') });
  expect(await binRecessPixels(page, restored), 'authored hood and recessed body must remain visible after real Save/Load').toBeGreaterThan(1000);
});
