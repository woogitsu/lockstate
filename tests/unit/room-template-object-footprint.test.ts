import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, roomTemplateObjectSquares } from '../../src/content/room-template-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { defaultObjectRegistry } from '../../src/content/object-catalog';

describe('room plan furniture preview', () => {
  it.each(ROOM_TEMPLATE_IDS)('%s paints exactly the occupied squares from the object catalogue', (id) => {
    for (const mirrorX of [false, true]) {
      const plan = instantiateRoomTemplate(id, { x: 10, y: 10 }, { mirrorX });
      const expected = new Set<string>();
      for (const object of plan.objects) {
        const objectId = getBuildableDefinition(object.buildableId).placesObjectId;
        const footprint = defaultObjectRegistry.getById(objectId!)?.footprint;
        expect(footprint).toBeDefined();
        for (let dy = 0; dy < footprint!.height; dy += 1) {
          for (let dx = 0; dx < footprint!.width; dx += 1) expected.add(`${object.x + dx},${object.y + dy}`);
        }
      }
      expect(new Set(roomTemplateObjectSquares(plan).map(({ x, y }) => `${x},${y}`))).toEqual(expected);
    }
  });
});
