import { describe, expect, it } from 'vitest';
import {
  objectFootprintTiles,
  orientedFootprint,
  placedObjectAt,
  placedObjectIdFor,
  PlacedObjectRegistry,
} from '../../src/simulation/objects';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';

/**
 * The registry [ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 1 chose over an entity, a tile plane and a record on the room.
 *
 * What this file pins is the half of that decision a document cannot: that the
 * rows are **individuated** (two beds are two beds, and a bed's second tile
 * knows which bed it belongs to), which is exactly what a `Uint8Array` plane
 * could not express, and that every enumeration is in tile order rather than in
 * id order -- the trap the ADR names, because the id is a string over two
 * decimal integers and code-unit order puts `object:10:2` before `object:9:2`.
 */

const TILE = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

describe('a placed object is addressed by its anchor tile', () => {
  it('derives its id from the tile and nothing else', () => {
    expect(placedObjectIdFor(TILE(4, 6))).toBe('object:4:6');
    // Reproducible: two registries built in different orders give the same id
    // for the same tile, because there is no counter to be at a different
    // value. That is the ADR 0012 property `roomInstanceIdFor` has, on the same
    // condition -- the anchor cannot change while the object exists.
    expect(placedObjectIdFor(TILE(4, 6))).toBe(placedObjectIdFor(TILE(4, 6)));
    expect(placedObjectIdFor(TILE(6, 4))).not.toBe(placedObjectIdFor(TILE(4, 6)));
  });

  it('claims every tile of the footprint, not only the anchor', () => {
    const registry = new PlacedObjectRegistry();
    // `object.bed` is 1x2, so the tile below the anchor is claimed too.
    expect(registry.place(placedObjectAt('object.bed', TILE(2, 2), 0))).toBe(true);

    expect(registry.objectAt(TILE(2, 2))?.placedObjectId).toBe('object:2:2');
    expect(registry.objectAt(TILE(2, 3))?.placedObjectId).toBe('object:2:2');
    expect(registry.isTileOccupied(TILE(2, 3))).toBe(true);
    // **The thing a tile plane could not say.** Both tiles answer with the
    // *same* object, so "how many beds are in this room" is answerable; a plane
    // holding one number per tile would have two tiles each saying "bed" with
    // nothing saying they are one bed.
    expect(registry.objectAt(TILE(2, 2))).toBe(registry.objectAt(TILE(2, 3)));
    expect(registry.size).toBe(1);
    // And the tile past the end is free.
    expect(registry.isTileOccupied(TILE(2, 4))).toBe(false);
  });

  it('refuses an overlap without writing half of it', () => {
    const registry = new PlacedObjectRegistry();
    registry.place(placedObjectAt('object.bed', TILE(2, 2), 0));

    // Anchored on the *second* tile of the standing bed. A three-tile object
    // would have written one tile before discovering the clash if the check ran
    // inside the write loop, which is the discipline `zone` follows for a
    // rectangle and for the same reason.
    expect(registry.place(placedObjectAt('object.dining-table', TILE(2, 3), 0))).toBe(false);
    expect(registry.size).toBe(1);
    expect(registry.isTileOccupied(TILE(3, 3)), 'no tile of the refused footprint may be claimed').toBe(false);
    expect(registry.isTileOccupied(TILE(4, 4))).toBe(false);
  });

  it('refuses an object the catalogue does not declare, and a second object on one anchor', () => {
    const registry = new PlacedObjectRegistry();
    expect(registry.place(placedObjectAt('object.not-a-thing', TILE(1, 1), 0))).toBe(false);
    expect(registry.size).toBe(0);

    expect(registry.place(placedObjectAt('object.toilet', TILE(1, 1), 0))).toBe(true);
    expect(registry.place(placedObjectAt('object.toilet', TILE(1, 1), 0))).toBe(false);
    expect(registry.size).toBe(1);
  });

  it('releases every claimed tile on removal, and only the removed one', () => {
    const registry = new PlacedObjectRegistry();
    registry.place(placedObjectAt('object.bed', TILE(2, 2), 0));
    registry.place(placedObjectAt('object.toilet', TILE(3, 2), 0));

    expect(registry.remove('object:2:2')).toBe(true);

    expect(registry.isTileOccupied(TILE(2, 2))).toBe(false);
    expect(registry.isTileOccupied(TILE(2, 3)), 'the far tile of the footprint too').toBe(false);
    expect(registry.isTileOccupied(TILE(3, 2)), 'and the neighbour is untouched').toBe(true);
    expect(registry.remove('object:2:2'), 'removing twice answers false rather than throwing').toBe(false);
    // The tile is free for a new object, which is what makes a removed id
    // simply stop existing rather than becoming a hole.
    expect(registry.place(placedObjectAt('object.bed', TILE(2, 2), 0))).toBe(true);
  });
});

describe('every enumeration is in tile order', () => {
  it('sorts by (y, x) and never by placedObjectId', () => {
    const registry = new PlacedObjectRegistry();
    // The trap, chosen deliberately: `object:10:2` sorts *before* `object:9:2`
    // by code unit, and after it by tile. Inserted in a third order again, so a
    // registry that emitted insertion order would fail this too.
    for (const tile of [TILE(9, 2), TILE(1, 5), TILE(10, 2)]) {
      registry.place(placedObjectAt('object.toilet', tile, 0));
    }

    expect(registry.all().map((object) => object.placedObjectId)).toEqual(['object:9:2', 'object:10:2', 'object:1:5']);
    // Which is *not* the code-unit order of the same three ids, so this is a
    // real distinction rather than a coincidence of the fixture.
    expect(registry.all().map((object) => object.placedObjectId)).not.toEqual(
      [...registry.all().map((object) => object.placedObjectId)].sort(),
    );
  });

  it('answers a rectangle by anchor containment, so an object half outside a room still belongs to it once', () => {
    const registry = new PlacedObjectRegistry();
    // Anchored on the last row of the rectangle, so its second tile is outside.
    registry.place(placedObjectAt('object.bed', TILE(4, 8), 0));
    registry.place(placedObjectAt('object.toilet', TILE(9, 9), 0));

    const inside = registry.inRect({ x: 4, y: 6, width: 2, height: 3 });
    expect(inside.map((object) => object.placedObjectId)).toEqual(['object:4:8']);
    expect(registry.inRect({ x: 0, y: 0, width: 2, height: 2 })).toEqual([]);
  });

  it('round-trips through a snapshot, re-deriving every id from its tile', () => {
    const registry = new PlacedObjectRegistry();
    registry.place(placedObjectAt('object.bed', TILE(4, 6), 0));
    registry.place(placedObjectAt('object.toilet', TILE(5, 6), 0));

    const snapshot = registry.getSnapshot();
    expect(snapshot).toEqual([
      { placedObjectId: 'object:4:6', objectId: 'object.bed', anchorTile: { x: 4, y: 6 }, orientation: 0 },
      { placedObjectId: 'object:5:6', objectId: 'object.toilet', anchorTile: { x: 5, y: 6 }, orientation: 0 },
    ]);

    const restored = new PlacedObjectRegistry();
    // Handed to the restore in the *wrong* order, and with an id that disagrees
    // with its tile -- the shape a hand-edited save has. Both are corrected: the
    // rows come back in tile order and the id is re-derived, so the restore path
    // cannot be talked into an id the live path could not have produced.
    expect(
      restored.loadSnapshot([
        { placedObjectId: 'nonsense', objectId: 'object.toilet', anchorTile: TILE(5, 6), orientation: 0 },
        { placedObjectId: 'object:4:6', objectId: 'object.bed', anchorTile: TILE(4, 6), orientation: 0 },
      ]),
    ).toBe(2);
    expect(restored.getSnapshot()).toEqual(snapshot);
  });

  it('drops a row naming an object this build no longer declares, rather than failing the load', () => {
    const registry = new PlacedObjectRegistry();
    expect(
      registry.loadSnapshot([
        { placedObjectId: 'object:1:1', objectId: 'object.bed', anchorTile: TILE(1, 1), orientation: 0 },
        { placedObjectId: 'object:2:1', objectId: 'object.deleted-in-a-later-build', anchorTile: TILE(2, 1), orientation: 0 },
      ]),
    ).toBe(1);
    expect(registry.size).toBe(1);
    expect(registry.objectAt(TILE(1, 1))).toBeDefined();
  });

  it('chooses the same object and orientation when saved rows conflict at one anchor', () => {
    const anchor = TILE(3, 4);
    const bed = placedObjectAt('object.bed', anchor, 1);
    const toilet = placedObjectAt('object.toilet', anchor, 0);
    const bedOtherOrientation = placedObjectAt('object.bed', anchor, 2);
    const rows = [toilet, bedOtherOrientation, bed];
    const winners = [rows, [...rows].reverse()].map((order) => {
      const registry = new PlacedObjectRegistry();
      expect(registry.loadSnapshot(order)).toBe(1);
      return registry.getSnapshot();
    });

    expect(winners[0]).toEqual(winners[1]);
    expect(winners[0]).toEqual([bed]);
  });
});

describe('the footprint an orientation produces', () => {
  it('swaps the sides on a quarter turn and leaves them on a half turn', () => {
    const bed = { width: 1, height: 2 };
    expect(orientedFootprint(bed, 0)).toEqual({ width: 1, height: 2 });
    expect(orientedFootprint(bed, 1)).toEqual({ width: 2, height: 1 });
    expect(orientedFootprint(bed, 2)).toEqual({ width: 1, height: 2 });
    expect(orientedFootprint(bed, 3)).toEqual({ width: 2, height: 1 });
  });

  it('walks the tiles in ascending y then x, from the anchor as the top-left corner', () => {
    const table = defaultObjectRegistry.getById('object.dining-table');
    if (table === undefined) throw new Error('the catalogue must declare a dining table for this test to mean anything');

    // 3x2 authored, so six tiles growing right and down -- the same convention
    // `ZoneRoomRequest` uses, which is why a footprint and a room rectangle can
    // be compared without either side translating.
    expect(objectFootprintTiles(table, TILE(1, 1), 0)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
    // Rotated a quarter turn, the same six tiles transposed.
    expect(objectFootprintTiles(table, TILE(1, 1), 1)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]);
  });

  it('reserves the rotated extent, so a rotated bed blocks a different second tile', () => {
    const registry = new PlacedObjectRegistry();
    registry.place(placedObjectAt('object.bed', TILE(2, 2), 1));

    // Turned on its side: the claimed pair is (2,2) and (3,2) rather than
    // (2,2) and (2,3).
    expect(registry.isTileOccupied(TILE(3, 2))).toBe(true);
    expect(registry.isTileOccupied(TILE(2, 3))).toBe(false);
  });
});
