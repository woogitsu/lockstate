import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BROWSER_SUITES } from '../browser/browser-suites';

/**
 * The wiring that makes the `net::ERR_NETWORK_CHANGED` retry reach every
 * browser test, asserted from `pnpm test` so that breaking it costs a red
 * unit suite rather than a silent hole in a six-minute browser job.
 *
 * ## What can go wrong here without anything noticing
 *
 * The mechanism is three files that have to stay pointed at each other:
 * `run-suite.ts` runs the suite and decides, `network-changed-fixture.ts`
 * records what Chromium reported, and every spec has to import its `test`
 * object from that fixture rather than from `@playwright/test`. Only the last
 * of those is spread across twenty-odd files, and it is the one that rots: a
 * new spec written by copying an old one's header from before this change
 * imports `test` straight from Playwright, runs with no listeners attached,
 * and is simply absent from the evidence. It would not fail. It would be
 * invisible -- which is the exact property #616 spent three investigations
 * paying for.
 *
 * ## What it deliberately does not check
 *
 * That Chromium reports this error at all, that Playwright surfaces it on
 * `context.on('requestfailed')`, or that `--last-failed` re-runs what this
 * repository thinks it re-runs. None of those is readable from source, and all
 * three were demonstrated by running the suite with the signature fabricated
 * and watching the retry happen (and with an ordinary assertion failure, and
 * watching it not).
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FIXTURE = 'tests/browser/network-changed-fixture.ts';
const RUNNER = 'tests/browser/run-suite.ts';
const REGISTRY = 'tests/browser/browser-suites.ts';
const PLAYWRIGHT_CONFIG = 'tests/browser/playwright.config.ts';
const ARTIFACT_CONFIG = 'tests/browser/playwright.artifact.config.ts';

/**
 * Every Playwright config in `tests/browser/` that the wrapper deliberately
 * does NOT drive, with the reason, because #652 was exactly this fact going
 * unwritten: `pnpm test:artifact` bypassed the wrapper, the artefact spec
 * imported the evidence fixture anyway, and the arrangement read as covered
 * from every file involved.
 *
 * A config on this list is a decision. A config on neither this list nor the
 * registry in `browser-suites.ts` is an oversight, and the test below is what
 * tells the two apart.
 */
const CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE = new Map<string, string>([
  [
    'tests/browser/playwright.playtest.config.ts',
    'it is not a gate: nothing in CI runs it, it collects `*.playtest.ts` by hand, and its output is a research document rather than a pass or a fail, so there is no red run for a retry to act on.',
  ],
]);

/** The package.json scripts that must reach Playwright through the wrapper. */
const GATE_SCRIPTS = ['test:browser', 'test:artifact'] as const;

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

async function specFileNames(): Promise<readonly string[]> {
  const entries = await readdir(path.join(repositoryRoot, 'tests/browser'), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => entry.name)
    .sort();
}

describe('browser network-changed retry contract', () => {
  it('routes every browser spec through the fixture that watches for the signature', async () => {
    const names = await specFileNames();

    // Vacuity guard: an empty directory satisfies every assertion below.
    expect(
      names.length,
      'no `*.spec.ts` was found in `tests/browser/`. Either the specs moved and this contract did not, or the walk is broken; fix the walk rather than deleting the guard.',
    ).toBeGreaterThan(10);

    const offenders: string[] = [];
    const usingFixture: string[] = [];

    for (const name of names) {
      const contents = await read(path.posix.join('tests/browser', name));
      if (contents.includes("'@playwright/test'")) {
        offenders.push(name);
      }
      if (contents.includes("'./network-changed-fixture'")) {
        usingFixture.push(name);
      }
    }

    expect(
      offenders,
      `these browser specs import from '@playwright/test' directly. The \`test\` object they get that way has no listeners on it, so a run of theirs that is aborted by ${'net::ERR_NETWORK_CHANGED'} records no evidence at all and \`${RUNNER}\` cannot tell it apart from an ordinary failure -- the failure would be red for the wrong reason, or, worse, block a retry that every other failing test qualified for. Import from './network-changed-fixture', which re-exports \`expect\` and the types too.`,
    ).toEqual([]);

    expect(
      usingFixture,
      `every browser spec must import its \`test\` object from ${FIXTURE}. This is the other direction of the assertion above: a spec that imports from neither place is a spec that does not run, and "no '@playwright/test' import" is satisfied trivially by an empty file.`,
    ).toEqual(names);
  });

  it('keeps the fixture automatic and listening on the context for the whole test', async () => {
    const fixture = await read(FIXTURE);

    expect(
      fixture,
      `${FIXTURE} must register its fixture with \`{ auto: true }\`. Without it the fixture is set up only for tests that name it, which is none of them, and the mechanism records nothing while looking installed.`,
    ).toContain('{ auto: true }');

    /*
     * Context, not page. #616's fifth occurrence aborted the *simulation
     * worker's* module graph rather than the page's, and a context-level
     * listener covers every page and worker in the context.
     */
    expect(
      fixture,
      `${FIXTURE} must attach its listeners to the browser \`context\`. #616's fifth occurrence aborted the simulation worker's module graph, not the page's.`,
    ).toContain("context.on('requestfailed'");
    expect(fixture).toContain("context.on('console'");

    /*
     * The ruling's hardest constraint: the aborts were spread across ~52
     * seconds, so evidence has to be accumulated over the test rather than
     * sampled. Listeners registered for the fixture's lifetime do that; a
     * one-shot read would not. This asserts the shape that makes it true --
     * the listeners are removed only in a `finally`, after `await use()`.
     */
    expect(
      fixture.indexOf('await use()'),
      `${FIXTURE} must attach its listeners before \`await use()\` and remove them after, so the window it observes is the whole test. #616 measured the aborts spread across ~52 seconds; anything that samples at one instant can miss a window that wide.`,
    ).toBeGreaterThan(fixture.indexOf("context.on('requestfailed'"));
    expect(fixture.indexOf("context.off('requestfailed'")).toBeGreaterThan(
      fixture.indexOf('await use()'),
    );
  });

  it('leaves `retries: 0` as the default the retry has to earn its way past', async () => {
    // Both gates, since #652: the wrapper drives them both, so a `retries:`
    // above zero in either config would be the blanket retry happening below
    // the one place the decision is supposed to live.
    for (const configPath of [PLAYWRIGHT_CONFIG, ARTIFACT_CONFIG]) {
      const config = await read(configPath);

      expect(
        config
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('retries:')),
        `${configPath} must still declare exactly \`retries: 0,\`. The owner's ruling on #616 declined option 2 -- \`retries: 1\` on \`main\` -- precisely because a blanket retry dulls a real intermittent defect. The conditional retry lives in ${RUNNER} and is not a licence to relax this.`,
      ).toEqual(['retries: 0,']);
    }
  });

  it('runs the suite through the wrapper, and retries with --last-failed', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };

    for (const scriptName of GATE_SCRIPTS) {
      expect(
        manifest.scripts[scriptName],
        `\`pnpm ${scriptName}\` must run ${RUNNER}. CI's \`browser\` job invokes these script names and nothing else, so pointing one back at \`playwright test\` directly removes the retry from that gate without changing a line of the workflow -- which is precisely the state #652 found \`test:artifact\` in, with the fixture imported and its observations going nowhere.`,
      ).toContain(RUNNER);
    }

    const runner = await read(RUNNER);

    expect(
      runner,
      `${RUNNER} must retry with \`--last-failed\`, which re-runs exactly the tests \`test-results/.last-run.json\` recorded as failed. That file is also where the runner reads the failing set from, so the decision and the retry cannot disagree about which tests are involved.`,
    ).toContain("'--last-failed'");

    expect(
      runner,
      `${RUNNER} must read \`test-results/.last-run.json\` rather than trusting the fixture's own record of what failed. A test killed by a 60-second timeout may never reach fixture teardown, and Playwright's own file is the authority on which tests failed.`,
    ).toContain('.last-run.json');
  });

  /**
   * The drift guard #652 asked for. The hole it closes is not a wrong line
   * anywhere -- it is a config that no entry point sends through the wrapper,
   * which reads as covered from every file involved because the specs import
   * the fixture regardless.
   */
  it('drives, or writes down as excluded, every Playwright config in tests/browser/', async () => {
    const entries = await readdir(path.join(repositoryRoot, 'tests/browser'), {
      withFileTypes: true,
    });
    const configs = entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.startsWith('playwright') && entry.name.endsWith('.config.ts'),
      )
      .map((entry) => path.posix.join('tests/browser', entry.name))
      .sort();

    // Vacuity guard: an empty walk satisfies the loop below trivially.
    expect(
      configs.length,
      'no `tests/browser/playwright*.config.ts` was found. Either the configs moved and this walk did not, or the walk is broken; fix the walk rather than deleting the guard.',
    ).toBeGreaterThanOrEqual(2);

    const driven = new Set(BROWSER_SUITES.map((suite) => suite.config));

    for (const config of configs) {
      expect(
        driven.has(config) || CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE.has(config),
        `${config} is a Playwright config that ${RUNNER} does not drive and that nothing here records as deliberately excluded. Either add it to \`BROWSER_SUITES\` in ${REGISTRY} and give it an entry point, or add it to \`CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE\` above with the reason. #652 is what the third option costs: \`test:artifact\` bypassed the wrapper for as long as it did because no file was obliged to say so.`,
      ).toBe(true);
    }

    // The exclusion list must not outlive the config it excuses, or it becomes
    // a reason for something that is no longer there.
    for (const excluded of CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE.keys()) {
      expect(
        configs,
        `${excluded} is written down here as a config the wrapper deliberately does not drive, but it is not on disk. Remove the entry in the same commit as the config, or this list explains an absence.`,
      ).toContain(excluded);
    }

    // And a config cannot be both, which would leave a reader with two answers.
    for (const config of driven) {
      expect(
        CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE.has(config),
        `${config} is both driven by ${RUNNER} and listed as excluded from it.`,
      ).toBe(false);
    }
  });

  it('leaves no package.json script naming a browser config behind the wrapper\u2019s back', async () => {
    const manifest = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };

    const offenders = Object.entries(manifest.scripts).filter(([, command]) => {
      const named = /tests\/browser\/playwright[\w.]*\.config\.ts/u.exec(command)?.[0];
      if (named === undefined || command.includes(RUNNER)) {
        return false;
      }
      // A script for a config the list above excuses is not an offender; the
      // reason it is not driven is already written down.
      return !CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE.has(named);
    });

    expect(
      offenders.map(([name]) => name),
      `these package.json scripts name a browser Playwright config without going through ${RUNNER}, so the run they start records no ${'net::ERR_NETWORK_CHANGED'} evidence and nothing decides a retry for it. That was \`test:artifact\` until #652. Route it through the wrapper with \`--suite <name>\`, or, if it is genuinely not a gate, give it a config on \`CONFIGS_THE_WRAPPER_DOES_NOT_DRIVE\` and say why there.`,
    ).toEqual([]);
  });
});
