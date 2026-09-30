import { expect, test } from './network-changed-fixture';

test('empty Full HD world uses an inert planning surface behind the start card (#1580)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await expect(page.locator('.empty-world-prompt')).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#app')!, '::before').backgroundImage)).not.toBe('none');
  expect(await page.evaluate(() => document.elementFromPoint(960, 540)?.tagName)).toBe('CANVAS');

  await page.locator('.empty-world-prompt').getByRole('button', { name: 'Create a prison' }).click();
  await expect(page.locator('.empty-world-prompt')).toBeHidden();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('#app')!, '::before').backgroundImage)).toBe('none');
});
