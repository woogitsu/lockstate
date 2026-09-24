import { expect, test } from './network-changed-fixture';
import type { Page } from './network-changed-fixture';
import './ui-harness-api';

async function oldPoint(page: Page, selector: string) {
  const button = page.locator(`${selector} .ui-action`);
  await button.scrollIntoViewIfNeeded({ timeout: 3000 });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function underPoint(page: Page, point: {x: number; y: number}, row: string, data: string) {
  return page.evaluate(({ point, row, data }) => document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>(row)?.dataset[data] ?? '(none)', { point, row, data });
}

test('held guard old point stays safe at effective 200 percent zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
  const held = (entityId: number) => ({ held: 1, unassigned: 7, guards: [
    { entityId, claimLabelKey: 'guard-claim.search.name', roleLabelKey: 'staff-role.guard.name' },
  ] });
  await page.evaluate((model) => window.lockstateUiHarness.reportHeldGuards(model), held(4));
  const oldButton = page.locator('.hud-staff__held-row[data-guard="4"] .ui-action');
  await oldButton.scrollIntoViewIfNeeded();
  const before = await oldButton.boundingBox();
  expect(before).not.toBeNull();
  const point = { x: before!.x + before!.width / 2, y: before!.y + before!.height / 2 };
  expect(point.y).toBeLessThan(800);
  const oldScroll = await page.evaluate(() => ({
    rail: document.querySelector<HTMLElement>('.hud__side')?.scrollTop,
    panel: document.querySelector<HTMLElement>('.ui-panel.hud-staff')?.scrollTop,
  }));
  await page.evaluate((model) => window.lockstateUiHarness.reportHeldGuards(model), held(9));
  const newButton = page.locator('.hud-staff__held-row[data-guard="9"] .ui-action');
  const after = await newButton.boundingBox();
  const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>('.hud-staff__held-row')?.dataset['guard'] ?? '(none)', point);
  await page.mouse.click(point.x, point.y);
  const intents = (await page.evaluate(() => window.lockstateUiHarness.hudIntents()))
    .map((intent) => JSON.parse(intent) as { kind?: string; guardId?: number });
  expect(oldScroll.panel).toBeGreaterThan(0);
  expect(after).not.toBeNull();
  expect(target).not.toBe('9');
  expect(intents.some((intent) => intent.kind === 'release-guard' && intent.guardId === 9)).toBe(false);
});

test('queue old point does not cancel an arriving order at effective 200 percent zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
  const order = (index: number) => ({ orderId: `order-${index}`, labelKey: 'hud.build.buildable.wall-brick', tile: { x: 12, y: 30 + index }, edge: 'north' as const, state: 'assigned' as const, cancelRefundMinorUnits: 80, revision: index + 1 });
  const queue = (ids: readonly number[]) => ({ total: ids.length, started: 0, orders: ids.map(order), materialsFunding: { unfunded: false, shortfallMinorUnits: 0, nextOrderShortfallMinorUnits: 0 } });
  await page.evaluate(model => window.lockstateUiHarness.reportBuildQueue(model), queue([1]));
  await page.getByRole('button', { name: /Queued 1/ }).click();
  const point = await oldPoint(page, '.hud-build__queue-row[data-order="order-1"]');
  await page.evaluate(model => window.lockstateUiHarness.reportBuildQueue(model), queue([2]));
  const target = await underPoint(page, point, '.hud-build__queue-row', 'order');
  await page.mouse.click(point.x, point.y);
  const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
  expect(target).not.toBe('order-2');
  expect(intents.some(intent => intent.includes('cancel-build-order') && intent.includes('order-2'))).toBe(false);
});

test('delivery old point does not refund an arriving purchase at effective 200 percent zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
  const delivery = (id: number) => ({ orderId: `buy-${id}`, labelKey: 'item.brick.name', quantity: id * 5, paidMinorUnits: id * 1000 });
  const model = (ids: readonly number[]) => ({ total: ids.length, refundableMinorUnits: ids.length * 1000, deliveries: ids.map(delivery) });
  await page.evaluate(next => window.lockstateUiHarness.reportPendingDeliveries(next), model([1]));
  const point = await oldPoint(page, '.hud-build__delivery-row[data-delivery="buy-1"]');
  await page.evaluate(next => window.lockstateUiHarness.reportPendingDeliveries(next), model([2]));
  const target = await underPoint(page, point, '.hud-build__delivery-row', 'delivery');
  await page.mouse.click(point.x, point.y);
  const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
  expect(target).not.toBe('buy-2');
  expect(intents.some(intent => intent.includes('cancel-material-purchase') && intent.includes('buy-2'))).toBe(false);
});

test('roster old point does not target an arriving employee at effective 200 percent zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/browser/ui-harness.html');
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
  const model = (entityId: number) => ({
    counts: { prisoners: 0, prisonerCapacity: 8, occupiedPlaces: 0, staff: 1, staffUnassigned: 0, rooms: 2, prisonersCovered: 0, prisonersUnderstaffed: 0, prisonersUnguarded: 0, prisonersHighRisk: 0, activeIncidents: 0, contrabandFound: 0, treasuryMinorUnits: 25000, stateIncomeAccruedTodayMinorUnits: 0, dailyWageBillMinorUnits: 80 },
    clock: { day: 1, tickOfDay: 100, dayLengthTicks: 2400, mode: 'paused' as const, speed: 1 as const }, alerts: [],
    staffRoster: { hired: 1, staff: [{ entityId, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' }] },
  });
  await page.evaluate(next => window.lockstateUiHarness.setHudViewModel(next), model(4));
  await page.getByRole('button', { name: /On the payroll/ }).click();
  const point = await oldPoint(page, '.hud-staff__roster-row[data-staff="4"]');
  const beforeRows = await page.evaluate(() => ({scroll: document.querySelector<HTMLElement>('.ui-panel.hud-staff')?.scrollTop, rows: [...document.querySelectorAll<HTMLElement>('.hud-staff__roster-row')].map(row => ({id:row.dataset['staff'], hidden:row.hidden, y:row.getBoundingClientRect().y, h:row.getBoundingClientRect().height}))}));
  await page.evaluate(next => window.lockstateUiHarness.setHudViewModel(next), model(9));
  const afterRows = await page.evaluate(() => ({scroll: document.querySelector<HTMLElement>('.ui-panel.hud-staff')?.scrollTop, rows: [...document.querySelectorAll<HTMLElement>('.hud-staff__roster-row')].map(row => ({id:row.dataset['staff'], hidden:row.hidden, y:row.getBoundingClientRect().y, h:row.getBoundingClientRect().height}))}));
  const target = await underPoint(page, point, '.hud-staff__roster-row', 'staff');
  await page.mouse.click(point.x, point.y);
  const intents = await page.evaluate(() => window.lockstateUiHarness.hudIntents());
  expect(beforeRows.rows[2]?.h).toBe(88);
  expect(afterRows.rows[2]?.h).toBe(88);
  expect(target).not.toBe('9');
  expect(intents.some(intent => intent.includes('dismiss-staff') && intent.includes('9'))).toBe(false);
});
