import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '../../../tests/browser/network-changed-fixture';
import { armBuildable, installTee, sentCommands } from '../../../tests/browser/playtest-harness';
import { installShowcaseReadProbe, showcaseSnapshot } from '../../../tests/browser/native-small-prison-showcase-evidence';
import { observeUnroundedMinimapViewport } from '../../../tests/browser/minimap-unrounded-reference';
import { actionGeometry, actualVerdict, changedPixels, groundPoint, observeRotation, traceRotation } from './native-evidence';

async function aim(page: Page, anchor: { x: number; y: number }) {
  const reference = await groundPoint(page, anchor); await page.mouse.move(reference.point.x, reference.point.y);
  await expect(page.locator('.hud-build__target')).toHaveAttribute('data-target', `${anchor.x},${anchor.y}`);
  return reference;
}
const objectCommands = async (page: Page) => (await sentCommands(page)).filter(command => command.type === 'PlaceObject');

for (const locale of ['en', 'pl'] as const) test(`${locale}: DRAFT fourth Rotate control at FullHD public UI scale100/200, actual oriented preview and purchase`, async ({ page }, info) => {
  await installShowcaseReadProbe(page); await installTee(page); await observeRotation(page); await page.addInitScript(observeUnroundedMinimapViewport);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/?renderer=world');
  for (let attempt = 0; attempt < 3 && await page.locator('html').getAttribute('lang') !== locale; attempt++) {
    await page.locator('.hud-layout__button').click();
    const language = page.locator('.language-control__cycle'), preference = await language.getAttribute('data-preference');
    const next = preference === 'auto' ? 'en' : preference === 'en' ? 'pl' : 'auto';
    await language.click(); await expect(language).toHaveAttribute('data-preference', next);
    await expect(page.locator('#game-root canvas')).toBeVisible();
  }
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await page.getByRole('button', { name: locale === 'pl' ? 'Nowe więzienie' : 'New prison', exact: true }).click();
  await page.getByRole('button', { name: locale === 'pl' ? 'Pauza' : 'Pause', exact: true }).click();
  await page.locator('.ui-tab[data-tab="zones"]').click(); await page.locator('.hud-rooms__list [data-room="room.yard"]').click();
  const coordinates = page.locator('.hud-rooms__coordinates'); await coordinates.locator('> .ui-section__header').click();
  const names = locale === 'pl' ? ['Pole X', 'Pole Y', 'Szerokość', 'Wysokość'] : ['Tile X', 'Tile Y', 'Width', 'Height'];
  for (const [index, value] of [12, 10, 8, 8].entries()) await coordinates.getByRole('spinbutton', { name: names[index]!, exact: true }).fill(String(value));
  await coordinates.getByRole('button', { name: locale === 'pl' ? 'Użyj tych pól' : 'Use these tiles', exact: true }).click();
  await page.locator('.hud-rooms__confirm').click();
  await expect.poll(async () => (await showcaseSnapshot(page)).simulation?.prisoners.roomInstanceDefinitions).toMatchObject([{ instanceId: 'room.yard:12:10' }]);
  const receipts: unknown[] = [];
  for (const scale of [100, 200] as const) {
    if (scale === 200) for (let step = 0; step < 4; step++) await page.locator('.display-scale__cycle').click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-scale-step', String(scale));
    await page.locator('.ui-tab[data-tab="build"]').click(); await page.locator('.hud-build__list [data-buildable="desk-wooden"]').click();
    const rotate = page.locator('.hud-build__rotate-object');
    // Return q0 with genuine keyboard activation if this is the second scale.
    if (scale === 200) { await rotate.focus(); for (let turn = 0; turn < 3; turn++) await page.keyboard.press('Enter'); }
    await expect(rotate).toHaveAttribute('data-quarter-turns', '0');
    if (await page.locator('.hud-build__arm').getAttribute('data-armed') === 'true') await page.locator('.hud-build__arm').click();
    // Record BEFORE original geometry assertions; soft assertions retain RED
    // while allowing both scale screenshots to be captured in this same case.
    const measure = async (state: string) => {
      const actual = await actionGeometry(page);
      await writeFile(info.outputPath(`${locale}-ui${scale}-${state}-geometry.json`), JSON.stringify(actual, null, 2));
      await page.screenshot({ path: info.outputPath(`${locale}-ui${scale}-${state}-fullhd.png`) });
      expect.soft(actual.viewport.width).toBe(1920); expect.soft(actual.viewport.height).toBe(1080);
      expect.soft(actual.viewport.visualScale).toBe(1); expect.soft(actual.uiScale).toBe(String(scale));
      expect.soft(actual.buttons).toHaveLength(4);
      for (const button of actual.buttons) {
        expect.soft(button.width, button.text ?? '').toBeGreaterThanOrEqual(44);
        expect.soft(button.minimumHeight).toBe(44 * scale / 100);
        expect.soft(button.height).toBeCloseTo(button.minimumHeight, 5);
        expect.soft(actual.row.height).toBeCloseTo(button.minimumHeight, 5);
        expect.soft(button.insideRow && button.insidePanel && button.labelInside && button.hit, JSON.stringify(button)).toBe(true);
        expect.soft(button.insideViewport && button.inkInside && button.labelFits, JSON.stringify(button)).toBe(true);
      }
      receipts.push({ scale, state, actual });
    };
    await measure('selected-q0');
    await armBuildable(page, 'desk-wooden', 10_000); await measure('armed-q0');
    await rotate.click(); await expect(rotate).toBeFocused(); await expect(rotate).toHaveAttribute('data-quarter-turns', '1');
    await expect(page.locator('.hud-build__selected-footprint')).toContainText('1 × 2'); await measure('armed-q1');
    const surface = page.locator('.hud-minimap__surface');
    if (!await surface.isVisible()) await page.locator('.hud-minimap .ui-panel__toggle').click();
    const box = await surface.boundingBox(); if (box === null) throw new Error('Actual public minimap absent');
    await surface.click({ position: { x: box.width * 16 / 32, y: box.height * 14 / 32 } });
    const anchor = { x: 16, y: scale === 100 ? 14 : 16 };
    const vertical = [{ x: 16, y: anchor.y }, { x: 16, y: anchor.y + 1 }], horizontal = [{ x: 16, y: anchor.y }, { x: 17, y: anchor.y }];
    await aim(page, anchor);
    const allowed = (footprint: typeof vertical) => ({ ok: true, footprint, catalogueCostMinorUnits: 130, roomInstanceId: 'room.yard:12:10' });
    await expect.poll(() => actualVerdict(page, anchor, 1)).toEqual(allowed(vertical));
    await rotate.focus(); await page.keyboard.press('Enter'); await expect(rotate).toHaveAttribute('data-quarter-turns', '2');
    await expect.poll(() => actualVerdict(page, anchor, 2)).toEqual(allowed(horizontal));
    await page.keyboard.press('Space'); await expect(rotate).toHaveAttribute('data-quarter-turns', '3');
    await expect.poll(() => actualVerdict(page, anchor, 3)).toEqual(allowed(vertical));
    await measure('armed-q3'); // same exercised state, longest angle label; original44/88px checks retained
    await page.keyboard.press('KeyR'); await expect(rotate).toHaveAttribute('data-quarter-turns', '3'); // never an object rotation binding
    await page.keyboard.press('Enter'); await expect(rotate).toHaveAttribute('data-quarter-turns', '0');
    await expect.poll(() => actualVerdict(page, anchor, 0)).toEqual(allowed(horizontal));
    const before = await showcaseSnapshot(page), aimed = await aim(page, anchor);
    const crops = [{ x: 17, y: anchor.y }, { x: 16, y: anchor.y + 1 }].map(tile => {
      const a = aimed.reference.screen(tile.x + .26, tile.y + .26), b = aimed.reference.screen(tile.x + .74, tile.y + .74);
      return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
    });
    for (const clip of crops) {
      expect(clip.width).toBeGreaterThan(0); expect(clip.height).toBeGreaterThan(0);
      expect(clip.x >= 0 && clip.y >= 0 && clip.x + clip.width <= 1920 && clip.y + clip.height <= 1080).toBe(true);
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'),
        { x: clip.x + clip.width / 2, y: clip.y + clip.height / 2 })).toBe(true);
    }
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const beforePixels: Buffer[] = [];
    for (const [index, clip] of crops.entries()) beforePixels.push(await page.screenshot({ path: info.outputPath(`${locale}-ui${scale}-q0-secondary${index}.png`), clip }));
    await page.mouse.down({ button: 'left' }); let held = true;
    expect((await traceRotation(page)).mouse.at(-1)).toMatchObject({ type: 'mousedown', buttons: 1, trusted: true, canvas: true });
    try {
      await rotate.focus(); await expect(rotate).toBeFocused();
      await page.keyboard.press('Enter'); await expect(rotate).toHaveAttribute('data-quarter-turns', '1');
      await expect.poll(() => actualVerdict(page, anchor, 1)).toEqual(allowed(vertical));
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const pixelChanges: ({ clip: (typeof crops)[number] } & ReturnType<typeof changedPixels>)[] = [];
      for (const [index, clip] of crops.entries()) {
        const after = await page.screenshot({ path: info.outputPath(`${locale}-ui${scale}-q1-secondary${index}.png`), clip });
        pixelChanges.push({ clip, ...changedPixels(beforePixels[index]!, after) });
      }
      await writeFile(info.outputPath(`${locale}-ui${scale}-actual-q0-q1-secondary-pixels.json`), JSON.stringify(pixelChanges, null, 2));
      expect(pixelChanges.every(region => region.changed > 0), 'both independently chosen secondary interiors must change with actual q0→q1 footprint').toBe(true);
      await page.screenshot({ path: info.outputPath(`${locale}-ui${scale}-actual-q1-original-primary-held.png`) });
      await page.mouse.up({ button: 'left' }); held = false;
      expect(await objectCommands(page)).toHaveLength(scale === 100 ? 0 : 1);
      expect(await showcaseSnapshot(page)).toEqual(before);
      await page.mouse.click(aimed.point.x, aimed.point.y);
    } finally { if (held) await page.mouse.up({ button: 'left' }); }
    await expect.poll(() => objectCommands(page)).toHaveLength(scale === 100 ? 1 : 2);
    const { orderId, ...shape } = (await objectCommands(page)).at(-1)!;
    expect(orderId).toMatch(/^object-[a-f0-9-]+$/);
    expect(shape).toEqual({ type: 'PlaceObject', definitionId: 'desk-wooden', ...anchor, quarterTurns: 1 });
    await expect.poll(async () => (await showcaseSnapshot(page)).construction.orders).toHaveLength(scale === 100 ? 1 : 2);
    const whole = await showcaseSnapshot(page, info.outputPath(`${locale}-ui${scale}-actual-q1-whole.json`));
    expect(whole.construction.orders.at(-1)).toMatchObject({ id: orderId, definitionId: 'desk-wooden', location: anchor, objectOrientation: 1, state: 'approved' });
    expect(whole.simulation?.economy?.treasury.balanceMinorUnits).toBe(scale === 100 ? 24870 : 24740);
    await page.locator('.hud-build__template-open').click(); const cards = page.getByRole('dialog').locator('[data-template-id]');
    await expect(cards).toHaveCount(20);
    const cardGeometry = await cards.evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(), label = element.querySelector('strong')!;
      return { text: label.textContent, accessible: element.getAttribute('aria-label'), fits: label.scrollWidth <= label.clientWidth,
        top: box.top, bottom: box.bottom, hit: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
    }));
    await writeFile(info.outputPath(`${locale}-ui${scale}-actual-all20-cards.json`), JSON.stringify(cardGeometry, null, 2));
    await page.screenshot({ path: info.outputPath(`${locale}-ui${scale}-actual-all20-cards-fullhd.png`) });
    expect.soft(cardGeometry.every(card => card.text === card.accessible && card.fits && card.hit && card.top >= 0 && card.bottom <= 1080)).toBe(true);
    await page.locator('.hud-template__close').click();
  }
  const whole = await showcaseSnapshot(page); await page.locator('.ui-tab[data-tab="overview"]').click();
  await page.getByRole('button', { name: locale === 'pl' ? 'Zapisz teraz' : 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText(locale === 'pl' ? 'Zapisano' : 'Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: locale === 'pl' ? 'Wczytaj' : 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText(locale === 'pl' ? 'Wczytano.' : 'Loaded.');
  expect(await showcaseSnapshot(page)).toEqual(whole);
  const trace = await traceRotation(page); expect(trace.clicks.every(click => click.trusted)).toBe(true);
  expect(trace.keys.every(key => key.trusted)).toBe(true);
  expect(trace.keys.filter(key => key.code === 'Space' && key.rotateFocused)).toHaveLength(2);
  await writeFile(info.outputPath(`${locale}-actual-review-receipt.json`), JSON.stringify({ receipts, trace, commands: await sentCommands(page), whole }, null, 2));
});
