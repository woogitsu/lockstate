export interface RoomRequirement {
  readonly type: 'minimum-size' | 'enclosed' | 'object' | 'outdoors';
  
  // For 'minimum-size'
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly minTiles?: number;

  // For 'object'
  readonly objectId?: string;
  readonly minQuantity?: number;
}

export interface RoomDefinition {
  readonly id: string;
  readonly name: string;
  readonly numericId: number; // for zoning Uint8Array storage
  readonly requirements: readonly RoomRequirement[];
}

export class RoomRegistry {
  private definitions = new Map<string, RoomDefinition>();
  private definitionsByNumericId = new Map<number, RoomDefinition>();

  public register(def: RoomDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Room definition ${def.id} is already registered.`);
    }
    if (this.definitionsByNumericId.has(def.numericId)) {
      throw new Error(`Room numeric ID ${def.numericId} is already in use.`);
    }
    this.definitions.set(def.id, def);
    this.definitionsByNumericId.set(def.numericId, def);
  }

  public getById(id: string): RoomDefinition | undefined {
    return this.definitions.get(id);
  }

  public getByNumericId(numericId: number): RoomDefinition | undefined {
    return this.definitionsByNumericId.get(numericId);
  }
}

// Built-in basic rooms
export const defaultRoomRegistry = new RoomRegistry();

defaultRoomRegistry.register({
  id: 'office',
  name: 'Office',
  numericId: 1,
  requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 4, minHeight: 4, minTiles: 16 },
    { type: 'object', objectId: 'desk', minQuantity: 1 },
    { type: 'object', objectId: 'chair', minQuantity: 1 }
  ]
});

defaultRoomRegistry.register({
  id: 'cell',
  name: 'Cell',
  numericId: 2,
  requirements: [
    { type: 'enclosed' },
    { type: 'minimum-size', minWidth: 2, minHeight: 3, minTiles: 6 },
    { type: 'object', objectId: 'bed', minQuantity: 1 },
    { type: 'object', objectId: 'toilet', minQuantity: 1 }
  ]
});
