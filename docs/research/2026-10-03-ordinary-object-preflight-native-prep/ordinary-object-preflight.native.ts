import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '../../../tests/browser/network-changed-fixture';
import { armBuildable, installTee, sentCommands } from '../../../tests/browser/playtest-harness';
import { installShowcaseReadProbe, showcaseSnapshot } from '../../../tests/browser/native-small-prison-showcase-evidence';
import { observeUnroundedMinimapViewport } from '../../../tests/browser/minimap-unrounded-reference';
import { installOrdinaryObjectObserver, keyboardActivate, latestActualVerdict, publicGroundReference, readTrace, redMinusBlue } from './evidence-helper';

const ANCHOR = { x: 7, y: 6 }, CLAIM = { x: 8, y: 6 }, FRESH = { x: 10, y: 8 };
const footprint = [{ x: 7, y: 6 }, { x: 8, y: 6 }];
const clear = { ok: true, footprint, catalogueCostMinorUnits: 130, roomInstanceId: 'room.yard:4:4' };
const blocked = { ok: false, reason: 'tile-occupied', tile: CLAIM, footprint, catalogueCostMinorUnits: 130 };

async function publicYard(page: Page): Promise<void> {
  await page.locator('.ui-tab[data-tab="zones"]').click();
  await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
  const coordinates = page.locator('.hud-rooms__coordinates');
  if (!await coordinates.locator('> .ui-section__body').isVisible()) await coordinates.locator('> .ui-section__header').click();
  for (const [name, value] of [['Tile X', 4], ['Tile Y', 4], ['Width', 8], ['Height', 8]] as const)
    await coordinates.getByRole('spinbutton', { name, exact: true }).fill(String(value));
  await coordinates.getByRole('button', { name: 'Use these tiles', exact: true }).click();
  await page.locator('.hud-rooms__confirm').click();
  await expect.poll(async () => (await showcaseSnapshot(page)).simulation?.prisoners.roomInstanceDefinitions)
    .toMatchObject([{ instanceId: 'room.yard:4:4' }]);
}

async function armDesk(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await armBuildable(page, 'desk-wooden', 10_000);
  await expect(page.locator('.hud-build__selected-footprint')).toHaveText('Occupied squares: 2 × 1');
}

async function frameYard(page: Page): Promise<void> {
  const surface = page.locator('.hud-minimap__surface');
  if (!await surface.isVisible()) await page.getByRole('region', { name: 'Minimap', exact: true })
    .getByRole('button', { name: 'Expand', exact: true }).click();
  const box = await surface.boundingBox(); if (box === null) throw new Error('Actual public minimap absent');
  await surface.click({ position: { x: box.width * 8 / 32, y: box.height * 8 / 32 } });
  // A clipped minimap rectangle cannot independently recover the actual
  // ground origin. Frame the Yard through public controls before measuring.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { actual } = await publicGroundReference(page);
    const p = actual.percent;
    if (p.left > 0 && p.top > 0 && p.left + p.width < 100 && p.top + p.height < 100) return;
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await surface.click({ position: { x: box.width * 8 / 32, y: box.height * 8 / 32 } });
    await twoFrames(page);
  }
  const { actual } = await publicGroundReference(page);
  expect(actual.percent.left).toBeGreaterThan(0);
  expect(actual.percent.top).toBeGreaterThan(0);
  expect(actual.percent.left + actual.percent.width).toBeLessThan(100);
  expect(actual.percent.top + actual.percent.height).toBeLessThan(100);
}

async function aim(page: Page, anchor: { x: number; y: number }) {
  const measured = await publicGroundReference(page), point = measured.reference.screen(anchor.x + .25, anchor.y + .25);
  expect(measured.actual.percent.left).toBeGreaterThan(0);
  expect(measured.actual.percent.top).toBeGreaterThan(0);
  expect(measured.actual.percent.left + measured.actual.percent.width).toBeLessThan(100);
  expect(measured.actual.percent.top + measured.actual.percent.height).toBeLessThan(100);
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), point)).toBe(true);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('.hud-build__target')).toHaveAttribute('data-target', `${anchor.x},${anchor.y}`);
  return { measured: measured.actual, point, reference: measured.reference };
}

const objectCommands = async (page: Page) => (await sentCommands(page)).filter(command => command.type === 'PlaceObject');
const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

test('World FullHD stationary ordinary q0 ghost: real pending claim, disarm, Load/New old release and fresh accepted press', async ({ page }, info) => {
  await installShowcaseReadProbe(page); await installTee(page); await installOrdinaryObjectObserver(page);
  await page.addInitScript(observeUnroundedMinimapViewport);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await publicYard(page); await armDesk(page);
  const coordinates = page.locator('.hud-build__coordinates');
  if (!await coordinates.locator('> .ui-section__body').isVisible()) await coordinates.locator('> .ui-section__header').click();
  await frameYard(page);
  const original = await aim(page, ANCHOR);
  await expect.poll(() => latestActualVerdict(page, ANCHOR)).toEqual(clear); await twoFrames(page);
  const topLeft = original.reference.screen(ANCHOR.x + .2, ANCHOR.y + .2), bottomRight = original.reference.screen(ANCHOR.x + .8, ANCHOR.y + .8);
  const clip = { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
  const shown = await page.screenshot({ path: info.outputPath('actual-stationary-allowed-fullhd.png') });
  const allowedPixels = await page.screenshot({ path: info.outputPath('actual-unclaimed-anchor-allowed.png'), clip });
  const stationary = (await readTrace(page)).mouse;
  await coordinates.getByRole('spinbutton', { name: 'Tile X', exact: true }).fill(String(CLAIM.x));
  await coordinates.getByRole('spinbutton', { name: 'Tile Y', exact: true }).fill(String(CLAIM.y));
  await keyboardActivate(page, coordinates.getByRole('button', { name: 'Place order', exact: true }));
  await expect.poll(() => objectCommands(page)).toHaveLength(1);
  const command = (await objectCommands(page))[0]!;
  expect(command.orderId).toMatch(/^object-[a-f0-9-]+$/);
  const { orderId, ...shape } = command;
  expect(shape).toEqual({ type: 'PlaceObject', definitionId: 'desk-wooden', ...CLAIM });
  await expect.poll(() => latestActualVerdict(page, ANCHOR)).toEqual(blocked); await twoFrames(page);
  expect((await readTrace(page)).mouse, 'numeric keyboard action must not move the physical pointer').toEqual(stationary);
  await expect(page.locator('.hud-build__target')).toHaveAttribute('data-target', '7,6');
  const whole = await showcaseSnapshot(page, info.outputPath('actual-one-pending-whole.json'));
  expect(whole.construction.orders).toHaveLength(1);
  expect(whole.construction.orders[0]).toMatchObject({ id: orderId, definitionId: 'desk-wooden', location: CLAIM, state: 'approved' });
  expect(whole.construction.orders[0]!.objectOrientation ?? 0).toBe(0);
  expect(whole.simulation?.objects?.placedObjects ?? []).toEqual([]);
  expect(whole.simulation?.economy?.treasury.balanceMinorUnits).toBe(24870);
  await page.screenshot({ path: info.outputPath('actual-stationary-blocked-fullhd.png') });
  const blockedPixels = await page.screenshot({ path: info.outputPath('actual-unclaimed-anchor-blocked.png'), clip });
  const pixelReceipt = { clip, allowedRedMinusBlue: redMinusBlue(allowedPixels), blockedRedMinusBlue: redMinusBlue(blockedPixels) };
  await writeFile(info.outputPath('actual-paired-anchor-pixel-receipt.json'), JSON.stringify(pixelReceipt, null, 2));
  expect(pixelReceipt.blockedRedMinusBlue, 'existing blocked red must replace neutral tint on the untouched anchor interior')
    .toBeGreaterThan(pixelReceipt.allowedRedMinusBlue);

  await page.keyboard.press('Escape');
  await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'false');
  await expect(page.locator('.hud-build__target-value')).toHaveText('Point at the world');
  await twoFrames(page);
  const disarmedPixels = await page.screenshot({ path: info.outputPath('actual-unclaimed-anchor-disarmed.png'), clip });
  expect(redMinusBlue(disarmedPixels), 'Escape must remove the actual blocked tint from the same stationary anchor interior')
    .toBeLessThan(pixelReceipt.blockedRedMinusBlue);
  await page.screenshot({ path: info.outputPath('actual-stationary-disarmed-fullhd.png') });
  expect(await showcaseSnapshot(page)).toEqual(whole);
  await keyboardActivate(page, page.getByRole('button', { name: 'Overview', exact: true }));
  await keyboardActivate(page, page.getByRole('button', { name: 'Save now', exact: true }));
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  expect(await showcaseSnapshot(page)).toEqual(whole);
  const saved = page.locator('.save-panel__item').first();
  await armDesk(page); await aim(page, FRESH); await page.mouse.down({ button: 'left' });
  expect((await readTrace(page)).mouse.at(-1)).toMatchObject({ type: 'mousedown', buttons: 1, trusted: true, canvas: true });
  expect(await objectCommands(page)).toHaveLength(1);
  let held = true;
  try {
    const epoch = (await readTrace(page)).epoch;
    await keyboardActivate(page, saved.getByRole('button', { name: 'Load', exact: true }));
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    await expect.poll(async () => (await readTrace(page)).epoch).toBe(epoch + 1);
    await expect(page.locator('.hud-build__arm'), 'existing fresh-press policy must keep public arming honest').toHaveAttribute('data-armed', 'true');
    await expect(page.locator('.hud-build__target-value')).toHaveText('Point at the world');
    expect(await showcaseSnapshot(page)).toEqual(whole);
    await page.screenshot({ path: info.outputPath('actual-loaded-original-primary-held.png') });
    await page.mouse.up({ button: 'left' }); held = false; await twoFrames(page);
    expect(await objectCommands(page), 'old held release must send no new object transaction').toHaveLength(1);
    await expect(page.locator('.hud-build__target-value')).toHaveText('Point at the world');
    expect(await showcaseSnapshot(page)).toEqual(whole);
    // Preserve the genuine fresh-press control: no extra arm toggle after Load.
    // The physical pointer is still exactly where the abandoned press began.
    // A same-coordinate move need not produce a new Phaser hover. Exercise the
    // actual fresh press directly; exact worker coordinates remain the oracle.
    const freshReference = await publicGroundReference(page);
    const fresh = { measured: freshReference.actual,
      point: freshReference.reference.screen(FRESH.x + .25, FRESH.y + .25) };
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), fresh.point)).toBe(true);
    await page.mouse.click(fresh.point.x, fresh.point.y);
    await expect.poll(() => objectCommands(page)).toHaveLength(2);
    const freshCommand = (await objectCommands(page))[1]!;
    const { orderId: freshOwner, ...freshShape } = freshCommand;
    expect(freshShape).toEqual({ type: 'PlaceObject', definitionId: 'desk-wooden', ...FRESH });
    expect(freshOwner).not.toBe(orderId);
    expect(freshOwner).toMatch(/^object-[a-f0-9-]+$/);
    await expect.poll(async () => (await showcaseSnapshot(page)).construction.orders).toHaveLength(2);
    const afterLoad = await showcaseSnapshot(page, info.outputPath('actual-load-fresh-purchase-whole.json'));
    expect(afterLoad.construction.orders.map(order => ({ id: order.id, definitionId: order.definitionId, location: order.location,
      orientation: order.objectOrientation ?? 0, state: order.state }))).toEqual([
      { id: orderId, definitionId: 'desk-wooden', location: CLAIM, orientation: 0, state: 'approved' },
      { id: freshOwner, definitionId: 'desk-wooden', location: FRESH, orientation: 0, state: 'approved' },
    ]);
    expect(afterLoad.simulation?.economy?.treasury.balanceMinorUnits).toBe(24740);

    const nextAim = await aim(page, { x: 10, y: 10 }); await page.mouse.down({ button: 'left' }); held = true;
    expect((await readTrace(page)).mouse.at(-1)).toMatchObject({ type: 'mousedown', buttons: 1, trusted: true, canvas: true });
    expect(await objectCommands(page)).toHaveLength(2);
    const beforeNew = (await readTrace(page)).epoch;
    await keyboardActivate(page, page.getByRole('button', { name: 'New prison', exact: true }));
    await expect.poll(async () => (await readTrace(page)).epoch).toBe(beforeNew + 1);
    await expect(page.locator('.save-panel__item')).toHaveCount(2);
    await expect(page.locator('.hud-build__arm')).toHaveAttribute('data-armed', 'true');
    await expect(page.locator('.hud-build__target-value')).toHaveText('Point at the world');
    await keyboardActivate(page, page.getByRole('button', { name: 'Pause', exact: true }));
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const empty = await showcaseSnapshot(page, info.outputPath('actual-new-primary-held-whole.json'));
    expect(empty.construction.orders).toEqual([]);
    await page.screenshot({ path: info.outputPath('actual-new-original-primary-held.png') });
    await page.mouse.up({ button: 'left' }); held = false; await twoFrames(page);
    expect(await objectCommands(page)).toHaveLength(2); expect(await showcaseSnapshot(page)).toEqual(empty);
    await expect(page.locator('.hud-build__target-value')).toHaveText('Point at the world');
    // New has no room yet. A genuine fresh press without rearming still reaches
    // the worker, whose outside-room refusal must not spend money/create an order.
    await frameYard(page);
    const newUnzoned = await aim(page, FRESH);
    await expect.poll(() => latestActualVerdict(page, FRESH)).toEqual({ ok: false, reason: 'outside-room', tile: FRESH,
      footprint: [{ x: 10, y: 8 }, { x: 11, y: 8 }], catalogueCostMinorUnits: 130 });
    await page.mouse.click(newUnzoned.point.x, newUnzoned.point.y);
    await expect.poll(() => objectCommands(page)).toHaveLength(3);
    const { orderId: refusedOwner, ...refusedShape } = (await objectCommands(page))[2]!;
    expect(refusedShape).toEqual({ type: 'PlaceObject', definitionId: 'desk-wooden', ...FRESH });
    expect(refusedOwner).toMatch(/^object-[a-f0-9-]+$/);
    expect([orderId, freshOwner]).not.toContain(refusedOwner);
    const refused = await showcaseSnapshot(page, info.outputPath('actual-new-fresh-outside-room-whole.json'));
    expect(refused.construction.orders).toEqual([]);
    expect(refused.simulation?.economy?.treasury.balanceMinorUnits).toBe(25000);
    await publicYard(page); await armDesk(page); await frameYard(page);
    const afterNew = await aim(page, FRESH); await page.mouse.click(afterNew.point.x, afterNew.point.y);
    await expect.poll(() => objectCommands(page)).toHaveLength(4);
    await expect.poll(async () => (await showcaseSnapshot(page)).construction.orders).toHaveLength(1);
    const { orderId: newOwner, ...newShape } = (await objectCommands(page))[3]!;
    expect(newShape).toEqual({ type: 'PlaceObject', definitionId: 'desk-wooden', ...FRESH });
    expect(newOwner).toMatch(/^object-[a-f0-9-]+$/);
    expect([orderId, freshOwner, refusedOwner]).not.toContain(newOwner);
    const final = await showcaseSnapshot(page, info.outputPath('actual-new-zoned-purchase-whole.json'));
    expect(final.construction.orders[0]).toMatchObject({ id: newOwner, definitionId: 'desk-wooden', location: FRESH, state: 'approved' });
    expect(final.construction.orders[0]!.objectOrientation ?? 0).toBe(0);
    expect(final.simulation?.economy?.treasury.balanceMinorUnits).toBe(24870);
    const trace = await readTrace(page);
    expect(trace.mouse.filter(event => event.type !== 'mousemove').every(event => event.trusted)).toBe(true);
    expect(trace.keys.every(event => event.trusted)).toBe(true);
    await writeFile(info.outputPath('actual-public-native-receipt.json'), JSON.stringify({ original: original.measured,
      clip, pixelReceipt, disarmedRedMinusBlue: redMinusBlue(disarmedPixels), loadFresh: fresh.measured, newOldAim: nextAim.measured, newFresh: afterNew.measured,
      trace, commands: await sentCommands(page), afterLoad, newUnzoned: newUnzoned.measured, refused, final }, null, 2));
    await info.attach('actual-allowed-fullhd', { body: shown, contentType: 'image/png' });
  } finally { if (held) await page.mouse.up({ button: 'left' }); }
});
