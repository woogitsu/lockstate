import type { RenderRoom } from '../feed/render-feed';

export interface RoomWallEdge {
  readonly kind: 'north-edge' | 'west-edge';
  readonly tileX: number;
  readonly tileY: number;
}

export function isRoomFacingCutawayWall(
  edge: RoomWallEdge,
  rooms: readonly RenderRoom[],
  yawDegrees: number,
  _elevationDegrees: number,
): boolean {
  const yaw = yawDegrees * Math.PI / 180;
  const viewX = Math.sin(yaw);
  const viewY = Math.cos(yaw);
  for (const room of rooms) {
    const left = room.anchorTileX;
    const top = room.anchorTileY;
    const right = left + room.width;
    const bottom = top + room.height;
    if (edge.kind === 'north-edge' && edge.tileX >= left && edge.tileX < right) {
      if (viewY > 0.05 && edge.tileY === bottom) return true;
      if (viewY < -0.05 && (edge.tileY === top || edge.tileY === top - 1)) return true;
    }
    if (edge.kind === 'west-edge' && edge.tileY >= top && edge.tileY < bottom) {
      if (viewX > 0.05 && edge.tileX === right) return true;
      if (viewX < -0.05 && (edge.tileX === left || edge.tileX === left - 1)) return true;
    }
  }
  return false;
}
