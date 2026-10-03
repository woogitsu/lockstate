import { createHash } from 'node:crypto';
import { expect, type Page } from './network-changed-fixture';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

export const SUPPORT_FRAME = {
  url: '/assets/environment/oblique/furniture.dining.table.wooden-yaw+120-elev20.cc16b4c5a2db.png',
  sha256: 'cc16b4c5a2dbacd069ffd249b8536b8c9b01f9191b528b0063f640af49ef2b58',
};

interface LoadedImage {
  assignedSrc: string; currentSrc: string; complete: boolean;
  width: number; height: number; sha256?: string; error: boolean;
}
interface ImageProbe { read(): Promise<LoadedImage[]> }

// Built-client observer: decode exactly the loader's real Blob, and keep its
// actual HTMLImageElement load result. No replacement image/bitmap or verdict.
export async function observeCanteenImages(page: Page) {
  const responses: { url: string; status: number; sha256: string; width: number; height: number }[] = [];
  const errors: string[] = [];
  const redirects: { url: string; status: number; location: string | undefined }[] = [];
  const pendingResponses: Promise<void>[] = [];
  page.on('response', response => {
    if (!response.url().includes('/assets/environment/oblique/furniture.dining.table.wooden-')) return;
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
    return { responses, images, errors, redirects };
  };
}

export function requireCanteenOwners(snapshot: SessionSnapshotBundle, quarterTurns: 0 | 1, sequence: number) {
  const anchors = quarterTurns === 0 ? [[21, 6], [24, 6]] : [[25, 6], [25, 9]];
  const owners = anchors.map(([x, y], index) => ({
    placedObjectId: `object:${x}:${y}`, objectId: 'object.dining-table',
    anchorTile: { x, y }, orientation: quarterTurns,
    sourceOrderId: `room-template-${String(sequence).padStart(12, '0')}-2-object-${String(index).padStart(3, '0')}`,
  }));
  expect(snapshot.simulation?.objects?.placedObjects.filter(row => row.objectId === 'object.dining-table'))
    .toEqual(owners);
  for (const owner of owners) {
    expect(snapshot.construction.orders.find(order => order.id === owner.sourceOrderId)).toMatchObject({
      id: owner.sourceOrderId, definitionId: 'dining-table-wooden', location: owner.anchorTile,
      state: 'completed', placementSequence: sequence,
      ...(quarterTurns === 0 ? {} : { objectOrientation: quarterTurns }),
    });
  }
  expect(snapshot.simulation?.roomTemplates?.completed).toContainEqual({
    templateId: 'canteen-basic', origin: { x: 20, y: 5 }, mirrorX: false, sequence,
    ...(quarterTurns === 0 ? {} : { quarterTurns }),
  });
  return owners;
}

// The original calibrated plate capture is left at its original camera pose.
// Afterwards real labelled controls reach local authored yaw120/elevation20:
// objectArtYaw = cameraYaw + orientation*90, so q1 needs camera30, not210.
export async function publicSupportPose(page: Page, quarterTurns: 0 | 1) {
  const yawClicks = quarterTurns === 0 ? 11 : 5; // genuine initial yaw -45, steps +15
  for (let index = 0; index < yawClicks; index++) {
    await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
  }
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'Lower camera angle', exact: true }).click();
  }
  return { expectedInitialCameraDegrees: { yaw: -45, elevation: 45 }, yawClicks, tiltClicks: 3,
    expectedCameraDegrees: { yaw: quarterTurns === 0 ? 120 : 30, elevation: 20 },
    expectedAuthoredDegrees: { yaw: 120, elevation: 20 },
    nativePoseObserved: false, nativeHardwarePixelCalibrationPending: true };
}
