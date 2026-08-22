import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate, type ChunkPosition } from '../../src/simulation/world/coordinates';
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

export function buildFixtureGraph(world: SparseWorld, doors: DoorRegistry, chunks: readonly ChunkPosition[]): NavigationGraph {
  const chunkStates = chunks.map((position) => {
    const state = world.getChunk(position);
    if (state === undefined) throw new Error('Fixture chunk must be loaded.');
    return state;
  });
  return buildNavigationGraph(world, doors, chunkStates);
}
