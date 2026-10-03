/** Prepared read-only Reception Room evidence; no native result is claimed. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { expect, type Page, type TestInfo } from './network-changed-fixture';
import { observeCotImages } from './cell-cot-evidence';
import { RECEPTION_ART, RECEPTION_REGISTRATION_DESK_ART, RECEPTION_CASES, RECEPTION_CAPACITY_OWNERS, RECEPTION_PLAN, RECEPTION_ORIGIN, receptionOwner } from '../fixtures/native-reception-room-plan';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

export function assertReceptionCapacity(data: SessionSnapshotBundle): void {
  expect(data.simulation?.economy?.treasury.balanceMinorUnits).toBe(21825);
  expect(data.construction.orders).toHaveLength(39);
  expect(data.construction.orders.every(order => order.state === 'completed')).toBe(true);
  expect(data.simulation?.objects?.placedObjects).toEqual(RECEPTION_CAPACITY_OWNERS);
  expect(data.simulation?.roomTemplates?.pending).toEqual([]);
  expect(data.simulation?.roomTemplates?.completed).toEqual([
    { templateId: 'storage-room-basic', origin: { x: 12, y: 18 }, mirrorX: false, sequence: 0 },
    { templateId: 'delivery-bay-basic', origin: { x: 20, y: 18 }, mirrorX: false, sequence: 1 },
  ]);
  expect(data.simulation?.prisoners.roomInstanceDefinitions).toHaveLength(2);
}

export function assertReceptionRoom(data: SessionSnapshotBundle, turns: 0 | 1, built: boolean): void {
  const plan = RECEPTION_CASES[turns];
  const identity = { templateId: RECEPTION_PLAN.templateId, origin: RECEPTION_ORIGIN,
    sequence: 2, mirrorX: false, ...(turns === 0 ? {} : { quarterTurns: turns }) };
  const capacity = [
    { templateId: 'storage-room-basic', origin: { x: 12, y: 18 }, mirrorX: false, sequence: 0 },
    { templateId: 'delivery-bay-basic', origin: { x: 20, y: 18 }, mirrorX: false, sequence: 1 },
  ];
  expect(data.simulation?.roomTemplates?.pending).toEqual(built ? [] : [identity]);
  expect(data.simulation?.roomTemplates?.completed).toEqual(built ? [...capacity, identity] : capacity);
  expect(data.construction.orders).toHaveLength(built ? 62 : 59);
  const orders = data.construction.orders.filter(order => order.placementSequence === 2);
  expect(orders).toHaveLength(built ? 23 : 20);
  for (const [ordinal, [x, y]] of plan.walls.entries()) {
    expect(orders[ordinal]).toMatchObject({ id: receptionOwner('wall', ordinal), definitionId: 'wall-brick',
      location: { x, y }, footprint: 'square', placementSequence: 2, state: built ? 'completed' : 'approved' });
  }
  expect(orders[19]).toMatchObject({ id: receptionOwner('door', 0), definitionId: 'door-wooden',
    location: { x: plan.doorOrder.x, y: plan.doorOrder.y }, edge: plan.doorOrder.edge,
    placementSequence: 2, state: built ? 'completed' : 'approved' });
  const objects = data.simulation?.objects?.placedObjects ?? [];
  expect(objects.filter(object => object.sourceOrderId?.startsWith('room-template-000000000000-') || object.sourceOrderId?.startsWith('room-template-000000000001-'))).toEqual(RECEPTION_CAPACITY_OWNERS);
  expect(objects).toHaveLength(built ? 6 : 3);
  const chairs = objects.filter(object => object.objectId === 'object.chair');
  expect(chairs).toHaveLength(built ? 2 : 0);
  if (built) {
    const [x, y] = plan.desk;
    expect(objects.filter(object => object.sourceOrderId === receptionOwner('object', 0))).toEqual([
      { placedObjectId: `object:${x}:${y}`, objectId: 'object.desk', anchorTile: { x, y }, orientation: turns, sourceOrderId: receptionOwner('object', 0) },
    ]);
    expect(orders[20]).toMatchObject({ id: receptionOwner('object', 0), definitionId: 'desk-wooden', location: { x, y }, state: 'completed' });
    expect(orders[20]!.objectOrientation ?? 0).toBe(turns);
    for (const [ordinal, [chairX, chairY]] of plan.chairs.entries()) {
      const id = receptionOwner('object', ordinal + 1);
      expect(chairs.filter(object => object.sourceOrderId === id), 'literal Reception chair owner and orientation').toEqual([
        { placedObjectId: `object:${chairX}:${chairY}`, objectId: 'object.chair', anchorTile: { x: chairX, y: chairY }, orientation: turns, sourceOrderId: id },
      ]);
      expect(orders[21 + ordinal]).toMatchObject({ id, definitionId: 'chair-wooden', location: { x: chairX, y: chairY }, state: 'completed' });
      expect(orders[21 + ordinal]!.objectOrientation ?? 0, 'literal Reception typed producer orientation').toBe(turns);
    }
  }
  const rooms = data.simulation?.prisoners.roomInstanceDefinitions.filter(room => room.roomCatalogId === 'room.reception') ?? [];
  expect(rooms).toHaveLength(built ? 1 : 0);
  if (built) {
    expect(rooms).toMatchObject([{ roomCatalogId: 'room.reception', anchorTile: { x: 5, y: 5 }, width: 4, height: 4 }]);
    expect(data.simulation?.economy?.treasury.balanceMinorUnits).toBe(19980);
    expect(data.simulation?.economy?.procurement.pending).toEqual([]);
    expect(data.construction.orders.every(order => order.state === 'completed')).toBe(true);
  }
}

interface ReceptionArtFixture {
  readonly assetId: string; readonly descriptor: string; readonly descriptorCanonicalTextSha256: string;
  readonly source: string; readonly sourceSha256: string; readonly exposedFrame: string;
  readonly exposedFrameSha256: string; readonly cameraTarget: readonly [number, number, number];
}

/** Called on actual terminal network bodies; local unit controls test these same assertions. */
export function assertReceptionDeliveredArt(art: ReceptionArtFixture, descriptorBody: Buffer, png: Buffer) {
  // Canonical LF text accommodates the existing Git CRLF checkout policy.
  expect(createHash('sha256').update(descriptorBody.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')).toBe(art.descriptorCanonicalTextSha256);
  const catalog = parseObliqueModuleCatalog(JSON.parse(descriptorBody.toString('utf8')) as unknown);
  expect(catalog).toMatchObject({ assetId: art.assetId, source: art.source,
    sourceSha256: art.sourceSha256, resolutionPx: [256, 256], nominalPixelsPerTile: 64,
    pivotPx: [128, 128], cameraTargetTiles: art.cameraTarget });
  expect(catalog.frames).toHaveLength(72);
  expect(catalog.frames.filter(frame => frame.yawDegrees === 60 && frame.elevationDegrees === 40)).toEqual([
    { yawDegrees: 60, elevationDegrees: 40, image: art.exposedFrame, sha256: art.exposedFrameSha256 },
  ]);
  expect(createHash('sha256').update(png).digest('hex')).toBe(art.exposedFrameSha256);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
  return { catalog, descriptorBodySha256: createHash('sha256').update(descriptorBody).digest('hex'),
    exposedFrameSha256: art.exposedFrameSha256 };
}

/** No synthetic fetch: bytes must originate from the actual renderer/loader.
 * Decoder rows come from the existing real HTMLImageElement/Blob observer. */
export async function observeReceptionNetwork(page: Page) {
  const decoded = await observeCotImages(page);
  const artworks = [RECEPTION_ART, RECEPTION_REGISTRATION_DESK_ART] as const;
  const rows: { url: string; path: string; status: number; sha256?: string; location?: string; bytes?: number; error?: string }[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  page.on('response', response => {
    const path = decodeURIComponent(new URL(response.url()).pathname);
    if (!artworks.some(art => path === art.descriptor || path.startsWith(`/assets/environment/oblique/${art.assetId}-`))
      && !/\/assets\/worker-[^/]+\.js$/.test(path)) return;
    const row: typeof rows[number] = { url: response.url(), path, status: response.status() };
    rows.push(row);
    const job = (async () => {
      if (row.status >= 300 && row.status < 400) {
        const location = response.headers()['location'];
        if (location !== undefined) row.location = location;
        return;
      }
      if (row.status !== 200) return;
      const body = await response.body();
      row.sha256 = createHash('sha256').update(body).digest('hex'); row.bytes = body.length; bodies.set(path, body);
    })().catch(error => { row.error = String(error); });
    pending.add(job); void job.finally(() => pending.delete(job));
  });
  return {
    async raw(path: string) { await Promise.all(pending); await writeFile(path, JSON.stringify(rows, null, 2)); },
    async evidence(info: TestInfo, quarterTurns: 0 | 1) {
      try {
        await expect.poll(() => artworks.every(art => bodies.has(art.descriptor) && bodies.has(art.exposedFrame)),
          { message: 'native Reception Room must request BOTH chair and registration desk descriptors and source60/elev40 frames' }).toBe(true);
      } finally { await Promise.all(pending); await writeFile(info.outputPath('reception-room-actual-network.json'), JSON.stringify(rows, null, 2)); }
      expect(rows.filter(row => row.error !== undefined)).toEqual([]);
      for (const row of rows.filter(row => row.location !== undefined))
        expect(decodeURIComponent(new URL(row.location!, row.url).pathname)).toBe(row.path);
      const images = await decoded();
      expect(images.errors).toEqual([]);
      const models = artworks.map(art => {
        const verified = assertReceptionDeliveredArt(art, bodies.get(art.descriptor)!, bodies.get(art.exposedFrame)!);
        const actualDecodedImages = images.images.filter(image => image.sha256 === art.exposedFrameSha256);
        expect(actualDecodedImages.some(image => image.assignedSrc.startsWith('blob:') && image.complete
          && !image.error && image.width === 256 && image.height === 256), `actual loader Blob decoded ${art.assetId}`).toBe(true);
        return { ...verified, actualDecodedImages };
      });
      expect(rows.some(row => /\/assets\/worker-[^/]+\.js$/.test(row.path) && row.status === 200 && row.sha256 !== undefined)).toBe(true);
      const chairModel = models[0]!;
      const receipt = { quarterTurns, catalog: chairModel.catalog, descriptorBodySha256: chairModel.descriptorBodySha256,
        exposedFrameSha256: RECEPTION_ART.exposedFrameSha256, network: rows, actualDecodedImages: images.images,
        models, registrationDeskOwner: receptionOwner('object', 0),
        cameraWorldYawDegrees: quarterTurns === 0 ? 60 : -30, sourcePose: [60, 40],
        syntheticFetchUsed: false, rendererTextureReadUsed: false, perChairVisualCalibrationComplete: false,
        registrationDeskVisualCalibrationComplete: false,
        visualAcceptancePending: true };
      await writeFile(info.outputPath('reception-room-actual200-source60-elev40.png'), bodies.get(RECEPTION_ART.exposedFrame)!);
      await writeFile(info.outputPath('reception-registration-desk-actual200-source60-elev40.png'), bodies.get(RECEPTION_REGISTRATION_DESK_ART.exposedFrame)!);
      await writeFile(info.outputPath('reception-room-actual-network-and-decoder-receipt.json'), JSON.stringify(receipt, null, 2));
      return receipt;
    },
  };
}
