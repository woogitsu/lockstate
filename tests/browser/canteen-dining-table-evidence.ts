import { openCameraControls } from './public-camera-controls';
import { createHash } from 'node:crypto';
import pins from './canteen-modern-source-pins.json' with { type: 'json' };
import type { BuildOrder } from '../../src/simulation/construction/build-order';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { expect, type Page } from './network-changed-fixture';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

export const SUPPORT_FRAME = {
  url: '/assets/environment/oblique/furniture.dining.table.wooden-yaw+60-elev40.035429e3f502.png',
  sha256: '035429e3f5027d77cec5224b1a8edd9ef19a2ad07ab3b315327599486006b2c0',
};

export const CANTEEN_BENCH_FRAME = {
  url: '/assets/environment/oblique/furniture.corridor.bench.variants-yaw+60-elev40.5ad7afdb520e.png',
  sha256: '5ad7afdb520ed6cb58c5dd87e652a5e7165d7095d593b48708f40746bc90ac8f',
};
export const TABLE_SOURCE_SHA256 = '4f92eb8cebdb7f5d343f5ca49869c317535867932f05ab805bbd33b60144728f';

interface LoadedImage {
  assignedSrc: string; currentSrc: string; complete: boolean;
  width: number; height: number; sha256?: string; error: boolean;
}
interface ImageProbe { read(): Promise<LoadedImage[]> }

// Built-client observer: decode exactly the loader's real Blob, and keep its
// actual HTMLImageElement load result. No replacement image/bitmap or verdict.
export async function observeCanteenImages(page: Page) {
  const catalogs: { url: string; status: number; sha256: string; catalog: unknown }[] = [];
  const responses: { url: string; status: number; sha256: string; width: number; height: number }[] = [];
  const errors: string[] = [];
  const redirects: { url: string; status: number; location: string | undefined }[] = [];
  const pendingResponses: Promise<void>[] = [];
  page.on('response', response => {
    const decodedPath = decodeURIComponent(new URL(response.url()).pathname);
    const catalogKind = decodedPath === '/game-content/oblique-furniture.canteen-dining-table.v1.json' ? 'table'
      : decodedPath === '/game-content/oblique-canteen-bench.v1.json' ? 'bench' : undefined;
    if (catalogKind === undefined && !decodedPath.startsWith('/assets/environment/oblique/furniture.dining.table.wooden-')
        && !decodedPath.startsWith('/assets/environment/oblique/furniture.corridor.bench.variants-')) return;
    if (response.status() >= 300 && response.status() < 400) {
      redirects.push({ url: response.url(), status: response.status(), location: response.headers().location });
      return;
    }
    pendingResponses.push((async () => {
      expect(response.status(), 'terminal canonical PNG response').toBe(200);
      const bytes = await response.body();
      if (catalogKind !== undefined) {
        const catalog: unknown = JSON.parse(bytes.toString('utf8'));
        expect(catalog, 'actual HTTP descriptor retains all72 literal published source/frame pins').toEqual(pins[catalogKind]);
        catalogs.push({ url: response.url(), status: response.status(), sha256: createHash('sha256').update(bytes).digest('hex'), catalog });
        return;
      }
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      responses.push({ url: response.url(), status: response.status(),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    })().catch(error => { errors.push(String(error)); }));
  });
  await page.addInitScript(() => {
    const blobHashes = new Map<string, Promise<string>>();
    const rows: LoadedImage[] = [];
    const pending: Promise<void>[] = [];
    const create = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      if (blob instanceof Blob && blob.type === 'image/png') {
        blobHashes.set(url, blob.arrayBuffer().then(bytes => crypto.subtle.digest('SHA-256', bytes))
          .then(hash => [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')));
      }
      return url;
    };
    const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...source,
      set(this: HTMLImageElement, value: string) {
        const hash = blobHashes.get(value);
        if (hash !== undefined || value.includes('/assets/environment/oblique/furniture.dining.table.wooden-')) {
          const capture = (error: boolean) => {
            const row: LoadedImage = { assignedSrc: value, currentSrc: this.currentSrc, complete: this.complete,
              width: this.naturalWidth, height: this.naturalHeight, error };
            rows.push(row);
            if (hash !== undefined) pending.push(hash.then(sha256 => { row.sha256 = sha256; }));
          };
          this.addEventListener('load', () => capture(false), { once: true });
          this.addEventListener('error', () => capture(true), { once: true });
        }
        source.set!.call(this, value);
      },
    });
    Reflect.set(window, 'canteenLoadedImages', { async read() { await Promise.all(pending); return rows; } } satisfies ImageProbe);
  });
  return async () => {
    await Promise.all(pendingResponses);
    const images = await page.evaluate(() => (Reflect.get(window, 'canteenLoadedImages') as ImageProbe).read());
    return { responses, images, catalogs, errors, redirects };
  };
}

export function requireCanteenOwners(snapshot: SessionSnapshotBundle, quarterTurns: 0 | 1, sequence: number) {
  const anchors = quarterTurns === 0 ? [[21, 6], [24, 6]] : [[25, 6], [25, 9]];
  const tables = anchors.map(([x, y], index) => ({
    placedObjectId: `object:${x}:${y}`, objectId: 'object.dining-table',
    anchorTile: { x, y }, orientation: quarterTurns,
    sourceOrderId: `room-template-${String(sequence).padStart(12, '0')}-2-object-${String(index).padStart(3, '0')}`,
  }));
  const benchAnchors = quarterTurns === 0 ? [[21, 8], [24, 8], [21, 10], [24, 10]]
    : [[24, 6], [24, 9], [22, 6], [22, 9]];
  const benches = benchAnchors.map(([x, y], index) => ({
    placedObjectId: `object:${x}:${y}`, objectId: 'object.bench', anchorTile: { x, y }, orientation: quarterTurns,
    sourceOrderId: `room-template-${String(sequence).padStart(12, '0')}-2-object-${String(index + 2).padStart(3, '0')}`,
  }));
  const owners = [...tables, ...benches];
  expect(snapshot.simulation?.objects?.placedObjects.filter(row => row.objectId === 'object.dining-table')).toEqual(tables);
  // Snapshot enumeration is y/x order; authored suffix order is different at q1.
  // Keep the explicit owner association above, then compare canonical rows.
  const orderedBenches = [...benches].sort((a, b) => a.anchorTile.y! - b.anchorTile.y! || a.anchorTile.x! - b.anchorTile.x!);
  expect(snapshot.simulation?.objects?.placedObjects.filter(row => row.objectId === 'object.bench')).toEqual(orderedBenches);
  expect(new Set(owners.map(owner => owner.sourceOrderId)).size).toBe(6);
  for (const owner of owners) {
    const matchingOrders = snapshot.construction.orders.filter(order => order.id === owner.sourceOrderId);
    expect(matchingOrders).toHaveLength(1);
    const expectedOrder: Pick<BuildOrder, 'id' | 'definitionId' | 'location' | 'state' | 'placementSequence'> = {
      id: owner.sourceOrderId, definitionId: owner.objectId === 'object.bench' ? 'bench-wooden' : 'dining-table-wooden',
      location: { x: tileCoordinate(owner.anchorTile.x!), y: tileCoordinate(owner.anchorTile.y!) },
      state: 'completed', placementSequence: sequence,
    };
    expect(matchingOrders[0]).toMatchObject({
      ...expectedOrder,
      ...(quarterTurns === 0 ? {} : { objectOrientation: quarterTurns }),
    });
  }
  expect(snapshot.simulation?.roomTemplates?.completed).toContainEqual({
    templateId: 'canteen-basic', origin: { x: 20, y: 5 }, mirrorX: false, sequence,
    ...(quarterTurns === 0 ? {} : { quarterTurns }),
  });
  return owners;
}

// Original calibrated plate captures stay at their original camera pose.
// Genuine public controls then expose local authored60/e40 on both objects:
// asset yaw = camera yaw + orientation*90, so q1 needs camera -30.
export async function publicSupportPose(page: Page, quarterTurns: 0 | 1) {
  const yawClicks = quarterTurns === 0 ? 7 : 1;
  await openCameraControls(page);
  for (let index = 0; index < yawClicks; index++) {
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  }
  // Actual native right-button drag:45 -17*.005 radians =40.129859deg.
  await page.mouse.move(1200, 650);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(1200, 667, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  return { expectedInitialCameraDegrees: { yaw: -45, elevation: 45 }, yawClicks,
    rightButtonDragFrom: [1200, 650], rightButtonDragTo: [1200, 667],
    expectedCameraDegrees: { yaw: quarterTurns === 0 ? 60 : -30, elevation: 45 - 17 * .005 * 180 / Math.PI },
    expectedAuthoredDegrees: { yaw: 60, elevation: 40 },
    nativePoseObserved: false, nativeHardwarePixelCalibrationPending: true };
}
