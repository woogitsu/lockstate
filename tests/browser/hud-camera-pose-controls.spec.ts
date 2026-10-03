import { expect, test } from './network-changed-fixture';

test('labelled HUD pose buttons send distinct renderer-only steps at Full HD', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(async () => {
    const hudModule = '/src/ui/hud/hud.ts';
    const localeModule = '/src/services/localization/index.ts';
    const { mountHud } = await import(/* @vite-ignore */ hudModule);
    const { Localizer, defaultMessageCatalogEn } = await import(/* @vite-ignore */ localeModule);
    const root = document.getElementById('ui-root')!;
    root.replaceChildren();
    const steps: unknown[] = [];
    (window as Window & { poseSteps?: unknown[] }).poseSteps = steps;
    mountHud(root, {
      localizer: new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] }),
      onCameraPoseStep: (axis: string, direction: number) => { steps.push([axis, direction]); },
    });
  });
  for (const label of ['Rotate camera left', 'Rotate camera right', 'Raise camera angle', 'Lower camera angle']) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeVisible();
    const reachable = await button.evaluate(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && hit !== null && element.contains(hit);
    });
    expect(reachable).toBe(true);
    await button.click();
  }
  expect(await page.evaluate(() => (window as Window & { poseSteps?: unknown[] }).poseSteps)).toEqual([
    ['yaw', -1], ['yaw', 1], ['elevation', 1], ['elevation', -1],
  ]);
});

test('the fixed renderer does not offer inert pose buttons', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('#game-root canvas')).toBeVisible();
  // The live renderer switch retains the port and hides this group in WorldScene.
  // A hidden DOM group is legal; offering an accessible inert button is not.
  await expect(page.locator('.hud-camera-pose')).toBeHidden();
  for (const label of ['Rotate camera left', 'Rotate camera right', 'Raise camera angle', 'Lower camera angle']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
});
