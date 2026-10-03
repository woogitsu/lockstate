import { expect, type Page } from './network-changed-fixture';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { requireFrozenBytes, sha256 } from './oblique-demand-frozen-assets';

interface ImageRow { assignedSrc: string; currentSrc: string; complete: boolean; width: number; height: number; error: boolean; sha256?: string }
interface ProbeWindow extends Window {
  demandReadImages?: () => Promise<ImageRow[]>;
  demandWorkerSnapshot?: () => Promise<SessionSnapshotBundle>;
}

/** Observe genuine loader Blob bytes and decoded HTMLImageElements, unchanged. */
export async function observeDemandRoute(page: Page, buildRoot: string) {
  const requests: Array<{ url: string; resourceType: string }> = [];
  const pngs: Array<{ url: string; status: number; sha256: string; width: number; height: number }> = [];
  const redirects: Array<{ url: string; status: number; location: string | undefined }> = [];
  const errors: string[] = [];
  const pending: Promise<void>[] = [];
  const scripts: Array<ReturnType<typeof requireFrozenBytes> & { status: number; resourceType: string }> = [];
  const catalogBytes: ReturnType<typeof requireFrozenBytes>[] = [];
  page.on('request', request => { if (/\.png$/u.test(new URL(request.url()).pathname)) requests.push({ url: request.url(), resourceType: request.resourceType() }); });
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith('.js') && response.status() === 200) {
      // Load terminates the outgoing worker. Capture its genuine delivered body
      // while the response's execution context still exists, rather than keeping
      // a Response handle and asking that closed context for bytes after Load.
      pending.push((async () => {
        const frozen = requireFrozenBytes(buildRoot, response.url(), await response.body());
        scripts.push({ ...frozen, status: response.status(), resourceType: response.request().resourceType() });
      })().catch(error => { errors.push(`Actual script body capture failed for ${response.url()}: ${String(error)}`); }));
    }
    if (response.status() >= 300 && response.status() < 400 && path.endsWith('.png')) {
      redirects.push({ url: response.url(), status: response.status(), location: response.headers().location }); return;
    }
    if ((path.includes('/game-content/') && path.endsWith('.json')) || path.endsWith('.png')) pending.push((async () => {
      expect(response.status(), `real terminal asset response: ${response.url()}`).toBe(200);
      const bytes = await response.body();
      const frozen = requireFrozenBytes(buildRoot, response.url(), bytes);
      if (path.endsWith('.json')) { catalogBytes.push(frozen); return; }
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      pngs.push({ url: response.url(), status: response.status(), sha256: sha256(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    })().catch(error => { errors.push(String(error)); }));
  });
  await page.addInitScript(() => {
    const blobs = new Map<string, Promise<string>>();
    const images: ImageRow[] = [], pendingImages: Promise<void>[] = [];
    const create = URL.createObjectURL;
    URL.createObjectURL = function (object) {
      const url = create.call(this, object);
      if (object instanceof Blob && object.type === 'image/png') blobs.set(url, object.arrayBuffer()
        .then(bytes => crypto.subtle.digest('SHA-256', bytes))
        .then(hash => [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')));
      return url;
    };
    const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(this: HTMLImageElement, value: string) {
      const hash = blobs.get(value);
      if (hash) {
        const record = (error: boolean) => {
          const row: ImageRow = { assignedSrc: value, currentSrc: this.currentSrc, complete: this.complete,
            width: this.naturalWidth, height: this.naturalHeight, error };
          images.push(row); pendingImages.push(hash.then(digest => { row.sha256 = digest; }));
        };
        this.addEventListener('load', () => record(false), { once: true });
        this.addEventListener('error', () => record(true), { once: true });
      }
      src.set!.call(this, value);
    } });
    (window as ProbeWindow).demandReadImages = async () => { await Promise.all(pendingImages); return [...images]; };
    const RealWorker = Worker;
    let latest: Worker | undefined;
    const waiters = new Map<string, (data: unknown) => void>();
    class ObservedWorker extends RealWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options); latest = this;
        this.addEventListener('message', (event: MessageEvent) => {
          const replyTo = (event.data as { replyTo?: string }).replyTo;
          if (!replyTo) return;
          const waiter = waiters.get(replyTo);
          if (waiter) { waiters.delete(replyTo); waiter(event.data); }
        });
      }
    }
    window.Worker = ObservedWorker as typeof Worker;
    (window as ProbeWindow).demandWorkerSnapshot = () => new Promise((resolve, reject) => {
      if (!latest) { reject(new Error('Actual worker absent')); return; }
      const messageId = crypto.randomUUID();
      const timer = setTimeout(() => { waiters.delete(messageId); reject(new Error('Read-only snapshot exceeded existing 10s expectation budget')); }, 10_000);
      waiters.set(messageId, data => {
        clearTimeout(timer);
        const reply = data as { payload: { snapshot: { data: SessionSnapshotBundle } } };
        resolve(reply.payload.snapshot.data);
      });
      latest.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    });
  });
  return {
    async read() {
      await Promise.all(pending);
      return { requests, pngs, redirects, errors, catalogBytes,
        images: await page.evaluate(() => (window as ProbeWindow).demandReadImages!()) };
    },
    async scripts() {
      await Promise.all(pending);
      expect(scripts.length).toBeGreaterThan(0); return [...scripts];
    },
  };
}
export const actualSnapshot = (page: Page) => page.evaluate(() => (window as ProbeWindow).demandWorkerSnapshot!());
