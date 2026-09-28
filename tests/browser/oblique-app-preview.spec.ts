import { expect, test } from './network-changed-fixture';

test('the angled preview uses the live application renderer at Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?oblique-preview=1');
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();
  const canvas = page.locator('#game-root canvas');
  await expect(canvas).toBeVisible();
  const emptyWorld = await canvas.screenshot();
  await page.locator('.empty-world-prompt').getByRole('button', { name: 'Create a prison' }).click();
  await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(emptyWorld)).toBe(false);
  expect(errors).toEqual([]);
});
