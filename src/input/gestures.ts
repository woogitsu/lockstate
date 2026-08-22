export interface TouchPoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export type Gesture =
  | { readonly kind: 'pan'; readonly deltaX: number; readonly deltaY: number }
  | { readonly kind: 'pinch'; readonly centerX: number; readonly centerY: number; readonly scale: number };

export class TouchGestureTracker {
  private readonly points = new Map<number, TouchPoint>();

  public begin(point: TouchPoint): void {
    this.points.set(point.id, point);
  }

  public end(id: number): void {
    this.points.delete(id);
  }

  public move(point: TouchPoint): Gesture | undefined {
    const previous = this.points.get(point.id);
    if (previous === undefined) return undefined;
    const peers = [...this.points.values()].filter((entry) => entry.id !== point.id);
    this.points.set(point.id, point);
    if (peers.length === 0) {
      return { kind: 'pan', deltaX: point.x - previous.x, deltaY: point.y - previous.y };
    }
    const peer = peers[0];
    if (peer === undefined) return undefined;
    const previousDistance = Math.hypot(previous.x - peer.x, previous.y - peer.y);
    const distance = Math.hypot(point.x - peer.x, point.y - peer.y);
    if (previousDistance === 0 || distance === 0) return undefined;
    return {
      kind: 'pinch',
      centerX: (point.x + peer.x) / 2,
      centerY: (point.y + peer.y) / 2,
      scale: distance / previousDistance,
    };
  }
}
