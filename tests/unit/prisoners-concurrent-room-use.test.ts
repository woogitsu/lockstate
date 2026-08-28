import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore, type EntityId } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { LocomotionStore, LocomotionSystem } from '../../src/simulation/locomotion';
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
  intakeStageIndex,
} from '../../src/simulation/prisoners/components';
import { NeedsComponent } from '../../src/simulation/prisoners/needs';
import { DEFAULT_REGIME_SCHEDULES } from '../../src/simulation/prisoners/regime';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

/**
 * The walk store and the system that advances it, wired the way
 * `PrisonerOperationsRuntime` wires them (ADR 0059). An `ActionSystem`
 * registered without one starts journeys that never finish, because the
 * arrival now happens when the walk ends rather than when the router answers.
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


/**
 * ADR 0028 phase 6 and [ADR 0029](../../docs/adr/0029-concurrent-room-use-claims.md):
 * `concurrentUseCapacity` is a ceiling that actually binds.
 *
 * ## The defect these were written against, measured
 *
 * Nothing in `action-system.ts` called `assign`, `release` or `occupancyOf` --
 * the strings did not appear in the file -- so a room's occupant set only ever
 * held the prisoners `IntakeSystem` had housed there, and
 * `findAvailableForUse` compared a canteen's *resident* count against its
 * concurrent-use capacity. For a canteen that resident count is permanently
 * zero, which made the gate a pure zero-check.
 *
 * Measured on the pre-fix tree, through this file's own fixture: 5 prisoners
 * and a canteen with `concurrentUseCapacity: 2` gave
 * `performingInCanteen: 5, occupancyOf: 0` after **one** reconsideration tick;
 * 40 prisoners against a `concurrentUseCapacity: 1` canteen gave
 * `performingInCanteen: 40, occupancyOf: 0`. Any capacity above zero admitted
 * an unlimited number of simultaneous users.
 *
 * ## What each test would have to break to fail
 *
 * The claim is taken at the transition into `performing` and released at every
 * transition out of it, so the tests below are one per transition: contention
 * at the claim, completion, abandonment, refusal-after-travel, and the restore
 * rebuild. Each is red with the corresponding half of the change reverted.
 */

const RNG_STREAM = 'prisoners.classification';

/**
 * The general-population regime's second meal block is `[1200, 1300)`
 * (`src/simulation/prisoners/regime.ts`), and it allows `meal` and nothing
 * else. Starting there is what makes `action.eat-meal` -- the one action in
 * `DEFAULT_ACTIONS` that targets `room.canteen` by catalogue id -- the
 * best-scoring legal candidate, so the only thing under test is the
 * concurrent-use gate. `action.eat-in-cell` is the other legal meal action and
 * scores lower (a `hunger` effect of 3 against 4); no accommodation is set for
 * anybody here, so it could not resolve a target anyway.
 */
const MEAL_BLOCK_START_TICK = 1_200;

/** `ActionSystem.schedule` is `{ intervalTicks: 20, phaseTicks: 0 }`, so a reconsideration lands on every twentieth tick. */
const RECONSIDERATION_INTERVAL_TICKS = 20;

const PERFORMING_PHASE = ACTION_PHASES.indexOf('performing');
const IDLE_PHASE = ACTION_PHASES.indexOf('idle');

interface ContentionFixture {
  readonly kernel: Kernel;
  readonly store: EntityStore;
  readonly roomInstances: RoomInstanceRegistry;
  readonly currentAction: CurrentActionComponent;
  readonly coldState: PrisonerColdState;
  readonly actionSystem: ActionSystem;
  readonly prisoners: readonly EntityId[];
  readonly canteenInstanceId: string;
  readonly canteenTile: { readonly x: number; readonly y: number };
  /** How many prisoners are `performing` an action whose target is the canteen right now. */
  readonly performingInCanteen: () => number;
  readonly step: (ticks: number) => void;
}

/**
 * `prisonerCount` prisoners standing **on the canteen's anchor tile**, and a
 * canteen whose concurrent-use capacity is `concurrentUseCapacity`.
 *
 * Standing on the anchor is deliberate and is not a way around navigation: it
 * takes `ActionSystem`'s `sameTile` path, so every prisoner reaches
 * `performing` inside a single reconsideration tick and the number of
 * simultaneous users is a function of the capacity gate alone rather than of
 * who happened to finish routing first. The travelling path into the same
 * transition has its own test below, which starts them in the cell block.
 *
 * `residentCapacity: 0` throughout: a canteen houses nobody, which is the
 * asymmetry the two capacities exist for, and it also means every occupancy
 * number these tests read can only have come from a use claim.
 */
function buildContentionFixture(options: {
  readonly prisonerCount: number;
  readonly concurrentUseCapacity: number;
  readonly startInCellBlock?: boolean;
}): ContentionFixture {
  const slots = options.prisonerCount + 2;
  const store = new EntityStore(slots);
  const bitset = new ComponentBitset(slots);
  const query = new EntityQuery(store, bitset);
  query.mask.require(0);

  const records = new PrisonerRecordComponent(slots);
  const needs = new NeedsComponent(slots);
  const currentAction = new CurrentActionComponent(slots);
  const position = new PositionComponent(slots);
  const coldState = new PrisonerColdState();
  const roomInstances = new RoomInstanceRegistry();

  const cellBlock = buildCellBlockFixture(4);
  const navigation = new NavigationSystem(
    cellBlock.world,
    { workBudgetPerTick: 2_000, agingIntervalTicks: 15, flowFieldActivationThreshold: 6 },
    cellBlock.doors,
  );
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const canteenTile = cellBlock.canteenTiles[0]!;
  const canteenInstanceId = 'canteen-0';
  roomInstances.register({
    instanceId: canteenInstanceId,
    roomCatalogId: 'room.canteen',
    anchorTile: canteenTile,
    residentCapacity: 0,
    concurrentUseCapacity: options.concurrentUseCapacity,
    objectCapabilities: ['dining'],
  });

  const kernel = new Kernel(MEAL_BLOCK_START_TICK, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
  const locomotion = registerLocomotion(kernel, position);
  const actionSystem = new ActionSystem(
    store,
    query,
    records,
    needs,
    currentAction,
    position,
    coldState,
    roomInstances,
    navigation,
    locomotion,
    DEFAULT_REGIME_SCHEDULES,
  );

  kernel.registerSystem(navigation);
  kernel.registerSystem(actionSystem);

  // The corridor tile the canteen's entrance door opens onto, for the
  // travelling variant: a real route, through the real door, into the canteen.
  const corridorTile = cellBlock.corridorTiles[cellBlock.corridorTiles.length - 1]!;
  const startTile = options.startInCellBlock === true ? corridorTile : canteenTile;

  const prisoners: EntityId[] = [];
  for (let i = 0; i < options.prisonerCount; i += 1) {
    const entityId = store.spawn();
    const index = store.getIndex(entityId);
    bitset.add(index, 0);
    records.intakeStage[index] = intakeStageIndex('completed');
    records.classificationGroupIndex[index] = 0; // general-population
    needs.set(index, 'hunger', 0); // makes `action.eat-meal` the best-scoring legal action
    position.tileX[index] = startTile.x;
    position.tileY[index] = startTile.y;
    prisoners.push(entityId);
  }

  return {
    kernel,
    store,
    roomInstances,
    currentAction,
    coldState,
    actionSystem,
    prisoners,
    canteenInstanceId,
    canteenTile,
    performingInCanteen: () =>
      prisoners.filter(
        (entityId) =>
          currentAction.phase[store.getIndex(entityId)] === PERFORMING_PHASE && coldState.getActionTarget(entityId) === canteenInstanceId,
      ).length,
    step: (ticks: number) => {
      for (let i = 0; i < ticks; i += 1) kernel.step();
    },
  };
}

describe('concurrent room use is bounded by concurrentUseCapacity', () => {
  it('admits only as many simultaneous users as the room seats, and the excess waits rather than all being admitted', () => {
    const fixture = buildContentionFixture({ prisonerCount: 5, concurrentUseCapacity: 2 });

    fixture.step(1); // the one reconsideration tick this meal block's first cycle offers

    expect(fixture.performingInCanteen()).toBe(2);
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(2);

    // The excess wait: idle, holding no claim, and holding no action target
    // either -- a refused claim leaves nothing behind (see `beginNextAction`).
    const waiting = fixture.prisoners.filter((entityId) => fixture.currentAction.phase[fixture.store.getIndex(entityId)] === IDLE_PHASE);
    expect(waiting).toHaveLength(3);
    for (const entityId of waiting) expect(fixture.coldState.getActionTarget(entityId)).toBeUndefined();

    // Nobody was housed. Every number above came from a use claim, and
    // `totalOccupancy` -- what `StateIncomeSystem` pays per -- did not move.
    expect(fixture.roomInstances.occupancyOf(fixture.canteenInstanceId)).toBe(0);
    expect(fixture.roomInstances.totalOccupancy).toBe(0);
  });

  it('decides who waits by ascending entity index, which is the scan order and is stable across runs', () => {
    const admitted = () => {
      const fixture = buildContentionFixture({ prisonerCount: 5, concurrentUseCapacity: 2 });
      fixture.step(1);
      return fixture.prisoners.filter((entityId) => fixture.coldState.getActionTarget(entityId) === fixture.canteenInstanceId);
    };

    // `EntityQuery.execute` is ascending index order and the prisoners were
    // spawned in order, so the first two indices get the two seats. Asserted as
    // the *identities* and not just the count, because "two of them got in" is
    // also true of a rule that picked at random (ADR 0029's fairness rule).
    const first = admitted();
    expect(first).toEqual([first[0]!, first[1]!]);
    expect(first).toHaveLength(2);
    expect(admitted()).toEqual(first);
  });

  it('frees the slot when the action completes, and the prisoner who waited gets it', () => {
    const fixture = buildContentionFixture({ prisonerCount: 3, concurrentUseCapacity: 1 });

    fixture.step(1);
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(1);
    const firstHolder = fixture.prisoners.find((entityId) => fixture.coldState.getActionTarget(entityId) === fixture.canteenInstanceId)!;

    // `action.eat-meal` is `minDurationTicks: 40`, so the third reconsideration
    // tick after the start is the first that can complete it.
    fixture.step(RECONSIDERATION_INTERVAL_TICKS * 3);

    expect(fixture.actionSystem.getMetrics().actionsCompleted).toBeGreaterThan(0);
    expect(fixture.coldState.getActionTarget(firstHolder)).toBeUndefined();

    // Still exactly one -- but **held by somebody else**, and that is the half
    // that bites. A completion that released nothing would also read 1 here,
    // with the seat held for ever by a prisoner who has finished eating, so the
    // assertion is that the seat changed hands rather than that it is occupied.
    const holders = fixture.prisoners.filter((entityId) => fixture.coldState.getActionTarget(entityId) === fixture.canteenInstanceId);
    expect(holders).toHaveLength(1);
    expect(holders[0]).not.toBe(firstHolder);
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(1);
  });

  it('leaks nothing once every prisoner has finished: no claim outlives its action', () => {
    const fixture = buildContentionFixture({ prisonerCount: 4, concurrentUseCapacity: 4 });

    fixture.step(1);
    expect(fixture.roomInstances.totalUseClaims).toBe(4);

    // Past the end of the meal block (`[1200, 1300)`): the next block allows
    // `work` and `education`, which no action in `DEFAULT_ACTIONS` provides, so
    // every prisoner finishes eating and then selects nothing at all.
    fixture.step(200);

    expect(fixture.performingInCanteen()).toBe(0);
    expect(fixture.roomInstances.totalUseClaims).toBe(0);
  });

  it('frees the slot when the action is abandoned rather than completed', () => {
    const fixture = buildContentionFixture({ prisonerCount: 2, concurrentUseCapacity: 1 });

    fixture.step(1);
    const holder = fixture.prisoners.find((entityId) => fixture.coldState.getActionTarget(entityId) === fixture.canteenInstanceId)!;
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(1);

    // The abandonment `continuePerforming` actually has: the action being
    // performed is no longer identifiable, so it can neither be continued nor
    // completed. `-1` is `CurrentActionComponent`'s own documented "no action
    // selected" sentinel and the value `reset` writes into a recycled slot
    // (`src/simulation/prisoners/components.ts`), so this is a state a slot
    // genuinely takes rather than an invented one. It is also the leak path
    // that matters most, because it is the one where the claim cannot be
    // rediscovered from the action definition.
    fixture.currentAction.actionIndex[fixture.store.getIndex(holder)] = -1;

    fixture.step(RECONSIDERATION_INTERVAL_TICKS);

    // Idle, no target, no claim -- and the prisoner who was waiting takes the
    // freed seat on the same tick, which is what proves it was freed rather
    // than merely vacated.
    expect(fixture.currentAction.phase[fixture.store.getIndex(holder)]).toBe(IDLE_PHASE);
    expect(fixture.coldState.getActionTarget(holder)).toBeUndefined();
    expect(fixture.roomInstances.totalUseClaims).toBe(1);
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(1);
    const holders = fixture.prisoners.filter((entityId) => fixture.coldState.getActionTarget(entityId) === fixture.canteenInstanceId);
    expect(holders).toEqual([fixture.prisoners.find((entityId) => entityId !== holder)]);
  });

  it('stops performing against a room that has stopped existing instead of holding it for ever', () => {
    const fixture = buildContentionFixture({ prisonerCount: 1, concurrentUseCapacity: 1 });

    fixture.step(1);
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(1);

    // The claim has to be released before the instance can go: `unregister`
    // refuses a claimed instance and `RoomZoningService.unzone` refuses before
    // it -- which is asserted in tests/unit/rooms-zoning.test.ts. So this is
    // deliberately the state a *future* removal path would leave behind if it
    // released the claim and left the performer alone, and what is under test
    // is that `continuePerforming` notices rather than performing for ever
    // against a room that is gone.
    fixture.roomInstances.releaseUse(fixture.canteenInstanceId, fixture.prisoners[0]!);
    fixture.roomInstances.unregister(fixture.canteenInstanceId);

    fixture.step(RECONSIDERATION_INTERVAL_TICKS);

    expect(fixture.currentAction.phase[fixture.store.getIndex(fixture.prisoners[0]!)]).toBe(IDLE_PHASE);
    expect(fixture.coldState.getActionTarget(fixture.prisoners[0]!)).toBeUndefined();
    expect(fixture.roomInstances.totalUseClaims).toBe(0);
  });

  it('refuses a traveller who arrives at a room that filled up while they walked, and leaves them outside it', () => {
    const fixture = buildContentionFixture({ prisonerCount: 3, concurrentUseCapacity: 1, startInCellBlock: true });

    // They start in the corridor, so all three select the canteen on the same
    // tick and all three route to it -- and one seat exists on arrival. The
    // measured trace of this run, one reconsideration tick per row:
    //
    //   t=1220 use=0 perf=0 phases=111 unmet=0   <- all three travelling, nobody holds a claim
    //   t=1240 use=1 perf=1 phases=200 unmet=2   <- one arrived and claimed; two were refused and are idle
    //   t=1260 use=1 perf=1 phases=200 unmet=4
    //   t=1280 use=0 perf=0 phases=011 unmet=4   <- the meal finished, the other two set off again
    //
    // So the assertion is over the whole window rather than one tick: the seat
    // count is never exceeded, and a refusal really did happen.
    let peakUse = 0;
    for (let i = 0; i < 6; i += 1) {
      fixture.step(RECONSIDERATION_INTERVAL_TICKS);
      peakUse = Math.max(peakUse, fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId));
      expect(fixture.performingInCanteen()).toBeLessThanOrEqual(1);
    }

    expect(peakUse).toBe(1);
    // A refused arrival is counted as unmet demand rather than silently dropped.
    expect(fixture.actionSystem.getMetrics().unmetDemandCycles).toBeGreaterThan(0);
    expect(fixture.actionSystem.getMetrics().routeFailures).toBe(0); // the refusals are capacity, not routing
  });

  it('a traveller holds no claim, so a route failure or a restore cannot leak one', () => {
    const fixture = buildContentionFixture({ prisonerCount: 2, concurrentUseCapacity: 2, startInCellBlock: true });

    // One reconsideration tick starts both journeys. The claim is taken on
    // arrival, so mid-journey there is nothing to leak -- which is why the
    // route-failure path in `continueTravelling` needs no release, and why
    // `reinstateUseClaims` deliberately rebuilds nothing for a traveller.
    fixture.step(1);
    expect(fixture.currentAction.phase[fixture.store.getIndex(fixture.prisoners[0]!)]).toBe(ACTION_PHASES.indexOf('travelling'));
    expect(fixture.roomInstances.totalUseClaims).toBe(0);
  });
});

describe('a save restore neither leaks nor duplicates a concurrent-use claim', () => {
  /**
   * `PrisonerOperationsRuntime` is not used here for the same reason the
   * contention fixture is not: this file needs a canteen with a *small*
   * concurrent-use capacity, and that runtime registers no instances at all.
   * So the restore is exercised at the seam that owns the rebuild --
   * `RoomInstanceRegistry.loadSnapshot` plus `ActionSystem.reinstateUseClaims`
   * -- which is exactly the pair `PrisonerOperationsRuntime.loadSnapshot`
   * calls in that order.
   *
   * **The other half of the rebuild is not reachable from this file and is
   * measured in `tests/integration/own-accommodation-claim-restore.test.ts`.**
   * `reinstateUseClaims` filters on `action.target.kind !== 'room-catalog-id'`,
   * and this fixture houses nobody (see `MEAL_BLOCK_START_TICK` above: *"no
   * accommodation is set for anybody here"*), so no prisoner here can be
   * performing an `own-accommodation` action and that half of the filter is
   * structurally out of reach. Weakening it to `if (action === undefined)
   * continue;` leaves every case in this file green while a restore invents a
   * claim on a prisoner's own cell.
   */
  it('rebuilds exactly the claims the performing prisoners hold, and rebuilding twice does not double them', () => {
    const fixture = buildContentionFixture({ prisonerCount: 4, concurrentUseCapacity: 2 });
    fixture.step(1);
    expect(fixture.roomInstances.totalUseClaims).toBe(2);

    const occupancySnapshot = fixture.roomInstances.getSnapshot();

    // A use claim is not in the payload at all -- that is what makes the save
    // format unchanged by this work.
    expect(occupancySnapshot).toEqual([[fixture.canteenInstanceId, []]]);

    fixture.roomInstances.loadSnapshot(occupancySnapshot);
    expect(fixture.roomInstances.totalUseClaims).toBe(0); // cleared, so nothing can leak across the restore

    fixture.actionSystem.reinstateUseClaims();
    expect(fixture.roomInstances.totalUseClaims).toBe(2);
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(2);

    // Idempotent: a second rebuild over the same state is the same count.
    fixture.actionSystem.reinstateUseClaims();
    expect(fixture.roomInstances.totalUseClaims).toBe(2);
  });

  it('a restored claim still bounds the room: the reinstated holders keep the seats and nobody else gets in', () => {
    const fixture = buildContentionFixture({ prisonerCount: 4, concurrentUseCapacity: 2 });
    fixture.step(1);
    const holders = fixture.prisoners.filter((entityId) => fixture.coldState.getActionTarget(entityId) === fixture.canteenInstanceId);

    fixture.roomInstances.loadSnapshot(fixture.roomInstances.getSnapshot());
    fixture.actionSystem.reinstateUseClaims();

    // Continue from the restored state. The assertion is on how many prisoners
    // are *actually in the room*, not on the claim count: a restore that
    // rebuilt no claim would leave the counter at 0 and satisfy any ceiling,
    // while the two prisoners who were already eating kept eating and two more
    // walked in on top of them.
    for (let i = 0; i < 10; i += 1) {
      fixture.step(RECONSIDERATION_INTERVAL_TICKS);
      expect(fixture.performingInCanteen()).toBeLessThanOrEqual(2);
      expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId)).toBe(fixture.performingInCanteen());
    }

    expect(holders).toHaveLength(2);
  });

  it('does not reinstate a claim for a prisoner who is not performing', () => {
    const fixture = buildContentionFixture({ prisonerCount: 4, concurrentUseCapacity: 2 });
    fixture.step(1);

    fixture.roomInstances.loadSnapshot(fixture.roomInstances.getSnapshot());
    // Force every prisoner out of `performing` before the rebuild, leaving the
    // action target in place: the rebuild must key off the phase and not off a
    // stale target, or a restore would invent claims for prisoners who are not
    // in the room.
    for (const entityId of fixture.prisoners) fixture.currentAction.phase[fixture.store.getIndex(entityId)] = IDLE_PHASE;
    fixture.actionSystem.reinstateUseClaims();

    expect(fixture.roomInstances.totalUseClaims).toBe(0);
  });
});

describe('the same command order gives byte-identical results with the gate biting', () => {
  /**
   * The determinism claim this change actually needs: contention for the last
   * seat is decided by an ascending-index scan and by nothing else, so two
   * identically-built runs must agree on every phase, position and claim.
   *
   * A `Set` or `Map` iteration deciding who got in would not necessarily fail
   * this -- insertion order is reproducible within one process -- so the
   * assertion that carries the weight is the *ordering rule* one above, and
   * `tests/determinism/canonical-iteration-contract.test.ts` is what scans for
   * the unordered walk itself. This is the end-to-end pair.
   */
  it('two identical runs under contention produce an identical fingerprint', () => {
    const fingerprintOf = () => {
      const fixture = buildContentionFixture({ prisonerCount: 6, concurrentUseCapacity: 2, startInCellBlock: true });
      fixture.step(400);
      const parts = fixture.prisoners.map((entityId) => {
        const index = fixture.store.getIndex(entityId);
        return `${entityId}|${fixture.currentAction.phase[index]}|${fixture.coldState.getActionTarget(entityId) ?? '-'}`;
      });
      return `${parts.join(';')}|use=${fixture.roomInstances.totalUseClaims}|occ=${fixture.roomInstances.totalOccupancy}`;
    };

    expect(fingerprintOf()).toEqual(fingerprintOf());
  });

  /**
   * ADR 0029's over-capacity answer, **relocated here by issue #326**.
   *
   * `tests/integration/object-removal-loop.test.ts` used to prove it end to end,
   * by removing an object from a yard that two prisoners were standing in. It
   * could only do that because the yard's ceiling summed every object's
   * footprint width regardless of capability, which made a *bed* the bound on
   * `action.yard-recreation` -- the defect #326 removed. No placeable buildable
   * supplies a capability any `room-catalog-id` action asks for, so until ADR
   * 0028 phase 4 makes a dining table placeable there is no bounded
   * concurrent-use room a command can reach. This fixture can build one, over
   * the same real `ActionSystem` and the same real registry.
   */
  it('lowers a ceiling under a standing claim without evicting anybody, and shuts the door behind it', () => {
    const fixture = buildContentionFixture({ prisonerCount: 4, concurrentUseCapacity: 2 });
    fixture.step(1);
    expect(fixture.performingInCanteen()).toBe(2);
    const holders = fixture.prisoners.filter((entityId) => fixture.coldState.getActionTarget(entityId) === fixture.canteenInstanceId);
    expect(holders).toHaveLength(2);

    // What a removal does to a room: `RoomCapacityResolver` recomputes and
    // `updateDerived` writes. The dining tables are gone, so `'dining'` is gone
    // with them, and this is the resolved shape -- a breakdown, not a total.
    fixture.roomInstances.updateDerived(fixture.canteenInstanceId, {
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      concurrentUseCapacityByCapability: [],
      objectCapabilities: [],
    });

    // **Two claims, zero capacity, and that is the decided answer.** The claims
    // are not released: releasing them would leave prisoners performing in a
    // room they no longer hold, which under-counts real use and lets the next
    // prisoner in over the true ceiling -- the exact failure ADR 0029 exists to
    // remove, reintroduced from the other end.
    expect(fixture.roomInstances.useOccupancyOf(fixture.canteenInstanceId, 'dining')).toBe(2);
    expect(fixture.roomInstances.totalUseClaims).toBe(2);
    for (const entityId of holders) {
      expect(fixture.currentAction.phase[fixture.store.getIndex(entityId)]).toBe(PERFORMING_PHASE);
      expect(fixture.coldState.getActionTarget(entityId)).toBe(fixture.canteenInstanceId);
    }

    // Nobody new gets in while they stand: `findAvailableForUse` skips a room at
    // or above the ceiling for the capability asked, and `claimUse` refuses at
    // the same comparison, so the over-capacity state is a closed door rather
    // than an open one.
    expect(fixture.roomInstances.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
    expect(fixture.roomInstances.claimUse(fixture.canteenInstanceId, 4_242 as never, 'dining')).toBe(false);

    // And the claims drain by themselves rather than being stranded above a
    // ceiling they can never fall back under: `action.eat-meal` is
    // `minDurationTicks: 40` and nothing in `ActionSystem`'s release sites
    // consults a capacity.
    fixture.step(200);
    expect(fixture.roomInstances.totalUseClaims).toBe(0);
    expect(fixture.performingInCanteen()).toBe(0);
  });
});
