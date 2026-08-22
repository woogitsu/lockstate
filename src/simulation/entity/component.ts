export type ComponentId = number;

export class QueryMask {
  public readonly chunks: number[];

  constructor(maxComponents: number) {
    const numArrays = Math.ceil(maxComponents / 32);
    this.chunks = new Array(numArrays).fill(0);
  }

  public require(componentId: ComponentId): this {
    const arrayIdx = Math.floor(componentId / 32);
    const bit = componentId % 32;
    (this.chunks[arrayIdx] as number) |= (1 << bit);
    return this;
  }
}

export class ComponentBitset {
  public readonly masks: Uint32Array[];

  constructor(capacity: number, maxComponents: number = 32) {
    const numArrays = Math.ceil(maxComponents / 32);
    this.masks = Array.from({ length: numArrays }, () => new Uint32Array(capacity));
  }

  public add(index: number, componentId: ComponentId): void {
    const arrayIdx = Math.floor(componentId / 32);
    const bit = componentId % 32;
    const arr = this.masks[arrayIdx] as Uint32Array;
    arr[index] = arr[index]! | (1 << bit);
  }

  public remove(index: number, componentId: ComponentId): void {
    const arrayIdx = Math.floor(componentId / 32);
    const bit = componentId % 32;
    const arr = this.masks[arrayIdx] as Uint32Array;
    arr[index] = arr[index]! & ~(1 << bit);
  }

  public has(index: number, componentId: ComponentId): boolean {
    const arrayIdx = Math.floor(componentId / 32);
    const bit = componentId % 32;
    const arr = this.masks[arrayIdx] as Uint32Array;
    return (arr[index]! & (1 << bit)) !== 0;
  }

  public hasAll(index: number, queryMask: QueryMask): boolean {
    for (let i = 0; i < queryMask.chunks.length; i++) {
      const mask = this.masks[i] as Uint32Array;
      const chunk = queryMask.chunks[i] as number;
      if ((mask[index]! & chunk) !== chunk) {
        return false;
      }
    }
    return true;
  }

  public clear(index: number): void {
    for (let i = 0; i < this.masks.length; i++) {
      const mask = this.masks[i] as Uint32Array;
      mask[index] = 0;
    }
  }

  public getSnapshot(): Uint32Array[] {
    return this.masks.map((m) => new Uint32Array(m));
  }

  public loadSnapshot(snapshot: Uint32Array[]): void {
    if (snapshot.length !== this.masks.length) {
      throw new Error('Snapshot component mask length mismatch');
    }
    for (let i = 0; i < this.masks.length; i++) {
      const snap = snapshot[i] as Uint32Array;
      const mask = this.masks[i] as Uint32Array;
      if (snap.length !== mask.length) {
        throw new Error('Snapshot capacity mismatch');
      }
      mask.set(snap);
    }
  }
}
