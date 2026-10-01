import { describe, expect, it } from 'vitest';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';

describe('one deterministic room template build plan', () => {
  it('orders every square wall, one north-facing door and the furniture after the shell', () => {
    const built = createRoomTemplateBuildPlan('cell-basic', { x: 10, y: 20 }, false, 42);
    expect(built.orders).toHaveLength(built.plan.wallSquares.length + built.plan.doorSquares.length + built.plan.objects.length);
    expect(built.shellOrderIds).toHaveLength(built.plan.wallSquares.length + 1);
    expect(built.orders.map((order) => order.id)).toEqual([...built.orders.map((order) => order.id)].sort());
    expect(built.orders.slice(0, built.plan.wallSquares.length).every((order) =>
      order.definitionId === 'wall-brick' && order.footprint === 'square',
    )).toBe(true);
    expect(built.orders[built.plan.wallSquares.length]).toMatchObject({
      definitionId: 'door-wooden', edge: 'north', location: { x: 11, y: 27 },
    });
    expect(built.orders.slice(-2).map((order) => order.definitionId)).toEqual(['bed-wooden', 'toilet-brick']);
    expect(new Set(built.orders.map((order) => order.id)).size).toBe(built.orders.length);
  });

  it('keeps mirrored geometry and identity stable for a queued command restored later', () => {
    const first = createRoomTemplateBuildPlan('cell-large', { x: 2, y: 3 }, true, 9);
    expect(createRoomTemplateBuildPlan('cell-large', { x: 2, y: 3 }, true, 9)).toEqual(first);
    expect(first.plan.doorSquares).toEqual([{ x: 5, y: 10 }]);
    expect(first.orders[first.plan.wallSquares.length]?.location).toEqual({ x: 5, y: 10 });
  });
});

