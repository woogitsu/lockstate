import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SIMULATION_CONSTRUCTION_FORMS,
  describeConstructionSite,
  describeDependency,
  describeMissingForm,
  findBrowserGlobalAccess,
  findConstructionSites,
  findCrossTreeDependencies,
  findImports,
  findMissingConstructionForms,
  reportCrossTreeViolations,
  resolveTree,
  type CrossTreeAllowance,
  type ScannedSource,
} from '../helpers/module-boundaries';

/**
 * The scanner behind `tests/unit/rendering-module-boundaries.test.ts`,
 * `tests/unit/input-module-boundaries.test.ts` and
 * `tests/unit/ui-orchestration-boundaries.test.ts`.
 *
 * A static contract is only as good as its pattern, and a pattern that quietly
 * stops matching is worse than no pattern at all: the suite stays green and the
 * guard is gone. That is not hypothetical here -- it is precisely what #206
 * found, an alternative in a boundary regex that had never been able to match
 * anything. So every rule is exercised against fixtures in **both**
 * directions, rather than only against the real trees where a silent failure
 * looks exactly like compliance.
 *
 * Fixture module paths are fictional (`src/alpha/...`) wherever a real path
 * would let a fixture vouch for a real rule.
 */

const at = (file: string, source: string): ScannedSource => ({ file, source });

describe('the import scanner reads what it claims to', () => {
  it('reads a plain, a default and a namespace import', () => {
    expect(findImports("import { a } from './x';")).toEqual([{ specifier: './x', line: 1, typeOnly: false }]);
    expect(findImports("import a from './x';")).toEqual([{ specifier: './x', line: 1, typeOnly: false }]);
    expect(findImports("import * as a from './x';")).toEqual([{ specifier: './x', line: 1, typeOnly: false }]);
  });

  it('reads a multi-line brace clause, which two of the real modules write', () => {
    // `src/ui/simulation-commands.ts` and `src/ui/save-panel.ts` both split a
    // clause across lines. A line-oriented scan would miss the specifier.
    const source = "import {\n  A,\n  type B,\n} from '../simulation/runtime/restore-session';";
    expect(findImports(source)).toEqual([
      { specifier: '../simulation/runtime/restore-session', line: 1, typeOnly: false },
    ]);
  });

  it('reports the line of the import keyword in the real file, not of the stripped one', () => {
    // Block comments are blanked rather than removed, so a doc comment above
    // an import cannot shift its reported line.
    expect(findImports("/* one\ntwo\nthree */\nimport { a } from './x';")).toEqual([
      { specifier: './x', line: 4, typeOnly: false },
    ]);
  });

  it('separates an erased import from one that carries code', () => {
    expect(findImports("import type { A } from './x';")[0]!.typeOnly).toBe(true);
    expect(findImports("export type { A } from './x';")[0]!.typeOnly).toBe(true);
    // Every binding erased is the same fact as `import type`.
    expect(findImports("import { type A, type B } from './x';")[0]!.typeOnly).toBe(true);
    // One value binding among types is a value import: this is the mixed shape
    // `src/ui/simulation-commands.ts:6-9` writes.
    expect(findImports("import { type A, packCommand } from './x';")[0]!.typeOnly).toBe(false);
    // An empty clause imports the module for its side effects.
    expect(findImports("import {} from './x';")[0]!.typeOnly).toBe(false);
  });

  it('reads a side-effect import and a dynamic import, and never calls either type-only', () => {
    expect(findImports("import './register';")).toEqual([{ specifier: './register', line: 1, typeOnly: false }]);
    expect(findImports("const m = await import('./lazy');")).toEqual([
      { specifier: './lazy', line: 1, typeOnly: false },
    ]);
  });

  it('reads a re-export as a dependency, because `export * from` pulls the module in', () => {
    // `src/input/index.ts` is nine of these and nothing else. A scan that
    // ignored them would let a barrel file launder any import.
    expect(findImports("export * from './actions';")).toEqual([{ specifier: './actions', line: 1, typeOnly: false }]);
    expect(findImports("export { a } from './actions';")).toEqual([{ specifier: './actions', line: 1, typeOnly: false }]);
  });

  it('does not read a mention in a comment as an import', () => {
    // The named mutation for this rule: move a forbidden import into a
    // comment. It must stop counting.
    expect(findImports("// import { Kernel } from '../simulation/kernel/kernel';")).toEqual([]);
    expect(findImports("/**\n * Never `import { Kernel } from '../simulation/kernel/kernel'`.\n */")).toEqual([]);
    expect(findImports("/* import { Kernel } from '../simulation/kernel/kernel'; */")).toEqual([]);
  });

  it('does not read a quoted occurrence of the keyword as an import', () => {
    // The defect this closes: an action id spelled `'import'`
    // (`src/ui/save-panel.ts`, #287) matched the side-effect pattern and
    // swallowed everything up to the next quote as a specifier, so the file
    // was reported as importing a package it does not import.
    expect(findImports("this.start('import', run);")).toEqual([]);
    expect(findImports("type Id = 'save' | 'import';")).toEqual([]);
    // And the real thing next to it still counts, whatever precedes it.
    expect(findImports("const id = 'import';\nimport './register';")).toEqual([
      { specifier: './register', line: 2, typeOnly: false },
    ]);
  });

  it('does not read an unrelated `from` call as an import', () => {
    // Without the statement-boundary rule the `export const` below would lend
    // its keyword to the `from(...)` call and invent a dependency.
    expect(findImports("export const ids = 1;\nconst rows = Array.from(['x']);")).toEqual([]);
    expect(findImports("import { a } from './x';\nconst rows = Array.from(['y']);")).toEqual([
      { specifier: './x', line: 1, typeOnly: false },
    ]);
  });
});

describe('tree resolution is by path, not by pattern', () => {
  it('resolves a relative specifier to the tree it actually lands in', () => {
    expect(resolveTree('src/ui/build-tool.ts', '../rendering/build/edge-picking')).toBe('rendering');
    expect(resolveTree('src/rendering/world/world-view.ts', '../../simulation/world/parcel')).toBe('simulation');
    expect(resolveTree('src/rendering/scene/world-scene.ts', '../../input')).toBe('input');
    expect(resolveTree('src/input/storage.ts', '../shared/key-value-store')).toBe('shared');
  });

  it('resolves an intra-tree specifier to its own tree, however it is spelled', () => {
    expect(resolveTree('src/ui/save-panel.ts', './primitives/async-action')).toBe('ui');
    expect(resolveTree('src/ui/hud/hud.ts', '../simulation-clock')).toBe('ui');
    // The trap a textual `/\/(simulation)\//` rule falls into: a sibling file
    // whose *name* starts with the word.
    expect(resolveTree('src/ui/hud/hud.ts', '../simulation-commands')).toBe('ui');
  });

  it('is not fooled by depth, which a fixed-depth pattern would be', () => {
    expect(resolveTree('src/a/b/c/d.ts', '../../../simulation/x')).toBe('simulation');
    expect(resolveTree('src/a/b/c/d.ts', '../../simulation/x')).toBe('a');
  });

  it('returns nothing for a package specifier, which is a different rule', () => {
    expect(resolveTree('src/rendering/phaser/tile-layer.ts', 'phaser')).toBeUndefined();
    expect(resolveTree('src/persistence/save-schema.ts', 'zod')).toBeUndefined();
    expect(resolveTree('tests/helpers/module-boundaries.ts', 'node:path')).toBeUndefined();
  });

  it('returns nothing for a relative specifier that leaves src/', () => {
    expect(resolveTree('src/main.ts', '../vite.config')).toBeUndefined();
  });
});

describe('the cross-tree manifest fails in all three directions', () => {
  const allowance = (partial: Partial<CrossTreeAllowance>): CrossTreeAllowance => ({
    file: 'src/alpha/orchestrator.ts',
    tree: 'beta',
    kind: 'type-only',
    reason: 'x'.repeat(90),
    ...partial,
  });

  it('aggregates every import of one tree from one file into a single reviewable fact', () => {
    const files = [
      at(
        'src/alpha/orchestrator.ts',
        "import type { A } from '../beta/one';\nimport type { B } from '../beta/two';\nimport { c } from './local';",
      ),
    ];
    expect(findCrossTreeDependencies(files, 'alpha')).toEqual([
      { file: 'src/alpha/orchestrator.ts', tree: 'beta', kind: 'type-only', specifiers: ['../beta/one', '../beta/two'], line: 1 },
    ]);
  });

  it('calls the whole dependency a value dependency as soon as one import carries code', () => {
    const files = [
      at('src/alpha/orchestrator.ts', "import type { A } from '../beta/one';\nimport { run } from '../beta/two';"),
    ];
    expect(findCrossTreeDependencies(files, 'alpha')[0]!.kind).toBe('value');
  });

  it('reports a dependency no allowance covers', () => {
    const dependencies = findCrossTreeDependencies(
      [at('src/alpha/orchestrator.ts', "import type { A } from '../beta/one';")],
      'alpha',
    );
    expect(reportCrossTreeViolations(dependencies, []).unlisted.map(describeDependency)).toEqual([
      'src/alpha/orchestrator.ts:1 depends on src/beta/ (type-only: ../beta/one)',
    ]);
    expect(reportCrossTreeViolations(dependencies, [allowance({})]).unlisted).toEqual([]);
  });

  it('reports an allowance whose dependency no longer exists', () => {
    const report = reportCrossTreeViolations([], [allowance({})]);
    expect(report.stale.map((entry) => `${entry.file} -> ${entry.tree}`)).toEqual(['src/alpha/orchestrator.ts -> beta']);
    expect(report.mismatched).toEqual([]);
  });

  it('reports a type-only allowance that has become a value dependency', () => {
    // The erosion this list exists for: a module permitted to *name* a
    // simulation type quietly gaining the ability to *call* into it.
    const dependencies = findCrossTreeDependencies(
      [at('src/alpha/orchestrator.ts', "import { build } from '../beta/one';")],
      'alpha',
    );
    const report = reportCrossTreeViolations(dependencies, [allowance({})]);
    expect(report.unlisted).toEqual([]);
    expect(report.stale).toEqual([]);
    expect(report.mismatched.map((entry) => `${entry.allowance.file} ${entry.allowance.kind} -> ${entry.actual}`)).toEqual([
      'src/alpha/orchestrator.ts type-only -> value',
    ]);
  });

  it('reports a value allowance that has narrowed back to type-only, so the entry cannot overstate', () => {
    const dependencies = findCrossTreeDependencies(
      [at('src/alpha/orchestrator.ts', "import type { A } from '../beta/one';")],
      'alpha',
    );
    const report = reportCrossTreeViolations(dependencies, [allowance({ kind: 'value' })]);
    expect(report.mismatched.map((entry) => entry.actual)).toEqual(['type-only']);
  });

  it('keys an allowance on the file and the tree together', () => {
    const dependencies = findCrossTreeDependencies(
      [at('src/alpha/other.ts', "import type { A } from '../beta/one';")],
      'alpha',
    );
    // An allowance for a different file in the same tree covers nothing, and
    // is itself stale.
    const report = reportCrossTreeViolations(dependencies, [allowance({})]);
    expect(report.unlisted.map((entry) => entry.file)).toEqual(['src/alpha/other.ts']);
    expect(report.stale.map((entry) => entry.file)).toEqual(['src/alpha/orchestrator.ts']);
  });
});

describe('the simulation-construction catalog matches construction and only construction', () => {
  it('matches every form it declares', () => {
    const sources = [
      at('src/alpha/a.ts', 'const k = new Kernel(clock);'),
      at('src/alpha/b.ts', 'const w = new SparseWorld(32);'),
      at('src/alpha/c.ts', 'const s = new ConstructionSystem(world);'),
      at('src/alpha/d.ts', 'export const r = createNewSimulationRuntime(1);'),
      at('src/alpha/e.ts', 'const r = restoreSimulationRuntime(bundle);'),
    ];
    expect(findConstructionSites(sources).map(describeConstructionSite)).toEqual([
      'src/alpha/a.ts:1 builds new Kernel',
      'src/alpha/b.ts:1 builds new SparseWorld',
      'src/alpha/c.ts:1 builds new ConstructionSystem',
      'src/alpha/d.ts:1 builds createNewSimulationRuntime(...)',
      'src/alpha/e.ts:1 builds restoreSimulationRuntime(...)',
    ]);
  });

  it('matches the exact mutation #206 measured as surviving', () => {
    // Reproduced verbatim from the issue: a rendering module that constructs
    // and exports a live simulation runtime at module scope. Under the old
    // regex this matched nothing.
    const mutated = at(
      'src/rendering/depth.ts',
      "import { createNewSimulationRuntime } from '../simulation/runtime/new-session';\nexport const leakedRuntime = createNewSimulationRuntime(1);\n",
    );
    expect(findConstructionSites([mutated]).map(describeConstructionSite)).toEqual([
      'src/rendering/depth.ts:2 builds createNewSimulationRuntime(...)',
    ]);
  });

  it('matches a factory reached through an object, because that still builds a runtime', () => {
    expect(findConstructionSites([at('src/alpha/a.ts', 'helpers.createNewSimulationRuntime(1);')])).toHaveLength(1);
  });

  it('does not match a longer name that merely contains a form', () => {
    // A prefixed alias, which is what the lookbehind on the factory patterns
    // is for -- `myCreateNewSimulationRuntime` would not match anyway, because
    // camel-casing changes the `c`.
    expect(findConstructionSites([at('src/alpha/a.ts', '_createNewSimulationRuntime(1);')])).toEqual([]);
    expect(findConstructionSites([at('src/alpha/a.ts', '$createNewSimulationRuntime(1);')])).toEqual([]);
    // And a suffixed one, which the required `(` after the name rules out.
    expect(findConstructionSites([at('src/alpha/a.ts', 'createNewSimulationRuntimeStub(1);')])).toEqual([]);
    expect(findConstructionSites([at('src/alpha/a.ts', 'const k = new KernelProbe();')])).toEqual([]);
    expect(findConstructionSites([at('src/alpha/a.ts', 'const w = new SparseWorldView(32);')])).toEqual([]);
  });

  it('does not match an import of a form, or a type annotation naming its result', () => {
    // Reading the type is what a projection does. Only building is forbidden.
    expect(
      findConstructionSites([
        at('src/alpha/a.ts', "import { createNewSimulationRuntime } from '../simulation/runtime/new-session';"),
      ]),
    ).toEqual([]);
    expect(findConstructionSites([at('src/alpha/a.ts', "import type { SimulationRuntime } from '../simulation/runtime/new-session';\nlet r: SimulationRuntime | undefined;")])).toEqual([]);
  });

  it('does not read a mention in a comment as construction', () => {
    // Load-bearing, and this is the mutation to run against it: with the
    // stripper replaced by an identity function, this very test file and
    // `tests/unit/rendering-module-boundaries.test.ts` -- both of which name
    // `createNewSimulationRuntime(...)` in prose -- would read as violations,
    // and so would any module that explains the rule it obeys.
    expect(findConstructionSites([at('src/alpha/a.ts', '// createNewSimulationRuntime(1) would be a second source of truth')])).toEqual([]);
    expect(findConstructionSites([at('src/alpha/a.ts', '/**\n * Never call `createNewSimulationRuntime(1)` here.\n */')])).toEqual([]);
    expect(findConstructionSites([at('src/alpha/a.ts', '/* const k = new Kernel(clock); */')])).toEqual([]);
  });

  it('reports the line in the real file even when a block comment precedes the site', () => {
    expect(findConstructionSites([at('src/alpha/a.ts', '/* one\ntwo */\nconst k = new Kernel(clock);')])[0]!.line).toBe(3);
  });
});

describe('the construction catalog is checked against the tree it claims to describe', () => {
  it('accepts an entry whose declaration really is a class or a function', () => {
    const simulation = [
      at('src/simulation/kernel/kernel.ts', 'export class Kernel {}'),
      at('src/simulation/runtime/new-session.ts', 'export function createNewSimulationRuntime(seed: number) {}'),
    ];
    const forms = SIMULATION_CONSTRUCTION_FORMS.filter(
      (form) => form.name === 'Kernel' || form.name === 'createNewSimulationRuntime',
    );
    expect(findMissingConstructionForms(simulation, forms)).toEqual([]);
  });

  it('rejects an entry that names an interface -- the exact defect #206 reported', () => {
    // This is the assertion that makes #206 unrepeatable rather than merely
    // fixed once. `new SimulationRuntime` survived in the guard because
    // nothing ever checked that `SimulationRuntime` was constructible.
    const fictionalForm = {
      name: 'SimulationRuntime',
      declaration: 'class' as const,
      form: 'new SimulationRuntime',
      pattern: /\bnew\s+SimulationRuntime\b/,
    };
    const simulation = [at('src/simulation/runtime/new-session.ts', 'export interface SimulationRuntime {}')];
    expect(findMissingConstructionForms(simulation, [fictionalForm]).map(describeMissingForm)).toEqual([
      'new SimulationRuntime: SimulationRuntime is an interface in src/simulation/, not a class, so `new SimulationRuntime` does not compile and this pattern can never match',
    ]);
  });

  it('rejects an entry that names a type alias', () => {
    const fictionalForm = {
      name: 'PhantomRuntime',
      declaration: 'class' as const,
      form: 'new PhantomRuntime',
      pattern: /\bnew\s+PhantomRuntime\b/,
    };
    const simulation = [at('src/simulation/a.ts', 'export type PhantomRuntime = { tick(): void };')];
    expect(findMissingConstructionForms(simulation, [fictionalForm]).map((entry) => entry.declaredInstead)).toEqual(['type']);
  });

  it('rejects an entry whose name the tree does not export at all', () => {
    const fictionalForm = {
      name: 'createPhantomRuntime',
      declaration: 'function' as const,
      form: 'createPhantomRuntime(...)',
      pattern: /(?<![\w$])createPhantomRuntime\s*\(/,
    };
    expect(findMissingConstructionForms([at('src/simulation/a.ts', 'export function other() {}')], [fictionalForm]).map(describeMissingForm)).toEqual([
      'createPhantomRuntime(...): src/simulation/ exports no function named createPhantomRuntime, so this pattern can never match',
    ]);
  });

  it('does not accept a module-private declaration as an export', () => {
    const fictionalForm = {
      name: 'PhantomKernel',
      declaration: 'class' as const,
      form: 'new PhantomKernel',
      pattern: /\bnew\s+PhantomKernel\b/,
    };
    // A class the tree does not export cannot be constructed from another
    // tree, so a catalog entry for it is still fiction.
    expect(findMissingConstructionForms([at('src/simulation/a.ts', 'class PhantomKernel {}')], [fictionalForm])).toHaveLength(1);
  });

  it('does not let a commented-out declaration vouch for an entry', () => {
    const fictionalForm = {
      name: 'PhantomKernel',
      declaration: 'class' as const,
      form: 'new PhantomKernel',
      pattern: /\bnew\s+PhantomKernel\b/,
    };
    expect(
      findMissingConstructionForms([at('src/simulation/a.ts', '// export class PhantomKernel {}')], [fictionalForm]),
    ).toHaveLength(1);
  });
});

describe('the browser-global rule reads an access and not a word', () => {
  it('finds a member access and an index', () => {
    expect(findBrowserGlobalAccess('const e = document.createElement("div");')).toEqual([{ global: 'document', line: 1 }]);
    expect(findBrowserGlobalAccess('window.addEventListener("blur", f);')).toEqual([{ global: 'window', line: 1 }]);
    expect(findBrowserGlobalAccess('const v = localStorage["k"];')).toEqual([{ global: 'localStorage', line: 1 }]);
    expect(findBrowserGlobalAccess('navigator.keyboard.getLayoutMap();')).toEqual([{ global: 'navigator', line: 1 }]);
  });

  it('finds a global reached through globalThis, with no member access after it', () => {
    // `src/input/storage.ts` writes exactly this: `const store =
    // globalThis.localStorage;` and then calls `getItem` on the binding. The
    // member-access rule alone sees nothing here -- there is a `.` before the
    // name and none after it -- so a scan without this second shape would
    // report the one real access in `src/input/**` as clean.
    expect(findBrowserGlobalAccess('const store = globalThis.localStorage;')).toEqual([
      { global: 'globalThis.localStorage', line: 1 },
    ]);
    expect(findBrowserGlobalAccess('globalThis.document.title = "x";').map((entry) => entry.global)).toContain(
      'globalThis.document',
    );
  });

  it('does not read a globalThis property that is not a browser global as an access', () => {
    expect(findBrowserGlobalAccess('globalThis.crypto.randomUUID();')).toEqual([]);
    expect(findBrowserGlobalAccess('globalThis.structuredClone(value);')).toEqual([]);
    // And a property *named* like one on something that is not globalThis.
    expect(findBrowserGlobalAccess('const s = host.globalThis;')).toEqual([]);
  });

  it('does not read prose, a bare mention, or a same-named property as an access', () => {
    // `docs/INPUT.md`'s rule about `window.localStorage` is quoted in
    // `src/input/storage.ts`'s own doc comment.
    expect(findBrowserGlobalAccess('// The browser entry point supplies window.localStorage.')).toEqual([]);
    expect(findBrowserGlobalAccess('/**\n * Reads `globalThis.localStorage` inside a try.\n */')).toEqual([]);
    expect(findBrowserGlobalAccess('/**\n * Not a hard-coded `document.body`.\n */')).toEqual([]);
    expect(findBrowserGlobalAccess('const host = options.document;')).toEqual([]);
    expect(findBrowserGlobalAccess('type Host = { readonly window: unknown };')).toEqual([]);
    // A member access is required, so a word ending a sentence is not a hit.
    expect(findBrowserGlobalAccess('const label = "the window";')).toEqual([]);
  });

  it('reports the line in the real file', () => {
    expect(findBrowserGlobalAccess('/* one\ntwo */\ndocument.title = "x";')).toEqual([{ global: 'document', line: 3 }]);
  });
});

/**
 * The catalog against the real tree.
 *
 * This is the assertion whose absence let #206 happen. `new SimulationRuntime`
 * sat in `tests/unit/rendering-module-boundaries.test.ts` naming an interface,
 * unable to match anything, because nothing ever asked whether the tree
 * declared a class by that name. Every entry in
 * `SIMULATION_CONSTRUCTION_FORMS` is now checked against what
 * `src/simulation/**` actually exports, so an entry that names an interface, a
 * type alias, a module-private declaration or a name that has since been
 * renamed fails here with a message saying which.
 */
const SIMULATION_ROOT = join(__dirname, '../../src/simulation');

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) files.push(path);
  }
  return files;
}

const simulationSources: readonly ScannedSource[] = collectTypeScriptFiles(SIMULATION_ROOT).map((path) => ({
  file: path,
  source: readFileSync(path, 'utf8'),
}));

describe('every construction form in the catalog names something src/simulation/ can really build', () => {
  it('reads the simulation tree it claims to read', () => {
    // Vacuity guard. An empty source list would make every form "missing",
    // which is loud; but a *shrunken* one is the quiet failure -- a form could
    // be vouched for by a tree the scan mostly did not read. Both the file
    // count and two specific declaring modules are pinned.
    expect(simulationSources.length).toBeGreaterThan(50);
    const paths = simulationSources.map(({ file }) => file);
    expect(paths.some((path) => path.endsWith('runtime/new-session.ts'))).toBe(true);
    expect(paths.some((path) => path.endsWith('runtime/restore-session.ts'))).toBe(true);
    expect(SIMULATION_CONSTRUCTION_FORMS.length).toBeGreaterThan(4);
  });

  it('finds every form declared in the shape the catalog claims', () => {
    expect(
      findMissingConstructionForms(simulationSources).map(describeMissingForm),
      'a construction form in SIMULATION_CONSTRUCTION_FORMS names something src/simulation/ does not export in that shape, so its pattern can never fire. That is exactly the #206 defect: fix the entry or remove it, but do not leave a guard that reads as protection and provides none',
    ).toEqual([]);
  });

  it('still finds the interface that #206 was about, so the reason for the rule stays checkable', () => {
    // If `SimulationRuntime` ever becomes a class, `new SimulationRuntime` is a
    // real construction form and belongs in the catalog. Pinning the current
    // declaration means that change cannot happen without this test noticing.
    const newSession = simulationSources.find(({ file }) => file.endsWith('runtime/new-session.ts'))!;
    expect(newSession.source).toMatch(/^export interface SimulationRuntime \{$/m);
    expect(newSession.source).not.toMatch(/\bexport\s+(?:abstract\s+)?class\s+SimulationRuntime\b/);
    // And the two factories the catalog names instead really are the way one
    // is obtained.
    expect(newSession.source).toMatch(/\bexport function createNewSimulationRuntime\b/);
    const restore = simulationSources.find(({ file }) => file.endsWith('runtime/restore-session.ts'))!;
    expect(restore.source).toMatch(/\bexport function restoreSimulationRuntime\b/);
  });

  it('finds the real construction sites in the simulation tree, so the patterns are proven against production code', () => {
    // The forms are matched against the tree that legitimately uses them.
    // A pattern that stopped matching real construction would otherwise look
    // exactly like a clean renderer.
    const forms = new Set(findConstructionSites(simulationSources).map((site) => site.form));
    for (const form of SIMULATION_CONSTRUCTION_FORMS) {
      expect(forms, `${form.form} is matched nowhere in src/simulation/`).toContain(form.form);
    }
  });
});
