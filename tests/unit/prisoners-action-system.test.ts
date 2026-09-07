import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { LocomotionStore, LocomotionSystem } from '../../src/simulation/locomotion';
import { OPEN_GROUND } from '../helpers/open-ground';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { ActionSystem } from '../../src/simulation/prisoners/action-system';
import {
  ACTION_PHASES,
  CurrentActionComponent,
  PositionComponent,
  PrisonerColdState,
  PrisonerRecordComponent,
  SubstitutionRecordComponent,
  intakeStageIndex,
} from '../../src/simulation/prisoners/components';
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
      locomotion.advance(ticks, OPEN_GROUND, (index, tile) => {
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
    const substitutions = new SubstitutionRecordComponent(capacity);
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
    const actionSystem = new ActionSystem(store, query, records, needs, currentAction, position, substitutions, coldState, roomInstances, navigation, locomotion, DEFAULT_REGIME_SCHEDULES, () => ({
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
    const substitutions = new SubstitutionRecordComponent(capacity);
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
    const actionSystem = new ActionSystem(store, query, records, needs, currentAction, position, substitutions, coldState, roomInstances, navigation, locomotion, DEFAULT_REGIME_SCHEDULES);
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

/**
 * [ADR 0102](../../docs/adr/0102-what-a-prisoner-without-a-bed-may-still-do.md),
 * at the level `tests/integration/unhoused-prisoner-actions.test.ts` cannot
 * state: **one reconsideration cycle, and one intake stage against another
 * with everything else held equal.**
 *
 * That integration file drives a real prison through real commands over 20,000
 * ticks, which is what makes it evidence about the game. What it cannot
 * separate is the stage from everything the stage travels with -- a prisoner
 * with no bed also has no accommodation, no residency and a different position
 * -- so these cases build one prisoner, step exactly one tick, and change the
 * intake stage and nothing else between the two halves of each comparison.
 */
describe('what intake stage decides about action selection (ADR 0102)', () => {
  /** The general-population regime's second meal block is `[1200, 1300)`, and it allows `meal` and nothing else. */
  const MEAL_BLOCK_START_TICK = 1_200;
  /** Its first work block is `[500, 1000)`: `work`, `education` and `free-association`. */
  const WORK_BLOCK_START_TICK = 500;

  /**
   * One prisoner standing **on the anchor tile of the one room this prison
   * has**, with no accommodation of any kind.
   *
   * Standing on the anchor takes `beginNextAction`'s `sameTile` path, so a
   * selection reaches `performing` inside a single reconsideration tick and
   * what is measured is the choice rather than who finished routing first --
   * the same device `buildFallbackFixture` above uses and for the same reason.
   */
  function buildStageFixture(options: { readonly room: 'canteen' | 'laundry'; readonly stage: 'accommodation-assignment' | 'completed'; readonly startTick: number }) {
    const capacity = 4;
    const store = new EntityStore(capacity);
    const bitset = new ComponentBitset(capacity);
    const query = new EntityQuery(store, bitset);
    query.mask.require(0);

    const records = new PrisonerRecordComponent(capacity);
    const needs = new NeedsComponent(capacity);
    const currentAction = new CurrentActionComponent(capacity);
    const position = new PositionComponent(capacity);
    const substitutions = new SubstitutionRecordComponent(capacity);
    const coldState = new PrisonerColdState();
    const roomInstances = new RoomInstanceRegistry();

    const cellBlock = buildCellBlockFixture(4);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 15, flowFieldActivationThreshold: 6 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    // One room, anchored on the tile the prisoner stands on. The laundry is
    // registered on the canteen's tile because this fixture's world has no
    // laundry of its own and the anchor only has to be somewhere navigable --
    // what is under test is which candidate the selection accepts, not where
    // the room is.
    const anchorTile = cellBlock.canteenTiles[0]!;
    const instanceId = options.room === 'canteen' ? 'canteen-0' : 'laundry-0';
    roomInstances.register({
      instanceId,
      roomCatalogId: options.room === 'canteen' ? 'room.canteen' : 'room.laundry',
      anchorTile,
      residentCapacity: 0,
      concurrentUseCapacity: 4,
      objectCapabilities: [options.room === 'canteen' ? 'dining' : 'laundry'],
    });

    const kernel = new Kernel(options.startTick, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
    const locomotion = registerLocomotion(kernel, position);
    const actionSystem = new ActionSystem(store, query, records, needs, currentAction, position, substitutions, coldState, roomInstances, navigation, locomotion, DEFAULT_REGIME_SCHEDULES);
    kernel.registerSystem(navigation);
    kernel.registerSystem(actionSystem);

    const entityId = store.spawn();
    const index = store.getIndex(entityId);
    bitset.add(index, 0);
    records.intakeStage[index] = intakeStageIndex(options.stage);
    records.classificationGroupIndex[index] = 0; // general-population, written during the `classification` stage
    // Every need on the floor, so no candidate is refused for want of wanting
    // it: what decides the outcome below is the stage and the room, never the
    // scoring.
    for (const needId of ['hunger', 'hygiene', 'recreation'] as const) needs.set(index, needId, 0);
    position.tileX[index] = anchorTile.x;
    position.tileY[index] = anchorTile.y;

    return { kernel, store, entityId, index, records, currentAction, coldState, roomInstances, actionSystem };
  }

  const actionIdOf = (fixture: ReturnType<typeof buildStageFixture>): string | undefined => {
    const actionIndex = fixture.currentAction.actionIndex[fixture.index]!;
    return actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex]!.id : undefined;
  };

  it('eats at `accommodation-assignment`, exactly as it does at `completed`', () => {
    for (const stage of ['accommodation-assignment', 'completed'] as const) {
      const fixture = buildStageFixture({ room: 'canteen', stage, startTick: MEAL_BLOCK_START_TICK });

      fixture.kernel.step(); // one reconsideration, and only one

      expect(actionIdOf(fixture), stage).toBe('action.eat-meal');
      expect(ACTION_PHASES[fixture.currentAction.phase[fixture.index]!], stage).toBe('performing');
      expect(fixture.actionSystem.getMetrics().actionsStarted, stage).toBe(1);
    }
  });

  it('does no work at `accommodation-assignment`, and the same prisoner at `completed` does', () => {
    // ADR 0102 decision 2's one explicit exclusion. The two fixtures differ in
    // the intake stage and in nothing else -- same room, same tick, same
    // needs, neither holding an accommodation -- so a `'work'` action taken by
    // one and refused the other is the stage deciding it.
    const waiting = buildStageFixture({ room: 'laundry', stage: 'accommodation-assignment', startTick: WORK_BLOCK_START_TICK });
    waiting.kernel.step();
    expect(actionIdOf(waiting)).toBeUndefined();
    expect(ACTION_PHASES[waiting.currentAction.phase[waiting.index]!]).toBe('idle');
    expect(waiting.actionSystem.getMetrics()).toMatchObject({ actionsStarted: 0, unmetDemandCycles: 1 });

    const housed = buildStageFixture({ room: 'laundry', stage: 'completed', startTick: WORK_BLOCK_START_TICK });
    housed.kernel.step();
    expect(actionIdOf(housed)).toBe('action.laundry-work');
    expect(housed.actionSystem.getMetrics().actionsStarted).toBe(1);
  });

  it('gives back its seat when its stage leaves the eligible set mid-action, instead of holding it for ever', () => {
    /*
     * The exit the widened gate creates, and the one ADR 0102 does not name.
     * `IntakeSystem` writes exactly this transition -- an
     * `accommodation-assignment` prisoner becomes `'failed'` on the scheduled
     * tick the prison holds no instance of any room type their classification
     * group may be housed in, which a player reaches by un-zoning the last
     * such room -- and it is written by hand here rather than driven, for the
     * reason this file's header gives: what is under test is `ActionSystem`'s
     * response to the stage, not `IntakeSystem`'s reason for writing it.
     *
     * Before ADR 0102 this cost nothing, because an unhoused prisoner held no
     * claim and stood in no action. It is a leak now, and a silent one: the
     * seat would be held by a prisoner `update` will never look at again.
     */
    const fixture = buildStageFixture({ room: 'canteen', stage: 'accommodation-assignment', startTick: MEAL_BLOCK_START_TICK });
    fixture.kernel.step();

    // The precondition, asserted rather than assumed.
    expect(ACTION_PHASES[fixture.currentAction.phase[fixture.index]!]).toBe('performing');
    expect(fixture.roomInstances.useOccupancyOf('canteen-0', 'dining')).toBe(1);
    expect(fixture.coldState.getActionTarget(fixture.entityId)).toBe('canteen-0');

    fixture.records.intakeStage[fixture.index] = intakeStageIndex('failed');
    // One whole reconsideration cycle: `ActionSystem`'s schedule is every 20
    // ticks, so a single `step` after the write would land on a tick the
    // system does not run at and prove nothing either way.
    for (let tick = 0; tick < 20; tick += 1) fixture.kernel.step();

    expect(fixture.roomInstances.useOccupancyOf('canteen-0', 'dining'), 'the seat is given back').toBe(0);
    expect(ACTION_PHASES[fixture.currentAction.phase[fixture.index]!]).toBe('idle');
    expect(fixture.coldState.getActionTarget(fixture.entityId)).toBeUndefined();
  });
});
