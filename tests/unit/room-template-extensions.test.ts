import { describe, expect, it } from 'vitest';
import { instantiateRoomTemplate, type RoomTemplatePlan } from '../../src/content/room-template-catalog';

function expectUsableFootprint(plan: RoomTemplatePlan): void {
  const key = ({ x, y }: { x: number; y: number }): string => `${x},${y}`;
  const perimeter = [...plan.wallSquares, ...plan.doorSquares];
  expect(new Set(perimeter.map(key)).size).toBe(perimeter.length);
  const blocked = new Set(perimeter.map(key));
  expect(plan.objects.every((object) => !blocked.has(key(object)))).toBe(true);
  expect(plan.objects.every((object) =>
    object.x >= plan.zone.x && object.x < plan.zone.x + plan.zone.width &&
    object.y >= plan.zone.y && object.y < plan.zone.y + plan.zone.height,
  )).toBe(true);
}

describe('the next room templates (#1586)', () => {
  it('places a larger two-bed Cell with a full-square perimeter', () => {
    const plan = instantiateRoomTemplate('cell-large', { x: 10, y: 20 });
    expect([plan.width, plan.height]).toEqual([6, 7]);
    expect(plan.zone).toEqual({ roomId: 'room.cell', x: 11, y: 21, width: 4, height: 5 });
    expect(plan.doorSquares).toEqual([{ x: 12, y: 26 }]);
    expect(plan.objects).toEqual([
      { buildableId: 'bed-wooden', x: 11, y: 21 },
      { buildableId: 'bed-wooden', x: 14, y: 21 },
      { buildableId: 'toilet-brick', x: 11, y: 24 },
    ]);
    expectUsableFootprint(plan);
  });

  it('mirrors the larger Cell door and furniture inside the same zone', () => {
    const plan = instantiateRoomTemplate('cell-large', { x: 10, y: 20 }, { mirrorX: true });
    expect(plan.doorSquares).toEqual([{ x: 13, y: 26 }]);
    expect(plan.objects).toEqual([
      { buildableId: 'bed-wooden', x: 14, y: 21 },
      { buildableId: 'bed-wooden', x: 11, y: 21 },
      { buildableId: 'toilet-brick', x: 14, y: 24 },
    ]);
    expectUsableFootprint(plan);
  });

  it('places a ready shower room with two distinct shower heads', () => {
    const plan = instantiateRoomTemplate('shower-room', { x: 3, y: 4 });
    expect([plan.width, plan.height]).toEqual([5, 5]);
    expect(plan.zone).toEqual({ roomId: 'room.shower-room', x: 4, y: 5, width: 3, height: 3 });
    expect(plan.doorSquares).toEqual([{ x: 5, y: 8 }]);
    expect(plan.objects).toEqual([
      { buildableId: 'shower-head-brick', x: 4, y: 5 },
      { buildableId: 'shower-head-brick', x: 6, y: 5 },
    ]);
    expectUsableFootprint(plan);
  });

  it('places a complete canteen with two tables and four non-overlapping benches', () => {
    const plan = instantiateRoomTemplate('canteen-basic', { x: 10, y: 20 });
    expect([plan.width, plan.height]).toEqual([8, 8]);
    expect(plan.zone).toEqual({ roomId: 'room.canteen', x: 11, y: 21, width: 6, height: 6 });
    expect(plan.doorSquares).toEqual([{ x: 13, y: 27 }]);
    expect(plan.objects).toEqual([
      { buildableId: 'dining-table-wooden', x: 11, y: 21 },
      { buildableId: 'dining-table-wooden', x: 14, y: 21 },
      { buildableId: 'bench-wooden', x: 11, y: 23 },
      { buildableId: 'bench-wooden', x: 14, y: 23 },
      { buildableId: 'bench-wooden', x: 11, y: 25 },
      { buildableId: 'bench-wooden', x: 14, y: 25 },
    ]);
    expectUsableFootprint(plan);
  });

  it('places a kitchen with the three distinct food preparation fixtures', () => {
    const plan = instantiateRoomTemplate('kitchen-basic', { x: 10, y: 20 });
    expect([plan.width, plan.height]).toEqual([6, 6]);
    expect(plan.zone).toEqual({ roomId: 'room.kitchen', x: 11, y: 21, width: 4, height: 4 });
    expect(plan.doorSquares).toEqual([{ x: 12, y: 25 }]);
    expect(plan.objects).toEqual([
      { buildableId: 'stove-brick', x: 11, y: 21 },
      { buildableId: 'prep-counter-brick', x: 13, y: 21 },
      { buildableId: 'fridge-brick', x: 11, y: 23 },
    ]);
    expectUsableFootprint(plan);
  });
});
