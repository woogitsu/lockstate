import { expect, it, vi, afterEach } from 'vitest';
import { clearObliqueModuleSetCache, fetchObliqueModuleSet, parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
afterEach(()=>{clearObliqueModuleSetCache();vi.restoreAllMocks();});
it('uses fallback when registry fetch fails',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));const fallback=new Map([['fallback',{} as any]]);await expect(fetchObliqueModuleSet('/offline',{fallback})).resolves.toEqual(fallback);});
it('rejects duplicate asset ids in the registry contract',()=>{expect(()=>parseObliqueModuleRegistry({schemaVersion:1,entries:[{assetId:'wall',manifest:'/game-content/oblique-wall.v1.json'},{assetId:'wall',manifest:'/game-content/oblique-wall-2.v1.json'}]})).toThrow('Duplicate oblique module asset id.');});
it('applies each concurrent caller fallback when the shared request fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const firstFallback = new Map([['first', {} as any]]);
  const secondFallback = new Map([['second', {} as any]]);
  const first = fetchObliqueModuleSet('/concurrent-offline', { fallback: firstFallback });
  const second = fetchObliqueModuleSet('/concurrent-offline', { fallback: secondFallback });
  const results = await Promise.allSettled([first, second]);
  expect(results).toEqual([
    { status: 'fulfilled', value: firstFallback },
    { status: 'fulfilled', value: secondFallback },
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('retries after a shared failure and does not mutate the fallback map', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const fallback = new Map([['fallback', {} as any]]);
  const recovered = await fetchObliqueModuleSet('/retry-offline', { fallback });
  recovered.clear();
  expect(fallback.size).toBe(1);
  await expect(fetchObliqueModuleSet('/retry-offline')).rejects.toThrow('offline');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
