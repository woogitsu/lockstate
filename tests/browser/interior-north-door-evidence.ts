import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import type { TestInfo } from '@playwright/test';
import { expect, type Page } from './network-changed-fixture';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';

export const NORTH_DOOR_BACKSIDE_FRAMES = [
  { cameraYaw: 135, sourceYaw: 135, rightClicks: 12,
    url: '/assets/environment/oblique/cell-door-open-yaw+135-elev45.1c1f8e0b7cbe.png',
    sha256: '1c1f8e0b7cbe2a4d24543878c04474f40b95ba9888de2f940e0d5c8b9cf0dabb' },
  { cameraYaw: 225, sourceYaw: -135, rightClicks: 6,
    url: '/assets/environment/oblique/cell-door-open-yaw-135-elev45.cae1519010fd.png',
    sha256: 'cae1519010fd4998ed914d4d384725bf7989c16509552a088d3bf02bfe9cecfc' },
] as const;

interface LoadedImage {
  assignedSrc: string; currentSrc: string; complete: boolean;
  width: number; height: number; sha256?: string; error: boolean;
}
interface ImageProbe { read(): Promise<LoadedImage[]> }

// Client observer: decode exactly the loader's real Blob, and keep its
// actual HTMLImageElement load result. No replacement image/bitmap or verdict.
export async function observeInteriorNorthDoorImages(page: Page) {
  const responses: { url: string; status: number; sha256: string; width: number; height: number }[] = [];
  const descriptors: { url: string; status: number; data: unknown }[] = [];
  const errors: string[] = [];
  const redirects: { url: string; status: number; location: string | undefined }[] = [];
  const pendingResponses: Promise<void>[] = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/game-content/oblique-cell-door-open.v1.json') {
      pendingResponses.push(response.json().then(data => {
        descriptors.push({ url: response.url(), status: response.status(), data: data as unknown });
      }).catch(error => { errors.push(String(error)); }));
      return;
    }
    if (!response.url().includes('/assets/environment/oblique/cell-door-open-')) return;
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
        if (hash !== undefined || value.includes('/assets/environment/oblique/cell-door-open-')) {
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
    Reflect.set(window, 'northDoorLoadedImages', { async read() { await Promise.all(pending); return rows; } } satisfies ImageProbe);
  });
  return async () => {
    await Promise.all(pendingResponses);
    const images = await page.evaluate(() => (Reflect.get(window, 'northDoorLoadedImages') as ImageProbe).read());
    return { responses, images, descriptors, errors, redirects };
  };
}

export async function capturePublicNorthDoorBacksides(page: Page, info: TestInfo, sequence: number,
  readSnapshot: () => Promise<SessionSnapshotBundle>,
  readImages: Awaited<ReturnType<typeof observeInteriorNorthDoorImages>>) {
  // Only the already played q0 BasicCell at20,5. Nothing is placed/injected here.
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const paused = await readSnapshot();
  const orderId = `room-template-${String(sequence).padStart(12, '0')}-1-door-000`;
  expect(paused.construction.orders.find(order => order.id === orderId)).toMatchObject({
    id: orderId, definitionId: 'door-wooden', state: 'completed', placementSequence: sequence,
    location: { x: 21, y: 11 }, edge: 'north',
  });
  expect(SparseWorld.fromSnapshot(paused.world).getTopEdge({ x: tileCoordinate(21), y: tileCoordinate(11) }))
    .toBe(2);
  const shots: { cameraYaw: number; sourceYaw: number; screenshot: string }[] = [];
  try {
    for (const frame of NORTH_DOOR_BACKSIDE_FRAMES) {
      for (let index = 0; index < frame.rightClicks; index++) {
        await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
      }
      await expect.poll(async () => (await readImages()).images.some(image => image.sha256 === frame.sha256
        && image.complete && !image.error && image.width === 512 && image.height === 512),
        { message: `actual north door source${frame.sourceYaw}/45 Blob must decode in the real loader` }).toBe(true);
      const delivered = await readImages();
      expect(delivered.errors).toEqual([]);
      const descriptor = delivered.descriptors.find(row => row.status === 200);
      expect(descriptor, 'actual network-delivered north descriptor').toBeDefined();
      const catalog = parseObliqueModuleCatalog(descriptor!.data);
      expect(catalog).toMatchObject({ assetId: 'door.interior.open.full', source: 'door.interior.leaf.open.blend',
        sourceSha256: '48a27d1b212e88121e6b55661452f70df1129e78f8825eebc3913db1d5aeaf5f',
        sourceDependencies: [{ source: 'wall.interior.cutaway.blend', sha256: '98b264c5b3ea15658d7d8996f403024928c660135a66025adccba1d385927e6c' }],
        resolutionPx: [512,512], pivotPx: [256,256], nominalPixelsPerTile: 64, cameraTargetTiles: [0,0,0],
        yawDegrees: Array.from({ length: 24 }, (_, index) => -180 + index * 15), elevationDegrees: [25,45,65],
      });
      expect(catalog.frames).toHaveLength(72);
      expect(catalog.frames).toContainEqual({ yawDegrees: frame.sourceYaw, elevationDegrees: 45,
        image: frame.url, sha256: frame.sha256 });
      expect(delivered.responses.some(row => decodeURIComponent(new URL(row.url).pathname) === frame.url
        && row.status === 200 && row.sha256 === frame.sha256 && row.width === 512 && row.height === 512)).toBe(true);
      expect(await readSnapshot(), 'public camera leaves the whole paused worker unchanged').toEqual(paused);
      const screenshot = info.outputPath(`north-door-camera${frame.cameraYaw}-source${frame.sourceYaw}-elev45.png`);
      await page.screenshot({ path: screenshot });
      shots.push({ cameraYaw: frame.cameraYaw, sourceYaw: frame.sourceYaw, screenshot });
    }
  } finally {
    // If an assertion fails early, this route stops; do not guess a new pose.
    // On a completed two-pose journey, six more public clicks complete one full turn.
    if (shots.length === 2) for (let index = 0; index < 6; index++) {
      await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click();
    }
  }
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await readSnapshot(), 'complete public camera turn retains the whole paused save').toEqual(paused);
  const evidence = { expectedInitialCamera: { yaw: -45, elevation: 45 }, shots,
    expectedRestoredCamera: { yaw: -45, elevation: 45 }, publicRightClicks: [12,6,6],
    northDoorOwner: orderId, northDoorAnchor: { x: 21, y: 11 }, pausedSnapshot: paused,
    delivered: await readImages(), boundTextureObserved: false, visualCanvasCalibrationPending: true };
  const path = info.outputPath('north-door-public-backside-loader-evidence.json');
  await writeFile(path, JSON.stringify(evidence,null,2));
  await info.attach('north-door-public-backside-loader-evidence', { path, contentType: 'application/json' });
  return evidence;
}
