import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate, type ChunkPosition, type TilePosition } from '../../src/simulation/world/coordinates';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { buildNavigationGraph, type NavigationGraph } from '../../src/simulation/navigation/region-graph';

export const FIXTURE_CHUNK_SIZE = 4;

/**
 * Two loaded chunks side by side (a two-chunk world, so every fixture
 * exercises cross-chunk connectivity): a left region (tiles x=0..3) and a
 * right region (tiles x=4..7), each y=0..3, separated by a full wall at
 * x=4 except at two doors:
 * - `door-clearance` at (4,1): requires securityClearance >= 5.
 * - `door-medical` at (4,2): requires the 'medical-wing' permission.
 * Rows y=0 and y=3 are solid walls with no door -- never traversable.
 */
export function buildTwoRoomFixture(): {
  readonly world: SparseWorld;
  readonly doors: DoorRegistry;
  readonly chunkA: ChunkPosition;
  readonly chunkB: ChunkPosition;
} {
  const world = new SparseWorld(FIXTURE_CHUNK_SIZE);
  const chunkA = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  const chunkB = { x: chunkCoordinate(1), y: chunkCoordinate(0) };
  world.load(chunkA);
  world.load(chunkB);

  for (let y = 0; y < FIXTURE_CHUNK_SIZE; y += 1) {
    world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(y) }, 1);
  }

  const doors = new DoorRegistry();
  doors.register({
    id: 'door-clearance',
    position: { x: tileCoordinate(4), y: tileCoordinate(1) },
    side: 'left',
    state: 'closed',
    requiredSecurityClearance: 5,
    costMultiplier: 1,
  });
  doors.register({
    id: 'door-medical',
    position: { x: tileCoordinate(4), y: tileCoordinate(2) },
    side: 'left',
    state: 'open',
    requiredSecurityClearance: 0,
    requiredPermission: 'medical-wing',
    costMultiplier: 1,
  });

  return { world, doors, chunkA, chunkB };
}

/**
 * Same two-room layout as `buildTwoRoomFixture`, but with only the
 * clearance-gated door registered -- for tests that need to isolate one
 * door's state/permission behavior without a cheaper alternative door
 * changing which physical path Dijkstra reports as "shortest".
 */
export function buildSingleDoorFixture(): {
  readonly world: SparseWorld;
  readonly doors: DoorRegistry;
  readonly chunkA: ChunkPosition;
  readonly chunkB: ChunkPosition;
} {
  const world = new SparseWorld(FIXTURE_CHUNK_SIZE);
  const chunkA = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  const chunkB = { x: chunkCoordinate(1), y: chunkCoordinate(0) };
  world.load(chunkA);
  world.load(chunkB);

  for (let y = 0; y < FIXTURE_CHUNK_SIZE; y += 1) {
    world.setLeftEdge({ x: tileCoordinate(4), y: tileCoordinate(y) }, 1);
  }

  const doors = new DoorRegistry();
  doors.register({
    id: 'door-clearance',
    position: { x: tileCoordinate(4), y: tileCoordinate(1) },
    side: 'left',
    state: 'closed',
    requiredSecurityClearance: 5,
    costMultiplier: 1,
  });

  return { world, doors, chunkA, chunkB };
}

export interface CellBlockFixture {
  readonly world: SparseWorld;
  readonly doors: DoorRegistry;
  readonly chunkPositions: readonly ChunkPosition[];
  /** One tile per corridor column, y=1. */
  readonly corridorTiles: readonly TilePosition[];
  /** Cell tiles that were actually wired to the corridor via a door (roughly half the columns; see `buildCellBlockFixture`). */
  readonly cellTiles: readonly TilePosition[];
  readonly canteenTiles: readonly TilePosition[];
  readonly canteenEntranceDoorId: string;
}

const CELL_BLOCK_CHUNK_SIZE = 3;

/**
 * A representative, non-trivial prison-shaped layout for #22's work-budget,
 * flow-field and benchmark tests -- not an empty field. Three tile rows
 * (`y=0` north cells, `y=1` corridor, `y=2` south cells) across
 * `cellCount + canteenCols` columns:
 *
 * - `cellCount` single-tile cells, alternating north/south by column parity,
 *   each its own region reachable from the corridor through exactly one
 *   door with a clearance/permission profile that cycles by column index
 *   (varied enough to exercise permission-aware routing without needing
 *   randomness for the geometry itself).
 * - one corridor region spanning every used column's `y=1` tile.
 * - one multi-tile canteen region (`canteenCols` columns, all three rows,
 *   fully open internally) at the far end, reachable from the corridor
 *   through a single entrance door -- the "many actors converge on one
 *   destination region" shape issue #22's flow-field sharing targets.
 *
 * Every internal tile-to-tile edge is walled by default and only
 * selectively cleared/doored, so the loaded chunks contain exactly this
 * layout and nothing else -- see the function body for why chunk size 3
 * (matching the row count) keeps that exact.
 */
export function buildCellBlockFixture(cellCount: number, canteenCols = 3): CellBlockFixture {
  if (!Number.isInteger(cellCount) || cellCount < 1) {
    throw new RangeError('cellCount must be a positive integer.');
  }

  const totalColumns = cellCount + canteenCols;
  const world = new SparseWorld(CELL_BLOCK_CHUNK_SIZE);
  const doors = new DoorRegistry();

  const chunkColumns = Math.ceil(totalColumns / CELL_BLOCK_CHUNK_SIZE);
  const chunkPositions: ChunkPosition[] = [];
  for (let cx = 0; cx < chunkColumns; cx += 1) {
    const position = { x: chunkCoordinate(cx), y: chunkCoordinate(0) };
    world.load(position);
    // Owned as well as loaded. `ConstructionSystem.submitOrder` refuses an
    // order on land the player does not own (#215), and a prison block is by
    // construction land the player owns -- `createNewSimulationRuntime`
    // (`src/simulation/runtime/new-session.ts`) owns the starting chunk. A
    // loaded-but-unowned chunk is not a state a session reaches, so leaving it
    // that way would make this fixture describe a world the game cannot be in.
    world.setOwned(position, true);
    chunkPositions.push(position);
  }

  const loadedWidth = chunkColumns * CELL_BLOCK_CHUNK_SIZE;
  const rows = 3;
  const t = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

  // Wall every internal edge within the loaded bounding box by default.
  for (let x = 1; x < loadedWidth; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      world.setLeftEdge(t(x, y), 1);
    }
  }
  for (let x = 0; x < loadedWidth; x += 1) {
    world.setTopEdge(t(x, 1), 1);
    world.setTopEdge(t(x, 2), 1);
  }

  // Corridor: open the y=1 row across every used column.
  for (let x = 1; x < totalColumns; x += 1) {
    world.setLeftEdge(t(x, 1), 0);
  }

  const corridorTiles: TilePosition[] = [];
  const cellTiles: TilePosition[] = [];
  for (let i = 0; i < cellCount; i += 1) {
    corridorTiles.push(t(i, 1));
    const onNorthSide = i % 2 === 0;
    const cellY = onNorthSide ? 0 : 2;
    const cellTile = t(i, cellY);
    const doorPosition = onNorthSide ? t(i, 1) : t(i, 2);
    doors.register({
      id: `cell-door-${i}`,
      position: doorPosition,
      side: 'top',
      state: i % 7 === 0 ? 'closed' : 'open',
      requiredSecurityClearance: i % 4,
      ...(i % 5 === 0 ? { requiredPermission: 'medical-wing' } : {}),
      costMultiplier: 1,
    });
    cellTiles.push(cellTile);
  }

  // Canteen: fully open 3-row block at the far end, entered through one door.
  const canteenTiles: TilePosition[] = [];
  for (let x = cellCount; x < totalColumns; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      canteenTiles.push(t(x, y));
      if (y > 0) world.setTopEdge(t(x, y), 0);
    }
    if (x > cellCount) {
      world.setLeftEdge(t(x, 0), 0);
      world.setLeftEdge(t(x, 2), 0);
    }
  }
  const canteenEntranceDoorId = 'canteen-entrance';
  doors.register({
    id: canteenEntranceDoorId,
    position: t(cellCount, 1),
    side: 'left',
    state: 'open',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  // Seal any phantom columns loaded beyond totalColumns (chunk padding) off from the used layout.
  if (loadedWidth > totalColumns) {
    for (let y = 0; y < rows; y += 1) {
      world.setLeftEdge(t(totalColumns, y), 1);
    }
  }

  return { world, doors, chunkPositions, corridorTiles, cellTiles, canteenTiles, canteenEntranceDoorId };
}

export function buildFixtureGraph(world: SparseWorld, doors: DoorRegistry, chunks: readonly ChunkPosition[]): NavigationGraph {
  const chunkStates = chunks.map((position) => {
    const state = world.getChunk(position);
    if (state === undefined) throw new Error('Fixture chunk must be loaded.');
    return state;
  });
  return buildNavigationGraph(world, doors, chunkStates);
}
