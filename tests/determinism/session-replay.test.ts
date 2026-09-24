import { describe, expect, it } from 'vitest';
import { deterministicStateHash } from '../../src/simulation/determinism/canonical';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  buildDeterminismScenario,
  SCENARIO_SEED,
  submitScenarioCommands,
} from '../helpers/determinism-scenario';
import { fullRuntimeState, hashFullRuntime, runWithCheckpoints } from '../helpers/determinism-state';

const TICKS = 400;
const CHECKPOINT_INTERVAL = 50;

/**
 * Builds the scenario and steps it `ticks` times, and nothing else.
 *
 * Split from `runScenarioWithCheckpoints` because a checkpoint is not free:
 * `hashFullRuntime` canonicalises ~285 KB of runtime state and then runs
 * FNV-1a over it a byte at a time in `BigInt` arithmetic
 * (`src/simulation/determinism/canonical.ts`), which measured 34.6 ms per
 * checkpoint against 75.2 ms for all 400 ticks put together. At
 * `CHECKPOINT_INTERVAL` 50 that is 8 checkpoints -- 277 ms of hashing per
 * run against 80 ms of actual simulation, so a run whose checkpoints are
 * discarded costs roughly four times what it needs to. Only the checkpoint
 * test below reads them; every other test here reads the finished runtime.
 */
function runScenario(masterSeed = SCENARIO_SEED, ticks = TICKS): SimulationRuntime {
  const runtime = buildDeterminismScenario(masterSeed);
  submitScenarioCommands(runtime);
  for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
  return runtime;
}

function runScenarioWithCheckpoints(masterSeed = SCENARIO_SEED, ticks = TICKS) {
  const runtime = buildDeterminismScenario(masterSeed);
  submitScenarioCommands(runtime);
  const checkpoints = runWithCheckpoints(runtime, ticks, CHECKPOINT_INTERVAL);
  return { runtime, checkpoints };
}

/**
 * ADR 0009 makes deterministic replay the whole basis of challenge
 * verification: "a recorded command stream plus a seed *is* the run;
 * re-executing it must reproduce the same state hash, or determinism
 * itself is broken." These tests are that claim, executed.
 */
describe('deterministic replay of a seeded session', () => {
  it('reproduces a byte-identical state hash from the same seed and command stream', () => {
    const first = runScenario();
    const second = runScenario();

    expect(hashFullRuntime(second)).toBe(hashFullRuntime(first));
    expect(fullRuntimeState(second)).toEqual(fullRuntimeState(first));
  });

  /**
   * The one test in this file whose cost is irreducible, and the only one
   * given its own timeout.
   *
   * It is the only test here that reads checkpoints, so it is the only one
   * that pays for them: two independent runs, eight checkpoints each,
   * sixteen `hashFullRuntime` calls. That is the work, not overhead around
   * it -- 16 x 34.6 ms of hashing against 2 x 80 ms of simulation. The
   * checkpoint *is* the ADR 0009 evidence shape, and `CHECKPOINT_INTERVAL`
   * 50 over `TICKS` 400 is the granularity "at every intermediate
   * checkpoint" names, so neither the count nor the hash can be traded away
   * without the test proving less than its title claims.
   *
   * Measured: 573 ms running this file alone, 2,862 ms with the full
   * 165-file suite running in parallel on a loaded four-core container. It
   * did not fail in either the control run on the unmutated tree or any run
   * since, but at 2.9 s it has the least room left against
   * `vitest.config.ts`'s 5 s default of anything in this file -- the other
   * five tests dropped to between 0 ms and 820 ms once the runs that
   * discard their checkpoints stopped computing them. 15 s is about five
   * times the worst figure measured under load, and still short enough that
   * a genuine hang fails rather than stalling the suite.
   */
  it('agrees at every intermediate checkpoint, not only at the end', { timeout: 15_000 }, () => {
    const first = runScenarioWithCheckpoints();
    const second = runScenarioWithCheckpoints();

    expect(second.checkpoints).toEqual(first.checkpoints);
    expect(first.checkpoints).toHaveLength(TICKS / CHECKPOINT_INTERVAL);
  });

  it('actually exercises the systems it claims to -- the scenario is not a no-op', () => {
    const runtime = runScenario();
    const state = fullRuntimeState(runtime) as Record<string, unknown>;

    // Each of these is a subsystem whose state the hash above covers. If a
    // refactor quietly stops one of them from running, the equality tests
    // would still pass vacuously; this is what stops that.
    expect(runtime.kernel.tick).toBe(TICKS);
    expect(runtime.construction.snapshot().orders.length).toBeGreaterThan(0);
    expect(runtime.prisoners.intakeSystem.getMetrics().completedCount).toBeGreaterThan(0);
    expect(runtime.prisoners.actionSystem.getMetrics().actionsStarted).toBeGreaterThan(0);
    expect(runtime.searchSystem.getMetrics().searchesCompleted).toBeGreaterThan(0);
    /*
     * **The board is exercised, and at 400 ticks that means *claimed*, not
     * *completed*.** This line read `.some((job) => job.state ===
     * 'completed')` until [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md):
     * `operations.jobs` ran every five ticks from tick 0 and resolved each leg
     * into a teleport, so both of the scenario's carries finished long before
     * 400. A carry is an action now -- chosen by an idle prisoner whose block
     * allows `work` -- and `GENERAL_POPULATION_REGIME`'s first work block opens
     * at **500**. Measured on this scenario: both jobs are still `'available'`
     * at 401 and both are `'completed'` by 801.
     *
     * So the horizon this file hashes no longer reaches a completed carry, and
     * the honest fix is to say what it *does* reach here and to prove the rest
     * at a horizon that reaches it, below. Weakening this to
     * `getSnapshot().length > 0` would have been the wrong repair: the fixture
     * submits those jobs itself, so it would assert the fixture rather than the
     * subsystem.
     */
    expect(runtime.jobs.getSnapshot().length, 'the scenario stopped putting jobs on the board').toBeGreaterThan(0);
    expect(
      runtime.jobs.getSnapshot().every((job) => job.state === 'available'),
      'a job was claimed inside 400 ticks; the regime gate this assertion is written around has moved',
    ).toBe(true);
    expect(runtime.securityGuards.allGuardIds().some((id) => runtime.securityGuards.getSectorId(id) !== undefined)).toBe(true);
    expect(runtime.navigation.getQueueMetrics().resolvedCount).toBeGreaterThan(0);
    expect(state['contraband']).toBeDefined();
  });

  /**
   * The carry substrate, at the horizon that reaches it.
   *
   * Split out of the non-no-op test above rather than folded into it, because
   * the two answer different questions and want different horizons: that one
   * asks whether the *hashed* run is vacuous, and this asks whether the job
   * board does anything at all. Raising `TICKS` to cover both would have
   * doubled every hash and every checkpoint in this file -- 34.6 ms of hashing
   * per checkpoint, per the note above `runScenario` -- for a property that
   * needs one extra unhashed run.
   *
   * 900 rather than 800: the measurement is that both jobs are `'completed'` by
   * 801, and a horizon pinned to the measured tick would fail on any change
   * that moved it by one.
   */
  it('carries both of the scenario\'s jobs once the first work block opens, which the hashed horizon does not reach', () => {
    const runtime = runScenario(SCENARIO_SEED, 900);
    const jobs = runtime.jobs.getSnapshot();
    expect(jobs.length).toBeGreaterThan(0);
    expect(
      jobs.map((job) => job.state),
      `no job completed by tick 900: ${JSON.stringify(jobs)}`,
    ).toEqual(jobs.map(() => 'completed'));
    // Carried by a prisoner, which is the whole of what ADR 0093 changed: the
    // job records who, and the board answers the other way round by entity id.
    for (const job of jobs) {
      expect(job.assignedWorkerId, `${job.id} completed with no carrier`).toBeDefined();
    }
  });

  it('produces a different state hash from a different master seed -- the hash is seed-sensitive, not constant', () => {
    const seeded = runScenario(SCENARIO_SEED);
    const other = runScenario(SCENARIO_SEED + 1);

    expect(hashFullRuntime(other)).not.toBe(hashFullRuntime(seeded));
  });

  it('carries the seeded RNG stream states in the kernel snapshot, so a replay can resume from one', () => {
    const runtime = runScenario();
    const streams = runtime.kernel.snapshot().rngStates;

    // `prisoners.sentence` joined the set with #535 decision 5. This
    // scenario's admissions name their own sentences, so the stream is never
    // drawn from here and every canonical hash below is unmoved by it -- which
    // is the property an isolated stream is registered for.
    expect(streams.map((entry) => entry.name)).toEqual(['contraband.detection', 'contraband.intelligence', 'contraband.introduction', 'identity.actor-name', 'prisoners.candidates', 'prisoners.classification', 'prisoners.sentence']);
    for (const stream of streams) {
      expect(stream.state.algorithm).toBe('xoshiro128**');
      expect(stream.state.words).toHaveLength(4);
    }

    // At least one stream must have been advanced by the run, or "the RNG
    // state is part of the snapshot" would be an untested claim.
    const fresh = buildDeterminismScenario(SCENARIO_SEED).kernel.snapshot().rngStates;
    expect(streams).not.toEqual(fresh);
  });

  it('hashes state canonically -- key order in the state view cannot change the hash', () => {
    expect(deterministicStateHash({ b: 1, a: 2 })).toBe(deterministicStateHash({ a: 2, b: 1 }));
    expect(deterministicStateHash({ a: 1 })).not.toBe(deterministicStateHash({ a: 2 }));
  });
});
