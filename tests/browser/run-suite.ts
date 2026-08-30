import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
/*
 * FULLY SPECIFIED, WITH THE `.ts`, AND THAT IS NOT A STYLE CHOICE.
 *
 * This file is executed by Node itself rather than by Vite, Vitest or
 * Playwright, and Node's TypeScript support resolves only fully-specified
 * relative specifiers. Measured rather than assumed, on Node 24.19.0: of
 * `./dep.ts`, `./dep.js` and `./dep`, only the first resolves -- the other two
 * die with `ERR_MODULE_NOT_FOUND` at the import, before a line of this file
 * runs. `tsconfig.json` therefore sets `allowImportingTsExtensions`, which is
 * legal because the whole project is `noEmit` and which permits this form
 * without requiring it anywhere else. Every other file in `tests/browser/` is
 * loaded by a bundler-shaped resolver and keeps the extensionless form.
 */
import { selectBrowserSuite } from './browser-suites.ts';
import {
  BROWSER_SUITE_NO_RETRY_PREFIX,
  BROWSER_SUITE_RETRY_PREFIX,
  NETWORK_CHANGED_ERROR_TEXT,
  NETWORK_CHANGED_EVIDENCE_VARIABLE,
  decideBrowserSuiteRetry,
  type BrowserSuiteFailure,
} from './network-changed-signature.ts';

/**
 * `pnpm test:browser` and `pnpm test:artifact`. Runs one of the two browser
 * gates exactly as a bare `playwright test` would, and retries it once **only**
 * when every failing test observed `net::ERR_NETWORK_CHANGED` while it ran.
 *
 * ## Why both gates come through here
 *
 * They are different subjects -- the dev server over `src/**`, and `dist/`
 * served by workerd -- but they are the same exposure: Chromium fetching a
 * module graph over HTTP on a runner whose host network can reconfigure
 * underneath it. Until #652, `pnpm test:artifact` ran `playwright test`
 * directly; the artefact spec imported the evidence fixture the whole time, so
 * the listeners attached and wrote their observations nowhere, because nothing
 * set `LOCKSTATE_NETWORK_CHANGED_EVIDENCE` and no process was there to read it.
 * The owner ruled on 2026-08-30 that the second gate should come through this
 * wrapper rather than be documented as an exception, so that the retry
 * decision -- evidence joined against `.last-run.json`, `--last-failed` only
 * when every failure carried the signature -- exists in exactly one place.
 *
 * `tests/browser/browser-suites.ts` holds which configs are drivable and
 * parses `--suite`; everything below is the same for either of them.
 *
 * ## Why a wrapper process and not a Playwright option
 *
 * Playwright's `retries` is a number decided before the run. There is no hook
 * that lets a fixture say "retry this one" after seeing what happened, and
 * `retries: 1` is precisely the blanket retry the owner declined in #616 --
 * it dulls a real intermittent defect on the branch where detecting one
 * matters most. So the conditional part lives one level up: the suite runs
 * with `retries: 0`, the fixture records what it saw, and this process decides
 * afterwards, with the whole run's evidence in hand.
 *
 * ## How the retry is targeted
 *
 * `playwright test --last-failed`, which re-runs exactly the tests Playwright
 * recorded as failed in `test-results/.last-run.json`. That file is also where
 * this process reads the failing set from, so the two halves cannot disagree
 * about which tests are involved.
 *
 * ## Every way this refuses, and each is deliberate
 *
 * - The first run passed. Nothing to decide.
 * - `.last-run.json` is missing or unreadable: the run died before Playwright
 *   could write it, which is not this signature.
 * - Playwright failed with no test recorded as failed: the web server refused
 *   to start, the config threw, a worker crashed. Not this signature.
 * - Any failing test carries no evidence: the retry is refused **entirely**,
 *   not narrowed. `--last-failed` re-runs the whole failing set, so retrying
 *   with an ordinary failure in it would be a retry of a real failure.
 *
 * ## Loudness, which the ruling made a requirement rather than a nicety
 *
 * A retry that leaves no trace is indistinguishable from a green run, and the
 * occurrence rate is the number #616 exists to track. So a retry writes a
 * banner and one greppable `LOCKSTATE_BROWSER_SUITE_RETRY` line to stdout --
 * which CI tees into `browser-suite.log` -- emits a `::warning::` annotation
 * when it is running under GitHub Actions, and leaves
 * `test-results/network-changed-retry-<suite>.json` behind for the
 * failure-evidence upload. A refusal is equally loud, with `LOCKSTATE_BROWSER_SUITE_NO_RETRY`,
 * because "we considered a retry and would not" is the other half of the same
 * number.
 *
 * The summary file is written **after** the last Playwright run on purpose:
 * Playwright clears its output directory at the start of every run, so a
 * summary written before the retry would be deleted by it.
 */

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

const selection = selectBrowserSuite(process.argv.slice(2));
if (!selection.ok) {
  /*
   * Exit 2, not 1. A bad command line is not a red suite, and CI's artefact
   * step inspects the status it gets: a usage error that arrived as a 1 would
   * be indistinguishable from the gate having failed, which is the shape of
   * report this whole mechanism exists to stop producing.
   */
  process.stderr.write(`run-suite.ts: ${selection.error}\n`);
  process.exit(2);
}

const { suite, forwarded: forwardedArguments } = selection.selection;

/**
 * Resolved the way `playwright.config.ts` resolves Vite, and for the same
 * reason: no package manager in the path, so this behaves identically in a
 * plain checkout and in a git worktree whose `node_modules` is a symlink.
 */
const playwrightCliPath = (() => {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve('@playwright/test/package.json');
  const binField = (require('@playwright/test/package.json') as { bin: { playwright: string } }).bin
    .playwright;
  return path.resolve(path.dirname(manifestPath), binField);
})();

function runPlaywright(extraArguments: readonly string[], evidencePath: string): number {
  const result = spawnSync(
    process.execPath,
    [playwrightCliPath, 'test', '--config', suite.config, ...extraArguments, ...forwardedArguments],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
      env: { ...process.env, [NETWORK_CHANGED_EVIDENCE_VARIABLE]: evidencePath },
    },
  );

  if (result.error !== undefined) {
    process.stderr.write(`failed to start Playwright: ${result.error.message}\n`);
    return 1;
  }

  return result.status ?? 1;
}

interface LastRun {
  readonly failedTests?: readonly string[];
}

function readFailedTestIds(): readonly string[] | undefined {
  const lastRunPath = path.join(repositoryRoot, 'test-results', '.last-run.json');
  if (!existsSync(lastRunPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(lastRunPath, 'utf8')) as LastRun;
    return parsed.failedTests ?? [];
  } catch {
    return undefined;
  }
}

interface EvidenceLine {
  readonly kind?: string;
  readonly testId?: string;
  readonly title?: string;
}

/** `testId -> { title, observations }`, read back from the fixture's JSONL. */
function readEvidence(evidencePath: string): Map<string, { title: string; observations: number }> {
  const byTestId = new Map<string, { title: string; observations: number }>();
  if (!existsSync(evidencePath)) {
    return byTestId;
  }

  for (const line of readFileSync(evidencePath, 'utf8').split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }

    let record: EvidenceLine;
    try {
      record = JSON.parse(line) as EvidenceLine;
    } catch {
      continue;
    }

    const testId = record.testId;
    if (typeof testId !== 'string') {
      continue;
    }

    const existing = byTestId.get(testId) ?? { title: record.title ?? testId, observations: 0 };
    byTestId.set(testId, {
      title: record.title ?? existing.title,
      // Only `observation` lines count. A `test-end` line carries a title for a
      // failing test that saw nothing, which is exactly the case that must not
      // be allowed to look like evidence.
      observations: existing.observations + (record.kind === 'observation' ? 1 : 0),
    });
  }

  return byTestId;
}

function banner(lines: readonly string[]): void {
  const rule = '='.repeat(78);
  process.stdout.write(`\n${rule}\n${lines.join('\n')}\n${rule}\n\n`);
}

function writeSummary(payload: Record<string, unknown>): void {
  const directory = path.join(repositoryRoot, 'test-results');
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      // Named per suite. Both gates share Playwright's default `test-results/`
      // -- neither config sets an `outputDir` -- so one name would have the
      // second run's summary overwrite the first's and no reader could tell
      // which subject a leftover file described.
      path.join(directory, `network-changed-retry-${suite.name}.json`),
      `${JSON.stringify({ suite: suite.name, config: suite.config, ...payload }, null, 2)}\n`,
      'utf8',
    );
  } catch {
    /* The stdout lines above are the load-bearing record; this is a convenience. */
  }
}

const evidenceDirectory = mkdtempSync(path.join(tmpdir(), 'lockstate-network-changed-'));
const evidencePath = path.join(evidenceDirectory, 'evidence.jsonl');

let exitCode = runPlaywright([], evidencePath);

if (exitCode !== 0) {
  const failedTestIds = readFailedTestIds();

  if (failedTestIds === undefined) {
    banner([
      `${BROWSER_SUITE_NO_RETRY_PREFIX} suite=${suite.name} reason=no-last-run-file`,
      'Playwright left no readable test-results/.last-run.json, so the run failed before it',
      `could record which tests failed. That is not ${NETWORK_CHANGED_ERROR_TEXT}; not retrying.`,
    ]);
    writeSummary({ retried: false, reason: 'no readable test-results/.last-run.json' });
  } else {
    const evidence = readEvidence(evidencePath);
    const failures: readonly BrowserSuiteFailure[] = failedTestIds.map((testId) => {
      const recorded = evidence.get(testId);
      return {
        testId,
        title: recorded?.title ?? testId,
        networkChangedObservations: recorded?.observations ?? 0,
      };
    });

    const decision = decideBrowserSuiteRetry(failures);

    if (!decision.retry) {
      banner([
        `${BROWSER_SUITE_NO_RETRY_PREFIX} suite=${suite.name} failures=${String(failures.length)} withSignature=${String(decision.withSignature.length)}`,
        decision.reason,
      ]);
      writeSummary({ retried: false, reason: decision.reason, failures });
    } else {
      banner([
        `${BROWSER_SUITE_RETRY_PREFIX} suite=${suite.name} tests=${String(decision.withSignature.length)} signature=${NETWORK_CHANGED_ERROR_TEXT}`,
        decision.reason,
        `The subject retried is ${suite.subject}.`,
        '',
        'This is issue #616: the host network reconfigured under Chromium and it aborted',
        'in-flight requests. `retries: 0` is still the default and this is the only',
        'signature that may bypass it. Count these lines to get the occurrence rate.',
      ]);

      if (process.env['GITHUB_ACTIONS'] === 'true') {
        process.stdout.write(
          `::warning title=${BROWSER_SUITE_RETRY_PREFIX} (${suite.name})::${decision.reason}\n`,
        );
      }

      const retryExitCode = runPlaywright(['--last-failed'], evidencePath);
      exitCode = retryExitCode;

      banner([
        `${BROWSER_SUITE_RETRY_PREFIX} suite=${suite.name} outcome=${retryExitCode === 0 ? 'green-after-retry' : 'still-red-after-retry'}`,
        retryExitCode === 0
          ? 'The retried tests passed. The suite is green because of a retry, not instead of one.'
          : 'The retried tests failed again, so this run is red and stays red.',
      ]);

      writeSummary({
        retried: true,
        reason: decision.reason,
        outcome: retryExitCode === 0 ? 'green-after-retry' : 'still-red-after-retry',
        failures,
      });
    }
  }
}

rmSync(evidenceDirectory, { recursive: true, force: true });
process.exit(exitCode);
