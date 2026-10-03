import type { Page } from './network-changed-fixture';
import type { SimulationCommand } from '../../src/simulation/protocol/commands';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import type { SaveEnvelope } from '../../src/persistence/save-schema';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';

export interface PublicSubmission {
  readonly commandId: string;
  readonly sequence: number;
  readonly executeAtTick: number;
  readonly command: { readonly schemaId: string; readonly schemaVersion: number; readonly data: SimulationCommand };
}
interface Observer {
  readonly submissions: PublicSubmission[];
  readonly workerUrls: string[];
  readonly acknowledgements: unknown[];
  snapshot(): Promise<SessionSnapshotBundle>;
}

/** Passive transport tee. Its only additional messages request actual snapshots. */
export async function observeQueuedCancellation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const OriginalWorker = Worker;
    let latest: Worker | undefined;
    const readers = new Map<string, (message: unknown) => void>();
    const observer: Observer = {
      submissions: [], workerUrls: [], acknowledgements: [],
      async snapshot() {
        const worker = latest;
        if (worker === undefined) throw Error('Actual simulation worker absent');
        const messageId = crypto.randomUUID();
        const response = await new Promise<unknown>((resolve, reject) => {
          const timeout = setTimeout(() => {
            readers.delete(messageId); reject(Error('Actual snapshot timed out'));
          }, 10_000);
          readers.set(messageId, message => { clearTimeout(timeout); resolve(message); });
          worker.postMessage({ protocolVersion: 1, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
        }) as { kind: string; payload: { snapshot: { data: SessionSnapshotBundle } } };
        if (response.kind !== 'simulation/snapshot') throw Error(`Actual snapshot refused: ${response.kind}`);
        return response.payload.snapshot.data;
      },
    };
    class ObservedWorker extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        observer.workerUrls.push(String(url));
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as { kind?: string; replyTo?: string };
          if (message.kind?.startsWith('simulation/')) latest = this;
          const reader = readers.get(message.replyTo ?? '');
          if (reader !== undefined) { readers.delete(message.replyTo!); reader(event.data); }
          if (message.kind === 'simulation/command-result' || message.kind === 'simulation/error') observer.acknowledgements.push(event.data);
        });
      }
      override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        const submission = message as { kind?: string; payload?: PublicSubmission };
        if (submission.kind === 'simulation/submit-command' && submission.payload !== undefined) observer.submissions.push(submission.payload);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }
    Reflect.set(window, 'Worker', ObservedWorker);
    Reflect.set(window, 'queuedCancellationObserver', observer);
  });
}

export const cancellationSnapshot = (page: Page): Promise<SessionSnapshotBundle> =>
  page.evaluate(() => (Reflect.get(window, 'queuedCancellationObserver') as Observer).snapshot());

export const cancellationTransportReceipt = (page: Page) => page.evaluate(() => {
  const observer = Reflect.get(window, 'queuedCancellationObserver') as Observer;
  return { submissions: observer.submissions, workerUrls: observer.workerUrls, acknowledgements: observer.acknowledgements };
});

/** Reads the existing saved generation; never writes/imports/restores test data. */
export const queuedCancellationSavedGeneration = (page: Page) => page.evaluate(async () => {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('lockstate-saves');
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(Error('Public Save has not created its database')); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const slots = await read(database.transaction('prisons', 'readonly').objectStore('prisons').getAll()) as PrisonSlotMetadata[];
    if (slots.length !== 1 || slots[0]?.currentGenerationId === undefined) throw Error('Expected one genuinely saved public prison');
    const metadata = slots[0];
    const envelope = await read(database.transaction('generations', 'readonly').objectStore('generations').get(`${metadata.prisonId}:${metadata.currentGenerationId}`)) as SaveEnvelope;
    return { metadata, envelope };
  } finally { database.close(); }
});
