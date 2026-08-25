import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId, EntityStore } from '../entity/entity-store';
import { EntityQuery } from '../entity/query';
import { ACTOR_IDENTITY_RNG_STREAM, type ActorIdentityMinter } from '../identity/actor-identity';
import { classifyPrisoner, type ClassificationInput } from './classification';
import {
  CLASSIFICATION_GROUP_IDS,
  classificationGroupIndex,
  type PrisonerColdState,
  PrisonerRecordComponent,
  intakeStageFromIndex,
  intakeStageIndex,
} from './components';
import type { RoomInstanceRegistry } from './room-instance-registry';

export interface IntakeMetrics {
  readonly completedCount: number;
  readonly failedCount: number;
  /** Cumulative ticks any prisoner has spent waiting in accommodation-assignment because every matching room instance was full -- observable unmet demand, not hidden success. */
  readonly accommodationBacklogTicks: number;
}

export interface AccommodationPolicy {
  /** Maps a classification group id to the room-catalog id and required object capability new arrivals of that group are assigned. */
  resolveTarget(classificationGroupId: string): { readonly roomCatalogId: string; readonly requiredObjectCapability?: string };
}

export const DEFAULT_ACCOMMODATION_POLICY: AccommodationPolicy = {
  resolveTarget(classificationGroupId) {
    if (classificationGroupId === 'high-risk') {
      return { roomCatalogId: 'room.solitary-cell', requiredObjectCapability: 'sleep-surface' };
    }
    return { roomCatalogId: 'room.cell', requiredObjectCapability: 'sleep-surface' };
  },
};

/**
 * Deterministic intake pipeline (issue #24): each entity advances at most
 * one stage per scheduled tick, in ascending entity-id order (via
 * `EntityQuery`, never Map/Set iteration order). `accommodation-assignment`
 * is retry-able, not a hard failure, while any room instance of the
 * required type could still free up -- it only becomes `'failed'` when no
 * instance of that room type exists in the registry at all, a structural
 * gap retrying can never fix.
 */
export class IntakeSystem implements SystemRegistration {
  public readonly id = 'prisoners.intake';
  public readonly order = 50;
  public readonly schedule = { intervalTicks: 5, phaseTicks: 0 };

  private completedCount = 0;
  private failedCount = 0;
  private accommodationBacklogTicks = 0;

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly records: PrisonerRecordComponent,
    private readonly coldState: PrisonerColdState,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly accommodationPolicy: AccommodationPolicy = DEFAULT_ACCOMMODATION_POLICY,
    private readonly rngStreamName = 'prisoners.classification',
    /**
     * Optional actor-identity minting (`src/simulation/identity/`). Left
     * out entirely, intake behaves exactly as before and draws nothing --
     * which matters, because `NamedRngStreams.get` throws for a stream the
     * session never registered, and a session that does not want names
     * should not have to register one.
     */
    private readonly identity?: ActorIdentityMinter,
    private readonly identityRngStreamName: string = ACTOR_IDENTITY_RNG_STREAM,
  ) {}

  public submitIntake(entityId: EntityId, input: ClassificationInput): void {
    const index = this.store.getIndex(entityId);
    this.records.sentenceLengthTicks[index] = input.sentenceLengthTicks;
    this.records.priorIncidentsAtIntake[index] = Math.min(255, input.priorIncidents);
    this.records.intakeStage[index] = intakeStageIndex('queued');
  }

  public getMetrics(): IntakeMetrics {
    return { completedCount: this.completedCount, failedCount: this.failedCount, accommodationBacklogTicks: this.accommodationBacklogTicks };
  }

  /**
   * Whether *any* classification group's accommodation target has at least
   * one registered room instance -- the precondition that decides whether an
   * arrival can end up waiting or is certain to fail (#261 step 4).
   *
   * It is the same predicate `update` applies at `accommodation-assignment`,
   * asked one stage earlier and about every group rather than about the one
   * this arrival was classified into. The difference between the two answers
   * is the whole reason this exists, and it is a difference in *kind*:
   *
   * - `allByRoomCatalogId(...).length === 0` is `'failed'`, and `'failed'` is
   *   **terminal**. No branch of `update` matches it, so a prisoner who
   *   reaches it stays there for the rest of the session -- measured:
   *   registering a matching room instance four hundred ticks later leaves
   *   the stage at `'failed'`. `ActionSystem` gates on `'completed'`
   *   (`action-system.ts`), and nothing in `src/` releases a prisoner (#31),
   *   so that record is inert and undeletable.
   * - An instance that exists but is full or lacks the capability is a
   *   *wait*: the stage is kept and retried, `accommodationBacklogTicks`
   *   counts it, and the arrival completes the moment a place frees up. That
   *   is the state a zoned-but-empty cell produces today, because
   *   `RoomZoningService` registers `capacity: 0`
   *   (`docs/adr/0023-room-occupancy-authority.md`).
   *
   * So this is the line between "the prison cannot take this person yet" and
   * "the prison can never take this person", and the command boundary refuses
   * on the second rather than manufacturing an unrecoverable record. It does
   * not, and must not, predict *which* group the arrival will be classified
   * into -- that is a `prisoners.classification` draw made two stages later,
   * and asking for it here would either move the draw or duplicate it.
   *
   * **That leaves one hole open, and open deliberately**
   * (`docs/adr/0028-object-placement-and-derived-room-capacity.md`). Answering
   * about *any* group means a prison holding a zoned `room.cell` and no
   * `room.solitary-cell` passes this check, and an arrival then classified
   * `high-risk` resolves to `room.solitary-cell`, finds no instance and lands
   * in the terminal `'failed'` stage after all. Measured: with
   * `priorIncidents: 5` and a 300,000-tick sentence, seeds 1, 4 and 12 reach
   * tier 3 and `failedCount` becomes 1. It is not reachable from the Intake
   * panel, whose figures score 0 against a screening variance of `-1 | 0 | +1`
   * and so cannot produce tier 3 -- across 300 seeds only tiers 0 and 1 occur
   * -- so it is owed work rather than a live defect, and closing it needs the
   * per-group question this method must not ask.
   *
   * Cheap by construction: `CLASSIFICATION_GROUP_IDS` has two members and
   * `allByRoomCatalogId` is the registry's cached, per-type lookup, so this is
   * two map reads. It is called once per `AdmitPrisoner` command, never per
   * tick.
   */
  public hasAccommodationTarget(): boolean {
    for (const classificationGroupId of CLASSIFICATION_GROUP_IDS) {
      const target = this.accommodationPolicy.resolveTarget(classificationGroupId);
      if (this.roomInstances.allByRoomCatalogId(target.roomCatalogId).length > 0) return true;
    }
    return false;
  }

  public update(context: SimulationContext): void {
    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      const stage = intakeStageFromIndex(this.records.intakeStage[index]!);

      if (stage === 'queued') {
        this.records.intakeStage[index] = intakeStageIndex('reception');
        continue;
      }

      if (stage === 'reception') {
        // Reception is where a real intake records who someone is, and it
        // is inside `EntityQuery.execute()`'s canonical ascending-entity-id
        // walk -- so the order names are minted in is a function of state,
        // not of the order prisoners happened to be admitted in a session.
        // `assign` is idempotent and draws nothing for an entity that
        // already has a name, so a replayed tick cannot shift the stream.
        if (this.identity !== undefined) {
          this.identity.assign('prisoner', entityId, context.rng.get(this.identityRngStreamName));
        }
        this.records.intakeStage[index] = intakeStageIndex('classification');
        continue;
      }

      if (stage === 'classification') {
        const rng = context.rng.get(this.rngStreamName);
        const result = classifyPrisoner(
          { sentenceLengthTicks: this.records.sentenceLengthTicks[index]!, priorIncidents: this.records.priorIncidentsAtIntake[index]! },
          rng,
        );
        this.records.riskTier[index] = result.riskTier;
        this.records.classificationGroupIndex[index] = classificationGroupIndex(result.classificationGroupId);
        this.records.sentenceEndTick[index] = context.tick + this.records.sentenceLengthTicks[index]!;
        this.records.intakeStage[index] = intakeStageIndex('accommodation-assignment');
        continue;
      }

      if (stage === 'accommodation-assignment') {
        const groupId = ['general-population', 'high-risk'][this.records.classificationGroupIndex[index]!]!;
        const target = this.accommodationPolicy.resolveTarget(groupId);
        const availableAnywhere = this.roomInstances.allByRoomCatalogId(target.roomCatalogId);

        if (availableAnywhere.length === 0) {
          this.records.intakeStage[index] = intakeStageIndex('failed');
          this.failedCount += 1;
          continue;
        }

        const instance = this.roomInstances.findAvailable(target.roomCatalogId, target.requiredObjectCapability);
        if (instance === undefined) {
          this.accommodationBacklogTicks += 1;
          continue; // stay in accommodation-assignment; retried next scheduled tick
        }

        this.roomInstances.assign(instance.instanceId, entityId);
        this.coldState.setAccommodation(entityId, instance.instanceId);
        this.records.intakeStage[index] = intakeStageIndex('completed');
        this.completedCount += 1;
      }
    }
  }
}
