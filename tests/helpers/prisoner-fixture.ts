import type { ActorIdentityMinter } from '../../src/simulation/identity/actor-identity';
import type { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { PrisonerOperationsRuntime } from '../../src/simulation/prisoners/prisoner-operations-runtime';
import type { RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';
import { buildCellBlockFixture } from './navigation-fixture';

export interface PrisonerScenarioFixture {
  readonly navigation: NavigationSystem;
  readonly prisoners: PrisonerOperationsRuntime;
  readonly generalCellTiles: readonly RoomInstance['anchorTile'][];
  readonly solitaryCellTiles: readonly RoomInstance['anchorTile'][];
  readonly originTile: RoomInstance['anchorTile'];
  /** Registers both `navigation` and every prisoner system on `kernel` -- the action system depends on navigation actually running each tick to resolve its route requests, so tests must never register `prisoners` alone. */
  readonly registerOn: (kernel: Kernel) => void;
}

/**
 * A small "prison" wiring #22's synthetic cell-block navigation fixture
 * (real doors/permissions/regions) to issue #24's `RoomInstanceRegistry`.
 * Every action-catalog target room type (own-accommodation, canteen,
 * shower-room, yard, common-room, classroom) gets exactly one registered
 * instance -- the canteen block has enough distinct tiles (9, `canteenCols=3`)
 * for each of the non-cell room types to get its own, non-overlapping
 * anchor tile. `RoomInstanceRegistry` does not itself enforce #23's
 * minimum-tile-size requirements (see room-instance-registry.ts's own
 * docs) so single-tile cells here are a fine, explicit test simplification.
 */
export function buildPrisonerScenarioFixture(options: {
  readonly cellCount: number;
  readonly capacity: number;
  readonly workBudgetPerTick?: number;
  readonly agingIntervalTicks?: number;
  readonly flowFieldActivationThreshold?: number;
  /** Optional actor-identity minting; omitted, intake names nobody and draws nothing (`src/simulation/identity/`). */
  readonly identity?: ActorIdentityMinter;
}): PrisonerScenarioFixture {
  const cellBlock = buildCellBlockFixture(options.cellCount);
  const navigation = new NavigationSystem(
    cellBlock.world,
    {
      workBudgetPerTick: options.workBudgetPerTick ?? 2_000,
      agingIntervalTicks: options.agingIntervalTicks ?? 15,
      flowFieldActivationThreshold: options.flowFieldActivationThreshold ?? 6,
    },
    cellBlock.doors,
  );
  navigation.setLoadedChunks(cellBlock.chunkPositions);

  const prisoners = new PrisonerOperationsRuntime({
    capacity: options.capacity,
    navigation,
    ...(options.identity !== undefined ? { identity: options.identity } : {}),
  });

  // classifyPrisoner's scoring (classification.ts) puts a sizeable minority
  // of a synthetic, uniformly-random test population at riskTier>=3 -- a
  // deliberately test-only reservation, generous enough that capacity is
  // never the reason a scenario test fails; it is not a claim about a
  // realistic real-world high-risk population share.
  const solitaryCount = Math.max(1, Math.floor(cellBlock.cellTiles.length * 0.4));
  const generalCellTiles = cellBlock.cellTiles.slice(0, cellBlock.cellTiles.length - solitaryCount);
  const solitaryCellTiles = cellBlock.cellTiles.slice(cellBlock.cellTiles.length - solitaryCount);

  generalCellTiles.forEach((tile, index) => {
    prisoners.roomInstances.register({
      instanceId: `cell-${index}`, roomCatalogId: 'room.cell', anchorTile: tile, capacity: 1,
      objectCapabilities: ['sleep-surface', 'sanitation'],
    });
  });
  solitaryCellTiles.forEach((tile, index) => {
    prisoners.roomInstances.register({
      instanceId: `solitary-cell-${index}`, roomCatalogId: 'room.solitary-cell', anchorTile: tile, capacity: 1,
      objectCapabilities: ['sleep-surface', 'sanitation'],
    });
  });

  const [canteenTile, yardTile, showerTile, commonRoomTile, classroomTile] = cellBlock.canteenTiles;
  if (canteenTile === undefined || yardTile === undefined || showerTile === undefined || commonRoomTile === undefined || classroomTile === undefined) {
    throw new Error('Fixture invariant violated: expected at least 5 distinct canteen-block tiles.');
  }

  prisoners.roomInstances.register({ instanceId: 'canteen-0', roomCatalogId: 'room.canteen', anchorTile: canteenTile, capacity: 40, objectCapabilities: ['dining'] });
  prisoners.roomInstances.register({ instanceId: 'yard-0', roomCatalogId: 'room.yard', anchorTile: yardTile, capacity: 60, objectCapabilities: [] });
  prisoners.roomInstances.register({ instanceId: 'shower-room-0', roomCatalogId: 'room.shower-room', anchorTile: showerTile, capacity: 8, objectCapabilities: ['hygiene'] });
  prisoners.roomInstances.register({ instanceId: 'common-room-0', roomCatalogId: 'room.common-room', anchorTile: commonRoomTile, capacity: 30, objectCapabilities: [] });
  prisoners.roomInstances.register({ instanceId: 'classroom-0', roomCatalogId: 'room.classroom', anchorTile: classroomTile, capacity: 20, objectCapabilities: [] });

  return {
    navigation,
    prisoners,
    generalCellTiles,
    solitaryCellTiles,
    originTile: canteenTile,
    registerOn: (kernel: Kernel) => {
      kernel.registerSystem(navigation);
      prisoners.registerOn(kernel);
    },
  };
}
