import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { intakeStageIndex } from '../../src/simulation/prisoners/components';
import { deriveRoomCapacity, placedObjectAt } from '../../src/simulation/objects';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { holdingNeedPressure, HOLDING_FULL_DAY_TICKS, HOLDING_GRACE_TICKS } from '../../src/simulation/prisoners/needs-system';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';
import { stateIncomeForCompletedDay } from '../../src/simulation/economy/income';

describe('holding-cell overflow', () => {
  it('raises the slope after a grace period and again after a full day', () => {
    expect(holdingNeedPressure(HOLDING_GRACE_TICKS - 1)).toEqual({ safety: 0, sleep: 0 });
    expect(holdingNeedPressure(HOLDING_GRACE_TICKS)).toEqual({ safety: 4, sleep: 0 });
    expect(holdingNeedPressure(HOLDING_FULL_DAY_TICKS)).toEqual({ safety: 10, sleep: 4 });
  });

  it('bench places count for holding while a bed never adds a holding place', () => {
    const bench = placedObjectAt('object.bench', { x: tileCoordinate(0), y: tileCoordinate(0) }, 0);
    const bed = placedObjectAt('object.bed', { x: tileCoordinate(2), y: tileCoordinate(0) }, 0);
    expect(deriveRoomCapacity([bench, bed], undefined, undefined, 'seating').residentCapacity).toBe(2);
    expect(deriveRoomCapacity([bed], undefined, undefined, 'seating').residentCapacity).toBe(0);
    const holding = deriveRoomCapacity([bench, bed], undefined, undefined, 'seating', 'sleep-surface');
    expect(holding.objectCapabilities).not.toContain('sleep-surface');
    expect(holding.concurrentUseCapacityByCapability.some(([capability]) => capability === 'sleep-surface')).toBe(false);
  });

  it('houses an excess arrival on a bench, then moves them into a freed bed', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 2, capacity: 10 });
    fixture.prisoners.roomInstances.register({
      instanceId: 'holding-0', roomCatalogId: 'room.holding-cell', anchorTile: fixture.originTile,
      residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['seating'], openArea: true,
    });
    const kernel = new Kernel(0, 0, new NamedRngStreams([
      { name: 'prisoners.classification', state: deriveXoshiroState(1, 'prisoners.classification') },
    ]));
    fixture.prisoners.registerOn(kernel);
    const first = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, fixture.originTile);
    const overflow = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, fixture.originTile);
    for (let tick = 0; tick < 25; tick += 1) kernel.step();

    expect(fixture.prisoners.coldState.getAccommodation(first)).toBe('cell-0');
    expect(fixture.prisoners.coldState.getAccommodation(overflow)).toBe('holding-0');
    expect(stateIncomeForCompletedDay(fixture.prisoners)).toBe(600);
    expect(fixture.prisoners.records.intakeStage[fixture.prisoners.entityStore.getIndex(overflow)]).toBe(intakeStageIndex('completed'));
    const [heldId, since] = fixture.prisoners.intakeSystem.getHoldingSnapshot()[0]!;
    expect(heldId).toBe(overflow);
    expect(fixture.prisoners.holdingAgeBands(since + HOLDING_GRACE_TICKS - 1)).toEqual({ grace: 1, strained: 0, critical: 0 });
    expect(fixture.prisoners.holdingAgeBands(since + HOLDING_GRACE_TICKS)).toEqual({ grace: 0, strained: 1, critical: 0 });
    expect(fixture.prisoners.holdingAgeBands(since + HOLDING_FULL_DAY_TICKS)).toEqual({ grace: 0, strained: 0, critical: 1 });

    fixture.prisoners.releasePrisoner(first, 25);
    for (let tick = 0; tick < 10; tick += 1) kernel.step();
    expect(fixture.prisoners.coldState.getAccommodation(overflow)).toBe('cell-0');
    expect(fixture.prisoners.roomInstances.occupancyOf('holding-0')).toBe(0);
  });

  it('keeps excess intake outside the population until a bed is freed', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 2, capacity: 10 });
    const kernel = new Kernel(0, 0, new NamedRngStreams([
      { name: 'prisoners.classification', state: deriveXoshiroState(1, 'prisoners.classification') },
    ]));
    fixture.prisoners.registerOn(kernel);
    const resident = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, fixture.originTile);
    const highRisk = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 250_000, priorIncidents: 5 }, fixture.originTile);
    for (let tick = 0; tick < 20; tick += 1) kernel.step();
    expect(fixture.prisoners.roomInstances.occupancyOf('cell-0')).toBe(1);
    expect(fixture.prisoners.roomInstances.occupancyOf('solitary-cell-0')).toBe(1);
    const incomeBeforeQueue = stateIncomeForCompletedDay(fixture.prisoners);

    expect(fixture.prisoners.requestAdmission({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, fixture.originTile, 20)).toEqual({
      kind: 'delayed', queueLength: 1,
    });
    expect(fixture.prisoners.requestAdmission({ sentenceLengthTicks: 200_000, priorIncidents: 0 }, fixture.originTile, 21)).toEqual({
      kind: 'delayed', queueLength: 2,
    });
    expect(fixture.prisoners.delayedIntakeCount).toBe(2);
    expect(fixture.prisoners.admittedCount).toBe(2);
    expect(stateIncomeForCompletedDay(fixture.prisoners)).toBe(incomeBeforeQueue);
    fixture.prisoners.releasePrisoner(resident, 20);
    for (let tick = 0; tick < 25; tick += 1) kernel.step();
    expect(fixture.prisoners.delayedIntakeCount).toBe(1);
    expect(fixture.prisoners.getDelayedIntakeSnapshot()[0]!.input.sentenceLengthTicks).toBe(200_000);
    expect(fixture.prisoners.admittedCount).toBe(3);
    expect(fixture.prisoners.roomInstances.occupancyOf('cell-0')).toBe(1);
    expect(fixture.prisoners.entityStore.isAlive(highRisk)).toBe(true);
  });
});
