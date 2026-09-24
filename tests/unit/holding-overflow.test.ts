import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { intakeStageIndex } from '../../src/simulation/prisoners/components';
import { deriveRoomCapacity, placedObjectAt } from '../../src/simulation/objects';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

describe('holding-cell overflow', () => {
  it('bench places count for holding while a bed never adds a holding place', () => {
    const bench = placedObjectAt('object.bench', { x: tileCoordinate(0), y: tileCoordinate(0) }, 0);
    const bed = placedObjectAt('object.bed', { x: tileCoordinate(2), y: tileCoordinate(0) }, 0);
    expect(deriveRoomCapacity([bench, bed], undefined, undefined, 'seating').residentCapacity).toBe(2);
    expect(deriveRoomCapacity([bed], undefined, undefined, 'seating').residentCapacity).toBe(0);
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
    expect(fixture.prisoners.records.intakeStage[fixture.prisoners.entityStore.getIndex(overflow)]).toBe(intakeStageIndex('completed'));

    fixture.prisoners.releasePrisoner(first, 25);
    for (let tick = 0; tick < 10; tick += 1) kernel.step();
    expect(fixture.prisoners.coldState.getAccommodation(overflow)).toBe('cell-0');
    expect(fixture.prisoners.roomInstances.occupancyOf('holding-0')).toBe(0);
  });
});
