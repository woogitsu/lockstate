import { describe, expect, it } from 'vitest';

import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { EntityQuery } from '../../src/simulation/entity/query';
import type { SimulationContext } from '../../src/simulation/kernel/system';
import { accommodationCapacityOf, crowdingExtraDecayScaledPerTick } from '../../src/simulation/prisoners/crowding';
import { NEED_DECAY_SCALED_PER_TICK, NEED_IDS, NEED_MAX_SCALED, NeedsComponent } from '../../src/simulation/prisoners/needs';
import { NeedsDecaySystem } from '../../src/simulation/prisoners/needs-system';
import type { RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';
import { environmentSummary, formatMs, measureSync, renderTable } from './measure';

/**
 * What issue #586's crowding term costs the need update, which runs over every
 * prisoner every ten ticks.
 *
 * ## The columns
 *
 * - **no source** -- the shipped `NeedsDecaySystem` constructed without a
 *   capacity source, which is how every fixture that stands up needs alone
 *   builds it. With no excess the update takes its uncrowded branch, which is
 *   the loop exactly as it stood before #586 -- so this column is the "before"
 *   figure measured in this tree. The same shape run against `ceb6865e` itself
 *   is in the commit that landed this file, and agrees with it.
 * - **uncrowded** -- the system with its capacity source wired, over a
 *   prison with a bed for everybody. Pays the capacity walk and the table
 *   read, adds zero.
 * - **crowded** -- the same, over a prison holding twice its beds, so every
 *   prisoner takes the extra `safety` and `hygiene` rate.
 * - **walk** -- `accommodationCapacityOf` alone, over the uncrowded prison's
 *   room count, which is the one cost this term adds that scales with rooms
 *   rather than prisoners.
 *
 * The capacity walk is priced at a realistic room count, not a toy one: half
 * as many single cells as prisoners in the crowded prison (so 2,500 room
 * instances at 5,000 prisoners), and as many as prisoners in the uncrowded
 * one. It is `accommodationCapacityOf` over a stand-in registry whose
 * `allByRoomCatalogId` returns a prebuilt array, which is what the real
 * registry's cached sort returns.
 *
 * Method is `measure.ts`'s and `docs/BENCHMARKING.md`'s: warmup discarded,
 * the **minimum** reported as the uncontended estimate, the median beside it.
 * **Reporting only** -- nothing here asserts an elapsed time. The assertions
 * are on the levels the update writes.
 */

const POPULATIONS = [200, 1_000, 5_000] as const;
const PRISONER_COMPONENT_ID = 0;
const CONTEXT = { tick: 10 } as unknown as SimulationContext;

function cells(count: number): readonly RoomInstance[] {
  return Array.from(
    { length: count },
    (_unused, index) =>
      ({ instanceId: `cell-${String(index)}`, roomCatalogId: 'room.cell', residentCapacity: 1, objectCapabilities: ['sleep-surface'] }) as unknown as RoomInstance,
  );
}

function population(size: number) {
  const store = new EntityStore(size);
  const bitset = new ComponentBitset(size);
  const query = new EntityQuery(store, bitset);
  query.mask.require(PRISONER_COMPONENT_ID);
  const needs = new NeedsComponent(size);
  for (let index = 0; index < size; index += 1) {
    const entityId = store.spawn();
    bitset.add(store.getIndex(entityId), PRISONER_COMPONENT_ID);
  }
  return { store, query, needs };
}

function resetNeeds(needs: NeedsComponent): void {
  for (const needId of NEED_IDS) needs.levels[needId].fill(NEED_MAX_SCALED);
}

describe('the crowding term on the need update (#586)', () => {
  it('prices the update before, uncrowded and crowded, at the populations the repository benchmarks', () => {
    const rows: string[][] = [];

    for (const size of POPULATIONS) {
      const plain = population(size);
      const uncrowded = population(size);
      const crowded = population(size);
      const roomy = cells(size);
      const tight = cells(size / 2);
      const roomySource = { allByRoomCatalogId: (id: string) => (id === 'room.cell' ? roomy : []) };
      const tightSource = { allByRoomCatalogId: (id: string) => (id === 'room.cell' ? tight : []) };
      const plainSystem = new NeedsDecaySystem(plain.store, plain.query, plain.needs);
      const uncrowdedSystem = new NeedsDecaySystem(uncrowded.store, uncrowded.query, uncrowded.needs, () => accommodationCapacityOf(roomySource));
      const crowdedSystem = new NeedsDecaySystem(crowded.store, crowded.query, crowded.needs, () => accommodationCapacityOf(tightSource));
      const interval = uncrowdedSystem.schedule.intervalTicks;

      // Correctness first, on one update from full.
      plainSystem.update(CONTEXT);
      uncrowdedSystem.update(CONTEXT);
      crowdedSystem.update(CONTEXT);
      expect(accommodationCapacityOf(roomySource)).toBe(size);
      expect(accommodationCapacityOf(tightSource)).toBe(size / 2);
      for (const needId of NEED_IDS) {
        expect(uncrowded.needs.levels[needId][size - 1], `${needId}: uncrowded decays at the base rate`).toBe(
          NEED_MAX_SCALED - NEED_DECAY_SCALED_PER_TICK[needId] * interval,
        );
        expect(Array.from(uncrowded.needs.levels[needId])).toEqual(Array.from(plain.needs.levels[needId]));
        const extra = crowdingExtraDecayScaledPerTick(needId, 1_000);
        expect(crowded.needs.levels[needId][size - 1]).toBe(NEED_MAX_SCALED - (NEED_DECAY_SCALED_PER_TICK[needId] + extra) * interval);
      }

      // Levels are reset inside every sample so each does the same work from
      // the same state and none runs against a clamped floor; the reset is a
      // six-array fill and is the same in every column.
      const iterations = size >= 5_000 ? 60 : 200;
      const time = (system: NeedsDecaySystem, needs: NeedsComponent) =>
        measureSync(20, iterations, () => {
          resetNeeds(needs);
          system.update(CONTEXT);
        });
      const plainStats = time(plainSystem, plain.needs);
      const uncrowdedStats = time(uncrowdedSystem, uncrowded.needs);
      const crowdedStats = time(crowdedSystem, crowded.needs);
      const walkStats = measureSync(20, iterations, () => {
        accommodationCapacityOf(roomySource);
      });

      rows.push([
        String(size),
        `${formatMs(plainStats.min)} / ${formatMs(plainStats.median)}`,
        `${formatMs(uncrowdedStats.min)} / ${formatMs(uncrowdedStats.median)}`,
        `${formatMs(crowdedStats.min)} / ${formatMs(crowdedStats.median)}`,
        `${formatMs(walkStats.min)} / ${formatMs(walkStats.median)}`,
        formatMs((crowdedStats.min - plainStats.min) / interval),
      ]);
    }

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '[crowding need decay] min / median ms per update (one update per 10 ticks)',
        environmentSummary(),
        renderTable(['prisoners', 'no source', 'uncrowded', 'crowded', 'walk', 'crowded - no source, ms/tick'], rows),
      ].join('\n'),
    );
  });
});
