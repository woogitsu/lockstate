import { describe, expect, it } from 'vitest';
import { isRoomFacingCutawayWall } from '../../src/rendering/scene/oblique-room-cutaway';
import type { RenderRoom } from '../../src/rendering/feed/render-feed';

const cell: RenderRoom = {
  instanceId: 'room.cell:2:2', roomCatalogId: 'room.cell',
  anchorTileX: 2, anchorTileY: 2, width: 3, height: 3,
};
const wall = (kind: 'north-edge' | 'west-edge', tileX: number, tileY: number) => ({ kind, tileX, tileY });

describe('room-facing oblique cutaway', () => {
  it('opens the camera-facing cell perimeter without requiring selection', () => {
    for (const elevation of [25, 45, 65]) {
      expect(isRoomFacingCutawayWall(wall('north-edge', 3, 5), [cell], 0, elevation)).toBe(true);
      expect(isRoomFacingCutawayWall(wall('west-edge', 1, 3), [cell], -45, elevation)).toBe(true);
      expect(isRoomFacingCutawayWall(wall('west-edge', 5, 3), [cell], 45, elevation)).toBe(true);
      expect(isRoomFacingCutawayWall(wall('west-edge', 5, 3), [cell], -45, elevation)).toBe(false);
      expect(isRoomFacingCutawayWall(wall('west-edge', 1, 3), [cell], 45, elevation)).toBe(false);
      expect(isRoomFacingCutawayWall(wall('north-edge', 3, 1), [cell], 0, elevation)).toBe(false);
    }
  });

  it('leaves walls outside the room and frames without rooms untouched', () => {
    expect(isRoomFacingCutawayWall(wall('north-edge', 2, 1), [cell], -45, 45)).toBe(false);
    expect(isRoomFacingCutawayWall(wall('north-edge', 3, 5), [], 0, 45)).toBe(false);
  });
});
