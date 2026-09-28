import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee } from './playtest-harness';

test('Full HD worker builds a complete Delivery Bay and restores its footprint', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await installTee(page);
  await page.addInitScript(() => {
    const RealWorker = Worker;
    class ProbedWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        const projections: unknown[] = [];
        super.addEventListener('message', (event: MessageEvent) => {
          if ((event.data as { kind?: string })?.kind === 'simulation/projection') projections.push(event.data);
        });
        (window as unknown as { roomPlanProjections: unknown[] }).roomPlanProjections = projections;
        (window as unknown as { roomPlanWorker: Worker }).roomPlanWorker = this;
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbedWorker as typeof Worker;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  const roomRow = async () => page.evaluate(async () => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker was not captured');
    const messageId = crypto.randomUUID();
    return new Promise<{ access?: string; requirementSummary?: { missingCapability?: number } } | undefined>((resolve, reject) => {
      const timeout = setTimeout(() => { worker.removeEventListener('message', receive); reject(new Error('room-list projection timed out')); }, 5_000);
      const receive = (event: MessageEvent) => {
        const message = event.data as { kind?: string; replyTo?: string; payload?: { view?: { data?: unknown } } };
        if (message.kind !== 'simulation/projection' || message.replyTo !== messageId) return;
        clearTimeout(timeout);
        worker.removeEventListener('message', receive);
        const data = message.payload?.view?.data as { rooms?: { rows?: Array<{ access?: string; requirementSummary?: { missingCapability?: number } }> } } | undefined;
        resolve(data?.rooms?.rows?.[0]);
      };
      worker.addEventListener('message', receive);
      worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/room-list' } });
    });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/ready'))).toBe(true);
  await page.evaluate(() => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker was not captured');
    const target = { kind: 'room-template', templateId: 'delivery-bay-basic', origin: { x: 10, y: 10 } };
    worker.postMessage({ protocolVersion: 1, messageId: 'delivery-bay.preflight', kind: 'simulation/request-projection',
      payload: { projectionId: 'world/room-template-preflight', target } });
    worker.postMessage({ protocolVersion: 1, messageId: 'delivery-bay.cost', kind: 'simulation/request-projection',
      payload: { projectionId: 'world/room-template-cost', target } });
  });
  const projection = (replyTo: string) => page.evaluate((id) =>
    ((window as unknown as { roomPlanProjections?: Array<{ replyTo?: string; payload?: { view?: { data?: unknown } } }> }).roomPlanProjections ?? [])
      .find((message) => message.replyTo === id)?.payload?.view?.data, replyTo);
  await expect.poll(() => projection('delivery-bay.preflight')).toMatchObject({ ok: true });
  await expect.poll(() => projection('delivery-bay.cost')).toMatchObject({
    orderCount: 21, catalogueCostMinorUnits: 1780,
    materials: [{ itemId: 'item.brick', quantity: 38 }, { itemId: 'item.wood-plank', quantity: 4 }],
  });
  await page.evaluate(() => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker was not captured');
    worker.postMessage({
      protocolVersion: 1, messageId: 'delivery-bay.place', kind: 'simulation/submit-command',
      payload: { commandId: 'delivery-bay.place', sequence: 0, executeAtTick: 0,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceRoomTemplate', templateId: 'delivery-bay-basic', origin: { x: 10, y: 10 } } } },
    });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { commandId?: string; status?: string } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' && message.payload?.commandId === 'delivery-bay.place' && message.payload.status === 'queued'))).toBe(true);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await page.getByRole('button', { name: 'Fast forward' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect.poll(roomRow, { timeout: 120_000 }).toMatchObject({ access: 'doorway', requirementSummary: { missingCapability: 0 } });
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.screenshot({ path: testInfo.outputPath('delivery-bay-complete-fullhd.png') });

  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  await page.evaluate(() => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('restored simulation worker was not captured');
    worker.postMessage({ protocolVersion: 1, messageId: 'delivery-bay.restored', kind: 'simulation/request-projection',
      payload: { projectionId: 'world/room-template-preflight',
        target: { kind: 'room-template', templateId: 'delivery-bay-basic', origin: { x: 10, y: 10 } } } });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { roomPlanProjections?: Array<{
      replyTo?: string; payload?: { view?: { data?: { ok?: boolean; reason?: string } } };
    }> }).roomPlanProjections ?? []).find((message) => message.replyTo === 'delivery-bay.restored')?.payload?.view?.data,
  )).toMatchObject({ ok: false, reason: 'structure-occupied' });
  await expect.poll(roomRow).toMatchObject({ access: 'doorway', requirementSummary: { missingCapability: 0 } });
});
