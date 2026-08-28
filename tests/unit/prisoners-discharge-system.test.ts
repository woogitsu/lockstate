import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { MAX_SENTENCE_LENGTH_TICKS, intakeStageFromIndex, intakeStageIndex, type IntakeStage, INTAKE_STAGES } from '../../src/simulation/prisoners/components';
import { DISCHARGE_CHECK_INTERVAL_TICKS } from '../../src/simulation/prisoners/discharge-system';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { buildPrisonerScenarioFixture, type PrisonerScenarioFixture } from '../helpers/prisoner-fixture';

/**
 * Issue #441: **`sentenceEndTick` was never compared against the clock.**
 *
 * It was written by `IntakeSystem`, carried by the save format and published to
 * the HUD as `PrisonerDetailViewModel.sentence.endTick`, and no code in `src/`
 * read it back against `context.tick` -- so a prison's population could only
 * rise. `PrisonerDischargeSystem` is that comparison. These cases are about the
 * comparison and its two guards; `tests/integration/sentence-end-release.test.ts`
 * is about the departure it causes in a real prison.
 */

const RNG_STREAM = 'prisoners.classification';

function makeKernel(seed: number): Kernel {
  return new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(seed, RNG_STREAM) }]));
}

function runFixture(seed: number): { fixture: PrisonerScenarioFixture; kernel: Kernel } {
  const fixture = buildPrisonerScenarioFixture({ cellCount: 8, capacity: 8 });
  const kernel = makeKernel(seed);
  fixture.registerOn(kernel);
  return { fixture, kernel };
}

function step(kernel: Kernel, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) kernel.step();
}

/** Runs until the named prisoner has been classified, which is the tick `sentenceEndTick` is written. */
function stepToClassified(fixture: PrisonerScenarioFixture, kernel: Kernel, index: number): void {
  for (let i = 0; i < 200; i += 1) {
    if (fixture.prisoners.records.sentenceEndTick[index]! > 0) return;
    kernel.step();
  }
  throw new Error('the prisoner was never classified, so the fixture proves nothing');
}

describe('PrisonerDischargeSystem placement in the tick', () => {
  it('runs after needs decay and before navigation, actions and jobs', () => {
    const { fixture, kernel } = runFixture(1);
    const order = kernel.systemExecutionOrder.map((entry) => entry.id);

    // Pinned as a *relative* position rather than as the number 65: the reason
    // is that a prisoner released this tick must not then be given a route, an
    // action or a haulage job in the same tick, and that reason survives every
    // system in the list being renumbered.
    const at = (id: string): number => {
      const position = order.indexOf(id);
      expect({ id, position }, `${id} must be registered for this ordering to mean anything`).not.toEqual({ id, position: -1 });
      return position;
    };
    expect(at('prisoners.needs-decay')).toBeLessThan(at('prisoners.discharge'));
    expect(at('prisoners.discharge')).toBeLessThan(at('navigation'));
    expect(at('prisoners.discharge')).toBeLessThan(at('prisoners.actions'));
    expect(fixture.prisoners.dischargeSystem.schedule).toEqual({ intervalTicks: DISCHARGE_CHECK_INTERVAL_TICKS, phaseTicks: 0 });
  });
});

describe('when a sentence is complete', () => {
  it('is not complete before the stage that computes the end tick', () => {
    const { fixture, kernel } = runFixture(2);
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 500, priorIncidents: 0 }, fixture.originTile);

    // The whole reason the stage guard exists: `sentenceEndTick` reads 0 in a
    // slot that has not been classified, and 0 is in the past at every tick
    // above it. Without the guard this is a release on the first scheduled tick.
    expect(fixture.prisoners.records.sentenceEndTick[0]).toBe(0);
    const earlyStages: IntakeStage[] = [];
    for (let i = 0; i < 12; i += 1) {
      earlyStages.push(intakeStageFromIndex(fixture.prisoners.records.intakeStage[0]!));
      expect({ tick: kernel.tick, complete: fixture.prisoners.dischargeSystem.isSentenceComplete(0, kernel.tick) })
        .toEqual({ tick: kernel.tick, complete: false });
      kernel.step();
    }
    expect(earlyStages).toContain('queued');
    expect(fixture.prisoners.entityStore.isIndexAlive(0)).toBe(true);
  });

  it('is not complete for an unclassified slot whose sentence length is zero either', () => {
    // The case the wrap guard cannot cover, and therefore the one that shows
    // the stage guard is load-bearing on its own. For a queued arrival with a
    // non-zero sentence, `classifiedAtTickOf(0, length)` is already `undefined`
    // (0 < length), so removing the stage guard changes nothing; at length 0 it
    // is `0`, and every tick is at or after 0.
    //
    // Reachable rather than hypothetical: `admitPrisonerSchema` rejects a
    // non-positive length at the wire, but `save-schema.ts` stores
    // `sentenceLengthTicks` as a plain `uint32` and a fresh slot reads 0, so a
    // restored session can hold exactly this.
    const { fixture, kernel } = runFixture(21);
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 0, priorIncidents: 0 }, fixture.originTile);
    expect(intakeStageFromIndex(fixture.prisoners.records.intakeStage[0]!)).toBe('queued');
    expect(fixture.prisoners.records.sentenceEndTick[0]).toBe(0);
    expect(fixture.prisoners.dischargeSystem.isSentenceComplete(0, kernel.tick)).toBe(false);
    expect(fixture.prisoners.dischargeSystem.isSentenceComplete(0, 10_000)).toBe(false);
    expect(fixture.prisoners.dischargeSystem.due(10_000)).toEqual([]);
  });

  it('is complete on the tick the sentence ends, and not the tick before', () => {
    const { fixture, kernel } = runFixture(3);
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 5_000, priorIncidents: 0 }, fixture.originTile);
    stepToClassified(fixture, kernel, 0);

    const endTick = fixture.prisoners.records.sentenceEndTick[0]!;
    expect(endTick).toBeGreaterThan(kernel.tick);
    expect(fixture.prisoners.dischargeSystem.isSentenceComplete(0, endTick - 1)).toBe(false);
    expect(fixture.prisoners.dischargeSystem.isSentenceComplete(0, endTick)).toBe(true);
    expect(fixture.prisoners.dischargeSystem.isSentenceComplete(0, endTick + 1)).toBe(true);
  });

  it('never completes for a sentence whose end tick wrapped the Uint32 slot', () => {
    const { fixture, kernel } = runFixture(4);
    // `admitPrisonerSchema` admits this at the wire and `submitIntake` stores it
    // verbatim, so it is a value a save can carry rather than a hypothetical.
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: MAX_SENTENCE_LENGTH_TICKS, priorIncidents: 0 }, fixture.originTile);
    step(kernel, 20);
    stepToClassified(fixture, kernel, 0);

    const endTick = fixture.prisoners.records.sentenceEndTick[0]!;
    // The wrap really happened: the stored end tick is *behind* the clock, which
    // is exactly what would release the longest sentence in the game first.
    expect(endTick).toBeLessThan(kernel.tick);
    expect(endTick).toBeLessThan(fixture.prisoners.records.sentenceLengthTicks[0]!);
    expect(fixture.prisoners.dischargeSystem.isSentenceComplete(0, kernel.tick)).toBe(false);

    step(kernel, 200);
    expect(fixture.prisoners.entityStore.isIndexAlive(0), 'a prisoner whose clock cannot be read is kept, not released').toBe(true);
  });

  it('answers for every intake stage, so a new stage cannot slip in unclassified', () => {
    const { fixture, kernel } = runFixture(5);
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 5_000, priorIncidents: 0 }, fixture.originTile);
    stepToClassified(fixture, kernel, 0);
    const endTick = fixture.prisoners.records.sentenceEndTick[0]!;

    // Stated as the whole catalogue rather than as the three stages the system
    // accepts, so adding a seventh `IntakeStage` fails here and its author has
    // to say whether a prisoner at it is serving a sentence.
    const byStage = Object.fromEntries(
      INTAKE_STAGES.map((stage) => {
        fixture.prisoners.records.intakeStage[0] = intakeStageIndex(stage);
        return [stage, fixture.prisoners.dischargeSystem.isSentenceComplete(0, endTick)];
      }),
    );
    expect(byStage).toEqual({
      queued: false,
      reception: false,
      classification: false,
      'accommodation-assignment': true,
      completed: true,
      // Terminal and inert until now: `IntakeSystem` calls such a record
      // "permanent, undeletable" and names "nothing releases a prisoner
      // either (#31)" as the reason. Their sentence still runs.
      failed: true,
    });
  });
});

describe('who is due, and in what order', () => {
  it('lists every prisoner whose sentence has ended, in ascending entity index', () => {
    const { fixture, kernel } = runFixture(6);
    for (let i = 0; i < 4; i += 1) {
      fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000 + i * 1_000, priorIncidents: 0 }, fixture.originTile);
    }
    stepToClassified(fixture, kernel, 3);
    const ends = [0, 1, 2, 3].map((index) => fixture.prisoners.records.sentenceEndTick[index]!);
    expect(new Set(ends).size, 'the four sentences must genuinely differ').toBe(4);

    expect(fixture.prisoners.dischargeSystem.due(ends[1]!)).toEqual([
      fixture.prisoners.entityStore.getIdByIndex(0),
      fixture.prisoners.entityStore.getIdByIndex(1),
    ]);
    expect(fixture.prisoners.dischargeSystem.due(ends[3]!)).toEqual([0, 1, 2, 3].map((index) => fixture.prisoners.entityStore.getIdByIndex(index)));
  });

  it('releases them on the first scheduled tick at or after the end, and counts it', () => {
    const { fixture, kernel } = runFixture(7);
    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 2_000, priorIncidents: 0 }, fixture.originTile);
    stepToClassified(fixture, kernel, 0);
    const endTick = fixture.prisoners.records.sentenceEndTick[0]!;

    while (kernel.tick < endTick) kernel.step();
    expect(fixture.prisoners.entityStore.isAlive(entityId), 'still inside on the tick the sentence ends').toBe(true);

    // The bound the cadence buys, stated as an inequality rather than as a
    // literal tick: the release lands on the first multiple of the interval at
    // or after the end, so it is never late by more than one interval.
    let releasedAtTick = -1;
    while (fixture.prisoners.entityStore.isAlive(entityId) && kernel.tick < endTick + 1_000) {
      releasedAtTick = kernel.tick;
      kernel.step();
    }
    expect(fixture.prisoners.entityStore.isAlive(entityId)).toBe(false);
    expect(releasedAtTick % DISCHARGE_CHECK_INTERVAL_TICKS).toBe(0);
    expect(releasedAtTick).toBeGreaterThanOrEqual(endTick);
    expect(releasedAtTick - endTick).toBeLessThan(DISCHARGE_CHECK_INTERVAL_TICKS);
    expect(fixture.prisoners.dischargeSystem.getMetrics()).toEqual({ dischargedCount: 1 });
  });
});
