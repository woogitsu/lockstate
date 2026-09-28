import { expect, test } from './network-changed-fixture';
import { installTee } from './playtest-harness';

test('Full HD worker refuses an overflowing room footprint and stays responsive after Save and Load', async ({ page }) => {
  test.setTimeout(90_000);
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
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{ kind: string }> }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/ready'))).toBe(true);

  const request = async (messageId: string, x: number) => page.evaluate(({ messageId, x }) => {
    const worker = (window as unknown as { roomPlanWorker?: Worker }).roomPlanWorker;
    if (worker === undefined) throw new Error('simulation worker was not captured');
    worker.postMessage({
      protocolVersion: 1, messageId, kind: 'simulation/request-projection',
      payload: { projectionId: 'world/room-template-preflight',
        target: { kind: 'room-template', templateId: 'cell-basic', origin: { x, y: 10 } } },
    });
  }, { messageId, x });
  const result = async (messageId: string) => page.evaluate((id) =>
    ((window as unknown as { roomPlanProjections?: Array<{
      kind: string; replyTo?: string; payload?: { view?: { data?: unknown } };
    }> }).roomPlanProjections ?? []).find((message) => message.kind === 'simulation/projection' && message.replyTo === id)?.payload?.view?.data,
  messageId);

  await request('overflow.before-save', Number.MAX_SAFE_INTEGER);
  await expect.poll(() => result('overflow.before-save')).toEqual({
    ok: false, reason: 'unowned-land', tile: { x: Number.MAX_SAFE_INTEGER, y: 10 },
  });
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await request('valid.after-load', 10);
  await expect.poll(() => result('valid.after-load')).toEqual({ ok: true });
});
