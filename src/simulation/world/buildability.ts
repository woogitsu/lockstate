import type { TilePosition } from './coordinates';
import type { SparseWorld } from './sparse-world';

export interface BuildabilityRequirement {
  readonly requiresOwnedLand?: boolean;
  readonly requiresBuildableTerrain?: boolean;
  readonly requiresWalkableTerrain?: boolean;
  readonly allowWater?: boolean;
}

export interface BuildabilityResult {
  readonly buildable: boolean;
  readonly reason: 'ok' | 'unowned_land' | 'unbuildable_terrain' | 'water_blocked' | string;
}

export function canBuildAt(
  world: SparseWorld,
  tile: TilePosition,
  requirement: BuildabilityRequirement = {},
): BuildabilityResult {
  const requiresOwnedLand = requirement.requiresOwnedLand ?? true;
  const requiresBuildableTerrain = requirement.requiresBuildableTerrain ?? true;
  const requiresWalkableTerrain = requirement.requiresWalkableTerrain ?? false;
  const allowWater = requirement.allowWater ?? false;

  if (requiresOwnedLand && !world.isTileOwned(tile)) {
    return { buildable: false, reason: 'unowned_land' };
  }

  const terrain = world.getTerrain(tile);

  if (terrain.isWater && !allowWater) {
    return { buildable: false, reason: 'water_blocked' };
  }

  if (requiresBuildableTerrain && !terrain.buildable) {
    return { buildable: false, reason: 'unbuildable_terrain' };
  }

  if (requiresWalkableTerrain && !terrain.walkable) {
    return { buildable: false, reason: 'unbuildable_terrain' };
  }

  return { buildable: true, reason: 'ok' };
}
