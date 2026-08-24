import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { PrisonerColdState, PrisonerRecordComponent, classificationGroupIndex, intakeStageIndex } from '../../src/simulation/prisoners/components';
import { IntakeSystem } from '../../src/simulation/prisoners/intake-system';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';

function makeKernel() {
  return new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
}

describe('IntakeSystem: deterministic stage-by-stage pipeline', () => {
  it('advances one stage per scheduled tick: queued -> reception -> classification -> accommodation-assignment -> completed', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 0 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);

    expect(fixture.prisoners.records.intakeStage[index]).toBe(0); // 'queued'

    // IntakeSystem fires every 5 ticks starting at tick 0: each batch of 5
    // `kernel.step()` calls processes exactly one firing (at ticks 0, 5, 10, 15).
    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(1); // 'reception'

    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(2); // 'classification'

    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(3); // 'accommodation-assignment'

    for (let i = 0; i < 5; i += 1) kernel.step();
    expect(fixture.prisoners.records.intakeStage[index]).toBe(4); // 'completed'
    expect(fixture.prisoners.coldState.getAccommodation(entityId)).toBeDefined();
    expect(fixture.prisoners.intakeSystem.getMetrics().completedCount).toBe(1);
  });

  it('routes the arrival to the room type its own classification group resolves to, not merely to some free room', () => {
    // The pipeline test above ends on `toBeDefined()`, which asks only that
    // *an* accommodation was written. That is exactly the assertion an
    // intake which never read `classificationGroupIndex` -- and handed
    // `DEFAULT_ACCOMMODATION_POLICY` a hard-coded 'general-population' --
    // would still satisfy, because a general-population cell is free and
    // gets assigned. So the identity of the instance is asserted here.
    //
    // The fixture makes that identity readable: it registers a trailing
    // slice of the cell block's cell tiles -- `Math.floor(40%)` of them, at
    // least one -- as `room.solitary-cell` instances named
    // `solitary-cell-<n>`, and every earlier tile as a `room.cell` instance
    // named `cell-<n>`. So the instance id alone says which room-catalog id
    // the policy was asked for, and `DEFAULT_ACCOMMODATION_POLICY` maps
    // 'high-risk' to `room.solitary-cell` and every other group to
    // `room.cell`.
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    // `classifyPrisoner` scores a sentence at or over 200_000 ticks as +1
    // and adds `min(2, max(0, priorIncidents))`, then shifts the total by
    // one screening draw in {-1, 0, +1} and clamps to 0..3; 'high-risk' is
    // riskTier 3. The first arrival therefore scores the maximum 3 and lands
    // high-risk unless the draw is -1 -- which under this file's fixed seed
    // it is not, and the group assertions below are what make that visible
    // rather than assumed. The second scores 0, so no draw can lift it out
    // of general-population.
    const highRisk = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 250_000, priorIncidents: 4 }, fixture.originTile);
    const generalPopulation = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 1_000, priorIncidents: 0 }, fixture.originTile);

    // Four firings (ticks 0, 5, 10, 15) carry both arrivals from 'queued' to
    // 'completed'; `update` advances every prisoner entity on each firing,
    // so two arrivals take no longer than one.
    for (let i = 0; i < 20; i += 1) kernel.step();

    const highRiskIndex = fixture.prisoners.entityStore.getIndex(highRisk);
    const generalPopulationIndex = fixture.prisoners.entityStore.getIndex(generalPopulation);

    expect(fixture.prisoners.records.classificationGroupIndex[highRiskIndex]).toBe(classificationGroupIndex('high-risk'));
    expect(fixture.prisoners.records.classificationGroupIndex[generalPopulationIndex]).toBe(classificationGroupIndex('general-population'));
    expect(fixture.prisoners.records.intakeStage[highRiskIndex]).toBe(intakeStageIndex('completed'));
    expect(fixture.prisoners.records.intakeStage[generalPopulationIndex]).toBe(intakeStageIndex('completed'));

    // `findAvailable` takes the first free instance in ascending instance-id
    // order, so in a prison that starts empty, with one arrival per group,
    // each takes its own group's lowest instance id.
    expect(fixture.prisoners.coldState.getAccommodation(highRisk)).toBe('solitary-cell-0');
    expect(fixture.prisoners.coldState.getAccommodation(generalPopulation)).toBe('cell-0');

    // The ids above are only shorthand for the room type as long as the
    // registry agrees, so ask it directly too.
    expect(fixture.prisoners.roomInstances.getById('solitary-cell-0')?.roomCatalogId).toBe('room.solitary-cell');
    expect(fixture.prisoners.roomInstances.getById('cell-0')?.roomCatalogId).toBe('room.cell');
  });

  it('classification assigns a risk tier and sets sentenceEndTick from the submitted sentence length', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 5_000, priorIncidents: 2 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);

    for (let i = 0; i < 100; i += 1) kernel.step();

    expect(fixture.prisoners.records.riskTier[index]).toBeGreaterThanOrEqual(0);
    expect(fixture.prisoners.records.sentenceEndTick[index]).toBeGreaterThan(5_000); // classification happened at some tick > 0
  });

  it('leaves accommodation-assignment as a retry-able backlog, not a hard failure, once every cell is occupied', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 2, capacity: 10 }); // only 2 general-population... minus the 10% solitary reservation, effectively fewer
    const kernel = makeKernel();
    fixture.prisoners.registerOn(kernel);

    const generalCapacity = fixture.generalCellTiles.length;
    const entityIds = Array.from({ length: generalCapacity + 1 }, () =>
      fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 100, priorIncidents: 0 }, fixture.originTile),
    );

    for (let i = 0; i < 200; i += 1) kernel.step();

    const stages = entityIds.map((id) => fixture.prisoners.records.intakeStage[fixture.prisoners.entityStore.getIndex(id)]);
    const completed = stages.filter((s) => s === 4).length;
    const waiting = stages.filter((s) => s === 3).length;

    expect(completed).toBe(generalCapacity); // exactly as many as there are cells
    expect(waiting).toBe(1); // the overflow prisoner waits, is not marked 'failed'
    expect(fixture.prisoners.intakeSystem.getMetrics().accommodationBacklogTicks).toBeGreaterThan(0);
    expect(fixture.prisoners.intakeSystem.getMetrics().failedCount).toBe(0);
  });

  it('marks intake as structurally failed when no instance of the required room type exists at all (not merely full)', () => {
    const capacity = 10;
    const store = new EntityStore(capacity);
    const bitset = new ComponentBitset(capacity);
    const query = new EntityQuery(store, bitset);
    query.mask.require(0);
    const records = new PrisonerRecordComponent(capacity);
    const coldState = new PrisonerColdState();
    const roomInstances = new RoomInstanceRegistry(); // deliberately empty -- no 'room.cell' instance registered at all
    const intakeSystem = new IntakeSystem(store, query, records, coldState, roomInstances);

    const kernel = makeKernel();
    kernel.registerSystem(intakeSystem);

    const entityId = store.spawn();
    bitset.add(store.getIndex(entityId), 0);
    intakeSystem.submitIntake(entityId, { sentenceLengthTicks: 100, priorIncidents: 0 });

    for (let i = 0; i < 20; i += 1) kernel.step();

    const index = store.getIndex(entityId);
    expect(records.intakeStage[index]).toBe(5); // 'failed'
    expect(intakeSystem.getMetrics().failedCount).toBe(1);
    expect(intakeSystem.getMetrics().accommodationBacklogTicks).toBe(0); // structural failure, not backlog
  });

  it('starts an intake at "queued" whatever stage the slot already held', () => {
    // `submitIntake`'s own intake-stage write is the one reset-shaped write
    // the admission path had before #111's per-slot component reset landed,
    // and deleting it still survives the rest of the suite: `admitPrisoner`
    // resets the slot before calling here, and a never-occupied slot already
    // reads 'queued', so no admission can observe the write. `IntakeSystem`
    // is public on `PrisonerOperationsRuntime`, and this write is what makes
    // a caller that is *not* `admitPrisoner` start at the beginning of the
    // pipeline rather than wherever the slot was left. Nothing in `src/` is
    // such a caller today.
    const capacity = 4;
    const store = new EntityStore(capacity);
    const bitset = new ComponentBitset(capacity);
    const query = new EntityQuery(store, bitset);
    query.mask.require(0);
    const records = new PrisonerRecordComponent(capacity);
    const intakeSystem = new IntakeSystem(store, query, records, new PrisonerColdState(), new RoomInstanceRegistry());

    const entityId = store.spawn();
    const index = store.getIndex(entityId);
    bitset.add(index, 0);
    records.intakeStage[index] = intakeStageIndex('completed');

    intakeSystem.submitIntake(entityId, { sentenceLengthTicks: 100, priorIncidents: 0 });

    expect(records.intakeStage[index]).toBe(intakeStageIndex('queued'));
  });
});
