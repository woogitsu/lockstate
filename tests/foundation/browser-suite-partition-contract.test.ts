import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Two Playwright configs share one directory, and each answers a different
 * question about a different subject. This file asserts they still partition
 * the specs between them.
 *
 * ## The failure it exists for, which happened
 *
 * `tests/browser/playwright.config.ts` starts a Vite **dev server** over
 * `src/**`. `tests/browser/playwright.artifact.config.ts` starts `vite
 * preview` over `dist/`, which is workerd serving the built client. They live
 * side by side because they share Chromium provisioning and a CI job, and the
 * only thing separating what each one runs is a pair of regular expressions in
 * two different files.
 *
 * One of the two was written. `playwright.artifact.config.ts` narrows itself
 * with `testMatch: /production-artifact\.spec\.ts$/` and says exactly why:
 * *"The dev-server config matches `*.spec.ts` repository-wide, so without this
 * the artefact suite would try to run every harness spec against a server that
 * serves no harness pages."* The mirror image -- that the dev-server config
 * must not collect the artefact spec -- was not written, and the dev-server
 * config's `testMatch: /.*\.spec\.ts$/` duly collected it.
 *
 * CI run 33271621137, job `browser`, step "Run the real-browser suite"
 * (`Running 255 tests using 1 worker`, on `LOCKSTATE_BROWSER_TEST_PORT`):
 *
 *   ✘  80 tests/browser/production-artifact.spec.ts:128:3 ... (951ms)
 *      Error: A Worker was constructed from
 *      "/src/simulation/worker/worker.ts?worker_file&type=module", which is
 *      not a fingerprinted chunk under /assets/.
 *   ✓  81 tests/browser/production-artifact.spec.ts:249:3 ... (4.1s)
 *
 * `?worker_file` is Vite's **dev-server** worker URL. The production build was
 * never wrong -- the same commit emits ``new Worker(`/assets/worker-<hash>.js`)``
 * and `grep -ro 'worker_file' dist/` returns nothing -- and the artefact suite
 * proper never ran in that job, because the job died before reaching it.
 *
 * Both halves of that run are this layer's own failure mode. Test 80 went red
 * about a subject it was not looking at. Test 81 went **green for the wrong
 * reason**: it asserted a full worker round trip in "the built client" without
 * a `dist/` being involved at all.
 *
 * ## Why a contract test rather than only the `testIgnore` that fixes it
 *
 * The fix is one line in `playwright.config.ts`. What made the bug possible is
 * that two regexes in two files have to stay complementary, and nothing
 * checked that they did -- so the next spec added to either suite can
 * reintroduce it, in either direction: collected twice, or collected by
 * nothing at all. Collected-by-nothing is the worse one, because it is silent.
 *
 * These assertions run in `pnpm test`, which costs no browser and no build.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DEV_SERVER_CONFIG = 'tests/browser/playwright.config.ts';
const ARTIFACT_CONFIG = 'tests/browser/playwright.artifact.config.ts';
/**
 * THE CONFIG LIST IS DERIVED FROM DISK, NOT WRITTEN DOWN.
 *
 * It used to read `[DEV_SERVER_CONFIG, ARTIFACT_CONFIG] as const`, and that
 * made this whole contract blind to the failure it exists to prevent: a
 * **third** config. `tests/browser/playwright.playtest.config.ts` was added
 * and every assertion below passed -- not because the new config partitions
 * correctly, but because nothing here looked at it. A contract that enumerates
 * the things it checks can only ever check the things somebody remembered to
 * enumerate, and #578's whole finding was that a file nobody had thought about
 * was being run by a config nobody had re-read.
 *
 * So the list is a directory walk. Any `playwright*.config.ts` in
 * `tests/browser/` is subject to the partition, the moment it exists, whether
 * or not anyone updates this file.
 *
 * The two named constants above survive, and are used only in the failure
 * messages, which name specific configs because the remedy differs per config.
 * `assertsKnownConfigsPresent` below keeps them honest: if either is renamed,
 * this contract says so rather than quietly checking a smaller set.
 */
async function browserConfigPaths(): Promise<readonly string[]> {
  const directory = path.join(repositoryRoot, 'tests/browser');
  const entries = await readdir(directory, { withFileTypes: true });
  const found = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.startsWith('playwright') && entry.name.endsWith('.config.ts'),
    )
    .map((entry) => path.posix.join('tests/browser', entry.name))
    .sort();

  // Non-vacuity, in both directions. Zero configs would satisfy every
  // assertion below; a set that has lost one of the two the messages name
  // would check less than this file claims to.
  expect(
    found.length,
    'no `tests/browser/playwright*.config.ts` was found. Either the configs moved and this walk did not, or the walk is broken; fix the walk rather than restoring a hard-coded list.',
  ).toBeGreaterThanOrEqual(2);
  for (const known of [DEV_SERVER_CONFIG, ARTIFACT_CONFIG]) {
    expect(
      found,
      `${known} is named in this contract's failure messages but is not on disk. Rename it there in the same commit, or those messages point a reader at a file that does not exist.`,
    ).toContain(known);
  }

  return found;
}

/**
 * The one `testDir` expression this file knows how to resolve without
 * executing the config.
 *
 * Importing the configs is not an option: `playwright.artifact.config.ts`
 * throws at module scope when `dist/index.html` is absent, by design, so
 * importing it would make `pnpm test` depend on a production build. So the
 * expression is matched literally instead, and anything else is a failure
 * rather than a guess -- a `testDir` this file resolved wrongly would be a
 * partition check over the wrong directory, which is worse than none.
 */
const OWN_DIRECTORY_EXPRESSION = "fileURLToPath(new URL('.', import.meta.url))";

interface ParsedConfig {
  readonly configPath: string;
  /** Absolute, resolved from `testDir`. */
  readonly testDir: string;
  readonly testMatch: RegExp;
  readonly testIgnore: RegExp | undefined;
  /** The `webServer.command` template literal, verbatim. */
  readonly webServerCommand: string;
}

/** The value side of `key: value,` at any indentation, ignoring comments. */
function scalarOf(contents: string, key: string): string | undefined {
  const matches = contents
    .split(/\r?\n/u)
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .flatMap((line) => {
      const match = new RegExp(String.raw`^\s*${key}\s*:\s*(.+?),?\s*$`, 'u').exec(line);
      return match?.[1] === undefined ? [] : [match[1]];
    });

  expect(
    matches.length,
    `expected at most one \`${key}:\` in a Playwright config; found ${matches.length}. This parser reads one line per key, so a second one means it is now reading the wrong thing.`,
  ).toBeLessThanOrEqual(1);

  return matches[0];
}

/** `/body/flags` as written in source, turned into the RegExp it denotes. */
function regexLiteral(literal: string, where: string): RegExp {
  const match = /^\/(.*)\/([a-z]*)$/u.exec(literal);

  expect(
    match,
    `${where} is ${JSON.stringify(literal)}, which is not a regular-expression literal. Playwright also accepts a string or an array there; this contract only knows how to reason about a regex, so teach it the other forms in the same commit rather than leaving the partition unchecked.`,
  ).not.toBeNull();

  return new RegExp((match as RegExpExecArray)[1] as string, (match as RegExpExecArray)[2] as string);
}

async function parseConfig(configPath: string): Promise<ParsedConfig> {
  const contents = await readFile(path.join(repositoryRoot, configPath), 'utf8');

  const testDirExpression = scalarOf(contents, 'testDir');
  expect(
    testDirExpression,
    `${configPath} sets \`testDir\` to ${JSON.stringify(testDirExpression)}. This contract only resolves ${JSON.stringify(OWN_DIRECTORY_EXPRESSION)} -- "the directory this config is in" -- because it must not execute the config to find out. If the config now points somewhere else, resolve that form here in the same commit.`,
  ).toBe(OWN_DIRECTORY_EXPRESSION);

  const testMatch = scalarOf(contents, 'testMatch');
  expect(
    testMatch,
    `${configPath} declares no \`testMatch\`. Playwright's default would then decide what this suite runs, and the two suites' partition would stop being written down anywhere. State it.`,
  ).toBeDefined();

  const testIgnore = scalarOf(contents, 'testIgnore');
  const command = scalarOf(contents, 'command');
  expect(
    command,
    `${configPath} declares no \`webServer.command\`, so this contract cannot tell which subject it serves -- the sources or the built artefact -- and that distinction is the whole point of keeping two configs.`,
  ).toBeDefined();

  return {
    configPath,
    testDir: path.dirname(path.join(repositoryRoot, configPath)),
    testMatch: regexLiteral(testMatch as string, `${configPath}'s \`testMatch\``),
    testIgnore:
      testIgnore === undefined
        ? undefined
        : regexLiteral(testIgnore, `${configPath}'s \`testIgnore\``),
    webServerCommand: command as string,
  };
}

/**
 * Every browser TEST FILE under `directory`, absolute, recursively.
 *
 * **This collected only `*.spec.ts` until 2026-08-30, and that made the
 * comment on the config walk above a lie.** That comment promises *"any
 * `playwright*.config.ts` in `tests/browser/` is subject to the partition, the
 * moment it exists"* -- and it is, but only over the files this function
 * returns. `playwright.playtest.config.ts` collects `*.playtest.ts`, so every
 * playtest was outside the partition entirely: neither the "collected by
 * nothing" check nor the "collected twice" check could see one. A second
 * config claiming `*.playtest.ts`, or a `testIgnore` that orphaned a playtest,
 * would have passed in silence.
 *
 * Found by an independent audit reading the comment against the walker, which
 * is the same failure the config list itself had one commit earlier: a
 * contract that enumerates what it checks can only check what somebody
 * remembered to enumerate. The suffix list is now the thing to extend, and it
 * is asserted non-empty below rather than trusted.
 */
const BROWSER_TEST_SUFFIXES = ['.spec.ts', '.playtest.ts'] as const;

async function specFilesUnder(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await specFilesUnder(absolute)));
      continue;
    }
    if (entry.isFile() && BROWSER_TEST_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      found.push(absolute);
    }
  }

  return found.sort();
}

/**
 * Playwright matches `testMatch`/`testIgnore` against the file path with
 * forward slashes; on this repository's platforms that is the absolute path
 * as `path.join` already produces it.
 */
function collects(config: ParsedConfig, specFile: string): boolean {
  const relativeToDir = path.relative(config.testDir, specFile);
  if (relativeToDir.startsWith('..') || path.isAbsolute(relativeToDir)) {
    return false;
  }
  if (config.testIgnore?.test(specFile) === true) {
    return false;
  }
  return config.testMatch.test(specFile);
}

describe('browser suite partition contract', () => {
  it('runs every browser spec under exactly one Playwright config', async () => {
    const configs = await Promise.all((await browserConfigPaths()).map(parseConfig));
    const specFiles = [
      ...new Set((await Promise.all(configs.map((config) => specFilesUnder(config.testDir)))).flat()),
    ].sort();

    // Vacuity guard, in two directions. A partition over no files is satisfied
    // by any pair of configs, including two that run nothing -- and a suffix
    // list that has lost an entry silently shrinks the set being partitioned,
    // which is exactly the hole an audit found here on 2026-08-30.
    expect(
      BROWSER_TEST_SUFFIXES.length,
      'BROWSER_TEST_SUFFIXES is empty, so the walk below returns nothing and every assertion in this file passes vacuously.',
    ).toBeGreaterThan(0);
    for (const suffix of BROWSER_TEST_SUFFIXES) {
      expect(
        specFiles.some((file) => file.endsWith(suffix)),
        `no file ending in \`${suffix}\` was found under the configured test directories. Either that kind of browser test is gone and this entry should be too, or the walk stopped seeing it -- and a suffix nothing matches means that whole class is outside the partition without saying so.`,
      ).toBe(true);
    }
    // Vacuity guard. A partition over no files is satisfied by any pair of
    // configs, including two that run nothing.
    expect(
      specFiles.length,
      `no \`*.spec.ts\` files were found under the configured test directories (${configs
        .map((config) => path.relative(repositoryRoot, config.testDir))
        .join(', ')}). Either the specs moved and this contract did not, or the walk is broken; fix the walk rather than deleting the guard.`,
    ).toBeGreaterThan(0);

    const collectedByNothing: string[] = [];
    const collectedTwice: string[] = [];

    for (const specFile of specFiles) {
      const owners = configs.filter((config) => collects(config, specFile));
      const relative = path.relative(repositoryRoot, specFile);
      if (owners.length === 0) {
        collectedByNothing.push(relative);
      } else if (owners.length > 1) {
        collectedTwice.push(`${relative} (run by ${owners.map((owner) => owner.configPath).join(' and ')})`);
      }
    }

    expect(
      collectedTwice,
      `a browser test file is collected by more than one Playwright config, so it is driven against a Vite dev server over \`src/**\` as well as against the built artefact in \`dist/\`. That is how CI run 33271621137 reported \`production-artifact.spec.ts\` red on "/src/simulation/worker/worker.ts?worker_file&type=module" -- the dev-server worker URL -- while the production build was emitting \`/assets/worker-<hash>.js\` correctly. Decide which server the spec is about and exclude it from the other, in ${DEV_SERVER_CONFIG}'s \`testIgnore\` or ${ARTIFACT_CONFIG}'s \`testMatch\`.`,
    ).toEqual([]);

    expect(
      collectedByNothing,
      `a browser test file is collected by NO Playwright config, so it never runs and nothing says so: \`playwright test\` only fails on an empty *suite*, not on a file no suite claims. ${DEV_SERVER_CONFIG} excluding a spec that ${ARTIFACT_CONFIG} does not include is one way in; a \`*.playtest.ts\` that no config's \`testMatch\` reaches is another, and that class was outside this contract entirely until 2026-08-30.`,
    ).toEqual([]);
  });

  it('keeps the artefact spec on the server that serves dist/, and only there', async () => {
    const configs = await Promise.all((await browserConfigPaths()).map(parseConfig));

    /*
     * The partition above is about names. This is about subjects, and it is
     * the assertion that would have failed on the broken commit even if the
     * two suites had been split some other way: the spec whose contract is
     * "the built client builds its worker from its own emitted chunk" has to
     * be run against a server that serves the build.
     *
     * `vite preview` is what serves `dist/`; the dev server is `vite` with
     * `--config tests/browser/vite.config.ts`, which that config describes as
     * loading "no Cloudflare plugin" and never participating in `pnpm build`.
     */
    const previewServers = configs.filter((config) => /\bpreview\b/u.test(config.webServerCommand));
    const devServers = configs.filter((config) =>
      config.webServerCommand.includes('tests/browser/vite.config.ts'),
    );

    expect(
      previewServers.map((config) => config.configPath),
      `exactly one Playwright config must start \`vite preview\`, which is the only web server here that serves \`dist/\` rather than \`src/**\`. Commands read: ${configs
        .map((config) => `${config.configPath} -> ${config.webServerCommand}`)
        .join('; ')}`,
    ).toEqual([ARTIFACT_CONFIG]);

    /*
     * THIS USED TO SAY "EXACTLY ONE", AND THAT WAS THE TWO-CONFIG SPELLING OF
     * A NARROWER PROPERTY.
     *
     * `.toEqual([DEV_SERVER_CONFIG])` reads as a statement about how many
     * configs serve the sources. It is not: the reason written beside it is
     * *"if the ARTEFACT config ever starts that server, everything it asserts
     * about the artefact becomes an assertion about the sources"* -- which
     * constrains one config, not the count. The two coincided only while there
     * were exactly two configs.
     *
     * `playwright.playtest.config.ts` is the case that separated them. It
     * serves the harness dev server on purpose, because a playtest plays the
     * sources, and under "exactly one" that correct config failed a contract
     * whose own stated reason it does not violate. Generalised here to the two
     * halves that are actually load-bearing, so a fourth config that plays the
     * sources is fine and a config that muddles the artefact is still caught.
     */
    expect(
      devServers.map((config) => config.configPath),
      `the artefact config must NOT start the harness dev server (\`--config tests/browser/vite.config.ts\`): if it did, everything it asserts about the artefact would become an assertion about the sources. Commands read: ${configs
        .map((config) => `${config.configPath} -> ${config.webServerCommand}`)
        .join('; ')}`,
    ).not.toContain(ARTIFACT_CONFIG);

    expect(
      devServers.map((config) => config.configPath),
      `at least one Playwright config must start the harness dev server, or nothing in this repository drives \`src/**\` in a browser at all. This is the vacuity guard on the assertion above: "the artefact config is not among them" is satisfied trivially by an empty set.`,
    ).toContain(DEV_SERVER_CONFIG);

    const artefactSpec = path.join(repositoryRoot, 'tests/browser/production-artifact.spec.ts');
    const owners = configs.filter((config) => collects(config, artefactSpec));

    expect(
      owners.map((config) => config.configPath),
      `\`tests/browser/production-artifact.spec.ts\` must be run by the config that serves \`dist/\` and by nothing else. Run against the dev server it asserts the dev server's worker URL shape, which is \`?worker_file\` and is not a chunk under \`/assets/\` -- a red gate about the wrong subject, with a second test in the same file going green having never touched a build.`,
    ).toEqual([ARTIFACT_CONFIG]);
  });
});
