import { expect, it, vi, afterEach } from 'vitest';
import { clearObliqueModuleSetCache, fetchObliqueModuleSet } from '../../src/rendering/assets/oblique-module-registry';
afterEach(()=>{clearObliqueModuleSetCache();vi.restoreAllMocks();});
it('uses fallback when registry fetch fails',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));const fallback=new Map([['fallback',{} as any]]);await expect(fetchObliqueModuleSet('/offline',{fallback})).resolves.toEqual(fallback);});
