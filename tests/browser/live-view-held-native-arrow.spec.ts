import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('a native View arrow starts renderer selection without panning the old map during actual registry preparation', async ({ page }, testInfo) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const view = page.getByRole('combobox', { name: 'View', exact: true });
  await expect(view).toHaveValue('world');
  await view.focus();
  const clip = { x: 132, y: 140, width: 240, height: 240 };
  const settledPixels = await page.screenshot({ clip });
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(settledPixels), 'the paused initial map is settled before selection').toBe(true);

  // Delay an actual production registry request, without fabricating its
  // response. The previous playable scene remains active during preparation.
  // This is a key first pressed on View, rather than the world-held key and
  // popup-consumed release covered by the room-plan catalogue regression.
  let release!: () => void;
  const preparation = new Promise<void>(resolve => { release = resolve; });
  let registryRequested = false;
  await page.route('**/game-content/oblique-module-registry.v1.json', async route => {
    registryRequested = true;
    await preparation;
    await route.continue();
  });
  try {
    await page.keyboard.down('ArrowDown');
    await expect.poll(() => registryRequested).toBe(true);
    await expect(view).toBeDisabled();
    await expect(view).toHaveAttribute('aria-busy', 'true');
    await page.waitForTimeout(300);
    const waitingPixels = await page.screenshot({ clip });
    await page.screenshot({ path: testInfo.outputPath('native-view-held-arrow-preparation.png') });
    expect(waitingPixels.equals(settledPixels), 'native option navigation must not start a world camera pan while the new view prepares').toBe(true);
  } finally {
    await page.keyboard.up('ArrowDown');
    release();
  }
  await expect(view).toHaveValue('oblique');
  await expect(view).toBeEnabled();
  await expect(view).toBeFocused();

  // A fresh key on an ordinary world-context button remains a camera action.
  await page.getByRole('button', { name: 'Build', exact: true }).focus();
  const switchedPixels = await page.screenshot({ clip });
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(switchedPixels), 'the replaced map settles before testing its fresh world key').toBe(true);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect((await page.screenshot({ clip })).equals(switchedPixels), 'fresh world camera navigation still works after replacement').toBe(false);
  expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
});
