import { describe, expect, it } from 'vitest';
import type { ConstructionSnapshot } from '../../src/simulation/construction/system';
import { canBuildAt } from '../../src/simulation/world/buildability';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { createParcelRect } from '../../src/simulation/world/parcel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { buildRowIndex, type RowContent } from '../../src/rendering/world/row-index';
import type { RenderStructure } from '../../src/rendering/world/structures';
import { structuresFromConstruction } from '../../src/rendering/world/structures';
import { createTileSample, WorldRenderView, type TileSample } from '../../src/rendering/world/world-view';
import { roomPerimeterEnclosure } from '../../src/simulation/rooms/enclosure';

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

  /**
   * Issue #493. `roomPerimeterEnclosure` used to take a `SparseWorld`
   * specifically; it now takes `RoomEdgeReader`, the two-method port
   * `WorldRenderView` implements below, so a pending rectangle's own
   * enclosure can be classified from the renderer's side of the worker
   * boundary against the identical function `RoomZoningService.zone` refuses
   * an open room by -- rather than a second implementation of the same
   * perimeter walk that could silently disagree with it (the class of defect
   * #93 found between two independent readings of tile ownership).
   */
  describe('room enclosure, read from the renderer\'s own projection', () => {
    /** Walls the whole perimeter of an inclusive rectangle, on the two edges the world stores. */
    function wallPerimeter(
      world: SparseWorld,
      rectangle: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    ): void {
      const right = rectangle.x + rectangle.width - 1;
      const bottom = rectangle.y + rectangle.height - 1;
      for (let x = rectangle.x; x <= right; x += 1) {
        world.setTopEdge(tile(x, rectangle.y), 1);
        world.setTopEdge(tile(x, bottom + 1), 1);
      }
      for (let y = rectangle.y; y <= bottom; y += 1) {
        world.setLeftEdge(tile(rectangle.x, y), 1);
        world.setLeftEdge(tile(right + 1, y), 1);
      }
    }

    it('reads a tile\'s own north and west edges back out, agreeing with readTile', () => {
      const view = WorldRenderView.fromSnapshot(buildWorld().snapshot());

      expect(view.getTopEdge(tile(2, 3))).toBe(1);
      expect(view.getLeftEdge(tile(2, 3))).toBe(0);
      expect(view.getLeftEdge(tile(5, 3))).toBe(1);
      expect(view.getTopEdge(tile(5, 3))).toBe(0);
    });

    it('reads 0 for a chunk the simulation has not materialised, exactly as SparseWorld does', () => {
      const world = buildWorld();
      const view = WorldRenderView.fromSnapshot(world.snapshot());

      expect(view.getTopEdge(tile(500, 500))).toBe(0);
      expect(view.getLeftEdge(tile(500, 500))).toBe(0);
      expect(world.getTopEdge(tile(500, 500))).toBe(0);
    });

    it('agrees with the simulation about a sealed rectangle', () => {
      const world = new SparseWorld(8);
      world.load(chunk);
      const rectangle = { x: 1, y: 1, width: 4, height: 3 };
      wallPerimeter(world, rectangle);
      const view = WorldRenderView.fromSnapshot(world.snapshot());

      expect(roomPerimeterEnclosure(world, rectangle)).toEqual({ enclosure: 'sealed' });
      expect(roomPerimeterEnclosure(view, rectangle)).toEqual({ enclosure: 'sealed' });
    });

    it('agrees with the simulation about an open rectangle, gap and all', () => {
      const world = new SparseWorld(8);
      world.load(chunk);
      const rectangle = { x: 1, y: 1, width: 4, height: 3 };
      wallPerimeter(world, rectangle);
      // Open one edge on the east side after sealing the rest.
      world.setLeftEdge(tile(5, 2), 0);
      const view = WorldRenderView.fromSnapshot(world.snapshot());

      const fromSimulation = roomPerimeterEnclosure(world, rectangle);
      const fromRenderer = roomPerimeterEnclosure(view, rectangle);
      expect(fromSimulation).toEqual({ enclosure: 'open', gap: { tile: tile(5, 2), edge: 'west' } });
      expect(fromRenderer).toEqual(fromSimulation);
    });

    it('reports an unmaterialised rectangle as open, exactly as an unloaded SparseWorld chunk does', () => {
      const view = WorldRenderView.empty();
      expect(roomPerimeterEnclosure(view, { x: 0, y: 0, width: 3, height: 3 })).toEqual({
        enclosure: 'open',
        gap: { tile: tile(0, 0), edge: 'north' },
      });
    });
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

  /**
   * Issue #93. `registerParcel` permits overlapping bounds, and the two sides
   * used to answer "is this tile owned?" from independent implementations: the
   * simulation asked whether the *lowest-id* parcel containing the tile was
   * owned, the renderer whether *any* owned parcel did. They agreed everywhere
   * except one case -- a tile whose lowest-id covering parcel was unowned
   * while a higher-id one was owned, which the simulation called unowned and
   * the renderer called owned.
   *
   * Every assertion below compares the two sides rather than trusting either,
   * so the rule can change but the two cannot drift apart again. Which answer
   * wins in that one case was ADR 0019, now **Accepted**: the owned parcel
   * wins. Had it gone the other way these expectations would have changed
   * while the compare-both-sides shape of them did not, which is the property
   * that made them safe to write before the decision.
   */
  describe('overlapping parcels', () => {
    // `a-marsh` sorts before `z-estate` in code-unit order, which is the order
    // `getAllParcels` (and therefore the old rule) walked.
    const OVERLAP_TILES = [
      // Both parcels: only the owned one counts, so this is owned. Under the
      // old simulation rule the unowned `a-marsh` masked it.
      { x: 2, y: -5, owned: true },
      { x: 7, y: -3, owned: true },
      // `a-marsh` alone, unowned, in an unowned chunk.
      { x: 2, y: -7, owned: false },
      // `z-estate` alone, owned.
      { x: 2, y: -2, owned: true },
      // Neither parcel, unowned chunk.
      { x: 12, y: -5, owned: false },
    ] as const;

    function overlappingWorld(): SparseWorld {
      const world = new SparseWorld(8);
      // Loaded but deliberately NOT owned, so the parcels alone decide.
      world.load({ x: chunkCoordinate(0), y: chunkCoordinate(-1) });
      world.registerParcel({ id: 'a-marsh', bounds: createParcelRect(0, -8, 8, 6), basePrice: 50 });
      world.registerParcel({ id: 'z-estate', bounds: createParcelRect(0, -6, 8, 6), basePrice: 900 });
      world.setParcelOwned('z-estate', true);
      return world;
    }

    it('answers ownership identically in the simulation and in the render view', () => {
      const world = overlappingWorld();
      const view = WorldRenderView.fromSnapshot(world.snapshot());
      const sample = createTileSample();

      for (const { x, y, owned } of OVERLAP_TILES) {
        const simulation = world.isTileOwned(tile(x, y));
        expect(simulation, `simulation, tile ${x},${y}`).toBe(owned);
        expect(view.isTileOwned(x, y), `render view, tile ${x},${y}`).toBe(simulation);

        // The overlay reads `owned` off `readTile`, not off `isTileOwned`.
        view.readTile(x, y, sample);
        expect(sample.owned, `readTile, tile ${x},${y}`).toBe(simulation);
      }
    });

    it('never highlights land the simulation then refuses to build on', () => {
      const world = overlappingWorld();
      const view = WorldRenderView.fromSnapshot(world.snapshot());

      for (const { x, y } of OVERLAP_TILES) {
        const buildable = canBuildAt(world, tile(x, y)).reason !== 'unowned_land';
        expect(view.isTileOwned(x, y), `tile ${x},${y}`).toBe(buildable);
      }
    });

    it('keeps that answer across a snapshot round trip, in either registration order', () => {
      const forwards = overlappingWorld();
      const restored = SparseWorld.fromSnapshot(JSON.parse(JSON.stringify(forwards.snapshot())));

      // Registered high-id first: "any owned parcel" is order-independent, so
      // insertion order cannot change the answer either.
      const backwards = new SparseWorld(8);
      backwards.load({ x: chunkCoordinate(0), y: chunkCoordinate(-1) });
      backwards.registerParcel({ id: 'z-estate', bounds: createParcelRect(0, -6, 8, 6), basePrice: 900 });
      backwards.registerParcel({ id: 'a-marsh', bounds: createParcelRect(0, -8, 8, 6), basePrice: 50 });
      backwards.setParcelOwned('z-estate', true);

      for (const { x, y, owned } of OVERLAP_TILES) {
        expect(restored.isTileOwned(tile(x, y)), `restored, tile ${x},${y}`).toBe(owned);
        expect(backwards.isTileOwned(tile(x, y)), `reordered, tile ${x},${y}`).toBe(owned);
        expect(WorldRenderView.fromSnapshot(backwards.snapshot()).isTileOwned(x, y), `reordered view, tile ${x},${y}`).toBe(owned);
      }
    });
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

  /**
   * Issue #204. The walk used to iterate `loadedBounds`, so its cost was the
   * area of the bounding box of the loaded chunks -- two chunks 40 apart span
   * 1,721,344 tile positions and hold 2,048 tiles, and the walk read all
   * 1,721,344 of them. Correctness was already
   * guarded above and stayed green throughout, so nothing in the suite could
   * tell the two walks apart; what was guarded by nothing was the *volume*.
   *
   * These count reads instead of timing them, per `docs/BENCHMARKING.md`:
   * elapsed time is not asserted from a unit test.
   */
  describe('cost', () => {
    /** Wraps `readTile` on one view and returns how many times the build called it. */
    function countReads(view: WorldRenderView, structures: readonly RenderStructure[] = []): { reads: number; rows: ReadonlyMap<number, RowContent> } {
      const original = view.readTile.bind(view);
      let reads = 0;
      Object.defineProperty(view, 'readTile', {
        configurable: true,
        value: (tileX: number, tileY: number, out: TileSample): void => {
          reads += 1;
          original(tileX, tileY, out);
        },
      });
      const rows = buildRowIndex(view, structures);
      return { reads, rows };
    }

    function worldWithChunks(chunkSize: number, positions: readonly (readonly [number, number])[]): SparseWorld {
      const world = new SparseWorld(chunkSize);
      for (const [x, y] of positions) world.load({ x: chunkCoordinate(x), y: chunkCoordinate(y) });
      return world;
    }

    it('reads every materialised tile exactly once, whatever the chunks cost as a bounding box', () => {
      const chunkSize = 8;
      const layouts: readonly { readonly label: string; readonly chunks: readonly (readonly [number, number])[] }[] = [
        { label: 'adjacent diagonal', chunks: [[0, 0], [1, 1]] },
        { label: '10 chunks apart', chunks: [[0, 0], [10, 10]] },
        { label: '40 chunks apart', chunks: [[0, 0], [40, 40]] },
        { label: 'one row, a gap in it', chunks: [[0, 0], [7, 0]] },
      ];

      for (const { label, chunks } of layouts) {
        const view = WorldRenderView.fromSnapshot(worldWithChunks(chunkSize, chunks).snapshot());
        const materialised = view.loadedChunkCount * chunkSize * chunkSize;
        const bounds = view.loadedBounds;
        if (bounds === undefined) throw new Error('expected loaded bounds');
        const box = (bounds.maxTileX - bounds.minTileX + 1) * (bounds.maxTileY - bounds.minTileY + 1);

        expect(countReads(view).reads, `${label}: reads`).toBe(materialised);
        // Stated as its own assertion so the pair reads as the finding: the
        // cost tracks contents, and the box it is *not* tracking is bigger.
        expect(box, `${label}: box exceeds contents`).toBeGreaterThan(materialised);
      }
    });

    it('costs the same for two chunks 40 apart as for two adjacent ones', () => {
      const chunkSize = 8;
      const near = WorldRenderView.fromSnapshot(worldWithChunks(chunkSize, [[0, 0], [1, 1]]).snapshot());
      const far = WorldRenderView.fromSnapshot(worldWithChunks(chunkSize, [[0, 0], [40, 40]]).snapshot());

      expect(countReads(far).reads).toBe(countReads(near).reads);
    });

    it('reads nothing at all for a world with no materialised chunks', () => {
      const view = WorldRenderView.fromSnapshot(new SparseWorld(8).snapshot());
      expect(view.loadedChunkCount).toBe(0);
      expect(countReads(view).reads).toBe(0);
    });

    /**
     * The band walk exists for this: two chunks side by side share world rows,
     * and `paintRow` (`rendering/phaser/tile-layer.ts`) walks `edges` in the
     * order they are stored. A walk that finished one chunk before starting
     * the next would emit tile 9 before tile 1 on row 1.
     */
    it('keeps a row\'s edges ascending in tile X across a chunk seam', () => {
      const chunkSize = 8;
      const world = worldWithChunks(chunkSize, [[0, 0], [1, 0]]);
      world.setTopEdge(tile(9, 1), 1);
      world.setTopEdge(tile(1, 1), 1);
      world.setLeftEdge(tile(14, 1), 1);
      world.setTopEdge(tile(6, 1), 1);

      const rows = buildRowIndex(WorldRenderView.fromSnapshot(world.snapshot()), []);
      expect(rows.get(1)?.edges.map((edge) => edge.tileX)).toEqual([1, 6, 9, 14]);
    });

    it('creates rows in ascending tile Y even when a later chunk holds the earlier row', () => {
      const chunkSize = 8;
      const world = worldWithChunks(chunkSize, [[0, 0], [1, 0]]);
      // The low row lives in the *second* chunk of the band, so a walk that
      // visited whole chunks in turn would key the index in the wrong order.
      world.setTopEdge(tile(9, 1), 1);
      world.setTopEdge(tile(2, 6), 1);

      const rows = buildRowIndex(WorldRenderView.fromSnapshot(world.snapshot()), []);
      expect([...rows.keys()]).toEqual([1, 6]);
    });
  });
});

describe('loaded chunk positions', () => {
  it('lists exactly the materialised chunks, ascending by row band then column', () => {
    const world = new SparseWorld(8);
    const loaded: readonly (readonly [number, number])[] = [[2, 1], [0, 1], [1, -1], [0, 0]];
    for (const [x, y] of loaded) world.load({ x: chunkCoordinate(x), y: chunkCoordinate(y) });
    const view = WorldRenderView.fromSnapshot(world.snapshot());

    expect(view.loadedChunkPositions).toEqual([
      { chunkX: 1, chunkY: -1 },
      { chunkX: 0, chunkY: 0 },
      { chunkX: 0, chunkY: 1 },
      { chunkX: 2, chunkY: 1 },
    ]);
    expect(view.loadedChunkPositions.length).toBe(view.loadedChunkCount);
    expect(WorldRenderView.empty().loadedChunkPositions).toEqual([]);
  });

  it('is a property of the world, not of the order the snapshot happened to list chunks in', () => {
    const world = new SparseWorld(8);
    const loaded: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [x, y] of loaded) world.load({ x: chunkCoordinate(x), y: chunkCoordinate(y) });
    const snapshot = world.snapshot();
    const reversed = { ...snapshot, chunks: [...snapshot.chunks].reverse() };

    expect(WorldRenderView.fromSnapshot(reversed).loadedChunkPositions).toEqual(
      WorldRenderView.fromSnapshot(snapshot).loadedChunkPositions,
    );
  });

  /**
   * `fromSnapshot` accepts whatever a decoded save hands it, and a snapshot
   * that lists one chunk twice would otherwise put that chunk in the walk
   * twice: every tile in it read twice, and every edge on it pushed into its
   * row twice. `chunks` is a `Map` and silently keeps one entry, so the
   * duplicate shows up only in this array.
   */
  it('lists a chunk once even if the snapshot lists it twice', () => {
    const world = new SparseWorld(8);
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    world.setTopEdge(tile(3, 2), 1);
    const snapshot = world.snapshot();
    const doubled = { ...snapshot, chunks: [...snapshot.chunks, ...snapshot.chunks] };

    const view = WorldRenderView.fromSnapshot(doubled);
    expect(view.loadedChunkPositions).toEqual([{ chunkX: 0, chunkY: 0 }]);
    expect(view.loadedChunkCount).toBe(1);
    expect(buildRowIndex(view, []).get(2)?.edges).toEqual([{ tileX: 3, top: 1, left: 0 }]);
  });

  it('agrees with isChunkLoaded, and omits a chunk the snapshot has not materialised', () => {
    const world = new SparseWorld(8);
    world.load({ x: chunkCoordinate(0), y: chunkCoordinate(0) });
    const view = WorldRenderView.fromSnapshot(world.snapshot());

    for (const { chunkX, chunkY } of view.loadedChunkPositions) {
      expect(view.isChunkLoaded(chunkX, chunkY), `chunk ${chunkX},${chunkY}`).toBe(true);
    }
    expect(view.isChunkLoaded(1, 0)).toBe(false);
    expect(view.loadedChunkPositions).not.toContainEqual({ chunkX: 1, chunkY: 0 });
  });
});
