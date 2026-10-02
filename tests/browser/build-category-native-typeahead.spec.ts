import { expect, test } from './network-changed-fixture';
import { DEFAULT_KEYBOARD_BINDINGS } from '../../src/input/bindings';
import { installTee, sentCommands } from './playtest-harness';

for (const { renderer, scale, code, category } of [
  { renderer: 'world', scale: 1, code: 'KeyW', category: 'structure' },
  { renderer: 'oblique', scale: 1, code: 'KeyW', category: 'structure' },
  { renderer: 'oblique', scale: 2, code: 'KeyC', category: 'food-service' },
]) {
  test(`Full HD ${scale * 100}% Category native ${code} typeahead belongs to the filter in ${renderer}`, async ({ page }, testInfo) => {
    await installTee(page);
    const settings = JSON.stringify({ version: 1, keyboardBindings: DEFAULT_KEYBOARD_BINDINGS.map(binding =>
      binding.code === 'KeyW' ? { ...binding, code } : binding.code === 'KeyD' ? { ...binding, code: 'KeyJ' } : binding) });
    await page.addInitScript(({ scale, settings, code }) => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
      localStorage.setItem('lockstate.settings.input', settings);
      const events: Array<{ type: string; code?: string; key?: string; value: string }> = [];
      (window as unknown as { categoryTypeaheadEvents: typeof events }).categoryTypeaheadEvents = events;
      for (const type of ['keydown', 'keypress', 'keyup', 'change']) window.addEventListener(type, event => {
        const target = event.target as HTMLSelectElement | null;
        if (target?.tagName !== 'SELECT' || target.getAttribute('aria-label') !== 'Category') return;
        const key = event as KeyboardEvent;
        if (type !== 'change' && key.code !== code) return;
        events.push(type === 'change' ? { type, value: target.value } : { type, code: key.code, key: key.key, value: target.value });
      }, true);
    }, { scale, settings, code });
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
    expect((await page.screenshot({ clip })).equals(settled), 'the paused map is settled before native letter navigation').toBe(true);
    await page.keyboard.down(code);
    try {
      // Native printable-key default chooses by label and emits change.
      // No synthetic input/change, selectOption or forced value drives it.
      await expect(filter).toHaveValue(category);
      await expect(bed).toBeHidden();
      await expect(selected).toHaveAttribute('data-selected', 'true');
      await expect(selected).toBeVisible();
      await expect(filter).toBeFocused();
      const events = await page.evaluate(() => (window as unknown as { categoryTypeaheadEvents: Array<{ type: string; code?: string; key?: string; value: string }> }).categoryTypeaheadEvents);
      await testInfo.attach('native-category-typeahead-events', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
      console.log('NATIVE_CATEGORY_TYPEAHEAD_EVENTS', JSON.stringify(events));
      expect(events).toContainEqual({ type: 'change', value: category });
      await page.waitForTimeout(300);
      await page.screenshot({ path: testInfo.outputPath(`native-typeahead-${renderer}-${scale}.png`) });
      expect((await page.screenshot({ clip })).equals(settled), 'native letter filtering must not also start a held world camera pan').toBe(true);
    } finally { await page.keyboard.up(code); }

    // J matches no category label. A valid unused camera-right remap must
    // remain available when the native selector did not navigate anywhere.
    const beforeUnmatched = await page.screenshot({ clip });
    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyJ');
    await expect(filter).toHaveValue(category);
    expect((await page.screenshot({ clip })).equals(beforeUnmatched), 'an unmatched existing world key still controls the camera').toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('lockstate.settings.input'))).toBe(settings);
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate' || command.type === 'PlaceBuildOrder')).toHaveLength(0);
  });
}
