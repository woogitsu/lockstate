import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { LocomotionStore, LocomotionSystem } from '../../src/simulation/locomotion';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { ActionSystem } from '../../src/simulation/prisoners/action-system';
import { ACTION_PHASES, CurrentActionComponent, PositionComponent, PrisonerColdState, PrisonerRecordComponent, intakeStageIndex } from '../../src/simulation/prisoners/components';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_MAX, NEED_MAX_SCALED, NeedsComponent, type NeedId } from '../../src/simulation/prisoners/needs';
import { DEFAULT_REGIME_SCHEDULES } from '../../src/simulation/prisoners/regime';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

const RNG_STREAM = 'prisoners.classification';

function makeKernel(initialTick = 0) {
  return new Kernel(initialTick, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
}

/**
 * The walk store and the system that advances it, wired the way
 * `PrisonerOperationsRuntime` wires them (ADR 0059).
 *
 * A hand-wired `ActionSystem` needs both: since the arrival moved behind a
 * walk, an `ActionSystem` registered without something stepping the walk
 * starts journeys that never finish.
 */
function registerLocomotion(kernel: Kernel, position: PositionComponent): LocomotionStore {
  const locomotion = new LocomotionStore();
  kernel.registerSystem(
    new LocomotionSystem('prisoners.locomotion', (ticks) =>
      locomotion.advance(ticks, (index, tile) => {
        position.tileX[index] = tile.x;
        position.tileY[index] = tile.y;
      }),
    ),
  );
  return locomotion;
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

    const kernel = makeKernel();
    const locomotion = registerLocomotion(kernel, position);
    const actionSystem = new ActionSystem(store, query, records, needs, currentAction, position, coldState, roomInstances, navigation, locomotion, DEFAULT_REGIME_SCHEDULES, () => ({
      role: 'prisoner', securityClearance: 0, permissions: [],
    }));

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

/**
 * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * decision 1, at the level the integration tests cannot state: **in the same
 * reconsideration cycle.**
 *
 * `tests/integration/cell-only-meal-fallback.test.ts` measures the player-facing
 * consequence over 9,000 ticks. What it cannot separate is "fell back at once"
 * from "gave up and happened to choose differently twenty ticks later", because
 * both feed the prisoner in the end. These tests step exactly **one** kernel
 * tick, which is one reconsideration and no more.
 */
describe('a prisoner whose best action cannot resolve a target falls back within the same cycle', () => {
  /** The general-population regime's second meal block is `[1200, 1300)`, and it allows `meal` and nothing else. */
  const MEAL_BLOCK_START_TICK = 1_200;

  /**
   * One prisoner standing **on their own cell's anchor tile**, hungry, with
   * `action.eat-meal`'s canteen either registered or absent.
   *
   * Standing on the anchor is deliberate and is not a way around navigation: it
   * takes `beginNextAction`'s `sameTile` path, so the fallback reaches
   * `performing` inside a single reconsideration tick and what is measured is
   * the candidate walk rather than who finished routing first.
   */
  function buildFallbackFixture(options: { readonly withCanteen: boolean; readonly canteenSeats?: number }) {
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
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 15, flowFieldActivationThreshold: 6 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    const cellTile = cellBlock.cellTiles[0]!;
    roomInstances.register({
      instanceId: 'cell-0', roomCatalogId: 'room.cell', anchorTile: cellTile,
      residentCapacity: 1, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface', 'sanitation'],
    });
    if (options.withCanteen) {
      roomInstances.register({
        instanceId: 'canteen-0', roomCatalogId: 'room.canteen', anchorTile: cellBlock.canteenTiles[0]!,
        residentCapacity: 0, concurrentUseCapacity: options.canteenSeats ?? 1, objectCapabilities: ['dining'],
      });
    }

    const kernel = new Kernel(MEAL_BLOCK_START_TICK, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
    const locomotion = registerLocomotion(kernel, position);
    const actionSystem = new ActionSystem(store, query, records, needs, currentAction, position, coldState, roomInstances, navigation, locomotion, DEFAULT_REGIME_SCHEDULES);
    kernel.registerSystem(navigation);
    kernel.registerSystem(actionSystem);

    const entityId = store.spawn();
    const index = store.getIndex(entityId);
    bitset.add(index, 0);
    records.intakeStage[index] = intakeStageIndex('completed');
    records.classificationGroupIndex[index] = 0; // general-population
    needs.set(index, 'hunger', 0); // makes `action.eat-meal` the best-scoring legal candidate
    coldState.setAccommodation(entityId, 'cell-0');
    position.tileX[index] = cellTile.x;
    position.tileY[index] = cellTile.y;

    return { kernel, store, entityId, index, currentAction, coldState, roomInstances, actionSystem };
  }

  const actionOf = (fixture: ReturnType<typeof buildFallbackFixture>): string | undefined => {
    const actionIndex = fixture.currentAction.actionIndex[fixture.index]!;
    return actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex]!.id : undefined;
  };

  it('eats in its cell on the first cycle when no canteen exists at all', () => {
    const fixture = buildFallbackFixture({ withCanteen: false });

    // The precondition, asserted rather than assumed: the higher-scoring meal
    // has nowhere to resolve, and the lower-scoring one does.
    expect(fixture.roomInstances.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
    expect(fixture.roomInstances.getById('cell-0')).toBeDefined();

    fixture.kernel.step(); // one reconsideration, and only one

    expect(ACTION_PHASES[fixture.currentAction.phase[fixture.index]!]).toBe('performing');
    expect(actionOf(fixture)).toBe('action.eat-in-cell');
    expect(fixture.coldState.getActionTarget(fixture.entityId)).toBe('cell-0');
    expect(fixture.actionSystem.getMetrics()).toMatchObject({ actionsStarted: 1, unmetDemandCycles: 0 });
  });

  it('prefers the canteen when one exists, so the walk is a fallback and not a replacement', () => {
    const fixture = buildFallbackFixture({ withCanteen: true });

    fixture.kernel.step();

    // The canteen is not on this prisoner's tile, so the higher-scoring meal is
    // a journey rather than an immediate start -- which is the observable
    // difference from the case above.
    expect(actionOf(fixture)).toBe('action.eat-meal');
    expect(fixture.coldState.getActionTarget(fixture.entityId)).toBe('canteen-0');
    expect(ACTION_PHASES[fixture.currentAction.phase[fixture.index]!]).toBe('travelling');
  });

  it('falls back when the canteen exists but is full, and takes no seat it was refused', () => {
    const fixture = buildFallbackFixture({ withCanteen: true, canteenSeats: 1 });
    // Somebody else holds the only seat, so `findAvailableForUse` answers
    // nothing for `'dining'` while the room itself still stands.
    expect(fixture.roomInstances.claimUse('canteen-0', 999 as never, 'dining')).toBe(true);
    expect(fixture.roomInstances.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();

    fixture.kernel.step();

    // ADR 0041's consequence for the contended case: the loser eats a worse
    // meal instead of nothing. ADR 0029 decision 5's unfairness is untouched --
    // the incumbent keeps the seat.
    expect(actionOf(fixture)).toBe('action.eat-in-cell');
    expect(fixture.roomInstances.useOccupancyOf('canteen-0', 'dining'), 'the refused prisoner took no seat').toBe(1);
  });

  it('still counts an unmet cycle when no candidate at all resolves, and starts nothing', () => {
    const fixture = buildFallbackFixture({ withCanteen: false });
    // The prisoner's accommodation points at no registered instance, so both
    // meal actions are dead ends and the block allows nothing else. This is the
    // case the walk must still refuse.
    fixture.coldState.setAccommodation(fixture.entityId, 'nonexistent-cell');

    fixture.kernel.step();

    expect(ACTION_PHASES[fixture.currentAction.phase[fixture.index]!]).toBe('idle');
    expect(fixture.coldState.getActionTarget(fixture.entityId)).toBeUndefined();
    // Counted exactly once for the cycle, not once per candidate tried.
    expect(fixture.actionSystem.getMetrics()).toMatchObject({ actionsStarted: 0, unmetDemandCycles: 1 });
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
