import { createHash } from 'node:crypto';
import { expect, type Page } from './network-changed-fixture';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Expected exact bytes come from the checked-in authored catalog, not a
// browser reply. Root is correcting legacy projection; no superseded raster
// hash is frozen in this preparation. Native comparison remains on HOLD.
const guardCatalog = JSON.parse(readFileSync(new URL('../../public/game-content/oblique-actor-guard.v1.json', import.meta.url), 'utf8')) as {
  sourceSha256: string;
  frames: { yawDegrees: number; elevationDegrees: number; image: string; sha256: string }[];
};
const rearFrame = guardCatalog.frames.find(frame => frame.yawDegrees === -180 && frame.elevationDegrees === 45);
if (rearFrame === undefined) throw new Error('authored Guard rear45 frame absent');
export const GUARD_REAR_FRAME = { url: rearFrame.image, sha256: rearFrame.sha256 };
export const GUARD_SOURCE_SHA = guardCatalog.sourceSha256;
const initialFrame = guardCatalog.frames.find(frame => frame.yawDegrees === -45 && frame.elevationDegrees === 45);
if (initialFrame === undefined) throw new Error('authored Guard initial45 frame absent');
export const GUARD_INITIAL_FRAME = { url: initialFrame.image, sha256: initialFrame.sha256 };
interface LoadedImage {
  assignedSrc: string; currentSrc: string; complete: boolean;
  width: number; height: number; sha256?: string; error: boolean;
}
interface ImageProbe { read(): Promise<LoadedImage[]> }

// Built-client observer: decode exactly the loader's real Blob, and keep its
// actual HTMLImageElement load result. No replacement image/bitmap or verdict.
export async function observeGuardImages(page: Page) {
  const responses: { url: string; status: number; sha256: string; width: number; height: number }[] = [];
  const descriptors: { url: string; status: number; data: unknown }[] = [];
  const errors: string[] = [];
  const redirects: { url: string; status: number; location: string | null }[] = [];
  const pendingResponses: Promise<void>[] = [];
  page.on('response', response => {
    if (decodeURIComponent(new URL(response.url()).pathname) === '/game-content/oblique-actor-guard.v1.json') {
      pendingResponses.push(response.json().then(data => {
        descriptors.push({ url: response.url(), status: response.status(), data: data as unknown });
      }).catch(error => { errors.push(String(error)); }));
      return;
    }
    if (!response.url().includes('/assets/environment/oblique/actor-guard-')) return;
    pendingResponses.push((async () => {
      if (response.status() >= 300 && response.status() < 400) {
        redirects.push({ url: response.url(), status: response.status(), location: await response.headerValue('location') });
        return;
      }
      if (response.status() !== 200) {
        errors.push(`Guard PNG ${response.status()} ${response.url()}`); return;
      }
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
        if (hash !== undefined || value.includes('/assets/environment/oblique/actor-guard-')) {
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
    Reflect.set(window, 'guardLoadedImages', { async read() { await Promise.all(pending); return rows; } } satisfies ImageProbe);
  });
  return async () => {
    await Promise.all(pendingResponses);
    const images = await page.evaluate(() => (Reflect.get(window, 'guardLoadedImages') as ImageProbe).read());
    return { responses, images, descriptors, redirects, errors };
  };
}

interface ProbeWindow extends Window {
  askGuardSnapshot?: () => Promise<SessionSnapshotBundle>;
}

/** Forwards all real worker messages; only adds a consistency snapshot reader. */
export async function installGuardWorkerProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    let worker: Worker | undefined;
    const replies = new Map<string, (data: SessionSnapshotBundle) => void>();
    class ProbeWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); worker = this;
        this.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { replyTo?: string; kind?: string;
            payload?: { snapshot?: { data?: SessionSnapshotBundle } } };
          if (message.kind !== 'simulation/snapshot' || message.replyTo === undefined) return;
          const resolve = replies.get(message.replyTo);
          const data = message.payload?.snapshot?.data;
          if (resolve === undefined || data === undefined) return;
          replies.delete(message.replyTo); resolve(data);
        });
      }
    }
    Reflect.set(window, 'Worker', ProbeWorker);
    (window as ProbeWindow).askGuardSnapshot = () => new Promise((resolve, reject) => {
      if (worker === undefined) { reject(new Error('real worker absent')); return; }
      const messageId = crypto.randomUUID();
      const timer = setTimeout(() => { replies.delete(messageId); reject(new Error('guard snapshot timed out')); }, 20_000);
      replies.set(messageId, data => { clearTimeout(timer); resolve(data); });
      worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot',
        payload: { reason: 'consistency-check' } });
    });
  });
}

export async function guardSnapshot(page: Page): Promise<SessionSnapshotBundle> {
  return page.evaluate(() => (window as ProbeWindow).askGuardSnapshot!());
}

export function requireGenuineGuard(snapshot: SessionSnapshotBundle) {
  expect(snapshot.simulation?.security.guards.records).toHaveLength(1);
  const [entityId, record] = snapshot.simulation!.security.guards.records[0]!;
  expect(entityId).toBe(0); // Empty new-session roster's first real allocation.
  expect(record).toMatchObject({ staffRoleId: 'staff-role.guard', tileX: 16, tileY: 16, deploymentPhase: 'unassigned' });
  expect(snapshot.simulation?.inFlight?.guards.locomotion.headings ?? []).toEqual([]);
  expect(snapshot.simulation?.inFlight?.guards.locomotion.walks ?? []).toEqual([]);
  const identities = snapshot.identity?.entries.filter(row => row.kind === 'staff' && row.entityId === entityId) ?? [];
  expect(identities).toHaveLength(1);
  expect(identities[0]!.givenName.length).toBeGreaterThan(0);
  expect(identities[0]!.familyName.length).toBeGreaterThan(0);
  return { entityId, renderActorId: 2 ** 32 + entityId, record, identity: identities[0]!,
    expectedDefaultHeading: 'south', expectedAssetId: 'actor.guard.base' };
}

/** Public minimap fractions derived from the actual loaded worker chunks. */
export async function centreGuard(page: Page, snapshot: SessionSnapshotBundle) {
  const chunks = snapshot.world.chunks.filter(chunk => chunk.lifecycle === 'loaded');
  expect(chunks.length).toBeGreaterThan(0);
  const size = snapshot.world.chunkSize;
  const minX = Math.min(...chunks.map(chunk => chunk.x)) * size;
  const minY = Math.min(...chunks.map(chunk => chunk.y)) * size;
  const maxX = (Math.max(...chunks.map(chunk => chunk.x)) + 1) * size;
  const maxY = (Math.max(...chunks.map(chunk => chunk.y)) + 1) * size;
  const minimap = page.locator('.hud-minimap__surface');
  if (!await minimap.isVisible()) {
    await page.getByRole('region', { name: 'Minimap', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
  }
  const bounds = await minimap.boundingBox();
  if (bounds === null) throw new Error('public minimap absent');
  const fractions = { x: (16.5 - minX) / (maxX - minX), y: (16.5 - minY) / (maxY - minY) };
  await minimap.click({ position: { x: fractions.x * bounds.width, y: fractions.y * bounds.height } });
  await page.mouse.move(1300, 700);
  return { bounds, fractions, worldGroundTarget: { x: 16.5 * 64, y: 16.5 * 64 } };
}

// Same RGB delta >8, foot+-25 / foot-100..-3 and >100 body minimum as
// oblique-authored-actors.spec.ts. This is NOT a new rear-band colour/crop.
const { PNG } = createRequire(createRequire(import.meta.url).resolve('@playwright/test/package.json'))('playwright-core/lib/utilsBundle') as {
  PNG: { sync: { read(bytes: Buffer): { width: number; height: number; data: Buffer } } };
};
export function visibleGuardBodyPixels(shown: Buffer, empty: Buffer): number {
  const a = PNG.sync.read(shown), b = PNG.sync.read(empty);
  expect([a.width, a.height]).toEqual([1920, 1080]);
  expect([b.width, b.height]).toEqual([a.width, a.height]);
  let changed = 0;
  for (let y = 540 - 100; y < 540 - 3; y++) {
    for (let x = 960 - 25; x < 960 + 25; x++) {
      const at = (y * a.width + x) * 4;
      if ([0, 1, 2].some(channel => Math.abs(a.data[at + channel]! - b.data[at + channel]!) > 8)) changed++;
    }
  }
  return changed;
}