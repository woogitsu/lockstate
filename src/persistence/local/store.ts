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
  /** The prison revision (see save-schema.ts) that has not yet reached cloud storage. */
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
}

export interface LocalSaveTransaction {
  getMetadata(prisonId: string): Promise<PrisonSlotMetadata | undefined>;
  listMetadata(): Promise<readonly PrisonSlotMetadata[]>;
  putMetadata(metadata: PrisonSlotMetadata): Promise<void>;
  deleteMetadata(prisonId: string): Promise<void>;
  /** Generations are stored as validated, JSON-safe values (a decoded `SaveEnvelopeV1`, structurally). */
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
