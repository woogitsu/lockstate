/** Retain render objects up to the visible high-water mark, including across culling. */
export class VisibleObjectPool<T> {
  public readonly active = new Map<number, T>();
  private readonly available: T[] = [];

  public constructor(private readonly create: () => T, private readonly hide: (value: T) => void) {}

  public acquire(id: number): T {
    const current = this.active.get(id);
    if (current !== undefined) return current;
    const value = this.available.pop() ?? this.create();
    this.active.set(id, value);
    return value;
  }

  public retain(ids: ReadonlySet<number>): void {
    for (const [id, value] of this.active) {
      if (ids.has(id)) continue;
      this.hide(value);
      this.active.delete(id);
      this.available.push(value);
    }
  }

  /** Phaser owns destruction on scene shutdown; discard the dead references. */
  public clear(): void {
    this.active.clear();
    this.available.length = 0;
  }
}
