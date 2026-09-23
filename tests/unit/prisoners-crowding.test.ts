import { describe, expect, it } from 'vitest';
import {
  accommodationCapacityOf,
  CROWDING_EXCESS_CAP_PERMILLE,
  CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP,
  crowdingExcessPermille,
  crowdingExtraDecayScaledPerTick,
  crowdingExtraDecayTable,
  isCrowdingAcceleratingDecay,
} from '../../src/simulation/prisoners/crowding';
import { decayNeed, NEED_DECAY_SCALED_PER_TICK, NEED_IDS, NEED_MAX_SCALED } from '../../src/simulation/prisoners/needs';
import type { RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';

/**
 * The arithmetic of issue #586's crowding term, in isolation. The prison-level
 * behaviour -- what a player pays for it, and what the strip says -- is
 * `tests/integration/crowding-need-decay.test.ts`.
 *
 * Watched failing (`docs/AGENT_WORKFLOW.md` §3): with the `Math.floor` removed
 * from `crowdingExtraDecayScaledPerTick` -- the #978 hazard, a slope times an
 * excess left fractional -- `3 failed | 7 passed` here: the whole-number walk,
 * the table, and the too-small-excess case.
 */

describe('how far over capacity a prison is', () => {
  it('is zero at or under capacity, and for a prison with no accommodation at all', () => {
    expect(crowdingExcessPermille(0, 0)).toBe(0);
    expect(crowdingExcessPermille(12, 0), 'an unfurnished prison is not crowded (ADR 0075)').toBe(0);
    expect(crowdingExcessPermille(11, 12)).toBe(0);
    expect(crowdingExcessPermille(12, 12)).toBe(0);
  });

  it('is floor((population - capacity) * 1000 / capacity), clamped at twice capacity', () => {
    expect(crowdingExcessPermille(13, 12)).toBe(83);
    expect(crowdingExcessPermille(15, 12)).toBe(250);
    expect(crowdingExcessPermille(18, 12)).toBe(500);
    expect(crowdingExcessPermille(24, 12)).toBe(1_000);
    expect(crowdingExcessPermille(48, 12), 'four times capacity is clamped at the cap').toBe(CROWDING_EXCESS_CAP_PERMILLE);
  });
});

describe('the extra decay crowding adds', () => {
  it('is a whole number of stored units at every excess, for every need -- #978, not a factor', () => {
    // The property `NEED_SCALE` exists for: a fractional rate would be
    // rounded somewhere, and the authored and executed rates would differ
    // with every test green. Walked over every reachable excess rather than
    // sampled.
    for (let excess = 0; excess <= CROWDING_EXCESS_CAP_PERMILLE + 500; excess += 1) {
      for (const needId of NEED_IDS) {
        expect(Number.isInteger(crowdingExtraDecayScaledPerTick(needId, excess)), `${needId} at ${String(excess)}`).toBe(true);
      }
    }
    for (const slope of Object.values(CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP)) expect(Number.isInteger(slope)).toBe(true);
  });

  it('moves only safety and hygiene, and never goes below zero or past the slope', () => {
    for (let excess = 0; excess <= CROWDING_EXCESS_CAP_PERMILLE + 500; excess += 25) {
      const table = crowdingExtraDecayTable(excess);
      for (const needId of NEED_IDS) {
        const slope = CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP[needId] ?? 0;
        expect(table[needId]).toBeGreaterThanOrEqual(0);
        expect(table[needId]).toBeLessThanOrEqual(slope);
      }
      expect(table.hunger + table.sleep + table.bladder + table.recreation).toBe(0);
    }
  });

  it('matches the table the slopes were chosen against', () => {
    // `CROWDING_EXTRA_DECAY_SCALED_PER_TICK_AT_CAP`'s docblock, row by row.
    const safetyAt = (population: number) => crowdingExtraDecayScaledPerTick('safety', crowdingExcessPermille(population, 100));
    expect(safetyAt(110)).toBe(4);
    expect(safetyAt(115)).toBe(6);
    expect(safetyAt(125)).toBe(10);
    expect(safetyAt(150)).toBe(20);
    expect(safetyAt(200)).toBe(40);
    const hygieneAt = (population: number) => crowdingExtraDecayScaledPerTick('hygiene', crowdingExcessPermille(population, 1_000));
    expect(hygieneAt(1_124), 'hygiene is untouched below 12.5% over').toBe(0);
    expect(hygieneAt(1_125)).toBe(1);
    expect(hygieneAt(1_250)).toBe(2);
    expect(hygieneAt(2_000)).toBe(8);
    // 115% is the break-even the docblock names: the extra equals what a
    // covered sector provisions over the base decay (16 - 10).
    expect(safetyAt(115)).toBe(16 - NEED_DECAY_SCALED_PER_TICK.safety);
  });

  it('adds to the base rate inside decayNeed and keeps it exactly linear in the ticks', () => {
    const extra = crowdingExtraDecayScaledPerTick('safety', 500);
    const once = decayNeed(NEED_MAX_SCALED, 'safety', 100, extra);
    let split = NEED_MAX_SCALED;
    for (let call = 0; call < 10; call += 1) split = decayNeed(split, 'safety', 10, extra);
    expect(once).toBe(NEED_MAX_SCALED - (NEED_DECAY_SCALED_PER_TICK.safety + extra) * 100);
    expect(split).toBe(once);
    expect(decayNeed(NEED_MAX_SCALED, 'safety', 100), 'defaulted to no crowding').toBe(NEED_MAX_SCALED - NEED_DECAY_SCALED_PER_TICK.safety * 100);
  });
});

describe('whether crowding is running, which is what the strip says', () => {
  it('is false at or under capacity and in an unfurnished prison', () => {
    expect(isCrowdingAcceleratingDecay(12, 12)).toBe(false);
    expect(isCrowdingAcceleratingDecay(5, 0)).toBe(false);
  });

  it('is false for an excess too small to move any rate, so the strip cannot claim a cost that is not charged', () => {
    // 101 in 100 is 10 permille: floor(40 x 10 / 1000) = 0.
    expect(crowdingExtraDecayTable(crowdingExcessPermille(101, 100)).safety).toBe(0);
    expect(isCrowdingAcceleratingDecay(101, 100)).toBe(false);
    expect(isCrowdingAcceleratingDecay(103, 100)).toBe(true);
  });

  it('never stands without safety running faster, which is what the sentence it paints says first', () => {
    // `hud.security.coverage-overcrowded-hint` names safety unconditionally
    // and hygiene "past a point"; that is only true while safety's slope is at
    // least hygiene's at every excess.
    for (let population = 100; population <= 300; population += 1) {
      if (!isCrowdingAcceleratingDecay(population, 100)) continue;
      const excess = crowdingExcessPermille(population, 100);
      expect(crowdingExtraDecayScaledPerTick('safety', excess), `at ${String(population)} of 100`).toBeGreaterThan(0);
    }
  });
});

describe('the capacity crowding is measured against', () => {
  function instance(instanceId: string, roomCatalogId: string, residentCapacity: number, objectCapabilities: readonly string[]): RoomInstance {
    return { instanceId, roomCatalogId, residentCapacity, objectCapabilities } as unknown as RoomInstance;
  }

  it('sums the resident capacity of the rooms an arrival may be housed in, once each, with the capability checked', () => {
    const rooms: Record<string, readonly RoomInstance[]> = {
      'room.cell': [instance('a', 'room.cell', 2, ['sleep-surface']), instance('b', 'room.cell', 1, ['sleep-surface'])],
      'room.solitary-cell': [instance('c', 'room.solitary-cell', 1, ['sleep-surface'])],
      'room.infirmary': [instance('d', 'room.infirmary', 4, ['sleep-surface'])],
    };
    const source = { allByRoomCatalogId: (id: string) => rooms[id] ?? [] };
    // Cells and solitary cells (the shipped policy's two targets); the
    // infirmary's medical beds are not somewhere an arrival sleeps.
    expect(accommodationCapacityOf(source)).toBe(4);

    const withoutBed = { allByRoomCatalogId: (id: string) => (id === 'room.cell' ? [instance('e', 'room.cell', 3, [])] : []) };
    expect(accommodationCapacityOf(withoutBed), 'a room without the capability the policy names is not a place').toBe(0);
  });
});
