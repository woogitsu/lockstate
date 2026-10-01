import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

for (const half of [0, 1]) test(`keyboard selection, mirror, quote and rearming keeps the map hover for plan half ${half}`, async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  // The real cursor stays in the world throughout all subsequent keyboard UI.
  await page.mouse.move(880, 380);
  await page.getByRole('button', { name: 'Build', exact: true }).focus();
  await page.keyboard.press('Enter');
  const open = page.getByRole('button', { name: 'Room plans', exact: true });
  await open.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  const ids = await dialog.locator('[data-template-id]').evaluateAll(cards => cards.map(card => card.getAttribute('data-template-id')!));
  expect(ids).toHaveLength(20);
  for (const id of ids.slice(half * 10, half * 10 + 10)) {
    const card = dialog.locator(`[data-template-id="${id}"]`);
    await card.focus(); await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    const mirror = dialog.getByRole('checkbox', { name: 'Mirror horizontally' });
    await mirror.focus(); await page.keyboard.press('Space');
    const mirrored = await mirror.isChecked();
    await expect(dialog.locator('.hud-template__quote')).not.toBeEmpty();
    const map = dialog.getByRole('button', { name: 'Place on map', exact: true });
    await map.focus(); await page.keyboard.press('Enter');
    const ghost = page.locator('.room-template-world-ghost');
    await expect(ghost).toBeVisible();
    await expect(ghost.locator('polygon').first()).toBeVisible();
    await expect(ghost.locator('[role="status"]')).toContainText('Materials catalogue value:');
    const target = await page.evaluate(() => {
      const messages = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: { templateId: string; mirrorX: boolean } } }> }).lockstateSentToWorker;
      return messages.filter(m => m.payload?.projectionId === 'world/room-template-preflight').at(-1)!.payload!.target!;
    });
    expect(target.templateId).toBe(id);
    expect(Boolean(target.mirrorX)).toBe(mirrored);
    await page.keyboard.press('Escape');
    await expect(ghost).toBeHidden();
    expect((await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toHaveLength(0);
    await expect(open).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await page.screenshot({ path: testInfo.outputPath(`keyboard-plans-${half}.png`) });
});
