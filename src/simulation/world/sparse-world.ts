import type { ChunkPosition, TilePosition } from './coordinates';
import {
  chunkCoordinate,
  chunkKey,
  chunkSize,
  compareChunkPositions,
  tileCoordinate,
  tileToChunk,
} from './coordinates';
import type {
  ParcelDefinition,
  ParcelPricingHook,
  ParcelPurchaseEligibility,
  ParcelPurchaseEligibilityHook,
  SerializedParcelDefinition,
} from './parcel';
import {
  createParcelRect,
  defaultParcelEligibilityHook,
  defaultParcelPricingHook,
  isTileInParcel,
} from './parcel';
import type { TerrainDefinition } from './terrain';
import { TerrainRegistry } from './terrain';

export const WORLD_SNAPSHOT_VERSION = 1;

export type ChunkLifecycle = 'metadata-only' | 'loaded';

export interface ChunkState {
  readonly position: ChunkPosition;
  readonly lifecycle: ChunkLifecycle;
  readonly geometryRevision: number;
  readonly contentRevision: number;
  readonly dirty: boolean;
}

export type TerrainRle = readonly (readonly [numericId: number, count: number])[];

export interface SerializedChunkState {
  readonly x: number;
  readonly y: number;
  readonly lifecycle: ChunkLifecycle;
  readonly geometryRevision: number;
  readonly contentRevision: number;
  readonly dirty: boolean;
  readonly terrain?: TerrainRle;
  readonly topEdge?: TerrainRle; // Reusing TerrainRle format (RLE of Uint8) for simplicity
  readonly leftEdge?: TerrainRle;
  readonly zoning?: TerrainRle;
}

export interface WorldSnapshotV1 {
  readonly version: typeof WORLD_SNAPSHOT_VERSION;
  readonly chunkSize: number;
  readonly ownedChunks: readonly ChunkPosition[];
  readonly chunks: readonly SerializedChunkState[];
  readonly parcels?: readonly SerializedParcelDefinition[];
  readonly ownedParcels?: readonly string[];
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

function allowedKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowedSet = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!allowedSet.has(key)) {
      throw new WorldSnapshotError(`${label} has unknown or missing fields.`);
    }
  }
  for (const req of required) {
    if (!(req in value)) {
      throw new WorldSnapshotError(`${label} has unknown or missing fields.`);
    }
  }
}

function decodePosition(value: unknown, label: string): ChunkPosition {
  const record = object(value, label);
  allowedKeys(record, ['x', 'y'], [], label);
  if (typeof record.x !== 'number' || typeof record.y !== 'number') {
    throw new WorldSnapshotError(`${label} coordinates must be numbers.`);
  }

  try {
    return { x: chunkCoordinate(record.x), y: chunkCoordinate(record.y) };
  } catch {
    throw new WorldSnapshotError(`${label} coordinates are invalid.`);
  }
}

export function encodeTerrainRle(data: Uint8Array): [number, number][] {
  if (data.length === 0) return [];
  const result: [number, number][] = [];
  let currentId = data[0]!;
  let currentCount = 1;

  for (let i = 1; i < data.length; i += 1) {
    const id = data[i]!;
    if (id === currentId) {
      currentCount += 1;
    } else {
      result.push([currentId, currentCount]);
      currentId = id;
      currentCount = 1;
    }
  }
  result.push([currentId, currentCount]);
  return result;
}

export function decodeTerrainRle(rle: TerrainRle, expectedLength: number): Uint8Array {
  const data = new Uint8Array(expectedLength);
  let offset = 0;

  for (const entry of rle) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new WorldSnapshotError('Terrain RLE entry must be a [numericId, count] tuple.');
    }
    const [numericId, count] = entry;
    if (
      typeof numericId !== 'number' ||
      !Number.isSafeInteger(numericId) ||
      numericId < 0 ||
      numericId > 255
    ) {
      throw new WorldSnapshotError(`Invalid terrain numericId in RLE: ${String(numericId)}.`);
    }
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) {
      throw new WorldSnapshotError(`Invalid terrain count in RLE: ${String(count)}.`);
    }
    if (offset + count > expectedLength) {
      throw new WorldSnapshotError('Terrain RLE expands beyond chunk capacity.');
    }
    data.fill(numericId, offset, offset + count);
    offset += count;
  }

  if (offset !== expectedLength) {
    throw new WorldSnapshotError(`Terrain RLE length mismatch: expected ${expectedLength}, got ${offset}.`);
  }

  return data;
}

function decodeChunk(value: unknown): SerializedChunkState {
  const record = object(value, 'Chunk');
  allowedKeys(
    record,
    ['contentRevision', 'dirty', 'geometryRevision', 'lifecycle', 'x', 'y'],
    ['terrain', 'topEdge', 'leftEdge', 'zoning'],
    'Chunk',
  );
  if (
    typeof record.x !== 'number' ||
    typeof record.y !== 'number' ||
    typeof record.geometryRevision !== 'number' ||
    typeof record.contentRevision !== 'number' ||
    typeof record.dirty !== 'boolean'
  ) {
    throw new WorldSnapshotError('Chunk fields have invalid types.');
  }

  let terrain: TerrainRle | undefined;
  let topEdge: TerrainRle | undefined;
  let leftEdge: TerrainRle | undefined;
  let zoning: TerrainRle | undefined;

  if (record.terrain !== undefined) {
    if (!Array.isArray(record.terrain)) throw new WorldSnapshotError('Chunk terrain must be an array.');
    terrain = record.terrain as TerrainRle;
  }
  if (record.topEdge !== undefined) {
    if (!Array.isArray(record.topEdge)) throw new WorldSnapshotError('Chunk topEdge must be an array.');
    topEdge = record.topEdge as TerrainRle;
  }
  if (record.leftEdge !== undefined) {
    if (!Array.isArray(record.leftEdge)) throw new WorldSnapshotError('Chunk leftEdge must be an array.');
    leftEdge = record.leftEdge as TerrainRle;
  }
  if (record.zoning !== undefined) {
    if (!Array.isArray(record.zoning)) throw new WorldSnapshotError('Chunk zoning must be an array.');
    zoning = record.zoning as TerrainRle;
  }

  try {
    return {
      x: chunkCoordinate(record.x),
      y: chunkCoordinate(record.y),
      lifecycle: assertChunkLifecycle(record.lifecycle),
      geometryRevision: assertRevision(record.geometryRevision, 'Geometry revision'),
      contentRevision: assertRevision(record.contentRevision, 'Content revision'),
      dirty: record.dirty,
      ...(terrain !== undefined ? { terrain } : {}),
      ...(topEdge !== undefined ? { topEdge } : {}),
      ...(leftEdge !== undefined ? { leftEdge } : {}),
      ...(zoning !== undefined ? { zoning } : {}),
    };
  } catch (error) {
    if (error instanceof WorldSnapshotError) throw error;
    throw new WorldSnapshotError('Chunk coordinates are invalid.');
  }
}

function decodeParcel(value: unknown): SerializedParcelDefinition {
  const record = object(value, 'Parcel');
  allowedKeys(record, ['basePrice', 'height', 'id', 'width', 'x', 'y'], ['name'], 'Parcel');
  if (
    typeof record.id !== 'string' ||
    typeof record.x !== 'number' ||
    typeof record.y !== 'number' ||
    typeof record.width !== 'number' ||
    typeof record.height !== 'number' ||
    typeof record.basePrice !== 'number'
  ) {
    throw new WorldSnapshotError('Parcel fields have invalid types.');
  }

  if (record.name !== undefined && typeof record.name !== 'string') {
    throw new WorldSnapshotError('Parcel name must be a string.');
  }

  return {
    id: record.id,
    x: record.x,
    y: record.y,
    width: record.width,
    height: record.height,
    basePrice: record.basePrice,
    ...(record.name !== undefined ? { name: record.name } : {}),
  };
}

/**
 * Authoritative sparse chunk metadata, terrain layers and parcel land ownership.
 * Renderer visibility and simulation activity are separate projections.
 */
export class SparseWorld {
  private readonly chunks = new Map<string, ChunkState>();
  private readonly owned = new Set<string>();
  private readonly chunkTerrain = new Map<string, Uint8Array>();
  private readonly chunkTopEdge = new Map<string, Uint8Array>();
  private readonly chunkLeftEdge = new Map<string, Uint8Array>();
  private readonly chunkZoning = new Map<string, Uint8Array>();
  private readonly parcels = new Map<string, ParcelDefinition>();
  private readonly ownedParcels = new Set<string>();

  public constructor(
    public readonly tileChunkSize: number,
    public readonly terrainRegistry: TerrainRegistry = new TerrainRegistry(),
  ) {
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
    this.ensureMetadata(position);
    const key = chunkKey(position);
    const state = this.requireState(position);
    if (state.lifecycle === 'metadata-only') {
      this.chunks.set(key, { ...state, lifecycle: 'loaded' });
      this.ensureStorage(key);
    }

    return this.getChunk(position) as ChunkState;
  }

  public unload(position: ChunkPosition): ChunkState {
    const key = chunkKey(position);
    const state = this.requireState(position);
    if (state.lifecycle === 'loaded') {
      this.chunks.set(key, { ...state, lifecycle: 'metadata-only' });
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

  // --- Terrain Layer Operations ---

  public getTerrainNumericId(tile: TilePosition): number {
    const { chunk, local } = tileToChunk(tile, this.tileChunkSize);
    const key = chunkKey(chunk);
    const terrainData = this.chunkTerrain.get(key);
    if (terrainData === undefined) {
      return 0; // default terrain numericId 0 (dirt)
    }
    const index = local.y * this.tileChunkSize + local.x;
    return terrainData[index] ?? 0;
  }

  public getTerrain(tile: TilePosition): TerrainDefinition {
    const numericId = this.getTerrainNumericId(tile);
    return this.terrainRegistry.requireByNumericId(numericId);
  }

  public setTerrain(tile: TilePosition, terrain: string | TerrainDefinition): void {
    const def =
      typeof terrain === 'string'
        ? this.terrainRegistry.requireById(terrain)
        : terrain;
    const { chunk, local } = tileToChunk(tile, this.tileChunkSize);
    const key = chunkKey(chunk);

    if (!this.hasChunk(chunk) || this.chunks.get(key)?.lifecycle !== 'loaded') {
      this.load(chunk);
    }

    const terrainData = this.ensureStorageMap(this.chunkTerrain, key);
    const index = local.y * this.tileChunkSize + local.x;
    if (terrainData[index] !== def.numericId) {
      terrainData[index] = def.numericId;
      this.markContentChanged(chunk);
    }
  }

  public fillTerrain(position: ChunkPosition, terrain: string | TerrainDefinition): void {
    const def =
      typeof terrain === 'string'
        ? this.terrainRegistry.requireById(terrain)
        : terrain;
    const key = chunkKey(position);

    if (!this.hasChunk(position) || this.chunks.get(key)?.lifecycle !== 'loaded') {
      this.load(position);
    }

    const terrainData = this.ensureStorageMap(this.chunkTerrain, key);
    terrainData.fill(def.numericId);
    this.markContentChanged(position);
  }

  public getChunkTerrainArray(position: ChunkPosition): Uint8Array | undefined {
    return this.chunkTerrain.get(chunkKey(position));
  }

  // --- Edge and Zoning Operations ---
  
  public getTopEdge(tile: TilePosition): number {
    return this.getMapValue(this.chunkTopEdge, tile);
  }

  public setTopEdge(tile: TilePosition, value: number): void {
    this.setMapValue(this.chunkTopEdge, tile, value);
    const { chunk } = tileToChunk(tile, this.tileChunkSize);
    this.markGeometryChanged(chunk);
  }

  public getLeftEdge(tile: TilePosition): number {
    return this.getMapValue(this.chunkLeftEdge, tile);
  }

  public setLeftEdge(tile: TilePosition, value: number): void {
    this.setMapValue(this.chunkLeftEdge, tile, value);
    const { chunk } = tileToChunk(tile, this.tileChunkSize);
    this.markGeometryChanged(chunk);
  }

  public getZoning(tile: TilePosition): number {
    return this.getMapValue(this.chunkZoning, tile);
  }

  public setZoning(tile: TilePosition, value: number): void {
    this.setMapValue(this.chunkZoning, tile, value);
    const { chunk } = tileToChunk(tile, this.tileChunkSize);
    this.markContentChanged(chunk);
  }

  private getMapValue(map: Map<string, Uint8Array>, tile: TilePosition): number {
    const { chunk, local } = tileToChunk(tile, this.tileChunkSize);
    const key = chunkKey(chunk);
    const data = map.get(key);
    if (data === undefined) return 0;
    return data[local.y * this.tileChunkSize + local.x] ?? 0;
  }

  private setMapValue(map: Map<string, Uint8Array>, tile: TilePosition, value: number): void {
    const { chunk, local } = tileToChunk(tile, this.tileChunkSize);
    const key = chunkKey(chunk);

    if (!this.hasChunk(chunk) || this.chunks.get(key)?.lifecycle !== 'loaded') {
      this.load(chunk);
    }

    const data = this.ensureStorageMap(map, key);
    const index = local.y * this.tileChunkSize + local.x;
    data[index] = value;
  }

  private ensureStorageMap(map: Map<string, Uint8Array>, key: string): Uint8Array {
    let data = map.get(key);
    if (data === undefined) {
      data = new Uint8Array(this.tileChunkSize * this.tileChunkSize);
      map.set(key, data);
    }
    return data;
  }

  // --- Parcel Operations ---

  public registerParcel(parcel: ParcelDefinition): void {
    if (this.parcels.has(parcel.id)) {
      throw new Error(`Duplicate parcel id: "${parcel.id}".`);
    }
    this.parcels.set(parcel.id, Object.freeze({ ...parcel }));
  }

  public getParcel(id: string): ParcelDefinition | undefined {
    return this.parcels.get(id);
  }

  /**
   * Code-unit ordering, never `localeCompare`: collation depends on the
   * runtime's default locale and on the ICU data the engine was built
   * with, so two clients could order the same parcels differently. That
   * order is not cosmetic here -- it decides `getParcelAtTile`'s first
   * match, what `canPurchaseParcel`/`getParcelPrice` hooks see, and the
   * order parcels are written into a world snapshot (and therefore into
   * the save checksum). See
   * `tests/determinism/ambient-nondeterminism-contract.test.ts`.
   */
  public getAllParcels(): readonly ParcelDefinition[] {
    return [...this.parcels.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  public isParcelOwned(id: string): boolean {
    return this.ownedParcels.has(id);
  }

  public setParcelOwned(id: string, owned: boolean): void {
    if (!this.parcels.has(id)) {
      throw new RangeError(`Unknown parcel id: "${id}".`);
    }
    if (owned) {
      this.ownedParcels.add(id);
    } else {
      this.ownedParcels.delete(id);
    }
  }

  /**
   * First matching parcel in canonical order (ascending parcel id), never
   * `Map` insertion order.
   *
   * `registerParcel` does not reject overlapping bounds, so more than one
   * parcel can contain a tile; "first match wins" then decides
   * `isTileOwned`, and through it `canBuildAt`. Insertion order is a
   * property of *how a world was built*, while `snapshot()`/`fromSnapshot`
   * emit and re-register parcels sorted by id -- so a snapshot -> restore
   * round trip could flip which of two overlapping parcels owned a tile.
   * Sorting here makes the answer a function of world state alone, which
   * is what `tests/determinism/iteration-order.test.ts` pins.
   */
  public getParcelAtTile(tile: TilePosition): ParcelDefinition | undefined {
    for (const parcel of this.getAllParcels()) {
      if (isTileInParcel(tile, parcel)) {
        return parcel;
      }
    }
    return undefined;
  }

  /**
   * Tile ownership is true if the tile belongs to an owned parcel OR directly owned chunk.
   */
  public isTileOwned(tile: TilePosition): boolean {
    const parcel = this.getParcelAtTile(tile);
    if (parcel !== undefined && this.isParcelOwned(parcel.id)) {
      return true;
    }

    const { chunk } = tileToChunk(tile, this.tileChunkSize);
    return this.isOwned(chunk);
  }

  public canPurchaseParcel(
    parcelId: string,
    hook: ParcelPurchaseEligibilityHook = defaultParcelEligibilityHook,
    context?: unknown,
  ): ParcelPurchaseEligibility {
    const all = this.getAllParcels();
    return hook((id) => this.isParcelOwned(id), all, parcelId, context);
  }

  public getParcelPrice(
    parcelId: string,
    hook: ParcelPricingHook = defaultParcelPricingHook,
    context?: unknown,
  ): number {
    const all = this.getAllParcels();
    return hook((id) => this.isParcelOwned(id), all, parcelId, context);
  }

  // --- Snapshot & Serialization ---

  public snapshot(): WorldSnapshotV1 {
    const positions = (keys: Iterable<string>): ChunkPosition[] =>
      [...keys]
        .map((key) => this.requireStateByKey(key).position)
        .sort(compareChunkPositions)
        .map((position) => ({ ...position }));

    const chunks: SerializedChunkState[] = [...this.chunks.values()]
      .sort((left, right) => compareChunkPositions(left.position, right.position))
      .map((state) => {
        const key = chunkKey(state.position);
        const terrainData = this.chunkTerrain.get(key);
        const topEdgeData = this.chunkTopEdge.get(key);
        const leftEdgeData = this.chunkLeftEdge.get(key);
        const zoningData = this.chunkZoning.get(key);
        
        const hasData = state.lifecycle === 'loaded';

        return {
          x: state.position.x,
          y: state.position.y,
          lifecycle: state.lifecycle,
          geometryRevision: state.geometryRevision,
          contentRevision: state.contentRevision,
          dirty: state.dirty,
          ...(hasData && terrainData ? { terrain: encodeTerrainRle(terrainData) } : {}),
          ...(hasData && topEdgeData ? { topEdge: encodeTerrainRle(topEdgeData) } : {}),
          ...(hasData && leftEdgeData ? { leftEdge: encodeTerrainRle(leftEdgeData) } : {}),
          ...(hasData && zoningData ? { zoning: encodeTerrainRle(zoningData) } : {}),
        };
      });

    const sortedParcels: SerializedParcelDefinition[] = this.getAllParcels()
      .map((p) => ({
        id: p.id,
        x: p.bounds.x,
        y: p.bounds.y,
        width: p.bounds.width,
        height: p.bounds.height,
        basePrice: p.basePrice,
        ...(p.name !== undefined ? { name: p.name } : {}),
      }));

    const sortedOwnedParcels = [...this.ownedParcels].sort();

    return {
      version: WORLD_SNAPSHOT_VERSION,
      chunkSize: this.tileChunkSize,
      ownedChunks: positions(this.owned),
      chunks,
      ...(sortedParcels.length > 0 ? { parcels: sortedParcels } : {}),
      ...(sortedOwnedParcels.length > 0 ? { ownedParcels: sortedOwnedParcels } : {}),
    };
  }

  public static fromSnapshot(
    value: unknown,
    terrainRegistry: TerrainRegistry = new TerrainRegistry(),
  ): SparseWorld {
    const record = object(value, 'World snapshot');
    allowedKeys(
      record,
      ['chunkSize', 'chunks', 'ownedChunks', 'version'],
      ['ownedParcels', 'parcels'],
      'World snapshot',
    );
    if (
      record.version !== WORLD_SNAPSHOT_VERSION ||
      !Array.isArray(record.chunks) ||
      !Array.isArray(record.ownedChunks)
    ) {
      throw new WorldSnapshotError('World snapshot version or collections are invalid.');
    }

    let size: number;
    try {
      size = chunkSize(record.chunkSize as number);
    } catch {
      throw new WorldSnapshotError('World snapshot chunk size is invalid.');
    }

    const world = new SparseWorld(size, terrainRegistry);
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

      if (chunk.lifecycle === 'loaded') {
        if (chunk.terrain !== undefined) world.chunkTerrain.set(key, decodeTerrainRle(chunk.terrain, size * size));
        if (chunk.topEdge !== undefined) world.chunkTopEdge.set(key, decodeTerrainRle(chunk.topEdge, size * size));
        if (chunk.leftEdge !== undefined) world.chunkLeftEdge.set(key, decodeTerrainRle(chunk.leftEdge, size * size));
        if (chunk.zoning !== undefined) world.chunkZoning.set(key, decodeTerrainRle(chunk.zoning, size * size));
        world.ensureStorage(key);
      }
    }

    for (const rawPosition of record.ownedChunks) {
      const position = decodePosition(rawPosition, 'Owned chunk');
      const key = chunkKey(position);
      if (!world.chunks.has(key)) throw new WorldSnapshotError('Owned chunk has no metadata.');
      if (world.owned.has(key)) throw new WorldSnapshotError('World snapshot has duplicate owned chunks.');
      world.owned.add(key);
    }

    if (record.parcels !== undefined) {
      if (!Array.isArray(record.parcels)) {
        throw new WorldSnapshotError('Parcels must be an array.');
      }
      for (const rawParcel of record.parcels) {
        const p = decodeParcel(rawParcel);
        if (world.parcels.has(p.id)) {
          throw new WorldSnapshotError(`World snapshot has duplicate parcel "${p.id}".`);
        }
        world.registerParcel({
          id: p.id,
          bounds: createParcelRect(p.x, p.y, p.width, p.height),
          basePrice: p.basePrice,
          ...(p.name !== undefined ? { name: p.name } : {}),
        });
      }
    }

    if (record.ownedParcels !== undefined) {
      if (!Array.isArray(record.ownedParcels)) {
        throw new WorldSnapshotError('Owned parcels must be an array.');
      }
      for (const rawId of record.ownedParcels) {
        if (typeof rawId !== 'string') {
          throw new WorldSnapshotError('Owned parcel ID must be a string.');
        }
        if (!world.parcels.has(rawId)) {
          throw new WorldSnapshotError(`Owned parcel "${rawId}" is not in registered parcels.`);
        }
        if (world.ownedParcels.has(rawId)) {
          throw new WorldSnapshotError(`Duplicate owned parcel "${rawId}".`);
        }
        world.ownedParcels.add(rawId);
      }
    }

    return world;
  }

  private ensureStorage(key: string): void {
    this.ensureStorageMap(this.chunkTerrain, key);
    this.ensureStorageMap(this.chunkTopEdge, key);
    this.ensureStorageMap(this.chunkLeftEdge, key);
    this.ensureStorageMap(this.chunkZoning, key);
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

  private markChanged(
    position: ChunkPosition,
    revision: 'geometryRevision' | 'contentRevision',
  ): ChunkState {
    const state = this.requireState(position);
    if (state.lifecycle !== 'loaded') {
      throw new RangeError('Chunk must be loaded before it can change.');
    }
    const nextRevision = state[revision] + 1;
    if (!Number.isSafeInteger(nextRevision)) throw new RangeError('Chunk revision overflow.');
    this.chunks.set(chunkKey(position), { ...state, [revision]: nextRevision, dirty: true });
    return this.getChunk(position) as ChunkState;
  }
}
