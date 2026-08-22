export class TransformComponent {
  public readonly x: Float32Array;
  public readonly y: Float32Array;

  constructor(capacity: number) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
  }

  public getSnapshot(): { x: Float32Array; y: Float32Array } {
    return {
      x: new Float32Array(this.x),
      y: new Float32Array(this.y),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.x.set(snapshot.x);
    this.y.set(snapshot.y);
  }
}

export class NeedsComponent {
  public readonly health: Uint8Array;
  public readonly energy: Uint8Array;

  constructor(capacity: number) {
    this.health = new Uint8Array(capacity);
    this.energy = new Uint8Array(capacity);
  }

  public getSnapshot(): { health: Uint8Array; energy: Uint8Array } {
    return {
      health: new Uint8Array(this.health),
      energy: new Uint8Array(this.energy),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.health.set(snapshot.health);
    this.energy.set(snapshot.energy);
  }
}

export class RoleComponent {
  public readonly type: Uint8Array;

  constructor(capacity: number) {
    this.type = new Uint8Array(capacity);
  }

  public getSnapshot(): { type: Uint8Array } {
    return {
      type: new Uint8Array(this.type),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.type.set(snapshot.type);
  }
}

export class ReferenceComponent {
  public readonly owner: Uint32Array;
  public readonly target: Uint32Array;

  constructor(capacity: number) {
    this.owner = new Uint32Array(capacity);
    this.target = new Uint32Array(capacity);
  }

  public getSnapshot(): { owner: Uint32Array; target: Uint32Array } {
    return {
      owner: new Uint32Array(this.owner),
      target: new Uint32Array(this.target),
    };
  }

  public loadSnapshot(snapshot: ReturnType<typeof this.getSnapshot>): void {
    this.owner.set(snapshot.owner);
    this.target.set(snapshot.target);
  }
}
