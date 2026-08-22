import {
  ConstructionSystem,
  createConstructionCommandHandler,
} from '../construction';
import { Kernel } from '../kernel';
import {
  defaultRoomRegistry,
  RoomSystem,
  TopologyManager,
} from '../rooms';
import { chunkCoordinate } from '../world/coordinates';
import { SparseWorld } from '../world/sparse-world';

export interface SimulationRuntime {
  readonly kernel: Kernel;
  readonly world: SparseWorld;
  readonly construction: ConstructionSystem;
  readonly topology: TopologyManager;
  readonly rooms: RoomSystem;
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
  const kernel = new Kernel();

  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction));

  return {
    kernel,
    world,
    construction,
    topology,
    rooms,
  };
}
