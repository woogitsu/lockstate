/**
 * Storage-agnostic local persistence boundary. `PrisonSaveRepository`
 * (repository.ts) contains all policy (generation retention, recovery,
 * autosave coalescing) against this interface; `indexeddb-store.ts` is the
 * thin real adapter, and `memory-store.ts` is an in-memory fake so that
 * policy can be fully unit-tested without a real or polyfilled IndexedDB —
 * see docs/PERSISTENCE.md for why no browser/IndexedDB test environment is
 * introduced by this issue.
 */
export interface PendingSyncState {
  /**
   * The **earliest** prison revision (see save-schema.ts) not yet known to
   * have reached cloud storage -- a lower bound, set once when the prison
   * first goes dirty and left alone by every save after that until
   * `clearPendingSync` runs. `PrisonSaveRepository.markPendingSync` enforces
   * this: it is a no-op once a marker already exists (#1097).
   *
   * It used to be overwritten to "whatever revision `saveNow` just wrote",
   * which made it the *latest* marked-dirty revision rather than the
   * earliest, and the only place that ever read it (`save-list-projection.ts`)
   * used it as a stand-in for "the prison's current local revision" --
   * `PrisonSlotMetadata.currentRevision` is that field now, and this one goes
   * back to meaning exactly what its name says.
   */
  readonly dirtySinceRevision: number;
  readonly markedAt: number;
}

export interface PrisonSlotMetadata {
  readonly prisonId: string;
  readonly gameVersion: string;
  readonly displayName?: string;
  /** `undefined` until the first successful save. */
  readonly currentGenerationId: string | undefined;
  /** Oldest first; bounded by the repository's retention policy. */
  readonly generationIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Local-only bookkeeping; #20 (Supabase sync) executes on this, this issue only stores it. */
  readonly pendingSync?: PendingSyncState;
  /**
   * The revision (see save-schema.ts) of the generation this slot's
   * `currentGenerationId` actually points at -- written by every durable save
   * that lands a new generation, `writeGeneration` in `repository.ts`, which
   * every save route reaches including the interval autosave (#1097).
   *
   * `undefined` only in the narrow window between `create()` writing a fresh
   * slot and its first generation actually landing, and for a slot written by
   * a build that predates this field (`docs/PERSISTENCE.md`, "Adding an
   * optional field without a version bump" -- the same rule
   * `construction.currentTransaction` was added under). Such a slot is not
   * repaired retroactively; its very next durable save populates the field,
   * exactly as an old save with no `currentTransaction` stays without one
   * until the next build gesture opens.
   *
   * This is the field `pendingSync.dirtySinceRevision` was standing in for
   * before this existed -- see that field's doc comment for why the two are
   * no longer the same fact.
   */
  readonly currentRevision?: number;
}

export interface LocalSaveTransaction {
  /**
   * Raw stored records, exactly like `getGeneration` below: what a store
   * hands back is whatever is on disk, so the declared type is `unknown` and
   * `PrisonSaveRepository` validates it with `prisonSlotMetadataSchema`
   * (`slot-metadata-schema.ts`). Declaring these as `PrisonSlotMetadata` was
   * an assertion about a player's disk rather than something checked -- #105
   * finding 14.
   */
  getMetadata(prisonId: string): Promise<unknown | undefined>;
  listMetadata(): Promise<readonly unknown[]>;
  /** Writes are typed, and the repository validates them too, so a record this store writes is always one it can read back. */
  putMetadata(metadata: PrisonSlotMetadata): Promise<void>;
  deleteMetadata(prisonId: string): Promise<void>;
  /** Generations are stored as validated, JSON-safe values (a decoded `SaveEnvelope`, structurally). */
  getGeneration(prisonId: string, generationId: string): Promise<unknown | undefined>;
  putGeneration(prisonId: string, generationId: string, value: unknown): Promise<void>;
  deleteGeneration(prisonId: string, generationId: string): Promise<void>;
}

export interface LocalSaveStore {
  /**
   * All operations performed against the transaction argument commit or
   * fail together. Implementations must not let a failed write destroy a
   * previously committed generation (see generation-policy.ts).
   */
  runTransaction<T>(mode: 'readonly' | 'readwrite', work: (tx: LocalSaveTransaction) => Promise<T>): Promise<T>;
}
