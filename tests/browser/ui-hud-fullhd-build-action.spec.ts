import { expect, test } from './network-changed-fixture';

for (const uiScale of [100, 125, 150, 175, 200] as const) {
  test(`Full HD Build at ${uiScale}% keeps the selected tool and placement action usable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await page.locator('#game-root canvas').waitFor();
    await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
    if (uiScale > 100) {
      for (let step = 0; step < (uiScale - 100) / 25; step += 1) await page.locator('.display-scale__cycle').click();
    }
    await page.locator('.ui-tab[data-tab="build"]').click();

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.hud-build')!;
      const arm = panel.querySelector<HTMLElement>('.hud-build__arm')!;
      const selected = panel.querySelector<HTMLElement>('.hud-build__list > .ui-row[aria-checked="true"]')!;
      const savePanel = document.querySelector<HTMLElement>('.save-panel')!;
      const create = savePanel.querySelector<HTMLElement>('.save-panel__create')!;
      const summary = savePanel.querySelector<HTMLElement>('.save-panel__heading')!;
      const saves = [...savePanel.querySelectorAll<HTMLElement>('.save-panel__actions .save-panel__button')];
      const panelBox = panel.getBoundingClientRect();
      const armBox = arm.getBoundingClientRect();
      const selectedBox = selected.getBoundingClientRect();
      const saveBox = savePanel.getBoundingClientRect();
      const isHit = (element: HTMLElement, box: DOMRect) => {
        const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return target === element || element.contains(target);
      };
      return {
        armVisible: armBox.top >= panelBox.top && armBox.bottom <= panelBox.bottom && isHit(arm, armBox),
        selectedVisible: selectedBox.top >= panelBox.top && selectedBox.bottom <= panelBox.bottom && isHit(selected, selectedBox),
        savesCompact: saves.length === 3 && !savePanel.querySelector('details')!.open
          && isHit(create, create.getBoundingClientRect())
          && isHit(summary, summary.getBoundingClientRect())
          && create.getBoundingClientRect().bottom <= saveBox.bottom + 1,
        mapHit: document.elementFromPoint(960, 540)?.tagName,
      };
    });

    expect(geometry.armVisible, JSON.stringify(geometry)).toBe(true);
    expect(geometry.selectedVisible, JSON.stringify(geometry)).toBe(true);
    expect(geometry.savesCompact, JSON.stringify(geometry)).toBe(true);
    expect(geometry.mapHit).toBe('CANVAS');
    await page.locator('.save-panel__heading').click();
    for (const action of await page.locator('.save-panel__actions .save-panel__button').all()) {
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeVisible();
      expect(await action.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit === element || element.contains(hit);
      })).toBe(true);
    }
    if (uiScale === 100 || uiScale === 200) {
      await page.screenshot({ path: testInfo.outputPath(`build-${uiScale}-catalogue.png`) });
    }
  });
}

test('Full HD Build at 200% reveals more tools by wheel and keyboard while keeping its action and selection', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
  for (let step = 100; step < 200; step += 25) await page.locator('.display-scale__cycle').click();
  await page.locator('.ui-tab[data-tab="build"]').click();

  const list = page.locator('.hud-build__list');
  const selectedSummary = page.locator('.hud-build__selected-summary');
  const arm = page.locator('.hud-build__arm');
  const brick = list.getByRole('radio', { name: /Brick wall/ });
  const door = list.getByRole('radio', { name: /Wooden door/ });
  const bed = list.getByRole('radio', { name: /^Bed ·/ });
  await expect(selectedSummary).toContainText('Brick wall');
  await expect(arm).toBeInViewport();
  const initial = await list.evaluate((element) => ({
    scrollable: element.scrollHeight > element.clientHeight,
    scrollbar: getComputedStyle(element).overflowY,
    cue: getComputedStyle(document.querySelector('.hud-build__catalogue .ui-section__header')!, '::after').content,
  }));
  expect(initial).toEqual({ scrollable: true, scrollbar: 'scroll', cue: '"↓"' });
  await page.screenshot({ path: testInfo.outputPath('build-200-catalogue-initial.png') });

  await list.hover();
  await page.mouse.wheel(0, 120);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(door).toBeInViewport();
  await expect(selectedSummary).toContainText('Brick wall');
  await expect(arm).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('build-200-catalogue-wheel.png') });

  await brick.focus();
  await page.keyboard.press('ArrowDown');
  await expect(door).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(selectedSummary).toContainText('Wooden door');
  await page.keyboard.press('ArrowDown');
  await expect(bed).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(selectedSummary).toContainText('Bed');
  await expect(arm).toBeInViewport();
  expect(await page.evaluate(() => document.elementFromPoint(960, 540)?.tagName)).toBe('CANVAS');
  await page.screenshot({ path: testInfo.outputPath('build-200-catalogue-keyboard.png') });
});
