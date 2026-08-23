declare const tileCoordinateBrand: unique symbol;
declare const chunkCoordinateBrand: unique symbol;
declare const localTileCoordinateBrand: unique symbol;

export type TileCoordinate = number & { readonly [tileCoordinateBrand]: 'TileCoordinate' };
export type ChunkCoordinate = number & { readonly [chunkCoordinateBrand]: 'ChunkCoordinate' };
export type LocalTileCoordinate = number & { readonly [localTileCoordinateBrand]: 'LocalTileCoordinate' };

export interface TilePosition {
  readonly x: TileCoordinate;
  readonly y: TileCoordinate;
}

export interface ChunkPosition {
  readonly x: ChunkCoordinate;
  readonly y: ChunkCoordinate;
}

export interface LocalTilePosition {
  readonly x: LocalTileCoordinate;
  readonly y: LocalTileCoordinate;
}

export interface ChunkTilePosition {
  readonly chunk: ChunkPosition;
  readonly local: LocalTilePosition;
}

function integer(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer.`);
  }

  return value;
}

export function tileCoordinate(value: number): TileCoordinate {
  return integer(value, 'Tile coordinate') as TileCoordinate;
}

export function chunkCoordinate(value: number): ChunkCoordinate {
  return integer(value, 'Chunk coordinate') as ChunkCoordinate;
}

/**
 * The largest chunk size any code path -- a constructor argument or a value
 * read out of a snapshot -- may use.
 *
 * The number follows ADR 0004, which selects `32x32` as the production chunk
 * size after benchmarking `16`, `32` and `64`. `64` is the largest size that
 * decision examined, so it is the widest value the architecture has actually
 * reasoned about; nothing in this repository has ever constructed a
 * `SparseWorld` above `32` (`createNewSimulationRuntime` uses `32`).
 *
 * A bound is needed because `SparseWorld` sizes allocations from this value:
 * a loaded chunk owns four `size * size` byte planes, so the size squared is
 * how many bytes per plane a snapshot gets to ask for. Unbounded, a 453-byte
 * save envelope declaring `chunkSize: 20000` decoded cleanly and then made
 * `fromSnapshot` allocate 1,526 MiB (measured) before anything questioned the
 * value, and a larger value throws a bare `RangeError: Array buffer
 * allocation failed`. Bounded at 64 the worst case is 16 KiB per loaded
 * chunk.
 *
 * What this protects against is a crash or a multi-second stall from corrupt
 * or hand-written input on a local decode path -- one flipped byte in a
 * stored `chunkSize` is enough, no attacker required. It is not a trust
 * boundary: the save checksum is an integrity check rather than a signature
 * (see `docs/PERSISTENCE.md`), so anything that can write the save can write
 * a matching checksum too.
 */
export const WORLD_CHUNK_SIZE_LIMIT = 64;

export function chunkSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > WORLD_CHUNK_SIZE_LIMIT) {
    throw new RangeError(`Chunk size must be a positive safe integer no greater than ${WORLD_CHUNK_SIZE_LIMIT}.`);
  }

  return value;
}

export function localTileCoordinate(value: number, size: number): LocalTileCoordinate {
  const validSize = chunkSize(size);
  if (!Number.isSafeInteger(value) || value < 0 || value >= validSize) {
    throw new RangeError('Local tile coordinate is outside the chunk.');
  }

  return value as LocalTileCoordinate;
}

export function tileToChunk(position: TilePosition, size: number): ChunkTilePosition {
  const validSize = chunkSize(size);
  const chunkX = Math.floor(position.x / validSize);
  const chunkY = Math.floor(position.y / validSize);

  return {
    chunk: { x: chunkCoordinate(chunkX), y: chunkCoordinate(chunkY) },
    local: {
      x: localTileCoordinate(position.x - chunkX * validSize, validSize),
      y: localTileCoordinate(position.y - chunkY * validSize, validSize),
    },
  };
}

export function chunkLocalToTile(position: ChunkTilePosition, size: number): TilePosition {
  const validSize = chunkSize(size);

  return {
    x: tileCoordinate(position.chunk.x * validSize + position.local.x),
    y: tileCoordinate(position.chunk.y * validSize + position.local.y),
  };
}

export function chunkKey(position: ChunkPosition): string {
  return `${position.x},${position.y}`;
}

export function compareChunkPositions(left: ChunkPosition, right: ChunkPosition): number {
  return left.y - right.y || left.x - right.x;
}

export function tileKey(position: TilePosition): string {
  return `${position.x},${position.y}`;
}

export function compareTilePositions(left: TilePosition, right: TilePosition): number {
  return left.y - right.y || left.x - right.x;
}
