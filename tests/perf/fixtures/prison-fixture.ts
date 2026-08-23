import { createBuildOrder } from '../../../src/simulation/construction/build-order';
import { packCommand } from '../../../src/simulation/protocol/commands';
import { CONSTRUCTION_MATERIALS_CONTAINER_ID, createNewSimulationRuntime } from '../../../src/simulation/runtime/new-session';
import type { SimulationRuntime } from '../../../src/simulation/runtime/new-session';
import { chunkCoordinate, tileCoordinate } from '../../../src/simulation/world/coordinates';
import type { ChunkPosition, TilePosition } from '../../../src/simulation/world/coordinates';
import { createSaveEnvelope } from '../../../src/persistence/save-schema';
import type { SaveEnvelopeV1 } from '../../../src/persistence/save-schema';

/**
 * Representative prison fixtures for the persistence measurement harness
 * (issue #19's "measure write/read time and storage size for representative
 * snapshots/generation counts").
 *
 * Everything here is built from the *real* simulation runtime
 * (`createNewSimulationRuntime`) and the real subsystem snapshot methods, so
 * the measured bytes and durations describe the shipping save path rather
 * than a hand-rolled payload of the harness's own invention. Content is a
 * pure function of the tier definition plus a fixed seed — no wall clock, no
 * unseeded randomness — so a rerun measures the same workload
 * (`docs/BENCHMARKING.md`, "Scenario rules").
 */

/** Fixed master seed for every fixture; makes RNG stream state reproducible across runs. */
export const FIXTURE_MASTER_SEED = 20_260_823;

/** Fixed envelope timestamps: the harness must not vary its payload by wall clock. */
const FIXTURE_CREATED_AT = 1_700_000_000_000;

export interface PrisonSizeTier {
  readonly id: string;
  /** Human-readable scale description used in the reported table. */
  readonly description: string;
  /** Loaded chunks are laid out as `chunksPerSide × chunksPerSide` (32×32 tiles each). */
  readonly chunksPerSide: number;
  /** Additional metadata-only (owned but not loaded) chunks ringing the loaded area. */
  readonly metadataOnlyChunks: number;
  readonly buildOrders: number;
  readonly prisoners: number;
  /** Commands still queued for a future tick when the snapshot is taken. */
  readonly pendingCommands: number;
  /** Kernel ticks stepped before snapshotting, so orders/prisoners are mid-lifecycle. */
  readonly ticks: number;
  /** Measured iterations for this tier (large payloads get fewer; see the harness's warm-up handling). */
  readonly samples: number;
}

/**
 * Small/medium/large describe plausible play states, not committed budgets:
 * a starter plot, an established prison, and a late-game sprawl. The extra
 * `x-large` tier exists to show how cost scales past what is currently
 * expected in play, not as a target.
 */
export const PRISON_SIZE_TIERS: readonly PrisonSizeTier[] = Object.freeze([
  {
    id: 'small',
    description: '16 loaded chunks (128×128 tiles), 50 build orders, 25 prisoners',
    chunksPerSide: 4,
    metadataOnlyChunks: 12,
    buildOrders: 50,
    prisoners: 25,
    pendingCommands: 4,
    ticks: 20,
    samples: 15,
  },
  {
    id: 'medium',
    description: '100 loaded chunks (320×320 tiles), 500 build orders, 250 prisoners',
    chunksPerSide: 10,
    metadataOnlyChunks: 40,
    buildOrders: 500,
    prisoners: 250,
    pendingCommands: 16,
    ticks: 20,
    samples: 9,
  },
  {
    id: 'large',
    description: '400 loaded chunks (640×640 tiles), 2,000 build orders, 1,000 prisoners',
    chunksPerSide: 20,
    metadataOnlyChunks: 80,
    buildOrders: 2_000,
    prisoners: 1_000,
    pendingCommands: 64,
    ticks: 20,
    samples: 7,
  },
  {
    id: 'x-large',
    description: '1,024 loaded chunks (1024×1024 tiles), 5,000 build orders, 3,000 prisoners',
    chunksPerSide: 32,
    metadataOnlyChunks: 128,
    buildOrders: 5_000,
    prisoners: 3_000,
    pendingCommands: 128,
    ticks: 20,
    samples: 5,
  },
]);

export interface PrisonFixture {
  readonly tier: PrisonSizeTier;
  readonly runtime: SimulationRuntime;
  readonly envelope: SaveEnvelopeV1;
  readonly loadedChunks: number;
  readonly totalChunks: number;
  readonly buildOrders: number;
  readonly alivePrisoners: number;
}

function tile(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

function chunk(x: number, y: number): ChunkPosition {
  return { x: chunkCoordinate(x), y: chunkCoordinate(y) };
}

/**
 * Deterministic prison-shaped terrain: 48×48-tile building footprints on a
 * 64-tile pitch, 16-tile corridors inside them, patchy grass outside. The
 * point is realistic *run-length* structure — a uniformly filled world would
 * RLE-compress to nothing and understate real save sizes, while per-tile
 * noise would overstate them.
 */
function paintChunk(runtime: SimulationRuntime, position: ChunkPosition): void {
  const size = runtime.world.tileChunkSize;
  const baseX = position.x * size;
  const baseY = position.y * size;

  for (let localY = 0; localY < size; localY += 1) {
    for (let localX = 0; localX < size; localX += 1) {
      const x = baseX + localX;
      const y = baseY + localY;
      const target = tile(x, y);

      const insideBuilding = x % 64 < 48 && y % 64 < 48;
      const onCorridor = x % 16 === 0 || y % 16 === 0;

      if (insideBuilding) {
        runtime.world.setTerrain(target, onCorridor ? 'gravel' : 'concrete');
        // Room shells: a wall on the west/north face of every 16-tile room cell.
        if (x % 16 === 0) runtime.world.setLeftEdge(target, 1);
        if (y % 16 === 0) runtime.world.setTopEdge(target, 1);
        runtime.world.setZoning(target, ((Math.floor(x / 16) + Math.floor(y / 16)) % 4) + 1);
      } else {
        const patch = (Math.floor(x / 8) + Math.floor(y / 8)) % 5 === 0;
        runtime.world.setTerrain(target, patch ? 'grass' : 'dirt');
      }
    }
  }
}

function populateWorld(runtime: SimulationRuntime, tier: PrisonSizeTier): number {
  for (let cy = 0; cy < tier.chunksPerSide; cy += 1) {
    for (let cx = 0; cx < tier.chunksPerSide; cx += 1) {
      const position = chunk(cx, cy);
      runtime.world.load(position);
      runtime.world.setOwned(position, true);
      paintChunk(runtime, position);
    }
  }

  // Owned-but-unloaded frontier chunks: real saves carry metadata-only
  // chunks too, and they cost far less per chunk than a loaded one.
  for (let index = 0; index < tier.metadataOnlyChunks; index += 1) {
    runtime.world.setOwned(chunk(tier.chunksPerSide + (index % 8), Math.floor(index / 8)), true);
  }

  return tier.chunksPerSide * tier.chunksPerSide;
}

function populateConstruction(runtime: SimulationRuntime, tier: PrisonSizeTier): number {
  const tilesPerSide = tier.chunksPerSide * runtime.world.tileChunkSize;

  // Real material stock for roughly half the orders, so the snapshot holds a
  // realistic mix of lifecycle states (completed/in-progress/assigned vs.
  // materials-pending) instead of every order sitting in one state.
  const materials = runtime.containers.getById(CONSTRUCTION_MATERIALS_CONTAINER_ID);
  materials?.deposit('brick', tier.buildOrders);
  materials?.deposit('wood-plank', Math.ceil(tier.buildOrders / 2));

  for (let index = 0; index < tier.buildOrders; index += 1) {
    const x = (index * 17) % tilesPerSide;
    const y = (index * 29) % tilesPerSide;
    const definitionId = index % 4 === 3 ? 'door-wooden' : 'wall-brick';
    const order = createBuildOrder(`order-${index}`, definitionId, tile(x, y));
    runtime.construction.submitOrder(order);
    // Ten orders per player drag, which is what fills the undo stack.
    runtime.construction.registerTransactionOrder(order.id, `txn-${Math.floor(index / 10)}`);
  }

  return tier.buildOrders;
}

function populatePrisoners(runtime: SimulationRuntime, tier: PrisonSizeTier): number {
  const tilesPerSide = tier.chunksPerSide * runtime.world.tileChunkSize;

  for (let index = 0; index < tier.prisoners; index += 1) {
    runtime.prisoners.admitPrisoner(
      {
        sentenceLengthTicks: 50_000 + ((index * 9_973) % 400_000),
        priorIncidents: index % 4,
      },
      tile((index * 13) % tilesPerSide, (index * 7) % tilesPerSide),
    );
  }

  return tier.prisoners;
}

function queuePendingCommands(runtime: SimulationRuntime, tier: PrisonSizeTier): void {
  const tilesPerSide = tier.chunksPerSide * runtime.world.tileChunkSize;
  const futureTick = runtime.kernel.tick + 10_000;

  for (let index = 0; index < tier.pendingCommands; index += 1) {
    runtime.kernel.submitCommand(
      `queued-${index}`,
      runtime.kernel.expectedSequence,
      futureTick + index,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: `queued-order-${index}`,
        definitionId: 'wall-brick',
        x: (index * 31) % tilesPerSide,
        y: (index * 37) % tilesPerSide,
        transactionId: `queued-txn-${Math.floor(index / 4)}`,
      }),
    );
  }
}

/** Builds the fixture's live runtime; the returned runtime is reusable for repeated snapshots. */
export function buildPrisonRuntime(tier: PrisonSizeTier): {
  readonly runtime: SimulationRuntime;
  readonly loadedChunks: number;
  readonly buildOrders: number;
  readonly alivePrisoners: number;
} {
  const runtime = createNewSimulationRuntime(FIXTURE_MASTER_SEED);
  const loadedChunks = populateWorld(runtime, tier);
  const buildOrders = populateConstruction(runtime, tier);
  const alivePrisoners = populatePrisoners(runtime, tier);
  queuePendingCommands(runtime, tier);

  // Advance real simulation ticks so orders and prisoners are genuinely
  // mid-lifecycle when snapshotted, rather than all in their initial state.
  for (let step = 0; step < tier.ticks; step += 1) runtime.kernel.step();

  return { runtime, loadedChunks, buildOrders, alivePrisoners };
}

/** Composes the checksummed, schema-valid envelope for `runtime`'s current state. */
export function snapshotEnvelope(runtime: SimulationRuntime, revision: number): SaveEnvelopeV1 {
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'perf-prison',
    revision,
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT + revision,
    kernel: runtime.kernel.snapshot(),
    world: runtime.world.snapshot(),
    construction: runtime.construction.snapshot(),
    entities: runtime.prisoners.entityStore.getSnapshot(),
  });
}

export function buildPrisonFixture(tier: PrisonSizeTier): PrisonFixture {
  const { runtime, loadedChunks, buildOrders, alivePrisoners } = buildPrisonRuntime(tier);
  const envelope = snapshotEnvelope(runtime, 1);

  return {
    tier,
    runtime,
    envelope,
    loadedChunks,
    totalChunks: envelope.payload.world.chunks.length,
    buildOrders,
    alivePrisoners,
  };
}
