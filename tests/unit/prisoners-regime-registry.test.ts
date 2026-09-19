import { describe, expect, it } from 'vitest';
import {
  ACTION_CATEGORIES,
  DAY_LENGTH_TICKS,
  DEFAULT_REGIME_SCHEDULES,
  GENERAL_POPULATION_REGIME,
  HIGH_RISK_REGIME,
  type RegimeSchedule,
} from '../../src/simulation/prisoners/regime';
import { CLASSIFICATION_GROUP_IDS } from '../../src/simulation/prisoners/components';
import { RegimeScheduleRegistry, orderRegimeSchedules } from '../../src/simulation/prisoners/regime-registry';

/**
 * `RegimeScheduleRegistry`, the session state `EditRegimeBlock` writes
 * ([ADR 0113](../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)).
 *
 * The refusals are the part this file exists for. `AGENTS.md` article 5 --
 * a refusal must never read as a success -- is checked here as a statement
 * about *state* rather than about a return value: after each refusal the
 * registry's schedules are asserted identical, by value, to what they were
 * before. A `{ kind: 'refused' }` returned beside a mutated schedule would
 * pass a return-value assertion and fail these.
 */

const ORIGINAL = () => new RegimeScheduleRegistry().all();

describe('RegimeScheduleRegistry', () => {
  it('seeds from the two authored schedules, in `CLASSIFICATION_GROUP_IDS` order', () => {
    const registry = new RegimeScheduleRegistry();
    expect(registry.all().map((s) => s.classificationGroupId)).toEqual([...CLASSIFICATION_GROUP_IDS]);
    expect(DEFAULT_REGIME_SCHEDULES.map((s) => s.classificationGroupId)).toEqual([...CLASSIFICATION_GROUP_IDS]);
  });

  it('puts the catalogue ids first in declaration order and any others after them, whatever order it is handed', () => {
    const day = (id: string): RegimeSchedule => ({
      classificationGroupId: id,
      blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: ['sleep'] }],
    });

    // Deliberately reversed, and with two ids outside the closed catalogue
    // interleaved, so neither insertion order nor a plain lexicographic sort
    // would produce the expected answer: `high-risk` precedes
    // `general-population` alphabetically, and both must precede `aardvark`.
    const handed = [day('zebra'), day('high-risk'), day('aardvark'), day('general-population')];

    expect(orderRegimeSchedules(handed).map((s) => s.classificationGroupId)).toEqual([
      'general-population',
      'high-risk',
      'aardvark',
      'zebra',
    ]);
    expect(new RegimeScheduleRegistry(handed).all().map((s) => s.classificationGroupId)).toEqual([
      'general-population',
      'high-risk',
      'aardvark',
      'zebra',
    ]);
  });

  it('normalises a block\'s categories into `ACTION_CATEGORIES` order, so two click orders are one state', () => {
    const a = new RegimeScheduleRegistry();
    const b = new RegimeScheduleRegistry();

    expect(a.editBlock('general-population', 1_000, ['recreation', 'meal', 'work']).kind).toBe('applied');
    expect(b.editBlock('general-population', 1_000, ['work', 'recreation', 'meal']).kind).toBe('applied');

    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    const block = a.all()[0]?.blocks.find((candidate) => candidate.startTickOfDay === 1_000);
    expect(block?.allowedCategories).toEqual(['meal', 'work', 'recreation']);
    expect(block?.allowedCategories.map((c) => ACTION_CATEGORIES.indexOf(c))).toEqual([1, 2, 3]);
  });

  it('edits one group only, and never moves a boundary', () => {
    const registry = new RegimeScheduleRegistry();
    const before = registry.all();

    expect(registry.editBlock('high-risk', 2_000, ['sleep']).kind).toBe('applied');

    const highRisk = registry.all().find((s) => s.classificationGroupId === 'high-risk');
    expect(highRisk?.blocks.map((b) => [b.startTickOfDay, b.endTickOfDay])).toEqual(
      HIGH_RISK_REGIME.blocks.map((b) => [b.startTickOfDay, b.endTickOfDay]),
    );
    expect(highRisk?.blocks.find((b) => b.startTickOfDay === 2_000)?.allowedCategories).toEqual(['sleep']);
    // `general-population` is untouched, which is the whole of "per group".
    expect(registry.all().find((s) => s.classificationGroupId === 'general-population')).toEqual(
      before.find((s) => s.classificationGroupId === 'general-population'),
    );
  });

  it('refuses an unknown group and changes nothing', () => {
    const registry = new RegimeScheduleRegistry();
    const before = registry.getSnapshot();

    const outcome = registry.editBlock('medium-risk', 0, ['work']);

    expect(outcome).toEqual({ kind: 'refused', reason: 'unknown-group' });
    expect(registry.getSnapshot()).toEqual(before);
    expect(registry.all()).toEqual(ORIGINAL());
  });

  it('refuses a tick that names no block start, and does not snap to the block containing it', () => {
    const registry = new RegimeScheduleRegistry();
    const before = registry.getSnapshot();

    // 1,100 is *inside* general population's [1,000, 1,200) recreation block
    // and is not its start. Snapping is the failure being ruled out: it would
    // rewrite a block the player did not name and report success.
    const outcome = registry.editBlock('general-population', 1_100, ['sleep']);

    expect(outcome).toEqual({ kind: 'refused', reason: 'unknown-block' });
    expect(registry.getSnapshot()).toEqual(before);
    expect(registry.all().find((s) => s.classificationGroupId === 'general-population')?.blocks.find((b) => b.startTickOfDay === 1_000)?.allowedCategories).toEqual(
      GENERAL_POPULATION_REGIME.blocks.find((b) => b.startTickOfDay === 1_000)?.allowedCategories,
    );
  });

  it('round-trips through its own snapshot, and re-orders rows the save listed the other way', () => {
    const registry = new RegimeScheduleRegistry();
    registry.editBlock('high-risk', 2_000, ['education']);
    const snapshot = registry.getSnapshot();

    const restored = new RegimeScheduleRegistry();
    restored.loadSnapshot([...snapshot].reverse());

    expect(restored.getSnapshot()).toEqual(snapshot);
  });

  it('refuses a snapshot whose blocks do not tile the day, rather than discovering it a tick at a time', () => {
    const registry = new RegimeScheduleRegistry();
    expect(() =>
      registry.loadSnapshot([
        {
          classificationGroupId: 'general-population',
          blocks: [{ startTickOfDay: 0, endTickOfDay: 100, allowedCategories: ['sleep'] }],
        },
      ]),
    ).toThrow(RangeError);
  });

  it('refuses two schedules for one group', () => {
    const one: RegimeSchedule = {
      classificationGroupId: 'high-risk',
      blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, allowedCategories: ['sleep'] }],
    };
    expect(() => new RegimeScheduleRegistry([one, one])).toThrow(RangeError);
  });

  it('hands out copies, so a caller cannot edit the day by mutating what it read', () => {
    const registry = new RegimeScheduleRegistry();
    const seed = [...DEFAULT_REGIME_SCHEDULES];
    const fromSeed = new RegimeScheduleRegistry(seed);

    // Mutating the seeded array afterwards must not reach the registry.
    seed.length = 0;
    expect(fromSeed.all()).toHaveLength(2);

    const snapshot = registry.getSnapshot();
    (snapshot[0]?.blocks[0]?.allowedCategories as string[]).push('work');
    expect(registry.all()[0]?.blocks[0]?.allowedCategories).toEqual(GENERAL_POPULATION_REGIME.blocks[0]?.allowedCategories);
  });
});
