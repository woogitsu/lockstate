import { expect, test } from '@playwright/test';
import type { SaveWriteErrorCode } from '../../src/persistence/local/errors';
import { openHarness } from './harness-fixture';

/**
 * Audits `classifyStoreError` (src/persistence/local/errors.ts) against the
 * errors a real browser actually produces.
 *
 * The unit tests for that module use plain `Error` objects with hand-written
 * `.name`s, so until this spec existed nothing had ever confirmed that (a)
 * the names it switches on are the names Chromium really uses, or (b) that
 * `error instanceof Error` — the guard every branch depends on — is even true
 * for a `DOMException`. Both are verified here against real objects.
 */

interface ExpectedProbe {
  readonly errorName: string | null;
  readonly classifiedAs: SaveWriteErrorCode;
}

/**
 * Observed on Chromium 141. Each entry is a real DOMException produced by the
 * browser, not a constructed stand-in.
 */
const EXPECTED: Readonly<Record<string, ExpectedProbe>> = {
  // A request still in flight when the transaction is aborted fails with
  // AbortError — the documented assumption, now confirmed.
  'explicit-abort/pending-request-error': { errorName: 'AbortError', classifiedAs: 'transaction-aborted' },
  // But `IDBTransaction.error` itself is *null* after an explicit abort. This
  // is why `IndexedDbLocalSaveStore` substitutes a synthetic AbortError in its
  // `onabort` handler: without that fallback an abort would classify as
  // `unknown-error`.
  'explicit-abort/transaction-error': { errorName: null, classifiedAs: 'unknown-error' },
  // A failing request reports its own cause, and preventing the default keeps
  // the transaction committing.
  'constraint/request-error': { errorName: 'ConstraintError', classifiedAs: 'unknown-error' },
  'constraint/transaction-completed-after-prevented-error': { errorName: null, classifiedAs: 'unknown-error' },
  // When an unhandled request failure aborts the transaction, the browser
  // sets `transaction.error` to the *causal* error, not to AbortError. So the
  // name reaching `classifyStoreError` on an abort path is whatever caused it
  // — which is exactly why the quota case below still classifies correctly.
  'unhandled-request-failure/transaction-error': { errorName: 'ConstraintError', classifiedAs: 'unknown-error' },
  // Programming errors, deliberately not laundered into a storage code.
  'non-cloneable-value': { errorName: 'DataCloneError', classifiedAs: 'unknown-error' },
  'write-in-readonly-transaction': { errorName: 'ReadOnlyError', classifiedAs: 'unknown-error' },
  'unknown-object-store': { errorName: 'NotFoundError', classifiedAs: 'unknown-error' },
  // Transaction-lifecycle failures.
  'use-after-auto-commit': { errorName: 'TransactionInactiveError', classifiedAs: 'transaction-aborted' },
  'transaction-on-closed-connection': { errorName: 'InvalidStateError', classifiedAs: 'transaction-aborted' },
  // The adapter's own documented hazard, reproduced through its public API.
  'adapter/request-after-unrelated-await': { errorName: 'TransactionInactiveError', classifiedAs: 'transaction-aborted' },
};

test.describe('classifyStoreError against real browser errors', () => {
  test('every documented error name matches what the browser actually throws', async ({ page }) => {
    await openHarness(page);
    const probes = await page.evaluate(() => window.lockstateHarness.probeErrorClassification());

    expect(probes.map((probe) => probe.scenario).sort()).toEqual(Object.keys(EXPECTED).sort());

    for (const probe of probes) {
      const expected = EXPECTED[probe.scenario];
      expect(expected, `unexpected scenario ${probe.scenario}`).toBeDefined();
      expect({ errorName: probe.errorName, classifiedAs: probe.classifiedAs }, probe.scenario).toEqual(expected);
    }
  });

  test('a real DOMException is an Error instance, which every classification branch depends on', async ({ page }) => {
    await openHarness(page);
    const probes = await page.evaluate(() => window.lockstateHarness.probeErrorClassification());
    const realErrors = probes.filter((probe) => probe.errorName !== null);
    expect(realErrors.length).toBeGreaterThan(0);

    for (const probe of realErrors) {
      // `classifyStoreError` reads `.name` only when `error instanceof Error`.
      // If DOMException were not an Error subclass, every storage failure in
      // production would silently degrade to `unknown-error`.
      expect(probe.isError, `${probe.scenario} is not an Error instance`).toBe(true);
      expect(probe.isDomException, `${probe.scenario} is not a DOMException`).toBe(true);
    }
  });

  // Regression for a real defect this browser suite found: `runTransaction`
  // used to reject on a throw from `work` without ever calling
  // `IDBTransaction.abort()`, so writes already staged in that transaction
  // still committed — silently breaking `LocalSaveStore`'s documented "all
  // operations ... commit or fail together" contract and diverging from
  // `MemoryLocalSaveStore` (which discards staging when `work` throws), the
  // fake every repository policy unit test runs against.
  //
  // It was latent rather than live (no repository path throws *after*
  // staging a write), but only a real browser could show it at all: the
  // fake cannot, by construction.
  test('a throw inside work() aborts the real transaction, discarding staged writes', async ({ page }) => {
    await openHarness(page);
    const probe = await page.evaluate(() => window.lockstateHarness.probeThrowInsideTransaction('throw-probe'));
    expect(probe.rejectionMessage).toContain('aborting work after staging a write');
    expect(probe.stagedWriteSurvived).toBe(false);
  });

  test('storage failures never leak an unhandled promise rejection', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.lockstateHarness.probeErrorClassification());
    await page.evaluate(() => window.lockstateHarness.probeThrowInsideTransaction('throw-probe'));
    // `runTransaction` builds a `committed` promise before running `work`; a
    // path that rejects `work` without awaiting `committed` would surface here.
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.lockstateHarness.takeUnhandledRejections())).toEqual([]);
  });
});
