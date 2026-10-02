import { expect, it } from 'vitest';
import { completedWallLogisticsSave } from '../browser/fixtures/completed-wall-logistics';

it('prepares logistics through completed real scheduled commands without constructing the target wall', () => {
  const saved = completedWallLogisticsSave();
  expect(saved.payload.construction.orders.length).toBeGreaterThan(0);
  expect(saved.payload.construction.orders.every(order => order.state === 'completed')).toBe(true);
  expect(saved.payload.construction.orders.some(order => order.location.x === 20 && order.location.y === 20)).toBe(false);
});
