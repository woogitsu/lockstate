import { createHash } from 'node:crypto';
import { expect, type Page } from './network-changed-fixture';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import type { BuildOrder } from '../../src/simulation/construction/build-order';

export const HEADBOARD_FRAME = {
  url: '/assets/environment/oblique/furniture.cell.cot.single-yaw+60-elev40.a1ad40038e9e.png',
  sha256: 'a1ad40038e9ea5a0f8710fbc8ac3cca8c1ae513eaabc28aa2dfada4a4405dbb1',
};

interface LoadedImage {
  assignedSrc: string; currentSrc: string; complete: boolean;
  width: number; height: number; sha256?: string; error: boolean;
}
interface ImageProbe { read(): Promise<LoadedImage[]> }

// Client observer: decode exactly the loader's real Blob, and keep its
// actual HTMLImageElement load result. No replacement image/bitmap or verdict.
export async function observeCotImages(page: Page) {
  const responses: { url: string; status: number; sha256: string; width: number; height: number }[] = [];
  const descriptors: { url: string; status: number; data: unknown }[] = [];
  const errors: string[] = [];
  const pendingResponses: Promise<void>[] = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/game-content/oblique-furniture.cell-cot.v1.json') {
      pendingResponses.push(response.json().then(data => {
        descriptors.push({ url: response.url(), status: response.status(), data: data as unknown });
      }).catch(error => { errors.push(String(error)); }));
      return;
    }
    if (!response.url().includes('/assets/environment/oblique/furniture.cell.cot.single-')) return;
    pendingResponses.push((async () => {
      const bytes = await response.body();
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
        if (hash !== undefined || value.includes('/assets/environment/oblique/furniture.cell.cot.single-')) {
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
    Reflect.set(window, 'cotLoadedImages', { async read() { await Promise.all(pending); return rows; } } satisfies ImageProbe);
  });
  return async () => {
    await Promise.all(pendingResponses);
    const images = await page.evaluate(() => (Reflect.get(window, 'cotLoadedImages') as ImageProbe).read());
    return { responses, images, descriptors, errors };
  };
}

export function requireCotOwner(snapshot: SessionSnapshotBundle, quarterTurns: 0 | 1, sequence: number) {
  // Independent authored Basic Cell: origin20,5, bed local1,1, physical1x2.
  // Clockwise90 maps its minimum corner to24,6 and swaps it to2x1.
  const [x, y] = quarterTurns === 0 ? [21, 6] : [24, 6];
  const owner = { placedObjectId: `object:${x}:${y}`, objectId: 'object.bed',
    anchorTile: { x, y }, orientation: quarterTurns,
    sourceOrderId: `room-template-${String(sequence).padStart(12, '0')}-2-object-000` };
  expect(snapshot.simulation?.objects?.placedObjects.filter(row => row.objectId === 'object.bed')).toEqual([owner]);
  const expectedOrder = { id: owner.sourceOrderId, definitionId: 'bed-wooden',
    state: 'completed', placementSequence: sequence,
    ...(quarterTurns === 0 ? {} : { objectOrientation: quarterTurns }),
  } satisfies Pick<BuildOrder, 'id' | 'definitionId' | 'state' | 'placementSequence' | 'objectOrientation'>;
  expect(snapshot.construction.orders.find(order => order.id === owner.sourceOrderId))
    .toMatchObject({ ...expectedOrder, location: owner.anchorTile });
  expect(snapshot.simulation?.roomTemplates?.completed).toContainEqual({
    templateId: 'cell-basic', origin: { x: 20, y: 5 }, mirrorX: false, sequence,
    ...(quarterTurns === 0 ? {} : { quarterTurns }),
  });
  return owner;
}

// Preserve the existing calibrated blanket captures first. Actual buttons then
// compose local60/40: camera60 for q0, camera-30(normalized330) for q1 +90.
// Lower3 reaches the existing20-degree clamp; Raise2 reaches40 exactly.
export async function publicHeadboardPose(page: Page, quarterTurns: 0 | 1) {
  const yawClicks = quarterTurns === 0 ? 7 : 1;
  for (let index = 0; index < yawClicks; index++) {
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  }
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'Lower camera angle', exact: true }).click();
  }
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Raise camera angle', exact: true }).click();
  }
  return { expectedInitialCameraDegrees: { yaw: -45, elevation: 45 },
    yawLabel: 'Rotate camera right', yawClicks, lowerClicks: 3, raiseClicks: 2,
    expectedCameraDegrees: { yaw: quarterTurns === 0 ? 60 : -30, elevation: 40 },
    expectedNormalizedCameraYaw: quarterTurns === 0 ? 60 : 330,
    expectedAuthoredDegrees: { yaw: 60, elevation: 40 },
    nativePoseObserved: false, nativeHeadboardPixelCalibrationPending: true };
}
