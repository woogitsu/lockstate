export interface WallPreviewTile { readonly x: number; readonly y: number }

/** The same full-square rectangle the release gesture promises to place. */
export function wallDragPreviewTiles(start: WallPreviewTile, end: WallPreviewTile): readonly WallPreviewTile[] {
  if (![start.x, start.y, end.x, end.y].every(Number.isSafeInteger)) return [];
  if ((Math.abs(end.x - start.x) + 1) * (Math.abs(end.y - start.y) + 1) > 4096) return [];
  const tiles: WallPreviewTile[] = [];
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  for (let y = minY; ; y += 1) {
    for (let x = minX; ; x += 1) {
      tiles.push({ x, y });
      if (x === maxX) break;
    }
    if (y === maxY) break;
  }
  return tiles;
}

/** A catalogue estimate, not the worker's eventual material debit. */
export function wallDragCatalogueValue(unitMinorUnits: number | undefined, squareCount: number): number | undefined {
  if (unitMinorUnits === undefined || !Number.isSafeInteger(unitMinorUnits) || unitMinorUnits < 0 ||
      !Number.isSafeInteger(squareCount) || squareCount < 1) return undefined;
  const value = unitMinorUnits * squareCount;
  return Number.isSafeInteger(value) ? value : undefined;
}
