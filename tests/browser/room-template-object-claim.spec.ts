import { expect, test } from './network-changed-fixture';
import { sentCommands } from './playtest-harness';

test('Full HD room plan blocks the non-anchor square of an in-flight desk', async ({ page }) => {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    const received: unknown[] = [];
    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { lockstateProbeWorker: Worker }).lockstateProbeWorker = this;
        super.addEventListener('message', (event: MessageEvent) => {
          if ((event.data as { kind?: string }).kind !== 'simulation/snapshot') received.push(event.data);
        });
      }
      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as unknown as { lockstateSentToWorker: unknown[] }).lockstateSentToWorker = sent;
    (window as unknown as { lockstateFromWorker: unknown[] }).lockstateFromWorker = received;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { lockstateProbeWorker: Worker }).lockstateProbeWorker.postMessage({
      protocolVersion: 1,
      messageId: 'desk-claim-browser',
      kind: 'simulation/submit-command',
      payload: {
        commandId: 'desk-claim-browser', sequence: 0, executeAtTick: 0,
        command: {
          schemaId: 'lockstate.simulation.command', schemaVersion: 1, transport: 'structured-clone',
          data: { type: 'PlaceBuildOrder', orderId: 'desk-claim', definitionId: 'desk-wooden', x: 9, y: 10 },
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Play at normal speed' }).click();

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.ui-panel.hud-build')).toHaveAttribute('data-queued', '1');
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('(10, 10)');
  await expect.poll(() => page.evaluate(() => {
    const messages = (window as unknown as { lockstateFromWorker: Array<{
      kind: string;
      payload?: { projectionId?: string; view?: { data?: unknown } };
    }> }).lockstateFromWorker;
    return messages.filter((message) => message.kind === 'simulation/projection' &&
      message.payload?.projectionId === 'world/room-template-preflight').at(-1)?.payload?.view?.data;
  })).toEqual({ ok: false, reason: 'object-occupied', tile: { x: 10, y: 10 } });
  await expect(dialog.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([]);
});
