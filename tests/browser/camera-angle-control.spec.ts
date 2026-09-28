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
      yawLeftShort: 'Left', yawRightShort: 'Right', elevationUpShort: 'Up',
      elevationDownShort: 'Down', resetShort: 'Reset',
      yaw: 'Turn', elevation: 'Tilt',
    }, (action) => { actions.push(action); });
    control.updatePose({ yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4 });
    document.querySelector('.hud__corner')?.prepend(control.element);
    Object.assign(window, { cameraAngleTestActions: actions, cameraAngleTestAvailability: (available: boolean) => control.setAvailable(available) });
  });
  const group = page.getByRole('group', { name: 'Camera angle' });
  await expect(group).toBeVisible();
  await expect(group.locator('.hud-camera-angle__button')).toHaveText(['Left', 'Right', 'Up', 'Down', 'Reset']);
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

test('camera tilt buttons disable at the renderer elevation limits', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(async () => {
    const { createCameraAngleControl } = await import('../../src/ui/hud/camera-angle-control');
    const control = createCameraAngleControl({
      title: 'Camera angle', yawLeft: 'Turn left', yawRight: 'Turn right',
      elevationUp: 'Tilt up', elevationDown: 'Tilt down', reset: 'Reset angle',
      yawLeftShort: 'Left', yawRightShort: 'Right', elevationUpShort: 'Up',
      elevationDownShort: 'Down', resetShort: 'Reset', yaw: 'Turn', elevation: 'Tilt',
    }, () => {});
    control.setAvailable(true);
    document.body.append(control.element);
    Object.assign(window, { cameraAngleLimitControl: control });
  });
  const group = page.getByRole('group', { name: 'Camera angle' });
  await page.evaluate(() => (window as typeof window & { cameraAngleLimitControl: { updatePose(pose: { yawRadians: number; elevationRadians: number }): void } }).cameraAngleLimitControl.updatePose({ yawRadians: 0, elevationRadians: 80 * Math.PI / 180 }));
  await expect(group.getByRole('button', { name: 'Tilt up' })).toBeDisabled();
  await expect(group.getByRole('button', { name: 'Tilt down' })).toBeEnabled();
  await page.evaluate(() => (window as typeof window & { cameraAngleLimitControl: { updatePose(pose: { yawRadians: number; elevationRadians: number }): void } }).cameraAngleLimitControl.updatePose({ yawRadians: 0, elevationRadians: 20 * Math.PI / 180 }));
  await expect(group.getByRole('button', { name: 'Tilt up' })).toBeEnabled();
  await expect(group.getByRole('button', { name: 'Tilt down' })).toBeDisabled();
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

test('Full HD angle controls remain distinct from the minimap at larger interface scales', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.evaluate(async () => {
    const { createCameraAngleControl } = await import('../../src/ui/hud/camera-angle-control');
    const control = createCameraAngleControl({
      title: 'Camera angle', yawLeft: 'Turn left', yawRight: 'Turn right',
      elevationUp: 'Tilt up', elevationDown: 'Tilt down', reset: 'Reset angle',
      yawLeftShort: 'Left', yawRightShort: 'Right', elevationUpShort: 'Up',
      elevationDownShort: 'Down', resetShort: 'Reset',
      yaw: 'Turn', elevation: 'Tilt',
    }, () => {});
    control.updatePose({ yawRadians: -Math.PI / 4, elevationRadians: Math.PI / 4 });
    document.querySelector('.hud-minimap')?.before(control.element);
  });
  for (const scale of [100, 125, 150]) {
    if (scale > 100) await page.locator('.display-scale__cycle').click();
    const geometry = await page.evaluate(() => {
      const group = document.querySelector('.hud-camera-angle')!.getBoundingClientRect();
      const map = document.querySelector('.hud-minimap')!.getBoundingClientRect();
      const corner = document.querySelector('.hud__corner')!;
      const buttons = [...document.querySelectorAll('.hud-camera-angle__button')].map((button) => button.getBoundingClientRect());
      return { group: { left: group.left, right: group.right, bottom: group.bottom }, mapTop: map.top, mapBottom: map.bottom,
        cornerBottom: corner.getBoundingClientRect().bottom, cornerScrollHeight: corner.scrollHeight, cornerClientHeight: corner.clientHeight,
        buttonWidths: buttons.map((button) => button.width), buttonHeights: buttons.map((button) => button.height) };
    });
    expect(geometry.group.left).toBeGreaterThanOrEqual(0);
    expect(geometry.group.right).toBeLessThanOrEqual(1920);
    expect(geometry.group.bottom).toBeLessThanOrEqual(geometry.mapTop + 1);
    expect(geometry.mapBottom, `${scale}% minimap extends beyond the Full HD viewport`).toBeLessThanOrEqual(1080);
    expect(Math.min(...geometry.buttonWidths)).toBeGreaterThanOrEqual(44 * scale / 100);
    expect(Math.min(...geometry.buttonHeights)).toBeGreaterThanOrEqual(44 * scale / 100);
    if (scale === 150) await page.screenshot({ path: testInfo.outputPath('angle-controls-150-percent-fullhd.png') });
  }
});
