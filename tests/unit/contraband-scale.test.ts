import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { ContrabandRegistry } from '../../src/simulation/contraband/item';
import { IntelligenceLedger } from '../../src/simulation/contraband/intelligence';
import { ConfiscationLedger } from '../../src/simulation/contraband/confiscation';
import { SimulationEventLog } from '../../src/simulation/events';
import { SearchSystem } from '../../src/simulation/contraband/search-system';
import type { SearchPolicyDefinition, SearchTarget } from '../../src/simulation/contraband/search-policy';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { INCIDENT_RESPONSE_GUARD_RESERVE } from '../../src/simulation/security/post-eligibility';
import { CONTRABAND_DETECTION_RNG_STREAM } from '../../src/simulation/runtime/new-session';

/**
 * Issue #27's explicit performance requirement: "benchmark sector sweeps
 * and high-item-count scenarios before setting policy limits." Directional
 * evidence only (no hard threshold, per `docs/BENCHMARKING.md`), proving
 * correctness (every item resolved, no leftover queued/active jobs) and
 * that per-target lookups stay indexed (`ContrabandRegistry.byHolder`)
 * rather than scanning every item in the prison for every search tick.
 */
describe('contraband scale: many items across a sector sweep', () => {
  it('sweeps 40 cells holding 200 contraband items to a fully-resolved, correct state without pathological slowdown', () => {
    const cellCount = 60;
    const cellBlock = buildCellBlockFixture(cellCount);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 6_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 8 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    // Same exclusion as the security-scale test: skip medical-gated cells so a plain guard reaches every swept cell.
    const openCellIndices: number[] = [];
    for (let i = 0; i < cellCount && openCellIndices.length < 40; i += 1) {
      if (i % 5 !== 0) openCellIndices.push(i);
    }

    const contraband = new ContrabandRegistry();
    let itemSequence = 0;
    for (const cellIndex of openCellIndices) {
      for (let k = 0; k < 5; k += 1) {
        contraband.introduce(`item-${itemSequence}`, 'contraband.phone', { kind: 'cell', id: String(cellIndex) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
        itemSequence += 1;
      }
    }
    const totalItems = itemSequence;

    const guards = new GuardRoster(64);
    // The searcher, plus the guards issue #996 reserves for incident response:
    // `claimableSearchGuardIds` will not hand a sweep the last free ones.
    for (let index = 0; index < 1 + INCIDENT_RESPONSE_GUARD_RESERVE; index += 1) guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    const policy: SearchPolicyDefinition = { scope: 'sector', requiredGuardCount: 1, dwellTicksPerTarget: 3, baseDetectionProbability: 1, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 };
    const intelligence = new IntelligenceLedger();
    const confiscations = new ConfiscationLedger();
    const events = new SimulationEventLog();
    const targets: SearchTarget[] = openCellIndices.map((cellIndex) => ({ holderKind: 'cell', holderId: String(cellIndex) }));
    const search = new SearchSystem(
      guards,
      navigation,
      contraband,
      intelligence,
      confiscations,
      [policy],
      () => 0,
      () => 'contraband.phone.name',
      (target) => cellBlock.cellTiles[Number(target.holderId)]!,
      events,
    );
    search.submitOrder({ id: 'full-sweep', scope: 'sector', targets });

    const rng = new NamedRngStreams([{ name: CONTRABAND_DETECTION_RNG_STREAM, state: deriveXoshiroState(99, CONTRABAND_DETECTION_RNG_STREAM) }]);
    const kernel = new Kernel(0, 0, rng);
    kernel.registerSystem(navigation);
    kernel.registerSystem(search);

    const startedAt = performance.now();
    for (let tick = 0; tick < 20_000 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();
    const wallMs = performance.now() - startedAt;
    console.log(`[contraband scale] cells=${openCellIndices.length} items=${totalItems} wallMs=${wallMs.toFixed(1)} metrics=${JSON.stringify(search.getMetrics())}`);

    expect(search.getMetrics().searchesCompleted).toBe(1);
    expect(search.getMetrics().itemsDiscovered).toBe(totalItems);
    expect(search.getMetrics().itemsMissed).toBe(0);
    expect(contraband.all().every((item) => item.state === 'confiscated')).toBe(true);
    expect(guards.getDeploymentPhase(guards.allGuardIds()[0]!)).toBe('unassigned');
  }, 30_000);
});
