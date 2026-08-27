import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findImports } from './module-boundaries';

/**
 * The value-import walk from the shipped build's entry points.
 *
 * It was written for `tests/foundation/content-validation-reachability-contract.test.ts`
 * (#315/#376), which asks one question of it: is the module carrying the
 * content cross-reference `throw` in the graph the bundler is given? It now
 * answers a second one in
 * `tests/foundation/trusted-tier-reachability-contract.test.ts` (#378): which
 * modules under `src/services/` and `src/persistence/` are *not* in that graph,
 * and is each absence deliberate?
 *
 * **It lives here rather than in either test because a second copy of a
 * scanning rule is how #188 happened**, and this repository has paid for that
 * class twice — once in `findImports` itself, which this walk sits on, and once
 * in `tests/unit/rendering-module-boundaries.test.ts`'s construction forms
 * (#206). The walk has fixtures pinning it in both directions in the content
 * gate's `describe('the walk itself, against a written-out graph')`, and those
 * fixtures now exercise this module rather than a copy of it.
 *
 * ## What a walk can and cannot prove
 *
 * **Reachable is not emitted.** This says the bundler is handed the module;
 * whether it keeps a top-level side effect is a purity judgement Vite, Rolldown
 * or a change to the module's shape can alter without touching the module. Only
 * the bundler settles that, which is why the content gate's other half is a
 * plugin in `vite.config.ts` that reads the emitted chunk.
 *
 * **Unreachable is not dead.** A module reached only through `import type` is
 * erased rather than absent, and this walk reports it unreachable — correctly,
 * since it contributes no code, and misleadingly if the reader is asking
 * whether to delete it. `reachableModules` therefore takes `followTypeOnly` so
 * a caller can ask both questions and tell the two answers apart, which is the
 * distinction `trusted-tier-reachability-contract.test.ts` turns on.
 */

/** Reads a repository-relative path, or `undefined` when there is no such module. */
export type ReadModule = (repoPath: string) => string | undefined;

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Where the shipped build starts. Two, because the simulation kernel is its
 * own bundle: `src/main.ts` builds the worker through Vite's `?worker` import
 * of `src/simulation/worker/worker.ts`, which the walk below follows, but
 * naming it explicitly means the worker graph is still covered if the
 * construction ever moves.
 */
export const PRODUCTION_ENTRY_POINTS = ['src/main.ts', 'src/simulation/worker/worker.ts'] as const;

/** Reads a repository-relative `.ts` path off disk. */
export const readFromDisk: ReadModule = (repoPath) => {
  const absolute = path.join(repositoryRoot, repoPath);
  if (!existsSync(absolute)) return undefined;
  return readFileSync(absolute, 'utf8');
};

/**
 * Resolves a relative specifier to a repository-relative `.ts` path.
 *
 * Bare specifiers (`phaser`, `zod`, `node:fs`) resolve to nothing: a package
 * cannot contain this repository's own modules. A `?worker`/`?url` query is
 * stripped before resolution, because `./worker.ts?worker` is `./worker.ts` as
 * far as the module graph is concerned -- and that is the one specifier the
 * client entry uses to reach the whole simulation kernel, so a resolver that
 * dropped it would silently walk half the application.
 */
export function resolveModule(importer: string, specifier: string, read: ReadModule): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const withoutQuery = specifier.split('?')[0]!;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(importer), withoutQuery));
  for (const candidate of [joined, `${joined}.ts`, `${joined}/index.ts`]) {
    if (!candidate.endsWith('.ts')) continue;
    if (read(candidate) !== undefined) return candidate;
  }
  return undefined;
}

/**
 * Every module the production build loads, following value imports only unless
 * `followTypeOnly` says otherwise.
 *
 * Type-only imports are excluded by default because they are erased: a module
 * reached exclusively by `import type` contributes no code and runs no side
 * effect, which is exactly the distinction the content gate turns on.
 * `findImports` makes that call, and it is the same scanner
 * `tests/unit/*-module-boundaries.test.ts` uses, pinned by fixtures in
 * `tests/unit/module-boundaries.test.ts`.
 *
 * Takes its reader as an argument so the walk itself can be exercised against
 * a written-out graph rather than only against the real tree, where a walk
 * that quietly stopped following imports would look exactly like a tree with
 * nothing wrong in it.
 */
export function reachableModules(
  read: ReadModule,
  entryPoints: readonly string[],
  options: { readonly followTypeOnly?: boolean } = {},
): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [...entryPoints];

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (reached.has(current)) continue;
    const source = read(current);
    if (source === undefined) continue;
    reached.add(current);

    for (const site of findImports(source)) {
      if (site.typeOnly && options.followTypeOnly !== true) continue;
      const resolved = resolveModule(current, site.specifier, read);
      if (resolved !== undefined && !reached.has(resolved)) pending.push(resolved);
    }
  }

  return reached;
}
