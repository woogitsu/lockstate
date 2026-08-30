import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every module this repository tracks is inside some TypeScript project.
 *
 * ## The defect this closes
 *
 * `tsconfig.json`'s `include` was `["src", "tests", "vite.config.ts",
 * "vitest.config.ts"]`, and `benchmarks/`, `scripts/` and `tooling/` -- about
 * 3,600 lines of `.mjs` that build the product, deploy it and gate its
 * performance -- were outside it entirely. So a change to a production
 * signature was invisible to `pnpm typecheck` **and** to `pnpm test`, and
 * reached CI only through `verify:benchmark`, and only if a bound happened to
 * move (#602).
 *
 * PR #581 is the instance. `LocomotionStore.advance` gained `canCross` as its
 * **second** parameter; `benchmarks/scenarios/actor-render-publication.mjs`
 * still called it with three arguments, so `writeTile` was invoked as the
 * predicate, returned `undefined`, and every walker was refused its first
 * edge. `arrivedCount` fell to 0 against an expected 21 -- and
 * `writeTileCalls: { equals: 167 }` stayed green throughout, because one
 * misplaced call per walker and one crossing per walker are both 167. Two
 * compensating errors held the only bound that could have seen it.
 *
 * `docs/research/audit-2026-08-26/07-cicd-supplychain.md`'s OPS-06 had
 * recorded the same hole four months earlier, down to the remedy's filename.
 *
 * ## Why this test enumerates files rather than naming three directories
 *
 * Naming `benchmarks`, `scripts` and `tooling` would assert exactly the gap
 * that was already found, and nothing about the next one. A fourth top-level
 * directory of `.mjs`, or a new `.ts` file at the repository root, would
 * reopen the hole without touching a line this file reads.
 *
 * So the subject is the tracked file list: every module file `git` knows
 * about has to fall inside one project's `include`. That is a sentence about
 * the repository rather than a tally of its directories, which is the shape
 * `docs/AGENT_WORKFLOW.md` §4 asks for.
 *
 * ## What it cannot see
 *
 * That the two projects are actually *run*. The `typecheck` script assertion
 * below is a proxy for it -- it reads the command, not its exit code -- and a
 * green `pnpm typecheck` in CI is the real evidence. Shell scripts are out of
 * scope entirely: nothing in this repository statically checks the 900 lines
 * of `.sh`, which OPS-06 also recorded and this change does not address.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Extensions TypeScript can check. `.sh`, `.py` and `.ps1` are deliberately absent. */
const CHECKABLE = /\.(?:mjs|cjs|js|jsx|mts|cts|ts|tsx)$/u;

interface ProjectContract {
  readonly extends?: string;
  readonly compilerOptions: Record<string, unknown>;
  readonly include: readonly string[];
}

function readProject(relativePath: string): ProjectContract {
  return JSON.parse(readFileSync(path.join(repositoryRoot, relativePath), 'utf8')) as ProjectContract;
}

function trackedModuleFiles(): readonly string[] {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' });
  expect(listed.status, `git ls-files failed: ${listed.stderr}`).toBe(0);
  return listed.stdout
    .split('\0')
    .filter((entry) => entry !== '' && CHECKABLE.test(entry));
}

/** `include` entries here are plain paths -- a directory covers its whole subtree, a file covers itself. */
function covers(entry: string, file: string): boolean {
  return file === entry || file.startsWith(`${entry}/`);
}

describe('typecheck coverage contract', () => {
  it('leaves no tracked module file outside every TypeScript project', () => {
    const projects = [readProject('tsconfig.json'), readProject('tsconfig.tools.json')];
    const include = projects.flatMap((project) => project.include);

    // Vacuity guards. A misparsed config or a `git ls-files` that returned
    // nothing would make the loop below assert about an empty set, which is
    // the failure mode this whole file exists to prevent.
    expect(include.length).toBeGreaterThanOrEqual(5);
    const files = trackedModuleFiles();
    expect(files.length).toBeGreaterThanOrEqual(700);

    const uncovered = files.filter((file) => !include.some((entry) => covers(entry, file)));
    expect(
      uncovered,
      'a tracked module file is in no tsconfig `include`, so no typechecker reads it. That is how #602 happened: a benchmark kept calling a production signature that had changed, and neither `pnpm typecheck` nor `pnpm test` could see it. Add the path to `tsconfig.json` or to `tsconfig.tools.json`',
    ).toEqual([]);
  });

  it('actually checks the JavaScript it includes, and says which strictness it drops', () => {
    const tools = readProject('tsconfig.tools.json');

    // `include` alone buys nothing for a `.mjs` file: without `allowJs` the
    // compiler does not read it, and without `checkJs` it reads it and
    // reports nothing.
    expect(tools.extends, 'tsconfig.tools.json must inherit the strict base rather than restate it').toBe('./tsconfig.json');
    expect(tools.compilerOptions['allowJs']).toBe(true);
    expect(tools.compilerOptions['checkJs']).toBe(true);

    /*
     * The two relaxations are deliberate and neither weakens the gate this
     * project exists to be: both are about the shape of the untyped glue, not
     * about how a call into `src/` is checked.
     *
     * - `noImplicitAny` off, because turning it on costs 181 annotations
     *   across files whose own parameters nothing else reads. An argument
     *   passed to a *typed* production function is still checked.
     * - `noUncheckedIndexedAccess` off, because JavaScript has no non-null
     *   assertion operator, so the only way to satisfy it in a `.mjs` file is
     *   a JSDoc cast at every index -- 19 of them, all noise.
     *
     * A third relaxation is a change to what this project promises, so it
     * fails here and gets an argument rather than arriving with a diff.
     */
    const relaxed = Object.entries(tools.compilerOptions)
      .filter(([, value]) => value === false)
      .map(([option]) => option)
      .sort();
    expect(relaxed).toEqual(['noImplicitAny', 'noUncheckedIndexedAccess']);
  });

  it('runs both projects from `pnpm typecheck`, so neither is decoration', () => {
    const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      readonly scripts: Record<string, string>;
    };

    expect(packageJson.scripts['typecheck']).toContain('tsconfig.tools.json');
    // `pnpm verify` is what CI runs; if it stopped calling `typecheck` the
    // assertion above would still pass and check nothing.
    expect(packageJson.scripts['verify']).toContain('typecheck');
  });

  it('keeps the two projects disjoint, so no file is checked under two strictnesses', () => {
    const base = readProject('tsconfig.json');
    const tools = readProject('tsconfig.tools.json');

    const overlapping = tools.include.filter((entry) =>
      base.include.some((other) => covers(other, entry) || covers(entry, other)),
    );
    expect(
      overlapping,
      'tsconfig.tools.json includes a path tsconfig.json already covers. The tools project drops two strictness flags, so an overlap silently un-strictens a file that used to be fully checked',
    ).toEqual([]);
  });
});
