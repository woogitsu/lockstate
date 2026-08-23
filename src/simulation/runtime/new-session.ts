import {
  ConstructionSystem,
  createConstructionCommandHandler,
} from '../construction';
import { Kernel } from '../kernel';
import { NavigationSystem, type NavigationSystemOptions } from '../navigation';
import { defaultRoomRegistry } from '../rooms/definition';
import { RoomSystem } from '../rooms/system';
import { TopologyManager } from '../rooms/topology';
import { chunkCoordinate } from '../world/coordinates';
import { SparseWorld } from '../world/sparse-world';

/**
 * Directional defaults, not a committed performance contract -- see
 * `docs/adr/0007-navigation-work-budgets-and-flow-fields.md` and
 * `docs/BENCHMARKING.md`'s "no hard timing threshold" policy. Candidate
 * values stay candidates until repeated benchmark evidence backs them.
 */
export const DEFAULT_NAVIGATION_SYSTEM_OPTIONS: NavigationSystemOptions = {
  workBudgetPerTick: 2_000,
  agingIntervalTicks: 20,
  flowFieldActivationThreshold: 8,
};

export interface SimulationRuntime {
  readonly kernel: Kernel;
  readonly world: SparseWorld;
  readonly construction: ConstructionSystem;
  readonly topology: TopologyManager;
  readonly rooms: RoomSystem;
  readonly navigation: NavigationSystem;
}

/**
 * Creates the deterministic authoritative state for a new prison session.
 * Phaser and all browser-facing code receive only derived projections.
 */
export function createNewSimulationRuntime(): SimulationRuntime {
  const world = new SparseWorld(32);
  const initialChunk = {
    x: chunkCoordinate(0),
    y: chunkCoordinate(0),
  };
  world.load(initialChunk);
  world.setOwned(initialChunk, true);

  const construction = new ConstructionSystem(world);
  const topology = new TopologyManager(world);
  const rooms = new RoomSystem(world, topology, defaultRoomRegistry);
  const navigation = new NavigationSystem(world, DEFAULT_NAVIGATION_SYSTEM_OPTIONS);
  navigation.setLoadedChunks([initialChunk]);
  const kernel = new Kernel();

  kernel.registerSystem(construction);
  kernel.registerSystem(navigation);
  kernel.setCommandHandler(createConstructionCommandHandler(construction));

  return {
    kernel,
    world,
    construction,
    topology,
    rooms,
    navigation,
  };
}
