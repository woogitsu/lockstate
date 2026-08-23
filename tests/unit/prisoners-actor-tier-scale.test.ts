import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { NEED_IDS, NEED_MAX, NEED_MIN } from '../../src/simulation/prisoners/needs';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';

/**
 * Correctness-at-scale proof for issue #24's "benchmark need updates and
 * decision evaluation at 250/1,000/2,500/5,000 actors" performance
 * requirement. Deliberately does NOT assert on wall-clock time --
 * docs/BENCHMARKING.md's policy requires repeated controlled baselines
 * and hardware/runtime context before any timing threshold gates a test;
 * this proves every tier runs correctly within a bounded tick budget and
 * reports timing to the console as directional evidence.
 *
 * The cell-block fixture uses a *fixed, realistic-scale* cell count
 * (matching a modest real prison, not "one dedicated cell per prisoner")
 * across every actor tier -- issue #22's navigation region-graph cost
 * scales with the number of distinct regions (cells), and #22's own
 * actor-tier benchmarks already cover navigation throughput at 5,000
 * actors against a representative layout
 * (docs/adr/0007-navigation-work-budgets-and-flow-fields.md). Re-deriving
 * that cost here by giving 5,000 actors 5,000 distinct single-occupant
 * cells would benchmark #22's navigation graph size, not #24's needs
 * decay/utility-AI/regime evaluation -- so at the larger tiers, most
 * accommodation demand is intentionally left as observable backlog
 * (see prisoners-intake-system.test.ts for dedicated backlog-behavior
 * coverage) rather than solved by growing the world unrealistically.
 */
const FIXED_CELL_COUNT = 300;

function runTier(actorCount: number, ticks: number): { wallMs: number } {
  const seed = 0x7ac70e;
  const fixture = buildPrisonerScenarioFixture({ cellCount: FIXED_CELL_COUNT, capacity: actorCount + 10 });
  const kernel = new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(seed, RNG_STREAM) }]));
  fixture.registerOn(kernel);

  const rng = new Xoshiro128StarStar(deriveXoshiroState(seed, 'test.scenario-actors').words);
  for (let i = 0; i < actorCount; i += 1) {
    fixture.prisoners.admitPrisoner({ sentenceLengthTicks: rng.nextInt(500_000), priorIncidents: rng.nextInt(4) }, fixture.originTile);
  }

  const startedAt = performance.now();
  for (let i = 0; i < ticks; i += 1) kernel.step();
  const wallMs = performance.now() - startedAt;

  for (let index = 0; index < actorCount; index += 1) {
    for (const needId of NEED_IDS) {
      const level = fixture.prisoners.needs.get(index, needId);
      expect(level).toBeGreaterThanOrEqual(NEED_MIN);
      expect(level).toBeLessThanOrEqual(NEED_MAX);
    }
  }
  // A prisoner who could never be accommodated at all (no such room type
  // registered) is a structural failure; a prisoner still waiting because
  // every matching cell is occupied (realistic at these tiers against a
  // fixed-size prison) is not -- see the module doc above.
  expect(fixture.prisoners.intakeSystem.getMetrics().failedCount).toBe(0);

  return { wallMs };
}

describe.each([
  { actorCount: 250, ticks: 800 },
  { actorCount: 1_000, ticks: 800 },
  { actorCount: 2_500, ticks: 800 },
  { actorCount: 5_000, ticks: 800 },
])('actor-tier scale: $actorCount actors', ({ actorCount, ticks }) => {
  it(
    `completes ${ticks} ticks without crashing or violating need bounds`,
    () => {
      const { wallMs } = runTier(actorCount, ticks);
      console.log(`[prisoners actor-tier] actors=${actorCount} ticks=${ticks} wallMs=${wallMs.toFixed(1)}`);
    },
    30_000,
  );
});
