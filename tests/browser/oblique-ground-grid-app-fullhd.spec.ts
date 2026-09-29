import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('placed Basic cell plan shows quiet Browse ground at three Full HD camera angles', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?oblique-preview=1');
  await page.locator('.empty-world-prompt').getByRole('button', { name: /Create a prison|Utwórz więzienie/ }).click();
  await expect(page.locator('.empty-world-prompt')).toBeHidden();
  await expect(page.locator('body[data-oblique-preview="ready"]')).toBeVisible();

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Basic cell', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map' }).click();
  await page.mouse.move(960, 540);
  await expect(page.locator('.oblique-template-ghost')).toHaveAttribute('data-verdict', 'clear');
  await page.screenshot({ path: testInfo.outputPath('planned-cell-build-grid-yaw-45-fullhd.png') });
  await page.mouse.click(960, 540);
  await expect.poll(async () => (await sentCommands(page)).filter((command) => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  await expect(page.locator('.oblique-template-ghost')).toBeHidden();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();

  const angle = page.locator('.hud-camera-angle');
  const reading = angle.locator('output');
  for (const yaw of [-45, 0, 45]) {
    await expect(reading).toContainText(`${yaw}°`);
    await page.screenshot({ path: testInfo.outputPath(`planned-cell-browse-yaw${yaw}-fullhd.png`) });
    if (yaw !== 45) {
      for (let step = 0; step < 3; step += 1) {
        await angle.getByRole('button', { name: /Turn right|Obróć w prawo/ }).click();
      }
    }
  }
});
