import { describe, expect, it } from 'vitest';
import {
  createParcelRect,
  decodeTerrainRle,
  encodeTerrainRle,
  SparseWorld,
  WorldSnapshotError,
  chunkCoordinate,
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
