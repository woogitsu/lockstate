import { describe, expect, it } from 'vitest';
import { wallDragCatalogueValue, wallDragPreviewTiles } from '../../src/ui/hud/oblique-wall-drag-preview';

describe('oblique full-square wall drag preview', () => {
  it('expands either drag direction into the exact rectangle in row order', () => {
    const forward = wallDragPreviewTiles({ x: 16, y: 16 }, { x: 18, y: 18 });
    expect(forward).toHaveLength(9);
    expect(forward).toEqual(wallDragPreviewTiles({ x: 18, y: 18 }, { x: 16, y: 16 }));
    expect(forward[0]).toEqual({ x: 16, y: 16 });
    expect(forward[8]).toEqual({ x: 18, y: 18 });
    expect(wallDragPreviewTiles({ x: Number.MAX_SAFE_INTEGER, y: 0 }, { x: Number.MAX_SAFE_INTEGER, y: 0 })).toEqual([{ x: Number.MAX_SAFE_INTEGER, y: 0 }]);
    expect(wallDragPreviewTiles({ x: 0, y: 0 }, { x: 64, y: 63 })).toEqual([]);
  });

  it('quotes the simulation-derived catalogue unit price without implying actual debit', () => {
    expect(wallDragCatalogueValue(80, 9)).toBe(720);
    expect(wallDragCatalogueValue(undefined, 9)).toBeUndefined();
    expect(wallDragCatalogueValue(Number.MAX_SAFE_INTEGER, 9)).toBeUndefined();
  });
});
