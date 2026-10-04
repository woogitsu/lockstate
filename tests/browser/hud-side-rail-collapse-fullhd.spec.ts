import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from './network-changed-fixture';
import { installTee, sentCommands } from './playtest-harness';
import { installShowcaseReadProbe } from './native-small-prison-showcase-evidence';
import { readV10WholeSnapshot } from '../../docs/research/2026-10-03-approved-individual-object-rotate/native-evidence';

test('Full HD inspector collapse hides its contents and restores them', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const aside = page.locator('.hud__aside');
  const side = page.locator('.hud__side');
  const toggle = page.locator('.hud-layout__arrow[data-layout-region="inspector"]');
  await expect(aside).toBeVisible();
  await expect(side).toBeVisible();
  await toggle.click();

  await expect(aside).toHaveAttribute('hidden', '');
  await expect(side).toHaveAttribute('hidden', '');
  await expect(aside).toBeHidden();
  await expect(side).toBeHidden();
  expect(await page.locator('.hud__rail').evaluate((rail) => rail.getBoundingClientRect().width)).toBeLessThan(60);
  await expect(toggle).toBeInViewport();

  await toggle.click();
  await expect(aside).toBeVisible();
  await expect(side).toBeVisible();
  await expect(page.getByRole('button', { name: /New prison|Nowe więzienie/ })).toBeVisible();
});

async function inspectorPaint(page: Page) {
  return page.evaluate(() => {
    const describe = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) throw new Error(`Actual inspector node absent: ${selector}`);
      const rect = node.getBoundingClientRect();
      return { selector, hidden: node.hidden, display: getComputedStyle(node).display,
        width: rect.width, height: rect.height,
        laidOutDescendants: [...node.querySelectorAll('*')].filter(child => child.getClientRects().length > 0).length };
    };
    return ['.hud__aside', '.hud__side', '.save-panel', '.hud-build'].map(describe);
  });
}

async function topReadings(page: Page) {
  return page.locator('.hud-strip__metrics > .ui-stat').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { text: node.textContent, width: rect.width, height: rect.height,
      x: rect.x, y: rect.y, display: getComputedStyle(node).display };
  }));
}

for (const uiScale of [1, 2] as const) {
  test(`Full HD active Build manual fold removes all inspector painting at UI${uiScale * 100} and restores its public controls (#2029)`, async ({ page }, info) => {
    await installShowcaseReadProbe(page);
    await installTee(page);
    await page.addInitScript(() => localStorage.setItem('lockstate.settings.locale', JSON.stringify({ version: 1, preference: 'en' })));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?renderer=oblique');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    if (uiScale === 2) {
      for (let step = 0; step < 6 && await page.locator('html').getAttribute('data-ui-scale-step') !== '200'; step++) {
        await page.locator('.display-scale__cycle').click();
      }
    }
    await expect(page.locator('html')).toHaveAttribute('data-ui-scale-step', String(uiScale * 100));
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.getAttribute('aria-pressed') !== 'true') await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await expect(page.locator('.hud')).toHaveAttribute('data-active-tab', 'build');
    const before = await inspectorPaint(page);
    expect(before[0]?.display, 'active Build flattens only an open aside').toBe('contents');
    await expect(page.locator('.save-panel')).toBeVisible();
    await expect(page.locator('.hud-build')).toBeVisible();
    const readingsBefore = await topReadings(page);
    expect(readingsBefore).toHaveLength(9);
    readingsBefore.forEach(reading => {
      expect(reading.width).toBeGreaterThan(0); expect(reading.height).toBeGreaterThan(0);
      expect(reading.display).not.toBe('none');
    });
    const wholeBefore = await readV10WholeSnapshot(page, info.outputPath('fold-before-whole-v10.json'));
    const commandsBefore = await sentCommands(page);
    const toggle = page.getByRole('button', { name: 'Hide the panels', exact: true });
    await toggle.click();
    await expect(page.locator('.hud')).toHaveAttribute('data-layout-inspector', 'collapsed');
    const folded = await inspectorPaint(page);
    await writeFile(info.outputPath('fold-actual-dom-paint.json'), JSON.stringify({ uiScale, before, folded }, null, 2));
    await page.screenshot({ path: info.outputPath('active-build-manually-folded-fullhd.png') });
    // Real CSS/DOM oracle: [hidden] alone cannot detect display:contents leaking children.
    for (const row of folded.slice(0, 2)) {
      expect(row.hidden).toBe(true);
      expect(row.display, `${row.selector} must not flatten hidden descendants into the88px rail`).toBe('none');
      expect(row.laidOutDescendants).toBe(0);
    }
    await expect(page.locator('.save-panel')).toBeHidden();
    await expect(page.locator('.hud-build')).toBeHidden();
    const restore = page.getByRole('button', { name: 'Show the panels', exact: true });
    await expect(restore).toBeInViewport();
    const handle = await restore.evaluate(button => {
      const r = button.getBoundingClientRect();
      return { width: r.width, height: r.height,
        reachable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button };
    });
    expect(handle.width).toBeGreaterThanOrEqual(44 * uiScale);
    expect(handle.height).toBeGreaterThanOrEqual(44 * uiScale);
    expect(handle.reachable).toBe(true);
    expect(await topReadings(page)).toEqual(readingsBefore);
    expect(await readV10WholeSnapshot(page, info.outputPath('fold-hidden-whole-v10.json'))).toEqual(wholeBefore);
    expect(await sentCommands(page)).toEqual(commandsBefore);
    await restore.click();
    await expect(page.locator('.hud')).toHaveAttribute('data-layout-inspector', 'open');
    await expect(page.locator('.save-panel')).toBeVisible();
    await expect(page.locator('.hud-build')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New prison', exact: true })).toBeVisible();
    const restored = await inspectorPaint(page);
    expect(restored).toEqual(before);
    expect(await topReadings(page)).toEqual(readingsBefore);
    expect(await readV10WholeSnapshot(page, info.outputPath('fold-restored-whole-v10.json'))).toEqual(wholeBefore);
    expect(await sentCommands(page)).toEqual(commandsBefore);
    await writeFile(info.outputPath('fold-public-restoration-receipt.json'), JSON.stringify({ uiScale, before, folded, restored, handle, readingsBefore }, null, 2));
    await page.screenshot({ path: info.outputPath('active-build-publicly-restored-fullhd.png') });
  });
}
