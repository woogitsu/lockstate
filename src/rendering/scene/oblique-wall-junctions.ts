import type { ObliqueActorPoint, ObliqueSolid } from '../camera/oblique-world-projection';
import { TILE_SIZE_PX } from '../tile-metrics';

export interface ObliqueWallJunction {
  readonly assetId: string;
  readonly groundAnchor: { readonly x: number; readonly y: number };
  readonly incident: readonly ObliqueSolid[];
}

/** Select visual replacements for logical edges; never changes the world grid. */
export function selectObliqueWallJunctions(
  raised: readonly (ObliqueSolid | ObliqueActorPoint)[],
  hasFrame: (assetId: string) => boolean,
  cutsAway: (edge: ObliqueSolid) => boolean,
): { readonly placements: readonly ObliqueWallJunction[]; readonly consumedIds: ReadonlySet<string> } {
  const edges = new Map<string, ObliqueSolid>();
  for (const item of raised) {
    if (item.kind !== 'actor' && item.artAssetId?.startsWith('wall.interior.module.') &&
        (item.kind === 'north-edge' || item.kind === 'west-edge')) edges.set(item.id, item);
  }
  const consumedIds = new Set<string>();
  const placements: ObliqueWallJunction[] = [];
  const choose = (asset: string, incident: readonly ObliqueSolid[], cx: number, cy: number): boolean => {
    const variant = incident.some(cutsAway) ? 'cutaway' : 'full';
    const assetId = `${asset}.${variant}`;
    if (!hasFrame(assetId)) return false;
    placements.push({ assetId, incident, groundAnchor: {
      x: (cx + 0.11) * TILE_SIZE_PX,
      y: (cy + 0.11) * TILE_SIZE_PX,
    } });
    for (const edge of incident) consumedIds.add(edge.id);
    return true;
  };
  for (const north of edges.values()) {
    if (north.kind !== 'north-edge' || consumedIds.has(north.id)) continue;
    const cx = north.tileX + 1;
    const cy = north.tileY;
    const south = edges.get(`west-edge:${cx}:${cy}`);
    const northWest = edges.get(`west-edge:${cx}:${cy - 1}`);
    if (south !== undefined && northWest !== undefined &&
        !consumedIds.has(south.id) && !consumedIds.has(northWest.id) &&
        choose('wall.interior.junction.t.west', [north, northWest, south], cx, cy)) continue;
    if (south !== undefined && !consumedIds.has(south.id) &&
        choose('wall.interior.corner.inner.north-east', [north, south], cx, cy)) continue;
    if (northWest !== undefined && !consumedIds.has(northWest.id)) {
      choose('wall.interior.corner.inner.south-east', [north, northWest], cx, cy);
    }
  }
  return { placements, consumedIds };
}
