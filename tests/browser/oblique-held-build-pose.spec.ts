import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('a held square Build drag reprojections its endpoint when the camera turns without a pointer move', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.locator('.hud-build__arm').click();
  await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');

  const target = page.locator('.hud-build__target-value');
  await page.mouse.move(900, 540);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(1200, 540, { steps: 5 });
  const beforeTurn = await target.innerText();
  expect(beforeTurn).toContain('whole squares');
  expect((await sentCommands(page)).filter(command => command['type'] === 'PlaceBuildOrder')).toHaveLength(0);

  await page.keyboard.down('KeyE');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyE');
  const beforePhysicalMove = await target.innerText();
  await page.mouse.move(1201, 540);
  const afterPhysicalMove = await target.innerText();
  expect(afterPhysicalMove, 'this camera turn did not change the dragged endpoint').not.toBe(beforeTurn);
  expect(beforePhysicalMove, 'the ghost kept the old world endpoint until pointermove').toBe(afterPhysicalMove);

  await page.mouse.up({ button: 'left' });
  const expected = Number(/^([0-9]+) whole squares/.exec(afterPhysicalMove)?.[1]);
  expect(Number.isInteger(expected) && expected > 0).toBe(true);
  await expect.poll(async () => (await sentCommands(page)).filter(command => command['type'] === 'PlaceBuildOrder').length)
    .toBe(expected);
});
