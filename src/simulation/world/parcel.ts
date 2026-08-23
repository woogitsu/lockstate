import type { TileCoordinate, TilePosition } from './coordinates';
import { tileCoordinate } from './coordinates';

export interface ParcelRect {
  readonly x: TileCoordinate;
  readonly y: TileCoordinate;
  readonly width: number;
  readonly height: number;
}

export interface ParcelDefinition {
  readonly id: string;
  readonly bounds: ParcelRect;
  readonly basePrice: number;
  readonly name?: string;
}

export interface SerializedParcelDefinition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly basePrice: number;
  readonly name?: string;
}

export function createParcelRect(x: number, y: number, width: number, height: number): ParcelRect {
  if (!Number.isSafeInteger(width) || width <= 0) {
    throw new RangeError(`Parcel width must be a positive safe integer, received ${width}.`);
  }
  if (!Number.isSafeInteger(height) || height <= 0) {
    throw new RangeError(`Parcel height must be a positive safe integer, received ${height}.`);
  }

  return {
    x: tileCoordinate(x),
    y: tileCoordinate(y),
    width,
    height,
  };
}

/**
 * Containment by loose tile coordinates, for callers that hold the numbers but
 * no `TilePosition` object -- `isTileOwnedBy` runs this for every tile of every
 * repainted chunk, and allocating a position per tile there is exactly the
 * kind of cost `TileSample` exists to avoid. `rectContainsTile` is the same
 * test on a position, so there is still only one containment implementation.
 */
export function rectContainsTileXY(rect: ParcelRect, tileX: number, tileY: number): boolean {
  return (
    tileX >= rect.x &&
    tileX < rect.x + rect.width &&
    tileY >= rect.y &&
    tileY < rect.y + rect.height
  );
}

export function rectContainsTile(rect: ParcelRect, tile: TilePosition): boolean {
  return rectContainsTileXY(rect, tile.x, tile.y);
}

export function isTileInParcel(tile: TilePosition, parcel: ParcelDefinition): boolean {
  return rectContainsTile(parcel.bounds, tile);
}

export function rectsOverlap(a: ParcelRect, b: ParcelRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function doParcelsOverlap(left: ParcelDefinition, right: ParcelDefinition): boolean {
  return rectsOverlap(left.bounds, right.bounds);
}

/**
 * Checks if two parcels share an edge (or corner if touchCorners is true).
 */
export function areRectsAdjacent(a: ParcelRect, b: ParcelRect, touchCorners = false): boolean {
  const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
  const touchX = a.x === b.x + b.width || a.x + a.width === b.x;
  const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
  const touchY = a.y === b.y + b.height || a.y + a.height === b.y;

  if (touchCorners) {
    return (overlapX && touchY) || (overlapY && touchX) || (touchX && touchY);
  }

  return (overlapX && touchY) || (overlapY && touchX);
}

export function areParcelsAdjacent(
  left: ParcelDefinition,
  right: ParcelDefinition,
  touchCorners = false,
): boolean {
  return areRectsAdjacent(left.bounds, right.bounds, touchCorners);
}

export interface ParcelPurchaseEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
}

export type ParcelPurchaseEligibilityHook = (
  isOwned: (parcelId: string) => boolean,
  allParcels: readonly ParcelDefinition[],
  targetParcelId: string,
  context?: unknown,
) => ParcelPurchaseEligibility;

export type ParcelPricingHook = (
  isOwned: (parcelId: string) => boolean,
  allParcels: readonly ParcelDefinition[],
  targetParcelId: string,
  context?: unknown,
) => number;

export function isParcelAdjacentToAnyOwned(
  isOwned: (parcelId: string) => boolean,
  allParcels: readonly ParcelDefinition[],
  targetParcel: ParcelDefinition,
  touchCorners = false,
): boolean {
  for (const parcel of allParcels) {
    if (parcel.id !== targetParcel.id && isOwned(parcel.id)) {
      if (areParcelsAdjacent(targetParcel, parcel, touchCorners)) {
        return true;
      }
    }
  }
  return false;
}

export const defaultParcelEligibilityHook: ParcelPurchaseEligibilityHook = (
  isOwned,
  allParcels,
  targetParcelId,
) => {
  const targetParcel = allParcels.find((p) => p.id === targetParcelId);
  if (targetParcel === undefined) {
    return { eligible: false, reason: 'parcel_not_found' };
  }
  if (isOwned(targetParcelId)) {
    return { eligible: false, reason: 'already_owned' };
  }

  const hasAnyOwned = allParcels.some((p) => isOwned(p.id));
  if (!hasAnyOwned) {
    return { eligible: true };
  }

  if (isParcelAdjacentToAnyOwned(isOwned, allParcels, targetParcel)) {
    return { eligible: true };
  }

  return { eligible: false, reason: 'not_adjacent_to_owned_parcel' };
};

export const defaultParcelPricingHook: ParcelPricingHook = (
  _isOwned,
  allParcels,
  targetParcelId,
) => {
  const targetParcel = allParcels.find((p) => p.id === targetParcelId);
  if (targetParcel === undefined) {
    throw new RangeError(`Unknown parcel id: "${targetParcelId}".`);
  }
  return targetParcel.basePrice;
};
