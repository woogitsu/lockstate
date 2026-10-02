import { expect, it } from 'vitest';
import { instantiateRoomTemplate, ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { roomTemplateMiniatureFixtures } from '../../src/ui/hud/room-template-miniature';
import { instantiateOrientedRoomTemplate } from '../../src/content/room-template-rotation';
const footprint = (id: string) => defaultObjectRegistry.getById(getBuildableDefinition(id).placesObjectId!)!.footprint;

it('turns the selected bed rectangle with the room rather than reusing its authored dimensions', () => {
  const plan = instantiateOrientedRoomTemplate('cell-basic', { x: -8, y: 9 }, { quarterTurns: 1 }, footprint);
  expect(roomTemplateMiniatureFixtures(plan, footprint)).toEqual([
    { x: 4, y: 1, width: 2, height: 1 }, { x: 2, y: 2, width: 1, height: 1 },
  ]);
});

it.each(ROOM_TEMPLATE_IDS)('%s preserves complete separate authored fixtures in its card', id => {
  const plan = instantiateRoomTemplate(id, { x: -10, y: 20 });
  const fixtures = roomTemplateMiniatureFixtures(plan, footprint);
  expect(fixtures).toHaveLength(plan.objects.length);
  fixtures.forEach((fixture, index) => {
    const object = plan.objects[index]!;
    expect(fixture).toEqual({ x: object.x + 10, y: object.y - 20, ...footprint(object.buildableId) });
    expect(fixture.x + fixture.width).toBeLessThanOrEqual(plan.width);
    expect(fixture.y + fixture.height).toBeLessThanOrEqual(plan.height);
  });
});

it('shows one two-square bed, rather than two individual pieces of furniture', () => {
  const fixtures = roomTemplateMiniatureFixtures(instantiateRoomTemplate('cell-basic', { x: 0, y: 0 }), footprint);
  expect(fixtures).toEqual([{ x: 1, y: 1, width: 1, height: 2 }, { x: 2, y: 4, width: 1, height: 1 }]);
});

it('keeps a mirrored complete bed on its canonical opposite side', () => {
  const plan = instantiateRoomTemplate('cell-basic', { x: -8, y: 9 }, { mirrorX: true });
  expect(roomTemplateMiniatureFixtures(plan, footprint)).toEqual([
    { x: 2, y: 1, width: 1, height: 2 }, { x: 1, y: 4, width: 1, height: 1 },
  ]);
});
