import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for repository *configuration* — the files that describe how
 * this project is built, checked out and deployed, as opposed to the code that
 * runs. Issue #138 found four gates that were weaker than they looked, and
 * every one of them was invisible for the same reason: the configuration file
 * and the check that is supposed to enforce it lived apart, so editing one and
 * not the other left the suite green.
 *
 * These tests close that gap mechanically. They read the configuration and the
 * checker and assert that the two still agree, so a header, a line-ending
 * pattern or a provisioning script cannot be added on one side alone.
 *
 * Sibling of `tests/foundation/repository-contract.test.ts`, which asserts the
 * same kind of repository-shaped fact about the toolchain pins and tsconfig.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

/**
 * `git` is the authority on both file modes and attribute resolution, and
 * re-implementing either in TypeScript is how these tests would become a
 * fiction that agrees with itself. A missing or failing `git` is therefore a
 * failure rather than a skip: every checkout of this repository is a git
 * checkout, and CI runs on one.
 */
function git(args: readonly string[]): string {
  const result = spawnSync('git', [...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(`git ${args.join(' ')} could not be run: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${String(result.status)}: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

interface HeaderRule {
  readonly pathPattern: string;
  readonly headerName: string;
  readonly headerValue: string;
}

/**
 * Parses the Cloudflare `_headers` format: an unindented path pattern opens a
 * rule, and the indented `Name: value` lines under it are the headers that
 * rule sets. Blank lines and `#` comments are ignored.
 */
function parseHeadersFile(contents: string): readonly HeaderRule[] {
  const rules: HeaderRule[] = [];
  let pathPattern: string | undefined;

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim().length === 0 || line.trim().startsWith('#')) {
      continue;
    }

    if (!/^\s/u.test(line)) {
      pathPattern = line.trim();
      continue;
    }

    const separator = line.indexOf(':');
    expect(
      separator,
      `public/_headers line "${line.trim()}" is indented but is not a "Name: value" header.`,
    ).toBeGreaterThan(0);
    expect(pathPattern, `public/_headers sets a header before any path pattern: "${line.trim()}".`)
      .toBeDefined();

    rules.push({
      pathPattern: pathPattern ?? '',
      headerName: line.slice(0, separator).trim(),
      headerValue: line.slice(separator + 1).trim(),
    });
  }

  expect(rules.length, 'public/_headers parsed to no rules at all; the parser is broken.')
    .toBeGreaterThan(0);

  return rules;
}

/**
 * Reads `SECURITY_HEADER_BASELINE` out of the verifier as text rather than
 * importing it. `scripts/verify-deployment-preview.mjs` calls `main()` at
 * module scope, so importing it would build the project and start a preview
 * server from inside a unit test.
 *
 * A parser that silently returned an empty set would make the assertions below
 * vacuously true, so failing to find the declaration is an explicit failure.
 */
function parseSecurityHeaderBaseline(source: string): ReadonlyMap<string, string> {
  const declaration = /const SECURITY_HEADER_BASELINE = \[([\s\S]*?)\];/u.exec(source);
  expect(
    declaration?.[1],
    'Could not find the SECURITY_HEADER_BASELINE declaration in scripts/verify-deployment-preview.mjs.',
  ).toBeDefined();

  const entries = new Map<string, string>();
  for (const pair of (declaration?.[1] ?? '').matchAll(/\[\s*'([^']+)'\s*,\s*'([^']*)'\s*\]/gu)) {
    entries.set((pair[1] ?? '').toLowerCase(), pair[2] ?? '');
  }

  expect(
    entries.size,
    'SECURITY_HEADER_BASELINE was found but parsed to no entries; the parser is broken.',
  ).toBeGreaterThan(0);

  return entries;
}

describe('deployment header contract', () => {
  /**
   * The other direction is already covered, and the two catch different
   * mistakes:
   *
   *   * `scripts/verify-deployment-preview.mjs` asserts its baseline against a
   *     real preview response, which catches a header *deleted from or
   *     weakened in* `public/_headers` — the surviving mutation in #138, where
   *     removing three of the four left every gate green.
   *   * This test asserts the reverse inclusion, which catches a header
   *     *added to* `public/_headers` and never asserted anywhere — a rule that
   *     looks enforced because its neighbours are.
   */
  it('asserts every header public/_headers sets', async () => {
    const rules = parseHeadersFile(await readRepositoryFile('public/_headers'));
    const verifierSource = await readRepositoryFile('scripts/verify-deployment-preview.mjs');
    const baseline = parseSecurityHeaderBaseline(verifierSource);

    for (const rule of rules) {
      expect(
        verifierSource.toLowerCase(),
        `public/_headers sets ${rule.headerName} on ${rule.pathPattern}, but scripts/verify-deployment-preview.mjs never mentions it, so nothing checks that a deployment actually sends it.`,
      ).toContain(rule.headerName.toLowerCase());
    }

    // The `/*` rule is the security-header rule, and for it "mentioned
    // somewhere in the verifier" is too weak: the value has to match too,
    // otherwise `Referrer-Policy: unsafe-url` would ship with the assertion
    // still pointing at the old value.
    const securityRules = rules.filter((rule) => rule.pathPattern === '/*');
    expect(
      securityRules.length,
      'public/_headers no longer has a /* rule; the security-header baseline applies to nothing.',
    ).toBeGreaterThan(0);

    for (const rule of securityRules) {
      expect(
        baseline.get(rule.headerName.toLowerCase()),
        `public/_headers sets ${rule.headerName} on /*, so SECURITY_HEADER_BASELINE in scripts/verify-deployment-preview.mjs must require the same value.`,
      ).toBe(rule.headerValue);
    }
  });
});

describe('line-ending contract', () => {
  /**
   * `.gitattributes` pins LF by extension because a CRLF file with a shebang
   * fails on Linux with a bad-interpreter error. Issue #138 found that
   * `scripts/verify-supabase-sql.mjs` — mode 755, `#!/usr/bin/env node` — was
   * matched by neither `*.sql` nor `*.sh`, which is precisely the failure the
   * comment in `.gitattributes` claims to prevent, live for an owner who runs
   * git from Windows (#95).
   *
   * Mode bits come from `git ls-files -s` and the attribute from
   * `git check-attr`, so this tracks what git will actually do on checkout
   * rather than a second implementation of gitattributes pattern matching.
   */
  it('pins LF for every executable file with a shebang', async () => {
    const executables = git(['ls-files', '-s'])
      .split('\n')
      .flatMap((line) => {
        const match = /^100755\s+\S+\s+\S+\t(.+)$/u.exec(line);
        return match?.[1] === undefined ? [] : [match[1]];
      });

    expect(
      executables.length,
      'No mode-755 tracked files were found; the `git ls-files -s` parse is broken.',
    ).toBeGreaterThan(0);

    const shebangScripts: string[] = [];
    for (const file of executables) {
      const contents = await readFile(path.join(repositoryRoot, file), 'utf8');
      if (contents.startsWith('#!')) {
        shebangScripts.push(file);
      }
    }

    expect(
      shebangScripts.length,
      'No executable file with a shebang was found; this test would assert nothing.',
    ).toBeGreaterThan(0);

    const attributes = git(['check-attr', 'text', 'eol', '--', ...shebangScripts]);

    for (const file of shebangScripts) {
      expect(
        attributes,
        `${file} is executable and starts with a shebang, so .gitattributes must pin it to LF — a CRLF checkout of it fails on Linux with a bad-interpreter error.`,
      ).toContain(`${file}: eol: lf`);
    }
  });
});

describe('Supabase local-stack configuration contract', () => {
  /**
   * Reads one key out of one `[section]` of `supabase/config.toml` by hand.
   * A TOML parser would be a dependency for something trivial, which
   * `AGENTS.md` forbids, and this needs two scalar reads from a file whose
   * shape the Supabase CLI controls.
   */
  function readTomlValue(source: string, section: string, key: string): string | undefined {
    const lines = source.split('\n');
    let inSection = false;
    let collected: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#')) {
        continue;
      }

      if (/^\[[^\]]+\]$/u.test(trimmed)) {
        inSection = trimmed === `[${section}]`;
        continue;
      }

      if (!inSection) {
        continue;
      }

      if (collected !== undefined) {
        collected += ` ${trimmed}`;
        if (trimmed.includes(']')) {
          break;
        }
        continue;
      }

      const match = new RegExp(`^${key}\\s*=\\s*(.*)$`, 'u').exec(trimmed);
      if (match?.[1] === undefined) {
        continue;
      }

      collected = match[1];
      if (!collected.startsWith('[') || collected.includes(']')) {
        break;
      }
    }

    return collected;
  }

  /**
   * `supabase init` leaves seeding enabled against `./seed.sql`, a file this
   * repository has never had, and `supabase db reset` is the only thing that
   * would ever have said so (issue #138). The invariant is non-vacuous in both
   * states: enabled means every listed path must resolve to a real file,
   * disabled means the list must be empty rather than left pointing at
   * something imaginary.
   */
  it('never enables seeding against a file that does not exist', async () => {
    const config = await readRepositoryFile('supabase/config.toml');
    const enabled = readTomlValue(config, 'db.seed', 'enabled');
    const sqlPaths = readTomlValue(config, 'db.seed', 'sql_paths');

    expect(enabled, 'Could not read [db.seed] enabled from supabase/config.toml.').toBeDefined();
    expect(sqlPaths, 'Could not read [db.seed] sql_paths from supabase/config.toml.').toBeDefined();

    const paths = [...(sqlPaths ?? '').matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? '');

    if (enabled === 'false') {
      expect(
        paths,
        '[db.seed] is disabled, so sql_paths must be empty rather than naming seed files that are not loaded.',
      ).toEqual([]);
      return;
    }

    expect(
      paths.length,
      '[db.seed] is enabled but names no seed files, so a db reset seeds nothing.',
    ).toBeGreaterThan(0);

    for (const seedPath of paths) {
      // Supabase resolves these relative to supabase/, and supports globs.
      const matches = git(['ls-files', '--', path.posix.join('supabase', seedPath)])
        .split('\n')
        .filter((line) => line.trim().length > 0);

      expect(
        matches.length,
        `[db.seed] sql_paths lists "${seedPath}", which matches no tracked file under supabase/. A db reset would fail on it.`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('provisioning contract', () => {
  /**
   * A provisioning script that nothing calls is a script that rots: it is
   * written for a gate, the gate is never wired to it, and the next person to
   * need it finds a stale one. Issue #138 found the session-start hook calling
   * one of four.
   *
   * Anything genuinely meant to be run by hand belongs in
   * `INTENTIONALLY_MANUAL` with the reason, so "nobody calls this" is a
   * recorded decision rather than an omission. It is empty today: all four
   * scripts are wired.
   */
  const INTENTIONALLY_MANUAL = new Map<string, string>();

  it('calls every provisioning script from a workflow or the session hook', async () => {
    const scriptNames = (await readdir(path.join(repositoryRoot, 'scripts')))
      .filter((name) => name.startsWith('provision-') && name.endsWith('.sh'))
      .sort();

    expect(
      scriptNames.length,
      'No scripts/provision-*.sh were found; this test would assert nothing.',
    ).toBeGreaterThan(0);

    const workflowDirectory = path.join(repositoryRoot, '.github', 'workflows');
    const callerPaths = [
      ...(await readdir(workflowDirectory))
        .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
        .map((name) => path.join('.github', 'workflows', name)),
      path.join('.claude', 'hooks', 'session-start.sh'),
    ];

    /**
     * A script merely *named* must not read as a call site. Both these
     * workflows and that hook explain themselves at length, and the hook now
     * prints `bash scripts/provision-git-lfs.sh` inside a log message telling
     * the reader how to run it by hand -- so stripping `#` comments is not
     * enough. Removing the real call from ci.yml while that log line stood
     * kept this test green, which is how the weakness was found.
     *
     * So a line counts only when the script sits in *command position*: the
     * line, once a YAML list dash and a `run:` key and a shell `if !` guard
     * are peeled off, has to begin with the thing that runs it.
     */
    const invocationLines: string[] = [];
    for (const callerPath of callerPaths) {
      for (const rawLine of (await readRepositoryFile(callerPath)).split('\n')) {
        const line = rawLine
          .trim()
          .replace(/^-\s+/u, '')
          .replace(/^run:\s*/u, '')
          .replace(/^if\s+!\s+/u, '');

        if (line.startsWith('#')) {
          continue;
        }

        if (/^(?:bash|sh|exec|\.\/|source|\.\s)/u.test(line)) {
          invocationLines.push(line);
        }
      }
    }

    expect(
      invocationLines.length,
      'No script invocations were found in any workflow or the session hook; the invocation parse is broken.',
    ).toBeGreaterThan(0);

    const invocations = invocationLines.join('\n');

    for (const scriptName of scriptNames) {
      const manualReason = INTENTIONALLY_MANUAL.get(scriptName);
      if (manualReason !== undefined) {
        expect(
          manualReason.length,
          `${scriptName} is listed as intentionally manual but gives no reason.`,
        ).toBeGreaterThan(0);
        continue;
      }

      expect(
        invocations,
        `scripts/${scriptName} is called by no workflow and not by .claude/hooks/session-start.sh. Wire it to a gate, or list it in INTENTIONALLY_MANUAL with the reason it is run by hand.`,
      ).toContain(`scripts/${scriptName}`);
    }

    for (const scriptName of INTENTIONALLY_MANUAL.keys()) {
      expect(
        scriptNames,
        `${scriptName} is listed in INTENTIONALLY_MANUAL but scripts/ has no such file.`,
      ).toContain(scriptName);
    }
  });
});
