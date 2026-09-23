import { expect, test } from './network-changed-fixture';

test('arming Build on a phone folds the sheet so the world can be touched (#517)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();

  const panel = page.locator('.hud-build');
  await expect(panel).toHaveAttribute('data-collapsed', 'false');
  const exposedWorldTiles = () => page.evaluate(() => {
    const canvas = document.querySelector('#game-root canvas');
    let count = 0;
    for (let y = 8; y < window.innerHeight - 8; y += 16) {
      for (let x = 8; x < window.innerWidth - 8; x += 16) {
        if (document.elementFromPoint(x, y) === canvas) count += 1;
      }
    }
    return count;
  });
  const before = await exposedWorldTiles();
  await page.locator('.hud-build__arm').click();

  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  await expect(page.locator('.hud-build__arm')).toBeHidden();
  const after = await exposedWorldTiles();
  expect(after, `folding Build should expose more world than ${before} sample points`).toBeGreaterThan(before);

  await panel.locator('.ui-panel__toggle').click();
  await expect(panel).toHaveAttribute('data-collapsed', 'false');
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('aria-pressed', 'true');
});

test('removing also exposes the map on a phone, while desktop arming keeps Build open (#517)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();

  const panel = page.locator('.hud-build');
  await page.locator('.hud-build__remove').click();
  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  await panel.locator('.ui-panel__toggle').click();
  await expect(page.locator('.hud-build__remove')).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.hud-build__arm').click();
  await expect(panel).toHaveAttribute('data-collapsed', 'false');
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('aria-pressed', 'true');
});
