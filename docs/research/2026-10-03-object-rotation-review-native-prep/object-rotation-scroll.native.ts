import { writeFile } from 'node:fs/promises';
import { expect, test } from '../../../tests/browser/network-changed-fixture';
import { actionGeometry } from './native-evidence';

test('PL200: DRAFT Build header survives genuine focus and wheel; every Save action remains keyboard reachable', async ({ page }, info) => {
  await page.goto('/?renderer=world');
  for (let attempt = 0; attempt < 3 && await page.locator('html').getAttribute('lang') !== 'pl'; attempt++) {
    await page.locator('.hud-layout__button').click();
    const language = page.locator('.language-control__cycle'), preference = await language.getAttribute('data-preference');
    const next = preference === 'auto' ? 'en' : preference === 'en' ? 'pl' : 'auto';
    await language.click(); await expect(language).toHaveAttribute('data-preference', next);
    await expect(page.locator('#game-root canvas')).toBeVisible();
  }
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.getByRole('button', { name: 'Nowe więzienie', exact: true }).click();
  for (let step = 0; step < 4; step++) await page.locator('.display-scale__cycle').click();
  await expect(page.locator('html')).toHaveAttribute('data-ui-scale-step', '200');
  await page.locator('.ui-tab[data-tab="build"]').click();
  await page.locator('.hud-build__list [data-buildable="desk-wooden"]').click();
  await page.locator('.hud-build__arm').click();
  const rotate = page.locator('.hud-build__rotate-object');
  await rotate.click(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  await expect(rotate).toHaveAttribute('data-quarter-turns', '3');
  const measure = async (state: string) => {
    const geometry = await actionGeometry(page);
    const header = await page.locator('.hud-build > .ui-panel__header').evaluate(element => {
      const box = element.getBoundingClientRect(), side = document.querySelector('.hud__side')!.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { x: box.x, y: box.y, width: box.width, height: box.height, sideTop: side.top, sideBottom: side.bottom,
        contained: box.top >= side.top && box.bottom <= side.bottom, hit: hit !== null && element.contains(hit), position: getComputedStyle(element).position };
    });
    await writeFile(info.outputPath(`${state}.json`), JSON.stringify({ geometry, header }, null, 2));
    await page.screenshot({ path: info.outputPath(`${state}.png`) });
    expect.soft(header.contained && header.hit, JSON.stringify(header)).toBe(true);
    expect.soft(geometry.buttons).toHaveLength(4);
    return geometry;
  };
  const geometry = await measure('q3-focus');
  for (const button of geometry.buttons) {
    expect.soft(button.width).toBeGreaterThanOrEqual(88);
    expect.soft(button.height).toBe(88); expect.soft(geometry.row.height).toBe(88);
    expect.soft(button.insideRow && button.insidePanel && button.labelInside && button.hit && button.insideViewport && button.inkInside && button.labelFits).toBe(true);
  }
  const side = await page.locator('.hud__side').boundingBox(); if (side === null) throw new Error('Actual side absent');
  await page.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await page.mouse.wheel(0, 450);
  await expect.poll(() => page.locator('.hud__side').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await measure('wheel-header');
  // Establish the first public control as the keyboard starting point without
  // invoking New/Import or rebuilding Save's buttons during an async save.
  await page.locator('.save-panel__actions').getByRole('button', { name: 'Nowe więzienie', exact: true }).focus();
  const saveReceipts: unknown[] = [];
  for (const name of ['Nowe więzienie', 'Zapisz teraz', 'Eksportuj', 'Importuj']) {
    const button = page.locator('.save-panel__actions').getByRole('button', { name, exact: true });
    await expect(button).toBeFocused();
    const actual = await button.evaluate(element => {
      const b = element.getBoundingClientRect(), panel = element.closest('.save-panel')!;
      const p = panel.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      const rail = document.querySelector('.hud__rail')!.getBoundingClientRect();
      return { text: element.textContent, top: b.top, bottom: b.bottom, width: b.width, height: b.height,
        contained: b.top >= p.top && b.bottom <= p.bottom, hit: hit !== null && element.contains(hit), scrollTop: panel.scrollTop,
        panelHeight: p.height, quarterRail: rail.height / 4, scrollbarWidth: getComputedStyle(panel).scrollbarWidth };
    });
    saveReceipts.push(actual);
    expect.soft(actual.contained && actual.hit, JSON.stringify(actual)).toBe(true);
    expect.soft(actual.height).toBeGreaterThanOrEqual(88); expect.soft(actual.panelHeight).toBeGreaterThanOrEqual(actual.quarterRail);
    await page.keyboard.press('Tab');
  }
  await writeFile(info.outputPath('save-keyboard-actions.json'), JSON.stringify(saveReceipts, null, 2));
  await page.screenshot({ path: info.outputPath('save-lower-actions.png') });
  await page.locator('.hud-build__template-open').click();
  const cards = page.getByRole('dialog').locator('[data-template-id]'); await expect(cards).toHaveCount(20);
  const actualCards = await cards.evaluateAll(elements => elements.map(element => {
    const b = element.getBoundingClientRect(), label = element.querySelector('strong')!;
    return { text: label.textContent, accessible: element.getAttribute('aria-label'), fits: label.scrollWidth <= label.clientWidth,
      top: b.top, bottom: b.bottom, hit: element.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)) };
  }));
  await writeFile(info.outputPath('all20-cards.json'), JSON.stringify(actualCards, null, 2));
  expect(actualCards.every(card => card.text === card.accessible && card.fits && card.hit && card.top >= 0 && card.bottom <= 1080)).toBe(true);
});
