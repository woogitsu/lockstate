import { describe, expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';

describe('the first Cell template (#1586)', () => {
  it('rejects origins whose complete footprint exceeds safe tile coordinates', () => {
    expect(() => instantiateRoomTemplate('cell-basic', { x: Number.MAX_SAFE_INTEGER, y: 10 })).toThrow(RangeError);
    expect(() => instantiateRoomTemplate('cell-row-four', { x: 10, y: Number.MAX_SAFE_INTEGER })).toThrow(RangeError);
  });
  it('occupies an exact 4×7 square footprint around a 2×5 interior', () => {
    const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 20 });
    expect(plan.width).toBe(4);
    expect(plan.height).toBe(7);
    expect(plan.zone).toEqual({ roomId: 'room.cell', x: 11, y: 21, width: 2, height: 5 });
    expect(plan.wallSquares).toHaveLength(17);
    expect(plan.doorSquares).toEqual([{ x: 11, y: 26 }]);
    expect(plan.objects).toEqual([
      { buildableId: 'bed-wooden', x: 11, y: 21 },
      { buildableId: 'toilet-brick', x: 12, y: 24 },
    ]);

    const occupied = [...plan.wallSquares, ...plan.doorSquares];
    expect(new Set(occupied.map(({ x, y }) => `${x},${y}`)).size).toBe(18);
    expect(occupied.every(({ x, y }) => x === 10 || x === 13 || y === 20 || y === 26)).toBe(true);
  });

  it('mirrors the door and furniture without changing the footprint', () => {
    const left = instantiateRoomTemplate('cell-basic', { x: -4, y: 8 });
    const right = instantiateRoomTemplate('cell-basic', { x: -4, y: 8 }, { mirrorX: true });
    expect(right.doorSquares).toEqual([{ x: -2, y: 14 }]);
    expect(right.objects).toEqual([
      { buildableId: 'bed-wooden', x: -2, y: 9 },
      { buildableId: 'toilet-brick', x: -3, y: 12 },
    ]);
    expect(right.wallSquares).toHaveLength(left.wallSquares.length);
    expect(new Set(right.wallSquares.map(({ x, y }) => `${x},${y}`)).size).toBe(17);
  });
});
