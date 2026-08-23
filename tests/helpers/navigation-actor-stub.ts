import { EntityStore, type EntityId } from '../../src/simulation/entity/entity-store';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import type { TilePosition } from '../../src/simulation/world/coordinates';
import type { PathRequestPriority } from '../../src/simulation/navigation/path-request-queue';
import type { RouteContext } from '../../src/simulation/navigation/route-context';

export interface StubActor {
  readonly entityId: EntityId;
  readonly requestId: string;
  readonly origin: TilePosition;
  readonly destination: TilePosition;
  readonly context: RouteContext;
  readonly priority: PathRequestPriority;
}

export interface StubActorPopulationOptions {
  readonly count: number;
  readonly seed: number;
  readonly originTiles: readonly TilePosition[];
  readonly destinationTiles: readonly TilePosition[];
  /** All actors share this exact destination (e.g. a meal-rush converging on the canteen) instead of drawing one per actor from `destinationTiles`. */
  readonly sharedDestination?: TilePosition;
}

/**
 * Minimal synthetic actors for issue #22's work-budget/flow-field/benchmark
 * scenarios: an `EntityStore`-backed id plus a position/destination/
 * `RouteContext`, nothing else. Deliberately not a gameplay model --
 * prisoner/staff identity, classification and behavior belong to #23/#24's
 * real entity/component catalogs. This exists only to drive
 * `NavigationSystem` at representative scale before those exist, per the
 * "minimal stub actors" scope agreed for #22.
 */
export function spawnStubActorPopulation(store: EntityStore, options: StubActorPopulationOptions): readonly StubActor[] {
  if (options.originTiles.length === 0) throw new RangeError('originTiles must be non-empty.');
  if (options.sharedDestination === undefined && options.destinationTiles.length === 0) {
    throw new RangeError('destinationTiles must be non-empty when sharedDestination is not set.');
  }

  const rng = new Xoshiro128StarStar(deriveXoshiroState(options.seed, 'navigation.stub-actors').words);
  const actors: StubActor[] = [];

  for (let i = 0; i < options.count; i += 1) {
    const entityId = store.spawn();
    const origin = options.originTiles[rng.nextInt(options.originTiles.length)]!;
    const destination = options.sharedDestination ?? options.destinationTiles[rng.nextInt(options.destinationTiles.length)]!;
    const securityClearance = rng.nextInt(6);
    const hasMedicalPermission = rng.nextInt(5) === 0;
    const context: RouteContext = {
      role: 'stub-actor',
      securityClearance,
      ...(hasMedicalPermission ? { permissions: ['medical-wing'] } : {}),
    };
    const priority = rng.nextInt(3);

    actors.push({ entityId, requestId: String(entityId), origin, destination, context, priority });
  }

  return actors;
}
