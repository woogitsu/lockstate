import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { stripComments } from '../helpers/canonical-iteration';

/**
 * A static contract, in the spirit of `tests/unit/navigation-no-phaser.test.ts`,
 * over *everything the simulation can reach*.
 *
 * `docs/DETERMINISM.md` and
 * [ADR 0020](../../docs/adr/0020-deterministic-kernel.md) state the rule
 * plainly: simulation logic must never use `Math.random()`, `Date.now()`,
 * `performance.now()` or any other ambient environment source, and must not
 * touch Phaser or the DOM. ADR 0009 turns that from an engineering
 * preference into a
 * product guarantee -- a single reintroduced `Math.random()` invalidates
 * every stored challenge replay, and it would do so silently, because the
 * runtime would keep working perfectly on the machine that wrote the
 * evidence.
 *
 * A hand-maintained folder list would rot the first time simulation code
 * imported a new helper, so this walks the real transitive import graph
 * from every file under `src/simulation/` outwards. Anything the
 * simulation can reach is in scope automatically.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SIMULATION_ROOT = join(REPOSITORY_ROOT, 'src/simulation');

/**
 * Sources that can influence simulation *state*. `FixedStepClock` reading
 * real time to decide *how many* whole 50 ms ticks to run is legitimate
 * pacing (docs/DETERMINISM.md), which is why the allow-list below is
 * expressed per file and per pattern rather than per rule.
 */
const FORBIDDEN: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'Math.random()', pattern: /\bMath\s*\.\s*random\b/ },
  { name: 'Date.now()', pattern: /\bDate\s*\.\s*now\b/ },
  { name: 'new Date()', pattern: /\bnew\s+Date\b/ },
  { name: 'performance.now()', pattern: /\bperformance\s*\.\s*now\b/ },
  { name: 'crypto randomness', pattern: /\bcrypto\s*\.\s*(?:randomUUID|getRandomValues)\b/ },
  { name: 'Intl (locale/timezone dependent)', pattern: /\bIntl\s*\.\s*[A-Z]/ },
  { name: 'toLocale* (locale dependent)', pattern: /\.toLocale[A-Z]\w*\s*\(/ },
  { name: 'localeCompare (locale/ICU dependent ordering)', pattern: /\.localeCompare\s*\(/ },
  { name: 'navigator', pattern: /\bnavigator\s*\./ },
  { name: 'DOM document', pattern: /\bdocument\s*\./ },
  { name: 'DOM window', pattern: /\bwindow\s*\./ },
  { name: 'localStorage / sessionStorage', pattern: /\b(?:local|session)Storage\b/ },
  { name: 'process.env', pattern: /\bprocess\s*\.\s*env\b/ },
  { name: 'Phaser import', pattern: /from\s*['"]phaser['"]/i },
];

/**
 * The complete set of exceptions, each tied to one file and one pattern
 * with the reason it is safe. Adding a source of ambient nondeterminism to
 * simulation code therefore cannot be done quietly: it requires an entry
 * here, which is a reviewable diff.
 */
const ALLOWED: readonly { readonly file: string; readonly patternName: string; readonly reason: string }[] = [
  {
    file: 'src/simulation/worker/worker.ts',
    patternName: 'performance.now()',
    reason:
      'Worker shell only. The value is passed to `FixedStepClock.pump`, which converts elapsed real time into a whole number of 50 ms ticks. It paces how many ticks run; it never reaches a system, a command payload or any simulation state.',
  },
  {
    file: 'src/simulation/worker/state-machine.ts',
    patternName: 'crypto randomness',
    reason:
      'Protocol envelope only: `messageId` correlates a worker response with a main-thread request (ADR 0003). Message ids are never read by the kernel, never enter a snapshot and never influence a tick.',
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
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

/**
 * Third-party packages the simulation import closure is allowed to reach.
 * `zod` is the approved runtime validator for the worker protocol envelope
 * and the content catalogs (AGENTS.md's mandatory stack); it performs no
 * I/O, reads no clock and reads no locale. Anything else appearing here --
 * Phaser above all -- is a boundary violation, not a dependency choice to
 * make inside a pull request.
 */
const ALLOWED_PACKAGES: readonly string[] = ['zod'];

/** Every `from '...'`, `import '...'` and `import('...')` specifier in a source file. Comments must be stripped first, or prose mentioning `from 'x'` reads as an import. */
function importSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) specifiers.push(match[1]!);
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(match[1]!);
  for (const match of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) specifiers.push(match[1]!);
  return specifiers;
}

function resolveRelative(fromFile: string, specifier: string): string | undefined {
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

interface ImportGraph {
  readonly files: readonly string[];
  readonly bareSpecifiers: readonly { readonly file: string; readonly specifier: string }[];
  readonly unresolved: readonly { readonly file: string; readonly specifier: string }[];
}

/** Transitive closure of relative imports, seeded with every file under `src/simulation/`. */
function buildSimulationImportGraph(): ImportGraph {
  const queue = listTypeScriptFiles(SIMULATION_ROOT);
  const visited = new Set<string>(queue);
  const bareSpecifiers: { file: string; specifier: string }[] = [];
  const unresolved: { file: string; specifier: string }[] = [];

  while (queue.length > 0) {
    const file = queue.shift()!;
    const source = stripComments(readFileSync(file, 'utf8'));
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        bareSpecifiers.push({ file, specifier });
        continue;
      }
      const resolved = resolveRelative(file, specifier);
      if (resolved === undefined) {
        unresolved.push({ file, specifier });
        continue;
      }
      if (visited.has(resolved)) continue;
      visited.add(resolved);
      queue.push(resolved);
    }
  }

  return { files: [...visited].sort(), bareSpecifiers, unresolved };
}


// Comments are stripped before scanning so the rule can still be *discussed* in
// prose -- several modules explain in a doc comment why they do not use
// `Math.random()`. This is a guard against honest mistakes, not against a
// contributor deliberately hiding a call inside a string literal.
//
// The stripper is the shared one. A local copy here replaced each block comment
// with a single space, which collapses newlines: harmless while this suite
// reports only file paths, and silently wrong the day anyone adds a line number
// to one of its failures. Measured in #193: the deleting variant changed the
// line count in 341 of 420 files. Consolidated by #198, which leaves exactly
// one implementation of this rule in `tests/`.
const repoPath = (file: string): string => relative(REPOSITORY_ROOT, file).split('\\').join(posix.sep);

const GRAPH = buildSimulationImportGraph();

describe('simulation import closure forbids ambient nondeterminism', () => {
  it('reaches the whole simulation tree and the modules it imports', () => {
    const paths = GRAPH.files.map(repoPath);
    expect(paths.length).toBeGreaterThan(50);
    // Sanity: the walker really does follow imports out of src/simulation/.
    expect(paths).toContain('src/simulation/kernel/kernel.ts');
    expect(paths).toContain('src/simulation/runtime/new-session.ts');
    expect(paths).toContain('src/shared/json.ts');
    expect(paths).toContain('src/content/contraband-catalog.ts');
    // ...and never wanders into layers the simulation must not depend on.
    expect(paths.filter((path) => path.startsWith('src/persistence/'))).toEqual([]);
    expect(paths.filter((path) => path.startsWith('src/services/'))).toEqual([]);
    expect(paths.filter((path) => path.startsWith('src/rendering/'))).toEqual([]);
    expect(paths.filter((path) => path.startsWith('src/ui/'))).toEqual([]);
  });

  it('resolves every relative import it finds, so nothing is skipped silently', () => {
    expect(GRAPH.unresolved.map(({ file, specifier }) => `${repoPath(file)} -> ${specifier}`)).toEqual([]);
  });

  it('pulls in no third-party package beyond the approved list -- Phaser above all stays out of the kernel', () => {
    const unapproved = GRAPH.bareSpecifiers
      .filter(({ specifier }) => !ALLOWED_PACKAGES.includes(specifier.split('/')[0]!))
      .map(({ file, specifier }) => `${repoPath(file)} -> ${specifier}`);
    expect(unapproved).toEqual([]);

    // The approved list must stay a list of packages actually in use, not
    // a standing licence for anything named in it.
    const used = new Set(GRAPH.bareSpecifiers.map(({ specifier }) => specifier.split('/')[0]!));
    expect([...ALLOWED_PACKAGES].sort()).toEqual([...used].sort());
  });

  it('contains no unapproved clock, locale, DOM or randomness source', () => {
    const violations: string[] = [];

    for (const file of GRAPH.files) {
      const path = repoPath(file);
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const { name, pattern } of FORBIDDEN) {
        if (!pattern.test(source)) continue;
        const approved = ALLOWED.some((entry) => entry.file === path && entry.patternName === name);
        if (!approved) violations.push(`${path}: ${name}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps its allow-list honest -- every exception still names a real, still-present use', () => {
    for (const entry of ALLOWED) {
      const pattern = FORBIDDEN.find((forbidden) => forbidden.name === entry.patternName);
      expect(pattern, `allow-list entry names an unknown pattern: ${entry.patternName}`).toBeDefined();

      const absolute = join(REPOSITORY_ROOT, entry.file);
      expect(GRAPH.files, `allow-list entry is not in the simulation import closure: ${entry.file}`).toContain(absolute);
      expect(
        pattern!.pattern.test(stripComments(readFileSync(absolute, 'utf8'))),
        `stale allow-list entry: ${entry.file} no longer uses ${entry.patternName}, delete the exception`,
      ).toBe(true);
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });

  it('would catch a reintroduced ambient source -- the patterns are not dead regexes', () => {
    const sample = `
      const a = Math.random();
      const b = Date.now();
      const c = new Date();
      const d = performance.now();
      const e = crypto.randomUUID();
      const f = new Intl.NumberFormat('en');
      const g = value.toLocaleString();
      const h = left.localeCompare(right);
      const i = navigator.language;
      document.body;
      window.location;
      localStorage.getItem('x');
      process.env.HOME;
      import Phaser from 'phaser';
    `;
    for (const { name, pattern } of FORBIDDEN) {
      expect(pattern.test(sample), `pattern for ${name} does not match its own example`).toBe(true);
    }
    expect(stripComments('// Math.random()\n/* Date.now() */\nconst ok = 1;')).not.toMatch(/Math\.random|Date\.now/);
  });
});
