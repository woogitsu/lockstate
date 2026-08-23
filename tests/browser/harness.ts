import { decodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../../src/persistence/entity-codec';
import { classifyStoreError } from '../../src/persistence/local/errors';
import { IndexedDbLocalSaveStore, openLockstateDatabase } from '../../src/persistence/local/indexeddb-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { createSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { LifecycleSaveHandler } from '../../src/persistence/session/lifecycle';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { SessionController } from '../../src/persistence/session/session-controller';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import legacyV1Save from '../fixtures/persistence/save-v1-in-progress.json';
import type {
  HarnessEntityLiveness,
  HarnessErrorProbe,
  HarnessFillResult,
  HarnessLegacyGeneration,
  HarnessLifecycleObservation,
  HarnessLoadSummary,
  HarnessQuotaEstimate,
  HarnessSaveSummary,
  HarnessSlotSummary,
  HarnessStoredGeneration,
  HarnessThrowProbe,
  LockstateBrowserHarness,
} from './harness-api';

/**
 * In-page driver for the Playwright specs in this folder. It imports the
 * real `IndexedDbLocalSaveStore` / `PrisonSaveRepository` / `classifyStoreError`
 * sources (Vite transpiles them on the fly — see vite.config.ts here), so the
 * specs observe production behavior against a real browser IndexedDB rather
 * than `fake-indexeddb`.
 *
 * This file is test-only. It is never imported by `src/**` and is not part of
 * any production entry point.
 */

const GAME_VERSION = 'lockstate-0.0.0';
const METADATA_STORE = 'prisons';
const GENERATIONS_STORE = 'generations';

let database: IDBDatabase | undefined;
let repository: PrisonSaveRepository | undefined;

/**
 * `sessionStorage`, not a module variable, because the whole point of the
 * lifecycle probe is to read a record written while the page was being torn
 * down. A module variable dies with the realm; a same-tab `sessionStorage`
 * write is synchronous and survives into the next load.
 */
const LIFECYCLE_TRIGGERS_KEY = 'lockstate-harness/lifecycle-triggers';
const LIFECYCLE_VISIBILITY_KEY = 'lockstate-harness/lifecycle-visibility';

function recordLifecycleTrigger(trigger: string): void {
  const existing = sessionStorage.getItem(LIFECYCLE_TRIGGERS_KEY);
  sessionStorage.setItem(LIFECYCLE_TRIGGERS_KEY, existing === null || existing === '' ? trigger : `${existing},${trigger}`);
  sessionStorage.setItem(LIFECYCLE_VISIBILITY_KEY, document.visibilityState);
}

const unhandledRejections: string[] = [];
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { name?: unknown; message?: unknown } | undefined;
  unhandledRejections.push(
    typeof reason?.name === 'string' ? `${reason.name}: ${String(reason.message ?? '')}` : String(event.reason),
  );
});

function requireDatabase(): IDBDatabase {
  if (database === undefined) throw new Error('Harness database is not open. Call openRepository() first.');
  return database;
}

function requireRepository(): PrisonSaveRepository {
  if (repository === undefined) throw new Error('Harness repository is not open. Call openRepository() first.');
  return repository;
}

function buildEnvelope(prisonId: string, revision: number, padBytes: number): SaveEnvelope {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(0, 0);
  if (padBytes > 0) {
    // A queued command payload is the cheapest schema-valid way to grow an
    // envelope: `jsonValueSchema` accepts it and the checksum still covers it.
    kernel.submitCommand('harness/pad', 0, 0, { blob: 'x'.repeat(padBytes) });
  }
  return createSaveEnvelope({
    gameVersion: GAME_VERSION,
    prisonId,
    revision,
    createdAt: 0,
    updatedAt: revision,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  });
}

function describeError(scenario: string, error: unknown, note: string): HarnessErrorProbe {
  const candidate = error as { name?: unknown; message?: unknown; constructor?: { name?: unknown } } | null | undefined;
  const errorName = typeof candidate?.name === 'string' ? candidate.name : null;
  const errorMessage = typeof candidate?.message === 'string' ? candidate.message : String(error);
  const constructorName = typeof candidate?.constructor?.name === 'string' ? candidate.constructor.name : String(error);
  const classified = classifyStoreError(error);
  return {
    scenario,
    errorName,
    errorMessage,
    constructorName,
    isError: error instanceof Error,
    isDomException: typeof DOMException !== 'undefined' && error instanceof DOMException,
    classifiedAs: classified.code,
    classifiedMessage: classified.message,
    note,
  };
}

/**
 * Expands an encoded (V2, run-length) entity ledger through the production
 * decoder so it can be compared field-for-field with the V1 fixture's flat
 * per-slot arrays.
 */
function describeLiveness(encoded: EncodedEntityStoreSnapshot | undefined): HarnessEntityLiveness | null {
  if (encoded === undefined) return null;
  const decoded = decodeEntityStoreSnapshot(encoded);
  return {
    capacity: decoded.capacity,
    nextAvailableIndex: decoded.nextAvailableIndex,
    maxActiveIndex: decoded.maxActiveIndex,
    freeCount: decoded.freeCount,
    generations: Array.from(decoded.generations),
    freeIndices: Array.from(decoded.freeIndices.subarray(0, decoded.freeCount)),
    alive: Array.from(decoded.alive),
  };
}

/**
 * Builds one V1 record from the checked-in fixture. `prisonId` and `revision`
 * are envelope metadata, not payload, so overriding them leaves the fixture's
 * checksum valid — which is the point: only `tampered` may invalidate it.
 */
function buildLegacyV1Envelope(prisonId: string, revision: number, tampered: boolean): typeof legacyV1Save {
  const envelope = structuredClone(legacyV1Save);
  envelope.prisonId = prisonId;
  envelope.revision = revision;
  if (tampered) envelope.payload.kernel.tick += 1;
  return envelope;
}

function toSaveSummary(result: Awaited<ReturnType<PrisonSaveRepository['save']>>): HarnessSaveSummary {
  return result.ok
    ? { ok: true, generationId: result.generationId, errorCode: null, errorMessage: null }
    : { ok: false, generationId: null, errorCode: result.error.code, errorMessage: result.error.message };
}

/**
 * Incompressible payload. Chromium stores IndexedDB values in a compressed
 * LevelDB, so a zero-filled buffer would cost almost nothing on disk and
 * never approach a storage limit.
 */
function randomBytes(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  const maxPerCall = 65_536; // crypto.getRandomValues quota per call
  for (let offset = 0; offset < byteLength; offset += maxPerCall) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + maxPerCall, byteLength)));
  }
  return bytes;
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// --- Raw-IndexedDB failure scenarios -------------------------------------
// These bypass the adapter on purpose: the point is to observe what a real
// browser actually throws, then feed the genuine object to
// `classifyStoreError`. Each opens its own connection so a scenario that
// closes or aborts cannot disturb the harness's main connection.

async function probeExplicitAbort(): Promise<readonly HarnessErrorProbe[]> {
  const db = await openLockstateDatabase();
  try {
    return await new Promise<readonly HarnessErrorProbe[]>((resolve) => {
      const probes: HarnessErrorProbe[] = [];
      const transaction = db.transaction([METADATA_STORE], 'readwrite');
      const request = transaction.objectStore(METADATA_STORE).put({
        prisonId: 'probe-explicit-abort',
        gameVersion: GAME_VERSION,
        currentGenerationId: undefined,
        generationIds: [],
        createdAt: 0,
        updatedAt: 0,
      });
      request.onerror = () => {
        probes.push(describeError('explicit-abort/pending-request-error', request.error, 'IDBRequest.error after transaction.abort()'));
      };
      transaction.onabort = () => {
        probes.push(
          describeError(
            'explicit-abort/transaction-error',
            transaction.error,
            'IDBTransaction.error after an explicit transaction.abort()',
          ),
        );
        resolve(probes);
      };
      transaction.abort();
    });
  } finally {
    db.close();
  }
}

async function probeConstraintError(): Promise<readonly HarnessErrorProbe[]> {
  const db = await openLockstateDatabase();
  try {
    return await new Promise<readonly HarnessErrorProbe[]>((resolve) => {
      const probes: HarnessErrorProbe[] = [];
      const seed = db.transaction([GENERATIONS_STORE], 'readwrite');
      seed.objectStore(GENERATIONS_STORE).put({ seeded: true }, 'probe-constraint');
      seed.oncomplete = () => {
        const transaction = db.transaction([GENERATIONS_STORE], 'readwrite');
        const request = transaction.objectStore(GENERATIONS_STORE).add({ seeded: false }, 'probe-constraint');
        request.onerror = (event) => {
          event.preventDefault(); // keep the transaction alive so both errors are observable
          probes.push(describeError('constraint/request-error', request.error, 'IDBRequest.error for a duplicate add()'));
        };
        transaction.oncomplete = () => {
          probes.push(
            describeError(
              'constraint/transaction-completed-after-prevented-error',
              undefined,
              'preventDefault() on the request error keeps the transaction committing',
            ),
          );
          resolve(probes);
        };
        transaction.onabort = () => {
          probes.push(describeError('constraint/transaction-error', transaction.error, 'IDBTransaction.error after a failing request'));
          resolve(probes);
        };
      };
    });
  } finally {
    db.close();
  }
}

async function probeUnhandledRequestFailure(): Promise<readonly HarnessErrorProbe[]> {
  const db = await openLockstateDatabase();
  try {
    return await new Promise<readonly HarnessErrorProbe[]>((resolve) => {
      const probes: HarnessErrorProbe[] = [];
      const seed = db.transaction([GENERATIONS_STORE], 'readwrite');
      seed.objectStore(GENERATIONS_STORE).put({ seeded: true }, 'probe-unhandled');
      seed.oncomplete = () => {
        const transaction = db.transaction([GENERATIONS_STORE], 'readwrite');
        // No error handler: the failure escalates to a transaction abort,
        // exactly the path `IndexedDbLocalSaveStore` observes when one of its
        // own requests fails and nothing swallows the event.
        transaction.objectStore(GENERATIONS_STORE).add({ seeded: false }, 'probe-unhandled');
        transaction.onabort = () => {
          probes.push(
            describeError(
              'unhandled-request-failure/transaction-error',
              transaction.error,
              'IDBTransaction.error when an unhandled request failure aborts the transaction',
            ),
          );
          resolve(probes);
        };
        transaction.oncomplete = () => {
          probes.push(
            describeError('unhandled-request-failure/unexpectedly-committed', undefined, 'transaction committed despite a failed request'),
          );
          resolve(probes);
        };
      };
    });
  } finally {
    db.close();
  }
}

async function probeSynchronousThrows(): Promise<readonly HarnessErrorProbe[]> {
  const probes: HarnessErrorProbe[] = [];

  const cloneDb = await openLockstateDatabase();
  try {
    const transaction = cloneDb.transaction([GENERATIONS_STORE], 'readwrite');
    try {
      transaction.objectStore(GENERATIONS_STORE).put(() => undefined, 'probe-clone');
      probes.push(describeError('non-cloneable-value', undefined, 'put() of a function did not throw'));
    } catch (error) {
      probes.push(describeError('non-cloneable-value', error, 'synchronous throw from IDBObjectStore.put()'));
    }
    transaction.abort();
  } finally {
    cloneDb.close();
  }

  const readonlyDb = await openLockstateDatabase();
  try {
    const transaction = readonlyDb.transaction([GENERATIONS_STORE], 'readonly');
    try {
      transaction.objectStore(GENERATIONS_STORE).put({ nope: true }, 'probe-readonly');
      probes.push(describeError('write-in-readonly-transaction', undefined, 'put() in a readonly transaction did not throw'));
    } catch (error) {
      probes.push(describeError('write-in-readonly-transaction', error, 'synchronous throw from a readonly transaction'));
    }
  } finally {
    readonlyDb.close();
  }

  const inactiveDb = await openLockstateDatabase();
  try {
    const transaction = inactiveDb.transaction([GENERATIONS_STORE], 'readonly');
    const objectStore = transaction.objectStore(GENERATIONS_STORE);
    await nextMacrotask(); // the transaction auto-commits across an unrelated task
    try {
      objectStore.get('probe-inactive');
      probes.push(describeError('use-after-auto-commit', undefined, 'get() on an auto-committed transaction did not throw'));
    } catch (error) {
      probes.push(describeError('use-after-auto-commit', error, 'a transaction that outlived its task is no longer usable'));
    }
  } finally {
    inactiveDb.close();
  }

  const closedDb = await openLockstateDatabase();
  closedDb.close();
  try {
    closedDb.transaction([GENERATIONS_STORE], 'readonly');
    probes.push(describeError('transaction-on-closed-connection', undefined, 'transaction() on a closed connection did not throw'));
  } catch (error) {
    probes.push(describeError('transaction-on-closed-connection', error, 'synchronous throw from IDBDatabase.transaction()'));
  }

  const missingStoreDb = await openLockstateDatabase();
  try {
    missingStoreDb.transaction(['definitely-not-a-store'], 'readonly');
    probes.push(describeError('unknown-object-store', undefined, 'transaction() for an unknown store did not throw'));
  } catch (error) {
    probes.push(describeError('unknown-object-store', error, 'synchronous throw for an unknown object store'));
  } finally {
    missingStoreDb.close();
  }

  return probes;
}

async function probeAdapterAfterUnrelatedAwait(): Promise<readonly HarnessErrorProbe[]> {
  const db = await openLockstateDatabase();
  const store = new IndexedDbLocalSaveStore(db);
  try {
    await store.runTransaction('readonly', async (tx) => {
      await nextMacrotask(); // the exact hazard indexeddb-store.ts documents
      await tx.getMetadata('probe-adapter');
    });
    return [
      describeError(
        'adapter/request-after-unrelated-await',
        undefined,
        'IndexedDbLocalSaveStore.runTransaction survived an unrelated macrotask await',
      ),
    ];
  } catch (error) {
    return [
      describeError(
        'adapter/request-after-unrelated-await',
        error,
        'error surfaced by IndexedDbLocalSaveStore.runTransaction itself',
      ),
    ];
  } finally {
    db.close();
  }
}

const harness: LockstateBrowserHarness = {
  async openRepository(keepGenerations?: number): Promise<void> {
    if (database === undefined) {
      database = await openLockstateDatabase();
    }
    repository = new PrisonSaveRepository(
      new IndexedDbLocalSaveStore(database),
      keepGenerations === undefined ? {} : { keepGenerations },
    );
  },

  async createPrison(prisonId: string, displayName?: string): Promise<void> {
    await requireRepository().create({
      prisonId,
      gameVersion: GAME_VERSION,
      ...(displayName === undefined ? {} : { displayName }),
    });
  },

  async save(prisonId: string, revision: number, padBytes = 0): Promise<HarnessSaveSummary> {
    return toSaveSummary(await requireRepository().save(prisonId, buildEnvelope(prisonId, revision, padBytes)));
  },

  async loadCurrent(prisonId: string): Promise<HarnessLoadSummary> {
    const result = await requireRepository().loadCurrent(prisonId);
    return result.ok
      ? {
          ok: true,
          outcome: result.outcome,
          generationId: result.generationId,
          revision: result.envelope.revision,
          reason: null,
          saveSchemaVersion: result.envelope.saveSchemaVersion,
          entities: describeLiveness(result.envelope.payload.entities as EncodedEntityStoreSnapshot | undefined),
        }
      : {
          ok: false,
          outcome: null,
          generationId: null,
          revision: null,
          reason: result.reason,
          saveSchemaVersion: null,
          entities: null,
        };
  },

  async resaveCurrent(prisonId: string): Promise<HarnessSaveSummary> {
    const repository = requireRepository();
    const loaded = await repository.loadCurrent(prisonId);
    if (!loaded.ok) {
      return { ok: false, generationId: null, errorCode: 'unknown-error', errorMessage: `load failed: ${loaded.reason}` };
    }
    return toSaveSummary(await repository.save(prisonId, loaded.envelope));
  },

  async listPrisons(): Promise<readonly HarnessSlotSummary[]> {
    const slots = await requireRepository().list();
    return slots.map((slot) => ({
      prisonId: slot.prisonId,
      displayName: slot.displayName ?? null,
      currentGenerationId: slot.currentGenerationId ?? null,
      generationIds: [...slot.generationIds],
    }));
  },

  async corruptGeneration(prisonId: string, generationId: string): Promise<void> {
    const store = new IndexedDbLocalSaveStore(requireDatabase());
    await store.runTransaction('readwrite', async (tx) => {
      await tx.putGeneration(prisonId, generationId, { corrupted: 'not a valid envelope' });
    });
  },

  async generationExists(prisonId: string, generationId: string): Promise<boolean> {
    const store = new IndexedDbLocalSaveStore(requireDatabase());
    const value = await store.runTransaction('readonly', (tx) => tx.getGeneration(prisonId, generationId));
    return value !== undefined;
  },

  async readStoredGeneration(prisonId: string, generationId: string): Promise<HarnessStoredGeneration> {
    const store = new IndexedDbLocalSaveStore(requireDatabase());
    const value = await store.runTransaction('readonly', (tx) => tx.getGeneration(prisonId, generationId));
    const absent: HarnessStoredGeneration = {
      exists: value !== undefined,
      saveSchemaVersion: null,
      checksum: null,
      entityFields: null,
      rawGenerations: null,
      rawFreeIndices: null,
    };
    if (typeof value !== 'object' || value === null) return absent;

    const record = value as {
      readonly saveSchemaVersion?: unknown;
      readonly checksum?: unknown;
      readonly payload?: { readonly entities?: Record<string, unknown> };
    };
    const entities = record.payload?.entities;
    return {
      exists: true,
      saveSchemaVersion: typeof record.saveSchemaVersion === 'number' ? record.saveSchemaVersion : null,
      checksum: typeof record.checksum === 'string' ? record.checksum : null,
      entityFields: entities === undefined ? null : Object.keys(entities).sort(),
      rawGenerations: entities?.['generations'] ?? null,
      rawFreeIndices: entities?.['freeIndices'] ?? null,
    };
  },

  async seedLegacyV1Prison(prisonId: string, generations: readonly HarnessLegacyGeneration[]): Promise<void> {
    const store = new IndexedDbLocalSaveStore(requireDatabase());
    await store.runTransaction('readwrite', async (tx) => {
      for (const generation of generations) {
        // eslint-disable-next-line no-await-in-loop -- same transaction; the requests are sequential by design
        await tx.putGeneration(
          prisonId,
          generation.generationId,
          buildLegacyV1Envelope(prisonId, generation.revision, generation.tampered === true),
        );
      }
      await tx.putMetadata({
        prisonId,
        gameVersion: legacyV1Save.gameVersion,
        displayName: 'Legacy Block',
        // Oldest first, matching the repository's own retention window order.
        currentGenerationId: generations.at(-1)?.generationId,
        generationIds: generations.map((generation) => generation.generationId),
        createdAt: legacyV1Save.createdAt,
        updatedAt: legacyV1Save.updatedAt,
      });
    });
  },

  legacyV1Liveness(): HarnessEntityLiveness {
    const v1 = legacyV1Save.payload.entities;
    return {
      capacity: v1.capacity,
      nextAvailableIndex: v1.nextAvailableIndex,
      maxActiveIndex: v1.maxActiveIndex,
      freeCount: v1.freeCount,
      generations: [...v1.generations],
      // V1 wrote the whole free-list array including the stack residue above
      // `freeCount`; only the live prefix carries meaning, and only it is
      // expected to survive into V2.
      freeIndices: v1.freeIndices.slice(0, v1.freeCount),
      alive: [...v1.alive],
    };
  },

  async fillUntilWriteFails(chunkBytes: number, maxChunks: number): Promise<HarnessFillResult> {
    const store = new IndexedDbLocalSaveStore(requireDatabase());
    let chunksWritten = 0;
    for (let index = 0; index < maxChunks; index += 1) {
      const chunk = randomBytes(chunkBytes);
      try {
        // eslint-disable-next-line no-await-in-loop -- writes must be sequential to find the first failure
        await store.runTransaction('readwrite', async (tx) => {
          await tx.putGeneration('quota-filler', `chunk-${index}`, chunk);
        });
      } catch (error) {
        return {
          chunksWritten,
          bytesWritten: chunksWritten * chunkBytes,
          failure: describeError('quota/first-failing-write', error, `failed on chunk ${index} of ${chunkBytes} bytes`),
        };
      }
      chunksWritten += 1;
    }
    return { chunksWritten, bytesWritten: chunksWritten * chunkBytes, failure: null };
  },

  async probeErrorClassification(): Promise<readonly HarnessErrorProbe[]> {
    return [
      ...(await probeExplicitAbort()),
      ...(await probeConstraintError()),
      ...(await probeUnhandledRequestFailure()),
      ...(await probeSynchronousThrows()),
      ...(await probeAdapterAfterUnrelatedAwait()),
    ];
  },

  async probeThrowInsideTransaction(prisonId: string): Promise<HarnessThrowProbe> {
    const store = new IndexedDbLocalSaveStore(requireDatabase());
    let rejectionMessage = '<no rejection>';
    try {
      await store.runTransaction('readwrite', async (tx) => {
        await tx.putMetadata({
          prisonId,
          gameVersion: GAME_VERSION,
          currentGenerationId: undefined,
          generationIds: [],
          createdAt: 0,
          updatedAt: 0,
        });
        throw new Error('harness: aborting work after staging a write');
      });
    } catch (error) {
      rejectionMessage = error instanceof Error ? error.message : String(error);
    }
    // Let the underlying IDB transaction settle before reading back.
    await nextMacrotask();
    const readBack = await store.runTransaction('readonly', (tx) => tx.getMetadata(prisonId));
    return { rejectionMessage, stagedWriteSurvived: readBack !== undefined };
  },

  async attachLifecycleSaveHandler(prisonId: string, forceHiddenVisibility = false): Promise<void> {
    sessionStorage.removeItem(LIFECYCLE_TRIGGERS_KEY);
    sessionStorage.removeItem(LIFECYCLE_VISIBILITY_KEY);
    const controller = new SessionController(requireRepository(), new InProcessSessionHost(), { gameVersion: GAME_VERSION });
    await controller.createPrison(prisonId);
    // No `targets` option: this is the production default from src/main.ts.
    new LifecycleSaveHandler(controller, {
      onAttempt: (trigger) => recordLifecycleTrigger(trigger),
      ...(forceHiddenVisibility ? { visibilityState: (): DocumentVisibilityState => 'hidden' } : {}),
    }).attach();
  },

  dispatchAtDocument(type: string): void {
    document.dispatchEvent(new Event(type, { bubbles: false }));
  },

  dispatchAtWindow(type: string): void {
    window.dispatchEvent(new Event(type, { bubbles: false }));
  },

  readLifecycleObservation(): HarnessLifecycleObservation {
    const raw = sessionStorage.getItem(LIFECYCLE_TRIGGERS_KEY);
    return {
      triggers: raw === null || raw === '' ? [] : raw.split(','),
      lastVisibilityState: sessionStorage.getItem(LIFECYCLE_VISIBILITY_KEY),
    };
  },

  takeUnhandledRejections(): readonly string[] {
    return unhandledRejections.splice(0, unhandledRejections.length);
  },

  async estimateQuota(): Promise<HarnessQuotaEstimate> {
    if (navigator.storage?.estimate === undefined) return { usage: null, quota: null };
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null };
  },
};

window.lockstateHarness = harness;
