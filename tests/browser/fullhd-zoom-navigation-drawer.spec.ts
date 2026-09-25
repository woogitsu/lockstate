import { expect, test } from './network-changed-fixture';

for (const uiScale of [1.75, 2]) {
  test(`Full HD at 200% page zoom keeps six sections in a keyboard reachable drawer at ${uiScale * 100}% UI scale`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/index.html');
    await page.evaluate((scale) => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
    }, uiScale);
    await page.reload();

    const hud = page.locator('.hud');
    await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'drawer');
    const readouts = page.locator('.hud-strip__metrics > .ui-stat');
    await expect(readouts).toHaveCount(9);
    for (const readout of await readouts.all()) await expect(readout).toBeInViewport();
    const trigger = page.locator('.hud-navigation-drawer__trigger');
    const tabs = page.locator('.hud-tabs__inner');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(tabs).toBeHidden();

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(tabs.locator('.ui-tab')).toHaveCount(6);
    const drawerBox = await tabs.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(960);
    expect(drawerBox!.y + drawerBox!.height).toBeLessThanOrEqual(540);
    for (const readout of await readouts.all()) {
      const box = await readout.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(drawerBox!.y);
    }
    for (const tab of await tabs.locator('.ui-tab').all()) {
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeInViewport();
    }
    await trigger.focus();
    for (const tab of await tabs.locator('.ui-tab').all()) {
      await page.keyboard.press('Tab');
      await expect(tab).toBeFocused();
      await expect(tab).toBeInViewport();
    }
    await page.keyboard.press('Escape');
    await expect(tabs).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await tabs.locator('[data-tab="build"]').click();
    await expect(tabs).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.locator('.display-scale__cycle').scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const aside = document.querySelector('.hud__aside') as HTMLElement;
      const cycle = document.querySelector('.display-scale__cycle') as HTMLElement;
      const box = cycle.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        asideScrollable: getComputedStyle(aside).overflowY === 'auto',
        cycleReachable: hit === cycle || cycle.contains(hit),
      };
    });
    expect(layout.asideScrollable).toBe(true);
    expect(layout.cycleReachable).toBe(true);
    await page.locator('.save-panel').scrollIntoViewIfNeeded();
    await expect(page.locator('.save-panel')).toBeInViewport();
  });
}
