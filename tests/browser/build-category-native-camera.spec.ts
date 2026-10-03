import { expect, test } from './network-changed-fixture';
import { DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';
import { installTee, sentCommands } from './playtest-harness';

for (const { renderer, scale, worldKey } of [
  { renderer: 'world', scale: 1, worldKey: 'KeyJ' },
  { renderer: 'oblique', scale: 1, worldKey: 'KeyJ' },
  { renderer: 'oblique', scale: 2, worldKey: 'KeyJ' },
]) {
  test(`Full HD ${scale * 100}% native Build category navigation belongs to the filter in ${renderer}`, async ({ page }, testInfo) => {
    await installTee(page);
    const settings = JSON.stringify({ version: 1, keyboardBindings: DEFAULT_KEYBOARD_BINDINGS.map(binding => binding.code === 'KeyW' ? { ...binding, code: worldKey } : binding) });
    await page.addInitScript(({ scale, settings }) => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
      localStorage.setItem('lockstate.settings.input', settings);
    }, { scale, settings });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/?renderer=${renderer}`);
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const filter = page.getByRole('combobox', { name: 'Category', exact: true });
    const selected = page.locator('.hud-build__list [data-buildable="wall-brick"]');
    const bed = page.locator('.hud-build__list [data-buildable="bed-wooden"]');
    await expect(filter).toHaveValue('*');
    await expect(selected).toHaveAttribute('data-selected', 'true');
    await expect(bed).toBeVisible();
    await filter.focus();
    const clip = scale === 1 ? { x: 700, y: 300, width: 240, height: 240 } : { x: 650, y: 350, width: 160, height: 160 };
    const settled = await page.screenshot({ clip });
    await page.waitForTimeout(300);
    expect((await page.screenshot({ clip })).equals(settled), 'the paused world is settled before filtering').toBe(true);
    await page.keyboard.down('ArrowDown');
    try {
      // Chromium's real native default chooses the option and emits change;
      // no selectOption, synthetic DOM event or forced value drives this path.
      await expect(filter).toHaveValue('structure');
      await expect(bed).toBeHidden();
      await expect(selected).toHaveAttribute('data-selected', 'true');
      await expect(selected).toBeVisible();
      await expect(filter).toBeFocused();
      await page.waitForTimeout(300);
      await page.screenshot({ path: testInfo.outputPath(`native-category-${renderer}-${scale}.png`) });
      expect((await page.screenshot({ clip })).equals(settled), 'native category navigation must not also start a held world camera pan').toBe(true);
    } finally { await page.keyboard.up('ArrowDown'); }

    await page.keyboard.press('ArrowUp');
    await expect(filter).toHaveValue('*');
    await expect(bed).toBeVisible();
    await expect(selected).toHaveAttribute('data-selected', 'true');
    await expect(filter).toBeFocused();
    const beforeUnhandled = await page.screenshot({ clip });
    // J matches no native option label. Existing remapped world control on
    // this ordinary non-modal select must keep working outside navigation.
    await page.keyboard.down(worldKey);
    await page.waitForTimeout(300);
    await page.keyboard.up(worldKey);
    await expect(filter).toHaveValue('*');
    expect((await page.screenshot({ clip })).equals(beforeUnhandled), 'a non-navigation remapped world key retains its existing owner').toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('lockstate.settings.input'))).toBe(settings);
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceBuildOrder' || command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  });
}
