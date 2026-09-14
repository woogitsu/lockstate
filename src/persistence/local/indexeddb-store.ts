import type { LocalSaveStore, LocalSaveTransaction } from './store';

const DATABASE_NAME = 'lockstate-saves';
/**
 * The IndexedDB schema's own version, and **it is not `SAVE_SCHEMA_VERSION`.**
 *
 * Two persisted formats, one level apart, each with its own number and its own
 * migration mechanism. `SAVE_SCHEMA_VERSION` (`src/persistence/save-schema.ts`)
 * versions the shape of one save *envelope* and migrates with the step
 * functions in that module. This versions the set of object stores this
 * database holds, and migrates in `onupgradeneeded` below. A change to either
 * leaves the other alone; conflating them is the mistake ADR 0114 spends a
 * section heading on.
 *
 * **1 → 2, for the `tombstones` store (ADR 0114).** The upgrade is
 * forward-only and pure: it creates an empty object store and reads, rewrites
 * and deletes nothing. No record that exists today has to be reshaped, because
 * nothing could have written a tombstone yet -- the same "absence is
 * unambiguous" argument `docs/PERSISTENCE.md` makes for `masterSeed`, applied
 * one layer below where that document states it.
 */
const DATABASE_VERSION = 2;
const METADATA_STORE = 'prisons';
const GENERATIONS_STORE = 'generations';
const TOMBSTONES_STORE = 'tombstones';

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
      // Guarded exactly like the two above, which is the idiom rather than a
      // flourish: `onupgradeneeded` runs for every version step a connection
      // crosses, so a player arriving from v1 and a player arriving from
      // nothing both run this line, and neither must fail on the other's state.
      if (!db.objectStoreNames.contains(TOMBSTONES_STORE)) {
        db.createObjectStore(TOMBSTONES_STORE, { keyPath: 'prisonId' });
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
 * Integration-tested against `fake-indexeddb` in
 * tests/integration/persistence-local-indexeddb.test.ts (a pure-JS
 * IndexedDB implementation used only as a devDependency, not a jsdom/
 * browser test environment) — see docs/PERSISTENCE.md for that scoping
 * decision. Real-browser quota/private-mode behavior is still unverified.
 */
export class IndexedDbLocalSaveStore implements LocalSaveStore {
  public constructor(private readonly db: IDBDatabase) {}

  public async runTransaction<T>(mode: 'readonly' | 'readwrite', work: (tx: LocalSaveTransaction) => Promise<T>): Promise<T> {
    const idbTransaction = this.db.transaction([METADATA_STORE, GENERATIONS_STORE, TOMBSTONES_STORE], mode);

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
    // In the same transaction as the other two, which is the whole design:
    // `delete()` writes here and deletes there, and either both land or
    // neither does.
    const tombstonesStore = idbTransaction.objectStore(TOMBSTONES_STORE);

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
      getTombstone: (prisonId) => promisifyRequest(tombstonesStore.get(prisonId)),
      listTombstones: () => promisifyRequest(tombstonesStore.getAll()),
      putTombstone: async (tombstone) => {
        // In-line key: the store's `keyPath` is `prisonId`, so the record is
        // its own key and `put` takes no second argument.
        await promisifyRequest(tombstonesStore.put(tombstone));
      },
      deleteTombstone: async (prisonId) => {
        await promisifyRequest(tombstonesStore.delete(prisonId));
      },
    };

    // `work` must only await requests issued against `tx` (or resolve via
    // microtasks). Modern engines keep a transaction alive across
    // microtask gaps between its own requests, but awaiting unrelated I/O
    // here would let it auto-commit or expire before later operations run.
    let result: T;
    try {
      result = await work(tx);
    } catch (error) {
      // Without this, a throw from `work` rejects the returned promise but
      // leaves the transaction to commit normally -- any writes already
      // staged before the throw would land, breaking `LocalSaveStore`'s
      // "commit or fail together" contract and silently diverging from
      // `MemoryLocalSaveStore`, which only publishes staging once `work`
      // resolves. Verified against real Chromium in
      // tests/browser/local-save-errors.spec.ts.
      // Attach the handler *before* aborting: the abort below rejects
      // `committed`, and this path rethrows `work`'s original error rather
      // than awaiting it, so without a handler that rejection would surface
      // as an unhandled promise rejection in the page.
      void committed.catch(() => {});
      try {
        idbTransaction.abort();
      } catch {
        // Already finished (committed or aborted); nothing left to roll back.
      }
      throw error;
    }
    await committed;
    return result;
  }
}
