import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityStore } from '../entity/entity-store';
import type { EntityQuery } from '../entity/query';
import { decayNeed, NEED_IDS, type NeedsComponent } from './needs';

/**
 * Scheduled need decay (issue #24): runs every `intervalTicks`, decaying
 * every need by exactly that many ticks' worth in one batch -- not once
 * per kernel tick per need.
 *
 * `decayNeed` works in the scaled units `NeedsComponent` stores (see
 * `NEED_SCALE`) and is exactly linear in `ticksElapsed`, so the batch size
 * below cannot change what a run computes: N ticks in one call and the same
 * N ticks split across calls land on the same level. `intervalTicks` is
 * therefore a scheduling choice -- how much work per tick -- in the same
 * sense as every other multi-rate cadence, and not a balance lever.
 *
 * Until #259 that was not true. Decay rounded to a whole level per call
 * against a `Uint8Array`, and every rate in `NEED_DECAY_PER_TICK` is well
 * under one level per tick, so `Math.round(n - d) === n` held for five of
 * the six needs at this cadence and they never decayed at all. Which needs
 * moved was a property of `intervalTicks`, which is exactly what it must
 * not be.
 */
export class NeedsDecaySystem implements SystemRegistration {
  public readonly id = 'prisoners.needs-decay';
  public readonly order = 60;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly needs: NeedsComponent,
  ) {}

  public update(_context: SimulationContext): void {
    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      for (const needId of NEED_IDS) {
        this.needs.setScaled(index, needId, decayNeed(this.needs.getScaled(index, needId), needId, this.schedule.intervalTicks));
      }
    }
  }
}
