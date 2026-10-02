import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface PreflightTarget {
  templateId: string;
  origin: { x: number; y: number };
  quarterTurns?: number;
  mirrorX?: boolean;
}

async function latestWorldTarget(page: Page): Promise<PreflightTarget | undefined> {
  return page.evaluate(() => {
    const sent = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: PreflightTarget } }> }).lockstateSentToWorker;
    return sent.filter(message => message.payload?.projectionId === 'world/room-template-preflight'
      && (message.payload.target?.origin.x !== 0 || message.payload.target.origin.y !== 0)).at(-1)?.payload?.target;
  });
}

test('native rotation popup owns its first Escape and releases a world-held camera key before catalogue close', async ({ page }, testInfo) => {
  await installTee(page);
  await page.addInitScript(() => {
    const events: Array<{ type: string; code: string; target: string; modal: boolean }> = [];
    (window as unknown as { nativePickerEvents: typeof events }).nativePickerEvents = events;
    for (const type of ['keydown', 'keyup']) {
      window.addEventListener(type, event => {
        const key = event as KeyboardEvent;
        if (key.code !== 'KeyE' && key.code !== 'Escape') return;
        events.push({ type, code: key.code, target: (key.target as Element | null)?.tagName ?? '', modal: document.querySelector('dialog:modal') !== null });
      }, true);
    }
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.mouse.move(880, 380);
  const open = page.getByRole('button', { name: 'Room plans', exact: true });
  const clip = { x: 132, y: 140, width: 240, height: 240 };
  await open.focus();
  const beforeHeldKey = await page.screenshot({ clip });
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(beforeHeldKey), 'the key starts a real world camera action before opening the modal').toBe(false);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).focus();
  await page.keyboard.press('Enter');
  const rotation = dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' });
  const mirror = dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation' });
  await rotation.focus();
  const modalPixels = await page.screenshot({ clip });
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(modalPixels), 'opening the modal suppresses the already active camera key').toBe(true);

  // Space opens Chromium's real select popup. No synthetic change/keydown or
  // test-side value assignment bypasses its native event ownership.
  await page.keyboard.press('Space');
  await page.screenshot({ path: testInfo.outputPath('native-rotation-popup.png') });
  await page.keyboard.up('KeyE');
  await page.keyboard.press('Escape');
  const observed = await page.evaluate(() => (window as unknown as { nativePickerEvents: unknown[] }).nativePickerEvents);
  console.log('NATIVE_ROOM_PICKER_EVENTS', JSON.stringify(observed));
  await testInfo.attach('native-picker-key-events', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' });
  await expect(dialog, 'the first Escape dismisses only the native rotation popup').toBeVisible();
  await expect(rotation).toBeFocused();
  await expect(rotation).toHaveValue('0');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  const closedPixels = await page.screenshot({ clip });
  await page.waitForTimeout(300);
  expect((await page.screenshot({ clip })).equals(closedPixels), 'a key physically released inside the native popup must not resume camera motion after close').toBe(true);
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyE');
  expect((await page.screenshot({ clip })).equals(closedPixels), 'a fresh world key still operates the camera').toBe(false);

  // Repeated native keyboard open/close preserves the real chosen controls.
  // The final arm uses the remembered map hover; the physical pointer stays
  // fixed throughout all catalogue interactions.
  await open.press('Enter');
  await rotation.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(rotation).toHaveValue('2');
  await mirror.focus();
  await page.keyboard.press('Space');
  await expect(mirror).toBeChecked();
  await dialog.getByRole('button', { name: 'Close plans', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(open).toBeFocused();
  await open.press('Enter');
  await expect(rotation).toHaveValue('2');
  await expect(mirror).toBeChecked();
  await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  const ghost = page.locator('.room-template-world-ghost');
  await expect(ghost).toBeVisible();
  await expect(ghost.locator('polygon')).toHaveCount(112);
  await expect(ghost).toHaveAttribute('data-ready', 'clear');
  await expect(ghost.getByRole('status')).toContainText('Brick × 112 · Wood Plank × 8 · Materials catalogue value: 5,000');
  expect(await latestWorldTarget(page)).toMatchObject({ templateId: 'cell-row-four', quarterTurns: 2, mirrorX: true });
  expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('native-picker-keyboard-armed-plan.png') });
  await page.keyboard.press('Escape');
  await expect(ghost).toBeHidden();
});
