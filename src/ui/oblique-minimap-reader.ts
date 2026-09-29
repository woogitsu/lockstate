import type { RenderFeed } from '../rendering/feed/render-feed';
import { visibleGroundBounds, type ObliqueCameraState } from '../rendering/camera/oblique-projection';
import { TILE_SIZE_PX } from '../rendering/tile-metrics';
import { projectMinimap } from '../rendering/world/minimap-projection';
import type { MinimapView } from '../shared/minimap-view';

/** The angled camera reads the same world pixels as the top-down minimap. */
export function createObliqueMinimapReader(feed: RenderFeed): (pose: ObliqueCameraState) => MinimapView | undefined {
  let revision = -1;
  let world: ReturnType<RenderFeed['readFrame']>['world'] | undefined;
  let pixels: Omit<MinimapView, 'viewport'> | undefined;
  return (pose) => {
    const frame = feed.readFrame(performance.now() / 1000);
    if (frame.revision !== revision || frame.world !== world) {
      revision = frame.revision;
      world = frame.world;
      pixels = projectMinimap(frame.world);
    }
    const bounds = frame.world.loadedBounds;
    if (pixels === undefined || bounds === undefined) return undefined;
    const visible = visibleGroundBounds(pose);
    const left = bounds.minTileX * TILE_SIZE_PX;
    const top = bounds.minTileY * TILE_SIZE_PX;
    const width = (bounds.maxTileX - bounds.minTileX + 1) * TILE_SIZE_PX;
    const height = (bounds.maxTileY - bounds.minTileY + 1) * TILE_SIZE_PX;
    return {
      ...pixels,
      viewport: {
        x: (visible.left - left) / width,
        y: (visible.top - top) / height,
        width: (visible.right - visible.left) / width,
        height: (visible.bottom - visible.top) / height,
      },
    };
  };
}
