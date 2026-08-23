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

  /** Overwrites a stored generation with a structurally invalid record. */
  corruptGeneration(prisonId: string, generationId: string): Promise<void>;
  generationExists(prisonId: string, generationId: string): Promise<boolean>;

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
