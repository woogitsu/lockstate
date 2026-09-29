import { expect, it, vi, afterEach } from 'vitest';
import { clearObliqueModuleSetCache, fetchObliqueModuleSet, parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
afterEach(()=>{clearObliqueModuleSetCache();vi.restoreAllMocks();});
it('uses fallback when registry fetch fails',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));const fallback=new Map([['fallback',{} as any]]);await expect(fetchObliqueModuleSet('/offline',{fallback})).resolves.toEqual(fallback);});
it('rejects duplicate asset ids in the registry contract',()=>{expect(()=>parseObliqueModuleRegistry({schemaVersion:1,entries:[{assetId:'wall',manifest:'/game-content/oblique-wall.v1.json'},{assetId:'wall',manifest:'/game-content/oblique-wall-2.v1.json'}]})).toThrow('Duplicate oblique module asset id.');});
