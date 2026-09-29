import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, instantiateRoomTemplate, orientRoomTemplatePlan, roomTemplateObjectSquares } from '../../src/content/room-template-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';

it.each(ROOM_TEMPLATE_IDS.flatMap((id) => [
  { id, mirrorX: false }, { id, mirrorX: true },
]))('paints every occupied $id furnishing square inside its room (mirrorX=$mirrorX)', ({ id, mirrorX }) => {
  const plan = instantiateRoomTemplate(id, { x: 10, y: 10 }, { mirrorX });
  const shell = new Set([...plan.wallSquares, ...plan.doorSquares].map(({ x, y }) => `${x}:${y}`));
  const expected = new Set<string>();
  for (const object of plan.objects) {
    const buildable = BUILDABLE_REGISTRY.get(object.buildableId);
    const definition = defaultObjectRegistry.getById(buildable?.placesObjectId ?? '');
    expect(definition, object.buildableId).toBeDefined();
    for (let dy = 0; dy < definition!.footprint.height; dy += 1) {
      for (let dx = 0; dx < definition!.footprint.width; dx += 1) {
        const x = object.x + dx;
        const y = object.y + dy;
        const key = `${x}:${y}`;
        expect(shell.has(key), `${id} ${mirrorX ? 'mirrored' : 'normal'} ${object.buildableId} at ${key}`).toBe(false);
        expect(plan.zones.some((zone) => x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height), `${id} ${object.buildableId} outside a room at ${key}`).toBe(true);
        expect(expected.has(key), `${id} objects overlap at ${key}`).toBe(false);
        expected.add(key);
      }
    }
  }
  expect(new Set(roomTemplateObjectSquares(plan).map(({ x, y }) => `${x}:${y}`))).toEqual(expected);
});

it('paints all squares of furniture whose footprint turns with a room plan', () => {
  const plan = orientRoomTemplatePlan(instantiateRoomTemplate('canteen-basic', { x: 10, y: 10 }), 1);
  const table = plan.objects.find((object) => object.buildableId === 'dining-table-wooden');
  expect(table).toBeDefined();
  expect(roomTemplateObjectSquares({ ...plan, objects: [table!] })).toEqual([
    { x: 15, y: 11 }, { x: 16, y: 11 },
    { x: 15, y: 12 }, { x: 16, y: 12 },
    { x: 15, y: 13 }, { x: 16, y: 13 },
  ]);
});
