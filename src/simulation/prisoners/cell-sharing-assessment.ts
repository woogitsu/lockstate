import type { EntityId } from '../entity/entity-store';
import { rateCellSharing, type CellSharingView } from './cell-sharing';

/** The assessment made when a prisoner entered a cell, and its latest revision. */
export interface CellSharingAssessment {
  readonly entityId: EntityId;
  readonly roomInstanceId: string;
  readonly initialRating: number;
  readonly currentRating: number;
  readonly assessedAtTick: number;
  readonly reassessedAtTick: number;
  /** Sorted occupant ids and classification tiers; detects a meaningful change without depending on iteration order. */
  readonly inputs: string;
}

function orderedOccupants(occupants: readonly CellSharingView[]): CellSharingView[] {
  return [...occupants].sort((a, b) => a.entityId - b.entityId);
}

/**
 * Stores the decision made at placement. A later change to a cellmate or a
 * classification updates the current rating while retaining the original
 * rating, so a save can explain both the placement and the present risk.
 * The caller supplies the simulation tick; this ledger never reads a clock.
 */
export class CellSharingAssessmentLedger {
  private readonly byPrisoner = new Map<EntityId, CellSharingAssessment>();

  public forPrisoner(entityId: EntityId): CellSharingAssessment | undefined {
    return this.byPrisoner.get(entityId);
  }

  public reconcile(roomInstanceId: string, occupants: readonly CellSharingView[], atTick: number): void {
    const ordered = orderedOccupants(occupants);
    const present = new Set(ordered.map(({ entityId }) => entityId));
    for (const [entityId, record] of this.byPrisoner) {
      if (record.roomInstanceId === roomInstanceId && !present.has(entityId)) this.byPrisoner.delete(entityId);
    }
    const inputs = ordered.map(({ entityId, riskTier }) => `${entityId}:${riskTier}`).join(',');
    for (const occupant of ordered) {
      const previous = this.byPrisoner.get(occupant.entityId);
      if (previous?.roomInstanceId === roomInstanceId && previous.inputs === inputs) continue;
      const currentRating = rateCellSharing(occupant, ordered);
      this.byPrisoner.set(occupant.entityId, previous?.roomInstanceId === roomInstanceId
        ? { ...previous, currentRating, reassessedAtTick: atTick, inputs }
        : {
            entityId: occupant.entityId,
            roomInstanceId,
            initialRating: currentRating,
            currentRating,
            assessedAtTick: atTick,
            reassessedAtTick: atTick,
            inputs,
          });
    }
  }

  public getSnapshot(): readonly CellSharingAssessment[] {
    return [...this.byPrisoner.values()]
      .sort((a, b) => a.entityId - b.entityId)
      .map((record) => ({ ...record }));
  }

  public loadSnapshot(snapshot: readonly CellSharingAssessment[]): void {
    this.byPrisoner.clear();
    for (const record of snapshot) this.byPrisoner.set(record.entityId, { ...record });
  }
}
