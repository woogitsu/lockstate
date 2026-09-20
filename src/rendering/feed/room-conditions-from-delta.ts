import {
  RENDER_ROOM_CONDITION_DOORWAY,
  RENDER_ROOM_CONDITION_GAP,
  RENDER_ROOM_CONDITION_NO_WAY_IN,
  RENDER_ROOM_CONDITION_UNREACHABLE,
  type RenderActorsPayload,
} from '../../simulation/protocol/render-actors-payload';
import type { RenderRoomCondition } from './render-feed';

/** Every ordinal this build has a meaning for. A payload word outside it is dropped, not guessed. */
const KNOWN_CONDITIONS: ReadonlySet<number> = new Set([
  RENDER_ROOM_CONDITION_GAP,
  RENDER_ROOM_CONDITION_DOORWAY,
  RENDER_ROOM_CONDITION_UNREACHABLE,
  RENDER_ROOM_CONDITION_NO_WAY_IN,
]);

/**
 * The renderer's view of a delta's room block (ADR 0097 decision 2's payload).
 *
 * The sibling of `actorsFromDelta` over the same buffer, and it keeps that
 * module's two rules exactly:
 *
 * - **It reads what was published and invents nothing.** A row is an anchor
 *   tile and an ordinal; the rectangle it belongs to comes from the geometry
 *   pull, and this module neither carries one nor guesses one.
 * - **An ordinal this build has no meaning for is dropped rather than
 *   drawn**, for the reason `actors-from-delta.ts` drops an unknown
 *   population: drawing it as some known verdict would put a claim about a
 *   room on the map with nothing reporting it, and refusing the whole payload
 *   would blank every room's mark over one unrecognised word.
 */
export function roomConditionsFromDelta(payload: RenderActorsPayload): readonly RenderRoomCondition[] {
  const conditions: RenderRoomCondition[] = [];
  for (let row = 0; row < payload.roomConditions.length; row += 1) {
    const condition = payload.roomConditions[row] as number;
    if (!KNOWN_CONDITIONS.has(condition)) continue;
    conditions.push({
      anchorTileX: payload.roomAnchorX[row] as number,
      anchorTileY: payload.roomAnchorY[row] as number,
      condition,
    });
  }
  return conditions;
}
