/** Rooms whose ordinary use produces waste. No other room changes this ledger. */
const FILTH_SOURCE_ROOMS = new Set(['room.canteen', 'room.kitchen', 'room.laundry']);
const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export interface RoomFilthSnapshot {
  readonly rooms: readonly (readonly [string, number])[];
  readonly exposures: readonly (readonly [string, readonly number[]])[];
}

/**
 * Waste from completed uses, held until the state-income day boundary.
 * Room and prisoner ids are sorted on every outward read, so insertion and
 * restore history cannot change the save or the order of an income decision.
 */
export class RoomFilthLedger {
  private readonly rooms = new Map<string, number>();
  private readonly exposures = new Map<string, Set<number>>();

  public recordUse(instanceId: string, roomCatalogId: string, prisonerId: number): void {
    if (!FILTH_SOURCE_ROOMS.has(roomCatalogId)) return;
    if (!Number.isSafeInteger(prisonerId) || prisonerId < 0) throw new RangeError('Invalid prisoner id.');
    const current = this.rooms.get(instanceId) ?? 0;
    // Saturate rather than wrapping a long-lived save's counter.
    this.rooms.set(instanceId, Math.min(Number.MAX_SAFE_INTEGER, current + 1));
    const exposed = this.exposures.get(instanceId) ?? new Set<number>();
    exposed.add(prisonerId);
    this.exposures.set(instanceId, exposed);
  }

  /** Count one extra unmet need per dirty room used, then open the next day. */
  public settleDay(hasWasteDisposal: boolean, liveRoomIds: readonly string[]): readonly (readonly [number, number])[] {
    const result = this.previewPenalties(hasWasteDisposal, liveRoomIds);
    const live = new Set(liveRoomIds);
    for (const instanceId of [...this.rooms.keys()].sort()) {
      if (!live.has(instanceId)) {
        this.rooms.delete(instanceId);
        this.exposures.delete(instanceId);
        continue;
      }
      const next = hasWasteDisposal ? 0 : Math.min(Number.MAX_SAFE_INTEGER, this.rooms.get(instanceId)! + 1);
      this.rooms.set(instanceId, next);
    }
    this.exposures.clear();
    return result;
  }

  /** What the next settlement would withhold if conditions stayed as they are. */
  public previewPenalties(hasWasteDisposal: boolean, liveRoomIds: readonly string[]): readonly (readonly [number, number])[] {
    if (hasWasteDisposal) return [];
    const live = new Set(liveRoomIds);
    const penalties = new Map<number, number>();
    for (const instanceId of [...this.rooms.keys()].sort()) {
      if (!live.has(instanceId)) continue;
      for (const prisonerId of this.exposures.get(instanceId) ?? []) {
        penalties.set(prisonerId, (penalties.get(prisonerId) ?? 0) + 1);
      }
    }
    return [...penalties].sort(([a], [b]) => a - b);
  }

  public getSnapshot(): RoomFilthSnapshot {
    const rooms = [...this.rooms].sort(([a], [b]) => compareIds(a, b));
    const exposures = [...this.exposures]
      .sort(([a], [b]) => compareIds(a, b))
      .map(([id, people]) => [id, [...people].sort((a, b) => a - b)] as const);
    return { rooms, exposures };
  }

  public loadSnapshot(snapshot: RoomFilthSnapshot): void {
    this.rooms.clear();
    this.exposures.clear();
    for (const [id, filth] of snapshot.rooms) {
      if (!Number.isSafeInteger(filth) || filth < 0 || this.rooms.has(id)) throw new RangeError('Invalid room filth snapshot.');
      this.rooms.set(id, filth);
    }
    for (const [id, people] of snapshot.exposures) {
      if (!this.rooms.has(id) || this.exposures.has(id)) throw new RangeError('Invalid room filth exposure snapshot.');
      const exposed = new Set(people);
      if (exposed.size !== people.length || people.some((person) => !Number.isSafeInteger(person) || person < 0)) {
        throw new RangeError('Invalid room filth exposure snapshot.');
      }
      this.exposures.set(id, exposed);
    }
  }
}
