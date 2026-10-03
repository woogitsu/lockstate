/** Source-prepared opt-in real built-client route; native visual acceptance pending. */
import { writeFile } from 'node:fs/promises';
import { expect, test as base, type Page } from '../network-changed-fixture';
import { buy, installTee, sentCommands } from '../playtest-harness';
import { LAUNDRY_RACK_SLOTS } from './art-fixture';
import { assertLaundryNativeOwners, captureLaundryWholePaused, observeLaundryLinenNetwork,
  recordLaundryCanonical, recordLaundryNetworkFailure } from './native-evidence';
interface ProbeWindow extends Window {
  askWorker?: (kind: string, payload: unknown) => Promise<unknown>;
}

async function installWorkerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let worker: Worker | undefined;
    const replies = new Map<string, (message: unknown) => void>();
    class ProbeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        worker = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const replyTo = (event.data as { replyTo?: string }).replyTo;
          if (replyTo === undefined) return;
          const waiter = replies.get(replyTo);
          if (waiter === undefined) return;
          replies.delete(replyTo);
          waiter(event.data);
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ProbeWorker as unknown as typeof Worker;
    (window as ProbeWindow).askWorker = (kind, payload) => new Promise((resolve, reject) => {
      if (worker === undefined) { reject(new Error('simulation worker absent')); return; }
      const messageId = crypto.randomUUID();
      const timer = setTimeout(() => { replies.delete(messageId); reject(new Error(`worker ${kind} timed out`)); }, 20_000);
      replies.set(messageId, message => { clearTimeout(timer); resolve(message); });
      worker.postMessage({ protocolVersion: 1, messageId, kind, payload });
    });
  });
}


let routeStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
const test = base.extend({
  storageState: async ({}, use) => { await use(routeStorage ?? { cookies: [], origins: [] }); },
});
test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  await recordLaundryNetworkFailure(page, info.outputPath('failed-actual-network.json'));
  const snapshot = await page.evaluate(async () => (window as ProbeWindow).askWorker
    ? (window as ProbeWindow).askWorker!('simulation/request-snapshot', { reason: 'consistency-check' }) : null);
  if (snapshot !== null) await writeFile(info.outputPath('failed-whole-worker-snapshot.json'), JSON.stringify(snapshot, null, 2));
  await page.screenshot({ path: info.outputPath('failed-player-fullhd.png') });
});
async function placeIndividualRack(page: Page, x: number, y: number) {
  const coordinates = page.locator('.hud-build__coordinates');
  if (!await coordinates.locator('> .ui-section__body').isVisible()) await coordinates.locator('> .ui-section__header').click();
  await coordinates.getByRole('spinbutton', { name: 'Tile X', exact: true }).fill(String(x));
  await coordinates.getByRole('spinbutton', { name: 'Tile Y', exact: true }).fill(String(y));
  await coordinates.getByRole('button', { name: 'Place order', exact: true }).click();
}
async function placePlan(page: Page, name: string, x: number, quarterTurns: 0 | 1 = 0): Promise<void> {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' }).selectOption(String(quarterTurns));
  await dialog.getByRole('button', { name, exact: true }).click();
  const input = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  if (!await input.isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await input.fill(String(x));
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill('5');
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await page.keyboard.press('Escape');
}

async function finishQueuedConstruction(page: Page): Promise<void> {
  const panel = page.locator('.hud-build');
  let remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  while (remaining > 0) {
    await expect.poll(async () => Number(await panel.getAttribute('data-queued') ?? 0),
      { message: `construction must advance from ${remaining} unfinished orders` }).toBeLessThan(remaining);
    remaining = Number(await panel.getAttribute('data-queued') ?? 0);
  }
}

test('player creates storage and delivery capacity before the paid Laundry rack', async ({ page }) => {
  await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  expect(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])).toEqual([1920, 1080, 1]);
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await placePlan(page, 'Storage Room', 5);
  await placePlan(page, 'Delivery Bay', 12);
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await finishQueuedConstruction(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await expect.poll(async () => (await sentCommands(page)).filter(c => c.type === 'PlaceRoomTemplate')).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'storage-room-basic', origin: { x: 5, y: 5 } },
    { type: 'PlaceRoomTemplate', templateId: 'delivery-bay-basic', origin: { x: 12, y: 5 } },
  ]);
  routeStorage = await page.context().storageState({ indexedDB: true });
});


for (const turns of [0, 1] as const) {
  test(`player builds Laundry q${turns}, independently buys linen rack and retains whole V9 after Save/Load`, async ({ page }, info) => {
    expect(routeStorage, 'actual prior public capacity save').toBeDefined();
    await installWorkerProbe(page); await installTee(page);
    const observer = await observeLaundryLinenNetwork(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/?renderer=oblique');
    expect(await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio])).toEqual([1920, 1080, 1]);
    await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    const capacity = await captureLaundryWholePaused(page, info.outputPath('capacity-whole-V9-paused.json'));
    expect(capacity.simulation?.economy?.treasury.balanceMinorUnits).toBe(21825);
    await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2');
    await placePlan(page, 'Laundry', 20, turns);
    await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toEqual([
      { type: 'PlaceRoomTemplate', templateId: 'laundry-basic', origin: { x: 20, y: 5 }, ...(turns === 0 ? {} : { quarterTurns: turns }) },
    ]);
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await finishQueuedConstruction(page);
    await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const beforePurchase = await captureLaundryWholePaused(page, info.outputPath('completed-Laundry-before-rack.json'));
    expect(beforePurchase.simulation?.economy?.treasury.balanceMinorUnits).toBe(20080);
    await buy(page, 'storage-rack-wooden', 1);
    const slot = LAUNDRY_RACK_SLOTS[turns];
    await placeIndividualRack(page, slot.x, slot.y);
    await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceObject').length).toBe(1);
    const bought = (await sentCommands(page)).filter(command => command.type === 'PlaceObject');
    const paidOrderId = bought[0]?.orderId;
    expect(paidOrderId).toEqual(expect.any(String));
    if (typeof paidOrderId !== 'string' || paidOrderId.length === 0) throw new Error('sole public rack purchase has no real owner UUID');
    expect(bought).toEqual([{ type: 'PlaceObject', orderId: paidOrderId, definitionId: 'storage-rack-wooden', x: slot.x, y: slot.y }]);
    expect((await sentCommands(page)).filter(command => command.type === 'PurchaseMaterials')).toEqual([
      { type: 'PurchaseMaterials', itemId: 'item.wood-plank', quantity: 1 },
    ]);
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await finishQueuedConstruction(page);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const built = await captureLaundryWholePaused(page, info.outputPath('laundry-whole-V9-paused-before-save.json'));
    expect(built.simulation?.economy?.treasury.balanceMinorUnits).toBe(20015);
    assertLaundryNativeOwners(built, turns, paidOrderId);
    expect(built.simulation?.objects?.placedObjects.filter(object => object.objectId === 'object.washing-machine'))
      .toEqual(beforePurchase.simulation?.objects?.placedObjects.filter(object => object.objectId === 'object.washing-machine'));
    const region = page.getByRole('region', { name: 'Minimap', exact: true });
    if (!await page.locator('.hud-minimap__surface').isVisible()) await region.getByRole('button', { name: 'Expand', exact: true }).click();
    const minimap = page.locator('.hud-minimap__surface'); const bounds = await minimap.boundingBox();
    if (bounds === null) throw new Error('actual public minimap missing');
    await minimap.click({ position: { x: bounds.width * 22.5 / 32, y: bounds.height * 7.5 / 32 } });
    await page.mouse.move(1300, 700);
    await page.screenshot({ path: info.outputPath('laundry-rack-completed-fullhd.png') });
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved');
    await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    const loaded = await captureLaundryWholePaused(page, info.outputPath('laundry-whole-V9-paused-after-load.json'));
    expect(loaded, 'ALL V9 world, commands, history, owners, economy and systems survive public Save/Load').toEqual(built);
    assertLaundryNativeOwners(loaded, turns, paidOrderId);
    await minimap.click({ position: { x: bounds.width * 22.5 / 32, y: bounds.height * 7.5 / 32 } });
    await page.mouse.move(1300, 700);
    await page.screenshot({ path: info.outputPath('laundry-rack-loaded-fullhd.png') });
    await recordLaundryCanonical(page, info, turns, observer, loaded, paidOrderId);
  });
}
