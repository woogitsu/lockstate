export interface ContentEntry {
  readonly id: string;
  readonly numericId: number;
}

export type ContentRegistryError =
  | { readonly kind: 'duplicate-id'; readonly id: string }
  | { readonly kind: 'duplicate-numeric-id'; readonly id: string; readonly numericId: number };

/**
 * Generic id/numericId-keyed catalog with deterministic iteration:
 * `.all()` is always sorted by `id`, never insertion order -- issue #23's
 * "content order does not change deterministic loaded output" requirement.
 * Shared by the room/object/staff-role catalogs instead of each
 * reimplementing duplicate-detection and stable iteration.
 */
export class ContentRegistry<T extends ContentEntry> {
  private readonly byId = new Map<string, T>();
  private readonly byNumericId = new Map<number, T>();

  public register(entry: T): void {
    if (this.byId.has(entry.id)) {
      throw new RangeError(`Duplicate content id "${entry.id}".`);
    }
    if (this.byNumericId.has(entry.numericId)) {
      throw new RangeError(`Duplicate content numeric id ${entry.numericId} (registering "${entry.id}").`);
    }
    this.byId.set(entry.id, entry);
    this.byNumericId.set(entry.numericId, entry);
  }

  public getById(id: string): T | undefined {
    return this.byId.get(id);
  }

  public getByNumericId(numericId: number): T | undefined {
    return this.byNumericId.get(numericId);
  }

  public has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Sorted by `id` ascending -- deterministic regardless of registration order. */
  public all(): readonly T[] {
    return [...this.byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  public size(): number {
    return this.byId.size;
  }
}

/** Builds a registry from a definition list, collecting every duplicate rather than throwing on the first one -- for a clear, complete startup error. */
export function buildContentRegistry<T extends ContentEntry>(entries: readonly T[]): { registry: ContentRegistry<T>; errors: readonly ContentRegistryError[] } {
  const registry = new ContentRegistry<T>();
  const errors: ContentRegistryError[] = [];

  for (const entry of entries) {
    if (registry.has(entry.id)) {
      errors.push({ kind: 'duplicate-id', id: entry.id });
      continue;
    }
    if (registry.getByNumericId(entry.numericId) !== undefined) {
      errors.push({ kind: 'duplicate-numeric-id', id: entry.id, numericId: entry.numericId });
      continue;
    }
    registry.register(entry);
  }

  return { registry, errors };
}
