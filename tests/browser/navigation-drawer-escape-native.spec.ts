import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

// The FullHD screen's contracted zoom layout is 960x540 CSS pixels. This
// viewport is explicit; changing uiScale alone is not actual page zoom.
for (const renderer of ['world', 'oblique'] as const) {
  for (const tool of ['wall', 'object', 'room-area'] as const) {
    test(`${renderer} navigation drawer Escape retains armed ${tool} until ordinary world Escape`, async ({ page }, info) => {
      await installTee(page);
      await page.addInitScript(() => {
        localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale: 2 }));
        const keys: Array<{ key: string; trusted: boolean; target: string }> = [];
        (window as unknown as { drawerKeys: typeof keys }).drawerKeys = keys;
        window.addEventListener('keydown', event => keys.push({
          key: event.key, trusted: event.isTrusted,
          target: (event.target as Element | null)?.className ?? '',
        }), true);
      });
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`/?renderer=${renderer}`);
      await expect(page.locator('#game-root canvas')).toBeVisible();
      await page.getByRole('button', { name: 'New prison', exact: true }).click();
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      if (tool === 'room-area') {
        await page.locator('.ui-tab[data-tab="zones"]').click();
        await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
      } else {
        await page.getByRole('button', { name: 'Build', exact: true }).click();
        const id = tool === 'wall' ? 'wall-brick' : 'bed-wooden';
        const row = page.locator(`.hud-build__list [data-buildable="${id}"]`);
        await row.click();
        await expect(row).toHaveAttribute('data-selected', 'true');
      }
      const arm = page.locator(tool === 'room-area' ? '.hud-rooms__arm' : '.hud-build__arm');
      await arm.click();
      await expect(arm).toHaveAttribute('data-armed', 'true');
      const before = (await sentCommands(page)).length;

      await page.setViewportSize({ width: 960, height: 540 });
      const hud = page.locator('.hud');
      await expect(hud, 'the case must actually exercise an open navigation drawer').toHaveAttribute('data-layout-navigation-placement', 'drawer');
      const trigger = page.locator('.hud-navigation-drawer__trigger');
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(hud).toHaveAttribute('data-navigation-drawer-open', 'true');
      const section = page.locator('.ui-tab[data-tab="build"]');
      await expect(section).toBeVisible();
      await section.focus();
      await expect(section).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(hud).toHaveAttribute('data-navigation-drawer-open', 'false');
      await expect(trigger).toBeFocused();
      await expect(arm, 'the drawer consumed this key before armed map input').toHaveAttribute('data-armed', 'true');
      await page.screenshot({ path: info.outputPath(`drawer-escape-${renderer}-${tool}.png`) });

      // The same focused trigger after closure no longer has drawer Escape
      // ownership. This must still reach the actual active world scene/tool.
      await page.keyboard.press('Escape');
      await expect(arm).toHaveAttribute('data-armed', 'false');
      const commands = (await sentCommands(page)).slice(before);
      expect(commands.filter(c => ['PlaceBuildOrder', 'PlaceObject', 'PlaceRoomTemplate', 'ZoneRoom',
        'RemoveWall', 'RemoveObject', 'RemoveRoom'].includes(String(c['type']))),
      'closing navigation and cancelling placement submit no map mutations').toHaveLength(0);
      const keys = await page.evaluate(() => (window as unknown as { drawerKeys: Array<{ key: string; trusted: boolean; target: string }> }).drawerKeys);
      expect(keys.filter(k => k.key === 'Escape')).toEqual([
        { key: 'Escape', trusted: true, target: await section.getAttribute('class') },
        { key: 'Escape', trusted: true, target: await trigger.getAttribute('class') },
      ]);
      await info.attach('drawer-key-and-worker-evidence', {
        body: JSON.stringify({ renderer, tool, viewport: { width: 960, height: 540 }, uiScale: 2, keys, commands }, null, 2),
        contentType: 'application/json',
      });
    });
  }
}
