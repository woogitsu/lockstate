import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { projectPrisonerRoster } from '../../src/simulation/presentation/prisoner-projection';
import { classificationGroupIndex, intakeStageIndex } from '../../src/simulation/prisoners/components';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { PRISONER_ROSTER_ROW_LIMIT } from '../../src/ui/hud';
import { buildPrisonerScenarioFixture, type PrisonerScenarioFixture } from '../helpers/prisoner-fixture';

/**
 * The roster's order, and the one property a reordered list of people has to
 * have: **it does not move under the player** (issue #703, the owner's fourth
 * ruling of 2026-08-31).
 *
 * ## Why this file exists rather than another case in `hud-projections.test.ts`
 *
 * That file asserts the order against a scenario whose tiers come out of
 * `classifyPrisoner`'s screening draw, so it can say "descending tier, ties on
 * ascending id" about whatever tiers that seed happened to produce. It cannot
 * say what happens to **several prisoners at the same tier**, because it does
 * not choose the tiers -- and that is exactly the case the ruling's risk lives
 * in: `PRISONER_ROSTER_ROW_LIMIT` is four, the panel repaints on the counts
 * cadence (up to twice a second), and a sort that broke ties by anything other
 * than state would shuffle four rows under a player who is reading them.
 * `src/ui/simulation-alerts.ts` states the standing rule in `replaceOrAppend`
 * -- *"the position of a row the player is already reading must not change
 * under them"* -- and issue #209 measured it from the other side.
 *
 * ## The tiers are written, not drawn, and that is the point
 *
 * `classifyPrisoner` adds a -1/0/+1 screening variance from a named RNG stream,
 * so a fixture that admitted prisoners and hoped for a tie would be asserting
 * on a seed. These cases admit a real population through the real runtime --
 * real intake, real classification, real accommodation -- and then write the
 * tier pattern each case is about into `records.riskTier`, which is the same
 * `Uint8Array` `ClassificationReviewSystem` writes when it reclassifies
 * somebody. Nothing about the projection is stubbed: it reads the component
 * arrays a live prison holds.
 *
 * The expected orders below are written out as literal id sequences. Nothing
 * here computes an expectation with the code under test, which is the fixture
 * failure `docs/TESTING.md` names -- a comparison whose expected side is
 * `projectPrisonerRoster`'s own output holds for any implementation, including
 * one that returns the entity-index order this ruling replaced.
 */

const SEED = 0x5eed_1a;
const RNG_STREAM = 'prisoners.classification';
const CELL_COUNT = 24;
const POPULATION = 8;

/** Long enough that nobody's sentence ends inside the warm-up and changes the population. */
const SENTENCE_TICKS = 400_000;
const WARM_UP_TICKS = 200;

/**
 * A prison of eight admitted, classified, housed prisoners at entity indices
 * `0..7`.
 *
 * The warm-up is what makes them *classified*: `records.intakeStage` decides
 * whether the projection reports a tier at all (`PrisonerRosterRowViewModel`'s
 * `classified` flag), so a population that had not reached a classified stage
 * would all sort into the unclassified rank and every case below would pass
 * vacuously. The first assertion in each case is therefore that the window
 * carries tiers.
 */
function prisonWithPopulation(): PrisonerScenarioFixture {
  const fixture = buildPrisonerScenarioFixture({ cellCount: CELL_COUNT, capacity: POPULATION + 4 });
  const kernel = new Kernel(
    0,
    0,
    new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(SEED, RNG_STREAM) }]),
  );
  fixture.registerOn(kernel);
  for (let ordinal = 0; ordinal < POPULATION; ordinal += 1) {
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: SENTENCE_TICKS, priorIncidents: 1 }, fixture.originTile);
  }
  for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) kernel.step();
  return fixture;
}

/**
 * Writes one tier per entity index, and the group that goes with it.
 *
 * Both fields, because they are the pair `projectRosterRow` emits together and
 * `describePrisonerRow` reads separately -- a fixture that set the tier alone
 * would produce a row whose badge word and badge colour disagreed, which is a
 * state the simulation cannot reach (`classificationGroupIdForTier` is
 * `riskTier >= 3`) and therefore not a state to assert against.
 */
function writeTiers(fixture: PrisonerScenarioFixture, tiers: readonly number[]): void {
  tiers.forEach((tier, index) => {
    fixture.prisoners.records.riskTier[index] = tier;
    fixture.prisoners.records.classificationGroupIndex[index] = classificationGroupIndex(
      tier >= 3 ? 'high-risk' : 'general-population',
    );
  });
}

function idsOf(fixture: PrisonerScenarioFixture, limit: number, offset = 0): readonly number[] {
  return projectPrisonerRoster(fixture.prisoners, { offset, limit }).rows.map((row) => row.entityId);
}

describe('the prisoner roster is ordered by risk tier, highest first', () => {
  it('puts the four highest tiers in the four rows the panel draws', () => {
    const fixture = prisonWithPopulation();
    // Deliberately not monotonic in entity index, and deliberately not the
    // reverse of it either: an implementation that reversed the walk, or that
    // sorted ascending, produces a different sequence from the one below.
    //
    //   index: 0  1  2  3  4  5  6  7
    //   tier:  1  3  0  2  3  0  1  2
    writeTiers(fixture, [1, 3, 0, 2, 3, 0, 1, 2]);

    const window = projectPrisonerRoster(fixture.prisoners, { limit: PRISONER_ROSTER_ROW_LIMIT });
    expect(window.total, 'the total is the prison, not the window').toBe(POPULATION);
    expect(window.rows).toHaveLength(PRISONER_ROSTER_ROW_LIMIT);

    // Non-vacuity: these prisoners are classified, so the tier really is the
    // ordering key rather than every row falling into the unclassified rank.
    expect(window.rows.every((row) => row.classified)).toBe(true);
    expect(window.rows.map((row) => row.riskTier)).toEqual([3, 3, 2, 2]);

    // The two tier-3 prisoners, then the two tier-2 prisoners, each pair in
    // ascending entity index. Written out, not derived.
    expect(window.rows.map((row) => row.entityId)).toEqual([1, 4, 3, 7]);

    // And the badge the panel paints for the top row is the high-risk pair, so
    // the reordering and the row's own readout agree.
    expect(window.rows[0]).toMatchObject({ riskTier: 3, classificationGroupId: 'high-risk' });
  });

  it('orders the whole prison, so the four rows are a window and not a special case', () => {
    const fixture = prisonWithPopulation();
    writeTiers(fixture, [1, 3, 0, 2, 3, 0, 1, 2]);

    // tier 3: 1, 4 | tier 2: 3, 7 | tier 1: 0, 6 | tier 0: 2, 5
    expect(idsOf(fixture, POPULATION)).toEqual([1, 4, 3, 7, 0, 6, 2, 5]);
  });

  /**
   * The unclassified prisoner here is **entity 0**, not a fresh admission, and
   * that is what makes the case discriminating.
   *
   * A new arrival lands at the highest entity index, so it is last under the
   * entity-index order this ruling replaced *and* last under the rank order --
   * a case that cannot tell the two apart, and the first version of this test
   * was exactly that mistake. Putting the unclassified prisoner at index 0
   * separates them: index order says first, `riskTier`-alone order says first
   * (its zero-initialised tier reads `0` like everybody else's), and only the
   * rank order says last.
   */
  it('sorts a prisoner classification has not run on below tier 0 rather than among it', () => {
    const fixture = prisonWithPopulation();
    writeTiers(fixture, [0, 0, 0, 0, 0, 0, 0, 0]);
    fixture.prisoners.records.intakeStage[0] = intakeStageIndex('queued');

    const all = projectPrisonerRoster(fixture.prisoners, { limit: POPULATION });
    expect(all.total).toBe(POPULATION);
    expect(all.rows.map((row) => row.classified)).toEqual([true, true, true, true, true, true, true, false]);
    expect(all.rows.map((row) => row.entityId)).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
    expect(all.rows[7]).not.toHaveProperty('riskTier');
    expect(all.rows[7]).toMatchObject({ entityId: 0, intakeStage: 'queued' });
  });
});

describe('the roster does not move under the player', () => {
  /**
   * Eight prisoners at **one** tier: every row is a tie, so the tie-break is
   * the only thing deciding the order and a comparison sort that was not
   * strictly stable would be free to permute all eight.
   */
  it('keeps every row where it was across repeated publications at equal tiers', () => {
    const fixture = prisonWithPopulation();
    writeTiers(fixture, [2, 2, 2, 2, 2, 2, 2, 2]);

    const first = idsOf(fixture, POPULATION);
    expect(first).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    // The panel repaints on the counts cadence, so the same question is asked
    // again and again of a prison that is still running. Twenty publications
    // across a hundred ticks of real simulation -- needs decay, actions are
    // reconsidered, prisoners walk -- and not one row may move, because none of
    // that touches the ordering key.
    const kernel = new Kernel(0, 0, new NamedRngStreams([]));
    fixture.registerOn(kernel);
    for (let publication = 0; publication < 20; publication += 1) {
      for (let tick = 0; tick < 5; tick += 1) kernel.step();
      expect(idsOf(fixture, POPULATION), `publication ${publication} reordered the roster`).toEqual(first);
      expect(idsOf(fixture, PRISONER_ROSTER_ROW_LIMIT)).toEqual([0, 1, 2, 3]);
    }
  });

  it('moves exactly the reclassified prisoner, and leaves the rest of the order alone', () => {
    const fixture = prisonWithPopulation();
    writeTiers(fixture, [2, 2, 2, 2, 2, 2, 2, 2]);
    expect(idsOf(fixture, POPULATION)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    // What `ClassificationReviewSystem` does to one prisoner: entity 5 is
    // raised to tier 3. It is the only row that may move, and it moves to the
    // front -- the whole point of the ruling, since after ADR 0080 that tier is
    // the gate on a weapon and on an escape.
    writeTiers(fixture, [2, 2, 2, 2, 2, 3, 2, 2]);
    expect(idsOf(fixture, POPULATION)).toEqual([5, 0, 1, 2, 3, 4, 6, 7]);
    expect(idsOf(fixture, PRISONER_ROSTER_ROW_LIMIT)).toEqual([5, 0, 1, 2]);
  });
});

describe('paging still partitions one order', () => {
  it('hands out consecutive windows of the sorted list with no gap and no repeat', () => {
    const fixture = prisonWithPopulation();
    writeTiers(fixture, [1, 3, 0, 2, 3, 0, 1, 2]);
    const whole = idsOf(fixture, POPULATION);

    const pages: number[] = [];
    for (let offset = 0; offset < POPULATION; offset += 3) pages.push(...idsOf(fixture, 3, offset));
    expect(pages).toEqual(whole);

    // Past the end is an empty window with the true total, exactly as before
    // the order changed.
    const past = projectPrisonerRoster(fixture.prisoners, { offset: 99, limit: 5 });
    expect(past).toMatchObject({ total: POPULATION, offset: 99, limit: 5 });
    expect(past.rows).toEqual([]);

    // A zero-row request is a zero-row reply and not the whole prison.
    expect(projectPrisonerRoster(fixture.prisoners, { limit: 0 }).rows).toEqual([]);

    // A window that straddles the end stops at the population.
    expect(idsOf(fixture, 5, POPULATION - 2)).toEqual(whole.slice(POPULATION - 2));
  });
});
