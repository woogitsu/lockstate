import { createHash } from 'node:crypto';
import { openCameraControls } from './public-camera-controls';
import { expect, type Page } from './network-changed-fixture';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import type { BuildOrder } from '../../src/simulation/construction/build-order';

export const GRIP_FRAME = {
  url: '/assets/environment/oblique/utility.washing-machine.variants-yaw+00-elev40.81846d5805cb.png',
  sha256: '81846d5805cb0c9f932bf1918741b87abd37dd08196d6c5649118a7ffeba966f',
};

interface LoadedImage {
  assignedSrc: string; currentSrc: string; complete: boolean;
  width: number; height: number; sha256?: string; error: boolean;
}
interface ImageProbe { read(): Promise<LoadedImage[]> }

// Built-client observer: decode exactly the loader's real Blob, and keep its
// actual HTMLImageElement load result. No replacement image/bitmap or verdict.
export async function observeWasherImages(page: Page) {
  const responses: { url: string; status: number; sha256: string; width: number; height: number }[] = [];
  const descriptors: { url: string; status: number; data: unknown }[] = [];
  const errors: string[] = [];
  const redirects: { url: string; status: number; location: string | undefined }[] = [];
  const pendingResponses: Promise<void>[] = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/game-content/oblique-utility.washing-machine.v1.json') {
      pendingResponses.push(response.json().then(data => {
        descriptors.push({ url: response.url(), status: response.status(), data: data as unknown });
      }).catch(error => { errors.push(String(error)); }));
      return;
    }
    if (!response.url().includes('/assets/environment/oblique/utility.washing-machine.variants-')) return;
    if (response.status() >= 300 && response.status() < 400) {
      redirects.push({ url: response.url(), status: response.status(), location: response.headers().location });
      return;
    }
    pendingResponses.push((async () => {
      expect(response.status(), 'terminal canonical PNG response').toBe(200);
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
        if (hash !== undefined || value.includes('/assets/environment/oblique/utility.washing-machine.variants-')) {
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
    Reflect.set(window, 'washerLoadedImages', { async read() { await Promise.all(pending); return rows; } } satisfies ImageProbe);
  });
  return async () => {
    await Promise.all(pendingResponses);
    const images = await page.evaluate(() => (Reflect.get(window, 'washerLoadedImages') as ImageProbe).read());
    return { responses, images, descriptors, errors, redirects };
  };
}

export function requireWasherOwners(snapshot: SessionSnapshotBundle, quarterTurns: 0 | 1, sequence: number) {
  const anchors = quarterTurns === 0 ? [[21, 6], [23, 6]] : [[24, 6], [24, 8]];
  const owners = anchors.map(([x, y], index) => ({
    placedObjectId: `object:${x}:${y}`, objectId: 'object.washing-machine',
    anchorTile: { x, y }, orientation: quarterTurns,
    sourceOrderId: `room-template-${String(sequence).padStart(12, '0')}-2-object-${String(index).padStart(3, '0')}`,
  }));
  expect(snapshot.simulation?.objects?.placedObjects.filter(row => row.objectId === 'object.washing-machine'))
    .toEqual(owners);
  for (const owner of owners) {
    const expectedOrder = {
      id: owner.sourceOrderId, definitionId: 'washing-machine-brick',
      state: 'completed', placementSequence: sequence,
      ...(quarterTurns === 0 ? {} : { objectOrientation: quarterTurns }),
    } satisfies Pick<BuildOrder, 'id' | 'definitionId' | 'state' | 'placementSequence' | 'objectOrientation'>;
    expect(snapshot.construction.orders.find(order => order.id === owner.sourceOrderId))
      .toMatchObject({ ...expectedOrder, location: owner.anchorTile });
  }
  expect(snapshot.simulation?.roomTemplates?.completed).toContainEqual({
    templateId: 'laundry-basic', origin: { x: 20, y: 5 }, mirrorX: false, sequence,
    ...(quarterTurns === 0 ? {} : { quarterTurns }),
  });
  return owners;
}

// Original glass palette capture stays at its calibrated camera. Afterwards
// actual buttons reach source local0/40 using the existing20-degree clamp:
// camera0 for q0, camera-90 (normalized270) for q1, plus orientation*90.
export async function publicGripPose(page: Page, quarterTurns: 0 | 1) {
  await openCameraControls(page);
  const yawLabel = quarterTurns === 0 ? 'Rotate camera right' : 'Rotate camera left';
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: yawLabel, exact: true }).click();
  }
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'Lower camera angle', exact: true }).click();
  }
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Raise camera angle', exact: true }).click();
  }
  return { expectedInitialCameraDegrees: { yaw: -45, elevation: 45 },
    yawLabel, yawClicks: 3, lowerClicks: 3, raiseClicks: 2,
    expectedCameraDegrees: { yaw: quarterTurns === 0 ? 0 : -90, elevation: 40 },
    expectedNormalizedCameraYaw: quarterTurns === 0 ? 0 : 270,
    expectedAuthoredDegrees: { yaw: 0, elevation: 40 },
    nativePoseObserved: false, nativeGripPixelCalibrationPending: true };
}
