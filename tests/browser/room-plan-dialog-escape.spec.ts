import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

async function worldTarget(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const messages = (window as unknown as { lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: { origin?: { x: number; y: number } } } }> }).lockstateSentToWorker;
    return messages.filter(message => message.payload?.projectionId === 'world/room-template-preflight'
      && (message.payload.target?.origin?.x !== 0 || message.payload.target.origin.y !== 0)).at(-1)?.payload?.target;
  });
}

for (const scale of [1, 2]) {
  test(`Full HD ${scale * 100}% native catalogue Escape matches Close plans and preserves the armed map preview`, async ({ page }, testInfo) => {
    await installTee(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(uiScale => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
    }, scale);
    await page.goto('/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const open = page.getByRole('button', { name: 'Room plans', exact: true });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    await dialog.getByRole('button', { name: 'Four-cell row', exact: true }).click();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).click();
    await page.mouse.move(880, 380);
    const ghost = page.locator('.room-template-world-ghost');
    const floor = ghost.locator('polygon');
    await expect(floor).toHaveCount(112);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    const chosen = await worldTarget(page);
    const quote = await ghost.getByRole('status').textContent();
    const footprint = await floor.evaluateAll(polygons => polygons.map(p => ({ points: p.getAttribute('points'), fill: p.getAttribute('fill') })));

    // Reopen and close using native keyboard controls only. This control
    // comparison establishes the current dialog contract without repicking
    // a different map tile or rearming the tool after either close action.
    await open.focus(); await open.press('Enter');
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: 'Close plans', exact: true });
    await close.focus(); await close.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    await expect(ghost).toBeVisible();
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    expect(await worldTarget(page)).toEqual(chosen);
    expect(await ghost.getByRole('status').textContent()).toBe(quote);

    await open.press('Enter');
    await expect(dialog).toBeVisible();
    await close.focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(ghost, 'the catalogue owns its close key; no world cancellation has been requested').toBeVisible();
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    await expect(floor).toHaveCount(112);
    expect(await floor.evaluateAll(polygons => polygons.map(p => ({ points: p.getAttribute('points'), fill: p.getAttribute('fill') })))).toEqual(footprint);
    expect(await worldTarget(page)).toEqual(chosen);
    expect(await ghost.getByRole('status').textContent()).toBe(quote);
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath(`catalogue-escape-retained-${scale * 100}.png`) });

    // After the modal closes, Escape again belongs to the world. Fresh map
    // movement must not resurrect the cancelled plan from remembered hover.
    await page.keyboard.press('Escape');
    await expect(ghost).toBeHidden();
    await page.mouse.move(881, 380);
    await expect(ghost).toBeHidden();
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
  });
}
