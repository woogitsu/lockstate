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

export function chunkSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('Chunk size must be a positive safe integer.');
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
