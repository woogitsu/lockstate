import { expect, test } from 'vitest';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import {
  decodeRenderLayer,
  projectWorldForRendering,
} from '../../src/simulation/presentation/world-projection';

test('world render projection copies loaded geometry and zoning without exposing the world', () => {
  const world = new SparseWorld(4);
  const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk);
  world.setLeftEdge({ x: tileCoordinate(1), y: tileCoordinate(2) }, 1);
  world.setTopEdge({ x: tileCoordinate(3), y: tileCoordinate(1) }, 1);
  world.setZoning({ x: tileCoordinate(2), y: tileCoordinate(2) }, 2);

  const projection = projectWorldForRendering(world);

  expect(projection).toEqual({
    version: 1,
    chunkSize: 4,
    chunks: [{
      x: 0,
      y: 0,
      geometryRevision: 2,
      contentRevision: 1,
      topEdge: expect.any(Array),
      leftEdge: expect.any(Array),
      zoning: expect.any(Array),
    }],
  });

  const [renderChunk] = projection.chunks;
  expect(renderChunk).toBeDefined();
  expect(decodeRenderLayer(renderChunk!.leftEdge, 16)[2 * 4 + 1]).toBe(1);
  expect(decodeRenderLayer(renderChunk!.topEdge, 16)[1 * 4 + 3]).toBe(1);
  expect(decodeRenderLayer(renderChunk!.zoning, 16)[2 * 4 + 2]).toBe(2);
});

test('render layer decoder rejects incomplete RLE', () => {
  expect(() => decodeRenderLayer([[0, 3]], 4)).toThrow('length mismatch');
});
