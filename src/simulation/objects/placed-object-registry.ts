import { defaultObjectRegistry, type ObjectDefinition } from '../../content/object-catalog';
import type { ContentRegistry } from '../../content/registry';
import type { TilePosition } from '../world/coordinates';
import {
  objectFootprintTiles,
  placedObjectIdFor,
  tileKey,
  type ObjectOrientation,
  type PlacedObject,
} from './placed-object';

/**
 * Every object standing in the prison, and which tile each of them covers.
 *
 * A **registry beside the world**, per
 * [ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 1, rather than an entity, a fifth world plane or a record on the
 * room. `DoorRegistry` (`../navigation/door.ts`) is the precedent in this tree
 * -- a registry beside the world for a thing that occupies space and is not an
 * entity -- and `session-systems.ts` already persists both it and the
 * room-instance definitions the same way.
 *
 * The three rejections and their save consequences are argued in full in that
 * ADR and are not re-argued here. What matters at this class is the shape they
 * produced: a sorted map whose snapshot is its rows, and whose reversal is
 * deleting one optional payload section.
 *
 * ## Two structures, one invariant
 *
 * `objects` holds one row per object, keyed by its derived id. `tileIndex`
 * holds one entry per tile of every footprint, pointing back at that id. They
 * are maintained together by `place` and `remove` and by nothing else, so
 * "which object is on this tile" and "which tiles does this object cover" are
 * both answerable in one lookup -- the second being the thing an objects
 * *plane* could answer and the first being the thing it could not.
 *
 * The invariant is that `tileIndex` covers exactly the union of every row's
 * footprint. `place` refuses rather than half-writing when any tile is taken,
 * which is the same discipline `RoomZoningService.zone` follows for a
 * rectangle and for the same reason: a half-claimed footprint is a state
 * nothing can repair.
 *
 * ## Determinism
 *
 * Every enumeration is sorted by `(anchorTile.y, anchorTile.x)` and **never by
 * `placedObjectId`**. That is worth naming because the id looks sortable and
 * is not: it is a string over two decimal integers, so code-unit order puts
 * `object:10:2` before `object:9:2`. `docs/DETERMINISM.md`'s canonical-order
 * rule is satisfied by the tile order, which is a total order derived from
 * state -- two objects cannot share an anchor tile.
 */
export class PlacedObjectRegistry {
  private readonly objects = new Map<string, PlacedObject>();
  /** Tile key -> `placedObjectId`, one entry per tile of every footprint. */
  private readonly tileIndex = new Map<string, string>();

  public constructor(private readonly catalogue: ContentRegistry<ObjectDefinition> = defaultObjectRegistry) {}

  /**
   * The definition an object id names, or `undefined` for an id the catalogue
   * does not declare.
   *
   * Exposed because every consumer of a row needs it -- capacity, the
   * footprint, the renderer -- and none of them should reach for a second
   * registry to get it.
   */
  public definitionOf(objectId: string): ObjectDefinition | undefined {
    return this.catalogue.getById(objectId);
  }

  /**
   * Places an object, or answers `false` without writing anything.
   *
   * `false` for three reasons: the object id is not in the catalogue, some
   * tile of the footprint is already covered, or an object already exists at
   * this anchor. All three are refusals rather than throws, because the two
   * callers are a completed build order inside a scheduled system update and a
   * restore -- and a throw out of `ConstructionSystem.update` faults the
   * worker.
   *
   * The command boundary (`ObjectPlacementService.place`) checks the same
   * conditions *before* an order is submitted, against placed objects and
   * against the footprints of orders still in flight, so a `false` here means
   * the world changed between the order being accepted and it finishing.
   * **That is reachable and the path is known**: `Undo` cancels a pending
   * order and frees its claim, a second order takes the tile, and `Redo`
   * returns the first to `'approved'`. The first then completes with nowhere
   * to stand, and answering `false` leaves the second object alone -- which is
   * the outcome that keeps the tile index and the rows agreeing.
   */
  public place(object: PlacedObject): boolean {
    const definition = this.catalogue.getById(object.objectId);
    if (definition === undefined) return false;
    if (this.objects.has(object.placedObjectId)) return false;

    const tiles = objectFootprintTiles(definition, object.anchorTile, object.orientation);
    for (const tile of tiles) {
      if (this.tileIndex.has(tileKey(tile))) return false;
    }

    this.objects.set(object.placedObjectId, object);
    for (const tile of tiles) this.tileIndex.set(tileKey(tile), object.placedObjectId);
    return true;
  }

  /**
   * Removes an object by id, or answers `false` when there was none.
   *
   * Phase 1 ships no `RemoveObject` command; this exists because `Undo` and
   * `ConstructionSystem.cancelOrder` already reverse a *completed* order's
   * world geometry, and an object placement that could not be reversed would
   * make the first bed a player misplaces permanent while a misplaced wall is
   * not. `revertConstruction` is the caller.
   *
   * Every tile the footprint claimed is released, derived from the definition
   * the same way `place` derived it -- so a catalogue whose footprint changed
   * between two builds would leak index entries, which is why
   * `ObjectDefinition` is content that ships with the build rather than
   * something a save carries.
   */
  public remove(placedObjectId: string): boolean {
    const object = this.objects.get(placedObjectId);
    if (object === undefined) return false;
    const definition = this.catalogue.getById(object.objectId);
    this.objects.delete(placedObjectId);
    if (definition === undefined) {
      // Unreachable through `place`, which refuses an unknown id. Handled
      // rather than asserted because the alternative is leaving every tile of
      // this row's footprint claimed for the rest of the session.
      //
      // The keys are sorted before the sweep even though the *set* of
      // deletions cannot depend on their order: `docs/DETERMINISM.md`'s rule is
      // about the enumeration and not about this branch's outcome, and taking
      // an allow-list exemption for a path this rare would put a reason in a
      // gate that a one-line sort makes unnecessary.
      for (const key of [...this.tileIndex.keys()].sort()) {
        if (this.tileIndex.get(key) === placedObjectId) this.tileIndex.delete(key);
      }
      return true;
    }
    for (const tile of objectFootprintTiles(definition, object.anchorTile, object.orientation)) {
      const key = tileKey(tile);
      if (this.tileIndex.get(key) === placedObjectId) this.tileIndex.delete(key);
    }
    return true;
  }

  public getById(placedObjectId: string): PlacedObject | undefined {
    return this.objects.get(placedObjectId);
  }

  /** The object covering `tile` -- any tile of its footprint, not only its anchor. */
  public objectAt(tile: TilePosition): PlacedObject | undefined {
    const id = this.tileIndex.get(tileKey(tile));
    return id === undefined ? undefined : this.objects.get(id);
  }

  /** Whether any footprint covers `tile`. The question `place` and the command boundary both ask. */
  public isTileOccupied(tile: TilePosition): boolean {
    return this.tileIndex.has(tileKey(tile));
  }

  public get size(): number {
    return this.objects.size;
  }

  /**
   * Every object, ascending `(anchorTile.y, anchorTile.x)`.
   *
   * Sorted on demand rather than kept sorted: the collection changes only when
   * an object is built or reverted -- a bed placed on tick 400 is
   * byte-identical on tick 400,000 -- and every reader is either a save, a
   * projection or an event-driven resolver. None of them is per-tick, which is
   * the property that makes this the cheap end of the trade `PlacedObject`
   * chose over an entity store's per-tick iteration cost.
   */
  public all(): readonly PlacedObject[] {
    return [...this.objects.values()].sort((a, b) => a.anchorTile.y - b.anchorTile.y || a.anchorTile.x - b.anchorTile.x);
  }

  /**
   * Every object whose **anchor tile** lies inside the inclusive rectangle,
   * in the same canonical order `all()` uses.
   *
   * The anchor and not the footprint, which is the containment rule ADR 0028
   * decision 2 states: an object belongs to the room whose rectangle contains
   * its anchor. A bed whose second tile pokes out of a cell still belongs to
   * that cell, and belongs to it *once*.
   */
  public inRect(bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }): readonly PlacedObject[] {
    const maxX = bounds.x + bounds.width - 1;
    const maxY = bounds.y + bounds.height - 1;
    return this.all().filter(
      (object) =>
        object.anchorTile.x >= bounds.x &&
        object.anchorTile.x <= maxX &&
        object.anchorTile.y >= bounds.y &&
        object.anchorTile.y <= maxY,
    );
  }

  /**
   * The rows, in canonical order, for the save's optional objects section.
   *
   * `all()`'s order and not insertion order, because a walk that feeds a
   * payload puts insertion history into the save and `computeSaveChecksum`
   * hashes array order (`tests/determinism/canonical-iteration-contract.test.ts`).
   */
  public getSnapshot(): readonly PlacedObject[] {
    return this.all().map((object) => ({ ...object, anchorTile: { ...object.anchorTile } }));
  }

  /**
   * Replaces the whole collection from a snapshot.
   *
   * Rows a restore cannot place are **dropped rather than thrown on**: a save
   * is a file the player's browser produced, and an object naming a catalogue
   * id this build no longer declares must not make the prison unloadable. The
   * count is returned so the caller can say how many rows were understood; no
   * caller in `src/` reads it today and a test does.
   */
  public loadSnapshot(snapshot: readonly PlacedObject[]): number {
    this.objects.clear();
    this.tileIndex.clear();
    let placed = 0;
    // The schema permits conflicting rows at one anchor. Use object id and
    // orientation to break that tie, so array order cannot decide which row
    // survives the overlap refusal in `place`.
    const ordered = [...snapshot].sort((a, b) =>
      a.anchorTile.y - b.anchorTile.y
      || a.anchorTile.x - b.anchorTile.x
      || (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0)
      || a.orientation - b.orientation,
    );
    for (const object of ordered) {
      if (this.place({ ...object, placedObjectId: placedObjectIdFor(object.anchorTile) })) placed += 1;
    }
    return placed;
  }
}

/** The row `place` takes, built from the parts a caller actually has. */
export function placedObjectAt(
  objectId: string,
  anchorTile: TilePosition,
  orientation: ObjectOrientation,
): PlacedObject {
  return { placedObjectId: placedObjectIdFor(anchorTile), objectId, anchorTile, orientation };
}
