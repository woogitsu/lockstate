import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { ContrabandRegistry } from '../../src/simulation/contraband/item';
import { IntelligenceLedger } from '../../src/simulation/contraband/intelligence';
import { ConfiscationLedger } from '../../src/simulation/contraband/confiscation';
import { SearchSystem, type CategoryConcealmentResolver, type CategoryNameKeyResolver, type TargetLocationResolver } from '../../src/simulation/contraband/search-system';
import { SimulationEventLog } from '../../src/simulation/events';
import type { SearchPolicyDefinition } from '../../src/simulation/contraband/search-policy';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { INCIDENT_RESPONSE_GUARD_RESERVE } from '../../src/simulation/security/post-eligibility';
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
  /*
   * The catalog's own mapping, written out rather than derived: the shipped
   * `contraband.phone` is `nameKey: 'contraband.phone.name'`, and a harness that
   * computed `${categoryId}.name` would be asserting the naming rule with the
   * rule under test. `undefined` for anything else, which is the case
   * `records nothing for a category it cannot name` below drives.
   */
  const categoryNameKey: CategoryNameKeyResolver = (categoryId) =>
    categoryId === 'contraband.phone' ? 'contraband.phone.name' : undefined;
  const locateTarget: TargetLocationResolver = (target): TilePosition => {
    if (target.holderKind !== 'cell') throw new RangeError('This harness only resolves cell targets.');
    return cellBlock.cellTiles[Number(target.holderId)]!;
  };

  const events = new SimulationEventLog();
  const search = new SearchSystem(guards, navigation, contraband, intelligence, confiscations, policies, categoryConcealment, categoryNameKey, locateTarget, events);

  const rng = new NamedRngStreams([{ name: CONTRABAND_DETECTION_RNG_STREAM, state: deriveXoshiroState(7, CONTRABAND_DETECTION_RNG_STREAM) }]);
  const kernel = new Kernel(0, 0, rng);
  kernel.registerSystem(navigation);
  kernel.registerSystem(search);

  return { cellBlock, navigation, contraband, intelligence, confiscations, guards, search, kernel, events };
}

/**
 * Hires the staff one search needs: the searcher, plus
 * `INCIDENT_RESPONSE_GUARD_RESERVE` more that the search may not claim
 * ([issue #996](https://github.com/matmaxalez/lockstate/issues/996)).
 *
 * The reserve is read from the constant rather than written out as a number,
 * so a later change to it moves these fixtures with it instead of leaving a
 * suite that pins a staffing rule nobody meant to pin. The searcher is the
 * **lowest** entity id -- `claimableSearchGuardIds` slices from the front --
 * so `guards.allGuardIds()[0]` is still the guard every case below follows.
 */
function hireForSearch(guards: GuardRoster, tile: TilePosition): void {
  for (let index = 0; index < 1 + INCIDENT_RESPONSE_GUARD_RESERVE; index += 1) guards.hire('staff-role.guard', tile);
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

    /*
     * One guard is no longer enough, and that is the rule issue #996 added:
     * `claimableSearchGuardIds` withholds the last
     * `INCIDENT_RESPONSE_GUARD_RESERVE` free guards so a sweep can never be the
     * reason an incident has nobody to send. So the order stays queued through
     * a hire that used to staff it -- observable backlog, not a failure.
     */
    guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!); // canteen origin; exact tile irrelevant to staffing
    for (let tick = 0; tick < 50; tick += 1) kernel.step();
    expect(search.isQueued('search-1')).toBe(true);
    expect(search.getMetrics().searchesCompleted).toBe(0);

    for (let index = 0; index < INCIDENT_RESPONSE_GUARD_RESERVE; index += 1) guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(search.getMetrics()).toEqual({ itemsDiscovered: 1, itemsMissed: 0, searchesCompleted: 1, searchesCancelled: 0, searchesQueued: 0 });
    expect(contraband.get('item-1')?.state).toBe('confiscated');
    expect(guards.getDeploymentPhase(guards.allGuardIds()[0]!)).toBe('unassigned'); // released after completion
  });

  it('records a typed confiscation event with provenance and search order id', () => {
    const { cellBlock, contraband, confiscations, guards, search, kernel } = buildHarness(6, [CERTAIN_DETECT_POLICY]);
    contraband.introduce('item-1', 'contraband.weapon', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'prisoner', sourceId: '3', introducedAtTick: 2 });
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
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

  /**
   * **The player is told what was found, by name** -- the owner's ruling 13 of
   * 2026-08-31 on issue #703: the alerts list gains
   * *"Contraband found: {item}."* at `'warning'`.
   *
   * Before this the alerts list said nothing at all about a search. The only
   * sign of one was the status strip's **Contraband** figure moving by one, and
   * that chip can name a category only while every confiscation on the ledger
   * is the same one (`soleDiscoveredContrabandNameKey`), so a prison that had
   * found a phone and a knife rendered the bare character `2`.
   *
   * Asserted on the event the log actually holds rather than on a count moving:
   * a `count` assertion would hold for an event carrying the wrong key, and the
   * key is the whole of the ruling. The tick asserted is the tick the search
   * *dwelt* on, which is `confiscations.all()[0].tick` -- read from the ledger
   * rather than recomputed here, because the claim is that the two agree and a
   * second arithmetic for it would be a second answer.
   */
  it('records a contraband.discovered event naming the category, at the tick of the find (#703 ruling 13)', () => {
    const { cellBlock, confiscations, contraband, events, guards, search, kernel } = buildHarness(6, [CERTAIN_DETECT_POLICY]);
    contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
    // The premise: nothing is announced before a search finds anything, so the
    // assertion below cannot pass off a pre-existing event as this one.
    expect(events.count).toBe(0);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    const foundAtTick = confiscations.all()[0]?.tick;
    expect(foundAtTick, 'the premise: something was actually confiscated').toEqual(expect.any(Number));
    expect(events.since(0)).toEqual([
      { sequence: 1, tick: foundAtTick, type: 'contraband.discovered', categoryNameKey: 'contraband.phone.name' },
    ]);
  });

  /**
   * **A search that finds nothing says nothing.**
   *
   * The half of the rule above that a "the event exists" assertion cannot
   * reach: an emitter placed one line higher -- before the detection draw is
   * read, or outside the `if (!detected)` guard -- would announce a find on
   * every item a guard walked past and never found. The certain-miss policy is
   * exactly that case, and the ledger and the counter agree with it.
   */
  it('says nothing to the player about a search that found nothing (#703 ruling 13)', () => {
    const { cellBlock, contraband, events, guards, search, kernel } = buildHarness(6, [CERTAIN_MISS_POLICY]);
    contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(search.getMetrics().itemsMissed, 'the premise: a search really ran and really missed').toBe(1);
    expect(events.count).toBe(0);
  });

  /**
   * **A category the session cannot name is confiscated in silence rather than
   * announced as a dotted key.**
   *
   * `CategoryNameKeyResolver` answers `undefined` for a category the supplied
   * catalog does not define, which is the call
   * `soleDiscoveredContrabandNameKey` makes in the same words for the status
   * chip: a projection that guessed `${categoryId}.name` would be authoring
   * keys the locale need not contain, and `resolveLocalizationKey` renders an
   * unknown key as itself -- so the alternative is a player reading
   * `contraband.unknown.name` inside an authored sentence.
   *
   * Unreachable from `src/`: `new-session.ts` resolves the concealment and the
   * name from the same registry, and the concealment lookup throws first. It is
   * pinned here because the *policy* is a decision, and because the harness's
   * own resolver is the only thing that makes the case constructible.
   */
  it('confiscates a category it cannot name without announcing a raw key (#703 ruling 13)', () => {
    const { cellBlock, confiscations, contraband, events, guards, search, kernel } = buildHarness(6, [CERTAIN_DETECT_POLICY]);
    // `contraband.tool` is a real catalog category; what this harness's
    // resolver knows is `contraband.phone` alone, which is what makes this the
    // unnameable case rather than an invalid one.
    contraband.introduce('item-1', 'contraband.tool', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    // The find is real in every way that is not the sentence: the item is
    // confiscated, the counter moved, and the evidence is on the ledger.
    expect(contraband.get('item-1')?.state).toBe('confiscated');
    expect(search.getMetrics().itemsDiscovered).toBe(1);
    expect(confiscations.all()).toHaveLength(1);
    expect(events.count, 'and nothing that would paint a dotted key on screen').toBe(0);
  });

  /**
   * **How many rows one tick can put on the alerts list, measured at the
   * ceiling rather than reasoned about.**
   *
   * `runDetectionForCurrentTarget` runs an independent draw per concealed item
   * at the target, so a holder carrying several can be emptied in a single
   * tick, and `MAX_EVENT_ALERT_ROWS` is 8 with an eviction rule that drops the
   * least severe first (#703 ruling 11). A search posting six `'warning'` rows
   * on one tick could therefore push other warnings out of the list, which is
   * why the number matters and not only the plumbing.
   *
   * Five items on one holder at `baseDetectionProbability: 1` is the
   * constructible ceiling for one tick, and it produces **five events sharing
   * one tick** -- so nothing here coalesces and this case says so out loud. It
   * is safe in the shipped game for a reason no unit test can establish, and
   * `tests/integration/contraband-search-duty.test.ts` carries that
   * measurement instead: a real prison's holder carries at most two items and
   * one sweep visits one target per tick.
   */
  it('emits one row per item found, not one per search, and they share the tick (#703 ruling 13)', () => {
    const { cellBlock, contraband, events, guards, search, kernel } = buildHarness(6, [CERTAIN_DETECT_POLICY]);
    for (let index = 0; index < 5; index += 1) {
      contraband.introduce(`item-${String(index)}`, 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    }
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    const recorded = events.since(0);
    expect(search.getMetrics().itemsDiscovered, 'the premise: all five were found').toBe(5);
    expect(recorded).toHaveLength(5);
    expect(new Set(recorded.map((event) => event.tick)).size, 'one target, one dwell, one tick').toBe(1);
    // Sequences are 1-based and increment once per event across the channel, so
    // five finds are five distinguishable rows rather than one rewritten five
    // times -- `HudAlertViewModel.id` keys on exactly this.
    expect(recorded.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a certain-miss policy leaves the item concealed and records a miss', () => {
    const { cellBlock, contraband, guards, search, kernel } = buildHarness(6, [CERTAIN_MISS_POLICY]);
    contraband.introduce('item-1', 'contraband.phone', { kind: 'cell', id: String(OPEN_CELL_INDEX) }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
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
      hireForSearch(guards, cellBlock.canteenTiles[0]!);
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
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
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
      () => 'contraband.phone.name',
      (target) => cellBlock.cellTiles[Number(target.holderId)]!,
      new SimulationEventLog(),
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
    hireForSearch(guards, cellBlock.canteenTiles[0]!);
    search.submitOrder({ id: 'search-1', scope: 'cell', targets: [{ holderKind: 'cell', holderId: String(OPEN_CELL_INDEX) }] });

    for (let tick = 0; tick < 500 && search.getMetrics().searchesCompleted < 1; tick += 1) kernel.step();

    expect(contraband.get('item-1')?.state).toBe('confiscated');
  });

  it('a sector sweep visits multiple targets in sequence and checks each one', () => {
    const sectorPolicy: SearchPolicyDefinition = { scope: 'sector', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 1, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 };
    const { cellBlock, contraband, guards, search, kernel } = buildHarness(6, [sectorPolicy]);
    contraband.introduce('item-cell-1', 'contraband.phone', { kind: 'cell', id: '1' }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    contraband.introduce('item-cell-2', 'contraband.currency', { kind: 'cell', id: '2' }, { sourceType: 'room-object', sourceId: 'x', introducedAtTick: 0 });
    hireForSearch(guards, cellBlock.canteenTiles[0]!);

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
