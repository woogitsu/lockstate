import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeUnreachable,
  findCallSites,
  findExportedEnforcers,
  isWired,
  reportUnreachableEnforcers,
  type ScannedModule,
  type UnwiredEnforcerEntry,
} from '../helpers/invariant-enforcers';

/**
 * Every exported `assert*` invariant enforcer under `src/` must be called
 * from a production path, or be listed below with the reason it is not.
 *
 * This is the gate #159 asks for in its closing section:
 *
 * > *"Nothing checks that an exported invariant enforcer is reachable from a
 * > path that runs. ... A repository-contract-style test could plausibly
 * > assert that every exported `assert*` function in `src/simulation/` has at
 * > least one call site outside its own module or is listed as intentionally
 * > manual with a reason. Cheap, and it would have caught item 1 above the
 * > day it was written."*
 *
 * It does not decide item 1. Whether `assertGaplessDeploymentSchedule` should
 * be wired into the deployment-schedule construction path or deleted is the
 * owner's call and is still open; this only turns "nothing calls it" from a
 * fact a sweep rediscovers into a checked state with a recorded reason.
 * #159's other decisions -- whether a bad schedule is a programmer error or a
 * content error, and whether the projection path should validate at all --
 * are equally untouched here.
 *
 * The two departures from #159's literal wording (test call sites do not
 * count as wiring; an own-module call does) are argued in
 * `tests/helpers/invariant-enforcers.ts`, which owns the rules. This file
 * walks the filesystem and owns the allow-list, the same split
 * `tests/determinism/canonical-iteration-contract.test.ts` uses with
 * `tests/helpers/canonical-iteration.ts`.
 *
 * ## Scope: all of `src/`, not only `src/simulation/`
 *
 * #159 words the rule for `src/simulation/`. It is applied to the whole of
 * `src/` here, and the reason is a measurement rather than a preference:
 * widening it surfaces **no additional entry at all**. `src/` declares
 * exactly three exported `assert*` functions and all three are under
 * `src/simulation/`; the only other `assert*` declarations anywhere in `src/`
 * are module-private (`assertFinitePoint` and `assertPositive` in
 * `src/rendering/camera/coordinates.ts`, `assertNever`, `assertWord`,
 * `assertEntityId`, `assertRevision`, `assertChunkLifecycle`), and a
 * module-private helper used inside its own module is not the hazard -- an
 * *exported* enforcer is the one that reads as a public guarantee to callers
 * who may never invoke it.
 *
 * So the wider scope costs nothing today and covers the next enforcer
 * wherever it lands, including in `src/persistence/` or `src/services/`,
 * where an unwired validator would be just as invisible. The narrower scope
 * would have had to be widened later by whoever wrote that enforcer, which is
 * the same class of maintenance the gate exists to remove.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');

/**
 * Exported enforcers with no production call site, and why each is allowed to
 * stay unwired.
 *
 * This list *is* the deliverable. It turns an unreachable invariant enforcer
 * into a reviewable claim instead of a discovery, and it makes deleting the
 * last call site of a wired one a failure rather than a quiet edit.
 *
 * A reason states what is verifiably true today. It is deliberately not a
 * plan: inventing a roadmap for an entry is the invented-consequence defect
 * this repository spends the most effort on, and
 * `tests/foundation/unconsumed-content-contract.test.ts` makes the same point
 * about its own lists.
 */
const INTENTIONALLY_UNWIRED: readonly UnwiredEnforcerEntry[] = [
  {
    file: 'src/simulation/security/deployment-schedule.ts',
    name: 'assertGaplessDeploymentSchedule',
    reason:
      'The wire-or-delete choice is owner-blocked, see #159 item 1. Its twin `assertGaplessSchedule` is wired at module load over `DEFAULT_REGIME_SCHEDULES`, and doing the same for deployment schedules means either validating inside `constantDeploymentSchedule` or validating wherever sector schedules are authored -- but the honest alternative is deletion, because an exported validator nothing calls provides no protection while reading as though it does. #158 declined to add tests for it for the same reason: that would convert dead code into tested dead code. Nothing is broken today -- `constantDeploymentSchedule` is the module\'s only builder and returns one full-day block, so no gap exists for `resolveRequiredGuardCount` to throw on.',
  },
];

function listTypeScriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listTypeScriptFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

const repoPath = (file: string): string => relative(REPOSITORY_ROOT, file).split('\\').join(posix.sep);

/**
 * This file is excluded from the call-site scan. It names every enforcer it
 * asserts about and carries fixtures that call fictional ones, so leaving it
 * in would let the gate's own text vouch for the thing it is checking --
 * `tests/foundation/unconsumed-content-contract.test.ts` excludes itself from
 * its own consumer pool for exactly this reason. It cannot currently change
 * an outcome (the allow-list holds names as string literals, which carry no
 * parenthesis, and a test call site is never wiring), but a scan that can
 * quote itself is one edit away from doing so.
 */
const SELF = 'tests/foundation/unreachable-invariant-contract.test.ts';

const MODULES: readonly ScannedModule[] = [
  ...listTypeScriptFiles(join(REPOSITORY_ROOT, 'src')).map((file) => ({
    file: repoPath(file),
    // A `*.test.ts` colocated under `src/` is a test, whatever tree it sits
    // in: `vitest.config.ts` includes `src/**/*.test.ts` alongside `tests/`.
    // There are none today; classifying by name rather than by directory
    // means the first one does not silently count as production wiring.
    role: file.endsWith('.test.ts') ? ('test' as const) : ('source' as const),
    source: readFileSync(file, 'utf8'),
  })),
  ...listTypeScriptFiles(join(REPOSITORY_ROOT, 'tests')).map((file) => ({
    file: repoPath(file),
    role: 'test' as const,
    source: readFileSync(file, 'utf8'),
  })),
].filter((module) => module.file !== SELF);

const REPORT = reportUnreachableEnforcers(MODULES, INTENTIONALLY_UNWIRED);

describe('every exported invariant enforcer is reachable from a path that runs', () => {
  it('scans the whole of src/ and tests/, and finds the enforcers it claims to scan', () => {
    // Non-vacuous in both halves. An empty module list would make every
    // enforcer unreachable, which is loud; a declaration pattern that stopped
    // matching would make the gate assert about nothing at all, which is
    // silent, and is the failure mode this whole file exists to avoid.
    expect(MODULES.filter((module) => module.role === 'source').length).toBeGreaterThan(150);
    expect(MODULES.filter((module) => module.role === 'test').length).toBeGreaterThan(100);
    expect(MODULES.map((module) => module.file)).toContain('src/simulation/prisoners/regime.ts');
    expect(MODULES.map((module) => module.file)).toContain('src/simulation/security/deployment-schedule.ts');

    // The three exported enforcers `src/` declares today, named so a pattern
    // that stops matching one of them fails here rather than passing quietly.
    expect(REPORT.enforcers.map((enforcer) => `${enforcer.file} -> ${enforcer.name}`)).toEqual([
      'src/simulation/identity/name-pool.ts -> assertValidActorNamePool',
      'src/simulation/prisoners/regime.ts -> assertGaplessSchedule',
      'src/simulation/security/deployment-schedule.ts -> assertGaplessDeploymentSchedule',
    ]);
    expect(REPORT.callSiteCount).toBeGreaterThan(10);
  });

  it('finds the real call sites of the two wired enforcers, by kind', () => {
    // The scan is only worth its allow-list if it can tell a wired enforcer
    // from an unwired one on the real tree, so both wired shapes are pinned
    // against the files that hold them.
    const namePool = REPORT.enforcers.find((enforcer) => enforcer.name === 'assertValidActorNamePool')!;
    expect(namePool.crossModuleCallSites.map((site) => site.file)).toContain('src/simulation/identity/actor-identity.ts');
    expect(isWired(namePool)).toBe(true);

    // `assertGaplessSchedule`'s only production call is in its own module --
    // the module-load loop over `DEFAULT_REGIME_SCHEDULES` -- which is why an
    // own-module call counts as wiring here.
    const regime = REPORT.enforcers.find((enforcer) => enforcer.name === 'assertGaplessSchedule')!;
    expect(regime.crossModuleCallSites).toEqual([]);
    expect(regime.ownModuleCallSites.map((site) => site.file)).toEqual(['src/simulation/prisoners/regime.ts']);
    expect(regime.testCallSites.length).toBeGreaterThan(0);
    expect(isWired(regime)).toBe(true);
  });

  it('reads the rule out of code and not out of prose about the rule, on the real tree', () => {
    // `src/simulation/prisoners/regime.ts` *discusses*
    // `assertGaplessDeploymentSchedule` in a doc comment, so this is not a
    // hypothetical: a scan that read a mention as a call would report the
    // deployment enforcer as wired and this gate would pass while nothing
    // called it. #159's own `grep -rn` returns that comment line as a hit,
    // which is exactly why grep is not a gate.
    const regime = MODULES.find((module) => module.file === 'src/simulation/prisoners/regime.ts')!;
    expect(regime.source).toContain('`assertGaplessDeploymentSchedule` has the same shape for the same reason.');
    expect(findCallSites(regime.source, 'assertGaplessDeploymentSchedule')).toEqual([]);
  });

  it('leaves no exported enforcer unreachable and unaccounted for', () => {
    // The failing direction that matters: an enforcer whose last production
    // call site is deleted lands here, named, with whether it still has test
    // call sites -- because "tested dead code" and "dead code" need different
    // remedies.
    expect(
      REPORT.unreachable.map(describeUnreachable),
      'an exported assert* function no production path calls: wire it into a path that runs, delete it, or add it to INTENTIONALLY_UNWIRED with the reason',
    ).toEqual([]);
  });

  it('keeps its allow-list honest in both directions', () => {
    expect(
      REPORT.wiredEntries.map((entry) => `${entry.file} -> ${entry.name}`),
      'this enforcer now has a production call site: delete its INTENTIONALLY_UNWIRED entry in the same change',
    ).toEqual([]);
    expect(
      REPORT.unknownEntries.map((entry) => `${entry.file} -> ${entry.name}`),
      'INTENTIONALLY_UNWIRED names an enforcer this scan does not find: it was renamed, un-exported or deleted, so the entry is fiction',
    ).toEqual([]);

    // The list accounts for every unwired enforcer and nothing more, so its
    // length is the number a reviewer has to audit.
    expect(REPORT.enforcers.filter((enforcer) => !isWired(enforcer)).length).toBe(INTENTIONALLY_UNWIRED.length);
  });

  it('gives every allow-list entry a real reason', () => {
    for (const entry of INTENTIONALLY_UNWIRED) {
      expect(entry.reason.trim().length, `${entry.file} -> ${entry.name} needs a reason`).toBeGreaterThan(80);
    }
  });
});

/**
 * The scanner's own tests. A static contract is only as good as its pattern,
 * and a pattern that quietly stops matching is worse than no pattern at all:
 * the suite stays green and the guard is gone. So the rules are exercised
 * against fixtures in both directions, rather than only against real sources
 * where a silent failure looks exactly like compliance.
 *
 * Fixture enforcers are given fictional names so no fixture can ever vouch
 * for a real one.
 */
describe('the invariant-enforcer scanner recognises what it claims to', () => {
  it('finds an exported assert* declaration however it is written', () => {
    expect(findExportedEnforcers('export function assertThing(x: T): void {}')).toEqual([{ name: 'assertThing', line: 1 }]);
    expect(findExportedEnforcers('export async function assertThing(x: T): Promise<void> {}')).toEqual([{ name: 'assertThing', line: 1 }]);
    expect(findExportedEnforcers('export const assertThing = (x: T): void => {};')).toEqual([{ name: 'assertThing', line: 1 }]);
    expect(findExportedEnforcers('export function assertThing<T>(x: T): void {}')).toEqual([{ name: 'assertThing', line: 1 }]);
  });

  it('reports the declaration line of the real file, not of the stripped one', () => {
    // Block comments are blanked rather than removed, so a doc comment above
    // a declaration cannot shift its reported line. A line number dozens of
    // lines off the code would make the failure message worse than none.
    expect(findExportedEnforcers('/* one\ntwo\nthree */\nexport function assertThing(x: T): void {}')).toEqual([
      { name: 'assertThing', line: 4 },
    ]);
  });

  it('does not read a module-private or differently-named function as an exported enforcer', () => {
    expect(findExportedEnforcers('function assertThing(x: T): void {}')).toEqual([]);
    expect(findExportedEnforcers('export function validateThing(x: T): Result {}')).toEqual([]);
    expect(findExportedEnforcers('export function ensureThing(x: T): void {}')).toEqual([]);
    // A type-only export of a name starting with `assert` is not a function.
    expect(findExportedEnforcers('export type assertThing = never;')).toEqual([]);
  });

  it('does not read a declaration as a call site', () => {
    // Without this the declaring file always vouches for itself and the gate
    // can never fail.
    expect(findCallSites('export function assertThing(x: T): void { throw new RangeError(); }', 'assertThing')).toEqual([]);
    expect(findCallSites('export const assertThing = (x: T): void => {};', 'assertThing')).toEqual([]);
  });

  it('reads a call as a call, at the line it is on', () => {
    expect(findCallSites('run() {\n  assertThing(value);\n}', 'assertThing')).toEqual([2]);
    expect(findCallSites('for (const s of ALL) assertThing(s);', 'assertThing')).toEqual([1]);
    expect(findCallSites('expect(() => assertThing(bad)).toThrow(RangeError);', 'assertThing')).toEqual([1]);
  });

  it('does not read a mention in a comment or a docstring as a call site', () => {
    // The named mutation for this gate: move a call site into a comment. It
    // must still read as unwired.
    expect(findCallSites('// assertThing(value) is what protects this\nrun() {}', 'assertThing')).toEqual([]);
    expect(findCallSites('/**\n * Callers must assertThing(value) first.\n */\nrun() {}', 'assertThing')).toEqual([]);
    expect(findCallSites('/* assertThing(value); */', 'assertThing')).toEqual([]);
  });

  it('does not read an import, a longer name or a method of the same name as a call site', () => {
    expect(findCallSites("import { assertThing } from './thing';", 'assertThing')).toEqual([]);
    expect(findCallSites('assertThingElse(value);', 'assertThing')).toEqual([]);
    expect(findCallSites('other.assertThing(value);', 'assertThing')).toEqual([]);
  });

  it('classifies the three kinds of call site and only counts production ones as wiring', () => {
    const declaring: ScannedModule = { file: 'src/a.ts', role: 'source', source: 'export function assertThing(x: T): void {}' };
    const test: ScannedModule = { file: 'tests/a.test.ts', role: 'test', source: 'it("x", () => assertThing(1));' };
    const other: ScannedModule = { file: 'src/b.ts', role: 'source', source: 'run() { assertThing(1); }' };

    // Test call sites alone are not wiring -- #158's "tested dead code".
    const testedOnly = reportUnreachableEnforcers([declaring, test], []);
    expect(testedOnly.unreachable.map(describeUnreachable)).toEqual([
      'src/a.ts:1 assertThing -- 1 test call site(s) and no production call site',
    ]);

    // A cross-module production call is.
    const wired = reportUnreachableEnforcers([declaring, test, other], []);
    expect(wired.unreachable).toEqual([]);
    expect(wired.enforcers[0]!.crossModuleCallSites).toEqual([{ file: 'src/b.ts', line: 1 }]);
    expect(wired.enforcers[0]!.testCallSites).toEqual([{ file: 'tests/a.test.ts', line: 1 }]);
  });

  it('counts an own-module call as wiring, which is the shape regime.ts uses', () => {
    const declaring: ScannedModule = {
      file: 'src/a.ts',
      role: 'source',
      source: 'export function assertThing(x: T): void {}\nfor (const s of ALL) assertThing(s);',
    };
    const report = reportUnreachableEnforcers([declaring], []);
    expect(report.enforcers[0]!.ownModuleCallSites).toEqual([{ file: 'src/a.ts', line: 2 }]);
    expect(report.unreachable).toEqual([]);
  });

  it('reads declarations only from source modules, never from a test helper', () => {
    const helper: ScannedModule = { file: 'tests/helpers/h.ts', role: 'test', source: 'export function assertThing(x: T): void {}' };
    expect(reportUnreachableEnforcers([helper], []).enforcers).toEqual([]);
  });

  it('reports an allow-list entry that has gained a production call site', () => {
    const entry: UnwiredEnforcerEntry = { file: 'src/a.ts', name: 'assertThing', reason: 'x'.repeat(90) };
    const declaring: ScannedModule = { file: 'src/a.ts', role: 'source', source: 'export function assertThing(x: T): void {}' };
    const caller: ScannedModule = { file: 'src/b.ts', role: 'source', source: 'run() { assertThing(1); }' };

    // Still unwired: the entry covers it and nothing is reported.
    const covered = reportUnreachableEnforcers([declaring], [entry]);
    expect(covered.unreachable).toEqual([]);
    expect(covered.wiredEntries).toEqual([]);

    // Now wired: the entry is false and must go.
    expect(reportUnreachableEnforcers([declaring, caller], [entry]).wiredEntries).toEqual([entry]);
  });

  it('reports an allow-list entry naming an enforcer that no longer exists', () => {
    const entry: UnwiredEnforcerEntry = { file: 'src/a.ts', name: 'assertThing', reason: 'x'.repeat(90) };
    // Renamed, deleted, or no longer exported -- all three look the same from
    // here, and all three make the entry fiction.
    const renamed: ScannedModule = { file: 'src/a.ts', role: 'source', source: 'export function assertOther(x: T): void {}' };
    const report = reportUnreachableEnforcers([renamed], [entry]);
    expect(report.unknownEntries).toEqual([entry]);
    // And the renamed one is itself now unreachable and unaccounted for, so
    // a rename cannot smuggle an enforcer past the gate under a new name.
    expect(report.unreachable.map((enforcer) => enforcer.name)).toEqual(['assertOther']);
  });

  it('keys an allow-list entry on the declaring file, so a same-named enforcer elsewhere is not covered', () => {
    const entry: UnwiredEnforcerEntry = { file: 'src/a.ts', name: 'assertThing', reason: 'x'.repeat(90) };
    const elsewhere: ScannedModule = { file: 'src/c.ts', role: 'source', source: 'export function assertThing(x: T): void {}' };
    const report = reportUnreachableEnforcers([elsewhere], [entry]);
    expect(report.unreachable.map((enforcer) => enforcer.file)).toEqual(['src/c.ts']);
    expect(report.unknownEntries).toEqual([entry]);
  });
});
