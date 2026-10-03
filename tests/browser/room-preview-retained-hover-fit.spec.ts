import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';

interface Target {
  readonly templateId: string;
  readonly origin: { readonly x: number; readonly y: number };
  readonly mirrorX?: boolean;
  readonly quarterTurns?: number;
}

async function target(page: Page): Promise<Target> {
  return page.evaluate(() => {
    const messages = (window as unknown as {
      lockstateSentToWorker: Array<{ payload?: { projectionId?: string; target?: Target } }>;
    }).lockstateSentToWorker;
    return messages.filter(message => message.payload?.projectionId === 'world/room-template-preflight').at(-1)!.payload!.target!;
  });
}

async function frames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

for (const scale of [1, 2]) for (const quarterTurns of [0, 1]) {
  test(`Full HD ${scale * 100}% keyboard-armed ${quarterTurns * 90} degree row retains its fitted hover on stationary click`, async ({ page }, testInfo) => {
    await installTee(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(uiScale => {
      localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
      const events: Array<{ type: string; x: number; y: number; canvas: boolean }> = [];
      for (const type of ['pointermove', 'pointerdown', 'pointerup']) window.addEventListener(type, event => {
        const pointer = event as PointerEvent;
        events.push({ type, x: pointer.clientX, y: pointer.clientY, canvas: event.target === document.querySelector('#game-root canvas') });
      }, true);
      (window as unknown as { retainedHoverPointerEvents: typeof events }).retainedHoverPointerEvents = events;
    }, scale);
    await page.goto('/?renderer=oblique');
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    const open = page.getByRole('button', { name: 'Room plans', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Room plans' });
    const ghost = page.locator('.room-template-world-ghost');
    const floor = ghost.locator('polygon');
    // Keep both 7×16 and 16×7 orientations within the new session's owned
    // 32×32 parcel before fitting. The worker, not this framing, proves clear.
    const cursor = { x: 740, y: 420 };

    await page.mouse.move(cursor.x, cursor.y);
    await frames(page); // an unarmed frame resets fitting, retaining map hover
    const marker = await page.evaluate(() => (window as unknown as { retainedHoverPointerEvents: unknown[] }).retainedHoverPointerEvents.length);
    // Focus plus native keys changes no physical pointer coordinates.
    await open.focus(); await page.keyboard.press('Enter');
    const row = dialog.getByRole('button', { name: 'Four-cell row', exact: true });
    await row.focus(); await page.keyboard.press('Enter');
    const rotation = dialog.locator('select.hud-template__rotation');
    await rotation.focus(); await page.keyboard.press('Home');
    if (quarterTurns === 1) await page.keyboard.press('ArrowDown');
    await expect(rotation).toHaveValue(String(quarterTurns));
    const mirror = dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation', exact: true });
    await mirror.focus(); await page.keyboard.press('Space');
    await expect(mirror).toBeChecked();
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(floor).toHaveCount(112);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    const chosen = await target(page);
    expect(chosen.templateId).toBe('cell-row-four');
    expect(chosen.mirrorX).toBe(true);
    expect(chosen.quarterTurns ?? 0).toBe(quarterTurns);
    const quote = await ghost.getByRole('status').textContent();
    expect(quote).toContain('Materials catalogue value:');
    const points = await floor.evaluateAll(polygons => polygons.map(polygon => polygon.getAttribute('points')));
    await expect.poll(() => floor.evaluateAll(polygons => {
      const bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const left = Math.max(bounds('.hud__tabs').right, bounds('.hud__corner').right) + 7;
      const right = bounds('.hud__rail').left - 7;
      const top = bounds('.hud-strip').bottom + 7;
      return polygons.every(polygon => {
        const r = polygon.getBoundingClientRect();
        return r.left >= left && r.right <= right && r.top >= top && r.bottom <= innerHeight - 7;
      });
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('keyboard-armed-retained-hover.png') });

    // Acknowledging a stationary preview must not repick through its newly
    // fitted camera. Read the genuine worker target before pointer release.
    await page.mouse.down();
    await frames(page);
    const afterDown = await target(page);
    console.log('RETAINED_HOVER_FIT', JSON.stringify({ scale, quarterTurns, chosen, afterDown }));
    expect(afterDown, 'first stationary pointerdown must retain the displayed world origin').toEqual(chosen);
    await expect(ghost).toHaveAttribute('data-ready', 'clear');
    expect(await floor.evaluateAll(polygons => polygons.map(polygon => polygon.getAttribute('points')))).toEqual(points);
    expect(await ghost.getByRole('status').textContent()).toBe(quote);
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(0);
    await page.mouse.up();
    await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toMatchObject([
      { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: chosen.origin, mirrorX: true,
        ...(quarterTurns === 0 ? {} : { quarterTurns }) },
    ]);
    await expect(ghost).toBeHidden();
    const events = await page.evaluate(mark => (window as unknown as {
      retainedHoverPointerEvents: Array<{ type: string; x: number; y: number; canvas: boolean }>;
    }).retainedHoverPointerEvents.slice(mark), marker);
    expect(events.filter(event => event.type !== 'pointermove')).toEqual([
      { type: 'pointerdown', ...cursor, canvas: true }, { type: 'pointerup', ...cursor, canvas: true },
    ]);
    expect(events.every(event => event.x === cursor.x && event.y === cursor.y), 'native event coordinates show no physical movement during keyboard arming or confirmation').toBe(true);
    const building = (await sentCommands(page)).filter(command => /^(Place|Build|Remove)/u.test(String(command.type)));
    expect(building).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('stationary-click-confirmed.png') });

    // The accepted origin lock ends on genuine mouse movement. Re-arm through
    // the keyboard, then move across several screen pixels; occupied squares
    // can be blocked by the just-submitted plan, but must still be repicked.
    await open.focus(); await page.keyboard.press('Enter');
    await dialog.getByRole('button', { name: 'Place on map', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(floor).toHaveCount(112);
    await expect(ghost).toHaveAttribute('data-ready', /clear|blocked/u);
    const rearmed = await target(page);
    await page.mouse.move(cursor.x + 64, cursor.y);
    await frames(page);
    await expect(ghost).toHaveAttribute('data-ready', /clear|blocked/u);
    expect((await target(page)).origin, 'real movement chooses a new world origin').not.toEqual(rearmed.origin);
    await expect(floor).toHaveCount(112);
    expect(await ghost.getByRole('status').textContent()).toContain('Materials catalogue value:');
    await page.keyboard.press('Escape');
    await expect(ghost).toBeHidden();
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toHaveLength(1);
  });
}
