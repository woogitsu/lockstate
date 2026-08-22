import type { LocalSaveStore, LocalSaveTransaction } from './store';

const DATABASE_NAME = 'lockstate-saves';
const DATABASE_VERSION = 1;
const METADATA_STORE = 'prisons';
const GENERATIONS_STORE = 'generations';

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function generationKey(prisonId: string, generationId: string): string {
  return `${prisonId}:${generationId}`;
}

/** Opens (and, on first run, creates) the Lockstate local-save database. */
export function openLockstateDatabase(indexedDbFactory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDbFactory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'prisonId' });
      }
      if (!db.objectStoreNames.contains(GENERATIONS_STORE)) {
        db.createObjectStore(GENERATIONS_STORE); // out-of-line key: `${prisonId}:${generationId}`
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open the local save database.'));
  });
}

/**
 * Thin real adapter over the browser's IndexedDB. Deliberately minimal —
 * all retention/recovery/coalescing policy lives in `PrisonSaveRepository`
 * against the storage-agnostic `LocalSaveStore` interface this implements.
 *
 * Not unit-tested: see docs/PERSISTENCE.md for why this issue does not
 * introduce a real-or-polyfilled IndexedDB test environment. Review by
 * inspection alongside `MemoryLocalSaveStore`, which mirrors its contract.
 */
export class IndexedDbLocalSaveStore implements LocalSaveStore {
  public constructor(private readonly db: IDBDatabase) {}

  public async runTransaction<T>(mode: 'readonly' | 'readwrite', work: (tx: LocalSaveTransaction) => Promise<T>): Promise<T> {
    const idbTransaction = this.db.transaction([METADATA_STORE, GENERATIONS_STORE], mode);

    // Attached synchronously, before any request is issued, so a
    // transaction that completes or aborts while `work` is still running
    // is never missed.
    const committed = new Promise<void>((resolve, reject) => {
      idbTransaction.oncomplete = () => resolve();
      idbTransaction.onerror = () => reject(idbTransaction.error ?? new Error('IndexedDB transaction failed.'));
      idbTransaction.onabort = () => reject(idbTransaction.error ?? new DOMException('IndexedDB transaction aborted.', 'AbortError'));
    });

    const metadataStore = idbTransaction.objectStore(METADATA_STORE);
    const generationsStore = idbTransaction.objectStore(GENERATIONS_STORE);

    const tx: LocalSaveTransaction = {
      getMetadata: (prisonId) => promisifyRequest(metadataStore.get(prisonId)),
      listMetadata: () => promisifyRequest(metadataStore.getAll()),
      putMetadata: async (metadata) => {
        await promisifyRequest(metadataStore.put(metadata));
      },
      deleteMetadata: async (prisonId) => {
        await promisifyRequest(metadataStore.delete(prisonId));
      },
      getGeneration: (prisonId, generationId) => promisifyRequest(generationsStore.get(generationKey(prisonId, generationId))),
      putGeneration: async (prisonId, generationId, value) => {
        await promisifyRequest(generationsStore.put(value, generationKey(prisonId, generationId)));
      },
      deleteGeneration: async (prisonId, generationId) => {
        await promisifyRequest(generationsStore.delete(generationKey(prisonId, generationId)));
      },
    };

    // `work` must only await requests issued against `tx` (or resolve via
    // microtasks). Modern engines keep a transaction alive across
    // microtask gaps between its own requests, but awaiting unrelated I/O
    // here would let it auto-commit or expire before later operations run.
    const result = await work(tx);
    await committed;
    return result;
  }
}
