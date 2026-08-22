import { describe, expect, it } from 'vitest';
import {
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
    expect(chunkLocalToTile({ chunk: westSouth, local: { x: localTileCoordinate(31, 32), y: localTileCoordinate(0, 32) } }, 32))
      .toEqual({ x: tileCoordinate(-1), y: tileCoordinate(-32) });
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
    expect(world.markGeometryChanged(origin)).toMatchObject({ geometryRevision: 1, contentRevision: 0, dirty: true });
    expect(world.markContentChanged(origin)).toMatchObject({ geometryRevision: 1, contentRevision: 1, dirty: true });
    expect(world.markPersisted(origin)).toMatchObject({ geometryRevision: 1, contentRevision: 1, dirty: false });
  });
});

describe('sparse world snapshots', () => {
  it('serializes in deterministic order and round-trips sparse state', () => {
    const first = new SparseWorld(32);
    const second = new SparseWorld(32);
    for (const [world, positions] of [
      [first, [origin, westSouth]],
      [second, [westSouth, origin]],
    ] as const) {
      for (const position of positions) {
        world.setOwned(position, true);
        world.load(position);
      }
      world.markGeometryChanged(westSouth);
    }

    const firstSnapshot = first.snapshot();
    expect(second.snapshot()).toEqual(firstSnapshot);
    const restored = SparseWorld.fromSnapshot(JSON.parse(JSON.stringify(firstSnapshot)));
    expect(restored.snapshot()).toEqual(firstSnapshot);
  });

  it('fails safely for unknown versions, duplicates and malformed data', () => {
    expect(() => SparseWorld.fromSnapshot({ version: 2, chunkSize: 32, ownedChunks: [], chunks: [] }))
      .toThrow(WorldSnapshotError);
    expect(() => SparseWorld.fromSnapshot({ version: 1, chunkSize: 32, ownedChunks: [], chunks: [{
      x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false,
    }, {
      x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false,
    }] })).toThrow(WorldSnapshotError);
    expect(() => SparseWorld.fromSnapshot({ version: 1, chunkSize: 32, ownedChunks: [], chunks: [], extra: true }))
      .toThrow(WorldSnapshotError);
  });
});
