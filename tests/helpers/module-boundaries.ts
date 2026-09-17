import { posix } from 'node:path';
import { stripComments } from './canonical-iteration';

/**
 * The static form of `AGENTS.md`'s architectural boundaries 1, 3 and 10, for
 * the three trees on the main thread: `src/rendering/**`, `src/input/**` and
 * `src/ui/**`.
 *
 * The rules live here rather than as regexes inside the tests that run them,
 * the same split `tests/helpers/canonical-iteration.ts` and
 * `tests/helpers/invariant-enforcers.ts` use with their contract tests:
 * reading files is the test's job, and keeping the scanning rules in an
 * exported module means they are typed and exercised against fixtures in both
 * directions instead of only ever running against real sources, where a
 * pattern that has quietly stopped matching looks exactly like compliance.
 *
 * This module is test-only static analysis with no runtime consumer, so it
 * lives under `tests/helpers/` (still inside `tsconfig.json`'s `include`)
 * rather than in `src/`, which would ship it.
 *
 * ## Why this module exists at all (#206)
 *
 * `tests/unit/rendering-module-boundaries.test.ts` asserted that no rendering
 * module matches `/new (SimulationRuntime|Kernel|SparseWorld|ConstructionSystem)\b/`.
 * Three of those four alternatives name real classes. The fourth,
 * `SimulationRuntime`, is an **interface** (`src/simulation/runtime/new-session.ts`),
 * so `new SimulationRuntime(...)` does not merely fail to appear in the tree --
 * it cannot be written, because `tsc` rejects it. The alternative that named
 * the thing the assertion message was about ("must not build simulation
 * runtimes") was the one alternative that could never fire, and the exported
 * factory that actually builds one, `createNewSimulationRuntime`, was not
 * matched at all. Measured: a rendering module that constructed and exported a
 * live runtime at module scope left the whole suite green with `tsc -b` clean.
 *
 * So the forms are a typed catalog rather than an inline regex, and
 * `findMissingConstructionForms` checks each entry against the declarations
 * `src/simulation/**` actually exports. A catalog entry that names a
 * constructible thing which is not constructible is now a failure with a
 * message that says which -- which is the specific defect #206 reported, made
 * unrepeatable rather than merely fixed once.
 */

/** A `import`/`export ... from` or dynamic `import()` site, as written. */
export interface ImportSite {
  /** The module specifier exactly as written, e.g. `../simulation/protocol/commands`. */
  readonly specifier: string;
  /** 1-based line of the `import`/`export` keyword in the *real* file: `stripComments` preserves every newline. */
  readonly line: number;
  /**
   * Whether the declaration is erased at compile time -- `import type { X }`,
   * `export type { X }`, or a brace clause in which *every* binding carries an
   * inline `type` modifier. A type-only import cannot construct, call or
   * mutate anything, which is the distinction the cross-tree manifest turns
   * on: `src/ui/save-panel.ts` type-importing `RestoredScope` and the same
   * file value-importing `restoreSimulationRuntime` are not the same fact
   * about the boundary.
   */
  readonly typeOnly: boolean;
}

const FROM_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]/g;
/**
 * `import './register';` -- a side-effect import, which has no `from`.
 *
 * The lookbehind excludes a preceding quote as well as an identifier
 * character, because `'import'` as a *string* is not an import keyword. The
 * scanner used to read `this.start('import', ...)` in `src/ui/save-panel.ts`
 * (#287) as a side-effect import of everything up to the next quote, and
 * reported that file as importing a package. Comments were already handled --
 * `stripComments` exists for exactly this class of false positive -- and a
 * quoted occurrence is the same mistake one syntax over. No real side-effect
 * import can be preceded by a quote: the keyword opens a statement, so what
 * precedes it is a line start, a `;` or a `}`.
 */
const SIDE_EFFECT_IMPORT = /(?<![\w$.'"])(import)\s*['"]([^'"]+)['"]/g;
/** `await import('./lazy')` -- anywhere in an expression, so not anchored to a line start. */
const DYNAMIC_IMPORT = /(?<![\w$.])(import)\s*\(\s*['"]([^'"]+)['"]/g;
const DECLARATION_KEYWORD = /(?:^|\n)[ \t]*(import|export)\b/g;

/**
 * Every module specifier this source imports or re-exports.
 *
 * Comments are stripped first, so a doc comment that *discusses* an import --
 * and several modules in these trees explain at length which imports they are
 * deliberately not making -- does not read as one.
 *
 * A `from '...'` is accepted only when the nearest preceding line-initial
 * `import`/`export` keyword reaches it through a clause containing no `;`.
 * That is what keeps a multi-line brace clause (which
 * `src/ui/simulation-commands.ts` and `src/ui/save-panel.ts` both write)
 * matched while a later unrelated `from(...)` call is not, and it is pinned in
 * both directions by fixtures.
 */
export function findImports(rawSource: string): readonly ImportSite[] {
  const source = stripComments(rawSource);
  const sites: ImportSite[] = [];

  const keywordStarts: { readonly index: number; readonly keyword: string }[] = [];
  for (const match of source.matchAll(DECLARATION_KEYWORD)) {
    keywordStarts.push({ index: match.index + match[0].length - match[1]!.length, keyword: match[1]! });
  }

  for (const match of source.matchAll(FROM_SPECIFIER)) {
    const start = keywordStarts.filter((candidate) => candidate.index < match.index).at(-1);
    if (start === undefined) continue;
    const clause = source.slice(start.index, match.index);
    // A clause spanning a statement boundary means the keyword found above
    // belongs to some earlier declaration and this `from` is not an import.
    if (clause.includes(';')) continue;
    sites.push({
      specifier: match[1]!,
      line: lineOf(source, start.index),
      typeOnly: isTypeOnlyClause(clause),
    });
  }

  for (const pattern of [SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT]) {
    for (const match of source.matchAll(pattern)) {
      // A side-effect import and a dynamic `import()` both bring the module's
      // code in, so neither is ever type-only.
      sites.push({ specifier: match[2]!, line: lineOf(source, match.index), typeOnly: false });
    }
  }

  return sites.sort((left, right) => left.line - right.line || left.specifier.localeCompare(right.specifier));
}

function isTypeOnlyClause(clause: string): boolean {
  if (/^(?:import|export)\s+type\b/.test(clause)) return true;
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces === null) return false;
  const bindings = braces[1]!
    .split(',')
    .map((binding) => binding.trim())
    .filter((binding) => binding.length > 0);
  // `import {} from 'x'` imports the module for its side effects, so an empty
  // clause is not type-only. Otherwise every binding must be erased.
  if (bindings.length === 0) return false;
  return bindings.every((binding) => /^type\s/.test(binding));
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split('\n').length;

/**
 * The first path segment under `src/` that `specifier` resolves to, from the
 * perspective of `importerRepoPath` -- `src/ui/build-tool.ts` importing
 * `../rendering/build/edge-picking` resolves to `rendering`.
 *
 * Resolution rather than pattern-matching on the specifier text is deliberate.
 * `/\/(rendering|simulation)\//` cannot tell `../simulation/x` from
 * `./simulation-clock`, and it reads `../../simulation` and `../simulation` as
 * the same depth, so it would mislabel a tree the moment a file moved. Joining
 * the paths is exact.
 *
 * Returns `undefined` for a bare specifier (`phaser`, `zod`, `node:fs`): a
 * package dependency is a different rule, checked separately.
 */
export function resolveTree(importerRepoPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = posix.normalize(posix.join(posix.dirname(importerRepoPath), specifier));
  const segments = resolved.split(posix.sep);
  if (segments[0] !== 'src') return undefined;
  return segments[1];
}

/** How a file depends on a tree other than its own. */
export type CrossTreeKind = 'type-only' | 'value';

export interface CrossTreeDependency {
  /** Repository-relative path of the importing file, e.g. `src/ui/save-panel.ts`. */
  readonly file: string;
  /** The foreign tree, e.g. `simulation`. */
  readonly tree: string;
  /** `value` if *any* import of that tree from that file carries runtime code. */
  readonly kind: CrossTreeKind;
  /** Every specifier involved, sorted -- the failure message names them so a reviewer does not have to grep. */
  readonly specifiers: readonly string[];
  /** Lowest line the dependency appears on, for the failure message only. */
  readonly line: number;
}

export interface ScannedSource {
  /** Repository-relative path. */
  readonly file: string;
  readonly source: string;
}

/**
 * Every dependency from `files` on a tree under `src/` other than `ownTree`.
 *
 * Aggregated per `(file, tree)` on purpose: the manifest's unit of review is
 * "this module is allowed to know that layer", not "this module is allowed
 * this one specifier". A per-specifier list would need editing whenever a
 * module reached one directory deeper into a layer it is already permitted to
 * know, which is the churn that makes an allow-list stop being read.
 */
export function findCrossTreeDependencies(
  files: readonly ScannedSource[],
  ownTree: string,
): readonly CrossTreeDependency[] {
  const byKey = new Map<string, { file: string; tree: string; kind: CrossTreeKind; specifiers: Set<string>; line: number }>();

  for (const { file, source } of files) {
    for (const site of findImports(source)) {
      const tree = resolveTree(file, site.specifier);
      if (tree === undefined || tree === ownTree) continue;
      const key = `${file}::${tree}`;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, {
          file,
          tree,
          kind: site.typeOnly ? 'type-only' : 'value',
          specifiers: new Set([site.specifier]),
          line: site.line,
        });
        continue;
      }
      existing.specifiers.add(site.specifier);
      existing.line = Math.min(existing.line, site.line);
      if (!site.typeOnly) existing.kind = 'value';
    }
  }

  return [...byKey.values()]
    .map((entry) => ({
      file: entry.file,
      tree: entry.tree,
      kind: entry.kind,
      specifiers: [...entry.specifiers].sort(),
      line: entry.line,
    }))
    .sort((left, right) => left.file.localeCompare(right.file) || left.tree.localeCompare(right.tree));
}

export interface CrossTreeAllowance {
  /** Repository-relative path of the importing file. */
  readonly file: string;
  /** The foreign tree it may know. */
  readonly tree: string;
  /** Whether it may know it only as types, or may also run its code. */
  readonly kind: CrossTreeKind;
  /** Why this module is allowed to know that layer. Not decoration: it is the reviewable half of the claim. */
  readonly reason: string;
}

export interface CrossTreeReport {
  /** A dependency no allowance covers. Empty is the passing state. */
  readonly unlisted: readonly CrossTreeDependency[];
  /** An allowance whose dependency no longer exists: the module stopped importing that tree, was renamed, or was deleted. */
  readonly stale: readonly CrossTreeAllowance[];
  /** An allowance whose recorded `kind` no longer matches reality -- a type-only entry that has become a value import, or the reverse. */
  readonly mismatched: readonly { readonly allowance: CrossTreeAllowance; readonly actual: CrossTreeKind }[];
}

/**
 * Compares the dependencies in `dependencies` against `allowances`.
 *
 * All three directions fail, for the reason
 * `tests/foundation/unreachable-invariant-contract.test.ts` gives about its
 * own list: an unrecorded dependency is the erosion this exists to catch, an
 * allowance for a dependency that no longer exists is how a list fills with
 * claims nobody can check, and a `kind` that has drifted is the specific
 * erosion that matters here -- a module permitted to *name* a simulation type
 * quietly gaining the ability to *call* into the simulation is exactly the
 * step that turns a projection into a second source of truth.
 */
export function reportCrossTreeViolations(
  dependencies: readonly CrossTreeDependency[],
  allowances: readonly CrossTreeAllowance[],
): CrossTreeReport {
  const key = (file: string, tree: string): string => `${file}::${tree}`;
  const byKey = new Map(dependencies.map((dependency) => [key(dependency.file, dependency.tree), dependency]));
  const allowed = new Map(allowances.map((allowance) => [key(allowance.file, allowance.tree), allowance]));

  const unlisted = dependencies.filter((dependency) => !allowed.has(key(dependency.file, dependency.tree)));
  const stale = allowances.filter((allowance) => !byKey.has(key(allowance.file, allowance.tree)));
  const mismatched = allowances
    .map((allowance) => ({ allowance, actual: byKey.get(key(allowance.file, allowance.tree))?.kind }))
    .filter((entry): entry is { allowance: CrossTreeAllowance; actual: CrossTreeKind } => entry.actual !== undefined)
    .filter((entry) => entry.actual !== entry.allowance.kind);

  return { unlisted, stale, mismatched };
}

export const describeDependency = (dependency: CrossTreeDependency): string =>
  `${dependency.file}:${dependency.line} depends on src/${dependency.tree}/ (${dependency.kind}: ${dependency.specifiers.join(', ')})`;

/** How a live simulation is brought into existence: a class construction, or a call to an exported factory. */
export type ConstructionDeclaration = 'class' | 'function';

export interface SimulationConstructionForm {
  /** The name declared in `src/simulation/**`. */
  readonly name: string;
  /** How it is declared there. Checked against the real tree by `findMissingConstructionForms`. */
  readonly declaration: ConstructionDeclaration;
  /** Human-readable form, used in failure messages: `new SparseWorld`, `createNewSimulationRuntime(...)`. */
  readonly form: string;
  /** Matches a *use* of the form. */
  readonly pattern: RegExp;
}

/**
 * Every way this repository can bring a live simulation into existence.
 *
 * Two shapes, and the second is the one #206 was about:
 *
 * - a class construction -- `Kernel` (`src/simulation/kernel/kernel.ts`),
 *   `SparseWorld` (`src/simulation/world/sparse-world.ts`),
 *   `ConstructionSystem` (`src/simulation/construction/system.ts`);
 * - a call to an exported factory -- `createNewSimulationRuntime`
 *   (`src/simulation/runtime/new-session.ts`) and
 *   `restoreSimulationRuntime` (`src/simulation/runtime/restore-session.ts`),
 *   which are how a `SimulationRuntime` is actually obtained, `SimulationRuntime`
 *   itself being an interface.
 *
 * The factory patterns deliberately do **not** exclude a member access, so
 * `helpers.createNewSimulationRuntime(1)` is matched too: reaching the factory
 * through an object is still building a runtime.
 *
 * Reading a simulation *type* or calling a *pure* simulation helper is not on
 * this list and is not meant to be -- that is what a projection is for, and
 * `src/rendering/world/world-view.ts` argues at length why its ownership rule
 * deliberately lives on the simulation side. What is forbidden is owning the
 * mutable thing.
 */
export const SIMULATION_CONSTRUCTION_FORMS: readonly SimulationConstructionForm[] = [
  { name: 'Kernel', declaration: 'class', form: 'new Kernel', pattern: /\bnew\s+Kernel\b/ },
  { name: 'SparseWorld', declaration: 'class', form: 'new SparseWorld', pattern: /\bnew\s+SparseWorld\b/ },
  {
    name: 'ConstructionSystem',
    declaration: 'class',
    form: 'new ConstructionSystem',
    pattern: /\bnew\s+ConstructionSystem\b/,
  },
  {
    name: 'createNewSimulationRuntime',
    declaration: 'function',
    form: 'createNewSimulationRuntime(...)',
    pattern: /(?<![\w$])createNewSimulationRuntime\s*\(/,
  },
  {
    name: 'restoreSimulationRuntime',
    declaration: 'function',
    form: 'restoreSimulationRuntime(...)',
    pattern: /(?<![\w$])restoreSimulationRuntime\s*\(/,
  },
];

export interface ConstructionSite {
  readonly file: string;
  readonly form: string;
  readonly line: number;
}

/**
 * Every place `files` builds a live simulation.
 *
 * Comments are stripped, so a module may still explain in prose that it must
 * never call `createNewSimulationRuntime` -- which
 * `tests/unit/rendering-module-boundaries.test.ts` itself does, and which a
 * comment-blind scan would read as the violation.
 */
export function findConstructionSites(
  files: readonly ScannedSource[],
  forms: readonly SimulationConstructionForm[] = SIMULATION_CONSTRUCTION_FORMS,
): readonly ConstructionSite[] {
  const sites: ConstructionSite[] = [];
  for (const { file, source } of files) {
    const code = stripComments(source);
    for (const form of forms) {
      // `RegExp.exec` on a non-global pattern so the catalog entries stay
      // stateless and can be reused across files in any order.
      const match = form.pattern.exec(code);
      if (match === null) continue;
      sites.push({ file, form: form.form, line: lineOf(code, match.index) });
    }
  }
  return sites.sort((left, right) => left.file.localeCompare(right.file) || left.form.localeCompare(right.form));
}

export interface ConstructionScanReport {
  readonly sites: readonly ConstructionSite[];
  /**
   * How many files were actually read.
   *
   * The denominator that makes an empty `sites` list mean "clean" rather than
   * merely "quiet". Measured: with the call site mutated from
   * `reportConstructionSites(allUiFiles)` to `reportConstructionSites([])` --
   * a scan handed nothing, which is what a collection filter that stops
   * matching produces -- an assertion on `sites` alone stays green and the
   * guard is gone. Callers assert this against the file count they collected,
   * the same role `CanonicalIterationReport.unorderedCount` plays for its own
   * allow-list.
   */
  readonly scannedFiles: number;
}

/** `findConstructionSites` with the denominator attached, so an empty result cannot pass for compliance. */
export function reportConstructionSites(
  files: readonly ScannedSource[],
  forms: readonly SimulationConstructionForm[] = SIMULATION_CONSTRUCTION_FORMS,
): ConstructionScanReport {
  return { sites: findConstructionSites(files, forms), scannedFiles: files.length };
}

export const describeConstructionSite = (site: ConstructionSite): string => `${site.file}:${site.line} builds ${site.form}`;

export interface MissingConstructionForm {
  readonly form: SimulationConstructionForm;
  /** What the tree declares under that name instead, when it declares something unconstructible. */
  readonly declaredInstead?: 'interface' | 'type';
}

/**
 * Catalog entries that name something `src/simulation/**` does not export in
 * the shape the entry claims.
 *
 * This is the assertion #206 needed and nothing had: `new SimulationRuntime`
 * sat in the guard for as long as it did because nothing ever checked that
 * `SimulationRuntime` was a class. An entry naming an interface can never
 * fire, and an entry naming a renamed or deleted export can never fire either;
 * both leave a guard that reads as protection and provides none.
 */
export function findMissingConstructionForms(
  simulationSources: readonly ScannedSource[],
  forms: readonly SimulationConstructionForm[] = SIMULATION_CONSTRUCTION_FORMS,
): readonly MissingConstructionForm[] {
  const declarations = simulationSources.map(({ source }) => stripComments(source));
  const missing: MissingConstructionForm[] = [];

  for (const form of forms) {
    const keyword = form.declaration === 'class' ? 'class' : 'function';
    const declared = new RegExp(`\\bexport\\s+(?:abstract\\s+)?${keyword}\\s+${form.name}\\b`);
    if (declarations.some((source) => declared.test(source))) continue;
    const asInterface = new RegExp(`\\bexport\\s+interface\\s+${form.name}\\b`);
    const asType = new RegExp(`\\bexport\\s+type\\s+${form.name}\\b`);
    if (declarations.some((source) => asInterface.test(source))) {
      missing.push({ form, declaredInstead: 'interface' });
      continue;
    }
    if (declarations.some((source) => asType.test(source))) {
      missing.push({ form, declaredInstead: 'type' });
      continue;
    }
    missing.push({ form });
  }

  return missing;
}

export const describeMissingForm = ({ form, declaredInstead }: MissingConstructionForm): string =>
  declaredInstead === undefined
    ? `${form.form}: src/simulation/ exports no ${form.declaration} named ${form.name}, so this pattern can never match`
    : `${form.form}: ${form.name} is an ${declaredInstead} in src/simulation/, not a ${form.declaration}, so \`new ${form.name}\` does not compile and this pattern can never match`;

/** Browser globals a headless, injectable tree must not reach for. */
const BROWSER_GLOBALS = ['document', 'window', 'localStorage', 'sessionStorage', 'navigator'] as const;

export interface BrowserGlobalAccess {
  /** The global as reached: `localStorage`, or `globalThis.localStorage` for the `globalThis` shape. Used as the allow-list key, so changing how a module reaches a global makes an entry go stale. */
  readonly global: string;
  /** 1-based line in the real file: `stripComments` preserves every newline. */
  readonly line: number;
}

/**
 * Every access of a browser global in this source, in two shapes.
 *
 * **A bare global with a member access or an index** -- `document.body`,
 * `localStorage["k"]`. A member access is required, so the word "window"
 * ending an English sentence is not a hit and neither is a property named
 * `window` in a type literal; that is the same reason
 * `tests/unit/services-layer-boundaries.test.ts` requires one.
 *
 * **`globalThis.<global>`, with or without a following member access.** This
 * second shape is not symmetry for its own sake: `src/input/storage.ts:111`
 * writes `const store = globalThis.localStorage;` and then calls `getItem` on
 * the *binding*, so the first rule alone sees nothing at all -- neither the
 * `.` before `localStorage` (excluded by the lookbehind) nor a member access
 * after it (there is none). A rule that silently missed the one real access in
 * the tree it scans would be the same defect #206 reported, in the other
 * direction. `globalThis.` is unambiguous evidence on its own, so no trailing
 * access is required for it.
 *
 * Comments are stripped, because `docs/INPUT.md`'s rule about
 * `window.localStorage` is quoted at length in `src/input/storage.ts`'s own
 * doc comment and in `src/main.ts`'s.
 */
export function findBrowserGlobalAccess(rawSource: string): readonly BrowserGlobalAccess[] {
  const source = stripComments(rawSource);
  const found: BrowserGlobalAccess[] = [];
  for (const global of BROWSER_GLOBALS) {
    const pattern = new RegExp(`(?<![\\w$.])${global}\\s*(?:\\.\\s*[A-Za-z_$]|\\[)`, 'g');
    for (const match of source.matchAll(pattern)) found.push({ global, line: lineOf(source, match.index) });
  }
  const viaGlobalThis = new RegExp(`(?<![\\w$.])globalThis\\s*\\.\\s*(${BROWSER_GLOBALS.join('|')})\\b`, 'g');
  for (const match of source.matchAll(viaGlobalThis)) {
    found.push({ global: `globalThis.${match[1]!}`, line: lineOf(source, match.index) });
  }
  return found.sort((left, right) => left.line - right.line || left.global.localeCompare(right.global));
}
