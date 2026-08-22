export interface TerrainDefinition {
  readonly id: string;
  readonly numericId: number;
  readonly name: string;
  readonly buildable: boolean;
  readonly walkable: boolean;
  readonly movementCost: number;
  readonly isWater: boolean;
}

export const DEFAULT_TERRAIN_DEFINITIONS: readonly TerrainDefinition[] = Object.freeze([
  Object.freeze({
    id: 'dirt',
    numericId: 0,
    name: 'Dirt',
    buildable: true,
    walkable: true,
    movementCost: 1.0,
    isWater: false,
  }),
  Object.freeze({
    id: 'grass',
    numericId: 1,
    name: 'Grass',
    buildable: true,
    walkable: true,
    movementCost: 1.0,
    isWater: false,
  }),
  Object.freeze({
    id: 'gravel',
    numericId: 2,
    name: 'Gravel',
    buildable: true,
    walkable: true,
    movementCost: 1.2,
    isWater: false,
  }),
  Object.freeze({
    id: 'concrete',
    numericId: 3,
    name: 'Concrete',
    buildable: true,
    walkable: true,
    movementCost: 1.0,
    isWater: false,
  }),
  Object.freeze({
    id: 'rock',
    numericId: 4,
    name: 'Rock',
    buildable: false,
    walkable: false,
    movementCost: Number.POSITIVE_INFINITY,
    isWater: false,
  }),
  Object.freeze({
    id: 'water',
    numericId: 5,
    name: 'Water',
    buildable: false,
    walkable: false,
    movementCost: Number.POSITIVE_INFINITY,
    isWater: true,
  }),
]);

export class TerrainRegistry {
  private readonly byId = new Map<string, TerrainDefinition>();
  private readonly byNumericId = new Map<number, TerrainDefinition>();

  public constructor(definitions: Iterable<TerrainDefinition> = DEFAULT_TERRAIN_DEFINITIONS) {
    for (const def of definitions) {
      this.register(def);
    }
  }

  public register(definition: TerrainDefinition): void {
    if (!Number.isSafeInteger(definition.numericId) || definition.numericId < 0 || definition.numericId > 255) {
      throw new RangeError(`Terrain numericId must be a safe integer in [0, 255], received ${definition.numericId}.`);
    }
    if (this.byId.has(definition.id)) {
      throw new Error(`Duplicate terrain id: "${definition.id}".`);
    }
    if (this.byNumericId.has(definition.numericId)) {
      throw new Error(`Duplicate terrain numericId: ${definition.numericId}.`);
    }
    const frozen: TerrainDefinition = Object.freeze({ ...definition });
    this.byId.set(definition.id, frozen);
    this.byNumericId.set(definition.numericId, frozen);
  }

  public has(id: string): boolean {
    return this.byId.has(id);
  }

  public hasNumericId(numericId: number): boolean {
    return this.byNumericId.has(numericId);
  }

  public getById(id: string): TerrainDefinition | undefined {
    return this.byId.get(id);
  }

  public getByNumericId(numericId: number): TerrainDefinition | undefined {
    return this.byNumericId.get(numericId);
  }

  public requireById(id: string): TerrainDefinition {
    const def = this.byId.get(id);
    if (def === undefined) {
      throw new RangeError(`Unknown terrain id: "${id}".`);
    }
    return def;
  }

  public requireByNumericId(numericId: number): TerrainDefinition {
    const def = this.byNumericId.get(numericId);
    if (def === undefined) {
      throw new RangeError(`Unknown terrain numericId: ${numericId}.`);
    }
    return def;
  }

  public getAll(): readonly TerrainDefinition[] {
    return [...this.byId.values()].sort((a, b) => a.numericId - b.numericId);
  }
}
