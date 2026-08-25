export type EntityId = number;

export interface EntityStoreSnapshot {
  readonly capacity: number;
  readonly nextAvailableIndex: number;
  readonly maxActiveIndex: number;
  readonly freeCount: number;
  readonly generations: Uint16Array;
  readonly freeIndices: Uint32Array;
  readonly alive: Uint8Array;
}

export const INDEX_MASK = 0x000FFFFF; // 20 bits
export const GENERATION_MASK = 0xFFF00000; // 12 bits
export const GENERATION_SHIFT = 20;

/**
 * Why every packed id ends in `>>> 0`.
 *
 * The two fields fill the whole word -- 20 index bits and 12 generation bits
 * is 32 of 32 -- so `generation << GENERATION_SHIFT` sets bit 31 as soon as
 * the generation reaches 2,048, and JavaScript's `|` yields a *signed*
 * int32. Without the shift back to unsigned, `spawn()` returns
 * `-2147483648` for generation 2,048 and `-1048576` for generation 4,095.
 *
 * The store itself survives that: every decode site here uses `>>>` or
 * `& INDEX_MASK`, both of which read a negative id correctly. Three places
 * outside it do not, and each states the unsigned contract in as many words:
 *
 * - `ActorIdentityRegistry`'s `assertEntityId` throws `RangeError` on a
 *   negative id, and `assign` is on the intake path -- so admitting a
 *   prisoner into such a slot throws inside `IntakeSystem.update`.
 * - `save-schema.ts`'s `entityIdSchema` is `z.number().int().min(0)`, under
 *   the comment "Packed `EntityId`s: index and generation in one
 *   non-negative integer", and `createSaveEnvelope` parses and throws. The
 *   session would not serialise.
 * - A dozen sites in `src/simulation/` sort entity ids numerically to
 *   establish canonical order. A negative id sorts to the front of every one
 *   of them, so the same state yields a different order depending only on
 *   which generation a slot happens to be on.
 *
 * So the unsigned domain is the contract two modules already enforce and a
 * third relies on, and these two encode sites were the only places
 * contradicting it. The fix is the producer, not the assertions: relaxing
 * them would buy nothing and cost the sort sites their total order.
 *
 * What this does *not* fix, stated because it is the neighbouring claim and
 * would be easy to assume: `EntityQuery.execute` walks indices, and index
 * order is id order only while every live slot shares a generation --
 * `getIdByIndex(0)` at generation 2,048 is 2,147,483,648 while
 * `getIdByIndex(1)` at generation 0 is 1. That is true with or without the
 * shift below, because the generation occupies the *high* bits. The comment
 * there over-claimed and is corrected to what the loop delivers; it is not
 * something `>>> 0` repairs.
 *
 * No save is affected. Reaching generation 2,048 needs 2,048 destroy/spawn
 * cycles of one index, and nothing in `src/` destroys an entity at all
 * (#31), so no save this codebase can produce holds such an id.
 *
 * Exported because the id format has a second reader outside this class:
 * `src/rendering/feed/actors-from-snapshot.ts` rebuilds ids from a *snapshot*
 * of the store's liveness ledger, where there is no `EntityStore` instance to
 * ask. It is a pure bit-shuffle over an index and a generation, so sharing it
 * costs nothing and keeps one definition of how an `EntityId` is packed.
 */
export const packEntityId = (index: number, generation: number): EntityId =>
  ((index & INDEX_MASK) | ((generation << GENERATION_SHIFT) & GENERATION_MASK)) >>> 0;

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
   * Whether `spawn()` would succeed, asked without calling it.
   *
   * `spawn` *throws* when the store is exhausted, and a throw out of a
   * command handler is a throw out of `Kernel.step()` -- so a boundary that
   * turns a player's request into a spawn needs to be able to refuse rather
   * than to let the tick loop unwind (#261 step 4,
   * `src/simulation/prisoners/prisoner-operations-runtime.ts`). This is
   * exactly the condition the `throw` below tests, and it is deliberately not
   * a live-population count: a recycled index is a spawn this can allow and a
   * headcount would not.
   */
  public get canSpawn(): boolean {
    return this.freeCount > 0 || this.nextAvailableIndex < this.capacity;
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
    return packEntityId(index, this.generations[index]!);
  }

  /**
   * Destroys an entity by invalidating its ID.
   *
   * Destroying an id that does not name a live entity is a no-op, not an
   * error: this store reports misuse of an *id* by ignoring it (the guards
   * below) and reserves exceptions for structural faults it cannot continue
   * past -- capacity exhaustion in `spawn`, a capacity mismatch in
   * `loadSnapshot`. `tests/unit/entity.test.ts`'s "prevents double destroy"
   * has pinned that tolerance since the store was written, and ADR 0005
   * describes generation mismatches as "safely caught" rather than raised.
   */
  public destroy(id: EntityId): void {
    const index = id & INDEX_MASK;
    const generation = (id & GENERATION_MASK) >>> GENERATION_SHIFT;

    if (index >= this.nextAvailableIndex) {
      return; // Never spawned
    }

    // Slot liveness is checked *before* the generation, because the id that
    // needs rejecting most is the one whose generation matches: after a
    // destroy, `getIdByIndex` on the freed index rebuilds an id carrying the
    // already-bumped generation, and accepting it would push the index onto
    // the free list a second time and let two later spawns collide on one
    // EntityId.
    if (this.alive[index] !== 1) {
      return; // Slot is already free
    }

    if (this.generations[index] !== generation) {
      return; // Stale id: this slot has since been recycled
    }

    // Increment generation, wrapping at 12 bits
    this.generations[index] = (this.generations[index]! + 1) & 0xFFF;
    this.alive[index] = 0;
    
    this.freeIndices[this.freeCount++] = index;
  }

  /**
   * Returns true if the entity ID is currently alive and valid, meaning
   * both of the records the store keeps agree: the slot the id names is
   * occupied, and the id's generation is the generation that slot is
   * currently issued under.
   *
   * The two ways that can fail are deliberately collapsed into one `false`
   * rather than distinguished here. A stale id (right index, superseded
   * generation) and an id naming a freed slot (current generation, but the
   * index is on the free list) are both "not a live entity", which is the
   * only question this method's name asks. A caller that does need to tell
   * them apart already can, without a new method: `isIndexAlive(index)`
   * answers slot occupancy on its own, and `getGeneration(id)` compared
   * against `getGeneration(getIdByIndex(index))` answers staleness.
   */
  public isAlive(id: EntityId): boolean {
    const index = id & INDEX_MASK;
    const generation = (id & GENERATION_MASK) >>> GENERATION_SHIFT;
    
    if (index >= this.nextAvailableIndex) {
      return false;
    }
    
    return this.alive[index] === 1 && this.generations[index] === generation;
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
   * Reconstructs an EntityId from an index, using that index's current
   * generation. Used during index walks such as `EntityQuery.execute()`.
   *
   * **Precondition: the index is alive.** This is a pure bit-shuffle and
   * consults no liveness record, so for a freed index it returns an id that
   * names a dead slot -- structurally well-formed, but not an entity. It
   * stays unchecked on purpose: it sits inside the `0..maxActiveIndex` walk
   * that ADR 0005 justifies precisely by how little it does per index, and no
   * call site in `src/` is reached without an `isIndexAlive(index)` check --
   * three have it on the immediately preceding line, and
   * `projectRosterRow`'s comes from the index walk of its one caller -- so a
   * check here would only repeat theirs.
   * `isAlive` and `destroy` both reject the ids this can produce for a dead
   * slot, so the unchecked reconstruction cannot be laundered into liveness.
   */
  public getIdByIndex(index: number): EntityId {
    return packEntityId(index, this.generations[index]!);
  }
  
  public getSnapshot(): EntityStoreSnapshot {
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

  public loadSnapshot(snapshot: EntityStoreSnapshot): void {
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
