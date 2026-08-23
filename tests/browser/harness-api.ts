import type { SaveWriteErrorCode } from '../../src/persistence/local/errors';
import type { LoadRecoveryOutcome } from '../../src/persistence/local/repository';

/**
 * The contract between the in-page harness (`harness.ts`) and the Playwright
 * specs. Every value crossing `page.evaluate` must be structured-clone-safe,
 * so the harness returns plain summaries rather than live repository objects.
 */

export interface HarnessSaveSummary {
  readonly ok: boolean;
  readonly generationId: string | null;
  readonly errorCode: SaveWriteErrorCode | null;
  readonly errorMessage: string | null;
}

export interface HarnessLoadSummary {
  readonly ok: boolean;
  readonly outcome: LoadRecoveryOutcome | null;
  readonly generationId: string | null;
  readonly revision: number | null;
  readonly reason: string | null;
  /** The version the loaded envelope carries *after* any migration ran. */
  readonly saveSchemaVersion: number | null;
  /** `null` when the loaded envelope has no entity section. */
  readonly entities: HarnessEntityLiveness | null;
}

/**
 * Entity-ID liveness expanded to one entry per slot, via the production
 * decoder. V1 wrote this shape directly and V2 writes run-length runs, so
 * expanding both to it is what lets a spec assert that a migrated ledger
 * reproduces the V1 one exactly rather than merely parsing.
 */
export interface HarnessEntityLiveness {
  readonly capacity: number;
  readonly nextAvailableIndex: number;
  readonly maxActiveIndex: number;
  readonly freeCount: number;
  readonly generations: readonly number[];
  /** The live free-list prefix only; the residue above `freeCount` is unreadable by `EntityStore.spawn`. */
  readonly freeIndices: readonly number[];
  readonly alive: readonly number[];
}

/** One legacy V1 generation to plant directly in storage, as an older build would have left it. */
export interface HarnessLegacyGeneration {
  readonly generationId: string;
  readonly revision: number;
  /**
   * Mutates the payload *after* the fixture's checksum was written, leaving a
   * structurally valid V1 record whose checksum no longer matches — the shape
   * real corruption takes.
   */
  readonly tampered?: boolean;
}

/** A stored generation exactly as it sits in the object store, before any decode or migration. */
export interface HarnessStoredGeneration {
  readonly exists: boolean;
  readonly saveSchemaVersion: number | null;
  readonly checksum: string | null;
  /** Sorted key names of `payload.entities`; `null` when the record carries no entity section. */
  readonly entityFields: readonly string[] | null;
  /** Verbatim, so V1's flat per-slot arrays and V2's `[value, length]` runs are distinguishable. */
  readonly rawGenerations: unknown;
  readonly rawFreeIndices: unknown;
}

export interface HarnessSlotSummary {
  readonly prisonId: string;
  readonly displayName: string | null;
  readonly currentGenerationId: string | null;
  readonly generationIds: readonly string[];
}

/** One observed real-browser failure, plus how `classifyStoreError` maps it. */
export interface HarnessErrorProbe {
  readonly scenario: string;
  /** `null` when the scenario produced no error at all (itself a finding). */
  readonly errorName: string | null;
  readonly errorMessage: string;
  readonly constructorName: string;
  readonly isError: boolean;
  readonly isDomException: boolean;
  readonly classifiedAs: SaveWriteErrorCode;
  /**
   * `classifyStoreError(...).message`. Recorded separately from
   * `errorMessage` because the two genuinely differ: a real
   * `QuotaExceededError` carries an empty `message`, and `errors.ts` falls
   * back to the error's name so the failure a player is most likely to hit
   * never reports blank evidence.
   */
  readonly classifiedMessage: string;
  /** Free-form observation the scenario wants recorded (e.g. "transaction did not abort"). */
  readonly note: string;
}

export interface HarnessThrowProbe {
  readonly rejectionMessage: string;
  /** True when the write staged before the throw was nevertheless committed. */
  readonly stagedWriteSurvived: boolean;
}

export interface HarnessFillResult {
  readonly chunksWritten: number;
  readonly bytesWritten: number;
  /** `null` when `maxChunks` was reached without any write failing. */
  readonly failure: HarnessErrorProbe | null;
}

export interface HarnessQuotaEstimate {
  readonly usage: number | null;
  readonly quota: number | null;
}

/**
 * What the lifecycle-save probe observed, read back after a real navigation.
 *
 * `triggers` is recorded into `sessionStorage` *synchronously* from
 * `LifecycleSaveHandler`'s `onAttempt` hook, because the interesting case is
 * a page that is going away: the save itself is fire-and-forget and may never
 * land, but a synchronous same-tab storage write inside the event handler
 * does, and it survives the navigation for the next load to read.
 */
export interface HarnessLifecycleObservation {
  /** Triggers seen, in order, since `attachLifecycleSaveHandler` was called -- across navigations. */
  readonly triggers: readonly string[];
  /** `document.visibilityState` at the moment of the last recorded trigger, or `null` if none. */
  readonly lastVisibilityState: string | null;
}

export interface LockstateBrowserHarness {
  /**
   * Opens `lockstate-saves` and builds a repository over the real adapter.
   * Called once per page load; Playwright's per-test browser context already
   * guarantees each test starts from empty origin storage.
   */
  openRepository(keepGenerations?: number): Promise<void>;

  createPrison(prisonId: string, displayName?: string): Promise<void>;
  /** `padBytes` inflates the kernel command payload so a save can approach a quota. */
  save(prisonId: string, revision: number, padBytes?: number): Promise<HarnessSaveSummary>;
  loadCurrent(prisonId: string): Promise<HarnessLoadSummary>;
  listPrisons(): Promise<readonly HarnessSlotSummary[]>;

  /**
   * Loads the current generation and writes it straight back. This is the
   * real upgrade-on-next-save path: a V1 save decoded (and therefore
   * migrated) on load is re-persisted at the current version.
   */
  resaveCurrent(prisonId: string): Promise<HarnessSaveSummary>;

  /** Overwrites a stored generation with a structurally invalid record. */
  corruptGeneration(prisonId: string, generationId: string): Promise<void>;
  generationExists(prisonId: string, generationId: string): Promise<boolean>;
  readStoredGeneration(prisonId: string, generationId: string): Promise<HarnessStoredGeneration>;

  /**
   * Plants the checked-in V1 fixture directly in real IndexedDB, bypassing
   * `save()` — which can only ever write the current version — so the
   * migration runs against a record that genuinely predates this build.
   */
  seedLegacyV1Prison(prisonId: string, generations: readonly HarnessLegacyGeneration[]): Promise<void>;

  /** The fixture's own V1 liveness ledger, for comparison against what a migrated load produces. */
  legacyV1Liveness(): HarnessEntityLiveness;

  /**
   * Writes incompressible random blobs through the real adapter until a write
   * fails, so a storage limit is reached by genuinely filling storage rather
   * than by simulating a failure.
   */
  fillUntilWriteFails(chunkBytes: number, maxChunks: number): Promise<HarnessFillResult>;

  /** Runs every real-browser failure scenario and reports the resulting errors. */
  probeErrorClassification(): Promise<readonly HarnessErrorProbe[]>;

  /**
   * Stages a write through the adapter and then throws from the `work`
   * callback, reporting whether the staged write still reached storage.
   */
  probeThrowInsideTransaction(prisonId: string): Promise<HarnessThrowProbe>;

  estimateQuota(): Promise<HarnessQuotaEstimate>;

  /**
   * Drains every `unhandledrejection` seen since the last call. A storage
   * failure must surface through the awaited promise, never as a stray
   * rejection the page cannot handle.
   */
  /**
   * Builds a real `SessionController` over the real IndexedDB repository,
   * creates a session, and attaches a real `LifecycleSaveHandler` with **no**
   * `targets` option -- i.e. exactly the production wiring `src/main.ts`
   * constructs. Only `onAttempt` is supplied, purely to observe; it cannot
   * influence which target a listener lands on.
   *
   * `forceHiddenVisibility` additionally injects `visibilityState`, for the
   * one case that needs a `visibilitychange` listener to act while the real
   * page is still visible. It leaves `targets` alone.
   */
  attachLifecycleSaveHandler(prisonId: string, forceHiddenVisibility?: boolean): Promise<void>;

  /** Dispatches a non-bubbling event at `document`, so only listeners on `document` itself can see it. */
  dispatchAtDocument(type: string): void;
  /** Dispatches a non-bubbling event at `window`, so only listeners on `window` itself can see it. */
  dispatchAtWindow(type: string): void;

  /** Reads back everything the attached handler recorded, including across a navigation. */
  readLifecycleObservation(): HarnessLifecycleObservation;

  takeUnhandledRejections(): readonly string[];
}

declare global {
  interface Window {
    /**
     * Assigned by `harness.ts` when the module finishes evaluating. Specs
     * must wait for `'lockstateHarness' in window` before using it; the type
     * is non-optional so `page.evaluate` bodies stay readable.
     */
    lockstateHarness: LockstateBrowserHarness;
  }
}
