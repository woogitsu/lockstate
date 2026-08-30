/**
 * The browser gates this repository runs, and the argument parsing that picks
 * one of them.
 *
 * ## Why this is a registry rather than a constant in `run-suite.ts`
 *
 * There are two browser gates and they are not the same test.
 * `tests/browser/playwright.config.ts` drives a Vite dev server over `src/**`;
 * `tests/browser/playwright.artifact.config.ts` drives `vite preview` over
 * `dist/`, which is workerd serving the artefact a player downloads. Both are
 * required CI steps, both open Chromium against a page that loads its module
 * graph over HTTP, and both are therefore exposed to the one failure class
 * #616 settled: the host network reconfiguring mid-run so Chromium aborts
 * in-flight requests with `net::ERR_NETWORK_CHANGED`.
 *
 * Until #652 only the first went through `run-suite.ts`. `pnpm test:artifact`
 * invoked `playwright test` directly, so nothing set
 * `LOCKSTATE_NETWORK_CHANGED_EVIDENCE`, the fixture's `appendEvidence` returned
 * at its first line, and no process was in a position to read the evidence and
 * decide anything. The artefact spec imported the fixture the whole time, which
 * is what made the hole quiet: the listeners really did attach, and their
 * observations really did go nowhere.
 *
 * The owner's ruling of 2026-08-30 on #652 was to route the artefact gate
 * through the same wrapper rather than to document the exception, **so that the
 * retry decision exists once**. This file is what makes "once" true: one
 * wrapper process, one decision function, and a suite chosen by name on the
 * command line.
 *
 * ## Why the selection logic is here, in a module that touches nothing
 *
 * Same reason `network-changed-signature.ts` gives for itself. `run-suite.ts`
 * spawns Playwright at module scope, so importing it from Vitest would run a
 * browser suite; nothing in this file spawns, reads or writes anything, so
 * `tests/foundation/browser-suite-selection.test.ts` drives it directly and a
 * mutation of it can be watched going red.
 */

/** One browser gate: a Playwright config, and what it is a gate over. */
export interface BrowserSuiteDefinition {
  /** The name `--suite` takes, and the name that appears in the retry log lines. */
  readonly name: string;
  /** Repository-relative path, passed to `playwright test --config`. */
  readonly config: string;
  /** One clause naming the subject, for the banner and the usage error. */
  readonly subject: string;
}

/**
 * Every suite `run-suite.ts` can drive.
 *
 * `tests/browser/playwright.playtest.config.ts` is deliberately absent. It is
 * not a gate: it collects `*.playtest.ts`, nothing in CI runs it, and its
 * output is a research document rather than a pass or a fail, so there is no
 * red run for a retry to act on. `tests/foundation/browser-network-changed-retry-contract.test.ts`
 * holds that exclusion in writing and fails if a fourth config appears that is
 * neither listed here nor excluded there.
 */
export const BROWSER_SUITES: readonly BrowserSuiteDefinition[] = [
  {
    name: 'browser',
    config: 'tests/browser/playwright.config.ts',
    subject: 'the sources, served by a Vite dev server over `src/**`',
  },
  {
    name: 'artifact',
    config: 'tests/browser/playwright.artifact.config.ts',
    subject: 'the built client in `dist/`, served by workerd through `vite preview`',
  },
];

/**
 * The suite `run-suite.ts` runs when nothing names one.
 *
 * `pnpm test:browser` is the older of the two entry points and predates there
 * being a choice; leaving it able to say nothing keeps every `pnpm test:browser
 * <extra playwright args>` a developer has in their shell working unchanged.
 */
export const DEFAULT_BROWSER_SUITE_NAME = 'browser';

/** The flag that names a suite. */
export const SUITE_FLAG = '--suite';

export interface BrowserSuiteSelection {
  readonly suite: BrowserSuiteDefinition;
  /** Everything that was not the suite flag, in order, for Playwright. */
  readonly forwarded: readonly string[];
}

export type BrowserSuiteSelectionResult =
  | { readonly ok: true; readonly selection: BrowserSuiteSelection }
  | { readonly ok: false; readonly error: string };

function knownNames(): string {
  return BROWSER_SUITES.map((suite) => suite.name).join(', ');
}

/**
 * Read `--suite <name>` / `--suite=<name>` out of a command line, and hand back
 * both the suite and everything else in the order it arrived.
 *
 * Three refusals, and each is a failure rather than a fallback on purpose. A
 * wrapper that guessed which gate it was running would run the wrong gate
 * silently, and running the wrong gate is the defect #578 exists for: the
 * artefact spec was once executed against the dev server and **passed** while
 * asserting a property of the built client.
 *
 * - An unknown name is not "probably the default". It is a typo in a CI step or
 *   a config that was renamed and left half-wired.
 * - A trailing `--suite` with nothing after it is not "the default with a stray
 *   flag". Playwright would receive neither the flag nor a config it recognises.
 * - Naming it twice is not "the last one wins". Two names in one invocation
 *   means two intentions, and picking one of them quietly is how a CI step ends
 *   up measuring the other subject.
 */
export function selectBrowserSuite(argv: readonly string[]): BrowserSuiteSelectionResult {
  const forwarded: string[] = [];
  let requestedName: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    let value: string | undefined;
    if (argument === SUITE_FLAG) {
      value = argv[index + 1];
      if (value === undefined) {
        return {
          ok: false,
          error: `\`${SUITE_FLAG}\` was given with no suite after it. Name one of: ${knownNames()}.`,
        };
      }
      index += 1;
    } else if (argument.startsWith(`${SUITE_FLAG}=`)) {
      value = argument.slice(SUITE_FLAG.length + 1);
    } else {
      forwarded.push(argument);
      continue;
    }

    if (requestedName !== undefined) {
      return {
        ok: false,
        error: `\`${SUITE_FLAG}\` was given twice (${requestedName}, then ${value}). One invocation runs one suite; say which.`,
      };
    }

    requestedName = value;
  }

  const name = requestedName ?? DEFAULT_BROWSER_SUITE_NAME;
  const suite = BROWSER_SUITES.find((candidate) => candidate.name === name);

  if (suite === undefined) {
    return {
      ok: false,
      error: `no browser suite is called ${JSON.stringify(name)}. Known suites: ${knownNames()}.`,
    };
  }

  return { ok: true, selection: { suite, forwarded } };
}
