import { expect, it } from 'vitest';
import { completedWallLogisticsSave } from '../browser/fixtures/completed-wall-logistics';

it.each([false, true])('prepares logistics and optional cutaway Yard=%s through real scheduled commands without constructing the target wall', (cutaway) => {
  const saved = completedWallLogisticsSave(cutaway);
  expect(saved.payload.construction.orders.length).toBeGreaterThan(0);
  expect(saved.payload.construction.orders.every(order => order.state === 'completed')).toBe(true);
  expect(saved.payload.construction.orders.some(order => order.location.x === 20 && order.location.y === 20)).toBe(false);
});
