export type OptionalRenderSceneMode = 'world' | 'oblique';

export interface OptionalRenderScene<TWorld, TOblique> {
  readonly mode: OptionalRenderSceneMode;
  readonly scene: TWorld | TOblique;
}

/**
 * Selects a renderer without constructing or enabling the opt-in scene by
 * default. The composition root can provide real Phaser scene factories later;
 * this seam keeps WorldScene startup unchanged until that wiring is approved.
 */
export function createOptionalRenderScene<TWorld, TOblique>(options: {
  readonly mode?: OptionalRenderSceneMode;
  readonly world: () => TWorld;
  readonly oblique: () => TOblique;
}): OptionalRenderScene<TWorld, TOblique> {
  const mode = options.mode ?? 'world';
  return mode === 'oblique'
    ? { mode, scene: options.oblique() }
    : { mode, scene: options.world() };
}
