import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityStore } from '../entity/entity-store';
import type { EntityQuery } from '../entity/query';
import { crowdingExcessPermille, crowdingExtraDecayTable } from './crowding';
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
 *
 * ## Crowding (issue #586)
 *
 * Since the owner's ruling on #586 a prison holding more prisoners than it has
 * beds decays `safety` and `hygiene` faster, for every prisoner, by the extra
 * rate `./crowding.ts` derives from the excess (read the module docblock there
 * for the ruling, the definition and the numbers). The excess is sampled
 * **once per update**, from the population this walk is about to decay and the
 * capacity `accommodationCapacity` reports now, and held fixed across the
 * batch -- so an uncrowded prison runs the loop exactly as it was before #586,
 * a crowded one pays one table read and one integer add per need per
 * prisoner (`tests/perf/crowding-need-decay.perf.ts` prices both), and the
 * batch stays exactly linear in `intervalTicks` for as long as
 * the population and the beds stand still. A prisoner admitted or a bed
 * finished mid-batch moves the rate at the next update, at most
 * `intervalTicks - 1` ticks late: the same sampling grain
 * `SafetyCoverageSystem` already reads coverage at, and far below anything the
 * income line can see.
 *
 * `accommodationCapacity` is optional so a fixture that stands up needs alone
 * decays exactly as it did before #586; `PrisonerOperationsRuntime` always
 * passes it.
 */
export class NeedsDecaySystem implements SystemRegistration {
  public readonly id = 'prisoners.needs-decay';
  public readonly order = 60;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly needs: NeedsComponent,
    private readonly accommodationCapacity?: () => number,
    private readonly hasCleanKit?: (entityId: number) => boolean,
  ) {}

  public update(_context: SimulationContext): void {
    const entityIds = this.query.execute();
    const excessPermille =
      this.accommodationCapacity === undefined ? 0 : crowdingExcessPermille(entityIds.length, this.accommodationCapacity());
    if (excessPermille === 0) {
      // The ordinary prison, and the loop exactly as it stood before #586:
      // the crowding term costs an uncrowded update nothing per prisoner.
      for (const entityId of entityIds) {
        const index = this.store.getIndex(entityId);
        for (const needId of NEED_IDS) {
          this.needs.setScaled(index, needId, decayNeed(this.needs.getScaled(index, needId), needId, this.schedule.intervalTicks, 0, needId === 'hygiene' && this.hasCleanKit?.(entityId) ? 0.5 : 1));
        }
      }
      return;
    }
    const extra = crowdingExtraDecayTable(excessPermille);
    for (const entityId of entityIds) {
      const index = this.store.getIndex(entityId);
      for (const needId of NEED_IDS) {
        this.needs.setScaled(index, needId, decayNeed(this.needs.getScaled(index, needId), needId, this.schedule.intervalTicks, extra[needId], needId === 'hygiene' && this.hasCleanKit?.(entityId) ? 0.5 : 1));
      }
    }
  }
}
