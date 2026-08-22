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
   * Executes the query and returns an array of matching active Entity IDs.
   * Iterates sequentially, guaranteeing strictly ascending ID order.
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
