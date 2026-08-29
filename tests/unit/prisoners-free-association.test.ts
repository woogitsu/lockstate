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
import { NEED_IDS, NEED_MAX, NeedsComponent } from '../../src/simulation/prisoners/needs';
import { DAY_LENGTH_TICKS, DEFAULT_REGIME_SCHEDULES, type RegimeSchedule } from '../../src/simulation/prisoners/regime';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { isActionCategoryAllowed, rankActions, scoreAction } from '../../src/simulation/prisoners/utility-ai';
import { buildRiotRegimeSchedule, RIOT_ALLOWED_CATEGORIES } from '../../src/simulation/incidents/riot-regime';
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
 * # `action.free-association`, driven through the real `ActionSystem`
 *
 * [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * decision 1: *"Give `free-association` an action, so the riot regime
 * terminates."*
 *
 * `tests/unit/incident-escape-riot.test.ts` proves the riot schedule is gapless
 * and allows the two categories it says it allows. What it cannot say is what a
 * prisoner *does* under it, because it never builds one — and the answer used
 * to be "nothing at all": both `recreation` actions target a zoned room, so in
 * a prison with no yard and no common room `beginNextAction` filtered
 * `DEFAULT_ACTIONS` down to two candidates, resolved neither, and fell through
 * to `unmetDemandCycles` on every reconsideration of every day the riot lasted.
 *
 * These tests step the real kernel with the real `NavigationSystem` and the
 * real riot schedule, and they are deliberately *unit*-scale.
 *
 * **The reason they were unit-scale has been withdrawn, and the scale is kept
 * anyway.** This paragraph used to read: "the riot regime has no producer in
 * `src/` (`applyRiotRegimeOverride` is called from tests alone, and
 * `ActionSystem.regimeSchedules` is a `readonly` constructor field with no
 * setter), so an integration test that provoked one would be asserting against
 * a state a session cannot reach." Since
 * [ADR 0057](../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md) a
 * session does reach it, and
 * `tests/integration/riot-regime-loop.test.ts` provokes a real riot through
 * real commands and measures the day either side of it. What these cases are
 * for is the *candidate walk* under the riot block — a prison built by hand so
 * that exactly one candidate can resolve — which an integration fixture cannot
 * isolate. `applyRiotRegimeOverride` was deleted by that ADR; the array below
 * is built from `buildRiotRegimeSchedule` directly, which is what it did.
 */

const RNG_STREAM = 'prisoners.classification';

const RIOT_SCHEDULES: readonly RegimeSchedule[] = DEFAULT_REGIME_SCHEDULES.map((schedule) =>
  schedule.classificationGroupId === 'general-population' ? buildRiotRegimeSchedule(schedule.classificationGroupId) : schedule,
);

interface AssociationFixture {
  readonly kernel: Kernel;
  readonly entityId: number;
  readonly index: number;
  readonly currentAction: CurrentActionComponent;
  readonly coldState: PrisonerColdState;
  readonly roomInstances: RoomInstanceRegistry;
  readonly actionSystem: ActionSystem;
  readonly needs: NeedsComponent;
}

/**
 * One housed prisoner standing on their own cell's anchor tile, under whichever
 * schedule array the caller passes.
 *
 * Standing on the anchor takes `beginNextAction`'s `sameTile` path, so a
 * resolved `own-accommodation` candidate reaches `performing` inside one
 * reconsideration and what is measured is the candidate walk rather than who
 * finished routing first — the same reason `prisoners-action-system.test.ts`
 * places its fallback fixture that way.
 *
 * The cell carries `sleep-surface` and `sanitation` because a real
 * `room.cell` requires a bed and a toilet; leaving them off would make the
 * prison easier to serve than any prison a player can build.
 */
function buildAssociationFixture(options: {
  readonly schedules: readonly RegimeSchedule[];
  readonly startTick: number;
  readonly withYard?: boolean;
}): AssociationFixture {
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
  const navigation = new NavigationSystem(
    cellBlock.world,
    { workBudgetPerTick: 2_000, agingIntervalTicks: 15, flowFieldActivationThreshold: 6 },
    cellBlock.doors,
  );
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const cellTile = cellBlock.cellTiles[0]!;
  roomInstances.register({
    instanceId: 'cell-0',
    roomCatalogId: 'room.cell',
    anchorTile: cellTile,
    residentCapacity: 1,
    concurrentUseCapacity: 2,
    objectCapabilities: ['sleep-surface', 'sanitation'],
  });
  if (options.withYard === true) {
    roomInstances.register({
      instanceId: 'yard-0',
      roomCatalogId: 'room.yard',
      // The open-area tag `RoomZoningService.zone` would have carried onto a
      // real yard (owner's ruling of 2026-08-29, #585).
      openArea: true,
      anchorTile: cellBlock.canteenTiles[0]!,
      residentCapacity: 0,
      concurrentUseCapacity: 8,
      objectCapabilities: [],
    });
  }

  const kernel = new Kernel(options.startTick, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
  const locomotion = registerLocomotion(kernel, position);
  const actionSystem = new ActionSystem(
    store, query, records, needs, currentAction, position, substitutions, coldState, roomInstances, navigation, locomotion, options.schedules,
  );
  kernel.registerSystem(navigation);
  kernel.registerSystem(actionSystem);

  const entityId = store.spawn();
  const index = store.getIndex(entityId);
  bitset.add(index, 0);
  records.intakeStage[index] = intakeStageIndex('completed');
  records.classificationGroupIndex[index] = 0; // general-population
  coldState.setAccommodation(entityId, 'cell-0');
  position.tileX[index] = cellTile.x;
  position.tileY[index] = cellTile.y;

  return { kernel, entityId, index, currentAction, coldState, roomInstances, actionSystem, needs };
}

const actionOf = (fixture: AssociationFixture): string | undefined => {
  const actionIndex = fixture.currentAction.actionIndex[fixture.index]!;
  return actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex]!.id : undefined;
};

const phaseOf = (fixture: AssociationFixture): string => ACTION_PHASES[fixture.currentAction.phase[fixture.index]!]!;

describe('a rioting prisoner in a prison with no yard and no common room', () => {
  it('has exactly one candidate that can resolve, and it is the appended one', () => {
    // The precondition, derived from the real riot block rather than asserted
    // about it. Three actions are legal; two name rooms this prison has not
    // zoned. Before `action.free-association` existed this list held two
    // entries and the intersection with "can resolve here" was empty.
    const legal = DEFAULT_ACTIONS.filter((action) => isActionCategoryAllowed(action, RIOT_ALLOWED_CATEGORIES));
    expect(legal.map((action) => action.id).sort()).toEqual([
      'action.common-room-recreation',
      'action.free-association',
      'action.yard-recreation',
    ]);
    expect(legal.filter((action) => action.target.kind === 'own-accommodation').map((action) => action.id)).toEqual([
      'action.free-association',
    ]);
  });

  it('associates on the first reconsideration instead of standing idle', () => {
    const fixture = buildAssociationFixture({ schedules: RIOT_SCHEDULES, startTick: 600 });
    // An empty recreation bar, so the two room-gated candidates strictly
    // outscore the appended one and it is reached through ADR 0041's fallback
    // walk rather than through `rankActions`' tie-break. A fixture that left
    // every need at `NEED_MAX` would make all three score 0 and would be
    // measuring the tie-break instead.
    fixture.needs.set(fixture.index, 'recreation', 0);

    // Neither recreation room exists, asserted rather than assumed.
    expect(fixture.roomInstances.findAvailableForUse('room.yard', undefined)).toBeUndefined();
    expect(fixture.roomInstances.findAvailableForUse('room.common-room', 'recreation')).toBeUndefined();

    fixture.kernel.step(); // one reconsideration, and only one

    expect(actionOf(fixture)).toBe('action.free-association');
    expect(phaseOf(fixture)).toBe('performing');
    expect(fixture.coldState.getActionTarget(fixture.entityId)).toBe('cell-0');
    expect(fixture.actionSystem.getMetrics()).toMatchObject({ actionsStarted: 1, unmetDemandCycles: 0 });
  });

  it('stays occupied for a whole riot day, which is the day it used to stand through', () => {
    /*
     * The riot schedule is a single full-day block, so this is 120
     * reconsiderations of the same filter — every one of which previously
     * resolved nothing and counted an unmet cycle. `unmetDemandCycles` is
     * documented as "no legal action had a reachable, available target", so
     * zero across the day is the statement that the regime now terminates on
     * every cycle rather than on the first.
     */
    const fixture = buildAssociationFixture({ schedules: RIOT_SCHEDULES, startTick: 0 });
    fixture.needs.set(fixture.index, 'recreation', 0);
    for (let tick = 0; tick < DAY_LENGTH_TICKS; tick += 1) fixture.kernel.step();

    const metrics = fixture.actionSystem.getMetrics();
    expect(metrics.unmetDemandCycles).toBe(0);
    expect(metrics.routeFailures).toBe(0);
    /*
     * **30, not 40, and the difference is a fact about every action in this
     * catalogue rather than about this one.** `continuePerforming` completes at
     * `elapsed >= minDurationTicks` and drops the prisoner to `idle`; the next
     * action is selected on the *following* reconsideration, so one 60-tick
     * performance occupies 60 ticks plus one 20-tick cadence step, and
     * 2,400 / 80 = 30. Exact, because nothing on this path draws.
     */
    expect(metrics.actionsCompleted).toBe(30);
    expect(metrics.actionsStarted).toBe(30);
    expect(actionOf(fixture)).toBe('action.free-association');
  });

  it('takes the yard instead when there is one, so association is a fallback and not a replacement', () => {
    const fixture = buildAssociationFixture({ schedules: RIOT_SCHEDULES, startTick: 600, withYard: true });
    fixture.needs.set(fixture.index, 'recreation', 0);

    fixture.kernel.step();

    // `action.yard-recreation` restores `recreation` and `safety`; the appended
    // entry restores nothing and therefore scores zero, which is the minimum a
    // candidate can score. The yard is not on this prisoner's tile, so
    // preferring it is a journey — the observable difference from the case
    // above.
    expect(actionOf(fixture)).toBe('action.yard-recreation');
    expect(phaseOf(fixture)).toBe('travelling');
  });
});

describe('associating never displaces an action that would fulfil something', () => {
  it('scores exactly zero in every need state, and therefore never outranks a candidate that would fulfil something', () => {
    /*
     * The invariant that makes appending a no-need action to a *live*
     * catalogue safe, and the reason this entry could be added without
     * re-baselining a single existing measurement.
     *
     * `scoreAction` sums `deficit x effect` over the action's **own** effects,
     * every authored effect is positive and every deficit is non-negative — so
     * an action declaring no effects scores exactly 0 for any need vector
     * whatsoever, which is the floor. Stated over the whole catalogue rather
     * than over the riot's three candidates, because the riot's other two are
     * recreation actions with strictly larger recreation effects and would
     * therefore outrank the appended entry even if it *did* fulfil something —
     * a scope in which this assertion cannot fail is a scope in which it says
     * nothing.
     */
    const needs = new NeedsComponent(4);
    const association = DEFAULT_ACTIONS.find((action) => action.id === 'action.free-association')!;

    for (const level of [NEED_MAX, 224, 192, 128, 64, 32, 0]) {
      for (const needId of NEED_IDS) needs.set(0, needId, level);

      expect(scoreAction(needs, 0, association), `every need at ${level}`).toBe(0);

      const ranked = rankActions(needs, 0, DEFAULT_ACTIONS);
      const scoringPositively = ranked.filter((action) => scoreAction(needs, 0, action) > 0).length;
      const place = ranked.findIndex((action) => action.id === 'action.free-association');
      expect(
        place,
        `every need at ${level}: ${scoringPositively} candidates address an unmet need and association is ranked ${place}`,
      ).toBeGreaterThanOrEqual(scoringPositively);
    }
  });

  it('is chosen over a redundant one only when every legal alternative is already full', () => {
    // The one state in which it wins: every competing need at `NEED_MAX`, so
    // every score is 0 and `rankActions` falls through to its ascending-id
    // tie-break. Nothing is lost — there is no deficit for the alternatives to
    // close — and a prisoner with nothing they need doing the unstructured
    // thing is the reading the category was named for.
    const needs = new NeedsComponent(4);
    const legal = DEFAULT_ACTIONS.filter((action) => isActionCategoryAllowed(action, RIOT_ALLOWED_CATEGORIES));
    const ranked = rankActions(needs, 0, legal).map((action) => action.id);

    expect(ranked).toEqual(['action.common-room-recreation', 'action.free-association', 'action.yard-recreation']);
  });
});

describe('what the HUD is told about a prisoner who is associating', () => {
  it('does not advance needFulfilledLastTick, because no need was fulfilled', () => {
    /*
     * `projectPrisonerDetail` publishes `needFulfilledLastTick` verbatim
     * (`presentation/prisoner-projection.ts`), so a stamp taken for an action
     * with no need effects would be the simulation telling a player something
     * it did not do. `continuePerforming` asks `applyNeedEffects` whether it
     * applied anything rather than assuming it did.
     */
    const fixture = buildAssociationFixture({ schedules: RIOT_SCHEDULES, startTick: 600 });
    for (let tick = 0; tick < 200; tick += 1) fixture.kernel.step();

    expect(actionOf(fixture)).toBe('action.free-association');
    expect(fixture.currentAction.needFulfilledLastTick[fixture.index]).toBe(0);
  });

  it('still advances it for an action that does fulfil something', () => {
    // The positive control. Without it the assertion above passes for a
    // simulation that never stamps the field at all — which is the mutation
    // most likely to be made here by accident.
    const fixture = buildAssociationFixture({ schedules: DEFAULT_REGIME_SCHEDULES, startTick: 0 }); // [0, 400) is sleep-only
    for (let tick = 0; tick < 200; tick += 1) fixture.kernel.step();

    expect(actionOf(fixture)).toBe('action.sleep');
    expect(fixture.currentAction.needFulfilledLastTick[fixture.index]).toBeGreaterThan(0);
  });
});
