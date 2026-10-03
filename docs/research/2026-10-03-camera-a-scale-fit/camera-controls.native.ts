import { writeFile } from 'node:fs/promises';
import { expect, test } from '../../../tests/browser/network-changed-fixture';
import { installTee, sentCommands } from '../../../tests/browser/playtest-harness';
import { installShowcaseReadProbe } from '../../../tests/browser/native-small-prison-showcase-evidence';
import { readV10WholeSnapshot as showcaseSnapshot } from '../2026-10-03-approved-individual-object-rotate/native-evidence';
import { readMinimapCameraObservation } from '../../../tests/browser/minimap-camera-observation';
import { Localizer, buildMessageCatalog, defaultMessageCatalogEn } from '../../../src/services/localization';
import { localePlCatalog } from '../../../src/content/locale-pl';
import { pressCameraControl, readCameraLayout } from './camera-controls-read';

const variant = 'disclosure';
const labels = new Localizer({locale:'pl', catalogs:[defaultMessageCatalogEn, buildMessageCatalog('pl', Object.fromEntries(localePlCatalog))]});
const t = (key: string) => labels.format(key);
const refusalText = t('hud.alert.refusal.remove-wall.nothing-to-remove');
for (const uiScale of [1, 2] as const) {
test(`${variant}: FullHD PL publicUI${uiScale * 100} existing View, pan and pose with a real worker refusal`, async ({ page }, info) => {
  await installTee(page);
  await installShowcaseReadProbe(page);
  await page.addInitScript(({uiScale}) => {
    localStorage.setItem('lockstate.settings.accessibility', JSON.stringify({ version: 1, reducedMotion: false, uiScale }));
    localStorage.setItem('lockstate.settings.language', JSON.stringify({ version: 1, preference: 'pl' }));
  }, {uiScale});
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.getByRole('button', { name: t('save.action.create'), exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: t('hud.tab.build'), exact: true }).click();
  await page.locator('.hud-build__remove').click();
  const point = { x: 950, y: 500 };
  expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y) === document.querySelector('#game-root canvas'), point)).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await sentCommands(page)).filter(command => command['type'] === 'RemoveWall')).toHaveLength(1);
  // A worker applies a queued command at a tick. Run only until the genuine
  // refusal arrives, then pause; never pretend a paused queued removal decided.
  const pause = page.getByRole('button', { name: t('hud.transport.pause'), exact: true });
  if (await pause.getAttribute('aria-pressed') === 'true')
    await page.getByRole('button', { name: t('hud.transport.play'), exact: true }).click();
  const band = page.locator('.hud__refusal');
  await expect(band).toHaveAttribute('data-source', 'simulation');
  await expect(band).toBeVisible();
  await expect(band).toContainText(refusalText);
  await pause.click();
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.hud-build__remove').click();
  await page.getByRole('button', { name: t('hud.tab.overview'), exact: true }).click();
  const alertsHeader = page.locator('.ui-section:has(.hud-alerts__list) > .ui-section__header');
  if (await alertsHeader.getAttribute('aria-expanded') === 'false') await alertsHeader.click();
  await expect(page.locator('.hud-alerts__list [data-alert]:not([data-alert="empty"])')).toHaveCount(1);
  const panel = page.locator('.hud-camera-panel');
  await expect(panel).toHaveAttribute('data-presentation', variant);
  const trigger = page.getByRole('button', { name: t('hud.camera.view'), exact: true });
  if (variant === 'disclosure') {
    await expect(panel).toBeHidden();
    await page.screenshot({ path: info.outputPath(`actual-ui${uiScale * 100}-disclosure-closed.png`) });
    await pressCameraControl(page, trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  } else await expect(trigger).toHaveCount(0);
  await expect(panel).toBeVisible();
  const view = page.getByRole('combobox', { name: t('hud.camera.view'), exact: true });
  await expect(view).toHaveValue('world');
  const wholeBefore = await showcaseSnapshot(page, info.outputPath('actual-paused-before-camera-whole.json'));
  const commandsBefore = await sentCommands(page);
  const frames = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  for (let i = 0; i < 2; i++) await pressCameraControl(page, page.getByRole('button', { name: t('hud.zoom.in'), exact: true }));
  await frames();
  const movements: unknown[] = [];
  const original = await readMinimapCameraObservation(page);
  expect(original.left).toBeGreaterThan(0); expect(original.top).toBeGreaterThan(0);
  expect(original.left + original.width).toBeLessThan(100); expect(original.top + original.height).toBeLessThan(100);
  for (const direction of ['right', 'left', 'down', 'up'] as const) {
    const before = await readMinimapCameraObservation(page);
    const hit = await pressCameraControl(page, page.getByRole('button', { name: t(`input.action.camera.${direction}`), exact: true }));
    await expect.poll(() => readMinimapCameraObservation(page)).not.toEqual(before);
    const after = await readMinimapCameraObservation(page);
    const field = direction === 'right' || direction === 'left' ? 'left' : 'top';
    if (direction === 'right' || direction === 'down') expect(after[field]).toBeGreaterThan(before[field]);
    else expect(after[field]).toBeLessThan(before[field]);
    expect(after.width).toBeCloseTo(before.width, 3); expect(after.height).toBeCloseTo(before.height, 3);
    movements.push({ direction, hit, before, after });
  }
  const returned = await readMinimapCameraObservation(page);
  for (const field of ['left', 'top', 'width', 'height'] as const) expect(returned[field]).toBeCloseTo(original[field], 3);
  await pressCameraControl(page, view); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(view).toHaveValue('oblique'); await expect(view).toBeEnabled();
  await expect(page.locator('.hud-camera-pose')).toBeVisible(); await frames();
  await writeFile(info.outputPath(`diagnostic-before-angled-zoom-ui${uiScale * 100}.json`), JSON.stringify(await readCameraLayout(page), null, 2));
  await page.screenshot({ path: info.outputPath(`diagnostic-before-angled-zoom-ui${uiScale * 100}.png`) });
  // Each renderer owns its zoom. Reuse the existing native pan recipe in the
  // newly created Angled scene too; a clipped full-map outline cannot prove
  // that a pose button is inert or functional.
  for (let i = 0; i < 2; i++) await pressCameraControl(page, page.getByRole('button', { name: t('hud.zoom.in'), exact: true }));
  await frames();
  const angledOutline = await readMinimapCameraObservation(page);
  expect(angledOutline.left).toBeGreaterThan(0); expect(angledOutline.top).toBeGreaterThan(0);
  expect(angledOutline.left + angledOutline.width).toBeLessThan(100); expect(angledOutline.top + angledOutline.height).toBeLessThan(100);
  const layout = await readCameraLayout(page);
  await writeFile(info.outputPath(`actual-ui${uiScale * 100}-active-status-all-camera-geometry.json`), JSON.stringify(layout, null, 2));
  await page.screenshot({ path: info.outputPath(`actual-ui${uiScale * 100}-active-status-all-camera.png`) });
  expect(layout.viewport).toEqual({ width: 1920, height: 1080, zoom: 1, uiScale });
  expect(layout.controls).toHaveLength(variant === 'disclosure' ? 12 : 11); // select +4pan +4pose +2zoom [+View]
  for (const control of layout.controls) {
    expect(control.tap).toBe(44 * uiScale); expect(control.width).toBeGreaterThanOrEqual(44 * uiScale); expect(control.height).toBeGreaterThanOrEqual(44 * uiScale);
    expect(control.reachable, control.name ?? 'unnamed camera control').toBe(true);
    expect(control.left).toBeGreaterThanOrEqual(0); expect(control.top).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(1920); expect(control.bottom).toBeLessThanOrEqual(1080);
  }
  expect(layout.panel.top).toBeGreaterThanOrEqual(layout.band.bottom + 12 * uiScale);
  expect(layout.panel.left).toBeGreaterThanOrEqual(layout.tabs.right + 12 * uiScale);
  expect(layout.panel.right).toBeLessThanOrEqual(layout.rail.left - 12 * uiScale);
  expect(layout.panel.bottom <= layout.corner.top || layout.panel.left >= layout.corner.right,
    'the complete panel must be physically separated above or beside the unchanged corner').toBe(true);
  expect(layout.alertRows).toHaveLength(1);
  expect(layout.alertList.clientHeight, 'preserve the complete original alert row, not a corner cap').toBeGreaterThanOrEqual(layout.alertRows[0]!.height);
  expect(layout.alertRows[0]!.text).toContain(refusalText);
  const poses: unknown[] = [];
  for (const name of ['input.action.camera.rotate.left', 'input.action.camera.rotate.right', 'input.action.camera.tilt.up', 'input.action.camera.tilt.down'].map(t)) {
    const before = await readMinimapCameraObservation(page);
    const hit = await pressCameraControl(page, page.getByRole('button', { name, exact: true }));
    await expect.poll(() => readMinimapCameraObservation(page)).not.toEqual(before);
    poses.push({ name, hit, before, after: await readMinimapCameraObservation(page) });
  }
  await pressCameraControl(page, view); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await expect(view).toHaveValue('world'); await expect(view).toBeEnabled();
  await expect(page.locator('.hud-camera-pose')).toBeHidden();
  if (variant === 'disclosure') {
    await page.keyboard.press('Escape'); await expect(panel).toBeHidden(); await expect(trigger).toBeFocused();
    await pressCameraControl(page, trigger); await expect(view).toBeFocused();
  }
  await expect(band).toHaveAttribute('data-source', 'simulation'); await expect(band).toContainText(refusalText);
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  expect(await sentCommands(page), 'real camera actions may not post simulation/build commands').toEqual(commandsBefore);
  const wholeAfter = await showcaseSnapshot(page, info.outputPath('actual-paused-after-camera-whole.json'));
  expect(wholeAfter, 'entire actual paused worker state, not a selected projection, stays unchanged').toEqual(wholeBefore);
  await writeFile(info.outputPath('actual-public-camera-interactions.json'), JSON.stringify({ variant, movements, poses, commandsBefore }, null, 2));
  await page.screenshot({ path: info.outputPath(`actual-ui${uiScale * 100}-returned-world-active-status.png`) });
});

}
