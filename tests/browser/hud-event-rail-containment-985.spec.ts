import { expect, test } from './network-changed-fixture';

/**
 * The event band borrows a grid row while it is visible.  At 200% interface
 * scale in a 900x600 viewport that row is larger than the rail's remaining
 * budget.  The rail slots must shrink and scroll instead of painting Save or
 * the active panel below the viewport (#985).
 *
 * The event is raised in the page, after a real prison has been created, so
 * this probe exercises the production grid and the production Save panel.  A
 * short synthetic sentence keeps the assertion independent of which
 * simulation event happens to arrive first in a browser run.
 */
test('keeps rail panels inside a short 200% viewport while the event band is visible (#985)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'lockstate.settings.accessibility',
      JSON.stringify({ version: 1, uiScale: 2, reducedMotion: false }),
    );
  });
  await page.goto('/index.html');
  await page.waitForSelector('.hud');
  await page.locator('.save-panel__button').first().click();
  await expect(page.locator('.save-panel__item-label').first()).toBeVisible();

  const geometry = await page.locator('.hud__event').evaluate((event) => {
    event.removeAttribute('hidden');
    event.textContent = 'A short event message.';

    const read = (selector: string): { bottom: number; top: number; height: number } | null => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, top: rect.top, height: rect.height };
    };

    return {
      event: read('.hud__event'),
      rail: read('.hud__rail'),
      aside: read('.hud__aside'),
      side: read('.hud__side'),
      save: read('.save-panel'),
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry.event?.height, 'the event band was not laid out').toBeGreaterThan(0);
  // Fractional flex distribution can leave a sub-pixel rounding remainder;
  // one CSS pixel is still a strict containment check at this scale.
  const viewportBottom = geometry.viewportHeight + 1;
  expect(geometry.rail?.bottom, 'the inspector rail left the viewport').toBeLessThanOrEqual(viewportBottom);
  expect(geometry.aside?.bottom, 'the upper rail slot left the viewport').toBeLessThanOrEqual(viewportBottom);
  expect(geometry.side?.bottom, 'the active panel slot left the viewport').toBeLessThanOrEqual(viewportBottom);
  expect(geometry.save?.bottom, 'the Save panel left the viewport while the event was visible').toBeLessThanOrEqual(
    viewportBottom,
  );
});
