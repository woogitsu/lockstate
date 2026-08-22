export type EntityId = number;

export const INDEX_MASK = 0x000FFFFF; // 20 bits
export const GENERATION_MASK = 0xFFF00000; // 12 bits
export const GENERATION_SHIFT = 20;

export class EntityStore {
  public readonly capacity: number;
  private readonly generations: Uint16Array;
  private readonly freeIndices: Uint32Array;
  private readonly alive: Uint8Array;
  
  private freeCount: number = 0;
  private nextAvailableIndex: number = 0;
  
  // High-water mark for the maximum active index.
  // Useful to bound iterations in query loops.
  public maxActiveIndex: number = -1;

  constructor(capacity: number) {
    if (capacity > INDEX_MASK) {
      throw new Error(`Entity capacity exceeds maximum allowed (${INDEX_MASK})`);
    }
    this.capacity = capacity;
    this.generations = new Uint16Array(capacity);
    this.freeIndices = new Uint32Array(capacity);
    this.alive = new Uint8Array(capacity);
  }

  /**
   * Spawns a new entity and returns its stable ID.
   */
  public spawn(): EntityId {
    let index: number;
    if (this.freeCount > 0) {
      this.freeCount--;
      index = this.freeIndices[this.freeCount]!;
    } else {
      if (this.nextAvailableIndex >= this.capacity) {
        throw new Error('EntityStore capacity exhausted');
      }
      index = this.nextAvailableIndex++;
    }

    if (index > this.maxActiveIndex) {
      this.maxActiveIndex = index;
    }

    this.alive[index] = 1;
    const generation = this.generations[index]!;
    return (index & INDEX_MASK) | ((generation << GENERATION_SHIFT) & GENERATION_MASK);
  }

  /**
   * Destroys an entity by invalidating its ID.
   */
  public destroy(id: EntityId): void {
    const index = id & INDEX_MASK;
    const generation = (id & GENERATION_MASK) >>> GENERATION_SHIFT;

    if (index >= this.nextAvailableIndex) {
      return; // Never spawned
    }

    if (this.generations[index] !== generation) {
      return; // Already destroyed / generation mismatch
    }

    // Increment generation, wrapping at 12 bits
    this.generations[index] = (this.generations[index]! + 1) & 0xFFF;
    this.alive[index] = 0;
    
    this.freeIndices[this.freeCount++] = index;
  }

  /**
   * Returns true if the entity ID is currently alive and valid.
   */
  public isAlive(id: EntityId): boolean {
    const index = id & INDEX_MASK;
    const generation = (id & GENERATION_MASK) >>> GENERATION_SHIFT;
    
    if (index >= this.nextAvailableIndex) {
      return false;
    }
    
    return this.generations[index] === generation;
  }
  
  /**
   * Extracts the internal component index for an entity ID.
   */
  public getIndex(id: EntityId): number {
    return id & INDEX_MASK;
  }
  
  /**
   * Extracts the generation for an entity ID.
   */
  public getGeneration(id: EntityId): number {
    return (id & GENERATION_MASK) >>> GENERATION_SHIFT;
  }
  
  /**
   * Returns true if the given index is currently alive.
   * Useful for internal iterations.
   */
  public isIndexAlive(index: number): boolean {
    return this.alive[index] === 1;
  }
  
  /**
   * Reconstructs an EntityId from an index, using its current generation.
   * This is used internally during iterations.
   */
  public getIdByIndex(index: number): EntityId {
    const generation = this.generations[index]!;
    return (index & INDEX_MASK) | ((generation << GENERATION_SHIFT) & GENERATION_MASK);
  }
  
  public getSnapshot(): {
    capacity: number;
    nextAvailableIndex: number;
    maxActiveIndex: number;
    freeCount: number;
    generations: Uint16Array;
    freeIndices: Uint32Array;
    alive: Uint8Array;
  } {
    return {
      capacity: this.capacity,
      nextAvailableIndex: this.nextAvailableIndex,
      maxActiveIndex: this.maxActiveIndex,
      freeCount: this.freeCount,
      generations: new Uint16Array(this.generations),
      freeIndices: new Uint32Array(this.freeIndices),
      alive: new Uint8Array(this.alive),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    if (snapshot.capacity !== this.capacity) {
      throw new Error('Cannot load snapshot with different capacity');
    }
    this.nextAvailableIndex = snapshot.nextAvailableIndex;
    this.maxActiveIndex = snapshot.maxActiveIndex;
    this.freeCount = snapshot.freeCount;
    this.generations.set(snapshot.generations);
    this.freeIndices.set(snapshot.freeIndices);
    this.alive.set(snapshot.alive);
  }
}
