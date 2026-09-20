import {
  RENDER_ROOM_CONDITION_NO_WAY_IN,
  RENDER_ROOM_CONDITION_UNREACHABLE,
} from '../../simulation/protocol/render-actors-payload';
import type { RenderRoom, RenderRoomCondition } from '../feed/render-feed';

/**
 * Which rooms get a mark on the map, and where.
 *
 * Pure: no Phaser, no DOM, one plan per (rectangles, conditions) pair, so the
 * question *"does a sealed cell look different from a working one"* is
 * answerable in a unit test without a canvas. `RoomConditionLayer` draws what
 * this returns and decides nothing about which rooms are in it.
 *
 * ## What earns a mark
 *
 * Only a room **nobody can get into**: ADR 0108's `'no-way-in'` (sealed, no
 * door at all -- #1022's cell) and `'unreachable'` (a door that leads nowhere
 * a prisoner can walk from). `'doorway'` is the working room and gets nothing,
 * which is the whole point: a mark that appeared on every room would be
 * wallpaper again.
 *
 * `'gap'` gets nothing either, and that is a decision rather than an omission.
 * `roomAccess`'s own docblock warns that `'gap'` is decided before
 * reachability and *"promises nothing about it"*: an open-sided rectangle is
 * how a yard is zoned on purpose, so marking it would tell the player a true
 * sentence about the geometry and a false one about the prison.
 *
 * ## Why the join is by anchor tile
 *
 * The rectangle arrives on the geometry pull and the ordinal on the delta
 * (ADR 0111 decisions 1 and 2), so the two lists are two publications and can
 * disagree for one round trip. The anchor tile is in both and is unique among
 * live rooms -- zoning refuses any rectangle overlapping an existing one -- so
 * a join on it is exact. **A condition with no rectangle draws nothing and a
 * rectangle with no condition draws nothing**: the first is a room the
 * geometry pull has not caught up with, the second a room the simulation has
 * not answered for yet, and asserting a verdict in either case would be the
 * false claim ADR 0097 decision 2 exists to avoid.
 */
export interface RoomConditionMark {
  readonly instanceId: string;
  /** The room's rectangle, in tiles, exactly as the geometry pull published it. */
  readonly tileX: number;
  readonly tileY: number;
  readonly width: number;
  readonly height: number;
  /** The published ordinal, kept so a later mark can distinguish the two cases it currently draws alike. */
  readonly condition: number;
}

/** The ordinals that mean "nobody can get in". Everything else draws nothing. */
const MARKED_CONDITIONS: ReadonlySet<number> = new Set([
  RENDER_ROOM_CONDITION_NO_WAY_IN,
  RENDER_ROOM_CONDITION_UNREACHABLE,
]);

function anchorKey(tileX: number, tileY: number): string {
  return `${String(tileX)},${String(tileY)}`;
}

export function planRoomConditionMarks(
  rooms: readonly RenderRoom[],
  conditions: readonly RenderRoomCondition[],
): readonly RoomConditionMark[] {
  if (rooms.length === 0 || conditions.length === 0) return [];

  const marked = new Map<string, number>();
  for (const condition of conditions) {
    if (!MARKED_CONDITIONS.has(condition.condition)) continue;
    marked.set(anchorKey(condition.anchorTileX, condition.anchorTileY), condition.condition);
  }
  if (marked.size === 0) return [];

  const marks: RoomConditionMark[] = [];
  for (const room of rooms) {
    const condition = marked.get(anchorKey(room.anchorTileX, room.anchorTileY));
    if (condition === undefined) continue;
    marks.push({
      instanceId: room.instanceId,
      tileX: room.anchorTileX,
      tileY: room.anchorTileY,
      width: room.width,
      height: room.height,
      condition,
    });
  }
  return marks;
}
