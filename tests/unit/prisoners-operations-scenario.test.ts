import { beforeAll, describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import type { IntakeMetrics } from '../../src/simulation/prisoners/intake-system';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { NEED_IDS, NEED_MAX, NEED_MIN } from '../../src/simulation/prisoners/needs';
import { buildPrisonerScenarioFixture, type PrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';

function makeKernel(seed: number) {
  return new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(seed, RNG_STREAM) }]));
}

function admitPopulation(fixture: PrisonerScenarioFixture, actorCount: number, seed: number) {
  const rng = new Xoshiro128StarStar(deriveXoshiroState(seed, 'test.scenario-actors').words);
  for (let i = 0; i < actorCount; i += 1) {
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: rng.nextInt(500_000), priorIncidents: rng.nextInt(4) }, fixture.originTile);
  }
}

function scenarioFingerprint(fixture: PrisonerScenarioFixture, actorCount: number): string {
  const parts: string[] = [];
  for (let index = 0; index < actorCount; index += 1) {
    const needsPart = NEED_IDS.map((needId) => fixture.prisoners.needs.get(index, needId)).join(',');
    parts.push(
      `${fixture.prisoners.records.intakeStage[index]}|${fixture.prisoners.records.riskTier[index]}|${fixture.prisoners.currentAction.phase[index]}|` +
        `${fixture.prisoners.position.tileX[index]},${fixture.prisoners.position.tileY[index]}|${needsPart}`,
    );
  }
  return parts.join(';');
}

/** Generously oversized relative to `actorCount` so intake accommodation backlog is never the reason a test scenario doesn't finish -- backlog behavior itself is covered directly in prisoners-intake-system.test.ts. */
function cellCountFor(actorCount: number): number {
  return actorCount * 2 + 20;
}

function runScenario(actorCount: number, seed: number, ticks: number): { fixture: PrisonerScenarioFixture; kernel: Kernel; fingerprint: string } {
  const fixture = buildPrisonerScenarioFixture({ cellCount: cellCountFor(actorCount), capacity: actorCount + 10 });
  const kernel = makeKernel(seed);
  fixture.registerOn(kernel);
  admitPopulation(fixture, actorCount, seed);
  for (let i = 0; i < ticks; i += 1) kernel.step();
  return { fixture, kernel, fingerprint: scenarioFingerprint(fixture, actorCount) };
}

describe('prisoner operations: representative headless scenario (250 actors, no Phaser)', () => {
  const ACTOR_COUNT = 250;
  const SCENARIO_SEED = 0xa11ce;
  /** The bound in the intake test's name: every admitted prisoner must be through intake by this tick. */
  const INTAKE_DEADLINE_TICKS = 2_000;
  /** `DAY_LENGTH_TICKS` is 2,400 (`src/simulation/prisoners/regime.ts:10`), so this is just over one full regime day. */
  const SCENARIO_TICKS = 3_000;

  let scenario: PrisonerScenarioFixture;
  let intakeMetricsAtDeadline: IntakeMetrics;

  /**
   * One shared run, not three.
   *
   * These three tests used to call `runScenario(250, 0xa11ce, ...)`
   * separately with 2,000, 3,000 and 3,000 ticks -- the *same* fixture, the
   * *same* seed, stepped 8,000 times in total to observe one 3,000-tick run
   * from three angles. Two of those runs were byte-for-byte redundant: the
   * 2,000-tick one is a strict prefix of the 3,000-tick one, and the two
   * 3,000-tick ones were identical to each other.
   *
   * Nothing observed here is weakened by sharing. Both metrics accessors
   * return fresh object literals (`intake-system.ts:80`,
   * `action-system.ts:87`), so `intakeMetricsAtDeadline` is a genuine
   * snapshot of tick 2,000 and continuing to 3,000 cannot retroactively
   * change it; and all three tests only read the fixture, never mutate it.
   *
   * Cost: 3,000 ticks of the 250-actor scenario measured 1.6 s in the
   * quietest run obtainable on this shared four-core container, 3.0 s in a
   * busier one, and 8.7 s on an unmutated tree with twelve agents running
   * concurrently. 88% of it is `NavigationSystem` -- 1,412 ms of the 1,599 ms
   * the four registered systems spent between them, over 268,524 A*
   * expansions serving 10,594 resolved route requests -- which is inherent
   * to the fixture: its prison is a 523-column corridor, so routes are long.
   * Building the fixture costs 27.7 ms, admitting 250 prisoners 6.4 ms and
   * taking a fingerprint 0.6 ms, so the ticks are effectively the whole
   * cost and none of it is import- or construction-bound.
   *
   * The 20 s hook timeout is therefore about 2.3x the worst figure measured
   * under load and about twelve times the quietest one -- the same ratio the
   * determinism test below already uses, and short enough that a genuine
   * hang still fails rather than stalling the suite. It is a hook timeout
   * rather than three per-test ones because after this change the tests
   * themselves do no simulation at all: they measured 8 ms, 44 ms and 6 ms
   * in a full-suite run. Issue #140.
   */
  beforeAll(() => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: cellCountFor(ACTOR_COUNT), capacity: ACTOR_COUNT + 10 });
    const kernel = makeKernel(SCENARIO_SEED);
    fixture.registerOn(kernel);
    admitPopulation(fixture, ACTOR_COUNT, SCENARIO_SEED);
    for (let i = 0; i < INTAKE_DEADLINE_TICKS; i += 1) kernel.step();
    intakeMetricsAtDeadline = fixture.prisoners.intakeSystem.getMetrics();
    for (let i = INTAKE_DEADLINE_TICKS; i < SCENARIO_TICKS; i += 1) kernel.step();
    scenario = fixture;
  }, 20_000);

  it('every admitted prisoner completes intake within a bounded number of ticks', () => {
    expect(intakeMetricsAtDeadline.completedCount).toBe(ACTOR_COUNT);
    expect(intakeMetricsAtDeadline.failedCount).toBe(0);
  });

  it('every need for every prisoner stays within [NEED_MIN, NEED_MAX] -- no overflow/underflow across a full run', () => {
    for (let index = 0; index < ACTOR_COUNT; index += 1) {
      for (const needId of NEED_IDS) {
        const level = scenario.prisoners.needs.get(index, needId);
        expect(level).toBeGreaterThanOrEqual(NEED_MIN);
        expect(level).toBeLessThanOrEqual(NEED_MAX);
      }
    }
  });

  it('the action system makes real progress: actions start and complete across the population', () => {
    const metrics = scenario.prisoners.actionSystem.getMetrics();
    expect(metrics.actionsStarted).toBeGreaterThan(ACTOR_COUNT); // more than one action per prisoner over a multi-day run
    expect(metrics.actionsCompleted).toBeGreaterThan(0);
  });
});

describe('prisoner operations: determinism', () => {
  /**
   * Given its own timeout, because of *how* it fails without one.
   *
   * It drives two full 250-prisoner, 2,500-tick scenarios, which measures
   * 1.6 s on an idle machine against `vitest.config.ts`'s 5 s default -- so it
   * needs only about three times' contention to trip, and a machine running
   * several test processes at once supplies that. Measured repeatedly: ~6 s
   * under load, passing in isolation.
   *
   * A timeout here is reported as *"an identical seed and scenario produce an
   * identical fingerprint" failed*, which in this repository is the most
   * alarming possible false positive -- deterministic replay is an ADR 0009
   * product guarantee, so the failure reads as the guarantee breaking rather
   * than as a slow machine. Three consecutive handover documents have had to
   * spend a paragraph saying it is not. Issue #140.
   *
   * The run length is not padding and is deliberately not reduced:
   * `DAY_LENGTH_TICKS` is 2,400, so 2,500 ticks is just over a full regime
   * day, and shortening it below one would stop the fingerprint covering the
   * block transitions it exists to cover.
   *
   * 20 s is roughly twelve times the measured cost -- enough headroom for a
   * loaded machine, and still short enough that a genuine hang fails rather
   * than stalling the suite.
   *
   * The three scenario tests above no longer cost anything individually --
   * they share one run built in a `beforeAll` with its own 20 s timeout, for
   * the reasons documented there. This test is deliberately *not* folded into
   * that shared run: it needs two independently constructed runs of the same
   * seed compared against each other, and reading a fingerprint off a fixture
   * that other tests also read would make the one failure in this file that
   * must never be ambiguous depend on cross-test coupling.
   */
  it('an identical seed and scenario produce an identical fingerprint (needs, stages, positions, phases)', { timeout: 20_000 }, () => {
    const first = runScenario(250, 0x5eed5eed, 2_500);
    const second = runScenario(250, 0x5eed5eed, 2_500);
    expect(second.fingerprint).toEqual(first.fingerprint);
  });

  it('a different seed produces a different fingerprint (the RNG and per-actor variance genuinely matter)', () => {
    const a = runScenario(50, 0x1111, 1_000);
    const b = runScenario(50, 0x2222, 1_000);
    expect(a.fingerprint).not.toEqual(b.fingerprint);
  });
});

describe('prisoner operations: snapshot/restore continuation', () => {
  it('restoring the identical snapshot twice and continuing produces identical outcomes (restore-then-continue is itself deterministic)', () => {
    const actorCount = 60;
    const seed = 0xc0ffee;
    const splitTick = 900;
    const continuedTicks = 900;

    const original = buildPrisonerScenarioFixture({ cellCount: cellCountFor(actorCount), capacity: actorCount + 10 });
    const originalKernel = makeKernel(seed);
    original.registerOn(originalKernel);
    admitPopulation(original, actorCount, seed);
    for (let i = 0; i < splitTick; i += 1) originalKernel.step();

    const prisonerSnapshot = original.prisoners.getSnapshot();
    const kernelSnapshot = originalKernel.snapshot();

    const continueFromSnapshot = () => {
      const restored = buildPrisonerScenarioFixture({ cellCount: cellCountFor(actorCount), capacity: actorCount + 10 });
      restored.prisoners.loadSnapshot(prisonerSnapshot);
      // Kernel.restore only re-registers the systems passed to it (see kernel.ts); registerOn below supplies them.
      const restoredKernel = Kernel.restore(kernelSnapshot, [], () => {});
      restored.registerOn(restoredKernel);
      for (let i = 0; i < continuedTicks; i += 1) restoredKernel.step();
      return scenarioFingerprint(restored, actorCount);
    };

    expect(continueFromSnapshot()).toEqual(continueFromSnapshot());
  });

  it('a restored run stays within the same bounds as an uninterrupted one over the same total ticks (no corruption, no crash, needs stay in range)', () => {
    // Not asserting bit-identical equality to the uninterrupted baseline:
    // an entity mid-`'travelling'` at the snapshot instant intentionally
    // re-requests its route after a restore (see
    // PrisonerOperationsRuntime.loadSnapshot's doc) rather than resuming
    // the exact same in-flight request, so the two can legitimately diverge
    // in fine-grained timing for those entities. What must hold either way:
    // every prisoner still completes intake, and needs stay in range.
    const actorCount = 60;
    const seed = 0xc0ffee;
    const splitTick = 900;
    const continuedTicks = 900;

    const original = buildPrisonerScenarioFixture({ cellCount: cellCountFor(actorCount), capacity: actorCount + 10 });
    const originalKernel = makeKernel(seed);
    original.registerOn(originalKernel);
    admitPopulation(original, actorCount, seed);
    for (let i = 0; i < splitTick; i += 1) originalKernel.step();

    const restored = buildPrisonerScenarioFixture({ cellCount: cellCountFor(actorCount), capacity: actorCount + 10 });
    restored.prisoners.loadSnapshot(original.prisoners.getSnapshot());
    const restoredKernel = Kernel.restore(originalKernel.snapshot(), [], () => {});
    restored.registerOn(restoredKernel);
    for (let i = 0; i < continuedTicks; i += 1) restoredKernel.step();

    // IntakeSystem.getMetrics() is session-scoped diagnostic data, not part
    // of the snapshot (like NavigationSystem's own metrics) -- it
    // legitimately resets to 0 on a fresh instance and only counts
    // completions that happen *after* the restore. What must be preserved
    // is the actual restored state: every prisoner's intakeStage.
    const completedStageIndex = 4; // INTAKE_STAGES.indexOf('completed')
    let completedCount = 0;
    for (let index = 0; index < actorCount; index += 1) {
      if (restored.prisoners.records.intakeStage[index] === completedStageIndex) completedCount += 1;
    }
    expect(completedCount).toBe(actorCount);

    for (let index = 0; index < actorCount; index += 1) {
      for (const needId of NEED_IDS) {
        expect(restored.prisoners.needs.get(index, needId)).toBeGreaterThanOrEqual(NEED_MIN);
        expect(restored.prisoners.needs.get(index, needId)).toBeLessThanOrEqual(NEED_MAX);
      }
    }
  });
});
