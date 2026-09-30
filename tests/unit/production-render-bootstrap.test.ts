import { describe, expect, it, vi } from 'vitest';
import { bootstrapProductionRenderScene } from '../../src/rendering/scene/production-render-bootstrap';

describe('production render bootstrap', () => {
  it('keeps default WorldScene synchronous and registry-free', async () => {
    const load = vi.fn(async () => ({ medical: true }));
    const world = vi.fn(() => ({ kind: 'world' }));
    const result = await bootstrapProductionRenderScene({ loadObliqueCatalogs: load, createWorld: world, createOblique: vi.fn(), });
    expect(result).toEqual({ mode: 'world', scene: { kind: 'world' } });
    expect(world).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });

  it('loads catalogs before constructing oblique and awaits ready', async () => {
    const order: string[] = [];
    const scene = { ready: vi.fn(async () => { order.push('ready'); }), kind: 'oblique' };
    const result = await bootstrapProductionRenderScene({
      mode: 'oblique',
      loadObliqueCatalogs: vi.fn(async () => { order.push('catalogs'); return { medical: true }; }),
      createWorld: vi.fn(),
      createOblique: vi.fn((catalogs) => { expect(catalogs).toEqual({ medical: true }); order.push('construct'); return scene; }),
    });
    expect(result).toEqual({ mode: 'oblique', scene });
    expect(order).toEqual(['catalogs', 'construct', 'ready']);
  });
});
