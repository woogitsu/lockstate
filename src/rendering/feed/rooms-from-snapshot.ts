import type { EncodedSessionSystems } from '../../simulation/runtime/session-systems';
import type { RenderRoom } from './render-feed';

/**
 * The renderer's view of the room rectangles a session snapshot carries.
 *
 * ## Which section, and why not a new one
 *
 * [ADR 0111](../../../docs/adr/0111-how-a-room-instances-rectangle-reaches-the-render-side.md)
 * decision 1 sends the rectangle down the **geometry pull** rather than the
 * HUD projection, and its option A is *"room-instance rows -- id, anchor,
 * width, height -- added to the `SessionSnapshotBundle` the geometry pull
 * already carries, read by `WorldRenderView` (or a sibling view) and surfaced
 * on `RenderFrame`"*.
 *
 * **Those rows are already in the bundle**, and finding them there is the one
 * place this implementation departs from the option's own wording. Every
 * `simulation/snapshot` is a `captureSessionSnapshot`, and
 * `session-systems.ts`'s `roomInstanceDefinitions` writes exactly `instanceId`,
 * `roomCatalogId`, `anchorTile` and the optional `width`/`height` into
 * `simulation.prisoners.roomInstanceDefinitions`, because a save is the only
 * thing that re-establishes a room instance on restore. So the transport
 * ADR 0111 priced at *"bytes on a JSON walk already being paid, of unknown
 * magnitude"* costs **no bytes at all**: the wire is unchanged, the save
 * schema is unchanged, `SAVE_SCHEMA_VERSION` is unchanged, and what was
 * missing was a reader on this side of `RenderFeed`. Adding a second copy of
 * the same four fields under the bundle's `world` section would have made the
 * geometry pull carry every rectangle twice and would have touched a persisted
 * schema to do it.
 *
 * This module is therefore the sibling of `actorsFromSnapshot`, which already
 * reads this same `simulation` section for the same channel, and it keeps that
 * module's rule: it reads what was published and invents nothing.
 *
 * ## What it refuses
 *
 * A row with no recorded rectangle yields **no room**, not a room of some
 * default size. `RoomInstance.width`'s own comment gives the reason -- *"1x1
 * asserts a room the player did not zone and 64x64 asserts one that overlaps
 * its neighbours"* -- and ADR 0111 §4 asks a reader to treat a missing
 * instance as *"no mark available"* rather than as *"no room"*. A degenerate
 * rectangle (zero or negative on either side) is refused on the same terms,
 * exactly as `roomBoundsOf` refuses it worker-side.
 */
export function roomsFromSnapshot(simulation: EncodedSessionSystems | undefined): readonly RenderRoom[] {
  const definitions = simulation?.prisoners.roomInstanceDefinitions;
  if (definitions === undefined || definitions.length === 0) return [];

  const rooms: RenderRoom[] = [];
  for (const definition of definitions) {
    const { width, height } = definition;
    if (width === undefined || height === undefined) continue;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) continue;
    rooms.push({
      instanceId: definition.instanceId,
      roomCatalogId: definition.roomCatalogId,
      anchorTileX: definition.anchorTile.x,
      anchorTileY: definition.anchorTile.y,
      width,
      height,
    });
  }
  return rooms;
}
