import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { ContrabandRegistry } from '../../src/simulation/contraband/item';
import { IntelligenceLedger } from '../../src/simulation/contraband/intelligence';
import { ConfiscationLedger } from '../../src/simulation/contraband/confiscation';
import { SearchSystem, type CategoryConcealmentResolver, type TargetLocationResolver } from '../../src/simulation/contraband/search-system';
import type { SearchPolicyDefinition } from '../../src/simulation/contraband/search-policy';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { CONTRABAND_DETECTION_RNG_STREAM } from '../../src/simulation/runtime/new-session';
import type { TilePosition } from '../../src/simulation/world/coordinates';

const CERTAIN_DETECT_POLICY: SearchPolicyDefinition = { scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 1, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 };
const CERTAIN_MISS_POLICY: SearchPolicyDefinition = { scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 0, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 };

function buildHarness(cellCount: number, policies: readonly SearchPolicyDefinition[]) {
  const cellBlock = buildCellBlockFixture(cellCount);
  const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const contraband = new ContrabandRegistry();
  const intelligence = new IntelligenceLedger();
  const confiscations = new ConfiscationLedger();
  const guards = new GuardRoster(64);

  const categoryConcealment: CategoryConcealmentResolver = () => 0;
  const locateTarget: TargetLocationResolver = (target): TilePosition => {
    if (target.holderKind !== 'cell') throw new RangeError('This harness only resolves cell targets.');
    return cellBlock.cellTiles[Number(target.holderId)]!;
  };

  const search = new SearchSystem(guards, navigation, contraband, intelligence, confiscations, policies, categoryConcealment, locateTarget);

  const rng = new NamedRngStreams([{ name: CONTRABAND_DETECTION_RNG_STREAM, state: deriveXoshiroState(7, CONTRABAND_DETECTION_RNG_STREAM) }]);
  const kernel = new Kernel(0, 0, rng);
  kernel.registerSystem(navigation);
  kernel.registerSystem(search);

  return { cellBlock, navigation, contraband, intelligence, confiscations, guards, search, kernel };
}

// Cell indices excluded from `i % 5 === 0` medical-only gating and `i % 7 === 0` closed doors, so a plain guard reaches them without delay.
const OPEN_CELL_INDEX = 1;

describe('SearchSystem: staffing, real navigation, deterministic detection and confiscation', () => {
  it('a search stays queued until enough unassigned guards exist, then completes and confiscates a guaranteed-detected item', () => {
    const { cellBlock, contraband, guards, search, kernel } = buildHarness(6, [CERTAIN_DETECT_POLICY]);
    contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });

    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });
    expect(search.isQueued('search-1')).toBe(true);
    expect(search.getMetrics().searchesQueued).toBe(1);

    kernel.step(); // still no guards -- stays queued
    expect(search.isQueued('search-1')).toBe(true);

    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!); // canteen origin; exact tile irrelevant to staffing

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(search.getMetrics()).toEqual({ itemsDiscovered: 1, itemsMissed: 0, searchesCompleted: 1, searchesCancelled: 0, searchesQueued: 0 });
    expect(contraband.get('item-1')?.state).toBe('confiscated');
    expect(guards.getDeploymentPhase(guards.allGuardIds()[0]!)).toBe('unassigned'); // released after completion
  });

  it('records a typed confiscation event with provenance and search order id', () => {
    const { cellBlock, contraband, confiscations, guards, search, kernel } = buildHarness(6, [CERTAIN_DETECT_POLICY]);
    contraband.introduce('item-1', 'contraband.weapon', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'prisoner', sourceId: '3', introducedAtTick: 2 });
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-evidence', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(confiscations.all()).toEqual([
      {
        itemId: 'item-1',
        categoryId: 'contraband.weapon',
        provenance: { sourceType: 'prisoner', sourceId: '3', introducedAtTick: 2 },
        foundAtHolder: { kind: 'cell', id: String(OPEN_CELL_INDEX) },
        searchOrderId: 'search-evidence',
        foundByGuardId: guards.allGuardIds()[0]!,
        tick: expect.any(Number),
      },
    ]);
  });

  it('a certain-miss policy leaves the item concealed and records a miss', () => {
    const { cellBlock, contraband, guards, search, kernel } = buildHarness(6, [CERTAIN_MISS_POLICY]);
    contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(contraband.get('item-1')?.state).toBe('concealed');
    expect(search.getMetrics().itemsMissed).toBe(1);
    expect(search.getMetrics().itemsDiscovered).toBe(0);
  });

  it('is deterministic: identical seed/state/commands reproduce identical detection outcomes', () => {
    function run(): { discovered: number; missed: number; state: string | undefined } {
      const { cellBlock, contraband, guards, search, kernel } = buildHarness(10, [{ ...CERTAIN_DETECT_POLICY, baseDetectionProbability: 0.5 }]);
      for (let i = 0; i < 5; i += 1) contraband.introduce(`item-${i}`, 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
      guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
      search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });
      for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();
      return { discovered: search.getMetrics().itemsDiscovered, missed: search.getMetrics().itemsMissed, state: contraband.get('item-0')?.state };
    }

    const first = run();
    const second = run();
    expect(second).toEqual(first);
    expect(first.discovered + first.missed).toBe(5);
  });

  it('snapshot/restore resumes a mid-travel search and still completes it correctly', () => {
    const { cellBlock, contraband, guards, search, kernel } = buildHarness(6, [CERTAIN_DETECT_POLICY]);
    contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    kernel.step(); // assign + issue travel request, not yet arrived
    expect(search.getJobState('search-1')).toBe('travelling');

    const guardSnapshot = guards.getSnapshot();
    const contrabandSnapshot = contraband.getSnapshot();
    const searchSnapshot = search.getSnapshot();

    const restoredNavigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 2_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 100 }, cellBlock.doors);
    restoredNavigation.setLoadedChunks(cellBlock.chunkPositions);
    const restoredGuards = new GuardRoster(64);
    restoredGuards.loadSnapshot(guardSnapshot);
    const restoredContraband = new ContrabandRegistry();
    restoredContraband.loadSnapshot(contrabandSnapshot);
    const restoredIntelligence = new IntelligenceLedger();
    const restoredConfiscations = new ConfiscationLedger();
    const restoredSearch = new SearchSystem(
      restoredGuards,
      restoredNavigation,
      restoredContraband,
      restoredIntelligence,
      restoredConfiscations,
      [CERTAIN_DETECT_POLICY],
      () => 0,
      (target) => cellBlock.cellTiles[Number(target.holderId)]!,
    );
    restoredSearch.loadSnapshot(searchSnapshot);

    const restoredRng = new NamedRngStreams([{ name: CONTRABAND_DETECTION_RNG_STREAM, state: deriveXoshiroState(7, CONTRABAND_DETECTION_RNG_STREAM) }]);
    const restoredKernel = new Kernel(0, 0, restoredRng);
    restoredKernel.registerSystem(restoredNavigation);
    restoredKernel.registerSystem(restoredSearch);

    for (let tick = 0; tick < 500 && restoredSearch.getMetrics().searchesCompleted < 1; tick += 1) restoredKernel.step();

    expect(restoredSearch.getMetrics().searchesCompleted).toBe(1);
    expect(restoredContraband.get('item-1')?.state).toBe('confiscated');
    expect(restoredConfiscations.all()).toHaveLength(1);
  });

  it('intelligence confidence measurably raises detection: a normally-certain miss becomes a certain hit', () => {
    const lowProbabilityPolicy: SearchPolicyDefinition = { scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 0, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 1 };
    const { cellBlock, contraband, intelligence, guards, search, kernel } = buildHarness(6, [lowProbabilityPolicy]);
    contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    intelligence.report('cell', String(OPEN_CELL_INDEX), 1, 'observation', 0);
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(contraband.get('item-1')?.state).toBe('confiscated');
  });

  it('a sector sweep visits multiple targets in sequence and checks each one', () => {
    const sectorPolicy: SearchPolicyDefinition = { scope: 'sector', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 1, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 };
    const { cellBlock, contraband, guards, search, kernel } = buildHarness(6, [sectorPolicy]);
    contraband.introduce('item-cell-1', 'contraband.phone', { kind: 'cell', id: '1' }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    contraband.introduce('item-cell-2', 'contraband.currency', { kind: 'cell', id: '2' }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    search.submitOrder({
      id: 'sweep-1',
      scope: 'sector',
      targets: [
        { holderKind: 'cell', holderId: '1' },
        { holderKind: 'cell', holderId: '2' },
      ],
    });

    for (let tick = 0; tick < 1_000 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(search.getMetrics()).toEqual({ itemsDiscovered: 2, itemsMissed: 0, searchesCompleted: 1, searchesCancelled: 0, searchesQueued: 0 });
    expect(contraband.get('item-cell-1')?.state).toBe('confiscated');
    expect(contraband.get('item-cell-2')?.state).toBe('confiscated');
  });
});
