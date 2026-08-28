import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { unmetNeedCount, stateIncomeForPrisonerDay } from '../../src/simulation/economy/income';
import { combineRegimeOverrides, HIGH_RISK_REGIME, GENERAL_POPULATION_REGIME } from '../../src/simulation/prisoners/regime';
import { buildPrisonerScenarioFixture, type PrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';
/**
 * Long enough that `PrisonerDischargeSystem` cannot end this sentence during
 * any run in this file (every case here runs well under 10,000 ticks). Over
 * `LONG_SENTENCE_THRESHOLD_TICKS` (200,000), which scores `sentence: +1` --
 * deliberate and harmless, the same reasoning
 * `tests/integration/incident-trigger-reachability.test.ts`'s `ADMISSION`
 * constant states: with `priorIncidents: 0` the total is 1, and the screening
 * variance in `{-1, 0, +1}` clamped to `0..3` never reaches the `>= 3`
 * high-risk floor, so every admission below is deterministically
 * `general-population`.
 */
const GENERAL_ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

function makeKernel(): Kernel {
  return new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
}

/** Advances the intake pipeline's four scheduled firings (5 ticks each) so a fresh admission is `'completed'` and housed. */
function completeIntake(kernel: Kernel): void {
  for (let i = 0; i < 20; i += 1) kernel.step();
}

function accommodationCatalogIdOf(fixture: PrisonerScenarioFixture, entityId: number): string | undefined {
  const instanceId = fixture.prisoners.coldState.getAccommodation(entityId);
  return instanceId === undefined ? undefined : fixture.prisoners.roomInstances.getById(instanceId)?.roomCatalogId;
}

describe('SanctionSystem: the follow-through half of a solitary sanction (issue #80)', () => {
  it('relocates a sanctioned prisoner into solitary, restricts their day, costs the ADR 0064 grant, and releases them on schedule', () => {
    const fixture = buildPrisonerScenarioFixture({ capacity: 10, cellCount: 4, sanctionPolicy: { solitaryTermTicks: 200 } });
    const kernel = makeKernel();
    fixture.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner(GENERAL_ADMISSION, fixture.originTile);
    completeIntake(kernel);
    expect(accommodationCatalogIdOf(fixture, entityId)).toBe('room.cell');
    expect(fixture.prisoners.isServingSolitarySanction(entityId)).toBe(false);

    // Let a settled baseline establish -- a housed general-population
    // prisoner with a canteen, yard and shower room all reachable serves
    // every need. `unmetNeedCount` is asserted directly rather than assumed:
    // this is the "before" figure the sanction's cost is measured against.
    for (let i = 0; i < 2_000; i += 1) kernel.step();
    const index = fixture.prisoners.entityStore.getIndex(entityId);
    const before = unmetNeedCount(fixture.prisoners.needs, index);
    expect(before).toBe(0);
    expect(stateIncomeForPrisonerDay(before)).toBe(300);

    fixture.prisoners.imposeSolitarySanction(entityId, kernel.tick);
    const endTick = fixture.prisoners.records.solitarySanctionEndTick[index]!;
    expect(endTick).toBe(kernel.tick + 200);
    // Recorded immediately, but not yet *enforced*: `isServingSolitarySanction`
    // means physically confined, and relocation has not run yet.
    expect(fixture.prisoners.isServingSolitarySanction(entityId)).toBe(false);

    // Physically relocated within a handful of scheduled `SanctionSystem`
    // updates (interval 5): this fixture's one solitary cell starts empty --
    // and only now does the regime restriction actually apply.
    for (let i = 0; i < 10; i += 1) kernel.step();
    expect(accommodationCatalogIdOf(fixture, entityId)).toBe('room.solitary-cell');
    expect(fixture.prisoners.isServingSolitarySanction(entityId)).toBe(true);

    // `HIGH_RISK_REGIME` restricts most of the day to sleep/meal/hygiene, so
    // recreation stops being reachable at all -- run most of a day under it
    // and the ADR 0064 grant for this one place drops.
    for (let i = 0; i < 2_000; i += 1) kernel.step();
    const duringUnmet = unmetNeedCount(fixture.prisoners.needs, index);
    expect(duringUnmet).toBeGreaterThan(before);
    expect(stateIncomeForPrisonerDay(duringUnmet)).toBeLessThan(300);

    // The term ends (200 ticks after imposition) and `SanctionSystem` moves
    // this prisoner back to an ordinary cell of their own accord -- nobody
    // re-admits them.
    while (kernel.tick < endTick + 10) kernel.step();
    expect(fixture.prisoners.isServingSolitarySanction(entityId)).toBe(false);
    expect(accommodationCatalogIdOf(fixture, entityId)).toBe('room.cell');
    // A permanent punishment would be a state change, not a mechanic (issue
    // #80): the field this consequence lives in reads exactly as it did
    // before anyone was sanctioned.
    expect(fixture.prisoners.records.solitarySanctionEndTick[index]).toBe(0);
  });

  it('waits when every solitary cell is already occupied, and relocates the moment one frees -- a backlog, not a silent failure', () => {
    const fixture = buildPrisonerScenarioFixture({ capacity: 10, cellCount: 4, sanctionPolicy: { solitaryTermTicks: 1_000 } });
    const kernel = makeKernel();
    fixture.registerOn(kernel);

    // A filler occupies this fixture's one solitary-cell instance directly,
    // simulating "already full" without depending on a classification draw
    // to get someone there.
    const filler = fixture.prisoners.admitPrisoner(GENERAL_ADMISSION, fixture.originTile);
    completeIntake(kernel);
    const fillerOldInstanceId = fixture.prisoners.coldState.getAccommodation(filler)!;
    fixture.prisoners.roomInstances.release(fillerOldInstanceId, filler);
    fixture.prisoners.roomInstances.assign('solitary-cell-0', filler);
    fixture.prisoners.coldState.setAccommodation(filler, 'solitary-cell-0');
    expect(accommodationCatalogIdOf(fixture, filler)).toBe('room.solitary-cell');

    const entityId = fixture.prisoners.admitPrisoner(GENERAL_ADMISSION, fixture.originTile);
    completeIntake(kernel);
    const originalCellId = fixture.prisoners.coldState.getAccommodation(entityId)!;
    expect(accommodationCatalogIdOf(fixture, entityId)).toBe('room.cell');

    fixture.prisoners.imposeSolitarySanction(entityId, kernel.tick);
    for (let i = 0; i < 50; i += 1) kernel.step();

    // Still recorded, still in their own ordinary cell, and -- because
    // confinement is physical -- not yet enforced either: the relocation is
    // waiting on a free solitary cell, not failing silently, and the record
    // says so rather than a flag that would claim confinement this prison
    // cannot yet deliver.
    const entityIndex = fixture.prisoners.entityStore.getIndex(entityId);
    expect(fixture.prisoners.records.solitarySanctionEndTick[entityIndex]).toBeGreaterThan(0);
    expect(fixture.prisoners.isServingSolitarySanction(entityId)).toBe(false);
    expect(fixture.prisoners.coldState.getAccommodation(entityId)).toBe(originalCellId);
    expect(fixture.prisoners.sanctionSystem.getMetrics().relocationBacklogTicks).toBeGreaterThan(0);
    expect(fixture.prisoners.sanctionSystem.getMetrics().relocatedIntoSolitaryCount).toBe(0);

    // Free the one solitary cell -- the moment it is available, the waiting
    // sanction claims it on the next scheduled tick.
    fixture.prisoners.roomInstances.release('solitary-cell-0', filler);
    for (let i = 0; i < 10; i += 1) kernel.step();
    expect(accommodationCatalogIdOf(fixture, entityId)).toBe('room.solitary-cell');
    expect(fixture.prisoners.sanctionSystem.getMetrics().relocatedIntoSolitaryCount).toBe(1);
  });
});

describe('combineRegimeOverrides: a live riot outranks a standing sanction', () => {
  it('takes the first resolver whenever it answers, and falls back to the second only when the first abstains', () => {
    const riotWins = combineRegimeOverrides(
      () => GENERAL_POPULATION_REGIME,
      () => HIGH_RISK_REGIME,
    );
    expect(riotWins(1, 'general-population')).toBe(GENERAL_POPULATION_REGIME);

    const sanctionAnswersAlone = combineRegimeOverrides(
      () => undefined,
      () => HIGH_RISK_REGIME,
    );
    expect(sanctionAnswersAlone(1, 'general-population')).toBe(HIGH_RISK_REGIME);

    expect(combineRegimeOverrides(undefined, undefined)(1, 'general-population')).toBeUndefined();
    expect(combineRegimeOverrides(undefined, () => HIGH_RISK_REGIME)(1, 'general-population')).toBe(HIGH_RISK_REGIME);
  });
});
