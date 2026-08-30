import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore, type EntityId } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import { LocomotionStore, LocomotionSystem } from '../../src/simulation/locomotion';
import { OPEN_GROUND } from '../helpers/open-ground';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { ActionSystem } from '../../src/simulation/prisoners/action-system';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import {
  ACTION_PHASES,
  CurrentActionComponent,
  PositionComponent,
  PrisonerColdState,
  PrisonerRecordComponent,
  SubstitutionRecordComponent,
  intakeStageIndex,
} from '../../src/simulation/prisoners/components';
import { NEED_MAX, NeedsComponent } from '../../src/simulation/prisoners/needs';
import { DEFAULT_REGIME_SCHEDULES } from '../../src/simulation/prisoners/regime';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';
import { firstProvidedCandidateIndex, needUrgency, rankActions, urgencyOfProvidedCandidate } from '../../src/simulation/prisoners/utility-ai';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';

/**
 * Issue #435, the unit half: **what a substitution is, and what tells one kind
 * from the other.**
 *
 * `tests/integration/contended-canteen-substitution-cost.test.ts` is the run
 * that shows the counter naming the right twelve prisoners in a real contended
 * prison over twelve in-game days. This file pins the three outcomes one
 * prisoner can have in one reconsideration cycle, in a prison small enough that
 * each is arranged rather than waited for:
 *
 * | the prison | what the prisoner does | what is counted |
 * | --- | --- | --- |
 * | a canteen with a free place | eats there | nothing |
 * | a canteen with every place taken | eats in their cell | a **contended** substitution |
 * | no canteen at all | eats in their cell | a substitution, **not** contended |
 * | no canteen and no cell | nothing | `unmetDemandCycles`, and no substitution |
 *
 * The last two rows are issue #435's own required verification, in its words:
 * *"a prison with no canteen (substitution, not unmet) and a prison with no
 * canteen and no bed (unmet)"*. They are the pair a fixture cannot satisfy by
 * accident, because the two counters have to move in opposite directions on
 * inputs that differ by one registry entry.
 *
 * Every fixture here stands the prisoners **on the canteen's anchor tile**, for
 * the reason `prisoners-concurrent-room-use.test.ts` gives: it takes
 * `ActionSystem`'s `sameTile` path, so the cycle resolves inside one tick and
 * what is counted is a function of the capacity gate rather than of who
 * finished routing first.
 */

const RNG_STREAM = 'prisoners.classification';
/** Tick-of-day 1,200 opens `GENERAL_POPULATION_REGIME`'s midday block, whose only allowed category is `meal` -- so the ranked candidate list is exactly `[action.eat-meal, action.eat-in-cell]`. */
const MEAL_BLOCK_START_TICK = 1_200;
const IDLE_PHASE = ACTION_PHASES.indexOf('idle');
const PERFORMING_PHASE = ACTION_PHASES.indexOf('performing');
const CELL_INSTANCE_ID = 'cell-0';
const CANTEEN_INSTANCE_ID = 'canteen-0';

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

interface Fixture {
  readonly kernel: Kernel;
  readonly store: EntityStore;
  readonly currentAction: CurrentActionComponent;
  readonly substitutions: SubstitutionRecordComponent;
  readonly actionSystem: ActionSystem;
  readonly prisoners: readonly EntityId[];
  readonly actionOf: (entityId: EntityId) => string | undefined;
  readonly countsFor: (entityId: EntityId) => { readonly substituted: number; readonly contended: number };
  readonly step: (ticks: number) => void;
}

function buildFixture(options: {
  readonly prisonerCount: number;
  /** `undefined` registers no canteen at all -- a want the prison provides nowhere, rather than one it is out of. */
  readonly diningPlaces: number | undefined;
  /** `false` leaves the prisoners with no accommodation, so `action.eat-in-cell` has nothing to resolve either. */
  readonly housed: boolean;
}): Fixture {
  const slots = options.prisonerCount + 2;
  const store = new EntityStore(slots);
  const bitset = new ComponentBitset(slots);
  const query = new EntityQuery(store, bitset);
  query.mask.require(0);

  const records = new PrisonerRecordComponent(slots);
  const needs = new NeedsComponent(slots);
  const currentAction = new CurrentActionComponent(slots);
  const position = new PositionComponent(slots);
  const substitutions = new SubstitutionRecordComponent(slots);
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
  roomInstances.register({
    instanceId: CELL_INSTANCE_ID,
    roomCatalogId: 'room.cell',
    anchorTile: cellBlock.cellTiles[0]!,
    residentCapacity: options.prisonerCount,
    concurrentUseCapacity: options.prisonerCount,
    objectCapabilities: ['sleep-surface', 'sanitation'],
  });
  if (options.diningPlaces !== undefined) {
    roomInstances.register({
      instanceId: CANTEEN_INSTANCE_ID,
      roomCatalogId: 'room.canteen',
      anchorTile: canteenTile,
      residentCapacity: 0,
      concurrentUseCapacity: options.diningPlaces,
      objectCapabilities: ['dining'],
    });
  }

  const kernel = new Kernel(MEAL_BLOCK_START_TICK, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(1, RNG_STREAM) }]));
  const locomotion = registerLocomotion(kernel, position);
  const actionSystem = new ActionSystem(
    store,
    query,
    records,
    needs,
    currentAction,
    position,
    substitutions,
    coldState,
    roomInstances,
    navigation,
    locomotion,
    DEFAULT_REGIME_SCHEDULES,
  );
  kernel.registerSystem(navigation);
  kernel.registerSystem(actionSystem);

  const prisoners: EntityId[] = [];
  for (let n = 0; n < options.prisonerCount; n += 1) {
    const entityId = store.spawn();
    const index = store.getIndex(entityId);
    bitset.add(index, 0);
    records.intakeStage[index] = intakeStageIndex('completed');
    records.classificationGroupIndex[index] = 0; // general-population
    needs.set(index, 'hunger', 0); // makes `action.eat-meal` the best-scoring legal action
    if (options.housed) coldState.setAccommodation(entityId, CELL_INSTANCE_ID);
    position.tileX[index] = canteenTile.x;
    position.tileY[index] = canteenTile.y;
    prisoners.push(entityId);
  }

  return {
    kernel,
    store,
    currentAction,
    substitutions,
    actionSystem,
    prisoners,
    actionOf: (entityId) => {
      const actionIndex = currentAction.actionIndex[store.getIndex(entityId)]!;
      return actionIndex >= 0 ? DEFAULT_ACTIONS[actionIndex]!.id : undefined;
    },
    countsFor: (entityId) => ({
      substituted: substitutions.substitutionCycles[store.getIndex(entityId)]!,
      contended: substitutions.contendedSubstitutionCycles[store.getIndex(entityId)]!,
    }),
    step: (ticks) => {
      for (let n = 0; n < ticks; n += 1) kernel.step();
    },
  };
}

describe('what one reconsideration cycle counts', () => {
  it('counts nothing for a prisoner who gets their first choice', () => {
    const fixture = buildFixture({ prisonerCount: 1, diningPlaces: 2, housed: true });

    fixture.step(1);

    const [only] = fixture.prisoners;
    expect(fixture.actionOf(only!)).toBe('action.eat-meal');
    expect(fixture.currentAction.phase[fixture.store.getIndex(only!)]).toBe(PERFORMING_PHASE);
    expect(fixture.countsFor(only!)).toEqual({ substituted: 0, contended: 0 });
    expect(fixture.actionSystem.getMetrics()).toMatchObject({ substitutionCycles: 0, contendedSubstitutionCycles: 0, unmetDemandCycles: 0 });
  });

  it('counts a contended substitution for the prisoner who is refused the last place, and nothing for the one who took it', () => {
    const fixture = buildFixture({ prisonerCount: 2, diningPlaces: 1, housed: true });

    fixture.step(1);

    const [winner, loser] = fixture.prisoners;
    expect(fixture.actionOf(winner!)).toBe('action.eat-meal');
    expect(fixture.actionOf(loser!), 'refused the seat, so ADR 0041 falls through to the cell meal').toBe('action.eat-in-cell');

    expect(fixture.countsFor(winner!)).toEqual({ substituted: 0, contended: 0 });
    expect(fixture.countsFor(loser!)).toEqual({ substituted: 1, contended: 1 });

    /*
     * **And the whole point of the issue, in one assertion**: the prisoner who
     * was downgraded is a completed, successful cycle by every number that
     * existed before this change.
     */
    expect(fixture.actionSystem.getMetrics()).toMatchObject({
      substitutionCycles: 1,
      contendedSubstitutionCycles: 1,
      unmetDemandCycles: 0,
      actionsStarted: 2,
    });
  });

  it('counts a substitution that is not contended when the prison has no canteen at all', () => {
    const fixture = buildFixture({ prisonerCount: 1, diningPlaces: undefined, housed: true });

    fixture.step(1);

    const [only] = fixture.prisoners;
    expect(fixture.actionOf(only!)).toBe('action.eat-in-cell');
    /*
     * Nobody took this prisoner's seat -- there is no seat. The remedy is
     * *build a canteen*, which is a different sentence from *your canteen is
     * too small*, and the two are the same number without the split.
     */
    expect(fixture.countsFor(only!)).toEqual({ substituted: 1, contended: 0 });
    expect(fixture.actionSystem.getMetrics()).toMatchObject({ substitutionCycles: 1, contendedSubstitutionCycles: 0, unmetDemandCycles: 0 });
  });

  it('counts an unmet cycle and no substitution when nothing resolves, so the two numbers can never both be claimed by one fixture', () => {
    const fixture = buildFixture({ prisonerCount: 1, diningPlaces: undefined, housed: false });

    fixture.step(1);

    const [only] = fixture.prisoners;
    expect(fixture.actionOf(only!), 'no candidate resolved, so nothing was selected').toBeUndefined();
    expect(fixture.currentAction.phase[fixture.store.getIndex(only!)]).toBe(IDLE_PHASE);
    expect(fixture.countsFor(only!)).toEqual({ substituted: 0, contended: 0 });
    expect(fixture.actionSystem.getMetrics()).toMatchObject({ substitutionCycles: 0, contendedSubstitutionCycles: 0, unmetDemandCycles: 1 });
  });

  it('reopens the window at a named tick, dropping the aggregate and the breakdown together', () => {
    const fixture = buildFixture({ prisonerCount: 2, diningPlaces: 1, housed: true });
    fixture.step(1);
    expect(fixture.actionSystem.getMetrics().substitutionCycles).toBe(1);

    fixture.actionSystem.reopenSubstitutionWindow(4_242);

    expect(fixture.actionSystem.getMetrics()).toMatchObject({
      substitutionCycles: 0,
      contendedSubstitutionCycles: 0,
      substitutionsCountedSinceTick: 4_242,
    });
    for (const entityId of fixture.prisoners) expect(fixture.countsFor(entityId)).toEqual({ substituted: 0, contended: 0 });

    // The four older counters are deliberately untouched: issue #435 adds a
    // number and does not redefine `unmetDemandCycles`.
    expect(fixture.actionSystem.getMetrics().actionsStarted).toBe(2);
  });
});

describe('SubstitutionRecordComponent', () => {
  it('keeps the contended count a subset of the total, because one call writes both', () => {
    const component = new SubstitutionRecordComponent(4);

    component.record(1, true);
    component.record(1, false);
    component.record(1, false);

    expect(component.substitutionCycles[1]).toBe(3);
    expect(component.contendedSubstitutionCycles[1]).toBe(1);
    expect(component.substitutionCycles[0], 'only the slot it was given').toBe(0);
  });

  it('saturates rather than wrapping to zero, which is the one failure a diagnostic must not have', () => {
    const component = new SubstitutionRecordComponent(2);
    // `Uint32Array`'s ceiling, written out rather than read from the module
    // under test.
    component.substitutionCycles[0] = 4_294_967_295;
    component.contendedSubstitutionCycles[0] = 4_294_967_295;

    component.record(0, true);

    expect(component.substitutionCycles[0]).toBe(4_294_967_295);
    expect(component.contendedSubstitutionCycles[0]).toBe(4_294_967_295);
  });

  it('clears every slot on `clear` and one slot on `reset`', () => {
    const component = new SubstitutionRecordComponent(3);
    component.record(0, true);
    component.record(2, true);

    component.reset(0);
    expect([component.substitutionCycles[0], component.substitutionCycles[2]]).toEqual([0, 1]);

    component.clear();
    expect([...component.substitutionCycles]).toEqual([0, 0, 0]);
    expect([...component.contendedSubstitutionCycles]).toEqual([0, 0, 0]);
  });
});

describe('the two halves of needUrgency', () => {
  /**
   * `scoreAction` is `deficit x effect` summed over the action's need effects,
   * and the numbers below are worked by hand from `DEFAULT_ACTIONS` rather than
   * read back from it:
   *
   * - hunger at 0 of `NEED_MAX` 255 is a deficit of 255, so `action.eat-meal`
   *   (hunger 4/tick) scores 1,020 and `action.eat-in-cell` (3/tick) scores
   *   765.
   * - every other need is full, so nothing else in the `meal` block scores at
   *   all.
   */
  function mealCandidates(): { readonly needs: NeedsComponent; readonly ranked: readonly { readonly id: string }[] } {
    const needs = new NeedsComponent(1);
    needs.set(0, 'hunger', 0);
    const meals = DEFAULT_ACTIONS.filter((action) => action.category === 'meal');
    return { needs, ranked: rankActions(needs, 0, meals) };
  }

  it('finds the first candidate the prison provides, and scores that one', () => {
    const { needs } = mealCandidates();
    const meals = DEFAULT_ACTIONS.filter((action) => action.category === 'meal');
    const ranked = rankActions(needs, 0, meals);

    expect(ranked.map((action) => action.id)).toEqual(['action.eat-meal', 'action.eat-in-cell']);
    expect(needs.get(0, 'hunger')).toBe(0);
    expect(NEED_MAX).toBe(255);

    const noCanteen = (action: { readonly id: string }): boolean => action.id !== 'action.eat-meal';
    expect(firstProvidedCandidateIndex(ranked, () => true)).toBe(0);
    expect(firstProvidedCandidateIndex(ranked, noCanteen)).toBe(1);
    expect(firstProvidedCandidateIndex(ranked, () => false)).toBe(-1);

    // 255 x 4 and 255 x 3, worked by hand above.
    expect(urgencyOfProvidedCandidate(needs, 0, ranked, 0)).toBe(1_020);
    expect(urgencyOfProvidedCandidate(needs, 0, ranked, 1)).toBe(765);
    expect(urgencyOfProvidedCandidate(needs, 0, ranked, -1)).toBe(0);
  });

  it('composes back into the urgency key ADR 0062 orders the scan by, so the split cannot drift', () => {
    const { needs } = mealCandidates();
    const ranked = rankActions(needs, 0, DEFAULT_ACTIONS.filter((action) => action.category === 'meal'));
    const noCanteen = (action: { readonly id: string }): boolean => action.id !== 'action.eat-meal';

    // The literals, not a re-derivation: the composition is what `needUrgency`
    // now is, so asserting it against `urgencyOfProvidedCandidate` would be the
    // code under test on both sides.
    expect(needUrgency(needs, 0, ranked, () => true)).toBe(1_020);
    expect(needUrgency(needs, 0, ranked, noCanteen)).toBe(765);
    expect(needUrgency(needs, 0, ranked, () => false)).toBe(0);
  });
});
