import type { EntityId } from '../entity/entity-store';
import type { EntityStore } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { PrisonerRecordComponent } from './components';
import type { RoomInstanceRegistry } from './room-instance-registry';
import { rateCellSharing, type CellSharingView } from './cell-sharing';

/** The assessment made when a prisoner entered a cell, and its latest revision. */
export interface CellSharingAssessment {
  readonly entityId: EntityId;
  readonly roomInstanceId: string;
  readonly initialRating: number;
  readonly currentRating: number;
  readonly assessedAtTick: number;
  readonly reassessedAtTick: number;
  /** Historical saves cannot recover the original placement decision. */
  readonly source: 'placement' | 'restored';
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

  public reconcile(roomInstanceId: string, occupants: readonly CellSharingView[], atTick: number, source: 'placement' | 'restored' = 'placement'): void {
    const ordered = orderedOccupants(occupants);
    const present = new Set(ordered.map(({ entityId }) => entityId));
    for (const [entityId, record] of [...this.byPrisoner.entries()].sort(([a], [b]) => a - b)) {
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
            source,
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

  public forget(entityId: EntityId): void {
    this.byPrisoner.delete(entityId);
  }

  public retainRooms(existingRoomIds: ReadonlySet<string>): void {
    for (const [entityId, record] of [...this.byPrisoner.entries()].sort(([a], [b]) => a - b)) {
      if (!existingRoomIds.has(record.roomInstanceId)) this.byPrisoner.delete(entityId);
    }
  }
}

/** Reassesses occupied cells after intake, classification review and sanctions. */
export class CellSharingAssessmentSystem implements SystemRegistration {
  public readonly id = 'prisoners.cell-sharing-assessment';
  public readonly order = 310;
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };

  public constructor(
    private readonly ledger: CellSharingAssessmentLedger,
    private readonly store: EntityStore,
    private readonly records: PrisonerRecordComponent,
    private readonly rooms: RoomInstanceRegistry,
  ) {}

  public update(context: SimulationContext): void {
    this.reconcileAll(context.tick);
  }

  public reconcileAll(atTick: number, source: 'placement' | 'restored' = 'placement'): void {
    const rooms = this.rooms.allByRoomCatalogId('room.cell');
    this.ledger.retainRooms(new Set(rooms.map((room) => room.instanceId)));
    for (const room of rooms) {
      const occupants = this.rooms.occupantsOf(room.instanceId)
        .filter((entityId) => this.store.isAlive(entityId))
        .map((entityId) => ({ entityId, riskTier: this.records.riskTier[this.store.getIndex(entityId)]! }));
      this.ledger.reconcile(room.instanceId, occupants, atTick, source);
    }
  }
}
