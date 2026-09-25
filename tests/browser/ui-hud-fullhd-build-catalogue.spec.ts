import { expect, test } from './network-changed-fixture';

test('Full HD Build catalogue names its category control without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html');
  await page.locator('#game-root canvas').waitFor();
  await page.getByRole('button', { name: /New prison|Nowe więzienie/ }).click();
  await page.locator('.ui-tab[data-tab="build"]').click();

  const reading = await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>(
      '.hud-build__catalogue > .ui-section__header-row .ui-section__eyebrow',
    )!;
    const control = document.querySelector<HTMLElement>('.hud-build__category')!;
    const headingBox = heading.getBoundingClientRect();
    const controlBox = control.getBoundingClientRect();
    return {
      heading: heading.textContent,
      headingFits: heading.scrollWidth <= heading.clientWidth + 1 && heading.scrollHeight <= heading.clientHeight + 1,
      headingInsideControlRow: headingBox.top >= controlBox.top && headingBox.bottom <= controlBox.bottom,
      controlVisible: controlBox.right <= innerWidth && controlBox.bottom <= innerHeight,
    };
  });

  expect(reading.heading).toMatch(/Co zbudować|What to build/);
  expect(reading.headingFits, JSON.stringify(reading)).toBe(true);
  expect(reading.headingInsideControlRow, JSON.stringify(reading)).toBe(true);
  expect(reading.controlVisible).toBe(true);
});
