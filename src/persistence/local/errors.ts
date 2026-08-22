/**
 * IndexedDB surfaces quota, private-mode and transaction-abort failures as
 * `DOMException`s distinguished only by `.name`. Classifying by name (not
 * `instanceof DOMException`, which does not exist in the Node test
 * environment) keeps this callable with plain `Error`s in unit tests and
 * with real `DOMException`s in the browser.
 */
export type SaveWriteErrorCode = 'quota-exceeded' | 'transaction-aborted' | 'unknown-error';

export interface SaveWriteError {
  readonly code: SaveWriteErrorCode;
  readonly message: string;
}

const QUOTA_ERROR_NAMES = new Set(['QuotaExceededError']);
const ABORT_ERROR_NAMES = new Set(['AbortError', 'TransactionInactiveError', 'InvalidStateError']);

export function classifyStoreError(error: unknown): SaveWriteError {
  const name = error instanceof Error ? error.name : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (name !== undefined && QUOTA_ERROR_NAMES.has(name)) {
    return { code: 'quota-exceeded', message };
  }
  if (name !== undefined && ABORT_ERROR_NAMES.has(name)) {
    return { code: 'transaction-aborted', message };
  }
  return { code: 'unknown-error', message };
}
