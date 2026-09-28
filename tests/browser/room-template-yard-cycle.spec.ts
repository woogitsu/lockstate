import { expect, test } from './network-changed-fixture';
import { countsSeries, installTee } from './playtest-harness';

test('Full HD worker designates the whole Yard with no construction cost and restores it', async ({ page }, testInfo) => {
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
    const target = { kind: 'room-template', templateId: 'yard-basic', origin: { x: 10, y: 10 } };
    worker.postMessage({ protocolVersion: 1, messageId: 'yard.preflight', kind: 'simulation/request-projection',
      payload: { projectionId: 'world/room-template-preflight', target } });
    worker.postMessage({ protocolVersion: 1, messageId: 'yard.cost', kind: 'simulation/request-projection',
      payload: { projectionId: 'world/room-template-cost', target } });
  });
  const projection = (replyTo: string) => page.evaluate((id) =>
    ((window as unknown as { roomPlanProjections?: Array<{ replyTo?: string; payload?: { view?: { data?: unknown } } }> }).roomPlanProjections ?? [])
      .find((message) => message.replyTo === id)?.payload?.view?.data, replyTo);
  await expect.poll(() => projection('yard.preflight')).toMatchObject({ ok: true });
  await expect.poll(() => projection('yard.cost')).toMatchObject({
    orderCount: 0, catalogueCostMinorUnits: 0, materials: [],
  });
  await page.evaluate(() => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker was not captured');
    worker.postMessage({
      protocolVersion: 1, messageId: 'yard.place', kind: 'simulation/submit-command',
      payload: { commandId: 'yard.place', sequence: 0, executeAtTick: 0,
        command: { schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceRoomTemplate', templateId: 'yard-basic', origin: { x: 10, y: 10 } } } },
    });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string; payload?: { commandId?: string; status?: string } }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' && message.payload?.commandId === 'yard.place' && message.payload.status === 'queued'))).toBe(true);
  await page.getByRole('button', { name: 'Play at normal speed' }).click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms, { timeout: 120_000 }).toBe(1);
  await expect.poll(roomRow, { timeout: 120_000 }).toMatchObject({ access: 'gap', requirementSummary: { missingCapability: 0 } });
  await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /[1-9]/, { timeout: 120_000 });
  await page.screenshot({ path: testInfo.outputPath('yard-complete-fullhd.png') });

  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect.poll(async () => (await countsSeries(page)).at(-1)?.rooms).toBe(1);
  await page.evaluate(() => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('restored simulation worker was not captured');
    worker.postMessage({ protocolVersion: 1, messageId: 'yard.restored', kind: 'simulation/request-projection',
      payload: { projectionId: 'world/room-template-preflight',
        target: { kind: 'room-template', templateId: 'yard-basic', origin: { x: 10, y: 10 } } } });
  });
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { roomPlanProjections?: Array<{
      replyTo?: string; payload?: { view?: { data?: { ok?: boolean; reason?: string } } };
    }> }).roomPlanProjections ?? []).find((message) => message.replyTo === 'yard.restored')?.payload?.view?.data,
  )).toMatchObject({ ok: false, reason: 'structure-occupied' });
  await expect.poll(roomRow).toMatchObject({ access: 'gap', requirementSummary: { missingCapability: 0 } });
});
