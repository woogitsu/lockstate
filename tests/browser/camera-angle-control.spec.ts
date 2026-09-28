import { expect, test } from './network-changed-fixture';

test('Full HD angle controls show the active pose and send each button action', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.evaluate(async () => {
    const { createCameraAngleControl } = await import('../../src/ui/hud/camera-angle-control');
    const actions: string[] = [];
    const control = createCameraAngleControl({
      title: 'Camera angle', yawLeft: 'Turn left', yawRight: 'Turn right',
      elevationUp: 'Tilt up', elevationDown: 'Tilt down', reset: 'Reset angle',
      yaw: 'Turn', elevation: 'Tilt',
    }, (action) => { actions.push(action); });
    control.updatePose({ yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4 });
    document.querySelector('.hud__corner')?.prepend(control.element);
    Object.assign(window, { cameraAngleTestActions: actions, cameraAngleTestAvailability: (available: boolean) => control.setAvailable(available) });
  });
  const group = page.getByRole('group', { name: 'Camera angle' });
  await expect(group).toBeVisible();
  await expect(group.locator('output')).toHaveText('Turn -45° · Tilt 45°');
  for (const name of ['Turn left', 'Turn right', 'Tilt up', 'Tilt down', 'Reset angle']) {
    await group.getByRole('button', { name }).click();
  }
  await group.getByRole('button', { name: 'Turn left' }).focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as typeof window & { cameraAngleTestActions: string[] }).cameraAngleTestActions)).toEqual([
    'yaw-left', 'yaw-right', 'elevation-up', 'elevation-down', 'reset', 'yaw-left',
  ]);
  await page.evaluate(() => (window as typeof window & { cameraAngleTestAvailability: (available: boolean) => void }).cameraAngleTestAvailability(false));
  await expect(group.getByRole('button', { name: 'Turn left' })).toBeDisabled();
  await group.getByRole('button', { name: 'Turn left' }).evaluate((button: HTMLButtonElement) => button.click());
  expect(await page.evaluate(() => (window as typeof window & { cameraAngleTestActions: string[] }).cameraAngleTestActions)).toHaveLength(6);
  const geometry = await group.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(1920);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(1080);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  await page.screenshot({ path: testInfo.outputPath('camera-angle-controls-fullhd.png') });
});

test('camera shortcuts stop during text focus and armed placement', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.evaluate(async () => {
    const { CameraPoseInputAdapter } = await import('../../src/input/camera-pose-input');
    const input = document.createElement('input');
    input.id = 'camera-angle-focus-probe';
    document.body.append(input);
    const calls: string[] = [];
    const pose = { yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4 };
    let armed = false;
    const camera = {
      cameraPose: pose,
      setPoseRadians(yawRadians: number, elevationRadians: number): void {
        this.cameraPose = { yawRadians, elevationRadians };
        calls.push(`${yawRadians},${elevationRadians}`);
      },
    };
    const adapter = new CameraPoseInputAdapter(
      camera,
      () => document.activeElement === input ? ['text-entry'] : ['world'],
      () => armed,
    );
    window.addEventListener('keydown', (event) => { adapter.keyDown(event); });
    Object.assign(window, { cameraAngleKeyCalls: calls, armCameraTest: (next: boolean) => { armed = next; } });
  });
  for (const key of ['q', 'e', 'PageUp', 'PageDown', 'Home']) await page.keyboard.press(key);
  expect(await page.evaluate(() => (window as typeof window & { cameraAngleKeyCalls: string[] }).cameraAngleKeyCalls)).toHaveLength(5);
  await page.locator('#camera-angle-focus-probe').focus();
  await page.keyboard.press('q');
  expect(await page.evaluate(() => (window as typeof window & { cameraAngleKeyCalls: string[] }).cameraAngleKeyCalls)).toHaveLength(5);
  await page.locator('#camera-angle-focus-probe').evaluate((input: HTMLInputElement) => input.blur());
  await page.evaluate(() => (window as typeof window & { armCameraTest: (armed: boolean) => void }).armCameraTest(true));
  await page.keyboard.press('e');
  expect(await page.evaluate(() => (window as typeof window & { cameraAngleKeyCalls: string[] }).cameraAngleKeyCalls)).toHaveLength(5);
});
