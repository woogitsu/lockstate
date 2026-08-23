import { describe, expect, it } from 'vitest';
import {
  areParcelsAdjacent,
  createParcelRect,
  defaultParcelEligibilityHook,
  defaultParcelPricingHook,
  doParcelsOverlap,
  isTileInParcel,
  rectContainsTileXY,
  tileCoordinate,
} from '../../src/simulation/world';

describe('parcel geometry and adjacency', () => {
  it('correctly tests tile containment within parcel bounds (including negative coordinates)', () => {
    const parcel = {
      id: 'center',
      bounds: createParcelRect(-10, -10, 20, 20),
      basePrice: 5000,
    };

    expect(isTileInParcel({ x: tileCoordinate(-10), y: tileCoordinate(-10) }, parcel)).toBe(true);
    expect(isTileInParcel({ x: tileCoordinate(0), y: tileCoordinate(0) }, parcel)).toBe(true);
    expect(isTileInParcel({ x: tileCoordinate(9), y: tileCoordinate(9) }, parcel)).toBe(true);
    expect(isTileInParcel({ x: tileCoordinate(10), y: tileCoordinate(10) }, parcel)).toBe(false);
    expect(isTileInParcel({ x: tileCoordinate(-11), y: tileCoordinate(0) }, parcel)).toBe(false);
  });

  /**
   * Each of the four bounds, moved one tile at a time. The assertions above
   * only ever step off a *corner* -- (10,10) for a parcel ending at 9 -- and a
   * corner is outside as soon as either axis is, so relaxing one axis's upper
   * bound to `<=` leaves them all passing. That mutation survived the whole
   * suite before this test existed, which matters more since issue #93 gave
   * `rectContainsTileXY` two callers: `isTileInParcel`, and `isTileOwnedBy`,
   * the one definition of tile ownership.
   */
  it('excludes each parcel edge independently, not only the corner past both', () => {
    const bounds = createParcelRect(-3, 5, 4, 6);
    // x spans -3..0 inclusive, y spans 5..10 inclusive.
    const inside = (x: number, y: number): boolean => rectContainsTileXY(bounds, x, y);

    expect(inside(-3, 5)).toBe(true);
    expect(inside(0, 10)).toBe(true);

    expect(inside(-4, 7), 'one tile left of the parcel').toBe(false);
    expect(inside(1, 7), 'one tile right of the parcel').toBe(false);
    expect(inside(-1, 4), 'one tile above the parcel').toBe(false);
    expect(inside(-1, 11), 'one tile below the parcel').toBe(false);

    // `isTileInParcel` is the same test through a `TilePosition`, so it must
    // exclude the same four edges.
    const parcel = { id: 'edge', bounds, basePrice: 1 };
    expect(isTileInParcel({ x: tileCoordinate(1), y: tileCoordinate(7) }, parcel)).toBe(false);
    expect(isTileInParcel({ x: tileCoordinate(-1), y: tileCoordinate(11) }, parcel)).toBe(false);
  });

  it('detects parcel overlaps', () => {
    const a = { id: 'a', bounds: createParcelRect(0, 0, 10, 10), basePrice: 1000 };
    const b = { id: 'b', bounds: createParcelRect(5, 5, 10, 10), basePrice: 1000 };
    const c = { id: 'c', bounds: createParcelRect(10, 0, 10, 10), basePrice: 1000 };

    expect(doParcelsOverlap(a, b)).toBe(true);
    expect(doParcelsOverlap(a, c)).toBe(false);
  });

  it('detects edge and corner adjacency correctly', () => {
    const origin = { id: 'origin', bounds: createParcelRect(0, 0, 10, 10), basePrice: 1000 };
    const east = { id: 'east', bounds: createParcelRect(10, 0, 10, 10), basePrice: 1000 };
    const northEastCorner = { id: 'ne', bounds: createParcelRect(10, 10, 10, 10), basePrice: 1000 };
    const far = { id: 'far', bounds: createParcelRect(30, 30, 10, 10), basePrice: 1000 };

    expect(areParcelsAdjacent(origin, east)).toBe(true);
    expect(areParcelsAdjacent(origin, northEastCorner, false)).toBe(false);
    expect(areParcelsAdjacent(origin, northEastCorner, true)).toBe(true);
    expect(areParcelsAdjacent(origin, far, true)).toBe(false);
  });

  it('computes purchase eligibility and pricing hooks without hardcoding UI logic', () => {
    const p1 = { id: 'p1', bounds: createParcelRect(0, 0, 10, 10), basePrice: 1000 };
    const p2 = { id: 'p2', bounds: createParcelRect(10, 0, 10, 10), basePrice: 2500 };
    const p3 = { id: 'p3', bounds: createParcelRect(50, 50, 10, 10), basePrice: 10000 };
    const all = [p1, p2, p3];

    // Initial state: nothing owned -> p1 or any parcel is eligible as starting land
    const owned = new Set<string>();
    const isOwned = (id: string) => owned.has(id);

    expect(defaultParcelEligibilityHook(isOwned, all, 'p1')).toEqual({ eligible: true });
    expect(defaultParcelPricingHook(isOwned, all, 'p1')).toBe(1000);

    // After p1 is owned:
    owned.add('p1');
    expect(defaultParcelEligibilityHook(isOwned, all, 'p1')).toEqual({
      eligible: false,
      reason: 'already_owned',
    });
    // p2 is adjacent to p1 -> eligible
    expect(defaultParcelEligibilityHook(isOwned, all, 'p2')).toEqual({ eligible: true });
    // p3 is far away -> not adjacent
    expect(defaultParcelEligibilityHook(isOwned, all, 'p3')).toEqual({
      eligible: false,
      reason: 'not_adjacent_to_owned_parcel',
    });
  });
});
