import { describe, expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { rotateRoomTemplateLayout, rotateTemplateEdge, rotateTemplateFootprint, rotateTemplateSquare } from '../../src/content/room-template-rotation-geometry';

const footprintOf = (buildableId: string) => {
  const objectId = BUILDABLE_REGISTRY.get(buildableId)?.placesObjectId;
  const footprint = defaultObjectRegistry.getById(objectId ?? '')?.footprint;
  if (footprint === undefined) throw new Error(`Missing catalogue footprint for ${buildableId}`);
  return footprint;
};

describe('quarter-turn room plan geometry', () => {
  it('rotates a non-square plan through four turns without changing occupied tiles', () => {
    const source = { x: 1, y: 2 };
    expect(rotateTemplateSquare(source, 6, 7, 1)).toEqual({ x: 4, y: 1 });
    expect(rotateTemplateSquare(source, 6, 7, 2)).toEqual({ x: 4, y: 4 });
    expect(rotateTemplateSquare(source, 6, 7, 3)).toEqual({ x: 2, y: 4 });
    expect(rotateTemplateSquare(source, 6, 7, 0)).toEqual(source);
  });

  it('rotates every occupied furniture tile, not just its anchor', () => {
    const footprint = rotateTemplateFootprint({ x: 1, y: 2, width: 3, height: 2 }, 8, 8, 1);
    expect(footprint).toEqual({ x: 4, y: 1, width: 2, height: 3 });
    expect(rotateTemplateFootprint(footprint, 8, 8, 3)).toEqual({ x: 1, y: 2, width: 3, height: 2 });
  });

  it('normalizes a rotated door edge onto canonical north or west storage', () => {
    expect(rotateTemplateEdge({ x: 2, y: 6, edge: 'north' }, 6, 7, 1))
      .toEqual({ x: 1, y: 2, edge: 'west' });
    expect(rotateTemplateEdge({ x: 2, y: 6, edge: 'north' }, 6, 7, 2))
      .toEqual({ x: 3, y: 1, edge: 'north' });
  });

  it('turns the authored canteen door, zoning and wide furniture together', () => {
    const authored = instantiateRoomTemplate('canteen-basic', { x: 10, y: 10 });
    const turned = rotateRoomTemplateLayout(authored, 1, footprintOf);
    expect(turned.walls).toHaveLength(authored.wallSquares.length);
    expect(turned.doors).toEqual([{ square: { x: 10, y: 13 }, orderEdge: { x: 11, y: 13, edge: 'west' } }]);
    expect(turned.zones).toEqual([{ roomId: 'room.canteen', x: 11, y: 11, width: 6, height: 6 }]);
    expect(turned.objects[0]).toEqual({ buildableId: 'dining-table-wooden', x: 15, y: 11, width: 2, height: 3, orientation: 1 });
    for (const object of turned.objects) {
      expect(object.x).toBeGreaterThanOrEqual(turned.zones[0]!.x);
      expect(object.y).toBeGreaterThanOrEqual(turned.zones[0]!.y);
      expect(object.x + object.width).toBeLessThanOrEqual(turned.zones[0]!.x + turned.zones[0]!.width);
      expect(object.y + object.height).toBeLessThanOrEqual(turned.zones[0]!.y + turned.zones[0]!.height);
    }
  });
});
