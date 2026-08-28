import { describe, expect, it } from 'vitest';
import { defaultContrabandRegistry } from '../../src/content/contraband-catalog';
import {
  DEFAULT_CONTRABAND_INTRODUCTION_POLICY,
  contrabandCategoriesBySeverity,
  contrabandIntroductionProbability,
  eligibleContrabandCategories,
  introduceContrabandOnIntake,
} from '../../src/simulation/contraband/introduction';
import { ContrabandRegistry } from '../../src/simulation/contraband/item';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';

/**
 * **How contraband gets into the prison**
 * ([ADR 0061](../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
 * decision 1), at the level the rule can be stated without a session.
 *
 * The reachability half -- that a real prison, driven by real commands for real
 * ticks, ends up holding contraband nobody put there by hand -- is
 * `tests/integration/incident-trigger-reachability.test.ts`'s. This file is
 * about the rule itself: which categories a tier may bring, what the id is a
 * function of, and how many draws are made in what order.
 *
 * Nothing here asserts a value the code under test computed. The catalogue's
 * severities are read from `contraband-catalog.ts` and the expected ordering is
 * written out.
 */

function rng(seed = 7): Xoshiro128StarStar {
  return new Xoshiro128StarStar(deriveXoshiroState(seed, 'contraband.introduction').words);
}

/** A stub catalogue, so the band assertions do not move when the shipped one gains an entry. */
const CATALOGUE = [
  { id: 'x.petty', severity: 2 },
  { id: 'x.middling', severity: 5 },
  { id: 'x.bad', severity: 7 },
  { id: 'x.worst', severity: 9 },
] as const;

describe('the catalogue is ordered by what a category is worth, not by how it was written', () => {
  it('sorts ascending by severity, ties by id', () => {
    const ordered = contrabandCategoriesBySeverity([
      { id: 'b', severity: 5 },
      { id: 'a', severity: 5 },
      { id: 'c', severity: 1 },
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the caller’s array alone', () => {
    const input = [{ id: 'b', severity: 5 }, { id: 'a', severity: 1 }];
    contrabandCategoriesBySeverity(input);
    expect(input.map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});

describe('what an arrival of each risk tier could be concealing', () => {
  it('widens by one category per tier, from the least severe end', () => {
    expect(eligibleContrabandCategories(CATALOGUE, 0).map((entry) => entry.id)).toEqual(['x.petty', 'x.middling']);
    expect(eligibleContrabandCategories(CATALOGUE, 1).map((entry) => entry.id)).toEqual(['x.petty', 'x.middling', 'x.bad']);
    expect(eligibleContrabandCategories(CATALOGUE, 2).map((entry) => entry.id)).toEqual(['x.petty', 'x.middling', 'x.bad', 'x.worst']);
  });

  it('never exceeds the catalogue however high the tier goes', () => {
    expect(eligibleContrabandCategories(CATALOGUE, 99)).toHaveLength(CATALOGUE.length);
  });

  /**
   * The property the shipped catalogue is arranged to have, asserted against
   * the catalogue rather than against a copy of it: **only the arrival a prison
   * classified high risk can bring a weapon in.** The escape-attempt producer is
   * gated on the same tier, so this is what makes its "armed and high risk" rung
   * reachable at all -- and it would go quiet if a future catalogue entry pushed
   * `contraband.weapon` out of the top slot.
   */
  it('keeps the weapon out of every hand but a tier-3 arrival’s, on the shipped catalogue', () => {
    const shipped = defaultContrabandRegistry.all();
    for (const tier of [0, 1, 2]) {
      expect(eligibleContrabandCategories(shipped, tier).map((entry) => entry.id), `tier ${String(tier)}`).not.toContain('contraband.weapon');
    }
    expect(eligibleContrabandCategories(shipped, 3).map((entry) => entry.id)).toContain('contraband.weapon');
  });
});

describe('how often an arrival is carrying', () => {
  it('rises with the tier and is clamped to a probability', () => {
    expect(contrabandIntroductionProbability(0)).toBeCloseTo(0.1, 10);
    expect(contrabandIntroductionProbability(3)).toBeCloseTo(0.4, 10);
    // A policy that would run over 1 is clamped rather than trusted.
    expect(contrabandIntroductionProbability(3, { ...DEFAULT_CONTRABAND_INTRODUCTION_POLICY, baseProbability: 0.9 })).toBe(1);
    expect(contrabandIntroductionProbability(-5)).toBeCloseTo(0.1, 10);
  });
});

describe('one arrival’s introduction check', () => {
  it('introduces nothing when the draw misses, and leaves the registry empty', () => {
    const contraband = new ContrabandRegistry();
    // Probability 0: the first draw cannot be below it, whatever it returns.
    const result = introduceContrabandOnIntake(contraband, CATALOGUE, 4, 0, 100, rng(), {
      ...DEFAULT_CONTRABAND_INTRODUCTION_POLICY,
      baseProbability: 0,
      probabilityPerRiskTier: 0,
    });
    expect(result).toBeUndefined();
    expect(contraband.all()).toEqual([]);
  });

  it('records the arrival as the holder and as the source, with an id derived from both', () => {
    const contraband = new ContrabandRegistry();
    const result = introduceContrabandOnIntake(contraband, CATALOGUE, 4, 3, 100, rng(), {
      ...DEFAULT_CONTRABAND_INTRODUCTION_POLICY,
      baseProbability: 1,
    });
    expect(result).toBeDefined();
    expect(result!.itemId).toBe('contraband.intake.4.100');

    const item = contraband.get(result!.itemId)!;
    expect(item).toMatchObject({
      holder: { kind: 'prisoner', id: '4' },
      state: 'concealed',
      provenance: { sourceType: 'prisoner', sourceId: '4', introducedAtTick: 100 },
    });
    // Indexed at the holder, which is what a search of that person would find.
    expect(contraband.byHolder('prisoner', '4').map((entry) => entry.id)).toEqual([result!.itemId]);
  });

  /**
   * The id is a **derived identity**
   * ([ADR 0012](../../docs/adr/0012-derived-identifier-reproducibility.md)
   * category 2) and this is what that buys: no counter joins the save payload,
   * and two arrivals classified on the same tick cannot collide because the
   * entity id is the other half of the key.
   */
  it('gives two arrivals classified on the same tick different ids', () => {
    const contraband = new ContrabandRegistry();
    const always = { ...DEFAULT_CONTRABAND_INTRODUCTION_POLICY, baseProbability: 1 };
    const first = introduceContrabandOnIntake(contraband, CATALOGUE, 4, 0, 100, rng(1), always);
    const second = introduceContrabandOnIntake(contraband, CATALOGUE, 5, 0, 100, rng(2), always);
    expect(first!.itemId).not.toBe(second!.itemId);
    expect(contraband.all()).toHaveLength(2);
  });

  it('respects the tier band: a tier-0 arrival cannot be carrying the worst thing in the catalogue', () => {
    const always = { ...DEFAULT_CONTRABAND_INTRODUCTION_POLICY, baseProbability: 1 };
    const drawn = new Set<string>();
    for (let seed = 0; seed < 60; seed += 1) {
      const contraband = new ContrabandRegistry();
      const result = introduceContrabandOnIntake(contraband, CATALOGUE, 1, 0, seed, rng(seed), always);
      drawn.add(result!.categoryId);
    }
    // Sixty draws is enough to have reached both members of a two-member band,
    // and the assertion that matters is the one about what is *absent*.
    expect([...drawn].sort()).toEqual(['x.middling', 'x.petty']);
  });

  /**
   * **Two draws on success, one on failure**, in that order.
   *
   * The stream position after an introduction check is part of the save, so a
   * change to how many draws are made -- or to their order -- silently changes
   * every later contraband decision in a restored session. Asserted against a
   * stream stepped by hand rather than against the function's own arithmetic.
   */
  it('draws exactly once when the arrival is carrying nothing, and twice when they are', () => {
    const contraband = new ContrabandRegistry();

    const missed = rng(3);
    introduceContrabandOnIntake(contraband, CATALOGUE, 1, 0, 10, missed, {
      ...DEFAULT_CONTRABAND_INTRODUCTION_POLICY,
      baseProbability: 0,
      probabilityPerRiskTier: 0,
    });
    const oneDraw = rng(3);
    oneDraw.nextFloat();
    expect(missed.snapshot().words).toEqual(oneDraw.snapshot().words);

    const hit = rng(3);
    introduceContrabandOnIntake(contraband, CATALOGUE, 2, 0, 10, hit, { ...DEFAULT_CONTRABAND_INTRODUCTION_POLICY, baseProbability: 1 });
    const twoDraws = rng(3);
    twoDraws.nextFloat();
    twoDraws.nextInt(2);
    expect(hit.snapshot().words).toEqual(twoDraws.snapshot().words);
  });
});
