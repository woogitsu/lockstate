import { expect, it } from 'vitest';
import { VisibleObjectPool } from '../../src/rendering/scene/visible-object-pool';

it('reuses moving objects and culled slots without exceeding the visible high-water mark', () => {
  let created = 0;
  const pool = new VisibleObjectPool(() => ({ serial: ++created, visible: true }), value => { value.visible = false; });
  const first = pool.acquire(1);
  const second = pool.acquire(2);
  for (let frame = 0; frame < 100; frame += 1) {
    pool.retain(new Set([1, 2]));
    expect(pool.acquire(1)).toBe(first);
    expect(pool.acquire(2)).toBe(second);
  }
  pool.retain(new Set([2, 3]));
  expect(first.visible).toBe(false);
  expect(pool.acquire(3)).toBe(first);
  pool.retain(new Set());
  expect(pool.active.size).toBe(0);
  pool.acquire(4); pool.acquire(5);
  expect(created).toBe(2);
  pool.clear();
  expect(pool.active.size).toBe(0);
  expect(pool.acquire(1)).not.toBe(first);
  expect(created).toBe(3);
});
