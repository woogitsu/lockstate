import {
  ConstructionSystem,
  createConstructionCommandHandler,
} from '../construction';
import { Kernel } from '../kernel';
import { NavigationSystem, type NavigationSystemOptions } from '../navigation';
import { Container, ContainerMaterialsProvider, ContainerRegistry, JobBoard, JobSystem, JobWorkerPool, UtilityNetwork } from '../operations';
import { PrisonerJobWorkerAdapter, PrisonerOperationsRuntime } from '../prisoners';
import { defaultRoomRegistry } from '../rooms/definition';
import { RoomSystem } from '../rooms/system';
import { TopologyManager } from '../rooms/topology';
import { deriveXoshiroState } from '../rng/seed';
import { NamedRngStreams } from '../rng/streams';
import { chunkCoordinate } from '../world/coordinates';
import { SparseWorld } from '../world/sparse-world';

/** Well-known container id every session's `ConstructionSystem` draws build materials from -- session/scenario setup deposits into it (directly, or via delivery jobs from other containers) to make construction orders actually wait for and consume real materials (issue #25). */
export const CONSTRUCTION_MATERIALS_CONTAINER_ID = 'construction-materials';

/** Prisoner intake's one intentional RNG use (see `src/simulation/prisoners/classification.ts`); pre-registered on every session's Kernel so `IntakeSystem` can claim it. */
export const PRISONER_CLASSIFICATION_RNG_STREAM = 'prisoners.classification';

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
  readonly prisoners: PrisonerOperationsRuntime;
  readonly containers: ContainerRegistry;
  readonly jobs: JobBoard;
  readonly jobWorkers: JobWorkerPool;
  readonly jobSystem: JobSystem;
  readonly electricity: UtilityNetwork;
  readonly water: UtilityNetwork;
}

const DEFAULT_PRISONER_CAPACITY = 5_000;

/**
 * Creates the deterministic authoritative state for a new prison session.
 * Phaser and all browser-facing code receive only derived projections.
 * `masterSeed` seeds every named RNG stream this runtime's systems claim
 * (currently only `PRISONER_CLASSIFICATION_RNG_STREAM`) via
 * `deriveXoshiroState` -- pass the same seed to reproduce an identical
 * session deterministically.
 */
export function createNewSimulationRuntime(masterSeed: number = 0): SimulationRuntime {
  const world = new SparseWorld(32);
  const initialChunk = {
    x: chunkCoordinate(0),
    y: chunkCoordinate(0),
  };
  world.load(initialChunk);
  world.setOwned(initialChunk, true);

  const topology = new TopologyManager(world);
  const rooms = new RoomSystem(world, topology, defaultRoomRegistry);
  const navigation = new NavigationSystem(world, DEFAULT_NAVIGATION_SYSTEM_OPTIONS);
  navigation.setLoadedChunks([initialChunk]);

  const rng = new NamedRngStreams([{ name: PRISONER_CLASSIFICATION_RNG_STREAM, state: deriveXoshiroState(masterSeed, PRISONER_CLASSIFICATION_RNG_STREAM) }]);
  const kernel = new Kernel(0, 0, rng);

  const prisoners = new PrisonerOperationsRuntime({ capacity: DEFAULT_PRISONER_CAPACITY, navigation });

  // Issue #25's job/inventory substrate. Starts empty -- no default stock,
  // no default containers beyond the one construction draws from, no
  // registered workers -- exactly like navigation/prisoners wire real
  // infrastructure without fabricating default content.
  const containers = new ContainerRegistry();
  const constructionMaterials = new Container(CONSTRUCTION_MATERIALS_CONTAINER_ID);
  containers.register(constructionMaterials);
  const construction = new ConstructionSystem(world, new ContainerMaterialsProvider(constructionMaterials));

  const jobs = new JobBoard();
  const jobWorkers = new JobWorkerPool();
  const jobWorkerAdapter = new PrisonerJobWorkerAdapter(prisoners);
  const jobSystem = new JobSystem(jobs, containers, jobWorkers, jobWorkerAdapter, navigation);

  // Empty until a session/scenario places real generators/consumers --
  // same "no fabricated default content" convention as `containers`/`jobs`.
  const electricity = new UtilityNetwork('electricity');
  const water = new UtilityNetwork('water');

  kernel.registerSystem(construction);
  kernel.registerSystem(navigation);
  prisoners.registerOn(kernel);
  kernel.registerSystem(jobSystem);
  kernel.setCommandHandler(createConstructionCommandHandler(construction));

  return {
    kernel,
    world,
    construction,
    topology,
    rooms,
    navigation,
    prisoners,
    containers,
    jobs,
    jobWorkers,
    jobSystem,
    electricity,
    water,
  };
}
