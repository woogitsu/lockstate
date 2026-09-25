import { expect, test, type Page } from './network-changed-fixture';

async function paintedMetricCollisions(page: Page): Promise<string[]> {
  return page.locator('.hud-strip__metrics > .ui-stat').evaluateAll((chips) => chips.flatMap((chip) => {
    const label = chip.querySelector('.ui-stat__label');
    const badge = chip.querySelector('.hud-metric__trailing');
    if (label === null) return [];
    // A flex item may shrink while its nowrap text paints outside the box.
    // Range rectangles follow the actual glyph lines, including a wrapped PL label.
    const labelInk = document.createRange();
    labelInk.selectNodeContents(label);
    const badgeBox = badge?.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    return [...labelInk.getClientRects()].flatMap((ink) => {
      const outside = ink.left < chipBox.left - 0.5 || ink.right > chipBox.right + 0.5;
      const covered = badgeBox !== undefined && badgeBox.width > 0 &&
        ink.left < badgeBox.right && badgeBox.left < ink.right &&
        ink.top < badgeBox.bottom && badgeBox.top < ink.bottom;
      return outside || covered ? [chip.textContent?.trim() ?? 'unknown chip'] : [];
    });
  }));
}

for (const uiScale of [1.75, 2]) {
  test(`Full HD at 200% page zoom keeps six sections in a keyboard reachable drawer at ${uiScale * 100}% UI scale`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    await page.addInitScript((scale) => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
    }, uiScale);
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    const hud = page.locator('.hud');
    await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'drawer');
    const readouts = page.locator('.hud-strip__metrics > .ui-stat');
    await expect(readouts).toHaveCount(9);
    for (const readout of await readouts.all()) await expect(readout).toBeInViewport();
    expect(await paintedMetricCollisions(page), 'metric labels must stay inside their chips and clear of badges').toEqual([]);
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
    if (uiScale === 2) {
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const buildTab = tabs.locator('[data-tab="build"]');
      await buildTab.focus();
      await page.setViewportSize({ width: 960, height: 750 });
      await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'bar');
      await expect(buildTab).toBeFocused();
      await page.setViewportSize({ width: 960, height: 540 });
      await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'drawer');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText('Show the sections');
      await page.setViewportSize({ width: 960, height: 750 });
      await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'bar');
      await expect(page.locator('.hud-layout__arrow[data-layout-region="navigation"]')).toBeFocused();
      await page.setViewportSize({ width: 960, height: 540 });
      await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'drawer');
      await trigger.focus();
      await page.setViewportSize({ width: 600, height: 540 });
      await expect(hud).toHaveAttribute('data-layout-tier', 'phone');
      await expect(tabs.locator('[aria-current="true"]')).toBeFocused();
      await page.setViewportSize({ width: 960, height: 750 });
      await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'bar');
      await page.locator('.hud-layout__arrow[data-layout-region="navigation"]').focus();
      await page.setViewportSize({ width: 960, height: 540 });
      await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'drawer');
      await expect(trigger).toBeFocused();
    }
  });
}

for (const uiScale of [1.75, 2]) {
  test(`Polish status labels remain readable at Full HD 200% page zoom and ${uiScale * 100}% UI scale`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    await page.addInitScript((scale) => {
      localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' }));
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
    }, uiScale);
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Nowe więzienie' }).click();
    await expect(page.locator('.hud')).toHaveAttribute('data-layout-navigation-placement', 'drawer');
    await expect(page.locator('.hud-strip__metrics > .ui-stat')).toHaveCount(9);
    expect(await paintedMetricCollisions(page), 'Polish metric labels must clear neighbours and badges').toEqual([]);
  });
}

test('a collapsed navigation can be restored from the Full HD zoom drawer when loaded from settings', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.addInitScript(() => {
    localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 2 }));
    localStorage.setItem('lockstate.settings.layout', JSON.stringify({ version: 1, collapsed: ['navigation'] }));
  });
  await page.goto('/index.html');
  await expect(page.locator('.hud')).toHaveAttribute('data-layout-navigation', 'collapsed');

  const hud = page.locator('.hud');
  await expect(hud).toHaveAttribute('data-layout-navigation-placement', 'drawer');
  await expect(hud).toHaveAttribute('data-layout-navigation', 'collapsed');
  const trigger = page.locator('.hud-navigation-drawer__trigger');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(hud).toHaveAttribute('data-layout-navigation', 'open');
  const tabs = page.locator('.hud-tabs__inner');
  await expect(tabs.locator('.ui-tab')).toHaveCount(6);
  for (const tab of await tabs.locator('.ui-tab').all()) {
    await tab.scrollIntoViewIfNeeded();
    await expect(tab).toBeInViewport();
  }
});
