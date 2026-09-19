import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { test as base } from '@playwright/test';
import type { ConsoleMessage, Request } from '@playwright/test';
import {
  NETWORK_CHANGED_ERROR_TEXT,
  NETWORK_CHANGED_EVIDENCE_VARIABLE,
  NETWORK_CHANGED_OBSERVED_PREFIX,
  isNetworkChangedEvidence,
} from './network-changed-signature';

/**
 * The `test` object every spec in this directory imports, and the only thing
 * in this repository that watches for `net::ERR_NETWORK_CHANGED`.
 *
 * ## Why an auto fixture rather than a reporter or a trace scan
 *
 * Issue #616's fifth occurrence measured the aborts spread across **~52
 * seconds** of trace time, so the owner's ruling requires evidence that covers
 * the whole test rather than a sample. A `page.on('console')` read inside a
 * single spec, or a reporter poking at a page it does not have, would both be
 * samples. An automatic fixture is set up before the test's own `beforeEach`
 * hooks run and torn down after the test ends, so its listeners are attached
 * for the entire window in which anything can abort -- including the page load
 * that most of these specs perform in `beforeEach`.
 *
 * The listeners go on the **context**, not the page. The fifth occurrence's
 * aborted set was the simulation *worker's* module graph, and a context-level
 * listener sees every page and worker request in the context rather than only
 * the one page fixture. No spec in this directory creates a second context,
 * which is what makes one listener pair sufficient; if one ever does, this is
 * the module that has to learn about it.
 *
 * ## Two sources, because they fail to appear independently
 *
 * `request.failure().errorText` is exactly `net::ERR_NETWORK_CHANGED`, and the
 * page console carries `Failed to load resource: net::ERR_NETWORK_CHANGED`.
 * The issue's traces contain both. Watching only one would make the mechanism
 * depend on which of the two Chromium happens to emit for a given resource
 * type, which is not a thing this repository knows.
 *
 * ## What it does with what it sees
 *
 * Every observation is appended to the file named by
 * `LOCKSTATE_NETWORK_CHANGED_EVIDENCE` **as it happens**, not summarised at
 * the end. That matters: the dominant symptom of this class is a 60-second
 * timeout, and a fixture teardown that a timed-out worker never reaches would
 * take a summary with it. An appended line survives.
 *
 * At the end of a test that saw anything, one line goes to stdout. That line
 * is the direct answer to the sentence issue #616 opens with -- `grep -c
 * ERR_NETWORK_CHANGED browser-suite.log` returned **0** on all five
 * occurrences, and the evidence existed only inside a retained trace.
 *
 * ## When the environment variable is unset
 *
 * Nothing is written to disk and the stdout line is still printed. That is the
 * state under a bare `playwright test`, and it is the safe direction: no
 * evidence file means `run-suite.ts` finds no evidence and does not retry.
 */

interface ObservationRecord {
  readonly kind: 'observation';
  readonly testId: string;
  readonly title: string;
  readonly source: 'requestfailed' | 'console';
  readonly detail: string;
}

interface TestEndRecord {
  readonly kind: 'test-end';
  readonly testId: string;
  readonly title: string;
  readonly status: string;
  readonly observations: number;
}

type EvidenceRecord = ObservationRecord | TestEndRecord;

function appendEvidence(record: EvidenceRecord): void {
  const evidencePath = process.env[NETWORK_CHANGED_EVIDENCE_VARIABLE];
  if (evidencePath === undefined || evidencePath.length === 0) {
    return;
  }

  try {
    appendFileSync(evidencePath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    /*
     * Best effort, and the failure direction is deliberate: an evidence file
     * that cannot be written yields no evidence, which yields no retry. The
     * alternative -- throwing out of a listener during someone else's test --
     * would turn a disk problem into a red suite about the wrong subject.
     */
  }
}

export const test = base.extend<{ networkChangedEvidence: void }>({
  networkChangedEvidence: [
    async ({ context }, use, testInfo): Promise<void> => {
      const title = testInfo.titlePath.join(' > ');
      let observations = 0;

      const observe = (source: ObservationRecord['source'], detail: string): void => {
        observations += 1;
        appendEvidence({ kind: 'observation', testId: testInfo.testId, title, source, detail });
      };

      const onRequestFailed = (request: Request): void => {
        const errorText = request.failure()?.errorText;
        if (isNetworkChangedEvidence(errorText)) {
          observe('requestfailed', `${String(errorText)} ${request.url()}`);
        }
      };

      const onConsole = (message: ConsoleMessage): void => {
        const text = message.text();
        if (isNetworkChangedEvidence(text)) {
          observe('console', text);
        }
      };

      context.on('requestfailed', onRequestFailed);
      context.on('console', onConsole);

      try {
        await use();
      } finally {
        context.off('requestfailed', onRequestFailed);
        context.off('console', onConsole);

        const status = testInfo.status ?? 'unknown';

        if (status !== testInfo.expectedStatus) {
          appendEvidence({
            kind: 'test-end',
            testId: testInfo.testId,
            title,
            status,
            observations,
          });
        }

        if (observations > 0) {
          process.stdout.write(
            `${NETWORK_CHANGED_OBSERVED_PREFIX} signature=${NETWORK_CHANGED_ERROR_TEXT} observations=${String(observations)} status=${status} testId=${testInfo.testId} test=${JSON.stringify(title)}\n`,
          );
        }
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
export type {
  Browser,
  BrowserContext,
  CDPSession,
  ConsoleMessage,
  Locator,
  Page,
  Request,
  TestInfo,
} from '@playwright/test';
