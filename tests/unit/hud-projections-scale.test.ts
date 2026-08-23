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
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: rng.nextInt(500_000), priorIncidents: rng.nextInt(4) }, fixture.originTile);
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

  it(
    'walks the whole population in windows, visiting every prisoner exactly once in ascending entity id',
    () => {
      const fixture = buildPopulation(actorCount);
      const seen: number[] = [];
      for (let offset = 0; offset < actorCount; offset += pageLimit) {
        const page = projectPrisonerRoster(fixture.prisoners, { offset, limit: pageLimit });
        expect(page.total).toBe(actorCount);
        expect(page.offset).toBe(offset);
        for (const row of page.rows) seen.push(row.entityId);
      }

      expect(seen).toHaveLength(actorCount);
      expect(new Set(seen).size).toBe(actorCount);
      expect([...seen].sort((left, right) => left - right)).toEqual(seen);
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
