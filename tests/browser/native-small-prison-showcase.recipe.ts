/** Opt-in built-client showcase. Deliberately neither .spec.ts nor .playtest.ts:
 * no source-dev suite or existing gate collects this larger player journey. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands, currentClock } from './playtest-harness';
import { installShowcaseReadProbe, showcaseSnapshot, showcaseRooms, assertShowcaseStage, observeShowcaseArt } from './native-small-prison-showcase-evidence';
import { SMALL_PRISON_PLANS, SMALL_PRISON_ROOM_IDS, SMALL_PRISON_CAMERA_POSES } from '../fixtures/native-small-prison-showcase-plan';

let routeStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
let lastPaused: SessionSnapshotBundle | undefined;
const test = base.extend({ storageState: async ({}, use) => { await use(routeStorage ?? { cookies: [], origins: [] }); } });
test.describe.configure({ mode: 'serial' });
const artReaders = new WeakMap<Page, Awaited<ReturnType<typeof observeShowcaseArt>>>();

async function openActualSession(page: Page, first: boolean): Promise<void> {
  await installShowcaseReadProbe(page);
  await installTee(page);
  artReaders.set(page, await observeShowcaseArt(page));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?renderer=oblique');
  if (first) {
    await page.getByRole('button', { name: 'New prison', exact: true }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  } else {
    expect(routeStorage, 'serial stages consume only the previous actual IndexedDB save').toBeDefined();
    await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    // A restored session publishes its initial HUD clock without a later
    // simulation/clock-state broadcast. Observe the real public paused state;
    // the complete worker equality below also rejects any advanced tick.
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await showcaseSnapshot(page), 'the same whole paused prison enters this stage').toEqual(lastPaused);
  }
}

async function placePublicPlan(page: Page, ordinal: number): Promise<void> {
  const plan = SMALL_PRISON_PLANS[ordinal]!;
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans', exact: true });
  await dialog.getByRole('button', { name: plan.name, exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)', exact: true }).selectOption(String(plan.quarterTurns));
  await dialog.getByRole('checkbox', { name: 'Mirror horizontally before rotation', exact: true }).uncheck();
  const x = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  if (!await x.isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await x.fill(String(plan.origin.x));
  await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(plan.origin.y));
  await expect(dialog.getByRole('status')).toContainText('clear');
  await dialog.getByRole('button', { name: 'Place room plan', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('submitted');
  await page.keyboard.press('Escape');
}

/** Progress comes from authoritative completed owners and completed template
 * jobs. A transient zero HUD queue between shell and fixture stages cannot pass. */
async function finishRealConstruction(page: Page, lastGesture: number): Promise<void> {
  const expected = SMALL_PRISON_PLANS[lastGesture]!;
  const target = expected.cumulativeOrders + lastGesture + 1;
  const progress = async () => {
    const data = await showcaseSnapshot(page);
    return data.construction.orders.filter(order => order.state === 'completed').length
      + (data.simulation?.roomTemplates?.completed?.length ?? 0);
  };
  let completed = await progress();
  while (completed < target) {
    await expect.poll(progress, { message: `actual construction must advance from ${completed}/${target}` }).toBeGreaterThan(completed);
    completed = await progress();
  }
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText(String(expected.rooms));
  await expect(page.locator('[data-metric="prisoners"] .ui-stat__value')).toHaveText('0');
}

async function saveActualStage(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  lastPaused = await showcaseSnapshot(page);
  routeStorage = await page.context().storageState({ indexedDB: true });
}

const stages = [
  { title: '01 public Storage Room and Delivery Bay capacity', ordinals: [0, 1] },
  { title: '02 horizontal four-cell wing and two-tile corridor', ordinals: [2] },
  // The prior paired journey used59.5s of60s. Keep one room per stage so its
  // real construction and complete Load verification each have bounded room.
  { title: '03 completed Kitchen', ordinals: [3] },
  { title: '04 completed Shower room', ordinals: [4] },
  // The real combined Canteen+Yard journey completed every order and saved,
  // but its context serialization reached60s. Give each room its own journey
  // and real Load boundary, keeping the existing60s/expect10s budgets.
  { title: '05 completed Canteen', ordinals: [5] },
  { title: '06 completed outdoor Yard', ordinals: [6] },
] as const;

for (const [stage, recipe] of stages.entries()) {
  test(recipe.title, async ({ page }, info) => {
    // Only this new 66-order wing case uses the framework's bounded 180s slow
    // budget: 3,960 actual builder ticks =49.5s at public 4× before Load,
    // room-plan gestures, serialization and rendering. Other cases stay60s;
    // expect10s, one worker and zero retries are inherited unchanged.
    if (stage === 1) test.slow();
    const started = Date.now();
    await openActualSession(page, stage === 0);
    for (const ordinal of recipe.ordinals) await placePublicPlan(page, ordinal);
    const requested = recipe.ordinals.map(ordinal => {
      const plan = SMALL_PRISON_PLANS[ordinal];
      return { type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin,
        ...(plan.quarterTurns === 0 ? {} : { quarterTurns: plan.quarterTurns }) };
    });
    expect((await sentCommands(page)).filter(command => command.type === 'PlaceRoomTemplate')).toEqual(requested);
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await page.getByRole('button', { name: 'Fast forward', exact: true }).click();
    await expect.poll(() => currentClock(page)).toMatchObject({ mode: 'running', speed: 4 });
    const lastGesture = recipe.ordinals.at(-1)!;
    await finishRealConstruction(page, lastGesture);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect.poll(() => currentClock(page)).toMatchObject({ mode: 'paused' });
    const completed = await showcaseSnapshot(page, info.outputPath('actual-completed-whole-paused-snapshot.json'));
    assertShowcaseStage(completed, lastGesture);
    const rooms = await showcaseRooms(page);
    expect(rooms.totals).toEqual({ instances: SMALL_PRISON_PLANS[lastGesture].rooms, occupants: 0, capacity: stage === 0 ? 0 : 4 });
    expect(rooms.rooms.rows.every(room => room.requirementSummary.missingCapability === 0)).toBe(true);
    await saveActualStage(page);
    expect(lastPaused).toEqual(completed);
    await writeFile(info.outputPath('actual-public-stage-receipt.json'), JSON.stringify({ stage, requested,
      elapsedMilliseconds: Date.now() - started, rooms, snapshot: completed, art: await artReaders.get(page)!() }, null, 2));
  });
}

test('07 same completed prison at three public camera poses and whole paused Save/Load', async ({ page }, info) => {
  await openActualSession(page, false);
  const before = await showcaseSnapshot(page, info.outputPath('whole-paused-before-camera-and-save.json'));
  assertShowcaseStage(before, 6);
  const rooms = await showcaseRooms(page);
  expect(rooms.rooms.rows.map(room => room.instanceId)).toEqual(SMALL_PRISON_ROOM_IDS);
  expect(rooms.totals).toEqual({ instances: 10, occupants: 0, capacity: 4 });
  expect(rooms.rooms.rows.map(room => room.access)).toEqual(Array.from({ length: 10 }, (_, index) => index === 9 ? 'gap' : 'doorway'));
  const region = page.getByRole('region', { name: 'Minimap', exact: true });
  if (!await page.locator('.hud-minimap__surface').isVisible()) await region.getByRole('button', { name: 'Expand', exact: true }).click();
  const minimap = page.locator('.hud-minimap__surface');
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('public minimap absent');
  const centre = async () => minimap.click({ position: { x: bounds.width * 15.5 / 32, y: bounds.height * 17.5 / 32 } });
  await centre();
  // Public native canvas focus, then five real keyboard zoom-out actions.
  // The actual Full HD dock begins at1556px. Use the observed unobstructed
  // central playfield, and still verify the real hit target before clicking.
  const focus = { x: 900, y: 400 };
  expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y) === document.querySelector('#game-root canvas'), focus)).toBe(true);
  await page.mouse.click(focus.x, focus.y);
  for (let index = 0; index < 5; index++) await page.keyboard.press('Minus');
  await centre();
  await page.mouse.move(1850, 1020);
  const canvas = page.locator('#game-root canvas');
  const captures: { name: string; yawDegrees: number; elevationDegrees: number; canvasSHA256: string }[] = [];
  let previous: Buffer | undefined;
  for (const pose of SMALL_PRISON_CAMERA_POSES) {
    for (let index = 0; index < pose.rightClicks; index++) await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
    for (let index = 0; index < pose.raiseClicks; index++) await page.getByRole('button', { name: 'Raise camera angle', exact: true }).click();
    await centre();
    await page.mouse.move(1850, 1020);
    if (previous !== undefined) await expect.poll(async () => (await canvas.screenshot()).equals(previous!)).toBe(false);
    const png = await canvas.screenshot({ path: info.outputPath(`${pose.name}-actual-canvas.png`) });
    expect(png.length).toBeGreaterThan(20_000);
    await page.screenshot({ path: info.outputPath(`${pose.name}-actual-fullhd.png`) });
    captures.push({ name: pose.name, yawDegrees: pose.yawDegrees, elevationDegrees: pose.elevationDegrees,
      canvasSHA256: createHash('sha256').update(png).digest('hex') });
    expect(await showcaseSnapshot(page), 'public camera controls preserve the same whole paused prison').toEqual(before);
    previous = png;
  }
  expect(new Set(captures.map(capture => capture.canvasSHA256)).size).toBe(3);
  const art = await artReaders.get(page)!(true);
  await saveActualStage(page);
  expect(lastPaused).toEqual(before);
  await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const loaded = await showcaseSnapshot(page, info.outputPath('whole-paused-after-real-save-load.json'));
  expect(loaded, 'ALL authoritative persisted state survives actual Save/Load').toEqual(before);
  assertShowcaseStage(loaded, 6);
  expect(await showcaseRooms(page)).toEqual(rooms);
  await centre();
  await page.mouse.move(1850, 1020);
  await page.screenshot({ path: info.outputPath('same-prison-loaded-actual-fullhd.png') });
  await writeFile(info.outputPath('same-prison-public-camera-save-load-receipt.json'), JSON.stringify({
    plannedZoom: 0.4096, publicZoomOutPresses: 5, minimapCentreTile: { x: 15.5, y: 17.5 }, captures, rooms,
    wholeBefore: before, wholeAfter: loaded, art,
    visualReviewRequired: 'Open all three actual Full HD frames; verify the entire built layout fits and the original models/square walls read coherently.',
  }, null, 2));
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  await showcaseSnapshot(page, info.outputPath('failed-actual-worker-snapshot.json')).catch(() => undefined);
  await page.screenshot({ path: info.outputPath('failed-actual-fullhd.png') }).catch(() => undefined);
  const art = await artReaders.get(page)?.().catch(error => ({ observerError: String(error) }));
  await writeFile(info.outputPath('failed-actual-art-observations.json'), JSON.stringify(art ?? null, null, 2));
});
