// What a default, idle simulation tick spends where -- re-measured for #288.
// NOT part of `pnpm benchmark`, `benchmark:smoke` or `verify:benchmark`, and
// deliberately not a gate: every number it prints is a duration, and
// `docs/BENCHMARKING.md`'s CI policy refuses a wall-clock threshold on a
// shared runner. It exists so #288's "the tick-cost case for pruning is
// false, navigation is the real cost" can be re-run against `origin/main`
// rather than re-argued, on the current 19-system graph.
//
// ## Method, and why it is not #288's own
//
// #288's own harness (outside this repository, not reproducible from it)
// timed 200,000 `Kernel.step()` calls per configuration and divided the whole
// run's wall time by the count. `docs/research/2026-08-28-navigation-tick-budget.md`
// §1 found that exact shape of instrument misleading for a different
// question: a one-time cost (a lazy graph rebuild) and a per-tick cost that is
// not the thing under test both get amortised into a quotient and look like
// the measured unit. This script instead follows that record's corrected
// method (also `scripts/report-navigation-cost-model.mjs` section 3): time
// each individual `Kernel.step()` (or `NavigationSystem.update()`) call on its
// own, across several repeats, and take the element-wise MINIMUM per tick
// index -- preemption on a shared machine is one-sided, so the minimum is the
// closest available estimate of uncontended cost, and its error runs one way.
// Tick 0 is reported separately from steady state for the same reason ADR
// 0066's own tables do: it pays a one-time cost (here, negligible -- see
// below) that a steady tick does not.
//
// ## Why a *default*, idle session, and not ADR 0066's populated fixtures
//
// ADR 0066 deliberately stressed navigation with populated fixtures (a real
// 64x64 open region, thousands of pending requests) because its question was
// what a *busy* navigation tick may cost against its budget. #288's question
// is different: what does a tick cost in the session every one of these
// systems actually runs against most of the time, which is #261's own
// premise -- eleven-plus of the registered systems iterate permanently empty
// collections. So this script drives `createNewSimulationRuntime()` with no
// scenario on top: one starter chunk, no prisoners, no pending path requests,
// exactly what a fresh session looks like before a player does anything. The
// per-tick numbers below are therefore NOT comparable to ADR 0066's ms-scale
// table -- they answer a different question, on purpose, and the graph
// rebuild that dominates ADR 0066's term 1 is trivial here because there is
// almost no geometry to build a graph over.
//
// ## Warm-up matters more here than in the navigation-only script
//
// At 2 warm-up repeats of 50 ticks (100 iterations), this script's own
// "navigation only" vs "18 non-nav systems" comparison was **noise**: five
// independent runs gave the two groups within 10-20 ns of each other, on
// either side of parity, no matter which was ahead. At 10 warm-up repeats of
// 80 ticks (800 iterations) the ordering stopped moving between runs.
// `scripts/report-navigation-cost-model.mjs` gets away with 2 warm-ups
// because its unit (`findRoute` across a real region) is one expensive,
// already-hot call; a bare-idle tick here is a few hundred nanoseconds, so a
// handful of megamorphic call sites not yet settled by V8 is a
// same-order-of-magnitude confound. Measure with fewer warm-ups here and the
// comparison this script exists to make is not reproducible.
//
// Usage: node --experimental-transform-types scripts/report-tick-system-cost.mjs [repeats]
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { loadSimulationRuntimeModules } from '../benchmarks/production-modules.mjs';

const DEFAULT_REPEATS = 40;
const WARMUP_REPEATS = 10;
const TICKS_PER_REPEAT = 80;

function statistics(sorted) {
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
}

function sortedAscending(values) {
  return [...values].sort((left, right) => left - right);
}

/**
 * Steps `stepOnce` `TICKS_PER_REPEAT` times, `repeats + WARMUP_REPEATS` times
 * over, discarding the warm-ups, and returns the element-wise minimum
 * duration (ms) per tick index. `build` is called fresh for every repeat --
 * including every warm-up -- so no configuration carries state from a
 * previous repeat into the one being timed.
 */
function measurePerTickMinimums(build, repeats) {
  // `= null` alone infers the type `null`; every later assignment then fails
  // and every read degrades to `never` (#602).
  /** @type {number[] | null} */
  let perTickMinimums = null;
  for (let repeat = 0; repeat < repeats + WARMUP_REPEATS; repeat += 1) {
    const stepOnce = build();
    const samplesMs = [];
    for (let tick = 0; tick < TICKS_PER_REPEAT; tick += 1) {
      const startedAt = performance.now();
      stepOnce();
      samplesMs.push(performance.now() - startedAt);
    }
    if (repeat < WARMUP_REPEATS) continue;
    if (perTickMinimums === null) perTickMinimums = samplesMs;
    else for (let index = 0; index < perTickMinimums.length; index += 1) perTickMinimums[index] = Math.min(perTickMinimums[index], samplesMs[index]);
  }
  return perTickMinimums;
}

function reportRow(label, perTickMinimums) {
  const first = perTickMinimums[0];
  const steady = sortedAscending(perTickMinimums.slice(1));
  const { min, median, max } = statistics(steady);
  console.log(
    `${label.padEnd(34)} tick0 ${first.toFixed(4).padStart(8)} ms   steady ns/tick (min/med/max) ${(min * 1e6).toFixed(0).padStart(6)} / ${(median * 1e6).toFixed(0).padStart(6)} / ${(max * 1e6).toFixed(0).padStart(6)}`,
  );
  return { first, min, median, max };
}

async function main() {
  const repeats = Number.parseInt(process.argv[2] ?? String(DEFAULT_REPEATS), 10);
  if (!Number.isInteger(repeats) || repeats < 1) throw new RangeError(`Repeats must be a positive integer, got ${String(process.argv[2])}.`);

  const { createNewSimulationRuntime, Kernel } = await loadSimulationRuntimeModules();

  console.log(`node ${process.version} on ${process.platform}/${process.arch}, ${String(repeats)} timed repeats of ${String(TICKS_PER_REPEAT)} ticks after ${String(WARMUP_REPEATS)} warm-up repeats\n`);
  console.log('Fresh createNewSimulationRuntime() per repeat: one starter chunk, no prisoners, no pending path requests.\n');

  // A. Bare kernel, 0 systems -- the loop floor.
  const floor = reportRow('bare Kernel, 0 systems (floor)', measurePerTickMinimums(() => {
    const kernel = new Kernel();
    return () => kernel.step();
  }, repeats));

  // B. Navigation alone, on its own kernel, so no other system's dispatch or
  // update cost is mixed in. `runtime.navigation` is the real, fully-wired
  // production instance; only the kernel around it is a fresh, minimal one.
  const navOnly = reportRow('navigation only', measurePerTickMinimums(() => {
    const runtime = createNewSimulationRuntime();
    const kernel = new Kernel();
    kernel.registerSystem(runtime.navigation);
    return () => kernel.step();
  }, repeats));

  // C. All systems except navigation's real work. `runtime.kernel` already
  // has all 19 systems registered exactly as a session ships them; patching
  // `navigation.update` to a no-op after construction removes only its real
  // work; the schedule check for its slot in the loop still runs, same as it
  // would for any system whose `intervalTicks` skips a tick.
  const nonNav = reportRow('all-but-navigation (18 systems)', measurePerTickMinimums(() => {
    const runtime = createNewSimulationRuntime();
    runtime.navigation.update = () => {};
    return () => runtime.kernel.step();
  }, repeats));

  // D. All 19, as shipped -- a fresh, unpatched runtime.
  const shipped = reportRow('all 19, as shipped', measurePerTickMinimums(() => {
    const runtime = createNewSimulationRuntime();
    return () => runtime.kernel.step();
  }, repeats));

  console.log(
    `\nSteady-state minimum: floor ${(floor.min * 1e6).toFixed(0)} ns, navigation-only ${(navOnly.min * 1e6).toFixed(0)} ns ` +
      `(${((navOnly.min - floor.min) * 1e6).toFixed(0)} ns above floor), 18 non-nav systems ${(nonNav.min * 1e6).toFixed(0)} ns ` +
      `(${((nonNav.min - floor.min) * 1e6).toFixed(0)} ns above floor), all 19 as shipped ${(shipped.min * 1e6).toFixed(0)} ns ` +
      `(${((shipped.min - floor.min) * 1e6).toFixed(0)} ns above floor).\n`,
  );
  console.log(
    'Tick 0 of every configuration also pays whatever one-time setup its systems do lazily\n' +
      '(navigation\'s graph build included) -- reported above as its own column because, on this\n' +
      'default single-starter-chunk session, it is small. It is not the ADR 0066 question: that\n' +
      'ADR stresses navigation with populated fixtures where the same rebuild costs 10-17 ms.\n',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
