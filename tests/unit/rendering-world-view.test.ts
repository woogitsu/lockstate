import { describe, expect, it } from 'vitest';
import type { ConstructionSnapshot } from '../../src/simulation/construction/system';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { createParcelRect } from '../../src/simulation/world/parcel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { buildRowIndex } from '../../src/rendering/world/row-index';
import { structuresFromConstruction } from '../../src/rendering/world/structures';
import { createTileSample, WorldRenderView } from '../../src/rendering/world/world-view';

/**
 * The renderer's world view has to agree with the simulation's world about
 * terrain, walls and ownership, so these tests build a real `SparseWorld`,
 * snapshot it exactly as the worker does, and then read the projection back.
 * A divergence between the two would show up here rather than as a wrong
 * picture.
 */

const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
const tile = (x: number, y: number): { x: ReturnType<typeof tileCoordinate>; y: ReturnType<typeof tileCoordinate> } => ({
  x: tileCoordinate(x),
  y: tileCoordinate(y),
});

function buildWorld(): SparseWorld {
  const world = new SparseWorld(8);
  world.load(chunk);
  world.setOwned(chunk, true);
  world.setTerrain(tile(1, 1), 'grass');
  world.setTerrain(tile(2, 1), 'water');
  world.setTopEdge(tile(2, 3), 1);
  world.setLeftEdge(tile(5, 3), 1);
  world.setZoning(tile(4, 4), 1);
  world.registerParcel({ id: 'north-field', bounds: createParcelRect(0, -8, 8, 8), basePrice: 100 });
  world.setParcelOwned('north-field', true);
  return world;
}

describe('world render view', () => {
  it('reads terrain, wall edges and zoning back out of a real world snapshot', () => {
    const view = WorldRenderView.fromSnapshot(buildWorld().snapshot());
    const sample = createTileSample();

    view.readTile(1, 1, sample);
    expect(sample.loaded).toBe(true);
    expect(sample.terrainNumericId).toBe(1); // grass
    view.readTile(2, 1, sample);
    expect(sample.terrainNumericId).toBe(5); // water
    view.readTile(0, 0, sample);
    expect(sample.terrainNumericId).toBe(0); // dirt, the default

    view.readTile(2, 3, sample);
    expect(sample.topEdge).toBe(1);
    expect(sample.leftEdge).toBe(0);
    view.readTile(5, 3, sample);
    expect(sample.leftEdge).toBe(1);

    view.readTile(4, 4, sample);
    expect(sample.zoning).toBe(1);
  });

  it('reports unmaterialised land as not loaded rather than as empty ground', () => {
    const view = WorldRenderView.fromSnapshot(buildWorld().snapshot());
    const sample = createTileSample();

    view.readTile(100, 100, sample);
    expect(sample.loaded).toBe(false);
    expect(sample.owned).toBe(false);
    expect(view.isChunkLoaded(0, 0)).toBe(true);
    expect(view.isChunkLoaded(12, 12)).toBe(false);
  });

  it('agrees with the simulation about which tiles are owned, by chunk and by parcel', () => {
    const world = buildWorld();
    const view = WorldRenderView.fromSnapshot(world.snapshot());

    for (const [x, y] of [
      [0, 0],
      [7, 7],
      [3, -4],
      [9, 9],
      [-1, 0],
    ] as const) {
      expect(view.isTileOwned(x, y), `tile ${x},${y}`).toBe(world.isTileOwned(tile(x, y)));
    }
    // The parcel covers land north of the owned chunk; the chunk covers its own.
    expect(view.isTileOwned(3, -4)).toBe(true);
    expect(view.isTileOwned(9, 9)).toBe(false);
  });

  it('reports the tile bounds of everything materialised, for framing the camera', () => {
    const view = WorldRenderView.fromSnapshot(buildWorld().snapshot());
    expect(view.loadedBounds).toEqual({ minTileX: 0, minTileY: 0, maxTileX: 7, maxTileY: 7 });
    expect(view.loadedChunkCount).toBe(1);
    expect(WorldRenderView.empty().loadedBounds).toBeUndefined();
  });

  it('serves repeated reads across chunk boundaries correctly despite its lookup memo', () => {
    const world = new SparseWorld(8);
    world.load(chunk);
    world.load({ x: chunkCoordinate(1), y: chunkCoordinate(0) });
    world.setTerrain(tile(7, 0), 'grass');
    world.setTerrain(tile(8, 0), 'concrete');
    const view = WorldRenderView.fromSnapshot(world.snapshot());
    const sample = createTileSample();

    const seen: number[] = [];
    for (const tileX of [7, 8, 7, 8, 9]) {
      view.readTile(tileX, 0, sample);
      seen.push(sample.terrainNumericId);
    }
    expect(seen).toEqual([1, 3, 1, 3, 0]);
  });
});

describe('structure projection', () => {
  const snapshot: ConstructionSnapshot = {
    orders: [
      { id: 'c', definitionId: 'wall-brick', location: tile(1, 5), state: 'completed', progress: 50, materialsAllocated: [] },
      { id: 'a', definitionId: 'wall-brick', location: tile(4, 2), state: 'in-progress', progress: 10, materialsAllocated: [] },
      { id: 'b', definitionId: 'door-wooden', location: tile(2, 2), state: 'materials-pending', progress: 0, materialsAllocated: [] },
      { id: 'd', definitionId: 'wall-brick', location: tile(9, 9), state: 'cancelled', progress: 0, materialsAllocated: [] },
      { id: 'e', definitionId: 'wall-brick', location: tile(9, 9), state: 'failed', progress: 0, materialsAllocated: [] },
    ],
    undoStack: [],
    redoStack: [],
  };

  it('collapses the order lifecycle into what a viewer can see', () => {
    expect(structuresFromConstruction(snapshot).map((structure) => [structure.id, structure.phase])).toEqual([
      ['b', 'planned'],
      ['a', 'building'],
      ['c', 'built'],
    ]);
  });

  it('drops cancelled and failed orders, which are history rather than geometry', () => {
    const ids = structuresFromConstruction(snapshot).map((structure) => structure.id);
    expect(ids).not.toContain('d');
    expect(ids).not.toContain('e');
  });

  it('orders structures deterministically by row, then column, then id', () => {
    const reversed: ConstructionSnapshot = { ...snapshot, orders: [...snapshot.orders].reverse() };
    expect(structuresFromConstruction(reversed)).toEqual(structuresFromConstruction(snapshot));
  });
});

describe('row index', () => {
  it('groups walls and structures by the world row they stand on', () => {
    const view = WorldRenderView.fromSnapshot(buildWorld().snapshot());
    const structures = structuresFromConstruction({
      orders: [
        { id: 'a', definitionId: 'wall-brick', location: tile(4, 2), state: 'completed', progress: 50, materialsAllocated: [] },
        { id: 'b', definitionId: 'wall-brick', location: tile(6, 2), state: 'completed', progress: 50, materialsAllocated: [] },
      ],
      undoStack: [],
      redoStack: [],
    });

    const rows = buildRowIndex(view, structures);

    expect([...rows.keys()].sort((left, right) => left - right)).toEqual([2, 3]);
    expect(rows.get(3)?.edges).toEqual([
      { tileX: 2, top: 1, left: 0 },
      { tileX: 5, top: 0, left: 1 },
    ]);
    expect(rows.get(3)?.structures).toEqual([]);
    expect(rows.get(2)?.structures.map((structure) => structure.id)).toEqual(['a', 'b']);
  });

  it('produces no rows for a world with nothing standing on it', () => {
    expect(buildRowIndex(WorldRenderView.empty(), []).size).toBe(0);
  });
});
