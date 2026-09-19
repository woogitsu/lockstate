import { describe, expect, it } from 'vitest';
import {
  createParcelRect,
  decodeTerrainRle,
  encodeTerrainRle,
  SparseWorld,
  WORLD_CHUNK_SIZE_LIMIT,
  WorldSnapshotError,
  chunkCoordinate,
  chunkSize,
  chunkLocalToTile,
  localTileCoordinate,
  tileCoordinate,
  tileToChunk,
} from '../../src/simulation/world';

const westSouth = { x: chunkCoordinate(-1), y: chunkCoordinate(-1) };
const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

describe('world coordinates', () => {
  it('uses floor division for boundary and negative tile positions', () => {
    expect(tileToChunk({ x: tileCoordinate(0), y: tileCoordinate(31) }, 32)).toEqual({
      chunk: origin,
      local: { x: localTileCoordinate(0, 32), y: localTileCoordinate(31, 32) },
    });
    expect(tileToChunk({ x: tileCoordinate(-1), y: tileCoordinate(-32) }, 32)).toEqual({
      chunk: westSouth,
      local: { x: localTileCoordinate(31, 32), y: localTileCoordinate(0, 32) },
    });
    expect(
      chunkLocalToTile(
        { chunk: westSouth, local: { x: localTileCoordinate(31, 32), y: localTileCoordinate(0, 32) } },
        32,
      ),
    ).toEqual({ x: tileCoordinate(-1), y: tileCoordinate(-32) });
  });

  it('keeps absent, owned metadata and loaded data distinct', () => {
    const world = new SparseWorld(32);
    expect(world.hasChunk(origin)).toBe(false);
    expect(world.isOwned(origin)).toBe(false);

    world.setOwned(origin, true);
    expect(world.isOwned(origin)).toBe(true);
    expect(world.getChunk(origin)?.lifecycle).toBe('metadata-only');
    expect(world.load(origin).lifecycle).toBe('loaded');
    expect(world.unload(origin).lifecycle).toBe('metadata-only');
  });

  it('only increments the revision corresponding to a loaded mutation', () => {
    const world = new SparseWorld(32);
    world.ensureMetadata(origin);
    expect(() => world.markGeometryChanged(origin)).toThrow(RangeError);
    world.load(origin);
    expect(world.markGeometryChanged(origin)).toMatchObject({
      geometryRevision: 1,
      contentRevision: 0,
      dirty: true,
    });
    expect(world.markContentChanged(origin)).toMatchObject({
      geometryRevision: 1,
      contentRevision: 1,
      dirty: true,
    });
    expect(world.markPersisted(origin)).toMatchObject({
      geometryRevision: 1,
      contentRevision: 1,
      dirty: false,
    });
  });
});

describe('terrain layer in sparse world', () => {
  it('reads default terrain (dirt) on uninitialized tiles and updates terrain on set', () => {
    const world = new SparseWorld(32);
    const tile = { x: tileCoordinate(10), y: tileCoordinate(10) };

    expect(world.getTerrain(tile).id).toBe('dirt');
    world.setTerrain(tile, 'concrete');
    expect(world.getTerrain(tile).id).toBe('concrete');
    expect(world.getTerrainNumericId(tile)).toBe(3);

    const chunk = world.getChunk(origin);
    expect(chunk?.lifecycle).toBe('loaded');
    expect(chunk?.contentRevision).toBe(1);
  });

  it('encodes and decodes terrain with run-length encoding (RLE)', () => {
    const buffer = new Uint8Array(1024);
    buffer.fill(0, 0, 500); // 500 dirt
    buffer.fill(1, 500, 1000); // 500 grass
    buffer.fill(3, 1000, 1024); // 24 concrete

    const rle = encodeTerrainRle(buffer);
    expect(rle).toEqual([
      [0, 500],
      [1, 500],
      [3, 24],
    ]);

    const decoded = decodeTerrainRle(rle, 1024);
    expect(decoded).toEqual(buffer);
  });
});

describe('parcels in sparse world', () => {
  it('registers and retrieves parcels spanning arbitrary chunk boundaries', () => {
    const world = new SparseWorld(32);
    world.registerParcel({
      id: 'center-parcel',
      bounds: createParcelRect(-5, -5, 20, 20),
      basePrice: 2000,
      name: 'Center Parcel',
    });

    expect(world.getParcel('center-parcel')?.name).toBe('Center Parcel');
    expect(world.isTileOwned({ x: tileCoordinate(0), y: tileCoordinate(0) })).toBe(false);

    world.setParcelOwned('center-parcel', true);
    expect(world.isParcelOwned('center-parcel')).toBe(true);
    expect(world.isTileOwned({ x: tileCoordinate(0), y: tileCoordinate(0) })).toBe(true);
    expect(world.isTileOwned({ x: tileCoordinate(-4), y: tileCoordinate(-4) })).toBe(true);
    expect(world.isTileOwned({ x: tileCoordinate(15), y: tileCoordinate(15) })).toBe(false);
  });

  /**
   * Issue #93. `registerParcel` permits overlapping bounds, so a tile can sit
   * under several parcels; each owned one is sufficient on its own. An unowned
   * parcel is not a veto -- it never was one against chunk ownership, and it
   * is not one against another parcel either. That second half is ADR 0019,
   * now Accepted.
   *
   * `getParcelAtTile` keeps its own, different job: "which parcel is here",
   * first match in ascending-id order, for pricing and selection.
   */
  it('does not let an unowned overlapping parcel mask an owned one', () => {
    const world = new SparseWorld(32);
    // `a-marsh` sorts first in code-unit order, so it is the parcel
    // `getParcelAtTile` resolves the shared tile to.
    world.registerParcel({ id: 'a-marsh', bounds: createParcelRect(0, 0, 16, 16), basePrice: 50 });
    world.registerParcel({ id: 'z-estate', bounds: createParcelRect(8, 0, 16, 16), basePrice: 900 });
    world.setParcelOwned('z-estate', true);

    const shared = { x: tileCoordinate(10), y: tileCoordinate(4) };
    const marshOnly = { x: tileCoordinate(2), y: tileCoordinate(4) };
    const estateOnly = { x: tileCoordinate(20), y: tileCoordinate(4) };

    expect(world.getParcelAtTile(shared)?.id).toBe('a-marsh');
    expect(world.isTileOwned(shared)).toBe(true);
    expect(world.isTileOwned(marshOnly)).toBe(false);
    expect(world.isTileOwned(estateOnly)).toBe(true);

    // Symmetric: owning the low-id parcel instead is just as sufficient.
    world.setParcelOwned('z-estate', false);
    world.setParcelOwned('a-marsh', true);
    expect(world.isTileOwned(shared)).toBe(true);
    expect(world.isTileOwned(marshOnly)).toBe(true);
    expect(world.isTileOwned(estateOnly)).toBe(false);
  });

  it('uses purchase eligibility and pricing hooks', () => {
    const world = new SparseWorld(32);
    world.registerParcel({
      id: 'p1',
      bounds: createParcelRect(0, 0, 16, 16),
      basePrice: 1000,
    });
    world.registerParcel({
      id: 'p2',
      bounds: createParcelRect(16, 0, 16, 16),
      basePrice: 3000,
    });

    expect(world.canPurchaseParcel('p1')).toEqual({ eligible: true });
    expect(world.getParcelPrice('p1')).toBe(1000);

    world.setParcelOwned('p1', true);
    expect(world.canPurchaseParcel('p1')).toEqual({ eligible: false, reason: 'already_owned' });
    expect(world.canPurchaseParcel('p2')).toEqual({ eligible: true });
  });
});

describe('sparse world snapshots', () => {
  it('serializes in deterministic order and round-trips sparse state with terrain and parcels', () => {
    const first = new SparseWorld(32);
    const second = new SparseWorld(32);

    for (const world of [first, second]) {
      world.registerParcel({
        id: 'parcel-1',
        bounds: createParcelRect(0, 0, 32, 32),
        basePrice: 1500,
      });
      world.setParcelOwned('parcel-1', true);
      world.load(origin);
      world.setTerrain({ x: tileCoordinate(5), y: tileCoordinate(5) }, 'water');
      world.load(westSouth);
      world.markGeometryChanged(westSouth);
    }

    const firstSnapshot = first.snapshot();
    expect(second.snapshot()).toEqual(firstSnapshot);

    const restored = SparseWorld.fromSnapshot(JSON.parse(JSON.stringify(firstSnapshot)));
    expect(restored.snapshot()).toEqual(firstSnapshot);
    expect(restored.getTerrain({ x: tileCoordinate(5), y: tileCoordinate(5) }).id).toBe('water');
    expect(restored.isParcelOwned('parcel-1')).toBe(true);
  });

  it('fails safely for unknown versions, duplicates and malformed data', () => {
    expect(() =>
      SparseWorld.fromSnapshot({ version: 2, chunkSize: 32, ownedChunks: [], chunks: [] }),
    ).toThrow(WorldSnapshotError);
    expect(() =>
      SparseWorld.fromSnapshot({
        version: 1,
        chunkSize: 32,
        ownedChunks: [],
        chunks: [
          { x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false },
          { x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false },
        ],
      }),
    ).toThrow(WorldSnapshotError);
    expect(() =>
      SparseWorld.fromSnapshot({
        version: 1,
        chunkSize: 32,
        ownedChunks: [],
        chunks: [],
        extra: true,
      }),
    ).toThrow(WorldSnapshotError);
  });
});

/**
 * Issue #102: `chunkSize` used to be validated as any "positive safe
 * integer", and `SparseWorld` sizes four `size * size` byte planes per loaded
 * chunk from it — so a snapshot of a few hundred bytes declaring
 * `chunkSize: 20000` allocated 1,526 MiB before anything questioned the value.
 *
 * These tests assert the bound rejects such a snapshot *before* the
 * allocation, not after it: they measure `arrayBuffers` across the call, so a
 * fix that threw only once the planes existed would fail them.
 */
describe('chunk size is bounded, and the bound is checked before anything is allocated', () => {
  const HOSTILE_CHUNK_SIZE = 20_000;
  /** 1,526 MiB is what the unbounded version allocated here; 32 MiB is generous headroom for the rest of the call. */
  const ALLOCATION_HEADROOM_BYTES = 32 * 1024 * 1024;

  function allocatedDuring(work: () => void): { readonly bytes: number; readonly error: unknown } {
    const before = process.memoryUsage().arrayBuffers;
    let error: unknown;
    try {
      work();
    } catch (thrown) {
      error = thrown;
    }
    return { bytes: process.memoryUsage().arrayBuffers - before, error };
  }

  it('pins the limit to ADR 0004\'s largest benchmarked chunk size', () => {
    expect(WORLD_CHUNK_SIZE_LIMIT).toBe(64);
    // Every size the ADR examined stays constructible, and 32 is what
    // `createNewSimulationRuntime` actually uses.
    for (const size of [1, 4, 8, 16, 32, 64]) {
      expect(new SparseWorld(size).tileChunkSize).toBe(size);
    }
  });

  it('rejects a chunk size above the limit instead of sizing an allocation from it', () => {
    expect(() => chunkSize(HOSTILE_CHUNK_SIZE)).toThrow(RangeError);
    expect(() => chunkSize(WORLD_CHUNK_SIZE_LIMIT + 1)).toThrow(RangeError);
    expect(() => new SparseWorld(HOSTILE_CHUNK_SIZE)).toThrow(RangeError);
  });

  it('refuses a hostile snapshot without allocating from its chunk size', () => {
    const hostile = {
      version: 1,
      chunkSize: HOSTILE_CHUNK_SIZE,
      ownedChunks: [],
      // One loaded chunk with no terrain arrays at all: the whole cost comes
      // from `ensureStorage` sizing four planes from `chunkSize`.
      chunks: [{ x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false }],
    };

    const { bytes, error } = allocatedDuring(() => {
      SparseWorld.fromSnapshot(hostile);
    });

    expect(error).toBeInstanceOf(WorldSnapshotError);
    expect(bytes).toBeLessThan(ALLOCATION_HEADROOM_BYTES);
  });

  it('refuses a hostile chunk size carried by an RLE-encoded chunk too', () => {
    // `decodeTerrainRle` allocates `expectedLength` up front, and
    // `fromSnapshot` derives that from `chunkSize` — so the bound has to be
    // checked before the RLE path as well, not only before `ensureStorage`.
    const hostile = {
      version: 1,
      chunkSize: HOSTILE_CHUNK_SIZE,
      ownedChunks: [],
      chunks: [
        {
          x: 0,
          y: 0,
          lifecycle: 'loaded',
          geometryRevision: 0,
          contentRevision: 0,
          dirty: false,
          terrain: [[0, HOSTILE_CHUNK_SIZE * HOSTILE_CHUNK_SIZE]],
        },
      ],
    };

    const { bytes, error } = allocatedDuring(() => {
      SparseWorld.fromSnapshot(hostile);
    });

    expect(error).toBeInstanceOf(WorldSnapshotError);
    expect(bytes).toBeLessThan(ALLOCATION_HEADROOM_BYTES);
  });
});

/**
 * ADR 0099 decision 3: the drawn world's marker, at the write sites that are
 * this class's own.
 *
 * The marker is what tells the renderer that what it draws is out of date
 * (issue #1037), and decision 3 requires it to move on **every write to a
 * layer `WorldRenderView.readTile` reads** and on **every change of tile or
 * parcel ownership**. Two of the three sources it names live here; the third
 * is a build order's drawn phase and lives in `ConstructionSystem`.
 *
 * These are the cases that say the marker is not derived from the chunk
 * revisions. `setOwned` and `setParcelOwned` move no chunk counter at all --
 * that is ADR 0099 §4's second hole, and it is why summing
 * `geometryRevision`/`contentRevision` per publication would have been wrong
 * rather than merely slower.
 */
describe("the drawn world's marker moves for everything a renderer draws", () => {
  const tile = { x: tileCoordinate(3), y: tileCoordinate(4) };

  function loadedWorld(): SparseWorld {
    const world = new SparseWorld(32);
    world.load(origin);
    return world;
  }

  it('starts at zero and only ever counts upward', () => {
    const world = new SparseWorld(32);
    expect(world.drawnWorldRevision).toBe(0);
    world.markDrawnWorldChanged();
    world.markDrawnWorldChanged();
    expect(world.drawnWorldRevision).toBe(2);
  });

  it('moves for each of the four layers a tile sample is read from', () => {
    const world = loadedWorld();
    const seen: number[] = [world.drawnWorldRevision];

    world.setTerrain(tile, 'concrete');
    seen.push(world.drawnWorldRevision);
    world.setTopEdge(tile, 1);
    seen.push(world.drawnWorldRevision);
    world.setLeftEdge(tile, 1);
    seen.push(world.drawnWorldRevision);
    world.setZoning(tile, 1);
    seen.push(world.drawnWorldRevision);

    // Strictly increasing, once per write. `TileSample`'s four chunk-layer
    // fields are `terrainNumericId`, `topEdge`, `leftEdge` and `zoning`, and
    // this is one write to each of them.
    expect(seen).toEqual([seen[0], seen[0]! + 1, seen[0]! + 2, seen[0]! + 3, seen[0]! + 4]);
  });

  it('moves for chunk ownership, which no chunk revision records', () => {
    const world = new SparseWorld(32);
    const before = world.drawnWorldRevision;

    world.setOwned(origin, true);
    expect(world.drawnWorldRevision).toBe(before + 1);
    // `TileSample.owned` is read from this set and from no chunk layer, so
    // neither `geometryRevision` nor `contentRevision` moved for that write.
    expect(world.getChunk(origin)?.geometryRevision).toBe(0);
    expect(world.getChunk(origin)?.contentRevision).toBe(0);

    // Re-asserting ownership already held changes no pixel, so it must not
    // spend a snapshot request.
    world.setOwned(origin, true);
    expect(world.drawnWorldRevision).toBe(before + 1);

    world.setOwned(origin, false);
    expect(world.drawnWorldRevision).toBe(before + 2);
    world.setOwned(origin, false);
    expect(world.drawnWorldRevision).toBe(before + 2);
  });

  it('moves for parcel ownership, which is the owned-land outline', () => {
    const world = new SparseWorld(32);
    world.registerParcel({ id: 'plot', bounds: createParcelRect(0, 0, 8, 8), basePrice: 100 });
    const before = world.drawnWorldRevision;

    world.setParcelOwned('plot', true);
    expect(world.drawnWorldRevision).toBe(before + 1);
    world.setParcelOwned('plot', true);
    expect(world.drawnWorldRevision).toBe(before + 1);
    world.setParcelOwned('plot', false);
    expect(world.drawnWorldRevision).toBe(before + 2);
  });

  it('is not carried by a snapshot, because it is a statement about one session', () => {
    const world = loadedWorld();
    world.setTopEdge(tile, 1);
    expect(world.drawnWorldRevision).toBeGreaterThan(0);

    // A restored world starts the count again, which is why the receiver
    // treats the first marker it sees in a session as a baseline rather than
    // as a change (`simulation-snapshot-feed.ts`).
    const restored = SparseWorld.fromSnapshot(world.snapshot());
    expect(restored.drawnWorldRevision).toBe(0);
    expect(restored.getTopEdge(tile)).toBe(1);
  });
});
