import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import {
  projectPrisonerPopulationCounts,
  projectPrisonerRoster,
  projectStatusStrip,
} from '../../src/simulation/presentation';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

/**
 * Scale evidence for the roster projection, in the spirit of
 * `tests/unit/prisoners-actor-tier-scale.test.ts`: every actor tier the
 * architecture names (250 / 1,000 / 2,500 / 5,000) is projected against a
 * real, ticked `Kernel` population, and the measured cost is **reported**
 * rather than asserted.
 *
 * `docs/BENCHMARKING.md` forbids a timing threshold without repeated
 * controlled baselines and hardware context, so nothing here asserts
 * elapsed time. What *is* asserted is the property that makes the
 * projection usable at scale in the first place: a windowed request builds
 * exactly `limit` row objects regardless of population, and the counts
 * projection builds none at all.
 */

const RNG_STREAM = 'prisoners.classification';
const FIXED_CELL_COUNT = 300;
const TICKS = 200;

/**
 * The floor under every drawn sentence, so that the population this file
 * projects is the population it admitted.
 *
 * The draw used to be `rng.nextInt(500_000)` with no floor, which admits
 * sentences of a few ticks. That cost nothing while nothing in `src/` ever
 * released a prisoner; since #441 a sentence that ends inside the fixture's
 * 200-tick warm-up means the prisoner leaves, and three of 2,500 and three of
 * 5,000 did -- so `page.total` read 2,498 and 4,997 and the tier's own number
 * stopped being the population. A floor rather than a shorter run, because the
 * run length is what gives the projection something to project.
 */
const SHORTEST_SENTENCE_TICKS = TICKS + 1;

interface Tier {
  readonly actorCount: number;
  readonly pageLimit: number;
}

function buildPopulation(actorCount: number): ReturnType<typeof buildPrisonerScenarioFixture> {
  const seed = 0x7ac70e;
  const fixture = buildPrisonerScenarioFixture({ cellCount: FIXED_CELL_COUNT, capacity: actorCount + 10 });
  const kernel = new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(seed, RNG_STREAM) }]));
  fixture.registerOn(kernel);

  const rng = new Xoshiro128StarStar(deriveXoshiroState(seed, 'test.scenario-actors').words);
  for (let index = 0; index < actorCount; index += 1) {
    fixture.prisoners.admitPrisoner(
      { sentenceLengthTicks: SHORTEST_SENTENCE_TICKS + rng.nextInt(500_000), priorIncidents: rng.nextInt(4) },
      fixture.originTile,
    );
  }
  for (let tick = 0; tick < TICKS; tick += 1) kernel.step();
  return fixture;
}

/** Approximate retained size of a projected page, as a reported measurement only. */
function jsonBytes(value: unknown): number {
  return JSON.stringify(value).length;
}

describe.each<Tier>([
  { actorCount: 250, pageLimit: 25 },
  { actorCount: 1_000, pageLimit: 25 },
  { actorCount: 2_500, pageLimit: 25 },
  { actorCount: 5_000, pageLimit: 25 },
])('roster projection at $actorCount actors', ({ actorCount, pageLimit }) => {
  it(
    'projects one window without materialising the whole population',
    () => {
      const fixture = buildPopulation(actorCount);

      const startedAt = performance.now();
      const page = projectPrisonerRoster(fixture.prisoners, { limit: pageLimit });
      const pageMs = performance.now() - startedAt;

      expect(page.total).toBe(actorCount);
      expect(page.rows).toHaveLength(pageLimit);

      const countsStartedAt = performance.now();
      const counts = projectPrisonerPopulationCounts(fixture.prisoners);
      const countsMs = performance.now() - countsStartedAt;
      expect(counts.total).toBe(actorCount);

      const stripStartedAt = performance.now();
      const strip = projectStatusStrip({ tick: TICKS, prisoners: fixture.prisoners, rooms: fixture.prisoners });
      const stripMs = performance.now() - stripStartedAt;
      expect(strip.counts.prisoners).toBe(actorCount);

      // Reported evidence, never a gate (docs/BENCHMARKING.md).
      console.log(
        `[hud roster projection] actors=${actorCount} pageLimit=${pageLimit} rows=${page.rows.length} ` +
          `pageBytes=${jsonBytes(page)} pageMs=${pageMs.toFixed(2)} countsMs=${countsMs.toFixed(2)} statusStripMs=${stripMs.toFixed(2)}`,
      );
    },
    30_000,
  );

  /**
   * **This asserted "in ascending entity id" until 2026-08-31, and that clause
   * is the half issue #703 changed.** The roster's canonical order is now
   * highest risk tier first, ties on ascending entity index, so the old
   * assertion is false of a population whose classification draw produced more
   * than one tier -- which every one of these fixtures does.
   *
   * It is replaced by the property it was a proxy for, in three parts, and the
   * replacement is stronger rather than looser: the old check would pass for a
   * projection that had quietly reordered *between pages* as long as the result
   * came out ascending, and part 2 below is what rules that out.
   *
   * 1. Every prisoner appears exactly once across the windows -- unchanged.
   * 2. The concatenated windows equal one unpaged projection of the same
   *    population, so paging partitions a single order rather than sorting each
   *    page on its own.
   * 3. That order is non-increasing in risk tier, and ascending in entity id
   *    within a tier -- the contract `projectPrisonerRoster` now states.
   */
  it(
    'walks the whole population in windows, visiting every prisoner exactly once in the roster order',
    () => {
      const fixture = buildPopulation(actorCount);
      const seen: number[] = [];
      const tiers: number[] = [];
      for (let offset = 0; offset < actorCount; offset += pageLimit) {
        const page = projectPrisonerRoster(fixture.prisoners, { offset, limit: pageLimit });
        expect(page.total).toBe(actorCount);
        expect(page.offset).toBe(offset);
        for (const row of page.rows) {
          seen.push(row.entityId);
          tiers.push(row.riskTier ?? -1);
        }
      }

      expect(seen).toHaveLength(actorCount);
      expect(new Set(seen).size).toBe(actorCount);

      const unpaged = projectPrisonerRoster(fixture.prisoners, { limit: actorCount });
      expect(unpaged.rows.map((row) => row.entityId)).toEqual(seen);

      // Non-vacuity: a population that came out at one tier would satisfy the
      // ordering check below by accident, and would also have satisfied the
      // ascending-id assertion this replaces.
      expect(new Set(tiers).size).toBeGreaterThan(1);

      for (let position = 1; position < seen.length; position += 1) {
        const tier = tiers[position]!;
        const previousTier = tiers[position - 1]!;
        expect(tier, `tier rose at position ${position}`).toBeLessThanOrEqual(previousTier);
        if (tier === previousTier) {
          expect(seen[position]!, `entity id fell within tier ${tier} at position ${position}`).toBeGreaterThan(
            seen[position - 1]!,
          );
        }
      }
    },
    30_000,
  );
});

describe('roster paging is independent of population size', () => {
  it('builds exactly the requested number of rows at the stretch tier', () => {
    const fixture = buildPopulation(5_000);
    for (const limit of [0, 1, 25, 100]) {
      const page = projectPrisonerRoster(fixture.prisoners, { limit });
      expect(page.rows).toHaveLength(limit);
      expect(page.total).toBe(5_000);
    }
  }, 30_000);
});
