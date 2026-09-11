/**
 * IndexedDB surfaces quota, private-mode and transaction-abort failures as
 * `DOMException`s distinguished only by `.name`. Classifying by name (not
 * `instanceof DOMException`, which does not exist in the Node test
 * environment) keeps this callable with plain `Error`s in unit tests and
 * with real `DOMException`s in the browser.
 */
/**
 * `stale-revision` is the one member of this union that is **not** a way
 * storage fails, and it is deliberately in here rather than beside it.
 *
 * It is produced only by `PrisonSaveRepository`'s compare-and-swap (ADR 0109
 * Decision 1) and never by `classifyStoreError` below, which has no way to
 * observe it: a refusal is a decision this repository takes, not a
 * `DOMException` it classifies. It shares the union anyway because every
 * consumer of a failed `SaveResult` must now decide what to do about it, and
 * a separate channel would let one quietly not -- `describeSaveResult`
 * switches on this code, so adding the member is what makes the compiler ask
 * the question at each site. `SaveWriteError.message` still carries prose for
 * a log; `SaveResult.stale` carries the numbers for a caller that will act.
 */
export type SaveWriteErrorCode = 'quota-exceeded' | 'transaction-aborted' | 'stale-revision' | 'unknown-error';

export interface SaveWriteError {
  readonly code: SaveWriteErrorCode;
  readonly message: string;
}

const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError']);
const ABORT_ERROR_NAMES = new Set(['AbortError', 'TransactionInactiveError', 'InvalidStateError']);

export function classifyStoreError(error: unknown): SaveWriteError {
  const name = error instanceof Error ? error.name : undefined;
  // Real Chromium raises `QuotaExceededError` with an **empty** `message`
  // (verified in tests/browser/local-save-quota.spec.ts), which would
  // otherwise leave `SaveWriteError.message` blank for the single failure
  // a player is most likely to hit. Fall back to the name so the evidence
  // is never empty.
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage === '' ? (name ?? 'Unknown storage error.') : rawMessage;

  if (name !== undefined && QUOTA_ERROR_NAMES.has(name)) {
    return { code: 'quota-exceeded', message };
  }
  if (name !== undefined && ABORT_ERROR_NAMES.has(name)) {
    return { code: 'transaction-aborted', message };
  }
  return { code: 'unknown-error', message };
}
