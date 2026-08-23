import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityStore } from '../entity/entity-store';
import type { EntityQuery } from '../entity/query';
import { decayNeed, NEED_IDS, type NeedsComponent } from './needs';

/**
 * Scheduled need decay (issue #24): runs every `intervalTicks`, decaying
 * every need by exactly that many ticks' worth in one batch -- not once
 * per kernel tick per need. `decayNeed` rounds to an integer level per
 * call, so this only needs to be called at one *consistent* batch size
 * (`schedule.intervalTicks`, fixed) to stay deterministic -- it is not
 * required to (and for sub-1-per-tick rates, does not) match what calling
 * it once per single tick would produce; see needs.ts's decay-rate table.
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
        this.needs.set(index, needId, decayNeed(this.needs.get(index, needId), needId, this.schedule.intervalTicks));
      }
    }
  }
}
