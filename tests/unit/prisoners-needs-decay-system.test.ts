import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NEED_IDS, NEED_MAX, NEED_SCALE, type NeedId } from '../../src/simulation/prisoners/needs';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';

/**
 * Bounded at both ends, and both ends matter. Long enough for the slowest
 * need (`safety`, 0.01 per tick) to cross a whole level -- 100 ticks -- and
 * short enough that the action system has not yet fulfilled one back up
 * toward `NEED_MAX`, which it starts doing a few hundred ticks in once intake
 * and travel have completed. At 200 ticks every need is still on pure decay,
 * which is what lets the exact table below be exact.
 */
const TICKS = 200;

/**
 * The level and stored value each need holds after exactly `TICKS` ticks of
 * decay from `NEED_MAX`, through the real kernel.
 *
 * Written as literals rather than recomputed from `NEED_DECAY_PER_TICK`: a
 * test that derives its expectation from the same constant it is checking
 * agrees with any value that constant takes, including a wrong one. These
 * numbers are `255 - rate * 200` -- hunger 255-10, sleep 255-6, hygiene
 * 255-4, bladder 255-16, safety 255-10, recreation 255-3 -- and were measured
 * against the live runtime, identical across five classification seeds
 * because no RNG-driven behaviour touches a need this early.
 *
 * `scaled` is the same value in the units `NeedsComponent` actually stores
 * (`NEED_SCALE` per level). Pinning it as well as the rounded level is the
 * part that keeps #259 from returning quietly: the whole-level view rounds,
 * so a decay step that is once again too small to register would still print
 * a plausible level for a while, whereas the stored value moves or it does
 * not.
 */
const EXPECTED_AFTER_TICKS: Readonly<Record<NeedId, { readonly level: number; readonly scaled: number }>> = {
  hunger: { level: 245, scaled: 49_000 },
  sleep: { level: 249, scaled: 49_800 },
  hygiene: { level: 251, scaled: 50_200 },
  bladder: { level: 239, scaled: 47_800 },
  // 255-10, the same step as `hunger`, since issue #588 raised
  // `NEED_DECAY_PER_TICK.safety` from 0.01 to 0.05. It was 255-2 -- a need
  // that took 20,400 ticks to reach the state's unmet line, longer than most
  // sentences, which is what made guard coverage unable to cost a prison
  // anything through it.
  safety: { level: 245, scaled: 49_000 },
  recreation: { level: 252, scaled: 50_400 },
};

/**
 * That a need actually *changes* over time, through the real kernel.
 *
 * Nothing asserted this before #259, and the gap was not academic: deleting
 * `NeedsDecaySystem.update`'s body entirely left the whole suite green except
 * for two tests that only require *some* need to have moved, and `bladder`
 * was the one that had. Five of the six needs were frozen at `NEED_MAX`
 * forever -- `Math.round(n - d) === n` for any integer `n` and any `d <= 0.5`,
 * and at the system's ten-tick cadence every rate but `bladder`'s produced
 * such a `d` -- and no test could tell.
 *
 * So this iterates `NEED_IDS` and requires *each* one to have moved. A
 * seventh need added to that list is covered with no edit here, which is the
 * property that keeps the gap closed rather than merely patched.
 */
describe('needs decay is observable through the real kernel', () => {
  function runOnePrisoner() {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 8, capacity: 4 });
    const kernel = new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(0xdecaf, RNG_STREAM) }]));
    fixture.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 500_000, priorIncidents: 1 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);
    for (let tick = 0; tick < TICKS; tick += 1) kernel.step();
    return { needs: fixture.prisoners.needs, index };
  }

  it('drops every need in NEED_IDS below NEED_MAX within a bounded number of ticks', () => {
    const { needs, index } = runOnePrisoner();

    for (const needId of NEED_IDS) {
      expect(needs.get(index, needId), `${needId} never decayed over ${TICKS} ticks`).toBeLessThan(NEED_MAX);
    }
  });

  it(`decays every need to its exact expected level after ${TICKS} ticks`, () => {
    // The assertion above catches a need that is frozen outright. This one
    // also catches a need decaying at the wrong rate, or at a rate the stored
    // scale cannot represent exactly -- the two ways #259 could come back
    // without any need being pinned at `NEED_MAX`.
    const { needs, index } = runOnePrisoner();

    for (const needId of NEED_IDS) {
      const expected = EXPECTED_AFTER_TICKS[needId];
      expect(needs.getScaled(index, needId), `${needId} stored value after ${TICKS} ticks`).toBe(expected.scaled);
      expect(needs.get(index, needId), `${needId} level after ${TICKS} ticks`).toBe(expected.level);
    }
  });

  it('states an expectation for every need, so a new need cannot skip the pin', () => {
    // Without this, adding a seventh need to `NEED_IDS` and forgetting the
    // table entry would make the exact test above read `undefined` for it.
    expect(Object.keys(EXPECTED_AFTER_TICKS).sort()).toEqual([...NEED_IDS].sort());
    for (const needId of NEED_IDS) {
      const expected = EXPECTED_AFTER_TICKS[needId];
      expect(expected.scaled, `${needId} table entry disagrees with itself`).toBe(expected.level * NEED_SCALE);
      // The table must encode a decrease, or the exact test above would
      // happily pin a need back at its starting value.
      expect(expected.level, `${needId} is pinned at NEED_MAX -- that is the #259 defect, not an expectation`).toBeLessThan(NEED_MAX);
    }
  });
});
