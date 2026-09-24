import { expect, test, type Locator, type Page } from './network-changed-fixture';

test.use({ hasTouch: true });

const disclosure = '.hud-build > .ui-panel__header .ui-panel__toggle';

async function freeWorldSquare(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    for (let y = Math.max(0, box.top); y + 64 < Math.min(innerHeight, box.bottom); y += 8) {
      for (let x = Math.max(0, box.left); x + 64 < Math.min(innerWidth, box.right); x += 8) {
        let clear = true;
        for (let dy = 0; dy <= 64 && clear; dy += 16) {
          for (let dx = 0; dx <= 64; dx += 16) {
            if (document.elementFromPoint(x + dx, y + dy) !== canvas) { clear = false; break; }
          }
        }
        if (clear) return { x: Math.round(x + 32), y: Math.round(y + 32) };
      }
    }
    return null;
  });
}

async function tapControl(page: Page, control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box, 'the control has no touch target').not.toBeNull();
  if (box === null) return;
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  expect(await control.evaluate((element, { x, y }) => element.contains(document.elementFromPoint(x, y)), point),
    'another control covers the touch target').toBe(true);
  await page.touchscreen.tap(point.x, point.y);
}

test('Build arrival spends no map centre at the short and narrow viewport boundaries (#899)', async ({ page }) => {
  // 640x400 and 188x406 are effective CSS viewports for 1280x800 and
  // 375x812 at 200% page zoom; Playwright cannot set native page zoom.
  for (const [width, height] of [[375, 812], [188, 406], [640, 400], [720, 450], [900, 600], [1024, 600]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/index.html');
    await page.locator('#game-root canvas').waitFor();
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.locator('.ui-tab[data-tab="build"]').click();
    const state = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
      const panel = document.querySelector<HTMLElement>('.hud-build');
      if (!canvas || !panel) throw new Error('missing Build or canvas');
      const box = canvas.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { folded: panel.dataset['collapsed'] === 'true', buildBlocksCentre: panel.contains(hit) };
    });
    expect(state.buildBlocksCentre, `${width}x${height}: Build covers the world centre on arrival`).toBe(false);
    if (width === 375) expect(await freeWorldSquare(page), 'no unobstructed 64px world square on phone arrival').not.toBeNull();
    await expect(page.locator(disclosure)).toHaveAttribute('aria-expanded', state.folded ? 'false' : 'true');
  }
});

test('touch can reopen Build, place, switch tools, remove and stop at 375x812 (#899)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();
  const panel = page.locator('.hud-build');
  const toggle = page.locator(disclosure);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await tapControl(page, toggle);
  await tapControl(page, page.locator('.hud-build__list [data-buildable="bed-wooden"]'));
  await tapControl(page, page.locator('.hud-build__arm'));
  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  const firstSquare = await freeWorldSquare(page);
  expect(firstSquare, 'no touch-sized world square after arming').not.toBeNull();
  if (firstSquare === null) return;
  await page.touchscreen.tap(firstSquare.x, firstSquare.y);

  await tapControl(page, toggle);
  await tapControl(page, page.locator('.hud-build__list [data-buildable="wall-brick"]'));
  await expect(page.locator('.hud-build__list [data-buildable="wall-brick"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
  await tapControl(page, toggle);
  expect(await freeWorldSquare(page), 'switching tools left no touch-sized world square').not.toBeNull();

  await tapControl(page, toggle);
  await tapControl(page, page.locator('.hud-build__remove'));
  await expect(panel).toHaveAttribute('data-collapsed', 'true');
  expect(await freeWorldSquare(page), 'removal left no touch-sized world square').not.toBeNull();
  await tapControl(page, toggle);
  await tapControl(page, page.locator('.hud-build__remove'));
  await expect(page.locator('.hud-build__remove')).toHaveAttribute('data-removing', 'false');
});

test('keyboard disclosure preserves the selected tool and a named focus target on phone (#899)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: 'New prison' }).click();
  const buildTab = page.locator('.ui-tab[data-tab="build"]');
  await buildTab.focus();
  await page.keyboard.press('Enter');
  await expect(buildTab).toBeFocused();
  const toggle = page.locator(disclosure);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAccessibleName('Expand');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAccessibleName('Collapse');
  const bed = page.locator('.hud-build__list [data-buildable="bed-wooden"]');
  await bed.focus();
  await page.keyboard.press('Enter');
  const arm = page.locator('.hud-build__arm');
  await arm.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(bed).toHaveAttribute('data-selected', 'true');
  await expect(arm).toHaveAttribute('data-armed', 'true');
});
