import { expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { instantiateOrientedRoomTemplate } from '../../src/content/room-template-rotation';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';

const footprintOf = (id: Parameters<typeof getBuildableDefinition>[0]) =>
  defaultObjectRegistry.getById(getBuildableDefinition(id).placesObjectId!)!.footprint;

it('turns a basic Cell clockwise around its retained world origin with exact fixture extents', () => {
  const plan = instantiateOrientedRoomTemplate('cell-basic', { x: -5, y: 20 }, { quarterTurns: 1 }, footprintOf);
  expect([plan.width, plan.height]).toEqual([7, 4]);
  expect(plan.zone).toEqual({ roomId: 'room.cell', x: -4, y: 21, width: 5, height: 2 });
  expect(plan.doorSquares).toEqual([{ x: -5, y: 21 }]);
  expect(plan.objects).toEqual([
    { buildableId: 'bed-wooden', x: -1, y: 21, width: 2, height: 1, quarterTurns: 1 },
    { buildableId: 'toilet-brick', x: -3, y: 22, width: 1, height: 1, quarterTurns: 1 },
  ]);
});

it('applies mirroring before the clockwise turn', () => {
  const plan = instantiateOrientedRoomTemplate('cell-basic', { x: 10, y: 20 }, { mirrorX: true, quarterTurns: 3 }, footprintOf);
  expect(plan.doorSquares).toEqual([{ x: 16, y: 21 }]);
  expect(plan.objects).toEqual([
    { buildableId: 'bed-wooden', x: 11, y: 21, width: 2, height: 1, quarterTurns: 3 },
    { buildableId: 'toilet-brick', x: 14, y: 22, width: 1, height: 1, quarterTurns: 3 },
  ]);
});

it('validates final rotated bounds rather than the discarded unrotated extent', () => {
  const origin = { x: 10, y: Number.MAX_SAFE_INTEGER - 4 };
  const rotated = instantiateOrientedRoomTemplate('cell-basic', origin, { quarterTurns: 1 }, footprintOf);
  expect(rotated.height).toBe(4);
  expect(rotated.objects[0]?.y).toBe(Number.MAX_SAFE_INTEGER - 3);
  expect(() => instantiateOrientedRoomTemplate('cell-basic', origin, {}, footprintOf)).toThrow(RangeError);
  expect(() => instantiateOrientedRoomTemplate('cell-basic', { x: Number.MAX_SAFE_INTEGER - 6, y: 0 }, { quarterTurns: 1 }, footprintOf)).toThrow(RangeError);
});