import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A scratch probe must not be able to reach `main`.
 *
 * ## What happened, because that is the whole reason this file exists
 *
 * A file called `zz-probe.test.ts`, under `tests/determinism/`, was merged. It was fifteen lines:
 * `describe('p', () => { it('p', ...`, four thousand `kernel.step()` calls
 * behind a sixty-second timeout, a `console.log` of the job board every four
 * hundred ticks, and `expect(true).toBe(true)`. The commit that added it said
 * in its own message that the scratch probe was deleted — a different one was —
 * `carry-probe.test.ts`, under `tests/integration/` — and this one was left
 * behind. It
 * spent a minute of every CI run and asserted nothing about the simulation.
 *
 * Neither path is written out as a rooted one above, deliberately: both files
 * are gone, and `documentation-links-contract.test.ts` resolves every rooted
 * path a source comment cites. A citation of something deleted is what its
 * `ABSENT_BY_DESIGN` list is for, and an entry there is a standing exception
 * where naming the file without its directory is not.
 *
 * Nothing caught it. `vitest` counts it as a passing test, both typecheck
 * projects are happy with it, and no reviewer reads a file named `zz-probe`
 * in a diff of six thousand lines. So the gate is here rather than in a
 * reviewer's attention.
 *
 * ## The two properties, and why each is a measurement rather than a taste
 *
 * **1. No test may assert only tautologies.** An `expect()` whose subject is a
 * literal cannot say anything about this repository's code — `expect(true)`
 * holds on every tree that has ever existed and on every tree that ever will.
 * A file in which *every* expectation is of that shape is a file that runs
 * code and checks nothing, which is exactly what a probe is. Measured across
 * `tests/` when this contract was written: **zero files**. It is a gate on a
 * state the suite is already in, not a cleanup to be worked through.
 *
 * A file with a tautology *beside* real assertions is untouched. Those exist
 * for a reason — a control that pins a sanity property, a placeholder inside
 * a case that measures something else — and the defect here is a file whose
 * whole contribution is a tautology.
 *
 * **2. No test outside the suites that print measurements may write to the
 * console.** Measured, and the measurement is why the rule is scoped rather
 * than universal: `console.log` appears in **39** files under `tests/browser/`,
 * where a playtest's printed readout *is* its deliverable, in **8** under
 * `tests/unit/`, **3** under `tests/perf/` and **2** under
 * `tests/integration/`. It appears in **zero** files under
 * `tests/determinism/`, `tests/contract/`, `tests/foundation/`,
 * `tests/migrations/` and `tests/helpers/`. Those five are where a left-behind
 * `console.log` is a debugging session that was committed rather than a
 * readout somebody wanted, so those five are what this gate covers. A
 * deliberate readout in one of them is a reason to move the readout to a
 * suite that prints, or to widen this list and say why.
 *
 * ## What this contract does not claim
 *
 * That it would have caught the probe by its *name*. `zz-probe` is a tell to
 * a human and nothing to a regex — a file called
 * `carrier-restore-boundary.test.ts` with the same body is the same defect,
 * and the two properties above catch it. Nothing here reads a filename.
 */

const SUITES_THAT_MUST_NOT_PRINT = [
  'tests/determinism',
  'tests/contract',
  'tests/foundation',
  'tests/migrations',
  'tests/helpers',
] as const;

/*
 * An expectation whose subject is a literal: `expect(true)`, `expect(false)`,
 * `expect(1)`, `expect('x')`. Deliberately not `expect(x)` for any name — a
 * name is where the system under test enters, which is the whole distinction
 * this contract draws.
 */
const TAUTOLOGICAL_EXPECT = /\bexpect\(\s*(?:true|false|null|undefined|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")\s*\)/g;
const ANY_EXPECT = /\bexpect\(/g;
const CONSOLE_WRITE = /\bconsole\s*\.\s*(?:log|info|warn|error|debug|table|dir)\s*\(/;

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

const ROOT = join(__dirname, '../..');

/** Every `*.test.ts` under `tests/`, at any depth, `node_modules` excluded. */
function collectTestFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTestFiles(path));
      continue;
    }
    if (entry.endsWith('.test.ts')) files.push(path);
  }
  return files;
}

const testFileList = collectTestFiles(join(ROOT, 'tests'));

function testFiles(): readonly string[] {
  return testFileList;
}

describe('the test suite carries no scratch probe', () => {
  it('has test files to check, so an empty walk cannot pass this contract', () => {
    expect(testFiles().length).toBeGreaterThan(300);
  });

  it('contains no test file whose every assertion is a tautology', () => {
    const assertNothing: string[] = [];

    for (const file of testFiles()) {
      const source = readFileSync(file, 'utf8');
      const total = countMatches(source, ANY_EXPECT);
      if (total === 0) continue;
      const tautological = countMatches(source, TAUTOLOGICAL_EXPECT);
      if (tautological === total) {
        assertNothing.push(`${relative(ROOT, file)}: ${String(total)} expectation(s), all tautological`);
      }
    }

    expect(assertNothing).toEqual([]);
  });

  it('leaves no console write in the suites whose output nobody reads', () => {
    const printing: string[] = [];

    for (const file of testFiles()) {
      const path = relative(ROOT, file);
      if (!SUITES_THAT_MUST_NOT_PRINT.some((suite) => path.startsWith(`${suite}/`))) continue;
      if (CONSOLE_WRITE.test(readFileSync(file, 'utf8'))) {
        printing.push(path);
      }
    }

    expect(printing).toEqual([]);
  });
});
