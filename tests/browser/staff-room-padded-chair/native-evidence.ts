/** Opt-in prepared evidence on the existing public Staff Room route. No native verdict. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { SessionSnapshotBundle } from '../../../src/simulation/runtime/restore-session';
import { SAVE_SCHEMA_VERSION } from '../../../src/persistence/save-schema';
import { parseObliqueModuleCatalog } from '../../../src/rendering/assets/oblique-module-catalog';
import { expect, type Page, type TestInfo } from '../network-changed-fixture';
import { observeCotImages } from '../cell-cot-evidence';
import { STAFF_CHAIR_ART, STAFF_CHAIR_OWNERS } from './art-fixture';

export function assertStaffDeliveredArt(descriptor: Buffer, png: Buffer) {
  const art = STAFF_CHAIR_ART;
  expect(createHash('sha256').update(descriptor.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')).toBe(art.descriptorCanonicalTextSha256);
  const catalog = parseObliqueModuleCatalog(JSON.parse(descriptor.toString('utf8')) as unknown);
  expect(catalog).toMatchObject({ assetId: art.assetId, source: art.source, sourceSha256: art.sourceSha256,
    resolutionPx: [256, 256], nominalPixelsPerTile: 64, pivotPx: [128, 128], cameraTargetTiles: art.cameraTarget });
  expect(catalog.frames).toHaveLength(72);
  expect(catalog.frames.filter(frame => frame.yawDegrees === 60 && frame.elevationDegrees === 40)).toEqual([
    { yawDegrees: 60, elevationDegrees: 40, image: art.exposedFrame, sha256: art.exposedFrameSha256 },
  ]);
  expect(createHash('sha256').update(png).digest('hex')).toBe(art.exposedFrameSha256);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
  expect([png[24], png[25], png[28]]).toEqual([8, 6, 0]);
  return { catalog, descriptorBodySha256: createHash('sha256').update(descriptor).digest('hex'),
    pngBodySha256: createHash('sha256').update(png).digest('hex') };
}

const observers = new WeakMap<Page, Awaited<ReturnType<typeof observeStaffChairNetwork>>>();
export async function recordStaffNetworkFailure(page: Page, path: string): Promise<void> {
  await observers.get(page)?.raw(path);
}

export async function observeStaffChairNetwork(page: Page) {
  const decoded = await observeCotImages(page);
  const rows: { url: string; path: string; status: number; sha256?: string; bytes?: number; location?: string; error?: string }[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  page.on('response', response => {
    const path = decodeURIComponent(new URL(response.url()).pathname);
    if (path !== STAFF_CHAIR_ART.descriptor && !path.startsWith(`/assets/environment/oblique/${STAFF_CHAIR_ART.assetId}-`)
      && !/\/assets\/worker-[^/]+\.js$/.test(path)) return;
    const row: typeof rows[number] = { url: response.url(), path, status: response.status() };
    rows.push(row);
    const job = (async () => {
      if (row.status >= 300 && row.status < 400) {
        const location = response.headers()['location']; if (location !== undefined) row.location = location;
        return;
      }
      if (row.status !== 200) return;
      const body = await response.body(); row.sha256 = createHash('sha256').update(body).digest('hex'); row.bytes = body.length;
      bodies.set(path, body);
    })().catch(error => { row.error = String(error); });
    pending.add(job); void job.finally(() => pending.delete(job));
  });
  const observer = {
    async raw(path: string) { await Promise.all(pending); await writeFile(path, JSON.stringify(rows, null, 2)); },
    async evidence(info: TestInfo, quarterTurns: 0 | 1) {
      try {
        await expect.poll(() => bodies.has(STAFF_CHAIR_ART.descriptor) && bodies.has(STAFF_CHAIR_ART.exposedFrame),
          { message: 'actual Staff chair descriptor and source60/e40 PNG must be demanded by renderer' }).toBe(true);
      } finally { await Promise.all(pending); await writeFile(info.outputPath('staff-chair-actual-network.json'), JSON.stringify(rows, null, 2)); }
      expect(rows.filter(row => row.error !== undefined)).toEqual([]);
      for (const row of rows.filter(row => row.location !== undefined))
        expect(decodeURIComponent(new URL(row.location!, row.url).pathname)).toBe(row.path);
      const verified = assertStaffDeliveredArt(bodies.get(STAFF_CHAIR_ART.descriptor)!, bodies.get(STAFF_CHAIR_ART.exposedFrame)!);
      expect(rows.some(row => row.path === STAFF_CHAIR_ART.descriptor && row.status === 200)).toBe(true);
      expect(rows.some(row => row.path === STAFF_CHAIR_ART.exposedFrame && row.status === 200 && row.sha256 === STAFF_CHAIR_ART.exposedFrameSha256)).toBe(true);
      const images = await decoded(); expect(images.errors).toEqual([]);
      const actualDecodedImages = images.images.filter(image => image.sha256 === STAFF_CHAIR_ART.exposedFrameSha256);
      expect(actualDecodedImages.some(image => image.assignedSrc.startsWith('blob:') && image.complete && !image.error
        && image.width === 256 && image.height === 256), 'actual loader HTMLImageElement decoded its original Blob').toBe(true);
      expect(rows.some(row => /\/assets\/worker-[^/]+\.js$/.test(row.path) && row.status === 200 && row.sha256 !== undefined)).toBe(true);
      const receipt = { quarterTurns, ...verified, network: rows, actualDecodedImages,
        sourcePose: [60, 40], cameraWorldYawDegrees: quarterTurns === 0 ? 60 : -30,
        syntheticFetchUsed: false, replacementImageUsed: false, rendererTextureReadUsed: false,
        perChairPadVisualCalibrationComplete: false, visualAcceptancePending: true };
      await writeFile(info.outputPath('staff-chair-actual200-source60-e40.png'), bodies.get(STAFF_CHAIR_ART.exposedFrame)!);
      await writeFile(info.outputPath('staff-chair-actual-network-decoder-receipt.json'), JSON.stringify(receipt, null, 2));
      return receipt;
    },
  };
  observers.set(page, observer); return observer;
}

/** Independent actual public template owner identities, including both orientation fields. */
export function assertStaffNativeOwners(data: SessionSnapshotBundle, turns: 0 | 1): void {
  const chairs = data.simulation?.objects?.placedObjects.filter(object => object.objectId === 'object.chair') ?? [];
  expect(chairs).toHaveLength(2);
  for (const owner of STAFF_CHAIR_OWNERS[turns]) {
    expect(chairs.filter(object => object.sourceOrderId === owner.sourceOrderId)).toEqual([
      { placedObjectId: `object:${owner.anchorTile.x}:${owner.anchorTile.y}`, objectId: 'object.chair', ...owner },
    ]);
    const order = data.construction.orders.find(row => row.id === owner.sourceOrderId);
    expect(order).toMatchObject({ id: owner.sourceOrderId, definitionId: 'chair-wooden', location: owner.anchorTile,
      state: 'completed', placementSequence: 2 });
    expect(order!.objectOrientation ?? 0).toBe(turns);
  }
  expect(data.simulation?.roomTemplates?.completed).toContainEqual({ templateId: 'staff-room-basic', origin: { x: 20, y: 5 },
    mirrorX: false, sequence: 2, ...(turns === 0 ? {} : { quarterTurns: turns }) });
  expect(data.simulation?.prisoners.roomInstanceDefinitions.filter(room => room.roomCatalogId === 'room.staff-room'))
    .toMatchObject([{ roomCatalogId: 'room.staff-room', anchorTile: { x: 21, y: 6 }, width: 4, height: 4 }]);
}

export async function captureStaffWholePaused(page: Page, path: string): Promise<SessionSnapshotBundle> {
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const reply = await page.evaluate(async () => {
    const ask = Reflect.get(window, 'askWorker') as ((kind: string, payload: unknown) => Promise<unknown>) | undefined;
    if (ask === undefined) throw new Error('existing real Staff worker read observer absent');
    return ask('simulation/request-snapshot', { reason: 'consistency-check' });
  });
  const envelope = reply as { kind: string; payload: { snapshot: { data: SessionSnapshotBundle } } };
  expect(envelope.kind).toBe('simulation/snapshot'); expect(SAVE_SCHEMA_VERSION).toBe(8);
  await writeFile(path, JSON.stringify(reply, null, 2));
  return envelope.payload.snapshot.data;
}

/** Runs after legacy retained-timber captures and original three hardware yaw clicks.
 * Existing yaw -45 becomes0/q0 or-90/q1, then four right clicks give60/-30.
 * Public lower3 clamps20; raise2 gives40. No new ROI or guessed pixel threshold. */
export async function recordStaffCanonicalAfterLoad(page: Page, info: TestInfo, turns: 0 | 1,
  observer: Awaited<ReturnType<typeof observeStaffChairNetwork>>, built: SessionSnapshotBundle, loaded: SessionSnapshotBundle) {
  expect(loaded, 'ALL current V8 worker state survives public paused Save/Load').toEqual(built);
  assertStaffNativeOwners(loaded, turns);
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Lower camera angle', exact: true }).click();
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Raise camera angle', exact: true }).click();
  await page.mouse.move(1300, 700);
  await page.screenshot({ path: info.outputPath('staff-chair-canonical-source60-e40-fullhd.png') });
  await page.locator('#game-root canvas').screenshot({ path: info.outputPath('staff-chair-canonical-source60-e40-canvas.png') });
  const provenance = await observer.evidence(info, turns);
  const afterCamera = await captureStaffWholePaused(page, info.outputPath('staff-chair-whole-paused-after-camera.json'));
  expect(afterCamera, 'public camera/art observation preserves all paused simulation state').toEqual(loaded);
  await writeFile(info.outputPath('staff-chair-native-prepared-route-receipt.json'), JSON.stringify({
    turns, saveSchemaVersion: SAVE_SCHEMA_VERSION, built, loaded, afterCamera, owners: STAFF_CHAIR_OWNERS[turns], provenance,
    publicAdditionalRightClicks: 4, publicLowerClicks: 3, publicRaiseClicks: 2,
    retainedTimberChecksPreserved: true, perChairPadVisualCalibrationComplete: false, visualAcceptancePending: true,
    rootMustReview: 'Open actual FullHD before/after Load and canonical photos; independently calibrate both paid chair pads and run consumer negatives. Existing timber checks only prove retained wood.' }, null, 2));
}
