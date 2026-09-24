import { expect, test } from './network-changed-fixture';
import { openApp } from './playtest-harness';

test.use({ hasTouch: true });

test('screened intake actions fit the tablet rail and respond to touch', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openApp(page);
  await page.getByRole('button', { name: 'New prison' }).click();
  await page.locator('.hud__tabs [data-tab="manage"]').click();

  const offer = page.locator('.hud-intake__candidate').first();
  await expect(offer).toBeVisible();
  const id = await offer.getAttribute('data-candidate-id');
  expect(id).not.toBeNull();

  const touch = async (selector: string): Promise<void> => {
    const button = page.locator(selector);
    const initial = await button.boundingBox();
    expect(initial).not.toBeNull();
    expect(initial!.x + initial!.width / 2).toBeLessThan(1024);
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    const hit = await page.evaluate(([px, py, query]) => {
      const target = document.querySelector(query);
      const top = document.elementFromPoint(px, py);
      return target !== null && top !== null && target.contains(top);
    }, [x, y, selector] as const);
    expect(x).toBeLessThan(1024);
    expect(hit).toBe(true);
    await page.touchscreen.tap(x, y);
  };

  await touch(`.hud-intake__candidate[data-candidate-id="${id}"] [data-candidate-delay]`);
  await expect(offer).toContainText('Delayed');
  await touch(`.hud-intake__candidate[data-candidate-id="${id}"] [data-candidate-accept]`);
  await expect(page.locator(`.hud-intake__candidate[data-candidate-id="${id}"]`)).toHaveCount(0);
});
