import { describe, expect, it } from 'vitest';
import { deterministicStateHash } from '../../src/simulation/determinism/canonical';
import {
  buildDeterminismScenario,
  SCENARIO_SEED,
  submitScenarioCommands,
} from '../helpers/determinism-scenario';
import { fullRuntimeState, hashFullRuntime, runWithCheckpoints } from '../helpers/determinism-state';

const TICKS = 400;
const CHECKPOINT_INTERVAL = 50;

function runScenario(masterSeed = SCENARIO_SEED, ticks = TICKS) {
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

    expect(hashFullRuntime(second.runtime)).toBe(hashFullRuntime(first.runtime));
    expect(fullRuntimeState(second.runtime)).toEqual(fullRuntimeState(first.runtime));
  });

  it('agrees at every intermediate checkpoint, not only at the end', () => {
    const first = runScenario();
    const second = runScenario();

    expect(second.checkpoints).toEqual(first.checkpoints);
    expect(first.checkpoints).toHaveLength(TICKS / CHECKPOINT_INTERVAL);
  });

  it('actually exercises the systems it claims to -- the scenario is not a no-op', () => {
    const { runtime } = runScenario();
    const state = fullRuntimeState(runtime) as Record<string, unknown>;

    // Each of these is a subsystem whose state the hash above covers. If a
    // refactor quietly stops one of them from running, the equality tests
    // would still pass vacuously; this is what stops that.
    expect(runtime.kernel.tick).toBe(TICKS);
    expect(runtime.construction.snapshot().orders.length).toBeGreaterThan(0);
    expect(runtime.prisoners.intakeSystem.getMetrics().completedCount).toBeGreaterThan(0);
    expect(runtime.prisoners.actionSystem.getMetrics().actionsStarted).toBeGreaterThan(0);
    expect(runtime.searchSystem.getMetrics().searchesCompleted).toBeGreaterThan(0);
    expect(runtime.jobs.getSnapshot().some((job) => job.state === 'completed')).toBe(true);
    expect(runtime.securityGuards.allGuardIds().some((id) => runtime.securityGuards.getSectorId(id) !== undefined)).toBe(true);
    expect(runtime.navigation.getQueueMetrics().resolvedCount).toBeGreaterThan(0);
    expect(state['contraband']).toBeDefined();
  });

  it('produces a different state hash from a different master seed -- the hash is seed-sensitive, not constant', () => {
    const seeded = runScenario(SCENARIO_SEED);
    const other = runScenario(SCENARIO_SEED + 1);

    expect(hashFullRuntime(other.runtime)).not.toBe(hashFullRuntime(seeded.runtime));
  });

  it('carries the seeded RNG stream states in the kernel snapshot, so a replay can resume from one', () => {
    const { runtime } = runScenario();
    const streams = runtime.kernel.snapshot().rngStates;

    expect(streams.map((entry) => entry.name)).toEqual(['contraband.detection', 'contraband.intelligence', 'identity.actor-name', 'prisoners.classification']);
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
