/** Prepared read-only Garbage Room evidence; no native result is claimed. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { expect, type Page, type TestInfo } from './network-changed-fixture';
import { observeCotImages } from './cell-cot-evidence';
import { GARBAGE_ART, GARBAGE_CASES, GARBAGE_CAPACITY_OWNERS, GARBAGE_PLAN, GARBAGE_ORIGIN, garbageOwner } from '../fixtures/native-garbage-room-plan';

export function assertGarbageCapacity(data: SessionSnapshotBundle): void {
  expect(data.simulation?.economy?.treasury.balanceMinorUnits).toBe(21825);
  expect(data.construction.orders).toHaveLength(39);
  expect(data.construction.orders.every(order => order.state === 'completed')).toBe(true);
  expect(data.simulation?.objects?.placedObjects).toEqual(GARBAGE_CAPACITY_OWNERS);
  expect(data.simulation?.roomTemplates?.pending).toEqual([]);
  expect(data.simulation?.roomTemplates?.completed).toEqual([
    { templateId: 'storage-room-basic', origin: { x: 12, y: 18 }, mirrorX: false, sequence: 0 },
    { templateId: 'delivery-bay-basic', origin: { x: 20, y: 18 }, mirrorX: false, sequence: 1 },
  ]);
  expect(data.simulation?.prisoners.roomInstanceDefinitions).toHaveLength(2);
}

export function assertGarbageRoom(data: SessionSnapshotBundle, turns: 0 | 1, built: boolean): void {
  const plan = GARBAGE_CASES[turns];
  const identity = { templateId: GARBAGE_PLAN.templateId, origin: GARBAGE_ORIGIN,
    sequence: 2, mirrorX: false, ...(turns === 0 ? {} : { quarterTurns: turns }) };
  const capacity = [
    { templateId: 'storage-room-basic', origin: { x: 12, y: 18 }, mirrorX: false, sequence: 0 },
    { templateId: 'delivery-bay-basic', origin: { x: 20, y: 18 }, mirrorX: false, sequence: 1 },
  ];
  expect(data.simulation?.roomTemplates?.pending).toEqual(built ? [] : [identity]);
  expect(data.simulation?.roomTemplates?.completed).toEqual(built ? [...capacity, identity] : capacity);
  expect(data.construction.orders).toHaveLength(built ? 53 : 51);
  const orders = data.construction.orders.filter(order => order.placementSequence === 2);
  expect(orders).toHaveLength(built ? 14 : 12);
  for (const [ordinal, [x, y]] of plan.walls.entries()) {
    expect(orders[ordinal]).toMatchObject({ id: garbageOwner('wall', ordinal), definitionId: 'wall-brick',
      location: { x, y }, footprint: 'square', placementSequence: 2, state: built ? 'completed' : 'approved' });
  }
  expect(orders[11]).toMatchObject({ id: garbageOwner('door', 0), definitionId: 'door-wooden',
    location: { x: plan.doorOrder.x, y: plan.doorOrder.y }, edge: plan.doorOrder.edge,
    placementSequence: 2, state: built ? 'completed' : 'approved' });
  const objects = data.simulation?.objects?.placedObjects ?? [];
  expect(objects.filter(object => object.objectId !== 'object.waste-bin')).toEqual(GARBAGE_CAPACITY_OWNERS);
  expect(objects).toHaveLength(built ? 5 : 3);
  const bins = objects.filter(object => object.objectId === 'object.waste-bin');
  expect(bins).toHaveLength(built ? 2 : 0);
  if (built) for (const [ordinal, [x, y]] of plan.bins.entries()) {
    const id = garbageOwner('object', ordinal);
    expect(bins.filter(object => object.sourceOrderId === id), 'literal Garbage Room bin owner and orientation').toEqual([
      { placedObjectId: `object:${x}:${y}`, objectId: 'object.waste-bin', anchorTile: { x, y }, orientation: turns, sourceOrderId: id },
    ]);
    expect(orders[12 + ordinal]).toMatchObject({ id, definitionId: 'waste-bin-brick', location: { x, y }, state: 'completed' });
    expect(orders[12 + ordinal]!.objectOrientation ?? 0, 'literal Garbage Room typed producer orientation').toBe(turns);
  }
  const rooms = data.simulation?.prisoners.roomInstanceDefinitions.filter(room => room.roomCatalogId === 'room.garbage-room') ?? [];
  expect(rooms).toHaveLength(built ? 1 : 0);
  if (built) {
    expect(rooms).toMatchObject([{ roomCatalogId: 'room.garbage-room', anchorTile: { x: 5, y: 5 }, width: 2, height: 2 }]);
    expect(data.simulation?.economy?.treasury.balanceMinorUnits).toBe(20800);
    expect(data.simulation?.economy?.procurement.pending).toEqual([]);
    expect(data.construction.orders.every(order => order.state === 'completed')).toBe(true);
  }
}

interface NetworkCatalog { assetId: string; source: string; sourceSha256: string; resolutionPx: number[];
  nominalPixelsPerTile: number; pivotPx: number[]; cameraTargetTiles: number[];
  frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string }[] }

/** No synthetic fetch: bytes must originate from the actual renderer/loader.
 * Decoder rows come from the existing real HTMLImageElement/Blob observer. */
export async function observeGarbageNetwork(page: Page) {
  const decoded = await observeCotImages(page);
  const rows: { url: string; path: string; status: number; sha256?: string; location?: string; bytes?: number; error?: string }[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  page.on('response', response => {
    const path = decodeURIComponent(new URL(response.url()).pathname);
    if (path !== GARBAGE_ART.descriptor && !path.startsWith('/assets/environment/oblique/fixture.garbage-room.waste-bin-') && !/\/assets\/worker-[^/]+\.js$/.test(path)) return;
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
        await expect.poll(() => bodies.has(GARBAGE_ART.descriptor) && bodies.has(GARBAGE_ART.exposedFrame),
          { message: 'native Garbage Room consumer must request its descriptor and actual source60/elev40 frame' }).toBe(true);
      } finally { await Promise.all(pending); await writeFile(info.outputPath('garbage-room-actual-network.json'), JSON.stringify(rows, null, 2)); }
      expect(rows.filter(row => row.error !== undefined)).toEqual([]);
      for (const row of rows.filter(row => row.location !== undefined))
        expect(decodeURIComponent(new URL(row.location!, row.url).pathname)).toBe(row.path);
      const body = bodies.get(GARBAGE_ART.descriptor)!;
      const catalog = JSON.parse(body.toString('utf8')) as NetworkCatalog;
      expect(catalog).toMatchObject({ assetId: GARBAGE_ART.assetId, source: GARBAGE_ART.source,
        sourceSha256: GARBAGE_ART.sourceSha256, resolutionPx: [256, 256], nominalPixelsPerTile: 64,
        pivotPx: [128, 128], cameraTargetTiles: GARBAGE_ART.cameraTarget });
      expect(catalog.frames).toHaveLength(72);
      expect(catalog.frames.filter(frame => frame.yawDegrees === 60 && frame.elevationDegrees === 40)).toEqual([
        { yawDegrees: 60, elevationDegrees: 40, image: GARBAGE_ART.exposedFrame, sha256: GARBAGE_ART.exposedFrameSha256 },
      ]);
      const png = bodies.get(GARBAGE_ART.exposedFrame)!;
      expect(createHash('sha256').update(png).digest('hex')).toBe(GARBAGE_ART.exposedFrameSha256);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
      const images = await decoded();
      expect(images.errors).toEqual([]);
      expect(images.images.some(image => image.sha256 === GARBAGE_ART.exposedFrameSha256 && image.complete && !image.error && image.width === 256 && image.height === 256)).toBe(true);
      expect(rows.some(row => /\/assets\/worker-[^/]+\.js$/.test(row.path) && row.status === 200 && row.sha256 !== undefined)).toBe(true);
      const receipt = { quarterTurns, catalog, descriptorBodySha256: createHash('sha256').update(body).digest('hex'),
        exposedFrameSha256: GARBAGE_ART.exposedFrameSha256, network: rows, actualDecodedImages: images.images,
        syntheticFetchUsed: false, rendererTextureReadUsed: false, perBinVisualCalibrationComplete: false,
        visualAcceptancePending: true };
      await writeFile(info.outputPath('garbage-room-actual200-source60-elev40.png'), png);
      await writeFile(info.outputPath('garbage-room-actual-network-and-decoder-receipt.json'), JSON.stringify(receipt, null, 2));
      return receipt;
    },
  };
}
