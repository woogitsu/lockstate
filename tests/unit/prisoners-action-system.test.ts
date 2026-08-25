import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { ActionSystem } from '../../src/simulation/prisoners/action-system';
import { CurrentActionComponent, PositionComponent, PrisonerColdState, PrisonerRecordComponent, intakeStageIndex } from '../../src/simulation/prisoners/components';
import { NEED_MAX, NEED_MAX_SCALED, NeedsComponent, type NeedId } from '../../src/simulation/prisoners/needs';
import { DEFAULT_REGIME_SCHEDULES } from '../../src/simulation/prisoners/regime';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

const RNG_STREAM = 'prisoners.classification';

function makeKernel(initialTick = 0) {
  return new Kernel(initialTick, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
}

describe('ActionSystem: end-to-end selection, travel and performance', () => {
  it('selects, travels to and performs an action once intake completes, improving the targeted need', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 200_000, priorIncidents: 0 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);
    fixture.prisoners.needs.set(index, 'hunger', 0);

    // Run past a full regime day (DAY_LENGTH_TICKS=2,400): the first regime
    // block is sleep-only, and a started sleep action runs to its own
    // minDurationTicks even past curfew end, so hunger genuinely cannot be
    // addressed until a later meal block -- this margin is intentional, not slack.
    for (let i = 0; i < 3_000; i += 1) kernel.step();

    expect(fixture.prisoners.records.intakeStage[index]).toBe(4); // 'completed'
    expect(fixture.prisoners.actionSystem.getMetrics().actionsStarted).toBeGreaterThan(0);
    expect(fixture.prisoners.needs.get(index, 'hunger')).toBeGreaterThan(0);
  });

  it('records a route failure as unmet demand and returns to idle rather than getting stuck travelling forever', () => {
    // A minimal, hand-wired ActionSystem whose only registered navigable
    // room instance requires a security clearance the resolver never grants.
    const capacity = 4;
    const store = new EntityStore(capacity);
    const bitset = new ComponentBitset(capacity);
    const query = new EntityQuery(store, bitset);
    query.mask.require(0);

    const records = new PrisonerRecordComponent(capacity);
    const needs = new NeedsComponent(capacity);
    const currentAction = new CurrentActionComponent(capacity);
    const position = new PositionComponent(capacity);
    const coldState = new PrisonerColdState();
    const roomInstances = new RoomInstanceRegistry();

    const cellBlock = buildCellBlockFixture(4);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 1_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    // Gate the canteen entrance behind a clearance no RouteContext this test issues will ever have.
    cellBlock.doors.setState(cellBlock.canteenEntranceDoorId, 'locked');
    roomInstances.register({ instanceId: 'canteen-0', roomCatalogId: 'room.canteen', anchorTile: cellBlock.canteenTiles[0]!, residentCapacity: 10, concurrentUseCapacity: 10, objectCapabilities: ['dining'] });

    const actionSystem = new ActionSystem(store, query, records, needs, currentAction, position, coldState, roomInstances, navigation, DEFAULT_REGIME_SCHEDULES, () => ({
      role: 'prisoner', securityClearance: 0, permissions: [],
    }));

    const kernel = makeKernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(actionSystem);

    const entityId = store.spawn();
    const index = store.getIndex(entityId);
    bitset.add(index, 0);
    records.intakeStage[index] = intakeStageIndex('completed');
    records.classificationGroupIndex[index] = 0; // general-population
    needs.set(index, 'hunger', 0); // strongly prefers the (unreachable) canteen meal over eat-in-cell... unless accommodation is unset
    coldState.setAccommodation(entityId, 'nonexistent-cell'); // no own-accommodation instance registered either
    position.tileX[index] = cellBlock.cellTiles[0]!.x;
    position.tileY[index] = cellBlock.cellTiles[0]!.y;

    for (let i = 0; i < 200; i += 1) kernel.step();

    expect(actionSystem.getMetrics().routeFailures + actionSystem.getMetrics().unmetDemandCycles).toBeGreaterThan(0);
  });
});

describe('needs at NEED_MAX are never exceeded even under repeated action performance', () => {
  it('clamps at NEED_MAX rather than overflowing', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 4, capacity: 10 });
    const kernel = makeKernel();
    fixture.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 200_000, priorIncidents: 0 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);

    for (let i = 0; i < 3_000; i += 1) kernel.step();

    // `getSnapshot` hands back the component's own storage, which is scaled
    // (#259); the whole-level ceiling is read through `get`, and the stored
    // ceiling is asserted alongside it so a clamp that stopped applying to
    // the raw array could not hide behind the rounding `get` does.
    for (const [needId, level] of Object.entries(fixture.prisoners.needs.getSnapshot()) as [NeedId, Uint16Array][]) {
      expect(level[index]!).toBeLessThanOrEqual(NEED_MAX_SCALED);
      expect(fixture.prisoners.needs.get(index, needId)).toBeLessThanOrEqual(NEED_MAX);
    }
  });
});
