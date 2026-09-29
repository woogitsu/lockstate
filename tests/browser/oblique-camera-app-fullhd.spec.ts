import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('Full HD oblique camera controls the real world while Build is armed', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();

  const angle = page.locator('.hud-camera-angle');
  await expect(angle).toBeVisible();
  const reading = angle.locator('output');
  await expect(reading).toContainText('-45°');
  const worldClip = { x: 350, y: 260, width: 750, height: 500 };
  const before = await page.screenshot({ clip: worldClip });
  await angle.getByRole('button', { name: /Turn right|Obróć w prawo/ }).click();
  await expect(reading).toContainText('-30°');
  const after = await page.screenshot({ clip: worldClip });
  expect(after.equals(before), 'the rendered world did not turn with the HUD action').toBe(false);
  await page.screenshot({ path: testInfo.outputPath('oblique-after-hud-turn-fullhd.png') });

  await page.locator('#game-root canvas').click({ position: { x: 750, y: 400 } });
  await page.keyboard.press('q');
  await expect(reading).toContainText('-45°');

  const priorDrag = await reading.textContent();
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 420, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(reading).not.toHaveText(priorDrag ?? '');

  // Leaving while holding right must release turn capture.
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(2500, 1200, { steps: 2 });
  await page.mouse.move(700, 400);
  await page.mouse.up({ button: 'right' });
  const afterCanvasExit = await reading.textContent();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 420, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(reading).not.toHaveText(afterCanvasExit ?? '');

  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.getByRole('button', { name: /Place on map|Stawiaj na mapie/ }).click();
  await expect(angle.getByRole('button', { name: /Turn right|Obróć w prawo/ })).toBeEnabled();
  const armedPose = await reading.textContent();
  await page.keyboard.press('e');
  await expect(reading).not.toHaveText(armedPose ?? '');
  const afterKey = await reading.textContent();
  await page.mouse.move(700, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(800, 420, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(reading).not.toHaveText(afterKey ?? '');
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')).toHaveLength(0);
  await expect(page.locator('.oblique-square-ghost polygon').first()).toBeVisible();
  await page.mouse.move(960, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1040, 540, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  expect((await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder')).toHaveLength(0);
  await page.mouse.up({ button: 'left' });
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceBuildOrder').length).toBeGreaterThan(0);
});
