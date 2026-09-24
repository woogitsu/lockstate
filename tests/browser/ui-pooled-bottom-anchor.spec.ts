import { expect, test } from './network-changed-fixture';
import type { HudHeldGuardsViewModel } from '../../src/ui/hud';
import './ui-harness-api';

/**
 * Reproduce #1294 on the mounted Staff panel, without gating the known defect.
 *
 * `ui-held-guards.spec.ts` proves identity binding while a pooled place keeps
 * its box. This playtest measures the other half: a bottom-anchored panel moves
 * its boxes when the number of drawn rows changes. It deliberately reports the
 * result instead of asserting that a wrong-subject click must keep happening.
 * The only assertions establish that both guards and the old click target exist.
 */
test('a held-guard row never sends Release to an arriving guard under the old click point (#1294)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);

  const held = (guardId: number, claim: string): HudHeldGuardsViewModel => ({
    held: 1,
    unassigned: 7,
    guards: [{ entityId: guardId, claimLabelKey: claim, roleLabelKey: 'staff-role.guard.name' }],
  });
  const publish = (next: HudHeldGuardsViewModel): Promise<void> =>
    page.evaluate((model) => window.lockstateUiHarness.reportHeldGuards(model), next);
  const positions = () => page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-staff__held-row')]
      .map((row) => {
        const button = row.querySelector<HTMLButtonElement>('.ui-action');
        const box = button?.getBoundingClientRect();
        return {
          guardId: row.dataset['guard'] ?? '',
          button: box === undefined ? null : {
            x: box.x, y: box.y, width: box.width, height: box.height,
          },
        };
      })
      .filter((row) => row.button !== null && row.button.height > 0));

  await publish(held(4, 'guard-claim.search.name'));
  const before = await positions();
  const original = before.find((row) => row.guardId === '4');
  expect(original?.button, 'guard 4 needs a visible Release button before the publication').not.toBeNull();
  const point = {
    x: original!.button!.x + original!.button!.width / 2,
    y: original!.button!.y + original!.button!.height / 2,
  };

  // Guard 4's hold ends while guard 9 is newly claimed; the player has not
  // moved their pointer. The pool leaves guard 4's own place blank for its
  // settle window, but the whole block changes height above its bottom anchor.
  await publish(held(9, 'guard-claim.incident-response.name'));
  const after = await positions();
  expect(after.some((row) => row.guardId === '9'), 'guard 9 needs to be drawn after the publication').toBe(true);
  const underOldPoint = await page.evaluate(({ x, y }) => {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('.hud-staff__held-row');
    return row?.dataset['guard'] ?? '(no guard row)';
  }, point);

  await page.mouse.click(point.x, point.y);
  const intents = (await page.evaluate(() => window.lockstateUiHarness.hudIntents()))
    .map((intent) => JSON.parse(intent) as { kind?: string; guardId?: number });
  const release = intents.findLast((intent) => intent.kind === 'release-guard');
  expect(underOldPoint).not.toBe('9');
  expect(release?.guardId).not.toBe(9);
});

test('a focused Release becomes inert when its guard leaves, while the arriving guard stays separately focusable', async ({ page }) => {
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
  const held = (entityId: number) => ({ held: 1, unassigned: 7, guards: [
    { entityId, claimLabelKey: 'guard-claim.search.name', roleLabelKey: 'staff-role.guard.name' },
  ] });
  await page.evaluate((model) => window.lockstateUiHarness.reportHeldGuards(model), held(4));
  const oldRelease = page.locator('.hud-staff__held-row[data-guard="4"] .ui-action');
  await oldRelease.focus();
  await page.evaluate((model) => window.lockstateUiHarness.reportHeldGuards(model), held(9));
  await page.keyboard.press('Enter');
  const afterEnter = (await page.evaluate(() => window.lockstateUiHarness.hudIntents()))
    .map((intent) => JSON.parse(intent) as { kind?: string; guardId?: number });
  expect(afterEnter.some((intent) => intent.kind === 'release-guard' && intent.guardId === 9)).toBe(false);
  await expect(page.locator('.hud-staff__held-row[data-guard="9"] .ui-action')).toBeVisible();
});

test('a touch held through a changed publication cannot release the arriving guard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
  const held = (entityId: number) => ({ held: 1, unassigned: 7, guards: [
    { entityId, claimLabelKey: 'guard-claim.search.name', roleLabelKey: 'staff-role.guard.name' },
  ] });
  await page.evaluate((model) => window.lockstateUiHarness.reportHeldGuards(model), held(4));
  const box = await page.locator('.hud-staff__held-row[data-guard="4"] .ui-action').boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.evaluate((model) => window.lockstateUiHarness.reportHeldGuards(model), held(9));
  const targetAfter = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>('.hud-staff__held-row')?.dataset['guard'] ?? '(none)', { x, y });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const intents = (await page.evaluate(() => window.lockstateUiHarness.hudIntents()))
    .map((intent) => JSON.parse(intent) as { kind?: string; guardId?: number });
  expect(targetAfter).not.toBe('9');
  expect(intents.some((intent) => intent.kind === 'release-guard' && intent.guardId === 9)).toBe(false);
});
