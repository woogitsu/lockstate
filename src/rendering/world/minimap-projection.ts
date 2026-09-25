import type { MinimapView } from '../../shared/minimap-view';
import { createTileSample, type WorldRenderView } from './world-view';

/** A fixed-size projection bounds work by materialised chunks, never by sparse extent. */
export function projectMinimap(world: WorldRenderView): Omit<MinimapView, 'viewport'> | undefined {
  const bounds = world.loadedBounds;
  if (bounds === undefined) return undefined;
  const spanX = bounds.maxTileX - bounds.minTileX + 1;
  const spanY = bounds.maxTileY - bounds.minTileY + 1;
  const width = Math.min(256, spanX);
  const height = Math.min(256, spanY);
  const pixels = new Uint8Array(width * height);
  const sample = createTileSample();

  for (const chunk of world.loadedChunkPositions) {
    const originX = chunk.chunkX * world.chunkSize;
    const originY = chunk.chunkY * world.chunkSize;
    for (let localY = 0; localY < world.chunkSize; localY += 1) {
      const tileY = originY + localY;
      const py = Math.min(height - 1, Math.floor(((tileY - bounds.minTileY) * height) / spanY));
      for (let localX = 0; localX < world.chunkSize; localX += 1) {
        const tileX = originX + localX;
        const px = Math.min(width - 1, Math.floor(((tileX - bounds.minTileX) * width) / spanX));
        world.readTile(tileX, tileY, sample);
        const category = sample.topEdge !== 0 || sample.leftEdge !== 0 ? 5 : sample.terrainNumericId === 5 ? 4 : sample.zoning !== 0 ? 3 : sample.owned ? 2 : 1;
        const index = py * width + px;
        pixels[index] = Math.max(pixels[index] ?? 0, category);
      }
    }
  }

  return { width, height, pixels };
}
