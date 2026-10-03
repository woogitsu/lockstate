import { describe, expect, it, vi } from 'vitest';
import { cacheVerifiedObliqueCatalogs, prepareProductionRenderScene, productionRenderMode } from '../../src/rendering/scene/production-render-bootstrap';

describe('production render bootstrap', () => {
  it('keeps the default WorldScene registry-free', async () => {
    const load = vi.fn(async () => ({ medical: true }));
    const world = vi.fn(() => ({ kind: 'world' }));
    const result = await prepareProductionRenderScene({ loadObliqueCatalogs: load, createWorld: world, createOblique: vi.fn() });
    expect(result).toEqual({ mode: 'world', scene: { kind: 'world' } });
    expect(world).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads catalogs before constructing opted-in ObliqueWorldScene', async () => {
    const order: string[] = [];
    const result = await prepareProductionRenderScene({
      mode: 'oblique',
      loadObliqueCatalogs: vi.fn(async () => { order.push('catalogs'); return { medical: true }; }),
      createWorld: vi.fn(),
      createOblique: vi.fn((catalogs) => { expect(catalogs).toEqual({ medical: true }); order.push('construct'); return { kind: 'oblique' }; }),
    });
    expect(result).toEqual({ mode: 'oblique', scene: { kind: 'oblique' } });
    expect(order).toEqual(['catalogs', 'construct']);
  });

  it('recognises only an explicit oblique renderer switch', () => {
    expect(productionRenderMode('')).toBe('world');
    expect(productionRenderMode('?renderer=oblique')).toBe('oblique');
    expect(productionRenderMode('?view=oblique')).toBe('oblique');
    expect(productionRenderMode('?renderer=flat')).toBe('world');
  });
});

it('uses the verified catalogue during a rollback even if the network subsequently fails',async()=>{
  const verified={module:'bed'};
  const network=vi.fn(async()=>verified);
  const cached=cacheVerifiedObliqueCatalogs(network);
  expect(await cached()).toBe(verified);
  network.mockRejectedValueOnce(new Error('offline during rollback'));
  expect(await cached()).toBe(verified);
  expect(network).toHaveBeenCalledOnce();
});
it('can retry an initial failed catalogue without caching its rejection',async()=>{
  const network=vi.fn(async()=>({module:'bed'})).mockRejectedValueOnce(new Error('503'));
  const cached=cacheVerifiedObliqueCatalogs(network);
  await expect(cached()).rejects.toThrow('503');
  expect(await cached()).toEqual({module:'bed'});
  expect(network).toHaveBeenCalledTimes(2);
});
