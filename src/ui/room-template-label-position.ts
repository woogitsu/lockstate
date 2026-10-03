interface Point { readonly x: number; readonly y: number }
interface Bounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/** Keep the existing construction readout beside the exact projected floor. */
export function positionRoomTemplateLabel(bounds: Bounds, footprint: readonly Point[], size: { width: number; height: number }, anchor: Point): Point {
  const maxX = Math.max(bounds.left, bounds.right - size.width);
  const maxY = Math.max(bounds.top, bounds.bottom - size.height);
  const clampX = (x: number) => Math.max(bounds.left, Math.min(maxX, x));
  const clampY = (y: number) => Math.max(bounds.top, Math.min(maxY, y));
  const preferred = { x: clampX(anchor.x), y: clampY(anchor.y - size.height - 8) };
  const xs = [preferred.x, bounds.left, maxX, (bounds.left + maxX) / 2];
  const ys = [preferred.y, bounds.top, maxY, (bounds.top + maxY) / 2];
  const candidates = xs.flatMap(x => ys.map(y => ({ x, y })));
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...footprint.map((a, i) => {
    const b = footprint[(i + 1) % footprint.length]!;
    return { x: -(b.y - a.y), y: b.x - a.x };
  })];
  const overlaps = (point: Point): boolean => {
    const box = [{ x: point.x - 4, y: point.y - 4 }, { x: point.x + size.width + 4, y: point.y - 4 }, { x: point.x + size.width + 4, y: point.y + size.height + 4 }, { x: point.x - 4, y: point.y + size.height + 4 }];
    return axes.every(axis => {
      const a = footprint.map(p => p.x * axis.x + p.y * axis.y);
      const b = box.map(p => p.x * axis.x + p.y * axis.y);
      return Math.min(...a) < Math.max(...b) && Math.min(...b) < Math.max(...a);
    });
  };
  candidates.sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y));
  return candidates.find(point => !overlaps(point)) ?? preferred;
}
