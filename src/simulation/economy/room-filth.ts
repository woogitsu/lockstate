/** A completed use of one of these rooms leaves waste for the day's settlement. */
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import { DAY_LENGTH_TICKS } from '../prisoners/regime';

export const FILTH_ROOM_CATALOG_IDS = new Set(['room.kitchen', 'room.laundry', 'room.canteen']);

export interface RoomFilthSnapshot {
  readonly rooms: readonly (readonly [string, number])[];
  readonly uses: readonly (readonly [number, readonly string[]])[];
}

/**
 * Session-owned sanitation state. Room ids and prisoner ids are persisted so
 * loading halfway through a day cannot erase an already earned withholding.
 */
export class RoomFilthLedger {
  private readonly rooms = new Map<string, number>();
  private readonly uses = new Map<number, Set<string>>();

  public recordCompletedUse(roomCatalogId: string, roomInstanceId: string, prisonerId: number): void {
    if (!FILTH_ROOM_CATALOG_IDS.has(roomCatalogId)) return;
    this.rooms.set(roomInstanceId, Math.min(Number.MAX_SAFE_INTEGER, (this.rooms.get(roomInstanceId) ?? 0) + 1));
    const used = this.uses.get(prisonerId) ?? new Set<string>();
    used.add(roomInstanceId);
    this.uses.set(prisonerId, used);
  }

  public hasDirtyRoomUse(prisonerId: number): boolean {
    for (const id of [...(this.uses.get(prisonerId) ?? [])].sort()) {
      if ((this.rooms.get(id) ?? 0) > 0) return true;
    }
    return false;
  }

  /** Settle after income has read today's uses; absent rooms cannot retain filth. */
  public closeDay(hasWasteDisposal: boolean, activeRoomIds: ReadonlySet<string>): void {
    for (const id of [...this.rooms.keys()].sort()) {
      if (!activeRoomIds.has(id)) this.rooms.delete(id);
      else if (hasWasteDisposal) this.rooms.set(id, 0);
      else this.rooms.set(id, Math.min(Number.MAX_SAFE_INTEGER, this.rooms.get(id)! + 1));
    }
    this.uses.clear();
  }

  public filthOf(roomInstanceId: string): number {
    return this.rooms.get(roomInstanceId) ?? 0;
  }

  public snapshot(): RoomFilthSnapshot {
    return {
      rooms: [...this.rooms].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      uses: [...this.uses].sort(([a], [b]) => a - b).map(([id, rooms]) => [id, [...rooms].sort()] as const),
    };
  }

  public trackedRoomIds(): readonly string[] {
    return [...this.rooms.keys()].sort();
  }

  public loadSnapshot(snapshot: RoomFilthSnapshot): void {
    this.rooms.clear();
    this.uses.clear();
    for (const [id, filth] of snapshot.rooms) {
      if (!Number.isSafeInteger(filth) || filth < 0 || this.rooms.has(id)) throw new Error('Invalid room filth snapshot');
      this.rooms.set(id, filth);
    }
    for (const [entityId, rooms] of snapshot.uses) {
      if (!Number.isSafeInteger(entityId) || entityId < 0 || this.uses.has(entityId)) throw new Error('Invalid room filth use snapshot');
      this.uses.set(entityId, new Set(rooms));
    }
  }
}

/** Runs immediately after the day's grant so its cleanup cannot erase today's penalty. */
export class RoomFilthSystem implements SystemRegistration {
  public readonly id = 'economy.room-filth';
  public readonly order = 121;
  public readonly schedule = { intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 };

  public constructor(private readonly ledger: RoomFilthLedger, private readonly rooms: RoomInstanceRegistry) {}

  public update(_context: SimulationContext): void {
    const hasWasteDisposal = this.rooms.allByRoomCatalogId('room.garbage-room')
      .some((room) => room.objectCapabilities.includes('waste-disposal'));
    const active = new Set(this.ledger.trackedRoomIds().filter((id) => this.rooms.getById(id) !== undefined));
    this.ledger.closeDay(hasWasteDisposal, active);
  }
}
