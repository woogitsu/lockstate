import { writeFile } from 'node:fs/promises';
import { openCameraControls } from './public-camera-controls';
import { expect, test as base, type Page } from './network-changed-fixture';
import { installTee, sentCommands, currentClock } from './playtest-harness';
import { observeCommonRoomNetwork } from './common-room-upholstered-evidence';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

interface Probe { snapshot(): Promise<SessionSnapshotBundle> }
async function observeWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let latest: Worker | undefined;
    const readers = new Map<string, (value: unknown) => void>();
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { kind?: string; replyTo?: string };
          if (message.kind?.startsWith('simulation/')) latest = this;
          const id = message.replyTo ?? '', reader = readers.get(id);
          if (reader !== undefined) { readers.delete(id); reader(event.data); }
        });
      }
    }
    Reflect.set(window, 'Worker', ObservedWorker);
    Reflect.set(window, 'commonRoomNativeProbe', { async snapshot() {
      if (latest === undefined) throw Error('Actual simulation worker absent');
      const id = crypto.randomUUID();
      const message = await new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => { readers.delete(id); reject(Error('Actual snapshot timed out')); }, 20_000);
        readers.set(id, value => { clearTimeout(timer); resolve(value); });
        latest!.postMessage({ protocolVersion: 1, messageId: id, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
      }) as { kind: string; payload: { snapshot: { schemaVersion: number; data: SessionSnapshotBundle } } };
      if (message.kind !== 'simulation/snapshot' || message.payload.snapshot.schemaVersion !== 3) throw Error('Actual snapshot absent or incompatible');
      return message.payload.snapshot.data;
    } } satisfies Probe);
  });
}
const snapshot = (page: Page) => page.evaluate(() => (Reflect.get(window, 'commonRoomNativeProbe') as Probe).snapshot());
const placed = (data: SessionSnapshotBundle) => data.simulation?.objects?.placedObjects ?? [];
const pending = (data: SessionSnapshotBundle) => data.simulation?.roomTemplates?.pending ?? [];
const completed = (data: SessionSnapshotBundle) => data.simulation?.roomTemplates?.completed ?? [];
const roomOrigin = { x: 4, y: 4 };
const capacityIdentity = [
  { templateId: 'storage-room-basic', origin: { x: 12, y: 18 }, mirrorX: false, sequence: 0 },
  { templateId: 'delivery-bay-basic', origin: { x: 20, y: 18 }, mirrorX: false, sequence: 1 },
];

function assertCapacity(data: SessionSnapshotBundle): void {
  expect(pending(data)).toEqual([]); expect(completed(data)).toEqual(capacityIdentity);
  expect(data.construction.orders).toHaveLength(39);
  expect(data.construction.orders.every(o => o.state === 'completed')).toBe(true);
  expect(placed(data).map(o => ({ id: o.objectId, anchor: o.anchorTile, orientation: o.orientation })).sort((a,b) => a.anchor.x - b.anchor.x)).toEqual([
    { id: 'object.storage-rack', anchor: { x: 13, y: 19 }, orientation: 0 },
    { id: 'object.storage-rack', anchor: { x: 15, y: 19 }, orientation: 0 },
    { id: 'object.loading-dock-door', anchor: { x: 21, y: 19 }, orientation: 0 },
  ]);
  expect(data.simulation?.prisoners.roomInstanceDefinitions.map(r => ({ id: r.roomCatalogId, anchor: r.anchorTile, width: r.width, height: r.height })).sort((a,b) => a.anchor.x - b.anchor.x)).toEqual([
    { id: 'room.storage-room', anchor: { x: 13, y: 19 }, width: 3, height: 3 },
    { id: 'room.delivery-bay', anchor: { x: 21, y: 19 }, width: 4, height: 4 },
  ]);
}
function assertCommonRoom(data: SessionSnapshotBundle, turns: 0 | 1, built: boolean): void {
  const identity = { templateId: 'common-room-basic', origin: roomOrigin, mirrorX: false, ...(turns === 0 ? {} : { quarterTurns: turns }), sequence: 2 };
  expect(pending(data)).toEqual(built ? [] : [identity]);
  expect(completed(data)).toEqual(built ? [...capacityIdentity, identity] : capacityIdentity);
  const orders = data.construction.orders.filter(o => o.placementSequence === 2);
  expect(orders).toHaveLength(built ? 26 : 24);
  expect(data.construction.orders).toHaveLength(built ? 65 : 63);
  const perimeter: string[] = [];
  const doorway = turns === 0 ? { x: 7, y: 10 } : { x: 4, y: 7 };
  for (let y = 4; y < 11; y++) for (let x = 4; x < 11; x++) {
    if ((x === 4 || x === 10 || y === 4 || y === 10) && !(x === doorway.x && y === doorway.y)) perimeter.push(`wall-brick@${x},${y}:square`);
  }
  perimeter.push(turns === 0 ? 'door-wooden@7,10:north' : 'door-wooden@5,7:west');
  expect(orders.filter(o => o.definitionId !== 'bench-wooden').map(o => `${o.definitionId}@${o.location.x},${o.location.y}:${o.footprint ?? o.edge}`).sort()).toEqual(perimeter.sort());
  expect(orders.every(o => o.state === (built ? 'completed' : 'approved'))).toBe(true);
  const benches = placed(data).filter(o => o.objectId === 'object.bench');
  expect(benches).toHaveLength(built ? 2 : 0);
  const anchors = turns === 0 ? [[5,5], [7,7]] : [[9,5], [7,7]];
  // Literal scalar7×7 rotation of authored2×1 benches; no production transform.
  if (built) for (const [index, anchor] of anchors.entries()) {
    const [x,y] = anchor as [number,number];
    const id = `room-template-000000000002-2-object-${String(index).padStart(3,'0')}`;
    expect(benches.filter(o => o.sourceOrderId === id)).toEqual([
      { placedObjectId: `object:${x}:${y}`, objectId: 'object.bench', anchorTile: { x,y }, orientation: turns, sourceOrderId: id },
    ]);
    expect(orders.filter(o => o.id === id)).toMatchObject([{ id, definitionId: 'bench-wooden', location: { x,y }, state: 'completed' }]);
    expect(orders.find(o => o.id === id)?.objectOrientation ?? 0).toBe(turns);
  }
  expect(placed(data)).toHaveLength(built ? 5 : 3);
  const rooms = data.simulation?.prisoners.roomInstanceDefinitions.filter(r => r.roomCatalogId === 'room.common-room') ?? [];
  expect(rooms).toHaveLength(built ? 1 : 0);
  if (built) expect(rooms).toMatchObject([{ roomCatalogId: 'room.common-room', anchorTile: { x: 5, y: 5 }, width: 5, height: 5 }]);
}
async function placePlan(page: Page, name: string, origin: { x: number; y: number }, turns: 0 | 1 = 0): Promise<void> {
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await page.getByRole('button', { name: 'Room plans', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Room plans' });
  await dialog.getByRole('combobox', { name: 'Room plan rotation (clockwise)' }).selectOption(String(turns));
  await dialog.getByRole('button', { name, exact: true }).click();
  const x = dialog.getByRole('spinbutton', { name: 'Plan origin X' });
  if (!await x.isVisible()) await dialog.getByText('Enter coordinates', { exact: true }).click();
  await x.fill(String(origin.x)); await dialog.getByRole('spinbutton', { name: 'Plan origin Y' }).fill(String(origin.y));
  await expect(dialog.getByRole('status')).toHaveText('This footprint is clear.');
  const submit = dialog.getByRole('button', { name: 'Place room plan', exact: true });
  await expect(submit).toBeEnabled(); await submit.click();
  await expect(dialog.getByRole('status')).toHaveText('Room plan submitted.');
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
}
async function finish(page: Page): Promise<void> {
  const queue = page.locator('.hud-build');
  const count = async () => {
    const value = await queue.getAttribute('data-queued');
    if (value === null) {
      // The genuine HUD removes this attribute at zero. Confirm actual worker
      // completion rather than treating a missing observation as empty work.
      const data = await snapshot(page);
      expect(data.construction.orders.length).toBeGreaterThan(0);
      expect(data.construction.orders.every(order => order.state === 'completed')).toBe(true);
      return 0;
    }
    if (!/^\d+$/u.test(value)) throw Error('Actual construction queue malformed');
    return Number(value);
  };
  let remaining = await count();
  while (remaining > 0) {
    await expect.poll(count, { message: `actual worker construction advances from ${remaining}` }).toBeLessThan(remaining);
    remaining = await count();
  }
}
async function frameRoom(page: Page): Promise<void> {
  const minimap = page.locator('.hud-minimap__surface');
  if (!await minimap.isVisible()) await page.getByRole('region', { name: 'Minimap', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
  const bounds = await minimap.boundingBox(); if (bounds === null) throw Error('Actual minimap absent');
  // Exact genuine Common Room origin4,4 framing, retained from its prior spec.
  await minimap.click({ position: { x: bounds.width * .24, y: bounds.height * .24 } });
  await page.mouse.move(1300,700);
}
async function petrolPixels(page: Page, png: Buffer, turns: 0 | 1 | 'diagnostic'): Promise<number[]> {
  return page.evaluate(async ({ base64, turns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap,0,0);
    // Literal, disjoint fixture regions measured from actual Full HD frames.
    // q0 keeps its original regions/filter/floor. The completed and loaded q1
    // frames independently contain2547/2504 petrol pixels in these two boxes.
    const rects = turns === 0 ? [[640,390,150,180], [860,390,150,180]]
      : turns === 1 ? [[870,270,170,160], [875,440,175,170]]
      : [[0,0,bitmap.width,bitmap.height]];
    return rects.map(rect => {
      const pixels = context.getImageData(...rect as [number,number,number,number]).data;
      let count = 0;
      for (let i=0; i<pixels.length; i+=4) {
        const r=pixels[i]!,g=pixels[i+1]!,b=pixels[i+2]!;
        if (r>=35 && r<=105 && g-r>13 && b-r>13 && Math.abs(g-b)<22) count++;
      }
      return count;
    });
  }, { base64: png.toString('base64'), turns });
}
let capacityStorage: Awaited<ReturnType<ReturnType<Page['context']>['storageState']>> | undefined;
const test = base.extend({ storageState: async ({},use) => use(capacityStorage ?? { cookies: [], origins: [] }) });
test.describe.configure({ mode: 'serial' });
const captures = new WeakMap<Page,ReturnType<typeof observeCommonRoomNetwork>>();
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  await captures.get(page)?.raw(info.outputPath('failed-common-room-network.json'));
  await writeFile(info.outputPath('failed-common-room-worker.json'), JSON.stringify({ data: await snapshot(page).catch(error => ({ unavailable: String(error) })), commands: await sentCommands(page) },null,2));
  await page.screenshot({ path: info.outputPath('failed-common-room-fullhd.png') });
});

test('player completes actual remote storage and delivery capacity before Common Room upholstery', async ({ page },info) => {
  await installTee(page); await observeWorker(page); await page.setViewportSize({ width:1920,height:1080 });
  await page.goto('/?renderer=oblique'); await page.getByRole('button', { name:'New prison',exact:true }).click();
  await expect(page.locator('.hud-clock__day')).toHaveText('1'); await page.getByRole('button', { name:'Pause',exact:true }).click();
  await placePlan(page,'Storage Room',{ x:12,y:18 }); await placePlan(page,'Delivery Bay',{ x:20,y:18 });
  await page.getByRole('button', { name:'Fast forward',exact:true }).click(); await page.getByRole('button', { name:'Fast forward',exact:true }).click(); await finish(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('2'); await page.getByRole('button', { name:'Pause',exact:true }).click();
  await expect.poll(() => currentClock(page)).toEqual({ mode:'paused' });
  const capacity=await snapshot(page); assertCapacity(capacity);
  expect(await sentCommands(page)).toEqual([
    { type:'PlaceRoomTemplate',templateId:'storage-room-basic',origin:{ x:12,y:18 } },
    { type:'PlaceRoomTemplate',templateId:'delivery-bay-basic',origin:{ x:20,y:18 } },
  ]);
  await page.getByRole('button', { name:'Overview',exact:true }).click(); await page.getByRole('button', { name:'Save now',exact:true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved');
  await writeFile(info.outputPath('actual-capacity-completed-worker.json'),JSON.stringify(capacity,null,2));
  capacityStorage=await page.context().storageState({ indexedDB:true });
});

for (const turns of [0,1] as const) test(`Common Room quarterTurns${turns}: actual upholstered benches retain owners, art source and whole paused Save/Load`,async ({ page },info) => {
  expect(capacityStorage,'first case must supply its actual IndexedDB save').toBeDefined();
  const network=observeCommonRoomNetwork(page); captures.set(page,network);
  await installTee(page); await observeWorker(page); await page.setViewportSize({ width:1920,height:1080 });
  await page.goto('/?renderer=oblique'); await page.locator('.save-panel__item').first().getByRole('button', { name:'Load',exact:true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.'); assertCapacity(await snapshot(page));
  await placePlan(page,'Common Room',roomOrigin,turns);
  const queued=await snapshot(page); assertCommonRoom(queued,turns,false);
  const expectedCommands=[{ type:'PlaceRoomTemplate',templateId:'common-room-basic',origin:roomOrigin,...(turns===0?{}:{quarterTurns:turns}) }];
  expect(await sentCommands(page)).toEqual(expectedCommands);
  await page.getByRole('button', { name:'Fast forward',exact:true }).click(); await page.getByRole('button', { name:'Fast forward',exact:true }).click(); await finish(page);
  await expect(page.locator('[data-metric="rooms"] .ui-stat__value')).toHaveText('3'); await page.getByRole('button', { name:'Pause',exact:true }).click();
  await expect.poll(() => currentClock(page)).toEqual({ mode:'paused' });
  const built=await snapshot(page); assertCommonRoom(built,turns,true); await frameRoom(page);
  const painted=await page.screenshot({ path:info.outputPath('common-room-actual-completed-fullhd.png') });
  const beforePixels=await petrolPixels(page,painted,turns);
  beforePixels.forEach(count=>expect(count,'each Common Room bench retains authored petrol/teal upholstery').toBeGreaterThan(1500));
  await page.getByRole('button', { name:'Overview',exact:true }).click(); await page.getByRole('button', { name:'Save now',exact:true }).click();
  await expect(page.locator('.save-panel__status')).toContainText('Saved'); await page.locator('.save-panel__item').first().getByRole('button', { name:'Load',exact:true }).click();
  await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  await expect.poll(() => currentClock(page)).toEqual({ mode:'paused' });
  const loaded=await snapshot(page); assertCommonRoom(loaded,turns,true); expect(loaded).toEqual(built);
  await frameRoom(page); const restored=await page.screenshot({ path:info.outputPath('common-room-actual-loaded-fullhd.png') });
  const afterPixels=await petrolPixels(page,restored,turns);
  afterPixels.forEach(count=>expect(count,'each Common Room bench retains authored upholstery after Load').toBeGreaterThan(1500));
  expect(afterPixels).toEqual(beforePixels);
  // Existing public Bench detail camera recipe; no fabricated renderer pose.
  await openCameraControls(page);
  for (let step=0;step<(turns===0?7:1);step++) await page.getByRole('button', { name:'Rotate camera right',exact:true }).click();
  await page.mouse.move(1200,650); await page.mouse.down({ button:'right' }); await page.mouse.move(1200,667,{ steps:3 }); await page.mouse.up({ button:'right' });
  await frameRoom(page); const provenance=await network.evidence(info,turns);
  const detail=await page.screenshot({ path:info.outputPath('common-room-actual-local60-elev40-fullhd.png') });
  const detailData=await snapshot(page); expect(detailData).toEqual(loaded);
  const evidence={ turns,queued,built,loaded,detailData,beforePixels,afterPixels,detailPixels:await petrolPixels(page,detail,'diagnostic'),
    commands:await sentCommands(page),provenance,q0ExactLegacyRegions:turns===0,q1PerFixtureRoiCalibrated:turns===1,
    fixtureRegions:turns===0?[[640,390,150,180],[860,390,150,180]]:[[870,270,170,160],[875,440,175,170]],
    pixelFloor:1500,detailWholeImageDiagnosticOnly:true,commonRoomConsumerNegativeExecuted:false,hardwareRoiMeasured:false,
    cameraRightButtons:turns===0?7:1,rightButtonDragFrom:[1200,650],rightButtonDragTo:[1200,667],selectedSourcePose:[60,40] };
  await writeFile(info.outputPath('common-room-actual-worker-pixels-and-provenance.json'),JSON.stringify(evidence,null,2));
  await info.attach('common-room-actual-worker-pixels-and-provenance',{ body:JSON.stringify(evidence,null,2),contentType:'application/json' });
});
