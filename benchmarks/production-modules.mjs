/**
 * Loads the **real** `src/simulation/` modules into the benchmark harness.
 *
 * Issue #410: every scenario written before this one re-implemented the
 * subsystem it was named after, so `verify:benchmark` passing said nothing
 * about production code. A scenario that imports through here is exercising
 * the shipped modules; one that does not is a model, and
 * `docs/BENCHMARKING.md` now says which is which per scenario.
 *
 * Two things stand between a `.mjs` benchmark and a `.ts` production module,
 * and both are solved here rather than by adding a build step or a
 * transpiler dependency (AGENTS.md: no dependency for trivial functionality):
 *
 * 1. **Extension-less specifiers.** `src/` is written for
 *    `moduleResolution: "Bundler"` (`./door`, not `./door.ts`), which Node's
 *    ESM resolver rejects. `module.registerHooks` (stable, built in) maps a
 *    relative extension-less specifier onto the `.ts`/`.ts` index file beside
 *    it, and defers to the default resolver for everything else -- so the
 *    hook cannot change how any `node_modules` or `node:` specifier resolves.
 * 2. **Non-erasable syntax.** `SparseWorld`, `PathRequestQueue` and
 *    `NavigationSystem` all use TypeScript parameter properties, which Node's
 *    default strip-only type stripping refuses. `--experimental-transform-types`
 *    handles them; `package.json`'s `benchmark`/`benchmark:smoke`/
 *    `verify:benchmark` scripts pass it, and `assertTypeScriptTransformEnabled`
 *    below turns running the harness without it into one actionable line
 *    instead of a syntax error from inside a production file.
 *
 * The hook is registered lazily, on first use, so importing the registry
 * never changes module resolution for a process that runs no production-code
 * scenario.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = pathToFileURL(path.join(repositoryRoot, 'src', path.sep)).href;

const TYPESCRIPT_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/u;

let hooksRegistered = false;
let modulesPromise;
let optionsPromise;
let rngPromise;

export function assertTypeScriptTransformEnabled() {
  if (process.features.typescript === 'transform') return;

  throw new Error(
    'Benchmark scenarios that import production TypeScript need Node started with ' +
      `--experimental-transform-types (process.features.typescript is ${String(process.features.typescript)}). ` +
      'Use `pnpm benchmark`, `pnpm benchmark:smoke` or `pnpm verify:benchmark`, which pass it.',
  );
}

function registerTypeScriptResolution() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parentURL = context.parentURL;
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      // Scoped to `src/simulation/`'s own relative graph on purpose: nothing
      // outside it can have its resolution altered by loading this module.
      if (relative && parentURL !== undefined && parentURL.startsWith(sourceRoot) && !TYPESCRIPT_EXTENSION_PATTERN.test(specifier)) {
        const base = new URL(specifier, parentURL);
        for (const candidate of [`${base.href}.ts`, `${base.href}/index.ts`]) {
          if (existsSync(fileURLToPath(candidate))) {
            return { url: candidate, shortCircuit: true };
          }
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

async function importSimulation(relativePath) {
  return import(pathToFileURL(path.join(repositoryRoot, 'src', 'simulation', relativePath)).href);
}

/**
 * The production navigation surface a benchmark drives, loaded once per
 * process. Deliberately an explicit list rather than `navigation/index.ts`:
 * the set of production modules a benchmark depends on should be readable
 * from the benchmark side.
 */
export async function loadNavigationModules() {
  assertTypeScriptTransformEnabled();
  registerTypeScriptResolution();

  modulesPromise ??= (async () => {
    const [coordinates, sparseWorld, door, regionGraph, router, navigationSystem, localSearch] = await Promise.all([
      importSimulation('world/coordinates.ts'),
      importSimulation('world/sparse-world.ts'),
      importSimulation('navigation/door.ts'),
      importSimulation('navigation/region-graph.ts'),
      importSimulation('navigation/router.ts'),
      importSimulation('navigation/navigation-system.ts'),
      importSimulation('navigation/local-search.ts'),
    ]);

    return Object.freeze({
      chunkCoordinate: coordinates.chunkCoordinate,
      tileCoordinate: coordinates.tileCoordinate,
      SparseWorld: sparseWorld.SparseWorld,
      DoorRegistry: door.DoorRegistry,
      buildNavigationGraph: regionGraph.buildNavigationGraph,
      findRoute: router.findRoute,
      NavigationSystem: navigationSystem.NavigationSystem,
      PLAIN_STEP_COST: localSearch.PLAIN_STEP_COST,
    });
  })();

  return modulesPromise;
}

/**
 * The navigation options a real session runs on
 * (`src/simulation/runtime/new-session.ts`), read rather than copied.
 *
 * A benchmark that hard-codes `workBudgetPerTick: 2_000` beside a comment
 * naming the file it came from is a benchmark that keeps passing after
 * somebody changes the budget. This costs one import of the composition
 * root's module graph -- roughly half a second, once per process, and only
 * for a run that includes a production-code scenario.
 */
export async function loadProductionNavigationOptions() {
  assertTypeScriptTransformEnabled();
  registerTypeScriptResolution();

  optionsPromise ??= importSimulation('runtime/new-session.ts').then(
    (module) => module.DEFAULT_NAVIGATION_SYSTEM_OPTIONS,
  );
  return optionsPromise;
}

/**
 * The simulation's own seeded RNG. Every `.mjs` scenario written before #410
 * carries its own copy of xoshiro128** -- five copies of the same 20 lines,
 * none of them the generator the game draws from.
 */
export async function loadSimulationRng() {
  assertTypeScriptTransformEnabled();
  registerTypeScriptResolution();

  rngPromise ??= (async () => {
    const [xoshiro, seed] = await Promise.all([
      importSimulation('rng/xoshiro128starstar.ts'),
      importSimulation('rng/seed.ts'),
    ]);
    return Object.freeze({
      Xoshiro128StarStar: xoshiro.Xoshiro128StarStar,
      deriveXoshiroState: seed.deriveXoshiroState,
    });
  })();
  return rngPromise;
}
