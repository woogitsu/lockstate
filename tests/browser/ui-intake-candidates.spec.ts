import { expect, test } from './network-changed-fixture';
import { acceptFirstCandidate, openApp, showPanel, tab } from './playtest-harness';

test.describe('screened intake offers (#594)', () => {
  for (const [name, width, height] of [['desktop', 1280, 800], ['phone', 375, 812]] as const) {
    test(`a ${name} player sees an offer and can delay then accept it`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openApp(page);
      await page.getByRole('button', { name: 'New prison' }).click();
      await showPanel(page, 'manage', '.hud-intake');
      const offers = page.locator('.hud-intake__candidate');
      await expect.poll(() => offers.count()).toBeGreaterThanOrEqual(1);
      expect(await offers.count()).toBeLessThanOrEqual(3);
      await expect(page.locator('.hud-intake__admit')).toBeHidden();
      const first = offers.first();
      await expect(first).toContainText('Risk:');
      await expect(first).toContainText('Sentence:');
      await expect(first).toContainText('Contraband:');
      await expect(first).toContainText('One-off bounty:');
      const id = await first.getAttribute('data-candidate-id');
      expect(id).not.toBeNull();
      await first.locator('[data-candidate-delay]').click();
      await expect(page.locator(`.hud-intake__candidate[data-candidate-id="${id}"]`)).toContainText('Delayed');
      expect(await acceptFirstCandidate(page)).toBe(id);
      await expect(tab(page, 'manage')).toBeVisible();
    });
  }
});
