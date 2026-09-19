import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId, EntityStore } from '../entity/entity-store';
import { EntityQuery } from '../entity/query';
import { rateCellSharing, type CellSharingView } from './cell-sharing';
import { classificationGroupIdFromIndex, intakeStageFromIndex, PrisonerColdState, PrisonerRecordComponent } from './components';
import { DEFAULT_ACCOMMODATION_POLICY, firstAvailableAccommodationTarget, type AccommodationPolicy } from './intake-system';
import type { RoomInstanceRegistry } from './room-instance-registry';

/**
 * The room a solitary sanction relocates into, whatever the sanctioned
 * prisoner's own classification group prefers (issue #80,
 * [ADR 0067](../../../docs/adr/0067-what-an-assault-costs-its-instigator.md)).
 * Sharing the id with
 * `IntakeSystem`'s `SOLITARY_CELL` target deliberately: a sanction and a
 * high-risk admission put a prisoner in the same physical place for two
 * different reasons, and the catalog has exactly one room type for it.
 */
export const SOLITARY_SANCTION_ROOM_CATALOG_ID = 'room.solitary-cell';

/**
 * How long a solitary sanction runs, and nothing else -- there is exactly one
 * dial here on purpose, so a balance pass has one number to move rather than
 * a scattered set (the same shape `IncidentResponsePolicy` and
 * `AssaultPolicy` already give their own single-purpose knobs).
 */
export interface SanctionPolicy {
  /**
   * Ticks a solitary sanction runs, counted from the tick the incident that
   * earned it reached a terminal state -- **not** from the tick a cell
   * actually frees up for the relocation. See `SanctionSystem`'s class
   * comment for why the term is allowed to run out before it is ever served,
   * and why that is the honest answer rather than a bug.
   */
  readonly solitaryTermTicks: number;
}

/**
 * Three in-game days (`DAY_LENGTH_TICKS` is 2,400) -- a directional default
 * and not a locked balance decision, the same standing `DEFAULT_ASSAULT_POLICY`
 * and `DEFAULT_INCIDENT_RESPONSE_POLICY` carry (`docs/ISSUE_BACKLOG.md`
 * governance, ADR 0061 decision 2's own note about its copied constants).
 * Long enough that the regime override (see below) is the dominant effect
 * rather than a rounding artefact against `ClassificationReviewSystem`'s
 * ten-in-game-day review period; short enough that a term is not, in
 * practice, a life sentence for a first assault.
 */
const SOLITARY_TERM_TICKS = 3 * 2_400;

export const DEFAULT_SANCTION_POLICY: SanctionPolicy = {
  solitaryTermTicks: SOLITARY_TERM_TICKS,
};

export interface SanctionMetrics {
  /** How many times this system moved a sanctioned prisoner into `room.solitary-cell`. Not "how many sanctions were imposed" -- `PrisonerOperationsRuntime.imposeSolitarySanction` counts that, and a relocation delayed by a full cell is not a second sanction. */
  readonly relocatedIntoSolitaryCount: number;
  /** How many times a sanction's term ended and this system moved the prisoner back out. */
  readonly releasedFromSolitaryCount: number;
  /** Scheduled updates that found a sanctioned prisoner still waiting for a free `room.solitary-cell`. */
  readonly relocationBacklogTicks: number;
  /** Scheduled updates that found a sanction whose term had ended still waiting for a free ordinary accommodation instance. */
  readonly releaseBacklogTicks: number;
}

/**
 * The follow-through half of issue #80's solitary sanction: `PrisonerRecordComponent.solitarySanctionEndTick`
 * is the only state `PrisonerOperationsRuntime.imposeSolitarySanction` writes,
 * and this system is what makes that number do something to a prisoner's
 * actual housing, on a schedule, the same way `IntakeSystem`'s
 * `accommodation-assignment` stage makes a fresh classification do something.
 *
 * ## Two directions, one loop, no new persisted flag
 *
 * A prisoner with a non-zero `solitarySanctionEndTick` is in exactly one of
 * two states, and both are **derived** from state the save already carries
 * rather than stored a second time:
 *
 * - **Still serving, not yet moved.** `context.tick < endTick` and the
 *   prisoner's current accommodation (`PrisonerColdState.getAccommodation`,
 *   resolved to a room through `RoomInstanceRegistry.getById`) is not
 *   `room.solitary-cell`. This system tries to relocate them there, exactly
 *   as `IntakeSystem`'s `accommodation-assignment` stage tries to house a
 *   fresh arrival: if every solitary cell is full, it retries next scheduled
 *   tick rather than failing, and `relocationBacklogTicks` counts the wait.
 * - **Term ended.** `context.tick >= endTick`. If the prisoner never made it
 *   into solitary at all (the backlog above never cleared before the clock
 *   ran out), the sanction is simply lifted with no relocation -- the honest
 *   answer for a prison whose solitary capacity could not enforce it in time,
 *   not a bug to paper over. If they are in solitary, this system places them
 *   back through `firstAvailableAccommodationTarget` for their **current**
 *   classification group -- the identical question `IntakeSystem` asks a
 *   fresh arrival -- which is why a high-risk prisoner's "release" can
 *   legitimately land them back in `room.solitary-cell`: that is what their
 *   classification says today, sanction or not, and this system does not
 *   special-case it.
 *
 * Nothing here is a new stored flag for "currently relocated": that fact is
 * asked of the room registry every time, so it cannot go stale relative to
 * it. The one field this consequence adds to the save is
 * `solitarySanctionEndTick` itself, and clearing it back to `0` at release is
 * what makes "sanctioned" and "not sanctioned" the same two states a restored
 * session reads.
 *
 * ## What actually makes solitary a punishment
 *
 * Relocating a prisoner into a `room.solitary-cell` instance changes almost
 * nothing about the room they sleep in -- the catalog gives it the same bed
 * and toilet an ordinary cell has (`room-catalog.ts`). What changes their day
 * is `PrisonerOperationsRuntime.isServingSolitarySanction`, read by the
 * regime override this runtime wires ahead of any riot override: while
 * `solitarySanctionEndTick` is non-zero, `ActionSystem` runs the prisoner on
 * `HIGH_RISK_REGIME` regardless of their own classification group, exactly
 * the timetable a tier-3 classification already imposes. That is what
 * degrades their needs and, through
 * [ADR 0064](../../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md),
 * the state's grant for their place -- not the walls.
 *
 * ## Order and schedule
 *
 * Registered at order 300, after `incidents.response` (295): the port that
 * calls `imposeSolitarySanction` fires from inside that system's update, and
 * running after it means a sanction imposed this tick can begin its
 * relocation attempt this same tick rather than waiting a full cycle.
 * Nothing about correctness depends on that ordering -- a sanction recorded
 * this tick and picked up next scheduled tick is the same outcome one cycle
 * later -- it is simply the tighter of two orderings that are both legal, the
 * same reasoning `prisoners.discharge` (65) states for running after intake
 * and before navigation. Scheduled every 5 ticks, matching `prisoners.intake`
 * (50): frequent enough that the backlog metrics mean something, not so
 * frequent that an idle sanctioned population is scanned every tick for
 * nothing.
 */
export class SanctionSystem implements SystemRegistration {
  public readonly id = 'prisoners.sanctions';
  public readonly order = 300;
  public readonly schedule = { intervalTicks: 5, phaseTicks: 0 };

  private relocatedIntoSolitaryCount = 0;
  private releasedFromSolitaryCount = 0;
  private relocationBacklogTicks = 0;
  private releaseBacklogTicks = 0;

  public constructor(
    private readonly store: EntityStore,
    private readonly query: EntityQuery,
    private readonly records: PrisonerRecordComponent,
    private readonly coldState: PrisonerColdState,
    private readonly roomInstances: RoomInstanceRegistry,
    private readonly accommodationPolicy: AccommodationPolicy = DEFAULT_ACCOMMODATION_POLICY,
  ) {}

  public getMetrics(): SanctionMetrics {
    return {
      relocatedIntoSolitaryCount: this.relocatedIntoSolitaryCount,
      releasedFromSolitaryCount: this.releasedFromSolitaryCount,
      relocationBacklogTicks: this.relocationBacklogTicks,
      releaseBacklogTicks: this.releaseBacklogTicks,
    };
  }

  private sharingViewOf(entityId: EntityId, index: number): CellSharingView {
    return { entityId, riskTier: this.records.riskTier[index]! };
  }

  /** Same liveness filter `IntakeSystem.sharingViewsOf` applies, and for the same reason: a released occupant's id can still sit in `occupants` between `release` and the next read. */
  private sharingViewsOf(occupants: readonly EntityId[]): readonly CellSharingView[] {
    const views: CellSharingView[] = [];
    for (const occupant of occupants) {
      if (!this.store.isAlive(occupant)) continue;
      views.push({ entityId: occupant, riskTier: this.records.riskTier[this.store.getIndex(occupant)]! });
    }
    return views;
  }

  /** Moves `entityId` from `fromInstanceId` (if housed at all) into `toInstanceId`, updating cold-state accommodation. The one piece of logic both directions below share. */
  private relocate(entityId: EntityId, fromInstanceId: string | undefined, toInstanceId: string): void {
    if (fromInstanceId !== undefined) this.roomInstances.release(fromInstanceId, entityId);
    this.roomInstances.assign(toInstanceId, entityId);
    this.coldState.setAccommodation(entityId, toInstanceId);
  }

  public update(context: SimulationContext): void {
    for (const entityId of this.query.execute()) {
      const index = this.store.getIndex(entityId);
      const endTick = this.records.solitarySanctionEndTick[index]!;
      if (endTick === 0) continue;

      // Only a housed prisoner has an accommodation instance to move at all;
      // one still in the intake pipeline, or terminally `'failed'`, is left
      // exactly where `IntakeSystem` left them and retried on its own
      // schedule.
      if (intakeStageFromIndex(this.records.intakeStage[index]!) !== 'completed') continue;

      const currentInstanceId = this.coldState.getAccommodation(entityId);
      const currentInstance = currentInstanceId === undefined ? undefined : this.roomInstances.getById(currentInstanceId);
      const inSolitary = currentInstance?.roomCatalogId === SOLITARY_SANCTION_ROOM_CATALOG_ID;

      if (context.tick < endTick) {
        if (inSolitary) continue; // already there; nothing to do until the term ends

        const arrival = this.sharingViewOf(entityId, index);
        const target = this.roomInstances.findBestAvailable(
          SOLITARY_SANCTION_ROOM_CATALOG_ID,
          (occupants) => rateCellSharing(arrival, this.sharingViewsOf(occupants)),
          'sleep-surface',
        );
        if (target === undefined) {
          this.relocationBacklogTicks += 1;
          continue; // every solitary cell is full or lacks a bed; retried next scheduled tick
        }
        this.relocate(entityId, currentInstanceId, target.instanceId);
        this.relocatedIntoSolitaryCount += 1;
        continue;
      }

      // The term has ended.
      if (!inSolitary) {
        // Never made it in before the clock ran out -- the prison's solitary
        // capacity could not enforce this sanction in time. Lifted rather
        // than left pending forever: there is nothing left to enforce.
        this.records.solitarySanctionEndTick[index] = 0;
        continue;
      }

      const groupId = classificationGroupIdFromIndex(this.records.classificationGroupIndex[index]!);
      const releaseTarget = firstAvailableAccommodationTarget(this.accommodationPolicy, this.roomInstances, groupId);
      if (releaseTarget === undefined) {
        // Structural gap: this prison holds no accommodation at all for this
        // prisoner's current group (a room instance removed mid-term, which
        // no `src/` path does today). Lifting rather than stranding the
        // sanction forever -- there is no room left to release them from.
        this.records.solitarySanctionEndTick[index] = 0;
        continue;
      }

      const arrival = this.sharingViewOf(entityId, index);
      const instance = this.roomInstances.findBestAvailable(
        releaseTarget.roomCatalogId,
        (occupants) => rateCellSharing(arrival, this.sharingViewsOf(occupants)),
        releaseTarget.requiredObjectCapability,
      );
      if (instance === undefined) {
        this.releaseBacklogTicks += 1;
        continue; // stays in solitary, retried next scheduled tick
      }
      this.relocate(entityId, currentInstanceId, instance.instanceId);
      this.records.solitarySanctionEndTick[index] = 0;
      this.releasedFromSolitaryCount += 1;
    }
  }
}
