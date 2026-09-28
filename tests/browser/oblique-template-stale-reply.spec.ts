import { expect, test } from './network-changed-fixture';

test('Full HD angled plan keeps the new ghost after an older placement reply', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: 'New prison' }).click();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Canteen' }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  const ghost = page.locator('.oblique-template-ghost');
  await page.mouse.move(960, 540);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  const originalOrigin = await ghost.locator('polygon').first().evaluate((node) => `${node.getAttribute('data-tile-x')},${node.getAttribute('data-tile-y')}`);
  await page.evaluate(() => {
    const prototype = Worker.prototype;
    const original = prototype.postMessage;
    const holder = { held: undefined as undefined | { worker: Worker; message: unknown }, intercept: true, replied: false };
    prototype.postMessage = function (message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
      const request = message as { kind?: string; payload?: { projectionId?: string } };
      if (holder.intercept && request.kind === 'simulation/request-projection' && request.payload?.projectionId === 'world/room-template-preflight') {
        holder.intercept = false;
        holder.held = { worker: this, message };
        return;
      }
      if (transfer === undefined) original.call(this, message);
      else original.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
    };
    (window as unknown as { releaseOldTemplateRequest: () => void; oldTemplateRequestHeld: () => boolean; oldTemplateReplySeen: () => boolean }).releaseOldTemplateRequest = () => {
      if (holder.held === undefined) throw new Error('No delayed preflight');
      const messageId = (holder.held.message as { messageId: string }).messageId;
      holder.held.worker.addEventListener('message', (event) => {
        if ((event.data as { replyTo?: string }).replyTo === messageId) holder.replied = true;
      });
      original.call(holder.held.worker, holder.held.message);
      holder.held = undefined;
    };
    (window as unknown as { oldTemplateRequestHeld: () => boolean }).oldTemplateRequestHeld = () => holder.held !== undefined;
    (window as unknown as { oldTemplateReplySeen: () => boolean }).oldTemplateReplySeen = () => holder.replied;
  });
  await page.mouse.click(960, 540);
  await expect.poll(() => page.evaluate(() => (window as unknown as { oldTemplateRequestHeld: () => boolean }).oldTemplateRequestHeld())).toBe(true);
  await page.mouse.move(1110, 620);
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
  await expect.poll(() => ghost.locator('polygon').first().evaluate((node) => `${node.getAttribute('data-tile-x')},${node.getAttribute('data-tile-y')}`)).not.toBe(originalOrigin);
  await page.evaluate(() => (window as unknown as { releaseOldTemplateRequest: () => void }).releaseOldTemplateRequest());
  await expect.poll(() => page.evaluate(() => (window as unknown as { oldTemplateReplySeen: () => boolean }).oldTemplateReplySeen())).toBe(true);
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveAttribute('data-verdict', 'clear');
});
