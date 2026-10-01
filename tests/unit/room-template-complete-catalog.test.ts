import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';

describe('complete furnished room plan catalogue', () => {
  it('covers every released room type, rather than only the six initial plans', () => {
    const covered = new Set(ROOM_TEMPLATE_IDS.flatMap((id) => instantiateRoomTemplate(id, { x: 0, y: 0 }).zones.map((zone) => zone.roomId)));
    expect([...covered].sort()).toEqual(defaultRoomContentRegistry.all().map((room) => room.id).sort());
  });

  it.each(ROOM_TEMPLATE_IDS.flatMap((id) => [false, true].map((mirrorX) => ({ id, mirrorX }))))('$id mirrored=$mirrorX satisfies size and exact fixture requirements without overlap', ({ id, mirrorX }) => {
    const plan = instantiateRoomTemplate(id, { x: -7, y: 30 }, { mirrorX });
    const occupied = new Set(plan.wallSquares.map(({ x, y }) => `${x}:${y}`));
    for (const placed of plan.objects) {
      const objectId = getBuildableDefinition(placed.buildableId).placesObjectId!;
      const object = defaultObjectRegistry.getById(objectId)!;
      for (let y = placed.y; y < placed.y + object.footprint.height; y += 1) {
        for (let x = placed.x; x < placed.x + object.footprint.width; x += 1) {
          expect(occupied.has(`${x}:${y}`)).toBe(false);
          expect(plan.zones.some((zone) => x >= zone.x && y >= zone.y && x < zone.x + zone.width && y < zone.y + zone.height)).toBe(true);
          occupied.add(`${x}:${y}`);
        }
      }
    }
    for (const zone of plan.zones) {
      const room = defaultRoomContentRegistry.getById(zone.roomId)!;
      expect(room).toBeDefined();
      for (const requirement of room.requirements) {
        if (requirement.type === 'minimum-size') {
          expect(zone.width).toBeGreaterThanOrEqual(requirement.minWidth);
          expect(zone.height).toBeGreaterThanOrEqual(requirement.minHeight);
          expect(zone.width * zone.height).toBeGreaterThanOrEqual(requirement.minTiles);
        } else if (requirement.type === 'object') {
          const inZone = plan.objects.filter((placed) => getBuildableDefinition(placed.buildableId).placesObjectId === requirement.objectId && placed.x >= zone.x && placed.y >= zone.y && placed.x < zone.x + zone.width && placed.y < zone.y + zone.height);
          expect(inZone.length).toBeGreaterThanOrEqual(requirement.minQuantity);
        } else if (requirement.type === 'outdoors') {
          expect(plan.wallSquares).toEqual([]);
          expect(plan.doorSquares).toEqual([]);
        } else {
          expect(plan.wallSquares.length).toBeGreaterThan(0);
          expect(plan.doorSquares.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
