import type { OptionalRenderSceneMode, OptionalRenderScene } from './optional-render-scene-factory';

export interface ProductionRenderBootstrap<TWorld, TOblique, TCatalog> {
  readonly mode?: OptionalRenderSceneMode;
  readonly loadObliqueCatalogs: () => Promise<TCatalog>;
  readonly createWorld: () => TWorld;
  readonly createOblique: (catalogs: TCatalog) => TOblique & { ready(): Promise<void> };
}

/**
 * Composition-root seam for Issue #1845. World mode is synchronous and never
 * touches the registry. Opt-in oblique mode resolves catalogs before the
 * caller constructs Phaser.Game and waits for the scene's texture lifecycle.
 */
export async function bootstrapProductionRenderScene<TWorld, TOblique extends { ready(): Promise<void> }, TCatalog>(
  options: ProductionRenderBootstrap<TWorld, TOblique, TCatalog>,
): Promise<OptionalRenderScene<TWorld, TOblique>> {
  if ((options.mode ?? 'world') === 'world') return { mode: 'world', scene: options.createWorld() };
  const catalogs = await options.loadObliqueCatalogs();
  const scene = options.createOblique(catalogs);
  await scene.ready();
  return { mode: 'oblique', scene };
}
