import { ComponentBitset, QueryMask } from './component';
import type { EntityId } from './entity-store';
import { EntityStore, INDEX_MASK, GENERATION_MASK, GENERATION_SHIFT } from './entity-store';

export class EntityQuery {
  public readonly mask: QueryMask;
  private readonly store: EntityStore;
  private readonly bitset: ComponentBitset;

  constructor(store: EntityStore, bitset: ComponentBitset, maxComponents: number = 32) {
    this.store = store;
    this.bitset = bitset;
    this.mask = new QueryMask(maxComponents);
  }

  /**
   * Executes the query and returns an array of matching active Entity IDs,
   * in **ascending index order**.
   *
   * That is the guarantee, and it is deliberately narrower than the one this
   * comment used to give ("strictly ascending ID order"). An id packs the
   * generation into the high 12 bits and the index into the low 20, so id
   * order is `(generation, index)` lexicographic -- which coincides with index
   * order only while every live slot shares a generation. **That is no longer
   * true, and this comment used to say it was.** It said "Today it always
   * does, because nothing in `src/` destroys an entity (#31)" and then
   * described what would happen "the moment a release path exists"; #441 is
   * that moment. A prisoner released at the end of their sentence frees an
   * index, the next admission takes it back at a higher generation, and a
   * recycled slot at a low index therefore sorts *after* a fresh slot at a
   * higher one. Measured: `getIdByIndex(0)` at generation 2,048 is
   * 2,147,483,648 while `getIdByIndex(1)` at generation 0 is 1.
   *
   * Ascending index order is what determinism actually needs and what this
   * loop actually delivers: it is a total order derived from state, stable
   * across runs and across a snapshot restore. Callers that need ids in
   * numeric order sort them, as the dozen canonical-order sites in
   * `src/simulation/` already do.
   */
  public execute(): EntityId[] {
    const results: EntityId[] = [];
    const maxActive = this.store.maxActiveIndex;

    // Iterating by index guarantees deterministic order
    for (let index = 0; index <= maxActive; index++) {
      if (this.store.isIndexAlive(index) && this.bitset.hasAll(index, this.mask)) {
        results.push(this.store.getIdByIndex(index));
      }
    }
    return results;
  }
}
