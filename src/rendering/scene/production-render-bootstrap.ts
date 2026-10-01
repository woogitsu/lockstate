export type OptionalRenderSceneMode = 'world' | 'oblique';

/** A scene selected by the production composition root before Phaser boots. */
export interface PreparedProductionRenderScene<TWorld, TOblique> {
  readonly mode: OptionalRenderSceneMode;
  readonly scene: TWorld | TOblique;
}

export interface ProductionRenderBootstrap<TWorld, TOblique, TCatalog> {
  readonly mode?: OptionalRenderSceneMode;
  readonly loadObliqueCatalogs: () => Promise<TCatalog>;
  readonly createWorld: () => TWorld;
  readonly createOblique: (catalogs: TCatalog) => TOblique;
}

/**
 * Prepare the renderer before `new Phaser.Game`.
 *
 * The normal WorldScene path does not touch the oblique registry. Opting into
 * the angled renderer is therefore an explicit, networked boot mode rather
 * than a silent fallback. The caller owns Phaser's lifecycle and awaits the
 * selected scene's `ready()` after constructing the game.
 */
export async function prepareProductionRenderScene<TWorld, TOblique, TCatalog>(
  options: ProductionRenderBootstrap<TWorld, TOblique, TCatalog>,
): Promise<PreparedProductionRenderScene<TWorld, TOblique>> {
  if ((options.mode ?? 'world') === 'world') {
    return { mode: 'world', scene: options.createWorld() };
  }
  const catalogs = await options.loadObliqueCatalogs();
  return { mode: 'oblique', scene: options.createOblique(catalogs) };
}

/** The only browser-facing switch; absent or invalid values preserve WorldScene. */
export function productionRenderMode(search: string): OptionalRenderSceneMode {
  const value = new URLSearchParams(search).get('renderer') ?? new URLSearchParams(search).get('view');
  return value === 'oblique' ? 'oblique' : 'world';
}

/** Paint a visible startup state when an opted-in catalog cannot be loaded. */
export function renderProductionRenderFailure(error: unknown): void {
  const root = document.getElementById('game-root');
  if (root === null) return;
  const message = error instanceof Error ? error.message : String(error);
  root.replaceChildren();
  const notice = document.createElement('div');
  notice.className = 'startup-error';
  notice.dataset.rendererState = 'oblique-catalog-failed';
  notice.textContent = `Angled renderer unavailable: ${message}`;
  root.append(notice);
}
