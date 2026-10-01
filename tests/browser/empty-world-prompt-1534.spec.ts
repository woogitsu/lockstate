import { expect, test } from './network-changed-fixture';

for (const viewport of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
  test(`empty world offers central create and saved-prison routes at ${viewport.width}x${viewport.height} (#1534)`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/index.html');
    await expect(page.locator('.save-panel')).toBeVisible();
    const prompt = page.locator('.empty-world-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveAccessibleName('Start a prison');
    const planningSurface = await page.locator('#app').evaluate((element) => {
      const style = getComputedStyle(element, '::before');
      return { content: style.content, backgroundImage: style.backgroundImage };
    });
    expect(planningSurface.content).toBe('""');
    expect(planningSurface.backgroundImage).toContain('url(');
    const minimap = page.locator('.hud-minimap__surface');
    await expect(minimap).toBeDisabled();
    await expect(minimap).toHaveAccessibleName('Create or load a prison to see the map');
    await minimap.evaluate((element) => {
      element.setAttribute('data-observed-clicks', '0');
      element.addEventListener('click', () => element.setAttribute('data-observed-clicks', '1'));
    });
    const minimapBounds = await minimap.boundingBox();
    expect(minimapBounds).not.toBeNull();
    await page.mouse.click(minimapBounds!.x + minimapBounds!.width / 2, minimapBounds!.y + minimapBounds!.height / 2);
    await expect(minimap).toHaveAttribute('data-observed-clicks', '0');
    await page.screenshot({ path: testInfo.outputPath(`empty-world-${viewport.width}x${viewport.height}.png`) });
    const bounds = await prompt.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport.width / 2)).toBeLessThan(1);
    expect(Math.abs(bounds!.y + bounds!.height / 2 - viewport.height / 2)).toBeLessThan(1);
    const create = prompt.getByRole('button', { name: 'Create a prison' });
    await expect(create).toBeVisible();
    await create.focus();
    await page.keyboard.press('Enter');
    await expect(prompt).toBeHidden();
    const surfaceAfterCreate = await page.locator('#app').evaluate((element) => {
      const style = getComputedStyle(element, '::before');
      return { content: style.content, backgroundImage: style.backgroundImage };
    });
    expect(surfaceAfterCreate.content).toBe('none');
    expect(surfaceAfterCreate.backgroundImage).toBe('none');
    await expect(minimap).toBeEnabled();
    await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
    for (const tab of ['build', 'manage', 'security']) {
      await page.locator(`.ui-tab[data-tab="${tab}"]`).click();
      await page.screenshot({ path: testInfo.outputPath(`active-${tab}-${viewport.width}x${viewport.height}.png`) });
    }

    await page.reload();
    await expect(prompt).toBeVisible();
    const choose = prompt.getByRole('button', { name: 'Load a saved prison' });
    await expect(choose).toBeVisible();
    await choose.click();
    const load = page.locator('.save-panel__item button').filter({ hasText: 'Load' }).first();
    await expect(load).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(prompt).toBeHidden();
    await expect(page.locator('.save-panel__item[data-active="true"]')).toBeVisible();
  });
}

test('the start card leaves the map clickable and yields compact viewports to the save rail (#1534)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  const prompt = page.locator('.empty-world-prompt');
  await expect(prompt).toBeVisible();
  expect(await page.evaluate(() => document.elementFromPoint(960, 540)?.tagName)).toBe('CANVAS');
  await expect(prompt.getByRole('button', { name: 'Create a prison' })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(prompt).toBeHidden();
  await expect(page.locator('.save-panel').getByRole('button', { name: 'New prison' })).toBeVisible();
  expect(await page.evaluate(() => document.elementFromPoint(640, 360)?.tagName)).toBe('CANVAS');
});

test('the central route reaches a restorable deleted prison before offering Load (#1534)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('.empty-world-prompt').getByRole('button', { name: 'Create a prison' }).click();
  const active = page.locator('.save-panel__item[data-active="true"]');
  await expect(active).toBeVisible();
  await active.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('.save-panel__item[data-deleted-prison]')).toBeVisible();
  await expect(page.locator('.hud-minimap__surface')).toBeDisabled();
  const prompt = page.locator('.empty-world-prompt');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Restore a deleted prison' }).click();
  await expect(page.locator('.save-panel__item[data-deleted-prison] button').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(prompt.getByRole('button', { name: 'Load a saved prison' })).toBeVisible();
});

test.describe('Polish empty-session labels (#1534)', () => {
  test.use({ locale: 'pl-PL' });
  test('the central routes and inert minimap have Polish accessible names', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await expect(page.locator('.empty-world-prompt')).toHaveAccessibleName('Rozpocznij grę');
    await expect(page.locator('.empty-world-prompt').getByRole('button', { name: 'Utwórz więzienie' })).toBeVisible();
    await expect(page.locator('.hud-minimap__surface')).toBeDisabled();
    await expect(page.locator('.hud-minimap__surface')).toHaveAccessibleName('Utwórz lub wczytaj więzienie, aby zobaczyć mapę');
  });
});

test('empty Full HD planning surface paints pixels above the world canvas (#1580)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await expect(page.locator('.empty-world-prompt')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // This patch is outside the prompt, navigation, minimap and save rail.
  // Decode the composited screenshot: a correct CSS value alone cannot prove
  // the pseudo-element is actually painted above the WebGL canvas.
  const screenshot = await page.screenshot({ clip: { x: 850, y: 280, width: 24, height: 24 } });
  const brightness = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      sum += (pixels[index]! + pixels[index + 1]! + pixels[index + 2]!) / 3;
    }
    return sum / (pixels.length / 4);
  }, Array.from(screenshot));
  expect(brightness).toBeGreaterThan(180);
});
