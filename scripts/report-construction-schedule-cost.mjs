// What `ConstructionSystem.schedule.intervalTicks: 1` would cost, measured
// against the shipped `10` -- for the measurement half of
// [#717](https://github.com/matmaxalez/lockstate/issues/717).
//
// NOT a gate and not collected by anything. `vitest.config.ts` includes
// `tests/**/*.test.ts`, this is a `.mjs` under `scripts/`, and it is the same
// shape as `scripts/report-tick-system-cost.mjs` and
// `scripts/report-loan-recovery-pricing.mjs`: a measurement that has to be
// re-runnable rather than re-argued.
//
// Run it with:
//   node --experimental-transform-types scripts/report-construction-schedule-cost.mjs [repeats]
//
// ## The question, and why counted work is the answer to it
//
// Running `ConstructionSystem.update` ten times as often multiplies whatever
// that method does per call. What it does per call is **not** constant work:
// it builds and sorts the whole order book twice (`orderedOrders()` at the
// top of `update`, and again inside `procureQueuedMaterials` ->
// `pendingOrderDemand`), scans it once for a busy crew, and walks it once.
// So the cost is a function of how many orders the session is holding, and
// the multiplier alone says nothing.
//
// `docs/BENCHMARKING.md` settles the unit: *"counted work only, never a
// duration"*, because counted work is deterministic -- same session, same
// number, any machine -- and because that document records two real
// regressions of `src/` that both measured **faster** than the code they
// regressed on this runner. This box is shared, so every conclusion below
// rests on a counter and not on a clock.
//
// Two counters, both on production collaborators of `update` and both exact:
//
//  - `BUILDABLE_REGISTRY.get` -- called once per pending order in
//    `pendingOrderDemand` and once per non-terminal order in the walk, so it
//    counts the per-order passes.
//  - `ContainerMaterialsProvider.tryAllocate` -- called once per
//    `materials-pending` order in the walk, so it counts the allocation
//    attempts, which is the operation the whole #717 window is about.
//
// Plus two structural counts that need no instrumentation: `update` calls,
// and the number of full-order-book sorts they imply (two per call, read off
// `update`'s body rather than measured).
//
// ## The wall clock is reported and is deliberately secondary
//
// `docs/BENCHMARKING.md`'s own reading of a duration on this runner is
// followed exactly: each `Kernel.step()` is timed on its own, across several
// repeats, and the **element-wise minimum per tick index** is taken.
// Preemption is one-sided -- another process can only make a sample slower --
// so the minimum over repeats is the closest available estimate of
// uncontended cost and its error runs in one direction. A mean or a p95 mixes
// the code's cost with the box's load and cannot tell them apart. The load
// average at the time of the run is printed beside the numbers so a reader
// can see what the figures were taken under.
//
// ## Why the interval is patched rather than edited
//
// `Kernel.step` reads `system.schedule.intervalTicks` on every tick
// (`src/simulation/kernel/kernel.ts:202`), so assigning the field on the live
// production instance is the same configuration a source edit produces. That
// equivalence is not assumed: `--verify-against-source` re-runs the counted
// work with whatever the source actually says and asserts it matches the
// patched run of the same interval.
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import {
  loadConstructionInstrumentationModules,
  loadSimulationRuntimeModules,
} from '../benchmarks/production-modules.mjs';

const DEFAULT_REPEATS = 15;
const WARMUP_REPEATS = 4;
/** Long enough to cover the 100-tick delivery lead and the walls that follow it. */
const TICKS = 400;
/** The drag #717 is about: 328 `wall-brick` segments, 26,240, one gesture. */
const DRAG_SEGMENTS = 328;
const WALL = 'wall-brick';

const { createNewSimulationRuntime, packCommand } = await loadSimulationRuntimeModules();
const { BUILDABLE_REGISTRY, ContainerMaterialsProvider } = await loadConstructionInstrumentationModules();

/** Exact call counts on two production collaborators of `ConstructionSystem.update`. */
const counters = { registryGet: 0, tryAllocate: 0, update: 0 };
const resetCounters = () => {
  counters.registryGet = 0;
  counters.tryAllocate = 0;
  counters.update = 0;
};

const originalRegistryGet = BUILDABLE_REGISTRY.get.bind(BUILDABLE_REGISTRY);
BUILDABLE_REGISTRY.get = (id) => {
  counters.registryGet += 1;
  return originalRegistryGet(id);
};
const originalTryAllocate = ContainerMaterialsProvider.prototype.tryAllocate;
ContainerMaterialsProvider.prototype.tryAllocate = function tryAllocate(...arguments_) {
  counters.tryAllocate += 1;
  return originalTryAllocate.apply(this, arguments_);
};

/**
 * A session holding `segments` queued wall orders, placed in one tick through
 * the real command router, with `ConstructionSystem` on `intervalTicks`.
 *
 * `intervalTicks: null` leaves whatever the source says, which is what
 * `--verify-against-source` uses.
 */
function buildSession(segments, intervalTicks) {
  const runtime = createNewSimulationRuntime();
  if (intervalTicks !== null) runtime.construction.schedule.intervalTicks = intervalTicks;
  const wrappedUpdate = runtime.construction.update.bind(runtime.construction);
  runtime.construction.update = (context) => {
    counters.update += 1;
    wrappedUpdate(context);
  };
  for (let index = 0; index < segments; index += 1) {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(
      `cmd-${sequence}`,
      sequence,
      0,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: `w${String(index).padStart(3, '0')}`,
        definitionId: WALL,
        x: 1 + (index % 30),
        y: 1 + Math.floor(index / 30),
      }),
    );
  }
  return runtime;
}

/** Counted work over `TICKS` ticks, including the drag tick. */
function countedWork(segments, intervalTicks) {
  resetCounters();
  const runtime = buildSession(segments, intervalTicks);
  for (let tick = 0; tick < TICKS; tick += 1) runtime.kernel.step();
  const orders = runtime.construction.allOrders().length;
  return {
    orders,
    update: counters.update,
    registryGet: counters.registryGet,
    tryAllocate: counters.tryAllocate,
    // Two per `update` call, read off `update`'s body: `orderedOrders()` at
    // the top and `orderedOrders()` again inside `procureQueuedMaterials`.
    // Each is a copy of the whole order book followed by a sort of it.
    bookSorts: counters.update * 2,
    sortedElements: counters.update * 2 * orders,
  };
}

/**
 * Element-wise minimum `Kernel.step()` duration per tick index, over
 * `repeats` timed repeats after `WARMUP_REPEATS` discarded ones. A fresh
 * session per repeat, so nothing carries state into a timed run.
 */
function perTickMinimums(segments, intervalTicks, repeats) {
  /** @type {number[] | null} */
  let minimums = null;
  for (let repeat = 0; repeat < repeats + WARMUP_REPEATS; repeat += 1) {
    const runtime = buildSession(segments, intervalTicks);
    const samplesMs = [];
    for (let tick = 0; tick < TICKS; tick += 1) {
      const startedAt = performance.now();
      runtime.kernel.step();
      samplesMs.push(performance.now() - startedAt);
    }
    if (repeat < WARMUP_REPEATS) continue;
    if (minimums === null) minimums = samplesMs;
    else for (let index = 0; index < minimums.length; index += 1) minimums[index] = Math.min(minimums[index], samplesMs[index]);
  }
  return minimums ?? [];
}

/** Total of the per-tick minimums, which is the closest available estimate of what `TICKS` uncontended ticks cost. */
const sum = (values) => values.reduce((total, value) => total + value, 0);

function reportCountedWork(segments) {
  console.log(`\n## Counted work over ${String(TICKS)} ticks, ${String(segments)} queued wall segments\n`);
  console.log('interval  update calls  book sorts  sorted elements  BUILDABLE_REGISTRY.get  tryAllocate');
  const rows = [10, 1].map((interval) => ({ interval, ...countedWork(segments, interval) }));
  for (const row of rows) {
    console.log(
      `${String(row.interval).padStart(8)}  ${String(row.update).padStart(12)}  ${String(row.bookSorts).padStart(10)}  ${String(row.sortedElements).padStart(15)}  ${String(row.registryGet).padStart(22)}  ${String(row.tryAllocate).padStart(11)}`,
    );
  }
  const [ten, one] = rows;
  const ratio = (field) => (ten[field] === 0 ? 'n/a' : `${(one[field] / ten[field]).toFixed(2)}x`);
  console.log(
    `\ninterval 1 / interval 10:  update ${ratio('update')}, sorted elements ${ratio('sortedElements')}, ` +
      `BUILDABLE_REGISTRY.get ${ratio('registryGet')}, tryAllocate ${ratio('tryAllocate')}`,
  );
  return rows;
}

function reportWallClock(segments, repeats) {
  const ten = perTickMinimums(segments, 10, repeats);
  const one = perTickMinimums(segments, 1, repeats);
  const tenTotal = sum(ten);
  const oneTotal = sum(one);
  console.log(`\n## Wall clock, ${String(segments)} segments, element-wise minimum per tick index over ${String(repeats)} repeats\n`);
  const steady = (values) => {
    const sorted = [...values.slice(1)].sort((left, right) => left - right);
    return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
  };
  const tenSteady = steady(ten);
  const oneSteady = steady(one);
  console.log(`interval 10:  ${String(TICKS)} ticks total ${tenTotal.toFixed(3)} ms   drag tick ${ten[0].toFixed(3)} ms   steady us/tick (min/med/max) ${(tenSteady.min * 1_000).toFixed(0)} / ${(tenSteady.median * 1_000).toFixed(0)} / ${(tenSteady.max * 1_000).toFixed(0)}`);
  console.log(`interval  1:  ${String(TICKS)} ticks total ${oneTotal.toFixed(3)} ms   drag tick ${one[0].toFixed(3)} ms   steady us/tick (min/med/max) ${(oneSteady.min * 1_000).toFixed(0)} / ${(oneSteady.median * 1_000).toFixed(0)} / ${(oneSteady.max * 1_000).toFixed(0)}`);
  console.log(`difference:   ${(oneTotal - tenTotal).toFixed(3)} ms over ${String(TICKS)} ticks, ${(((oneTotal - tenTotal) / TICKS) * 1_000).toFixed(1)} us per tick averaged over the run`);
}

async function main() {
  const repeats = Number.parseInt(process.argv[2] ?? String(DEFAULT_REPEATS), 10);
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError(`Repeats must be a positive integer, got ${String(process.argv[2])}.`);

  console.log(`node ${process.version} on ${process.platform}/${process.arch}, ${String(os.cpus().length)} logical CPUs, load average ${os.loadavg().map((value) => value.toFixed(2)).join(' ')}`);
  console.log('Counted work is deterministic and load-independent; the wall clock below is not, and is reported as a minimum for that reason.');

  // An idle session first: the shape #261 is about, where the order book is
  // empty and `update` still runs.
  reportCountedWork(0);
  reportCountedWork(DRAG_SEGMENTS);

  // The equivalence the patched runs rest on, asserted rather than assumed.
  const fromSource = countedWork(DRAG_SEGMENTS, null);
  const sourceInterval = createNewSimulationRuntime().construction.schedule.intervalTicks;
  const patched = countedWork(DRAG_SEGMENTS, sourceInterval);
  const agrees = ['update', 'registryGet', 'tryAllocate'].every((field) => fromSource[field] === patched[field]);
  console.log(
    `\nSource says intervalTicks=${String(sourceInterval)}; patching the live instance to ${String(sourceInterval)} reproduces it exactly: ${agrees ? 'YES' : 'NO'} ` +
      `(update ${String(fromSource.update)} vs ${String(patched.update)}, registry.get ${String(fromSource.registryGet)} vs ${String(patched.registryGet)}, tryAllocate ${String(fromSource.tryAllocate)} vs ${String(patched.tryAllocate)})`,
  );

  reportWallClock(DRAG_SEGMENTS, repeats);
  console.log(`\nLoad average after the run: ${os.loadavg().map((value) => value.toFixed(2)).join(' ')}`);
}

await main();
