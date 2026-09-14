import type { LocalSaveStore, LocalSaveTransaction, PrisonSlotMetadata, TombstoneRecord } from './store';

/**
 * In-memory `LocalSaveStore`. Used by tests to exercise repository policy
 * (generation retention, recovery, autosave coalescing) without a real or
 * polyfilled IndexedDB. Not exported for production use.
 *
 * ## What of IndexedDB this models, and what it does not (#1143)
 *
 * A double that models half a guarantee is worse than one that models none,
 * because a test written against the missing half passes for a reason no
 * browser supplies. So the list is kept here rather than left to be inferred
 * from the code.
 *
 * **Modelled.**
 *
 * 1. *Atomic commit.* Writes go to staging copies and are published only once
 *    `work` resolves; a `work` that throws publishes nothing. `failNextWrite`
 *    is the injected version of the same failure.
 * 2. *Serialised transactions* (`runTransaction`'s queue below). The real
 *    store opens every transaction over all three object stores
 *    (`indexeddb-store.ts`, `this.db.transaction([METADATA_STORE,
 *    GENERATIONS_STORE, TOMBSTONES_STORE], mode)`), so every pair of
 *    transactions has overlapping scope and IndexedDB therefore orders them:
 *    a `readwrite` runs alone, and nothing it does interleaves with another
 *    transaction's reads. Two `readonly` transactions may overlap each other,
 *    and here they do.
 * 3. *Ascending key order* from `listMetadata`/`listTombstones`, which is what
 *    `getAll()` returns; see those methods.
 *
 * **Not modelled.** Each of these is a real property of the browser that a
 * test cannot prove here, and the browser suite (`tests/browser/`, against
 * real IndexedDB) is where they are covered:
 *
 * - *Auto-commit on an idle event loop turn.* A real transaction finishes as
 *   soon as its last request settles without a new one queued, so awaiting an
 *   unrelated macrotask inside `work` kills it — the defect
 *   `tests/browser/local-save-errors.spec.ts` pins. Here `work` may await
 *   anything for as long as it likes.
 * - *Structured cloning.* Values are stored by reference, so a caller that
 *   mutates an object it has written mutates the store. The real store clones.
 * - *Quota, private-mode and connection failures*, except the single injected
 *   `failNextWrite`.
 * - *Cross-tab and cross-connection visibility*: one instance is one database,
 *   and a second `MemoryLocalSaveStore` shares nothing with it.
 *
 * One consequence of the serialisation is worth stating plainly: a `work`
 * callback that itself awaits another `runTransaction` on the same store
 * deadlocks rather than throwing. Real IndexedDB fails that shape too (the
 * outer transaction auto-commits and the nested work then throws
 * `TransactionInactiveError`), so neither is a supported thing to write, but
 * the failure here is a hang and the failure there is an error.
 */
export class MemoryLocalSaveStore implements LocalSaveStore {
  private readonly metadata = new Map<string, PrisonSlotMetadata>();
  private readonly generations = new Map<string, unknown>();
  /**
   * The undo window's store (ADR 0114), staged and published exactly like the
   * two above.
   *
   * Mirrored here rather than only in `IndexedDbLocalSaveStore` because
   * `PrisonSaveRepository` holds all policy against `LocalSaveTransaction` and
   * every unit test drives it through this fake: a tombstone method that
   * existed on one implementation and not the other would make the whole
   * undo-window policy untestable from `pnpm test`, which is the one place it
   * can be watched going red.
   */
  private readonly tombstones = new Map<string, TombstoneRecord>();

  /**
   * Settles when the most recently queued `readwrite` transaction has
   * finished. Every transaction waits on it, which is what puts `readwrite`
   * calls in a queue: the next one does not read the stores until the
   * previous one has published.
   */
  private writeTail: Promise<void> = Promise.resolve();

  /**
   * The `readonly` transactions currently running. They are allowed to overlap
   * each other -- IndexedDB permits that, and they publish nothing -- but a
   * `readwrite` queued behind them waits for them to finish, so a write never
   * lands in the middle of a read's view of the stores.
   */
  private readonly openReads = new Set<Promise<void>>();

  /** Test hook: makes the next `readwrite` transaction throw this error before committing anything. */
  public failNextWrite: Error | undefined;

  /**
   * Runs `work` in a transaction, after the transactions it has to wait for.
   *
   * **The queue is the #1143 fix and is not incidental.** Before it, this
   * method snapshotted the stores at call time and published at exit, so two
   * `readwrite` calls that interleaved at their internal awaits both read the
   * pre-write state and the later one published over the earlier one's
   * writes -- including writes to keys it had never touched, since publishing
   * replaces the maps wholesale. Measured in #1143: two overlapping
   * `SessionController.saveNow()` calls wrote envelope revisions `[2, 2]`
   * where a browser gives `[2, 3]`. `PrisonSaveRepository.writeGeneration`
   * reads `currentRevision`, compares it and writes `currentRevision + 1`
   * inside one transaction precisely because IndexedDB will not interleave
   * that read and that write, so without the queue the compare-and-swap ADR
   * 0109 decided could not be proved here at all.
   *
   * `failNextWrite` is consumed when the transaction *begins* rather than when
   * it is queued, which is the same "the next write to run" the field's name
   * promises.
   */
  public runTransaction<T>(mode: 'readonly' | 'readwrite', work: (tx: LocalSaveTransaction) => Promise<T>): Promise<T> {
    if (mode === 'readonly') {
      const run = this.writeTail.then(() => this.execute(mode, work));
      const settled = run.then(noop, noop);
      this.openReads.add(settled);
      void settled.then(() => this.openReads.delete(settled));
      return run;
    }

    const predecessors = Promise.all([this.writeTail, ...this.openReads]).then(noop, noop);
    const run = predecessors.then(() => this.execute(mode, work));
    this.writeTail = run.then(noop, noop);
    return run;
  }

  private async execute<T>(mode: 'readonly' | 'readwrite', work: (tx: LocalSaveTransaction) => Promise<T>): Promise<T> {
    if (mode === 'readwrite' && this.failNextWrite !== undefined) {
      const error = this.failNextWrite;
      this.failNextWrite = undefined;
      throw error;
    }

    // A real IndexedDB transaction stages writes and only makes them
    // visible on commit; this fake mirrors that by working against copies
    // and only publishing them once `work` resolves without throwing.
    const metadataStaging = new Map(this.metadata);
    const generationsStaging = new Map(this.generations);
    const tombstonesStaging = new Map(this.tombstones);

    const tx: LocalSaveTransaction = {
      getMetadata: (prisonId) => Promise.resolve(metadataStaging.get(prisonId)),
      // Ascending `prisonId`, which is what the real store returns: the
      // metadata object store is keyed on `prisonId` and IndexedDB's
      // `getAll()` hands back records in ascending key order. Walking the
      // staging `Map` instead would return put order, so this fake would
      // answer a list in an order no browser produces -- and any repository
      // behaviour that came to depend on list order would then be pinned
      // against the wrong one (docs/DETERMINISM.md, "Canonical iteration
      // order").
      listMetadata: () =>
        Promise.resolve([...metadataStaging.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, value]) => value)),
      putMetadata: (value) => {
        metadataStaging.set(value.prisonId, value);
        return Promise.resolve();
      },
      deleteMetadata: (prisonId) => {
        metadataStaging.delete(prisonId);
        return Promise.resolve();
      },
      getGeneration: (prisonId, generationId) => Promise.resolve(generationsStaging.get(generationKey(prisonId, generationId))),
      putGeneration: (prisonId, generationId, value) => {
        generationsStaging.set(generationKey(prisonId, generationId), value);
        return Promise.resolve();
      },
      deleteGeneration: (prisonId, generationId) => {
        generationsStaging.delete(generationKey(prisonId, generationId));
        return Promise.resolve();
      },
      getTombstone: (prisonId) => Promise.resolve(tombstonesStaging.get(prisonId)),
      // Ascending `prisonId`, for `listMetadata`'s reason exactly: the real
      // store's `tombstones` object store is keyed on `prisonId` and `getAll()`
      // returns ascending key order, so walking the staging `Map` would answer
      // in put order -- an order no browser produces.
      listTombstones: () =>
        Promise.resolve([...tombstonesStaging.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, value]) => value)),
      putTombstone: (tombstone) => {
        tombstonesStaging.set(tombstone.prisonId, tombstone);
        return Promise.resolve();
      },
      deleteTombstone: (prisonId) => {
        tombstonesStaging.delete(prisonId);
        return Promise.resolve();
      },
    };

    const result = await work(tx);

    if (mode === 'readwrite') {
      this.metadata.clear();
      for (const [key, value] of metadataStaging) this.metadata.set(key, value);
      this.generations.clear();
      for (const [key, value] of generationsStaging) this.generations.set(key, value);
      this.tombstones.clear();
      for (const [key, value] of tombstonesStaging) this.tombstones.set(key, value);
    }

    return result;
  }
}

function noop(): void {}

function generationKey(prisonId: string, generationId: string): string {
  return `${prisonId}:${generationId}`;
}
