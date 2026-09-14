/**
 * DRIVES PRODUCTION CODE, NOT A MODEL OF IT.
 *
 * The measurement
 * [ADR 0113](../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)
 * §5 named and did not take, and which that ADR's own "weakest claim" section
 * says is owed: what `findRegimeSchedule` costs, and how that cost moves if
 * the group axis ever widens past the two groups slice 1 keeps.
 *
 * The owner was offered an option making this benchmark a precondition of
 * building and chose to build first, so this scenario lands beside the
 * implementation rather than ahead of it. What it reports is a number, not a
 * ruling: if the cost were material that would be a finding for the owner, and
 * §5's argument would be the thing to revisit.
 *
 * ## The metric is counted work, never elapsed time
 *
 * `comparisonsPerLookup` is the number of times `findRegimeSchedule`'s `.find()`
 * predicate reads a candidate's `classificationGroupId`, counted **inside the
 * real function** rather than derived from its source: each schedule handed to
 * it carries an accessor on that property, so every comparison the shipped
 * `.find()` performs increments the counter and no comparison it does not
 * perform can. That is the unit ADR 0007's `workBudgetPerTick` denominates a
 * budget in, it is identical on every machine, and `docs/BENCHMARKING.md`'s
 * standing refusal to gate on wall clock is untouched.
 *
 * ## The sweep, and why it goes past what the game has
 *
 * Group counts 2, 4, 8 and 16. **Two is today** -- `CLASSIFICATION_GROUP_IDS`
 * is a closed two-member catalogue and ADR 0113 slice 1 adds no third group;
 * it makes the two existing rows writable. The rest is the synthetic stress
 * case §5 asks for by name, so the question "what does a third or fourth group
 * cost" has an answer before somebody proposes one rather than after.
 *
 * A lookup for the *last* group in canonical order is the worst case and is
 * what the ceilings gate: `.find()` returns on the first structural match, so
 * looking up `CLASSIFICATION_GROUP_IDS[0]` is one comparison at any group
 * count and looking up the last is N of them.
 *
 * ## What this scenario does *not* cover, and the second number says why
 *
 * **How often the lookup is asked for is not measured here, and one real
 * session is measured to show why that is not an oversight.**
 * `lookupsInAnIdleSession` drives `createNewSimulationRuntime` -- the real
 * composition root, the real registered systems -- admits six prisoners
 * through the real `AdmitPrisoner` command path and steps the real kernel
 * through a fifth of an in-game day, with `RegimeScheduleRegistry.all()`
 * counted on the instance the session actually holds. It comes back **zero**.
 *
 * That is a fact about a prison with no cells rather than about the lookup:
 * `ACTION_ELIGIBLE_INTAKE_STAGE_INDICES` (`action-system.ts`) admits only
 * `accommodation-assignment` and `completed`, and a prisoner in a prison with
 * nowhere to sleep never reaches either, so `ActionSystem` never asks whose
 * day it is. Pinned at `equals: 0` deliberately: the day it stops being zero,
 * this scenario goes red and whoever made it non-zero re-measures the call
 * frequency, which is the number this file currently cannot supply. Building
 * the walled, zoned, furnished prison that would make it non-zero needs the
 * world-writing helpers that live under `tests/`, and a benchmark reaching
 * into those would stop being a benchmark of production code.
 */
import { loadRegimeModules, loadSimulationRuntimeModules } from '../production-modules.mjs';

/** Safety valve only, matching `navigation-production.mjs`'s. */
const MAX_SESSION_TICKS = 10_000;

/** How far into an in-game day the idle-session probe runs. A fifth of `DAY_LENGTH_TICKS`, which is long enough to cross a block boundary in both authored schedules. */
const IDLE_SESSION_TICK_FRACTION = 5;

/** How many prisoners the idle-session probe admits. Small on purpose: the claim it checks is that the count is zero, and zero times six is as convincing as zero times six hundred. */
const IDLE_SESSION_PRISONERS = 6;

function mixHash(hash, value) {
  return Math.imul(hash ^ (value >>> 0), 0x517cc1b7) >>> 0;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * The registry's own rows, wrapped so each `classificationGroupId` read is
 * counted.
 *
 * `blocks` is passed through by reference and `classificationGroupId` is an
 * accessor returning the same string, so what `findRegimeSchedule` sees is
 * structurally the schedule the registry holds. The counter therefore records
 * the comparisons the shipped `.find()` predicate performs, and nothing else:
 * no comparison is added here, and none can be hidden.
 */
function countingView(schedules, counter) {
  return schedules.map((schedule) => {
    const view = { blocks: schedule.blocks };
    Object.defineProperty(view, 'classificationGroupId', {
      get() {
        counter.comparisons += 1;
        return schedule.classificationGroupId;
      },
      enumerable: true,
    });
    return view;
  });
}

/**
 * A registry holding `groupCount` schedules: the two the game authors, then
 * synthetic single-block days under ids that sort after them.
 *
 * Built through the real `RegimeScheduleRegistry` rather than as a bare array,
 * so the order the lookup walks is the order a session walks -- catalogue ids
 * in declaration order, everything else after them. The synthetic ids are
 * zero-padded so their relative order does not depend on how many digits the
 * count happens to need, which is the same reason `navigation-production.mjs`
 * pads its request ids.
 */
async function registryOfSize(groupCount) {
  const { DEFAULT_REGIME_SCHEDULES, DAY_LENGTH_TICKS, RegimeScheduleRegistry } = await loadRegimeModules();
  const authored = [...DEFAULT_REGIME_SCHEDULES];
  const extras = [];
  const idWidth = String(Math.max(0, groupCount - authored.length - 1)).length;
  for (let index = authored.length; index < groupCount; index += 1) {
    extras.push({
      classificationGroupId: `synthetic-${String(index - authored.length).padStart(idWidth, '0')}`,
      blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: ['sleep', 'free-association'] }],
    });
  }
  return new RegimeScheduleRegistry([...authored, ...extras]);
}

/**
 * Every group looked up once through the real `findRegimeSchedule`, at a
 * group count of `groupCount`, `operationsPerIteration` times over.
 */
async function runScheduleLookup(seed, operationsPerIteration, groupCount) {
  const { findRegimeSchedule } = await loadRegimeModules();
  const registry = await registryOfSize(groupCount);
  const schedules = registry.all();
  const ids = schedules.map((schedule) => schedule.classificationGroupId);

  const counter = { comparisons: 0 };
  const view = countingView(schedules, counter);

  let lookups = 0;
  let stateHash = seed >>> 0;
  let firstGroupComparisons = 0;
  let lastGroupComparisons = 0;

  for (let iteration = 0; iteration < operationsPerIteration; iteration += 1) {
    for (const id of ids) {
      const before = counter.comparisons;
      const found = findRegimeSchedule(view, id);
      const spent = counter.comparisons - before;
      lookups += 1;
      if (iteration === 0 && id === ids[0]) firstGroupComparisons = spent;
      if (iteration === 0 && id === ids[ids.length - 1]) lastGroupComparisons = spent;
      // Reading a real field off the result, so an implementation that
      // returned the wrong schedule would change the checksum.
      stateHash = mixHash(stateHash, found.blocks.length);
      stateHash = mixHash(stateHash, spent);
    }
  }

  stateHash = mixHash(stateHash, counter.comparisons);

  return {
    checksum: `0x${stateHash.toString(16).padStart(8, '0')}`,
    metrics: {
      source: 'production',
      groupCount,
      lookups,
      totalComparisons: counter.comparisons,
      comparisonsPerLookup: round3(counter.comparisons / lookups),
      /** The best case: the first group in canonical order, matched on the first comparison at every group count. */
      comparisonsForFirstGroup: firstGroupComparisons,
      /** The worst case, and what the ceilings gate: the last group in canonical order. */
      comparisonsForLastGroup: lastGroupComparisons,
    },
  };
}

/**
 * How many times a real session asks, measured on the real composition root.
 *
 * See this file's header for what the zero means and why it is pinned rather
 * than treated as a null result.
 */
async function runIdleSession(seed) {
  const { createNewSimulationRuntime, packCommand, DAY_LENGTH_TICKS } = await loadSimulationRuntimeModules();
  const runtime = createNewSimulationRuntime(seed >>> 0);

  const counter = { comparisons: 0 };
  let allCalls = 0;
  const registry = runtime.prisoners.regimes;
  const realAll = registry.all.bind(registry);
  registry.all = () => {
    allCalls += 1;
    return countingView(realAll(), counter);
  };

  let sequence = runtime.kernel.expectedSequence;
  for (let index = 0; index < IDLE_SESSION_PRISONERS; index += 1) {
    runtime.kernel.submitCommand(
      `admit-${index}`,
      sequence,
      runtime.kernel.tick,
      packCommand({ type: 'AdmitPrisoner', priorIncidents: 0, x: 10 + index, y: 10 }),
    );
    sequence += 1;
  }

  const ticks = Math.min(MAX_SESSION_TICKS, Math.floor(DAY_LENGTH_TICKS / IDLE_SESSION_TICK_FRACTION));
  for (let tick = 0; tick < ticks; tick += 1) runtime.kernel.step();

  let stateHash = mixHash(seed >>> 0, runtime.kernel.tick);
  stateHash = mixHash(stateHash, allCalls);
  stateHash = mixHash(stateHash, counter.comparisons);

  return {
    checksum: `0x${stateHash.toString(16).padStart(8, '0')}`,
    metrics: {
      source: 'production',
      ticksStepped: runtime.kernel.tick,
      prisonersAdmitted: IDLE_SESSION_PRISONERS,
      /** `RegimeScheduleRegistry.all()` calls, which is one per `findRegimeSchedule` call `ActionSystem` makes. */
      lookupsInAnIdleSession: allCalls,
      comparisonsInAnIdleSession: counter.comparisons,
    },
  };
}

/**
 * Measured on this tree at `agent/1167-regime-editing`, then written down as
 * literals. None is computed from the run it gates.
 *
 * A counted-work metric has no run-to-run variance, so these are exact
 * equalities rather than ceilings with headroom -- the arithmetic is
 * `.find()`'s and it is not the kind of number that drifts by a few per cent
 * under a refactor. It either is the position of the id in the canonical order
 * or the implementation changed, and the second is what somebody should have
 * to write down.
 *
 * `comparisonsPerLookup` at group count N is `(N + 1) / 2` -- the mean over a
 * lookup of each group once, since the group at index i costs i + 1
 * comparisons. Recorded as the measured literal at each size rather than as
 * that formula, because a bound a scenario derives from its own model holds
 * for any implementation, which is the defect #410 is about.
 */
const SWEEP_BOUNDS = Object.freeze({
  2: Object.freeze({ comparisonsPerLookup: { equals: 1.5 }, comparisonsForFirstGroup: { equals: 1 }, comparisonsForLastGroup: { equals: 2 }, groupCount: { equals: 2 } }),
  4: Object.freeze({ comparisonsPerLookup: { equals: 2.5 }, comparisonsForFirstGroup: { equals: 1 }, comparisonsForLastGroup: { equals: 4 }, groupCount: { equals: 4 } }),
  8: Object.freeze({ comparisonsPerLookup: { equals: 4.5 }, comparisonsForFirstGroup: { equals: 1 }, comparisonsForLastGroup: { equals: 8 }, groupCount: { equals: 8 } }),
  16: Object.freeze({ comparisonsPerLookup: { equals: 8.5 }, comparisonsForFirstGroup: { equals: 1 }, comparisonsForLastGroup: { equals: 16 }, groupCount: { equals: 16 } }),
});

function makeSweepScenario(groupCount) {
  return Object.freeze({
    id: `regime.production.schedule-lookup-${groupCount}`,
    version: 1,
    description:
      `Real findRegimeSchedule over a real RegimeScheduleRegistry holding ${groupCount} classification groups, reporting comparisons performed inside the shipped .find() rather than elapsed time. Group count 2 is what the game has today; 4, 8 and 16 are the synthetic stress case ADR 0113 section 5 names, so the cost of widening the group axis is known before it is proposed.`,
    seed: 0x52454749, // 'REGI'
    profiles: Object.freeze({
      smoke: Object.freeze({
        warmupIterations: 1,
        measuredIterations: 3,
        operationsPerIteration: 1_000,
        metricBounds: SWEEP_BOUNDS[groupCount],
      }),
      full: Object.freeze({
        warmupIterations: 2,
        measuredIterations: 5,
        operationsPerIteration: 200_000,
        metricBounds: SWEEP_BOUNDS[groupCount],
      }),
    }),
    run({ seed, operationsPerIteration }) {
      return runScheduleLookup(seed, operationsPerIteration, groupCount);
    },
  });
}

export const regimeScheduleLookupTwoGroupsScenario = makeSweepScenario(2);
export const regimeScheduleLookupFourGroupsScenario = makeSweepScenario(4);
export const regimeScheduleLookupEightGroupsScenario = makeSweepScenario(8);
export const regimeScheduleLookupSixteenGroupsScenario = makeSweepScenario(16);

export const regimeScheduleLookupIdleSessionScenario = Object.freeze({
  id: 'regime.production.schedule-lookup-idle-session',
  version: 1,
  description:
    'Real createNewSimulationRuntime, six prisoners admitted through the real AdmitPrisoner command path, the real kernel stepped through a fifth of an in-game day, counting RegimeScheduleRegistry.all() calls on the instance the session holds. Reports zero: a prisoner in a prison with no accommodation never reaches an action-eligible intake stage, so ActionSystem never asks whose day it is.',
  seed: 0x49444c45, // 'IDLE'
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 1,
      metricBounds: Object.freeze({
        lookupsInAnIdleSession: { equals: 0 },
        comparisonsInAnIdleSession: { equals: 0 },
        ticksStepped: { equals: 480 },
      }),
    }),
    full: Object.freeze({
      warmupIterations: 1,
      measuredIterations: 3,
      operationsPerIteration: 1,
      metricBounds: Object.freeze({
        lookupsInAnIdleSession: { equals: 0 },
        comparisonsInAnIdleSession: { equals: 0 },
        ticksStepped: { equals: 480 },
      }),
    }),
  }),
  run({ seed }) {
    return runIdleSession(seed);
  },
});
