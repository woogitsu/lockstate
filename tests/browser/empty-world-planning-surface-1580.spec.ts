import { expect, test } from './network-changed-fixture';

test('Full HD empty start draws a quiet themed planning surface without taking map input', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await expect(page.locator('.empty-world-prompt')).toBeVisible();
  const before = await page.evaluate(() => {
    const app = document.getElementById('app')!;
    const style = getComputedStyle(app, '::before');
    return { content: style.content, background: style.backgroundColor, hit: document.elementFromPoint(960, 350)?.tagName };
  });
  expect(before.content).not.toBe('none');
  expect(before.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(before.hit).toBe('CANVAS');
  await page.screenshot({ path: testInfo.outputPath('planning-surface-fullhd-light.png') });

  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const night = await page.evaluate(() => getComputedStyle(document.getElementById('app')!, '::before').backgroundColor);
  expect(night).not.toBe(before.background);
  await page.screenshot({ path: testInfo.outputPath('planning-surface-fullhd-dark.png') });

  await page.getByRole('button', { name: 'Create a prison' }).click();
  await expect(page.locator('.empty-world-prompt')).toBeHidden();
  const after = await page.evaluate(() => getComputedStyle(document.getElementById('app')!, '::before').content);
  expect(after).toBe('none');
});
