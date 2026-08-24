import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NEED_IDS, NEED_MAX } from '../../src/simulation/prisoners/needs';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { NamedRngStreams } from '../../src/simulation/rng/streams';
import { buildPrisonerScenarioFixture } from '../helpers/prisoner-fixture';

const RNG_STREAM = 'prisoners.classification';

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
  it('drops every need in NEED_IDS below NEED_MAX within a bounded number of ticks', () => {
    const fixture = buildPrisonerScenarioFixture({ cellCount: 8, capacity: 4 });
    const kernel = new Kernel(0, 0, new NamedRngStreams([{ name: RNG_STREAM, state: deriveXoshiroState(0xdecaf, RNG_STREAM) }]));
    fixture.registerOn(kernel);

    const entityId = fixture.prisoners.admitPrisoner({ sentenceLengthTicks: 500_000, priorIncidents: 1 }, fixture.originTile);
    const index = fixture.prisoners.entityStore.getIndex(entityId);

    // Bounded at both ends, and both ends matter. Long enough for the slowest
    // need (`safety`, 0.01 per tick) to cross a whole level -- 100 ticks --
    // and short enough that the action system has not yet fulfilled one back
    // up to `NEED_MAX`, which it starts doing a few hundred ticks in once
    // intake and travel have completed. 200 ticks leaves margin on both
    // sides: measured here, the six needs sit at 245-253.
    const TICKS = 200;
    for (let tick = 0; tick < TICKS; tick += 1) kernel.step();

    for (const needId of NEED_IDS) {
      expect(fixture.prisoners.needs.get(index, needId), `${needId} never decayed over ${TICKS} ticks`).toBeLessThan(NEED_MAX);
    }
  });
});
