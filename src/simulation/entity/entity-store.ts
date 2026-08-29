import { SnapshotRefusedError } from '../runtime/restore-refusal';

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
 * The last generation a slot may be recycled into. `destroy()` retires a slot
 * that dies at this generation instead of handing it a 4,096th life --
 * see `destroy()`'s doc comment and ADR 0026 (question 1, option A / #169).
 */
export const MAX_GENERATION = 0xFFF; // 4,095

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
 * **No save produced so far is affected, and the reason has changed.** This
 * used to say "nothing in `src/` destroys an entity at all (#31)", which was
 * true until #441 gave a sentence an end: `releasePrisoner` destroys the entity
 * and the index goes back on the free list, so prisoner indices are now
 * recycled in an ordinary session. What is unchanged is the arithmetic --
 * reaching generation 2,048 at one index needs 2,048 releases *of that index*,
 * and the free list is LIFO over every freed slot -- so a prison would have to
 * churn a multiple of that through a single slot before an id went negative.
 * That is a long-running prison rather than an impossible one.
 *
 * **ADR 0026 question 1 is now answered (#169): a slot is retired rather than
 * recycled past generation 4,095**, so a single index still cannot go negative
 * either -- `destroy` never assigns it another generation once 4,095 is used,
 * so it never reaches 2,048 a second time. See `destroy()` below.
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
   * past -- capacity exhaustion in `spawn`, and a snapshot in `loadSnapshot`
   * whose written slots outnumber this store's.
   * `tests/unit/entity.test.ts`'s "prevents double destroy"
   * has pinned that tolerance since the store was written, and ADR 0005
   * describes generation mismatches as "safely caught" rather than raised.
   *
   * ## Retirement at the last generation (ADR 0026 question 1, option A / #169)
   *
   * A slot dying at generation {@link MAX_GENERATION} (4,095) is **retired**
   * rather than recycled: it is marked dead but never pushed back onto
   * `freeIndices`, so `spawn()` can never hand its index out again. Every
   * other slot still gets 4,096 lives, same as before; this one slot simply
   * does not get a 4,097th, which is what stops that life's `EntityId` --
   * identical to the slot's very first id, `packEntityId(index, 0)` -- from
   * ever being reissued.
   *
   * That one word, "retired", is the entire fix. Before it, this method did
   * `generations[index] = (generations[index] + 1) & 0xFFF` unconditionally
   * and always freed the index, so a slot's 4,096th death wrapped its
   * generation back to the value its first life carried and the index went
   * straight back on the free list -- the next `spawn()` at that index
   * produced an id indistinguishable from a name a caller might still be
   * holding from 4,096 lives ago. `isAlive` on that stale handle read `true`
   * (nothing in the store disagreed: right index, right generation), and
   * `destroy` on it killed whichever *live* entity now held the slot. Both
   * are demonstrated, mechanically, in
   * `tests/unit/entity-generation-wrap.test.ts` before this change and are
   * what retirement closes: the id genuinely does
   * not come back, so there is no stale handle left to confuse with a live
   * one.
   *
   * The cost is exactly what ADR 0026 named for option A: a retired slot is
   * gone for the rest of the session, so a single index driven through 4,096
   * releases costs this store one unit of capacity rather than corrupting a
   * lookup. `canSpawn` and every caller that checks it (`admitPrisoner`'s
   * `population-full` refusal) already treat "no free index and none left
   * ahead" as an ordinary, handled outcome -- retirement only makes that
   * outcome reachable slightly sooner in the pathological case of one index
   * churned thousands of times, not a new failure mode.
   *
   * No save format change follows from this. `generations` already stores
   * values up to 4,095 in a `Uint16Array`, and a retired index is simply
   * absent from the snapshotted `freeIndices` prefix -- `loadSnapshot`
   * reproduces that absence on restore with no new field to carry.
   *
   * This is option A alone; option C (clearing the three `EntityId`-keyed
   * stores on release, so no orphaned entry survives even for an id that will
   * never come back) already shipped with #441's release path. ADR 0026 says
   * the two are complements, not alternatives, because C alone still leaves
   * `isAlive`/`destroy` themselves lying at the wrap, and A alone still leaves
   * an orphaned entry in a store nobody remembered to clear (harmless once
   * the id can never recur, but a leak). Both are now taken.
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

    this.alive[index] = 0;

    if (this.generations[index] === MAX_GENERATION) {
      // This slot's last generation. Retire it: leave the generation at
      // 4,095 and never push the index back onto the free list, so this
      // exact id can never be reissued. See the method doc above.
      return;
    }

    this.generations[index] = this.generations[index]! + 1;
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

  /**
   * Restores this store's liveness ledger from a snapshot.
   *
   * **The snapshot's `capacity` is not a precondition, and used to be** (#433).
   * This method opened with `if (snapshot.capacity !== this.capacity) throw`,
   * and `capacity` is a property of the *build that wrote the save* -- the
   * length of the array the slots were written into -- not of the save's
   * content. So a ledger carrying two live prisoners was refused because the
   * array around them was eight long and this build allocates
   * `DEFAULT_PRISONER_CAPACITY` (5,000). The repository's own
   * `tests/fixtures/persistence/save-v1-in-progress.json` is exactly that
   * save: it migrates V1 -> V5, its checksum verifies, `importSave` accepts it
   * and `loadCurrent` returns it, and then this line threw. Every earlier gate
   * passed, so nothing warned the player.
   *
   * What matters is the **written prefix** -- the slots the writing build
   * actually used. `EncodedEntityStoreSnapshot` already calls itself
   * "population-shaped", and `session-systems.ts` says the same of the
   * component arrays beside it; the capacity-shaped array this ledger expands
   * into on the way back is a decoding detail, and comparing its *length*
   * against ours was comparing two decoding details.
   *
   * So the rule is that the prefix must fit, and this is where a save is
   * genuinely refused: a ledger whose written slots outnumber this store's is
   * one this build cannot address, `packEntityId` could not name its top
   * indices, and the message says which two numbers disagreed. That refusal is
   * ADR 0038's compatibility rule applied unchanged -- "a *value* the build
   * cannot interpret is a fact about the blob and is refused" -- and the
   * capacity comparison was the same rule misapplied to a value the build can
   * interpret perfectly well.
   *
   * **Indices, and therefore entity ids, are preserved.** The prefix is copied
   * at the same offsets it was written at, and `generations` comes across
   * untouched, so `packEntityId(index, generation)` reproduces every id the
   * writing build had issued (ADR 0005, ADR 0026: a slot index is not free to
   * be re-homed, and generations are what make stale-reference detection
   * work). Nothing here renumbers anything.
   *
   * Slots above the prefix are cleared rather than left as they were. A store
   * this method is called on twice would otherwise keep the taller snapshot's
   * tail behind the shorter one -- generations and liveness flags for indices
   * the new snapshot never mentions -- which is residue the old
   * equal-capacity `set()` could not produce and this one could.
   */
  public loadSnapshot(snapshot: EntityStoreSnapshot): void {
    // The high-water mark of allocated indices. `maxActiveIndex` alone would
    // be enough for any store this repository writes -- `spawn` raises it for
    // the very index it took from `nextAvailableIndex`, so the two move
    // together -- but both are read off a save here, so the prefix is
    // whatever the wider of them claims. `freeCount` joins them because the
    // free list is copied at its own length.
    const writtenPrefix = Math.max(snapshot.maxActiveIndex + 1, snapshot.nextAvailableIndex, snapshot.freeCount);
    if (writtenPrefix > this.capacity) {
      // `unsupported-by-this-build`, not `damaged-payload`, and the
      // distinction is the whole of #431's taxonomy in one line: nothing is
      // wrong with these bytes, a build that allocates a wider store reads
      // them, and the save must survive being refused here so that build can.
      throw new SnapshotRefusedError(
        'unsupported-by-this-build',
        `Cannot load an entity snapshot: it has ${writtenPrefix} written slots and this store has capacity for ${this.capacity}.`,
      );
    }

    this.nextAvailableIndex = snapshot.nextAvailableIndex;
    this.maxActiveIndex = snapshot.maxActiveIndex;
    this.freeCount = snapshot.freeCount;

    const generations = Math.min(snapshot.generations.length, this.capacity);
    this.generations.set(snapshot.generations.subarray(0, generations));
    this.generations.fill(0, generations);

    const freeIndices = Math.min(snapshot.freeIndices.length, this.capacity);
    this.freeIndices.set(snapshot.freeIndices.subarray(0, freeIndices));
    this.freeIndices.fill(0, freeIndices);

    const alive = Math.min(snapshot.alive.length, this.capacity);
    this.alive.set(snapshot.alive.subarray(0, alive));
    this.alive.fill(0, alive);
  }
}
