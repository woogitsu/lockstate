import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { expect, type Page, type TestInfo } from './network-changed-fixture';
import { assertGarbageCapacity } from './native-garbage-room-evidence';
import { CLASSROOM_CASES, CLASSROOM_DESK, CLASSROOM_ORIGIN, CLASSROOM_PLAN, classroomOwner } from '../fixtures/native-classroom-desk-plan';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { observeCotImages } from './cell-cot-evidence';
import { CLASSROOM_ART } from '../fixtures/native-classroom-desk-plan';

/** Literal typed/public UI oracle, read-only worker and real network evidence. */

// Same completed Storage/Delivery route already proved independently.
export const assertClassroomCapacity = assertGarbageCapacity;

export function assertClassroomPlan(data: SessionSnapshotBundle, turns: 0 | 1, built: boolean, deskOwner?: string): void {
  const plan = CLASSROOM_CASES[turns];
  const identity = { templateId: CLASSROOM_PLAN.templateId, origin: CLASSROOM_ORIGIN,
    sequence: 2, mirrorX: false, ...(turns === 0 ? {} : { quarterTurns: turns }) };
  expect(data.simulation?.roomTemplates?.pending).toEqual(built ? [] : [identity]);
  expect(data.simulation?.roomTemplates?.completed).toEqual([
    { templateId: 'storage-room-basic', origin: { x: 12, y: 18 }, mirrorX: false, sequence: 0 },
    { templateId: 'delivery-bay-basic', origin: { x: 20, y: 18 }, mirrorX: false, sequence: 1 },
    ...(built ? [identity] : []),
  ]);
  expect(data.construction.orders).toHaveLength(built ? (deskOwner === undefined ? 68 : 69) : 63);
  const orders = data.construction.orders.filter(order => order.placementSequence === 2);
  expect(orders).toHaveLength(built ? 29 : 24);
  for (const [ordinal, [x, y]] of plan.walls.entries()) expect(orders[ordinal]).toMatchObject({
    id: classroomOwner('wall', ordinal), definitionId: 'wall-brick', location: { x, y },
    footprint: 'square', placementSequence: 2, state: built ? 'completed' : 'approved',
  });
  expect(orders[23]).toMatchObject({ id: classroomOwner('door', 0), definitionId: 'door-wooden',
    location: { x: plan.doorOrder.x, y: plan.doorOrder.y }, edge: plan.doorOrder.edge, state: built ? 'completed' : 'approved' });
  const objects = data.simulation?.objects?.placedObjects ?? [];
  expect(objects.filter(object => object.sourceOrderId?.startsWith('room-template-000000000002-'))).toHaveLength(built ? 5 : 0);
  expect(objects).toHaveLength(built ? (deskOwner === undefined ? 8 : 9) : 3);
  if (built) for (const [ordinal, [objectId, definitionId, x, y]] of plan.objects.entries()) {
    const sourceOrderId = classroomOwner('object', ordinal);
    expect(objects.filter(object => object.sourceOrderId === sourceOrderId)).toEqual([
      { placedObjectId: `object:${x}:${y}`, objectId, anchorTile: { x, y }, orientation: turns, sourceOrderId },
    ]);
    expect(orders[24 + ordinal]).toMatchObject({ id: sourceOrderId, definitionId, location: { x, y }, state: 'completed' });
    expect(orders[24 + ordinal]!.objectOrientation ?? 0).toBe(turns);
  }
  if (deskOwner === undefined) expect(objects.filter(object => object.objectId === 'object.desk')).toEqual([]);
  const rooms = data.simulation?.prisoners.roomInstanceDefinitions.filter(room => room.roomCatalogId === 'room.classroom') ?? [];
  expect(rooms).toHaveLength(built ? 1 : 0);
  if (built) {
    expect(rooms).toMatchObject([{ roomCatalogId: 'room.classroom', anchorTile: { x: 5, y: 5 }, width: 5, height: 5 }]);
    expect(data.simulation?.economy?.treasury.balanceMinorUnits).toBe(deskOwner === undefined ? 19530 : 19400);
    expect(data.simulation?.economy?.procurement.pending).toEqual([]);
    expect(data.construction.orders.every(order => order.state === 'completed')).toBe(true);
  }
}

export function assertClassroomDesk(data: SessionSnapshotBundle, turns: 0 | 1, owner: string): void {
  const { desk } = CLASSROOM_CASES[turns];
  expect(owner.length).toBeGreaterThan(0);
  expect(owner.startsWith('room-template-')).toBe(false);
  expect(data.construction.orders).toHaveLength(69);
  expect(data.construction.orders.every(order => order.state === 'completed')).toBe(true);
  expect(data.simulation?.objects?.placedObjects).toHaveLength(9);
  expect(data.simulation?.objects?.placedObjects.filter(object => object.objectId === CLASSROOM_DESK.objectId)).toEqual([
    { placedObjectId: `object:${desk.x}:${desk.y}`, objectId: 'object.desk', anchorTile: desk, orientation: 0, sourceOrderId: owner },
  ]);
  const order = data.construction.orders.find(value => value.id === owner)!;
  expect(order).toMatchObject({ id: owner, definitionId: 'desk-wooden', location: desk,
    state: 'completed', progress: 60, materialsAllocated: CLASSROOM_DESK.materials });
  expect(order.objectOrientation ?? 0, 'public individual desk orientation remains zero').toBe(0);
  expect(data.simulation?.economy?.treasury.balanceMinorUnits).toBe(19400);
  expect(data.simulation?.economy?.procurement.pending).toEqual([]);
  expect(data.simulation?.roomTemplates?.pending).toEqual([]);
  expect(data.simulation?.roomTemplates?.completed).toHaveLength(3);
  assertClassroomPlan(data, turns, true, owner);
}

interface NetworkCatalog { assetId: string; source: string; sourceSha256: string; resolutionPx: number[];
  nominalPixelsPerTile: number; pivotPx: number[]; cameraTargetTiles: number[];
  frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string }[] }

/** No synthetic fetch: bytes must originate from the actual renderer/loader.
 * Decoder rows come from the existing real HTMLImageElement/Blob observer. */
export async function observeClassroomDeskNetwork(page: Page) {
  const decoded = await observeCotImages(page);
  const rows: { url: string; path: string; status: number; sha256?: string; location?: string; bytes?: number; error?: string }[] = [];
  const bodies = new Map<string, Buffer>();
  const pending = new Set<Promise<void>>();
  page.on('response', response => {
    const path = decodeURIComponent(new URL(response.url()).pathname);
    if (path !== CLASSROOM_ART.descriptor && !path.startsWith('/assets/environment/oblique/furniture.classroom.teacher-desk-') && !/\/assets\/worker-[^/]+\.js$/.test(path)) return;
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
        await expect.poll(() => bodies.has(CLASSROOM_ART.descriptor) && bodies.has(CLASSROOM_ART.exposedFrame),
          { message: 'native Classroom teacher desk consumer must request its descriptor and actual source60/elev40 frame' }).toBe(true);
      } finally { await Promise.all(pending); await writeFile(info.outputPath('classroom-desk-actual-network.json'), JSON.stringify(rows, null, 2)); }
      expect(rows.filter(row => row.error !== undefined)).toEqual([]);
      for (const row of rows.filter(row => row.location !== undefined))
        expect(decodeURIComponent(new URL(row.location!, row.url).pathname)).toBe(row.path);
      const body = bodies.get(CLASSROOM_ART.descriptor)!;
      const catalog = JSON.parse(body.toString('utf8')) as NetworkCatalog;
      expect(catalog).toMatchObject({ assetId: CLASSROOM_ART.assetId, source: CLASSROOM_ART.source,
        sourceSha256: CLASSROOM_ART.sourceSha256, resolutionPx: [256, 256], nominalPixelsPerTile: 64,
        pivotPx: [128, 128], cameraTargetTiles: CLASSROOM_ART.cameraTarget });
      expect(catalog.frames).toHaveLength(72);
      expect(catalog.frames.filter(frame => frame.yawDegrees === 60 && frame.elevationDegrees === 40)).toEqual([
        { yawDegrees: 60, elevationDegrees: 40, image: CLASSROOM_ART.exposedFrame, sha256: CLASSROOM_ART.exposedFrameSha256 },
      ]);
      const png = bodies.get(CLASSROOM_ART.exposedFrame)!;
      expect(createHash('sha256').update(png).digest('hex')).toBe(CLASSROOM_ART.exposedFrameSha256);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
      const images = await decoded();
      expect(images.errors).toEqual([]);
      expect(images.images.some(image => image.sha256 === CLASSROOM_ART.exposedFrameSha256 && image.complete && !image.error && image.width === 256 && image.height === 256)).toBe(true);
      expect(rows.some(row => /\/assets\/worker-[^/]+\.js$/.test(row.path) && row.status === 200 && row.sha256 !== undefined)).toBe(true);
      const receipt = { classroomPlanQuarterTurns: quarterTurns, publicIndividualDeskOrientation: 0, catalog, descriptorBodySha256: createHash('sha256').update(body).digest('hex'),
        exposedFrameSha256: CLASSROOM_ART.exposedFrameSha256, network: rows, actualDecodedImages: images.images,
        syntheticFetchUsed: false, rendererTextureReadUsed: false, deskVisualCalibrationComplete: false,
        visualAcceptancePending: true };
      await writeFile(info.outputPath('classroom-desk-actual200-source60-elev40.png'), png);
      await writeFile(info.outputPath('classroom-desk-actual-network-and-decoder-receipt.json'), JSON.stringify(receipt, null, 2));
      return receipt;
    },
  };
}
