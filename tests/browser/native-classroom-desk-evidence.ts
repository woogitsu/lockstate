import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { expect, type Page, type TestInfo } from './network-changed-fixture';
import { assertGarbageCapacity } from './native-garbage-room-evidence';
import { CLASSROOM_CASES, CLASSROOM_DESK, CLASSROOM_ORIGIN, CLASSROOM_PLAN, classroomOwner } from '../fixtures/native-classroom-desk-plan';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { observeCotImages } from './cell-cot-evidence';
import { CLASSROOM_ART, CLASSROOM_STUDENT_ART, CLASSROOM_BOOKSHELF_ART } from '../fixtures/native-classroom-desk-plan';

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
    if (path !== CLASSROOM_ART.descriptor && path !== CLASSROOM_STUDENT_ART.descriptor
      && path !== CLASSROOM_BOOKSHELF_ART.descriptor
      && !path.startsWith('/assets/environment/oblique/furniture.classroom.teacher-desk-')
      && !path.startsWith('/assets/environment/oblique/furniture.classroom.student-chair-')
      && !path.startsWith('/assets/environment/oblique/furniture.library.bookshelf.variants-')
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
      const studentFrame = CLASSROOM_STUDENT_ART.frames[quarterTurns];
      const bookshelfFrame = CLASSROOM_BOOKSHELF_ART.frames[quarterTurns];
      try {
        await expect.poll(() => bodies.has(CLASSROOM_ART.descriptor) && bodies.has(CLASSROOM_ART.exposedFrame)
          && bodies.has(CLASSROOM_STUDENT_ART.descriptor) && bodies.has(studentFrame.image)
          && bodies.has(CLASSROOM_BOOKSHELF_ART.descriptor) && bodies.has(bookshelfFrame.image),
          { message: 'actual combined Classroom consumers must deliver all three correctly oriented source frames' }).toBe(true);
      } finally { await Promise.all(pending); await writeFile(info.outputPath('classroom-desk-actual-network.json'), JSON.stringify(rows, null, 2)); }
      expect(rows.filter(row => row.error !== undefined)).toEqual([]);
      for (const row of rows.filter(row => row.location !== undefined))
        expect(decodeURIComponent(new URL(row.location!, row.url).pathname)).toBe(row.path);
      const body = bodies.get(CLASSROOM_ART.descriptor)!;
      expect(createHash('sha256').update(body.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')).toBe(CLASSROOM_ART.descriptorCanonicalLfSha256);
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
      const studentBody = bodies.get(CLASSROOM_STUDENT_ART.descriptor)!;
      expect(createHash('sha256').update(studentBody.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')).toBe(CLASSROOM_STUDENT_ART.descriptorCanonicalLfSha256);
      const studentCatalog = JSON.parse(studentBody.toString('utf8')) as NetworkCatalog;
      expect(studentCatalog).toMatchObject({ assetId: CLASSROOM_STUDENT_ART.assetId,
        source: CLASSROOM_STUDENT_ART.source, sourceSha256: CLASSROOM_STUDENT_ART.sourceSha256,
        resolutionPx: [256, 256], nominalPixelsPerTile: 64, pivotPx: [128, 128], cameraTargetTiles: CLASSROOM_STUDENT_ART.cameraTarget });
      expect(studentCatalog.frames).toHaveLength(72);
      expect(studentCatalog.frames.filter(frame => frame.yawDegrees === studentFrame.yawDegrees && frame.elevationDegrees === 40)).toEqual([studentFrame]);
      const studentPng = bodies.get(studentFrame.image)!;
      expect(createHash('sha256').update(studentPng).digest('hex')).toBe(studentFrame.sha256);
      expect(studentPng.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([studentPng.readUInt32BE(16), studentPng.readUInt32BE(20)]).toEqual([256, 256]);
      expect(images.images.some(image => image.sha256 === studentFrame.sha256 && image.complete && !image.error && image.width === 256 && image.height === 256)).toBe(true);
      const bookshelfBody = bodies.get(CLASSROOM_BOOKSHELF_ART.descriptor)!;
      expect(createHash('sha256').update(bookshelfBody.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')).toBe(CLASSROOM_BOOKSHELF_ART.descriptorCanonicalLfSha256);
      const bookshelfCatalog = JSON.parse(bookshelfBody.toString('utf8')) as NetworkCatalog;
      expect(bookshelfCatalog).toMatchObject({ assetId: CLASSROOM_BOOKSHELF_ART.assetId,
        source: CLASSROOM_BOOKSHELF_ART.source, sourceSha256: CLASSROOM_BOOKSHELF_ART.sourceSha256,
        resolutionPx: [256, 256], nominalPixelsPerTile: 64, pivotPx: [128, 128], cameraTargetTiles: CLASSROOM_BOOKSHELF_ART.cameraTarget });
      expect(bookshelfCatalog.frames).toHaveLength(72);
      expect(bookshelfCatalog.frames.filter(frame => frame.yawDegrees === bookshelfFrame.yawDegrees && frame.elevationDegrees === 40)).toEqual([bookshelfFrame]);
      const bookshelfPng = bodies.get(bookshelfFrame.image)!;
      expect(createHash('sha256').update(bookshelfPng).digest('hex')).toBe(bookshelfFrame.sha256);
      expect(bookshelfPng.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([bookshelfPng.readUInt32BE(16), bookshelfPng.readUInt32BE(20)]).toEqual([256, 256]);
      expect(images.images.some(image => image.sha256 === bookshelfFrame.sha256 && image.complete && !image.error && image.width === 256 && image.height === 256)).toBe(true);
      expect(rows.some(row => /\/assets\/worker-[^/]+\.js$/.test(row.path) && row.status === 200 && row.sha256 !== undefined)).toBe(true);
      const receipt = { classroomPlanQuarterTurns: quarterTurns, publicIndividualDeskOrientation: 0, catalog, descriptorBodySha256: createHash('sha256').update(body).digest('hex'),
        studentCatalog, studentDescriptorBodySha256: createHash('sha256').update(studentBody).digest('hex'), studentFrame,
        bookshelfCatalog, bookshelfDescriptorBodySha256: createHash('sha256').update(bookshelfBody).digest('hex'), bookshelfFrame,
        descriptorCanonicalLfSha256: CLASSROOM_ART.descriptorCanonicalLfSha256,
        studentDescriptorCanonicalLfSha256: CLASSROOM_STUDENT_ART.descriptorCanonicalLfSha256,
        bookshelfDescriptorCanonicalLfSha256: CLASSROOM_BOOKSHELF_ART.descriptorCanonicalLfSha256,
        publicRouteExpectedWorldCameraDegrees: [60, 45], selectedSourceElevationDegrees: 40,
        roomOwnedObjectOrientation: quarterTurns,
        exposedFrameSha256: CLASSROOM_ART.exposedFrameSha256, network: rows, actualDecodedImages: images.images,
        syntheticFetchUsed: false, rendererTextureReadUsed: false, deskVisualCalibrationComplete: false,
        visualAcceptancePending: true };
      await writeFile(info.outputPath('classroom-desk-actual200-source60-elev40.png'), png);
      await writeFile(info.outputPath('classroom-student-chair-actual200-frame.png'), studentPng);
      await writeFile(info.outputPath('classroom-bookshelf-actual200-frame.png'), bookshelfPng);
      await writeFile(info.outputPath('classroom-desk-actual-network-and-decoder-receipt.json'), JSON.stringify(receipt, null, 2));
      return receipt;
    },
  };
}
