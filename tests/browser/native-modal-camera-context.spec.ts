import { expect, test } from './network-changed-fixture';

// Real production composition: the camera remains active before/after the native
// dialog, and camera-bound keys must not move its underlying map while modal.
test('room-plan card focus excludes keyboard camera movement until Escape closes the native modal', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  const card = dialog.getByRole('button', { name: 'Four-cell row', exact: true });
  await card.focus();
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
  expect(await card.evaluate(element => document.activeElement === element)).toBe(true);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThan(160);
  const clip = { x: 132, y: 140, width: Math.min(240, box!.x - 140), height: 240 };
  const before = await page.screenshot({ clip });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyE');
  const after = await page.screenshot({ clip });
  await page.screenshot({ path: testInfo.outputPath('modal-card-camera-stable.png') });
  expect(after.equals(before), 'actual map pixels underneath modal must stay unchanged').toBe(true);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Room plans', exact: true })).toBeFocused();
  const closed = await page.screenshot({ clip });
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyE');
  expect((await page.screenshot({ clip })).equals(closed), 'world camera resumes after modal close').toBe(false);
});

test('a camera key first pressed in a native modal stays disarmed when the modal closes mid-hold', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).focus();
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
  await page.keyboard.down('KeyE');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  const clip = { x: 132, y: 140, width: 240, height: 240 };
  const closed = await page.screenshot({ clip });
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(closed), 'modal-origin KeyE must not rotate after focus returns to world').toBe(true);
  await page.keyboard.up('KeyE');
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyE');
  expect((await page.screenshot({ clip })).equals(closed), 'a fresh world KeyE still rotates the camera').toBe(false);
});
