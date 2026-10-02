import { expect, test } from './network-changed-fixture';
import { SEPARATOR_STEP } from '../../src/ui/primitives/resize-separator';

for (const renderer of ['world', 'oblique']) {
  test(`Full HD acknowledged inspector resize arrow does not continue panning the ${renderer} map`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/?renderer=${renderer}`);
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const separator = page.locator('.hud-layout__separator--inspector');
    await expect(separator).toBeVisible();
    await separator.focus();
    // Home is an existing layout control and has no world camera binding.
    // Begin at the minimum so Left is an acknowledged resize, not a no-op.
    await page.keyboard.press('Home');
    const minimum = Number(await separator.getAttribute('aria-valuemin'));
    await expect(separator).toHaveAttribute('aria-valuenow', String(minimum));
    await page.waitForTimeout(300);
    const clip = { x: 700, y: 300, width: 240, height: 240 };
    const settled = await page.screenshot({ clip });
    await page.waitForTimeout(300);
    expect((await page.screenshot({ clip })).equals(settled), 'the paused map is stable before native resizing').toBe(true);
    await page.keyboard.down('ArrowLeft');
    try {
      await expect(separator).toHaveAttribute('aria-valuenow', String(minimum + SEPARATOR_STEP));
      // Let the single requested layout change paint before measuring any
      // lingering world action. The held key emits no repeat in this probe.
      await page.waitForTimeout(300);
      const afterResize = await page.screenshot({ clip });
      const rail = await page.locator('.hud__rail').boundingBox();
      await page.waitForTimeout(300);
      await expect(separator).toHaveAttribute('aria-valuenow', String(minimum + SEPARATOR_STEP));
      expect(await page.locator('.hud__rail').boundingBox(), 'the rail is no longer resizing during the map comparison').toEqual(rail);
      await page.screenshot({ path: testInfo.outputPath(`held-resize-${renderer}.png`) });
      expect((await page.screenshot({ clip })).equals(afterResize), 'a resize key acknowledged by the HUD must not keep panning the map at a fixed panel width').toBe(true);
    } finally {
      await page.keyboard.up('ArrowLeft');
    }
    await expect(separator).toBeFocused();
    // Cross-axis arrows are deliberately unhandled by this vertical
    // separator. Preserve their existing world owner instead of introducing
    // a blanket keyboard guard on every focused HUD element.
    const beforeUnhandled = await page.screenshot({ clip });
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowDown');
    await expect(separator).toHaveAttribute('aria-valuenow', String(minimum + SEPARATOR_STEP));
    expect((await page.screenshot({ clip })).equals(beforeUnhandled), 'an unhandled cross-axis arrow still reaches world camera control').toBe(false);
    await page.getByRole('button', { name: 'Build', exact: true }).focus();
    const released = await page.screenshot({ clip });
    await page.waitForTimeout(300);
    expect((await page.screenshot({ clip })).equals(released), 'the released map settles before testing fresh world input').toBe(true);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');
    expect((await page.screenshot({ clip })).equals(released), 'a fresh world arrow still moves the camera').toBe(false);
  });
}
