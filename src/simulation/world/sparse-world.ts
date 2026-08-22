import type { ChunkPosition } from './coordinates';
import { chunkCoordinate, chunkKey, chunkSize, compareChunkPositions } from './coordinates';

export const WORLD_SNAPSHOT_VERSION = 1;

export type ChunkLifecycle = 'metadata-only' | 'loaded';

export interface ChunkState {
  readonly position: ChunkPosition;
  readonly lifecycle: ChunkLifecycle;
  readonly geometryRevision: number;
  readonly contentRevision: number;
  readonly dirty: boolean;
}

export interface SerializedChunkState {
  readonly x: number;
  readonly y: number;
  readonly lifecycle: ChunkLifecycle;
  readonly geometryRevision: number;
  readonly contentRevision: number;
  readonly dirty: boolean;
}

export interface WorldSnapshotV1 {
  readonly version: typeof WORLD_SNAPSHOT_VERSION;
  readonly chunkSize: number;
  readonly ownedChunks: readonly ChunkPosition[];
  readonly chunks: readonly SerializedChunkState[];
}

export class WorldSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'WorldSnapshotError';
  }
}

function cloneState(state: ChunkState): ChunkState {
  return { ...state, position: { ...state.position } };
}

function assertRevision(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WorldSnapshotError(`${label} must be a non-negative safe integer.`);
  }

  return value;
}

function assertChunkLifecycle(value: unknown): ChunkLifecycle {
  if (value === 'metadata-only' || value === 'loaded') return value;
  throw new WorldSnapshotError('Chunk lifecycle is invalid.');
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new WorldSnapshotError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) {
    throw new WorldSnapshotError(`${label} has unknown or missing fields.`);
  }
}

function decodePosition(value: unknown, label: string): ChunkPosition {
  const record = object(value, label);
  exactKeys(record, ['x', 'y'], label);
  if (typeof record.x !== 'number' || typeof record.y !== 'number') {
    throw new WorldSnapshotError(`${label} coordinates must be numbers.`);
  }

  try {
    return { x: chunkCoordinate(record.x), y: chunkCoordinate(record.y) };
  } catch {
    throw new WorldSnapshotError(`${label} coordinates are invalid.`);
  }
}

function decodeChunk(value: unknown): SerializedChunkState {
  const record = object(value, 'Chunk');
  exactKeys(record, ['contentRevision', 'dirty', 'geometryRevision', 'lifecycle', 'x', 'y'], 'Chunk');
  if (
    typeof record.x !== 'number' ||
    typeof record.y !== 'number' ||
    typeof record.geometryRevision !== 'number' ||
    typeof record.contentRevision !== 'number' ||
    typeof record.dirty !== 'boolean'
  ) {
    throw new WorldSnapshotError('Chunk fields have invalid types.');
  }

  try {
    return {
      x: chunkCoordinate(record.x),
      y: chunkCoordinate(record.y),
      lifecycle: assertChunkLifecycle(record.lifecycle),
      geometryRevision: assertRevision(record.geometryRevision, 'Geometry revision'),
      contentRevision: assertRevision(record.contentRevision, 'Content revision'),
      dirty: record.dirty,
    };
  } catch (error) {
    if (error instanceof WorldSnapshotError) throw error;
    throw new WorldSnapshotError('Chunk coordinates are invalid.');
  }
}

/**
 * Authoritative sparse chunk metadata. Ownership is persistent product state;
 * renderer visibility and simulation activity are projections owned by their
 * respective systems and deliberately are not stored here.
 */
export class SparseWorld {
  private readonly chunks = new Map<string, ChunkState>();
  private readonly owned = new Set<string>();

  public constructor(public readonly tileChunkSize: number) {
    chunkSize(tileChunkSize);
  }

  public hasChunk(position: ChunkPosition): boolean {
    return this.chunks.has(chunkKey(position));
  }

  public getChunk(position: ChunkPosition): ChunkState | undefined {
    const state = this.chunks.get(chunkKey(position));
    return state === undefined ? undefined : cloneState(state);
  }

  public isOwned(position: ChunkPosition): boolean {
    return this.owned.has(chunkKey(position));
  }

  public setOwned(position: ChunkPosition, owned: boolean): void {
    const key = chunkKey(position);
    if (owned) {
      this.ensureMetadata(position);
      this.owned.add(key);
      return;
    }

    this.owned.delete(key);
  }

  public ensureMetadata(position: ChunkPosition): ChunkState {
    const key = chunkKey(position);
    const existing = this.chunks.get(key);
    if (existing !== undefined) return cloneState(existing);

    const state: ChunkState = {
      position: { ...position },
      lifecycle: 'metadata-only',
      geometryRevision: 0,
      contentRevision: 0,
      dirty: false,
    };
    this.chunks.set(key, state);
    return cloneState(state);
  }

  public load(position: ChunkPosition): ChunkState {
    const state = this.requireState(position);
    if (state.lifecycle === 'metadata-only') {
      this.chunks.set(chunkKey(position), { ...state, lifecycle: 'loaded' });
    }

    return this.getChunk(position) as ChunkState;
  }

  public unload(position: ChunkPosition): ChunkState {
    const state = this.requireState(position);
    if (state.lifecycle === 'loaded') {
      this.chunks.set(chunkKey(position), { ...state, lifecycle: 'metadata-only' });
    }

    return this.getChunk(position) as ChunkState;
  }

  public markGeometryChanged(position: ChunkPosition): ChunkState {
    return this.markChanged(position, 'geometryRevision');
  }

  public markContentChanged(position: ChunkPosition): ChunkState {
    return this.markChanged(position, 'contentRevision');
  }

  public markPersisted(position: ChunkPosition): ChunkState {
    const state = this.requireState(position);
    this.chunks.set(chunkKey(position), { ...state, dirty: false });
    return this.getChunk(position) as ChunkState;
  }

  public snapshot(): WorldSnapshotV1 {
    const positions = (keys: Iterable<string>): ChunkPosition[] => [...keys]
      .map((key) => this.requireStateByKey(key).position)
      .sort(compareChunkPositions)
      .map((position) => ({ ...position }));

    const chunks = [...this.chunks.values()]
      .sort((left, right) => compareChunkPositions(left.position, right.position))
      .map((state) => ({
        x: state.position.x,
        y: state.position.y,
        lifecycle: state.lifecycle,
        geometryRevision: state.geometryRevision,
        contentRevision: state.contentRevision,
        dirty: state.dirty,
      }));

    return {
      version: WORLD_SNAPSHOT_VERSION,
      chunkSize: this.tileChunkSize,
      ownedChunks: positions(this.owned),
      chunks,
    };
  }

  public static fromSnapshot(value: unknown): SparseWorld {
    const record = object(value, 'World snapshot');
    exactKeys(record, ['chunkSize', 'chunks', 'ownedChunks', 'version'], 'World snapshot');
    if (record.version !== WORLD_SNAPSHOT_VERSION || !Array.isArray(record.chunks) || !Array.isArray(record.ownedChunks)) {
      throw new WorldSnapshotError('World snapshot version or collections are invalid.');
    }

    let size: number;
    try {
      size = chunkSize(record.chunkSize as number);
    } catch {
      throw new WorldSnapshotError('World snapshot chunk size is invalid.');
    }

    const world = new SparseWorld(size);
    for (const rawChunk of record.chunks) {
      const chunk = decodeChunk(rawChunk);
      const position = { x: chunkCoordinate(chunk.x), y: chunkCoordinate(chunk.y) };
      const key = chunkKey(position);
      if (world.chunks.has(key)) throw new WorldSnapshotError('World snapshot has duplicate chunks.');
      world.chunks.set(key, {
        position,
        lifecycle: chunk.lifecycle,
        geometryRevision: chunk.geometryRevision,
        contentRevision: chunk.contentRevision,
        dirty: chunk.dirty,
      });
    }

    for (const rawPosition of record.ownedChunks) {
      const position = decodePosition(rawPosition, 'Owned chunk');
      const key = chunkKey(position);
      if (!world.chunks.has(key)) throw new WorldSnapshotError('Owned chunk has no metadata.');
      if (world.owned.has(key)) throw new WorldSnapshotError('World snapshot has duplicate owned chunks.');
      world.owned.add(key);
    }

    return world;
  }

  private requireState(position: ChunkPosition): ChunkState {
    const state = this.chunks.get(chunkKey(position));
    if (state === undefined) throw new RangeError('Chunk metadata does not exist.');
    return state;
  }

  private requireStateByKey(key: string): ChunkState {
    const state = this.chunks.get(key);
    if (state === undefined) throw new Error('World ownership invariant is broken.');
    return state;
  }

  private markChanged(position: ChunkPosition, revision: 'geometryRevision' | 'contentRevision'): ChunkState {
    const state = this.requireState(position);
    if (state.lifecycle !== 'loaded') throw new RangeError('Chunk must be loaded before it can change.');
    const nextRevision = state[revision] + 1;
    if (!Number.isSafeInteger(nextRevision)) throw new RangeError('Chunk revision overflow.');
    this.chunks.set(chunkKey(position), { ...state, [revision]: nextRevision, dirty: true });
    return this.getChunk(position) as ChunkState;
  }
}
