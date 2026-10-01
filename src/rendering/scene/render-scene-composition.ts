import type { ObliqueModuleCatalog } from '../assets/oblique-module-catalog';
import { resolveObliqueCatalogs } from './oblique-composition-adapter';

export type RenderSceneMode = 'world' | 'oblique';
export interface RenderScenePlan { readonly mode: RenderSceneMode; readonly catalogs?: ReadonlyMap<string, ObliqueModuleCatalog> | undefined; }

/** Pure async composition decision; callers construct Phaser scenes only after this resolves. */
export async function planRenderScene(mode: RenderSceneMode): Promise<RenderScenePlan> {
  if (mode === 'world') return { mode };
  const catalogs = await resolveObliqueCatalogs(true);
  return { mode, catalogs };
}
