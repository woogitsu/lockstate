import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from './network-changed-fixture';
import historicalJson from './fixtures/v9-max-active-order.json';
import { expectedMaxImport, MAX_NATIVE_ORDER_ID } from './fixtures/v9-max-active-order';
import { cancellationSnapshot, cancellationTransportReceipt, observeQueuedCancellation } from './queued-template-cancellation-observer';
import type { SaveEnvelope, SaveEnvelopeV9 } from '../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

if (process.env['LOCKSTATE_V10_MAX_NATIVE'] !== '1') throw Error('Explicit opt-in required: LOCKSTATE_V10_MAX_NATIVE=1');

const input = historicalJson as unknown as SaveEnvelopeV9;
const MAX = '9007199254740991';
const NEXT = '9007199254740992';
const funds = (bundle: SessionSnapshotBundle) => bundle.simulation?.economy?.treasury.balanceMinorUnits;

async function exportCurrent(page: Page): Promise<{ text: string; envelope: SaveEnvelope }> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.lockstate\.json$/u);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return { text, envelope: JSON.parse(text) as SaveEnvelope };
}

test('Full HD public historical V9 MAX import, queued-order Cancel and exact V10 Export/Load retain refunds and existing owners', async ({ page }, info) => {
  // Existing artifact config:60s/expect10s/w1/r0. No live state injection,
  // transport holding, clock speed change, synthetic UI click or fixture retry.
  const receipt: Record<string, unknown> = { sourceBase: '85f4471ebebc08f50400ee606c613197999be39a',
    historicalVersion: 9, activeOrderId: MAX_NATIVE_ORDER_ID, token: MAX, nextToken: NEXT };
  try {
    await observeQueuedCancellation(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await expect(page.locator('#game-root canvas')).toBeVisible();
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await (await choosing).setFiles({ name: 'legal-v9-max.lockstate.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(input), 'utf8') });
    await expect(page.locator('.save-panel__status')).toContainText('Imported the save file into this prison');
    await expect(page.locator('.save-panel__detail')).toContainText('Restored:');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    const expected = expectedMaxImport(input);
    await expect.poll(async () => (await cancellationSnapshot(page)).construction.orderRevisions?.[MAX_NATIVE_ORDER_ID]).toBe(MAX);
    const imported = await cancellationSnapshot(page);
    receipt['imported'] = imported;
    expect(imported, 'Public Import must restore the whole historical payload with only the approved text-counter migration').toEqual(expected);
    expect(imported.kernel.commands).toEqual([]);
    const target = imported.construction.orders.find(order => order.id === MAX_NATIVE_ORDER_ID)!;
    expect(target).toMatchObject({ definitionId: 'wall-brick', state: 'approved', footprint: 'square', location: { x: 3, y: 3 } });
    const owners = imported.simulation?.objects?.placedObjects;
    expect(owners).toHaveLength(5);
    expect(owners?.every(object => typeof object.sourceOrderId === 'string')).toBe(true);
    expect(owners).toContainEqual(expect.objectContaining({ objectId: 'object.bed',
      anchorTile: { x: 24, y: 6 }, orientation: 1, sourceOrderId: expect.any(String) }));
    const beforeTransport = await cancellationTransportReceipt(page);
    receipt['beforeTransport'] = beforeTransport;
    expect(beforeTransport.submissions).toEqual([]);
    expect(beforeTransport.workerUrls.length).toBeGreaterThan(0);
    for (const workerUrl of beforeTransport.workerUrls) {
      expect(new URL(workerUrl, page.url()).pathname).toMatch(/^\/assets\/worker-[^/]+\.js$/u);
      expect(workerUrl).not.toContain('/src/');
    }
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const queue = page.locator('.hud-build__queue > .ui-section__header');
    if (await queue.getAttribute('aria-expanded') === 'false') await queue.click();
    const row = page.locator(`.hud-build__queue-row[data-order="${MAX_NATIVE_ORDER_ID}"]`);
    await expect(row).toHaveAttribute('data-state', 'approved');
    await expect(row.locator('button')).toBeEnabled();
    await page.screenshot({ path: info.outputPath('actual-imported-v9-max-before-cancel.png') });
    // This is the existing queue-row public cancellation while paused, which
    // dispatches immediately; it is not the separate running600ms race case.
    await row.locator('button').click();
    await expect.poll(async () => (await cancellationSnapshot(page)).construction.orderRevisions?.[MAX_NATIVE_ORDER_ID]).toBe(NEXT);
    const cancelled = await cancellationSnapshot(page);
    receipt['cancelled'] = cancelled;
    expect(cancelled.construction.orders).toEqual(imported.construction.orders.map(order =>
      order.id === MAX_NATIVE_ORDER_ID ? { ...order, state: 'cancelled' } : order));
    expect(cancelled.construction.orderRevisions).toEqual({ ...imported.construction.orderRevisions, [MAX_NATIVE_ORDER_ID]: NEXT });
    expect(cancelled.construction.undoStack).toEqual(imported.construction.undoStack);
    expect(cancelled.construction.redoStack).toEqual(imported.construction.redoStack);
    expect(cancelled.construction.newerActionThanTheStackTop).toBe(true);
    expect(funds(cancelled)).toBe(funds(imported)! + 80);
    expect(cancelled.world).toEqual(imported.world);
    expect(cancelled.entities).toEqual(imported.entities);
    expect(cancelled.identity).toEqual(imported.identity);
    expect(cancelled.simulation?.objects).toEqual(imported.simulation?.objects);
    expect(cancelled.simulation?.prisoners).toEqual(imported.simulation?.prisoners);
    expect(cancelled.simulation?.roomTemplates).toEqual(imported.simulation?.roomTemplates);
    expect(cancelled.kernel.tick).toBe(imported.kernel.tick);
    expect(cancelled.kernel.expectedSequence).toBe(imported.kernel.expectedSequence + 1);
    expect(cancelled.kernel.commands).toEqual([]);
    const transport = await cancellationTransportReceipt(page);
    receipt['cancelTransport'] = transport;
    expect(transport.submissions).toHaveLength(1);
    expect(transport.submissions[0]).toMatchObject({ sequence: imported.kernel.expectedSequence,
      executeAtTick: imported.kernel.tick, command: { schemaId: 'lockstate.simulation.command', schemaVersion: 2,
        data: { type: 'CancelBuildOrder', orderId: MAX_NATIVE_ORDER_ID, expectedRevision: MAX } } });
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
    expect(await cancellationSnapshot(page)).toEqual(cancelled);
    const exported = await exportCurrent(page);
    receipt['exported'] = exported.envelope;
    await writeFile(info.outputPath('actual-exported-v10-max.lockstate.json'), exported.text);
    expect(exported.envelope.saveSchemaVersion).toBe(10);
    expect(exported.envelope.payload.construction.orderRevisions?.[MAX_NATIVE_ORDER_ID]).toBe(NEXT);
    expect(exported.envelope.payload).toEqual(cancelled);
    await page.locator('.save-panel__item').getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    const restored = await cancellationSnapshot(page);
    receipt['restored'] = restored;
    expect(restored, 'Actual exported V10 whole worker state, exact refund and every source owner must survive public Load').toEqual(cancelled);
    expect((await cancellationTransportReceipt(page)).submissions).toEqual(transport.submissions);
    await page.screenshot({ path: info.outputPath('actual-v10-max-after-public-load.png') });
  } finally {
    await writeFile(info.outputPath('actual-v10-max-public-receipt.json'), JSON.stringify(receipt, null, 2));
  }
});
