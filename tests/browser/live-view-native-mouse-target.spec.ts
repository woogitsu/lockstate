import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

// Physical mouse acquisition is the boundary absent from the keyboard-only
// View tests. Do not replace it with focus(), selectOption() or a forced click.
for (const renderer of ['world', 'oblique'] as const) {
  for (const scale of [1, 2]) {
    test(`Full HD ${scale * 100}% ${renderer} View keeps a native mouse press away from the armed map`, async ({ page }, testInfo) => {
      await installTee(page);
      await page.addInitScript(scale => {
        localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: scale }));
        const events: Array<{ type: string; tag: string; view: boolean; value: string | null }> = [];
        (window as unknown as { viewMouseEvents: typeof events }).viewMouseEvents = events;
        for (const type of ['pointerdown', 'pointerup', 'focus', 'input', 'change']) {
          window.addEventListener(type, event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (!target.matches('canvas, .hud__corner > select.hud-build__category')) return;
            events.push({ type, tag: target.tagName, view: target.matches('.hud__corner > select.hud-build__category'), value: target instanceof HTMLSelectElement ? target.value : null });
          }, true);
        }
      }, scale);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`/?renderer=${renderer}`);
      await page.getByRole('button', { name: 'New prison', exact: true }).click();
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Build', exact: true }).click();
      // Removal always submits a real map command when the press reaches the
      // canvas. It isolates ownership from placement/budget/footprint refusal.
      await page.locator('.hud-build__remove').click();
      const view = page.getByRole('combobox', { name: 'View', exact: true });
      await expect(view).toHaveValue(renderer);
      await expect(view).toBeEnabled();
      const box = await view.boundingBox();
      if (box === null) throw new Error('View has no visible native mouse target');
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const hit = await page.evaluate(point => {
        const target = document.elementFromPoint(point.x, point.y);
        return { tag: target?.tagName, view: target?.matches('.hud__corner > select.hud-build__category') === true };
      }, point);
      const before = await sentCommands(page);
      const clip = { x: 700, y: 350, width: 180, height: 180 };
      const originalMap = await page.screenshot({ clip });
      await page.mouse.click(point.x, point.y);
      await page.screenshot({ path: testInfo.outputPath('native-mouse-opened-view.png') });
      // View acquisition is a real mouse press. Native option choice uses
      // real keyboard input: Playwright does not support clicking individual
      // native popup rows (the same routing limitation was measured on the
      // working Category). No focus(), selectOption() or DOM injection masks
      // this acquisition boundary; all four popup screenshots were inspected.
      await page.keyboard.press(renderer === 'world' ? 'End' : 'Home');
      await page.keyboard.press('Enter');
      const wanted = renderer === 'world' ? 'oblique' : 'world';
      await expect.soft(view, 'a mouse-opened native View popup changes the actual renderer').toHaveValue(wanted);
      await expect(view).toBeEnabled();
      const commands = (await sentCommands(page)).slice(before.length);
      const events = await page.evaluate(() => (window as unknown as { viewMouseEvents: unknown[] }).viewMouseEvents);
      console.log('NATIVE_VIEW_MOUSE', JSON.stringify({ renderer, scale, point, hit, events, commands }));
      await testInfo.attach('native-view-mouse-evidence', { body: JSON.stringify({ renderer, scale, point, hit, events, commands }, null, 2), contentType: 'application/json' });
      expect.soft(hit, 'the visible existing View control is an actual mouse target').toEqual({ tag: 'SELECT', view: true });
      expect.soft(commands.filter(command => ['RemoveWall', 'RemoveObject', 'PlaceBuildOrder', 'PlaceObject', 'PlaceRoomTemplate', 'ZoneRoom'].includes(String(command['type']))), 'choosing View must not submit a command to the armed map').toHaveLength(0);
      await expect.soft(view).toBeFocused();
      expect.soft((await page.screenshot({ clip })).equals(originalMap), 'the selected renderer actually changes the exposed world pixels').toBe(false);
      expect.soft(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'pointerdown', tag: 'SELECT', view: true }),
        expect.objectContaining({ type: 'change', tag: 'SELECT', view: true, value: wanted }),
      ]));
      // A transparent corner title remains transparent: the correction belongs
      // to the existing SELECT, not to the whole surrounding HUD panel.
      const title = page.locator('.hud-minimap .ui-panel__title');
      const titleBox = await title.boundingBox();
      if (titleBox === null) throw new Error('Minimap title is unavailable for the blank-chrome control');
      expect(await page.evaluate(box => document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.tagName, titleBox)).toBe('CANVAS');
    });
  }
}
