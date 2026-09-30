import { describe, expect, it, vi } from 'vitest';
import { resolveObliqueCatalogs } from '../../src/rendering/scene/oblique-composition-adapter';

vi.mock('../../src/rendering/assets/oblique-module-registry', () => ({
  fetchObliqueModuleSet: vi.fn(async () => new Map([['medical', { assetId: 'medical' }]])),
}));

describe('oblique composition adapter', () => {
  it('keeps the default path network-free', async () => expect(await resolveObliqueCatalogs(false)).toBeUndefined());
  it('loads catalogs only when explicitly enabled', async () => {
    const catalogs = await resolveObliqueCatalogs(true);
    expect([...catalogs!.keys()]).toEqual(['medical']);
  });
});
