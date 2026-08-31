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

/*
 * ## Why the loaders below carry `@returns` types
 *
 * Issue #602. Every production symbol a benchmark or a report script touches
 * arrives through one of the five loaders in this file, and each of them
 * reaches it by `import()` of a *computed* URL string. TypeScript cannot
 * resolve a non-literal dynamic import, so without the annotations below the
 * whole production surface is `any` on the benchmark side -- and `checkJs`
 * over `benchmarks/**` then checks nothing that matters. Measured: with
 * `allowJs`/`checkJs` on and no annotation here, reintroducing PR #581's
 * three-argument `locomotion.advance(1, writeTile, onArrived)` produced no
 * error at all.
 *
 * The types are *derived*, never restated. `Pick<typeof import('...'), 'X'>`
 * fails to compile if `X` stops being exported and follows `X`'s signature
 * wherever it goes, so these typedefs cannot rot into a second copy of the
 * production contract the way a hand-written `.d.mts` body would.
 *
 * What they do **not** check is the wiring: that the key `LocomotionStore`
 * really is assigned `locomotion.LocomotionStore` below. That assignment runs
 * through `any` and nothing types it. A key mapped to the wrong symbol would
 * still compile, and only a benchmark run would notice.
 */

/**
 * @typedef {Pick<typeof import('../src/simulation/world/coordinates'), 'chunkCoordinate' | 'tileCoordinate'>
 *   & Pick<typeof import('../src/simulation/world/sparse-world'), 'SparseWorld'>
 *   & Pick<typeof import('../src/simulation/navigation/door'), 'DoorRegistry'>
 *   & Pick<typeof import('../src/simulation/navigation/region-graph'), 'buildNavigationGraph'>
 *   & Pick<typeof import('../src/simulation/navigation/router'), 'findRoute'>
 *   & Pick<typeof import('../src/simulation/navigation/navigation-system'), 'NavigationSystem'>
 *   & Pick<typeof import('../src/simulation/navigation/local-search'), 'PLAIN_STEP_COST'>} NavigationModules
 */

/**
 * @typedef {Pick<typeof import('../src/simulation/runtime/new-session'), 'createNewSimulationRuntime' | 'CONSTRUCTION_MATERIALS_CONTAINER_ID'>
 *   & Pick<typeof import('../src/simulation/kernel/kernel'), 'Kernel'>
 *   & Pick<typeof import('../src/simulation/protocol/commands'), 'packCommand'>
 *   & Pick<typeof import('../src/simulation/prisoners/regime'), 'DAY_LENGTH_TICKS'>} SimulationRuntimeModules
 */

/**
 * @typedef {Pick<typeof import('../src/simulation/rng/xoshiro128starstar'), 'Xoshiro128StarStar'>
 *   & Pick<typeof import('../src/simulation/rng/seed'), 'deriveXoshiroState'>
 *   & Pick<typeof import('../src/simulation/rng/streams'), 'NamedRngStreams'>} SimulationRngModules
 */

/**
 * @typedef {Pick<typeof import('../src/simulation/entity/entity-store'), 'EntityStore'>
 *   & Pick<typeof import('../src/simulation/prisoners/components'), 'PositionComponent'>
 *   & Pick<typeof import('../src/simulation/locomotion/index'), 'LocomotionStore' | 'DEFAULT_WALK_SUBTILE_UNITS_PER_TICK' | 'LOCOMOTION_SUBTILE_UNITS'>
 *   & Pick<typeof import('../src/simulation/worker/render-actors-keyframe'), 'encodeRenderActorsKeyframe'>
 *   & Pick<typeof import('../src/simulation/protocol/render-actors-payload'), 'decodeRenderActorsPayload' | 'renderActorsByteLength' | 'RENDER_ACTORS_SUBTILE_UNITS'>
 *   & Pick<typeof import('../src/rendering/feed/actors-from-delta'), 'actorsFromDelta'>
 *   & Pick<typeof import('../src/simulation/clock/fixed-step-clock'), 'FixedStepClock'>
 *   & Pick<typeof import('../src/simulation/worker/state-machine'), 'RENDER_DELTA_PUBLISH_INTERVAL_MS'>} ActorPublicationModules
 */

const TYPESCRIPT_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/u;

let hooksRegistered = false;
let modulesPromise;
let optionsPromise;
let rngPromise;
let actorPublicationPromise;
let runtimePromise;

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
 * The one import that leaves `src/simulation/`. `actorsFromDelta` is the
 * *receiving* half of ADR 0059's cost table and lives under `src/rendering/`,
 * so a benchmark that measured only the worker half would report half the
 * number the ADR reports. It imports no Phaser and touches no DOM -- scenario
 * rule 7 -- which is checked by the fact that this loads at all in plain Node.
 */
async function importRendering(relativePath) {
  return import(pathToFileURL(path.join(repositoryRoot, 'src', 'rendering', relativePath)).href);
}

/**
 * The production navigation surface a benchmark drives, loaded once per
 * process. Deliberately an explicit list rather than `navigation/index.ts`:
 * the set of production modules a benchmark depends on should be readable
 * from the benchmark side.
 *
 * @returns {Promise<Readonly<NavigationModules>>}
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
 *
 * @returns {Promise<typeof import('../src/simulation/runtime/new-session').DEFAULT_NAVIGATION_SYSTEM_OPTIONS>}
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
 * The whole session composition root and the bare kernel class, loaded once
 * per process. `createNewSimulationRuntime` is the one function that wires
 * every registered system exactly as a real session does -- so a benchmark
 * that measures per-system tick cost against it is measuring the shipped
 * graph, not a hand-assembled stand-in of it. `Kernel` is exported alongside
 * it so a benchmark can register a subset of the same system instances
 * (`runtime.navigation`, say) on a fresh kernel of its own, to isolate one
 * system's tick cost without rebuilding the object graph around it.
 *
 * @returns {Promise<Readonly<SimulationRuntimeModules>>}
 */
export async function loadSimulationRuntimeModules() {
  assertTypeScriptTransformEnabled();
  registerTypeScriptResolution();

  runtimePromise ??= (async () => {
    /*
     * `packCommand` and `DAY_LENGTH_TICKS` were added for
     * `scripts/report-loan-recovery-pricing.mjs`, which has to *play* a
     * session rather than tick an idle one: a report that reached into
     * `runtime.construction` directly would be measuring a hand-assembled
     * sequence, and the whole point of that measurement is that it goes
     * through the same command boundary a press does.
     */
    const [newSession, kernel, commands, regime] = await Promise.all([
      importSimulation('runtime/new-session.ts'),
      importSimulation('kernel/kernel.ts'),
      importSimulation('protocol/commands.ts'),
      importSimulation('prisoners/regime.ts'),
    ]);
    return Object.freeze({
      createNewSimulationRuntime: newSession.createNewSimulationRuntime,
      CONSTRUCTION_MATERIALS_CONTAINER_ID: newSession.CONSTRUCTION_MATERIALS_CONTAINER_ID,
      Kernel: kernel.Kernel,
      packCommand: commands.packCommand,
      DAY_LENGTH_TICKS: regime.DAY_LENGTH_TICKS,
    });
  })();
  return runtimePromise;
}

/**
 * The simulation's own seeded RNG. Every `.mjs` scenario written before #410
 * carries its own copy of xoshiro128** -- five copies of the same 20 lines,
 * none of them the generator the game draws from.
 *
 * @returns {Promise<Readonly<SimulationRngModules>>}
 */
export async function loadSimulationRng() {
  assertTypeScriptTransformEnabled();
  registerTypeScriptResolution();

  rngPromise ??= (async () => {
    const [xoshiro, seed, streams] = await Promise.all([
      importSimulation('rng/xoshiro128starstar.ts'),
      importSimulation('rng/seed.ts'),
      importSimulation('rng/streams.ts'),
    ]);
    return Object.freeze({
      Xoshiro128StarStar: xoshiro.Xoshiro128StarStar,
      deriveXoshiroState: seed.deriveXoshiroState,
      // Added by #602: `SimulationContext` requires `rng`, and a benchmark
      // driving `NavigationSystem.update` has to be able to build one.
      NamedRngStreams: streams.NamedRngStreams,
    });
  })();
  return rngPromise;
}

/**
 * The production surface behind ADR 0059's per-population cost table -- the
 * whole actor-publication path, worker side and main side, loaded once per
 * process.
 *
 * ADR 0059 prices four steps in milliseconds at 500 and 5,000 actors and
 * nothing gates any of them; `actor-render-publication.mjs` is what turns that
 * table into counted work. The list is explicit for the same reason
 * `loadNavigationModules` is: what a benchmark depends on should be readable
 * from the benchmark side.
 *
 * `FixedStepClock` is here to be *read* rather than copied, the way
 * `loadProductionNavigationOptions` reads the navigation options: the tick rate
 * the encoder converts velocity against is the clock's step duration, and a
 * benchmark that hard-codes 50 ms keeps passing after somebody changes it.
 *
 * @returns {Promise<Readonly<ActorPublicationModules>>}
 */
export async function loadActorPublicationModules() {
  assertTypeScriptTransformEnabled();
  registerTypeScriptResolution();

  actorPublicationPromise ??= (async () => {
    const [entity, components, locomotion, keyframe, payload, feed, clock, stateMachine] = await Promise.all([
      importSimulation('entity/entity-store.ts'),
      importSimulation('prisoners/components.ts'),
      importSimulation('locomotion/index.ts'),
      importSimulation('worker/render-actors-keyframe.ts'),
      importSimulation('protocol/render-actors-payload.ts'),
      importRendering('feed/actors-from-delta.ts'),
      importSimulation('clock/fixed-step-clock.ts'),
      importSimulation('worker/state-machine.ts'),
    ]);

    return Object.freeze({
      EntityStore: entity.EntityStore,
      PositionComponent: components.PositionComponent,
      LocomotionStore: locomotion.LocomotionStore,
      DEFAULT_WALK_SUBTILE_UNITS_PER_TICK: locomotion.DEFAULT_WALK_SUBTILE_UNITS_PER_TICK,
      LOCOMOTION_SUBTILE_UNITS: locomotion.LOCOMOTION_SUBTILE_UNITS,
      encodeRenderActorsKeyframe: keyframe.encodeRenderActorsKeyframe,
      decodeRenderActorsPayload: payload.decodeRenderActorsPayload,
      renderActorsByteLength: payload.renderActorsByteLength,
      RENDER_ACTORS_SUBTILE_UNITS: payload.RENDER_ACTORS_SUBTILE_UNITS,
      actorsFromDelta: feed.actorsFromDelta,
      FixedStepClock: clock.FixedStepClock,
      RENDER_DELTA_PUBLISH_INTERVAL_MS: stateMachine.RENDER_DELTA_PUBLISH_INTERVAL_MS,
    });
  })();

  return actorPublicationPromise;
}
