import type { ObjectDefinition } from '../../content/object-catalog';
import { tileCoordinate, type TilePosition } from '../world/coordinates';

/**
 * What a placed object is, per
 * [ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 1.
 *
 * Four fields and nothing else. In particular **no capacity and no
 * capability**: those are looked up in `src/content/object-catalog.ts` from
 * `objectId`, exactly as `RoomZoningService.zone` looks a room definition up
 * by `roomCatalogId` instead of copying its fields onto the instance. A
 * placement that copied `footprint` or `capabilities` onto the row would let a
 * save disagree with the catalogue that produced it, and the catalogue is
 * content that ships with the build.
 *
 * **Room membership is not here, and that is the decision rather than an
 * omission.** An object belongs to the room instance whose rectangle contains
 * its anchor tile, computed on demand by `roomInstanceContaining`
 * (`./room-capacity.ts`). `zone` writes only axis-aligned rectangles and
 * refuses `overlaps-existing-room`, so rectangles never overlap and an object
 * is in exactly zero or one room -- which is a property of `zone` rather than
 * a rule anyone has to remember, and it is why storing the room id would be
 * storing a derived value that a later un-zoning could falsify.
 */
export interface PlacedObject {
  /** `object:<x>:<y>` over the anchor tile. See `placedObjectIdFor`. */
  readonly placedObjectId: string;
  /** A stable id from `src/content/object-catalog.ts`. */
  readonly objectId: string;
  readonly anchorTile: TilePosition;
  readonly orientation: ObjectOrientation;
}

/**
 * Quarter turns clockwise from the footprint as content authored it.
 *
 * **Nothing in `src/` produces anything but `0` today, and that is stated
 * rather than hidden.** The gesture that places an object is one press on one
 * tile (ADR 0028 decision 5) and the rotate half of that decision -- "a key
 * press while armed, remappable per `docs/INPUT.md`" -- needs an entry in
 * `ACTION_IDS`, a default binding, a description key and a branch in
 * `WorldScene.handleActionEvents`, none of which phase 1 ships. So the field
 * exists because it is the persisted shape decision 1 fixes, and because
 * `orientedFootprint` below reads it; the *producer* is owed.
 *
 * It is carried in the save at full range (`0..3`) so that adding the rotate
 * control later is a change to the producer and the scene alone, with no
 * save-format move -- which is the whole reason to declare it now rather than
 * when something can write it.
 */
export type ObjectOrientation = 0 | 1 | 2 | 3;

/** True for the four values `ObjectOrientation` admits. */
export function isObjectOrientation(value: number): value is ObjectOrientation {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/**
 * The id an object placed at `anchor` gets.
 *
 * `roomInstanceIdFor`'s scheme deliberately (`src/simulation/rooms/zoning.ts`):
 * a pure function of the anchor tile, never a counter and never
 * `crypto.randomUUID()`. It is unique because the tile index refuses a
 * placement on any tile a footprint already covers, so the anchor was free a
 * moment earlier and is occupied afterwards.
 *
 * It omits the catalogue id, unlike a room instance id, because a tile holds
 * at most one object -- so the tile alone is unique, and "the object at this
 * tile" is what every lookup wants.
 *
 * This is neutral on
 * [ADR 0012](../../../docs/adr/0012-derived-identifier-reproducibility.md) on
 * the same condition `zoning.ts` is neutral on it: the id is reproducible from
 * state like a derived value and carried in the save like an allocated
 * identity, because the state it derives from cannot change while the object
 * exists. **A feature that *moves* an object must settle ADR 0012 first.**
 * Removal is safe -- a removed object's id simply stops existing.
 *
 * Exported because a test asserting reproducibility must not restate the
 * format.
 */
export function placedObjectIdFor(anchor: TilePosition): string {
  return `object:${anchor.x}:${anchor.y}`;
}

export interface ObjectFootprint {
  readonly width: number;
  readonly height: number;
}

/**
 * The footprint as the world sees it, with the orientation applied.
 *
 * A quarter turn swaps the two sides; a half turn leaves them as authored. So
 * `1` and `3` swap and `0` and `2` do not, which is why this is a parity check
 * rather than a table.
 *
 * **This is not what capacity reads.** `deriveRoomCapacity` uses the
 * definition's own `footprint.width`, never the rotated extent, because
 * capacity is a property of the object type and not of how the player turned
 * it (ADR 0028 decision 2). What the rotated extent decides is which tiles the
 * index reserves and what the preview draws.
 */
export function orientedFootprint(footprint: ObjectFootprint, orientation: ObjectOrientation): ObjectFootprint {
  return orientation % 2 === 0
    ? { width: footprint.width, height: footprint.height }
    : { width: footprint.height, height: footprint.width };
}

/**
 * Every tile a placement covers, in ascending `y` then `x`.
 *
 * The same canonical order `zone` walks a rectangle in, for the same reason it
 * gives: so the tile a refusal names is a function of the request rather than
 * of the order this loop happens to be written in.
 *
 * The anchor is the rectangle's top-left corner and the footprint grows right
 * and down from it. That is the same convention `ZoneRoomRequest` uses for a
 * room (`x`/`y` are the left and top edges), so a footprint and a room
 * rectangle are compared without either side having to translate.
 */
export function objectFootprintTiles(
  definition: ObjectDefinition,
  anchor: TilePosition,
  orientation: ObjectOrientation,
): readonly TilePosition[] {
  const footprint = orientedFootprint(definition.footprint, orientation);
  const tiles: TilePosition[] = [];
  for (let offsetY = 0; offsetY < footprint.height; offsetY += 1) {
    for (let offsetX = 0; offsetX < footprint.width; offsetX += 1) {
      tiles.push({ x: tileCoordinate(anchor.x + offsetX), y: tileCoordinate(anchor.y + offsetY) });
    }
  }
  return tiles;
}

/** The key the tile index and every other tile-keyed map in this module use. */
export function tileKey(tile: TilePosition): string {
  return `${tile.x},${tile.y}`;
}
