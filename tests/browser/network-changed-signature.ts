/**
 * The ONE signature the browser suite is allowed to retry on, and the decision
 * that reads it.
 *
 * ## Why this file exists
 *
 * Issue #616 settled a class of failure that had defeated three separate
 * investigations: the WSL2 CI runner's host network reconfigures mid-run and
 * Chromium aborts every in-flight request with `net::ERR_NETWORK_CHANGED`. The
 * page's module graph is truncated wherever the abort lands, so the symptom
 * depends only on which modules were in the aborted set -- a harness global
 * that never appears (60 s `waitForFunction` timeout), a `page.evaluate` that
 * returns `undefined` in 229 ms, or a simulation worker that never answers so
 * a correctly-written panel stays pending until the test's own 10 s
 * expectation gives up. Five occurrences, one cause, four different-looking
 * reds.
 *
 * The owner's ruling of 2026-08-30 on that issue chose option 1 of the three
 * it listed: **retry only on this signature**. `retries: 0` in
 * `tests/browser/playwright.config.ts` stays the default, because a blanket
 * retry dulls a real intermittent defect on exactly the branch where detecting
 * one matters most.
 *
 * ## The four constraints the ruling attached, and where each one is met
 *
 * 1. *"The signature must be read from evidence that covers the whole test,
 *    not a snapshot."* The aborts in the fifth occurrence were spread over
 *    ~52 seconds of trace time, not clustered, so anything that samples
 *    console errors at one instant can miss the window or be tripped by it.
 *    Met in `network-changed-fixture.ts`, which attaches
 *    `requestfailed`/`console` listeners to the browser context for the whole
 *    lifetime of every test and appends each observation to a file as it
 *    happens.
 * 2. *"It must fail loudly when it retries."* Met by `run-suite.ts` and the
 *    fixture, which both write greppable lines to the suite's stdout --
 *    `browser-suite.log` in CI. The number this issue tracks is the count of
 *    `LOCKSTATE_BROWSER_SUITE_RETRY` lines, and it is deliberately a count of
 *    something the log now contains: `grep -c ERR_NETWORK_CHANGED
 *    browser-suite.log` returned **0** on every one of the five occurrences,
 *    which is why the class was invisible for three investigations.
 * 3. *"It must not retry on anything else."* Met by `isNetworkChangedEvidence`
 *    below, which matches one exact Chromium net error and nothing adjacent to
 *    it -- not `ERR_INTERNET_DISCONNECTED`, not `ERR_NETWORK_IO_SUSPENDED`,
 *    not `ERR_ABORTED`. Widening this to "network-ish" errors would recreate
 *    the blanket retry the ruling declined, with extra steps.
 * 4. *"A run with an ordinary assertion failure does not retry."* Met by
 *    `decideBrowserSuiteRetry` below, which refuses the whole retry as soon as
 *    one failing test carries no evidence.
 *
 * ## Why the logic is here, in a module with no Playwright import
 *
 * So it can be driven by `pnpm test` and mutated. Nothing in this file touches
 * a browser, a file or a process; `tests/foundation/browser-network-changed-signature.test.ts`
 * exercises it directly. The parts that cannot be unit-tested -- whether a
 * Chromium abort really surfaces on `context.on('requestfailed')`, whether
 * Playwright's `.last-run.json` test ids are the same ids `testInfo.testId`
 * reports -- are demonstrated by running the suite, not asserted here.
 */

/**
 * The exact error text Chromium reports for an abort caused by the operating
 * system's network configuration changing underneath an in-flight request.
 *
 * Two independent sources produce it and both are watched, because they fail
 * to appear independently: `request.failure().errorText` is exactly this
 * string, and the page's own console carries
 * `Failed to load resource: net::ERR_NETWORK_CHANGED`.
 */
export const NETWORK_CHANGED_ERROR_TEXT = 'net::ERR_NETWORK_CHANGED';

/**
 * The environment variable through which `run-suite.ts` tells the fixture
 * where to append its observations. When it is unset the fixture records
 * nothing to disk, which is what happens under a bare `playwright test` and is
 * the safe direction: no evidence file means no retry.
 */
export const NETWORK_CHANGED_EVIDENCE_VARIABLE = 'LOCKSTATE_NETWORK_CHANGED_EVIDENCE';

/** Greppable prefix for the per-test line the fixture writes to stdout. */
export const NETWORK_CHANGED_OBSERVED_PREFIX = 'LOCKSTATE_NETWORK_CHANGED_OBSERVED';

/** Greppable prefix for the line `run-suite.ts` writes when it retries. */
export const BROWSER_SUITE_RETRY_PREFIX = 'LOCKSTATE_BROWSER_SUITE_RETRY';

/** Greppable prefix for the line `run-suite.ts` writes when it refuses to. */
export const BROWSER_SUITE_NO_RETRY_PREFIX = 'LOCKSTATE_BROWSER_SUITE_NO_RETRY';

/**
 * Anchored on the right so that a longer error whose name merely starts with
 * this one cannot match. There is no such Chromium error today; the lookahead
 * is here because the failure mode this whole mechanism has to avoid is
 * *widening*, and a bare `includes` is one new net error away from doing it
 * silently.
 */
const NETWORK_CHANGED_PATTERN = /net::ERR_NETWORK_CHANGED(?![0-9A-Z_])/u;

/**
 * Whether a piece of text is evidence of this specific host-level abort.
 *
 * Deliberately substring-based on the left, because the console form embeds
 * the error in a sentence, and deliberately not substring-based on the right.
 */
export function isNetworkChangedEvidence(text: string | null | undefined): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  return NETWORK_CHANGED_PATTERN.test(text);
}

/** One failing test, with how many times the signature was observed during it. */
export interface BrowserSuiteFailure {
  /** Playwright's stable test id, as `testInfo.testId` and `.last-run.json` both report it. */
  readonly testId: string;
  /** Human-readable title path, for the log line. May be the id when nothing recorded a title. */
  readonly title: string;
  /** Count of `net::ERR_NETWORK_CHANGED` observations over the whole test. */
  readonly networkChangedObservations: number;
}

/** What `run-suite.ts` should do about a failed run. */
export interface BrowserSuiteRetryDecision {
  readonly retry: boolean;
  /** One sentence, printed to the log verbatim. A refusal explains itself too. */
  readonly reason: string;
  readonly withSignature: readonly BrowserSuiteFailure[];
  readonly withoutSignature: readonly BrowserSuiteFailure[];
}

function describe(failures: readonly BrowserSuiteFailure[]): string {
  return failures.map((failure) => JSON.stringify(failure.title)).join(', ');
}

/**
 * Decide whether a failed browser run may be retried.
 *
 * All-or-nothing, and that is the point. The retry is executed as
 * `playwright test --last-failed`, which re-runs every test that failed; if
 * even one of them failed for an ordinary reason, re-running the set would be
 * a retry of a real failure. So one failure without evidence refuses the whole
 * retry. The run stays red either way in that case -- the ordinary failure
 * would fail again -- so nothing is lost but six minutes.
 *
 * The empty case is a refusal rather than a retry on purpose. `run-suite.ts`
 * only asks this question after Playwright has exited non-zero, so "no failing
 * test was recorded" means the run died somewhere no test owns: the web server
 * refusing to start, a config error, a worker crash. None of those is this
 * signature and none of them should be papered over.
 */
export function decideBrowserSuiteRetry(
  failures: readonly BrowserSuiteFailure[],
): BrowserSuiteRetryDecision {
  const withSignature = failures.filter((failure) => failure.networkChangedObservations > 0);
  const withoutSignature = failures.filter((failure) => failure.networkChangedObservations <= 0);

  if (failures.length === 0) {
    return {
      retry: false,
      reason:
        'the run failed with no failing test recorded, so it failed somewhere no test owns (the web server, the config, a crashed worker) and this is not the signature.',
      withSignature,
      withoutSignature,
    };
  }

  if (withoutSignature.length > 0) {
    return {
      retry: false,
      reason: `${withoutSignature.length} of ${failures.length} failing test(s) carry no ${NETWORK_CHANGED_ERROR_TEXT} evidence: ${describe(withoutSignature)}. A retry is permitted only when every failure is this host-level abort.`,
      withSignature,
      withoutSignature,
    };
  }

  return {
    retry: true,
    reason: `every one of the ${failures.length} failing test(s) observed ${NETWORK_CHANGED_ERROR_TEXT} while it ran: ${describe(withSignature)}. Retrying exactly those, once.`,
    withSignature,
    withoutSignature,
  };
}
