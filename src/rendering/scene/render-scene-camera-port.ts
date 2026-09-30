import type { MinimapView } from '../../shared/minimap-view';

/** Camera and minimap operations shared by world and opt-in oblique scenes. */
export interface RenderSceneCameraPort {
  readonly navigateToTile: (tileX: number, tileY: number) => boolean;
  readonly navigateToMinimapPoint: (fx: number, fy: number) => boolean;
  readonly stepCameraZoom: (direction: 'in' | 'out') => void;
  readonly setMinimapSink: (sink: (view: MinimapView | undefined) => void) => void;
}

/**
 * Keeps composition code independent from a concrete Phaser scene.  Both
 * renderers can provide these callbacks without changing the production
 * scene selection or enabling the oblique flag.
 */
export function createRenderSceneCameraPort(
  callbacks: RenderSceneCameraPort,
): RenderSceneCameraPort {
  return callbacks;
}
