import { describe, expect, it, vi } from 'vitest';
import { planRenderScene } from '../../src/rendering/scene/render-scene-composition';

vi.mock('../../src/rendering/scene/oblique-composition-adapter', () => ({
  resolveObliqueCatalogs: vi.fn(async () => new Map([['medical', { assetId: 'medical' }]])),
}));

describe('render scene composition', () => {
  it('keeps world mode free of registry work', async () => expect(await planRenderScene('world')).toEqual({ mode: 'world' }));
  it('returns catalogs for explicit oblique mode', async () => expect((await planRenderScene('oblique')).catalogs?.has('medical')).toBe(true));
  it('propagates enabled registry errors', async () => {
    const { resolveObliqueCatalogs } = await import('../../src/rendering/scene/oblique-composition-adapter');
    vi.mocked(resolveObliqueCatalogs).mockRejectedValueOnce(new Error('registry unavailable'));
    await expect(planRenderScene('oblique')).rejects.toThrow('registry unavailable');
  });
});
