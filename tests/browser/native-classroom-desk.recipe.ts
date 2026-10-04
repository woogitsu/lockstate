import { openCameraControls } from './public-camera-controls';
/** Opt-in genuine public built-client route. Preparation only: no private
 * commands, injected snapshots, fabricated owners or guessed pixel thresholds. */
import { writeFile } from 'node:fs/promises';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands, currentClock } from './playtest-harness';
import { installShowcaseReadProbe, showcaseSnapshot, showcaseRooms } from './native-small-prison-showcase-evidence';
import { assertClassroomCapacity, assertClassroomPlan, assertClassroomDesk, observeClassroomDeskNetwork } from './native-classroom-desk-evidence';
import { CLASSROOM_ART, CLASSROOM_BOOTSTRAP, CLASSROOM_CASES, CLASSROOM_ORIGIN, CLASSROOM_PLAN } from '../fixtures/native-classroom-desk-plan';

let capacityStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
let wholeCapacity: SessionSnapshotBundle | undefined;
const test = base.extend({ storageState: async ({}, use) => use(capacityStorage ?? { cookies: [], origins: [] }) });
test.describe.configure({ mode: 'serial' });
const observers = new WeakMap<Page, Awaited<ReturnType<typeof observeClassroomDeskNetwork>>>();

async function placePublicPlan(page: Page, name: string, origin: { x: number; y: number }, turns: 0 | 1 = 0): Promise<void> {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans', exact: true });
  await dialog.getByRole('button', { name, exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)', exact: true }).selectOption(String(turns));
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation', exact: true }).uncheck();
  const x = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  if (!await x.isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await x.fill(String(origin.x));
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await page.keyboard.press('Escape');
}

async function publicFastThenPause(page: Page, target: number): Promise<void> {
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
  await expect.poll(() => currentClock(page)).toEqual({ mode: 'running', speed: 4 });
  const progress = async () => {
    const data = await showcaseSnapshot(page);
    return data.construction.orders.filter(order => order.state === 'completed').length
      + (data.simulation?.roomTemplates?.completed?.length ?? 0);
  };
  let current = await progress();
  while (current < target) {
    await expect.poll(progress, { message: `actual ordered builders must advance from ${current}/${target}` }).toBeGreaterThan(current);
    current = await progress();
  }
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(() => currentClock(page)).toEqual({ mode: 'paused' });
}

async function framePublicRoom(page: Page): Promise<void> {
  const minimap = page.locator('.hud-minimap__surface');
  if (!await minimap.isVisible()) await page.getByRole('region', { name: 'Minimap', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('Actual public minimap absent');
  await minimap.click({ position: { x: bounds.width * 7.5 / 32, y: bounds.height * 7.5 / 32 } });
  await page.mouse.move(1300, 700);
}

test('01 public Storage/Delivery bootstrap for Classroom construction and separately bought desk', async ({ page }, info) => {
  await installShowcaseReadProbe(page); await installTee(page);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/?renderer=oblique');
  await page.getByRole('button', { name: 'New prison', exact: true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  for (const plan of CLASSROOM_BOOTSTRAP) await placePublicPlan(page, plan.name, plan.origin);
  expect(await sentCommands(page)).toEqual(CLASSROOM_BOOTSTRAP.map(plan => ({ type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin })));
  await publicFastThenPause(page, 41);
  wholeCapacity = await showcaseSnapshot(page, info.outputPath('actual-capacity-whole-paused.json'));
  assertClassroomCapacity(wholeCapacity);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  expect(await showcaseSnapshot(page)).toEqual(wholeCapacity);
  capacityStorage = await page.context().storageState({ indexedDB: true });
});

for (const turns of [0, 1] as const) test(`Classroom plan q${turns}: genuine separate130 desk quote, orientation0 owner and whole paused Save/Load`, async ({ page }, info) => {
  expect(capacityStorage, 'actual immutable public capacity IndexedDB save').toBeDefined();
  await installShowcaseReadProbe(page); await installTee(page);
  const network = await observeClassroomDeskNetwork(page); observers.set(page, network);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/?renderer=oblique');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  // Restored sessions expose their initial clock through the public HUD;
  // the complete worker equality below also rejects an advanced tick.
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await showcaseSnapshot(page)).toEqual(wholeCapacity);
  await placePublicPlan(page, CLASSROOM_PLAN.name, CLASSROOM_ORIGIN, turns);
  const queued = await showcaseSnapshot(page, info.outputPath('actual-classroom-plan-queued.json'));
  assertClassroomPlan(queued, turns, false);
  await publicFastThenPause(page, 71);
  const beforeDesk = await showcaseSnapshot(page, info.outputPath('actual-completed-original-classroom-before-desk.json'));
  assertClassroomPlan(beforeDesk, turns, true);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  const row = page.locator('.hud-build__list [data-buildable="desk-wooden"]');
  await row.click(); await expect(row).toHaveAttribute('data-selected', 'true');
  const buyRow = page.locator('.hud-build__buy');
  if (!await buyRow.isVisible()) await page.locator('.hud-build__buy-toggle').click();
  await buyRow.locator('.ui-number__input').fill('2');
  const submitPurchase = page.locator('.hud-build__buy-submit');
  await expect(submitPurchase).toContainText('130'); await expect(submitPurchase).toContainText('2');
  const actualQuote = await submitPurchase.innerText();
  await page.screenshot({ path: info.outputPath('actual-separate-desk-two-plank130-purchase-quote.png') });
  await submitPurchase.click();
  const coordinates = page.locator('.hud-build__coordinates');
  if (!await coordinates.locator('> .ui-section__body').isVisible()) await coordinates.locator('> .ui-section__header').click();
  const desk = CLASSROOM_CASES[turns].desk;
  await coordinates.getByRole('spinbutton', { name: 'Tile X', exact: true }).fill(String(desk.x));
  await coordinates.getByRole('spinbutton', { name: 'Tile Y', exact: true }).fill(String(desk.y));
  await coordinates.getByRole('button', { name: 'Place order', exact: true }).click();
  await expect.poll(async () => (await sentCommands(page)).filter(command => command.type === 'PlaceObject').length).toBe(1);
  const commands = await sentCommands(page);
  const purchase = commands.find(command => command.type === 'PurchaseMaterials')!;
  const object = commands.find(command => command.type === 'PlaceObject')!;
  expect(purchase.orderId).toMatch(/^order-[a-f0-9-]+$/); expect(object.orderId).toMatch(/^object-[a-f0-9-]+$/);
  const { orderId: purchaseOwner, ...purchaseShape } = purchase;
  const { orderId: objectOwner, ...objectShape } = object;
  expect(purchaseShape).toEqual({ type: 'PurchaseMaterials', itemId: 'item.wood-plank', quantity: 2 });
  expect(objectShape).toEqual({ type: 'PlaceObject', definitionId: 'desk-wooden', ...desk });
  expect(commands).toEqual([
    { type: 'PlaceRoomTemplate', templateId: 'classroom-basic', origin: CLASSROOM_ORIGIN, ...(turns === 0 ? {} : { quarterTurns: turns }) },
    purchase, object,
  ]);
  await expect.poll(async () => (await showcaseSnapshot(page)).construction.orders.find(order => order.id === objectOwner)?.state).toBe('approved');
  expect((await showcaseSnapshot(page)).simulation?.economy?.treasury.balanceMinorUnits).toBe(19400);
  await publicFastThenPause(page, 72);
  const built = await showcaseSnapshot(page, info.outputPath('actual-separate-desk-completed-whole-paused.json'));
  expect(typeof objectOwner).toBe('string'); assertClassroomDesk(built, turns, String(objectOwner));
  const rooms = await showcaseRooms(page);
  expect(rooms.totals).toEqual({ instances: 3, occupants: 0, capacity: 0 });
  expect(rooms.rooms.rows.find(room => room.roomCatalogId === 'room.classroom')).toMatchObject({
    instanceId: 'room.classroom:5:5', access: 'doorway', requirementSummary: { missingCapability: 0, notEvaluated: 2 },
    concurrentUse: [{ capability: 'education', capacity: 2, inUse: 0 }, { capability: 'seating', capacity: 4, inUse: 0 }, { capability: 'workstation', capacity: 2, inUse: 0 }],
  });
  // BOTH desks have orientation0: initial−45 +7*15 = source60, default45→frame40.
  await openCameraControls(page);
  for (let step = 0; step < CLASSROOM_ART.cameraRightClicks; step++) await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  await framePublicRoom(page);
  await page.screenshot({ path: info.outputPath('actual-classroom-desk-before-save-fullhd.png') });
  const provenance = await network.evidence(info, turns);
  expect(await showcaseSnapshot(page)).toEqual(built);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const loaded = await showcaseSnapshot(page, info.outputPath('actual-classroom-desk-whole-paused-after-load.json'));
  expect(loaded, 'whole paused current-session native Save/Load').toEqual(built);
  assertClassroomDesk(loaded, turns, String(objectOwner)); expect(await showcaseRooms(page)).toEqual(rooms);
  await framePublicRoom(page);
  await page.screenshot({ path: info.outputPath('actual-classroom-desk-after-load-fullhd.png') });
  await writeFile(info.outputPath('actual-classroom-desk-prepared-route-receipt.json'), JSON.stringify({ turns, publicIndividualDeskOrientation: 0,
    commands, purchaseOwner, objectOwner, actualQuote, beforeDesk, built, loaded, rooms, provenance,
    deskTiles: CLASSROOM_CASES[turns].deskTiles, intendedSourcePose: [60, 40], deskVisualCalibrationComplete: false,
    visualAcceptancePending: true, rootMustReview: 'Calibrate actual desk art inside each room layout before/after Load and run the Classroom consumer control; native network/image decoding is not pixel acceptance.' }, null, 2));
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  await observers.get(page)?.raw(info.outputPath('failed-classroom-desk-network.json')).catch(() => undefined);
  await showcaseSnapshot(page, info.outputPath('failed-classroom-desk-worker.json')).catch(() => undefined);
  await page.screenshot({ path: info.outputPath('failed-classroom-desk-fullhd.png') }).catch(() => undefined);
});
