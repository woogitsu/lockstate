import { expect, test } from '../../../tests/browser/network-changed-fixture';

for (const locale of ['en', 'pl'] as const) {
  test(`${locale}: review draft retains original Full HD 100/200 controls and exact room-card assertions`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?renderer=world');
    await expect(page.locator('#game-root canvas')).toBeVisible();
    // Use the existing public language preference; this reloads the real page.
    for (let attempt = 0; attempt < 3 && await page.locator('html').getAttribute('lang') !== locale; attempt++) {
      await page.locator('.hud-layout__button').click();
      const language = page.locator('.language-control__cycle');
      const preference = await language.getAttribute('data-preference');
      const next = preference === 'auto' ? 'en' : preference === 'en' ? 'pl' : 'auto';
      await language.click();
      await expect(language).toHaveAttribute('data-preference', next);
      await expect(page.locator('#game-root canvas')).toBeVisible();
    }
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.getByRole('button', { name: locale === 'pl' ? 'Nowe więzienie' : 'New prison', exact: true }).click();
    await page.getByRole('button', { name: locale === 'pl' ? 'Pauza' : 'Pause', exact: true }).click();
    await page.locator('.ui-tab[data-tab="build"]').click();
    const desk = page.locator('.hud-build__list [data-buildable="desk-wooden"]');
    await desk.click();
    const rotate = page.locator('.hud-build__rotate-object');
    for (const scale of [100, 200] as const) {
      if (scale === 200) for (let step = 0; step < 4; step++) await page.locator('.display-scale__cycle').click();
      await expect(rotate).toBeVisible();
      // One real read of all action boxes/labels: preserve target, row-height,
      // label containment, panel containment and actual hit testing together.
      const geometry = await page.locator('.hud-build__actions').evaluate(row => {
        const panel = row.closest('.hud-build')!.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button')).filter(button => button.getClientRects().length > 0);
        return { row: { x: box.x, y: box.y, width: box.width, height: box.height }, buttons: buttons.map(button => {
          const bounds = button.getBoundingClientRect(), label = button.querySelector<HTMLElement>('.ui-action__label')!, words = label.getBoundingClientRect();
          const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          return { text: button.textContent, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
            minimumHeight: Number.parseFloat(getComputedStyle(button).minHeight),
            insideRow: bounds.left >= box.left && bounds.right <= box.right,
            insidePanel: bounds.top >= panel.top && bounds.bottom <= panel.bottom,
            labelInside: words.left >= bounds.left && words.right <= bounds.right && words.top >= bounds.top && words.bottom <= bounds.bottom,
            hit: hit === button || button.contains(hit) };
        }) };
      });
      await testInfo.attach(`${locale}-${scale}-actual-action-geometry`, { contentType: 'application/json', body: Buffer.from(JSON.stringify(geometry, null, 2)) });
      await page.screenshot({ path: testInfo.outputPath(`${locale}-${scale}-rotation-review.png`) });
      expect(geometry.buttons).toHaveLength(4);
      for (const button of geometry.buttons) {
        expect(button.width, button.text ?? '').toBeGreaterThanOrEqual(44);
        expect(button.height).toBeCloseTo(button.minimumHeight, 5);
        expect(geometry.row.height).toBeCloseTo(button.minimumHeight, 5);
        expect(button.insideRow && button.insidePanel && button.labelInside && button.hit, JSON.stringify(button)).toBe(true);
      }
      await rotate.click();
      await expect(rotate).toBeFocused();
      await expect(rotate).toHaveAttribute('data-quarter-turns', '1');
      await expect(page.locator('.hud-build__selected-footprint')).toContainText('1 × 2');
      await page.keyboard.press('Enter');
      await expect(rotate).toHaveAttribute('data-quarter-turns', '2');
      await page.keyboard.press('Space');
      await expect(rotate).toHaveAttribute('data-quarter-turns', '3');
      await rotate.click();
      await expect(rotate).toHaveAttribute('data-quarter-turns', '0');
      await expect(page.locator('.hud-build__selected-footprint')).toContainText('2 × 1');
      await page.locator('.hud-build__template-open').click();
      const cards = page.getByRole('dialog').locator('[data-template-id]');
      await expect(cards).toHaveCount(20);
      const cardGeometry = await cards.evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect(), label = element.querySelector('strong')!;
        return { text: label.textContent, accessible: element.getAttribute('aria-label'),
          fits: label.scrollWidth <= label.clientWidth, top: box.top, bottom: box.bottom,
          hit: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
      }));
      expect(cardGeometry.every(card => card.text === card.accessible && card.fits && card.hit && card.top >= 0 && card.bottom <= 1080)).toBe(true);
      await page.locator('.hud-template__close').click();
    }
  });
}
