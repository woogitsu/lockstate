import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD Build places one complete cell and keeps its claim after save and load', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  const place = dialog.getByRole('button', { name: 'Place room plan' });
  await expect(dialog.getByRole('status')).toContainText('clear');
  await expect(place).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('template-ready-fullhd.png') });
  await place.click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await expect(place).toBeDisabled();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } },
  ]);
  await expect.poll(() => page.evaluate(() =>
    ((window as unknown as { lockstateFromWorker?: Array<{kind: string; payload?: {status: string}} > }).lockstateFromWorker ?? [])
      .some((message) => message.kind === 'simulation/command-result' && message.payload?.status === 'queued'))).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

  await page.reload();
  await page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first().click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const restored = page.getByRole('dialog', { name: 'Room plans' });
  await restored.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await restored.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(restored.getByRole('status')).toContainText('blocked');
  await expect(restored.getByRole('button', { name: 'Place room plan' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('template-restored-blocked-fullhd.png') });
});

test('Full HD stale room-plan preflight refuses a competing square without queuing a partial cell', async ({ page }) => {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];
    class RacingWorker extends RealWorker {
      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const envelope = message as {
          messageId?: string;
          kind?: string;
          payload?: {
            commandId?: string;
            sequence?: number;
            command?: { data?: Record<string, unknown> };
          };
        };
        if (envelope.kind === 'simulation/submit-command' && envelope.payload?.command?.data?.type === 'PlaceRoomTemplate') {
          // The UI just saw a clear read-only preflight. A different command
          // now claims its first shell square before this command's tick.
          const competitor = structuredClone(envelope);
          competitor.messageId = `${envelope.messageId}-competitor`;
          competitor.payload!.commandId = `${envelope.payload.commandId}-competitor`;
          competitor.payload!.command!.data = {
            type: 'PlaceBuildOrder', orderId: 'race-wall', definitionId: 'wall-brick',
            x: 10, y: 10, footprint: 'square',
          };
          sent.push(competitor);
          super.postMessage(competitor);
          const later = structuredClone(envelope);
          later.payload!.sequence = envelope.payload.sequence! + 1;
          sent.push(later);
          super.postMessage(later);
          return;
        }
        sent.push(message);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = RacingWorker as unknown as typeof Worker;
    (window as unknown as { lockstateSentToWorker: unknown[] }).lockstateSentToWorker = sent;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('spinbutton', { name: 'Plan origin X' }).fill('10');
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('10');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan' }).click();
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  const refusal = page.locator('.hud__refusal');
  await expect(refusal).toHaveAttribute('data-source', 'simulation');
  await expect(refusal).toContainText('nothing can be built on that tile');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-panel.hud-build')).toHaveAttribute('data-queued', '1');
});
