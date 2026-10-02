import { expect, test } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

test('View native popup relinquishes a world-held camera key even when its release never reaches the page', async ({ page }, testInfo) => {
  await installTee(page);
  await page.addInitScript(() => {
    const events: Array<{ type: string; code: string; target: string; modal: boolean }> = [];
    (window as unknown as { viewPopupEvents: typeof events }).viewPopupEvents = events;
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
      const key = event as KeyboardEvent;
      if (key.code !== 'KeyE' && key.code !== 'Escape') return;
      events.push({ type, code: key.code, target: (key.target as Element | null)?.tagName ?? '', modal: document.querySelector('dialog:modal') !== null });
    }, true);
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const worldButton = page.getByRole('button', { name: 'Build', exact: true });
  await worldButton.click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
  await page.mouse.move(880, 380);
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost.locator('polygon')).toHaveCount(112);
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  const view = page.getByRole('combobox', { name: 'View', exact: true });
  const clip = { x: 132, y: 140, width: 240, height: 240 };
  await worldButton.focus();
  const settled = await page.screenshot({ clip });
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(settled), 'the initial paused map is settled').toBe(true);
  await page.keyboard.down('KeyE');
  try {
    await page.waitForTimeout(300);
    expect((await page.screenshot({ clip })).equals(settled), 'the held key starts a real world camera action').toBe(false);
    await view.focus();
    await page.waitForTimeout(300);
    const chosen = await ghost.getByRole('status').textContent();
    const footprint = await ghost.locator('polygon').evaluateAll(polygons => polygons.map(p => p.getAttribute('points')));
    const origin = await page.evaluate(() => {
      const messages = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: unknown } }> }).lockstateSentToWorker;
      return messages.filter(message => message.payload?.projectionId === 'world/room-template-preflight').at(-1)?.payload?.target;
    });
    await page.keyboard.press('Space');
    await page.screenshot({ path: testInfo.outputPath('native-view-popup.png') });
    await page.keyboard.up('KeyE');
    await page.keyboard.press('Escape');
    await expect(view).toBeFocused();
    await expect(view).toHaveValue('oblique');
    await expect(view).toBeEnabled();
    const events = await page.evaluate(() => (window as unknown as { viewPopupEvents: unknown[] }).viewPopupEvents);
    console.log('NATIVE_VIEW_POPUP_EVENTS', JSON.stringify(events));
    await testInfo.attach('native-view-key-events', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
    const dismissed = await page.screenshot({ clip });
    await page.waitForTimeout(300);
    expect((await page.screenshot({ clip })).equals(dismissed), 'a key physically released in the non-modal View popup must not leave the same map spinning').toBe(true);
    await expect(ghost).toBeVisible();
    await expect(ghost.locator('polygon')).toHaveCount(112);
    expect(await ghost.getByRole('status').textContent()).toBe(chosen);
    expect(await ghost.locator('polygon').evaluateAll(polygons => polygons.map(p => p.getAttribute('points')))).toEqual(footprint);
    expect(await page.evaluate(() => {
      const messages = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: unknown } }> }).lockstateSentToWorker;
      return messages.filter(message => message.payload?.projectionId === 'world/room-template-preflight').at(-1)?.payload?.target;
    })).toEqual(origin);
    await worldButton.focus();
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyE');
    expect((await page.screenshot({ clip })).equals(dismissed), 'a fresh world key still rotates the map').toBe(false);
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  } finally {
    await page.keyboard.up('KeyE');
  }
});
