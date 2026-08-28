import type { EntityId, EntityStore } from '../entity/entity-store';
import type { EntityQuery } from '../entity/query';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { classifiedAtTickOf } from './classification-review-system';
import { type IntakeStage, intakeStageFromIndex, type PrisonerRecordComponent } from './components';
import { releasePrisoner, type PrisonerReleaseSurfaces } from './release';

/**
 * How often the prison asks whose sentence has ended.
 *
 * Matched to `prisoners.actions`' 20-tick reconsideration cadence rather than
 * to `prisoners.classification-review`'s 24,000, and the reason is what a
 * player can see: 20 ticks is the finest resolution at which a prisoner is
 * observed doing anything at all, so a departure at that resolution is as
 * prompt as this simulation can render. A review-interval cadence would let a
 * sentence the HUD shows ending on day 43 run to day 53.
 *
 * The cost is one `Uint32Array` read and two integer comparisons per living
 * prisoner per interval -- at `DEFAULT_PRISONER_CAPACITY` (5,000) that is the
 * same `0..maxActiveIndex` walk `prisoners.actions`, `prisoners.needs-decay`
 * and `prisoners.intake` each already perform on their own cadence, with a far
 * smaller body.
 */
export const DISCHARGE_CHECK_INTERVAL_TICKS = 20;

/**
 * The stages at which a prisoner is serving a sentence that can end.
 *
 * `sentenceEndTick` is written once, at the `'classification'` stage
 * (`IntakeSystem.update`), and reads 0 in every slot before that -- so a check
 * that did not gate on the stage would discharge every arrival still queued at
 * reception, on the first scheduled tick, for a sentence that had not been
 * computed yet.
 *
 * `'failed'` is included, and that is a deliberate difference from
 * `ClassificationReviewSystem`'s `REVIEWABLE_STAGES`, which excludes it. The
 * two answer different questions. A tier written at `'failed'` could never
 * reach a regime, so writing one is pointless; but a `'failed'` record is a
 * prisoner the prison is holding, counted in the population and drawn on the
 * map, whose sentence is running exactly like anybody else's. Until now that
 * stage was, in `IntakeSystem`'s own words, *"a permanent, undeletable, inert
 * record"* with *"nothing releases a prisoner either (#31)"* as the reason.
 * This is what stops it being permanent.
 */
const SENTENCE_BEARING_STAGES: readonly IntakeStage[] = ['accommodation-assignment', 'completed', 'failed'];

export interface PrisonerDischargeMetrics {
  /**
   * How many prisoners have left at the end of their sentence this session.
   *
   * Observability only, and **not persisted** -- the same standing
   * `IntakeMetrics` and `ClassificationReviewMetrics` have. Safe to reset on
   * restore because nothing reads it back into simulation state: who is still
   * in the prison is the entity store's answer, not this counter's.
   */
  readonly dischargedCount: number;
}

/**
 * The end of a sentence: issue #441.
 *
 * ## What was wrong
 *
 * `sentenceEndTick` was written by `IntakeSystem`, carried by the save format
 * and published to the player as `PrisonerDetailViewModel.sentence.endTick`,
 * and **no code in `src/` compared it against `context.tick`**. A prison's
 * population could only ever rise. The displayed sentence end was a promise the
 * simulation did not keep, which is the class of defect `AGENTS.md` reserves to
 * the owner -- and issue #441, written by the owner, states the outcome it
 * wants: *"the prisoner leaves and their place, bed and accommodation are
 * freed."* This system is that comparison; `releasePrisoner` is that freeing.
 *
 * ## What it does not do
 *
 * The prisoner leaves at the tick their sentence ends. They do not walk to a
 * gate, because there is no gate: `world.setOwned` has one call site at session
 * creation, no room-catalog entry names an exit, and no action targets one.
 * ADR-XXXX decision 4 records that an instantaneous departure is slice 1 and
 * what slice 2 would need. Nothing here models parole, reoffending, a release
 * ceremony, an inspection consequence or a reputation effect -- those are #31
 * and `docs/ROADMAP.md` Phase 9, and this system deliberately builds none of
 * them.
 *
 * ## Determinism
 *
 * - **No RNG.** `context.rng` is not touched, so no named stream advances and
 *   no new stream is registered (which would have been a save-compatibility
 *   cost, #415).
 * - **No clock but `context.tick`**, compared against a persisted field.
 * - **Canonical iteration.** `EntityQuery.execute()` returns a materialised
 *   array in ascending entity index -- the same walk `IntakeSystem`,
 *   `NeedsDecaySystem`, `ClassificationReviewSystem` and `ActionSystem` use --
 *   so releasing during the loop cannot perturb it.
 * - **Order-independent anyway.** Whether a prisoner is due is a pure function
 *   of their own two record fields and the tick; nothing this pass writes is
 *   read by it.
 */
export class PrisonerDischargeSystem implements SystemRegistration {
  public readonly id = 'prisoners.discharge';

  /**
   * After `prisoners.needs-decay` (60) and before `navigation` (150),
   * `prisoners.actions` (250) and `operations.jobs` (260).
   *
   * The ordering is the whole of the "nothing half-leaves" argument at tick
   * granularity: a prisoner released at order 65 cannot be handed an action, a
   * route or a haulage job later in the same tick, so no system downstream ever
   * observes an entity that is on its way out.
   */
  public readonly order = 65;

  /**
   * `phaseTicks: 0`, so this runs on the same ticks `prisoners.actions` does
   * and wins them on `order`. A non-zero phase would interleave the two and
   * make "released before it could be given something to do" true on some ticks
   * and not others.
   */
  public readonly schedule = { intervalTicks: DISCHARGE_CHECK_INTERVAL_TICKS, phaseTicks: 0 };

  private dischargedCount = 0;

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly records: PrisonerRecordComponent,
    private readonly surfaces: PrisonerReleaseSurfaces,
  ) {}

  public getMetrics(): PrisonerDischargeMetrics {
    return { dischargedCount: this.dischargedCount };
  }

  /**
   * Whether this prisoner's sentence has ended by `tick`, asked without
   * releasing anybody.
   *
   * Separate from `update` so the decision is testable on its own and so a
   * projection could ask it, and it is where the two guards live:
   *
   * - **The stage guard**, above.
   * - **The wrap guard.** `sentenceEndTick` is a `Uint32Array` slot and
   *   `sentenceLengthTicks` may be up to `MAX_SENTENCE_LENGTH_TICKS`
   *   (`0xffff_ffff`), so `tick + length` wraps for a long enough sentence and
   *   the stored end tick is then a small number in the past. Without this
   *   guard, the longest sentences in the game would be the shortest: a
   *   prisoner would be released on the first scheduled tick after
   *   classification. `classifiedAtTickOf` is reused rather than reimplemented
   *   -- it already detects exactly this ("a wrapped sum is strictly less than
   *   the sentence length it was added to") for `ClassificationReviewSystem`,
   *   which likewise refuses to act on such a record. Their fates match by
   *   construction: a prisoner whose clock cannot be read is neither reviewed
   *   nor released.
   */
  public isSentenceComplete(index: number, tick: number): boolean {
    if (!SENTENCE_BEARING_STAGES.includes(intakeStageFromIndex(this.records.intakeStage[index]!))) return false;
    const sentenceEndTick = this.records.sentenceEndTick[index]!;
    if (classifiedAtTickOf(sentenceEndTick, this.records.sentenceLengthTicks[index]!) === undefined) return false;
    return tick >= sentenceEndTick;
  }

  /** The living prisoners whose sentence has ended by `tick`, ascending entity index. Public so a caller can see who is due without stepping the kernel. */
  public due(tick: number): readonly EntityId[] {
    const ready: EntityId[] = [];
    for (const entityId of this.query.execute()) {
      if (this.isSentenceComplete(this.store.getIndex(entityId), tick)) ready.push(entityId);
    }
    return ready;
  }

  public update(context: SimulationContext): void {
    for (const entityId of this.due(context.tick)) {
      if (releasePrisoner(this.surfaces, entityId)) this.dischargedCount += 1;
    }
  }
}
