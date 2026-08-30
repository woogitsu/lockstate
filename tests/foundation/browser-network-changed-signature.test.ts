import { describe, expect, it } from 'vitest';
import {
  NETWORK_CHANGED_ERROR_TEXT,
  decideBrowserSuiteRetry,
  isNetworkChangedEvidence,
  type BrowserSuiteFailure,
} from '../browser/network-changed-signature';

/**
 * The logic that decides whether a red browser run may be retried, driven
 * directly.
 *
 * The mechanism it belongs to is a permission to be green, so the tests that
 * matter most here are the ones that watch it **refuse**. Issue #616's ruling
 * put it plainly: *"It must not retry on anything else. A fixture that widens
 * to 'network-ish errors' recreates option 2 with extra steps."* Option 2 was
 * `retries: 1`, which the owner declined.
 *
 * Nothing here can establish that Chromium really reports
 * `net::ERR_NETWORK_CHANGED` on the abort #616 diagnosed, or that Playwright
 * surfaces it where `network-changed-fixture.ts` listens. Those are facts
 * about a browser and a test runner and they are demonstrated by running the
 * suite, not by this file. What this file pins is that given the evidence, the
 * decision is the one the ruling described.
 */

function failure(
  title: string,
  networkChangedObservations: number,
  testId = `id-${title}`,
): BrowserSuiteFailure {
  return { testId, title, networkChangedObservations };
}

describe('isNetworkChangedEvidence', () => {
  it('recognises the two forms the signature actually arrives in', () => {
    // `request.failure().errorText`, verbatim.
    expect(isNetworkChangedEvidence('net::ERR_NETWORK_CHANGED')).toBe(true);
    // The page console form, quoted from #616's retained traces.
    expect(isNetworkChangedEvidence('Failed to load resource: net::ERR_NETWORK_CHANGED')).toBe(
      true,
    );
  });

  it('refuses every other net error, including the ones a widened matcher would take', () => {
    /*
     * These are the near misses. `ERR_INTERNET_DISCONNECTED` and
     * `ERR_NETWORK_IO_SUSPENDED` are the two a "network-ish" matcher would
     * swallow, and `ERR_ABORTED` is what an ordinary cancelled request looks
     * like -- this suite navigates and reloads constantly, so admitting it
     * would make almost every failing test look retryable.
     */
    for (const other of [
      'net::ERR_INTERNET_DISCONNECTED',
      'net::ERR_NETWORK_IO_SUSPENDED',
      'net::ERR_NETWORK_ACCESS_DENIED',
      'net::ERR_ABORTED',
      'net::ERR_CONNECTION_RESET',
      'net::ERR_NAME_NOT_RESOLVED',
      'net::ERR_FAILED',
      'Failed to load resource: the server responded with a status of 404',
    ]) {
      expect(isNetworkChangedEvidence(other), `${other} must not count as the signature`).toBe(
        false,
      );
    }
  });

  it('does not match an error whose name merely starts with the signature', () => {
    // No such Chromium error exists today. The point is that the matcher is
    // anchored on the right, so one arriving tomorrow does not silently widen
    // the only escape hatch from `retries: 0`.
    expect(isNetworkChangedEvidence('net::ERR_NETWORK_CHANGED_AGAIN')).toBe(false);
    expect(isNetworkChangedEvidence('net::ERR_NETWORK_CHANGED2')).toBe(false);
  });

  it('treats absent text as no evidence', () => {
    expect(isNetworkChangedEvidence(undefined)).toBe(false);
    expect(isNetworkChangedEvidence(null)).toBe(false);
    expect(isNetworkChangedEvidence('')).toBe(false);
  });

  it('exports the signature it matches, so the log line and the matcher cannot drift', () => {
    expect(isNetworkChangedEvidence(NETWORK_CHANGED_ERROR_TEXT)).toBe(true);
  });
});

describe('decideBrowserSuiteRetry', () => {
  it('retries when every failing test observed the signature', () => {
    const decision = decideBrowserSuiteRetry([failure('a harness global never appeared', 3)]);

    expect(decision.retry).toBe(true);
    expect(decision.withSignature).toHaveLength(1);
    expect(decision.withoutSignature).toEqual([]);
    expect(decision.reason).toContain(NETWORK_CHANGED_ERROR_TEXT);
  });

  it('does NOT retry an ordinary failure', () => {
    // The whole ruling in one assertion. A failing test that saw no aborts is
    // a failing test.
    const decision = decideBrowserSuiteRetry([failure('the Rooms panel says what is missing', 0)]);

    expect(decision.retry).toBe(false);
    expect(decision.withSignature).toEqual([]);
    expect(decision.reason).toContain('the Rooms panel says what is missing');
  });

  it('refuses the whole retry when one failure of several carries no evidence', () => {
    /*
     * Not "retry the ones that qualify". The retry is executed as
     * `playwright test --last-failed`, which re-runs the entire failing set,
     * so a mixed run would re-run a real failure. Refusing costs nothing: the
     * ordinary failure would fail again and the run would be red anyway.
     */
    const decision = decideBrowserSuiteRetry([
      failure('aborted mid-boot', 57),
      failure('a genuinely broken assertion', 0),
    ]);

    expect(decision.retry).toBe(false);
    expect(decision.withSignature.map((entry) => entry.title)).toEqual(['aborted mid-boot']);
    expect(decision.withoutSignature.map((entry) => entry.title)).toEqual([
      'a genuinely broken assertion',
    ]);
    expect(decision.reason).toContain('a genuinely broken assertion');
  });

  it('does not retry a run that failed with no failing test at all', () => {
    // `run-suite.ts` only asks after Playwright exited non-zero, so an empty
    // failing set means the run died where no test owns it: the web server
    // refusing to start, a config throw, a crashed worker.
    const decision = decideBrowserSuiteRetry([]);

    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain('no failing test recorded');
  });

  it('names every retried test in the reason, because the reason is what reaches the log', () => {
    const decision = decideBrowserSuiteRetry([
      failure('first aborted test', 1),
      failure('second aborted test', 25),
    ]);

    expect(decision.retry).toBe(true);
    expect(decision.reason).toContain('first aborted test');
    expect(decision.reason).toContain('second aborted test');
    expect(decision.reason).toContain('2');
  });
});
