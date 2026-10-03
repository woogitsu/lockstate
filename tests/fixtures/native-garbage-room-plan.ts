/** Literal public plans and owners. No fixture placement, snapshot injection,
 * or coordinates learned from the producer under test. */
export const GARBAGE_BOOTSTRAP = [
  { templateId: 'storage-room-basic', name: 'Storage Room', origin: { x: 12, y: 18 }, orders: 18, cumulativeOrders: 18, cost: 1395, balance: 23605, ticks: 1251 },
  { templateId: 'delivery-bay-basic', name: 'Delivery Bay', origin: { x: 20, y: 18 }, orders: 21, cumulativeOrders: 39, cost: 1780, balance: 21825, ticks: 1520 },
] as const;
export const GARBAGE_ORIGIN = { x: 4, y: 4 } as const;
export const GARBAGE_PLAN = { templateId: 'garbage-room-basic', name: 'Garbage Room', width: 4, height: 4,
  roomAnchor: { x: 5, y: 5 }, roomWidth: 2, roomHeight: 2, cost: 1025, orders: 14,
  cumulativeOrders: 53, balance: 20800, ticks: 1020 } as const;

export const GARBAGE_CASES = {
  0: { walls: [[4,4],[5,4],[6,4],[7,4],[4,5],[7,5],[4,6],[7,6],[4,7],[6,7],[7,7]],
    doorwaySquare: [5,7], doorOrder: { x: 5, y: 7, edge: 'north' }, bins: [[5,5],[6,5]], cameraRightClicks: 7 },
  1: { walls: [[7,4],[7,5],[7,6],[7,7],[6,4],[6,7],[5,4],[5,7],[4,4],[4,6],[4,7]],
    doorwaySquare: [4,5], doorOrder: { x: 5, y: 5, edge: 'west' }, bins: [[6,5],[6,6]], cameraRightClicks: 1 },
} as const;

/** IDs and order below are independent literal owner expectations. */
export const GARBAGE_CAPACITY_OWNERS = [
  { placedObjectId: 'object:13:19', objectId: 'object.storage-rack', anchorTile: { x: 13, y: 19 }, orientation: 0, sourceOrderId: 'room-template-000000000000-2-object-000' },
  { placedObjectId: 'object:15:19', objectId: 'object.storage-rack', anchorTile: { x: 15, y: 19 }, orientation: 0, sourceOrderId: 'room-template-000000000000-2-object-001' },
  { placedObjectId: 'object:21:19', objectId: 'object.loading-dock-door', anchorTile: { x: 21, y: 19 }, orientation: 0, sourceOrderId: 'room-template-000000000001-2-object-000' },
] as const;

export function garbageOwner(kind: 'wall' | 'door' | 'object', ordinal: number): string {
  const stage = { wall: 0, door: 1, object: 2 } as const;
  return `room-template-000000000002-${stage[kind]}-${kind}-${String(ordinal).padStart(3, '0')}`;
}

export const GARBAGE_ART = {
  assetId: 'fixture.garbage-room.waste-bin',
  descriptor: '/game-content/oblique-fixture.garbage-room-waste-bin.v1.json',
  source: 'assets/source/blender/fixture.garbage-room.waste-bin.blend',
  sourceSha256: '5d9cafee94af08098b045e389b642ec655536fe0cc8aae8b5e026822f7d984cc',
  exposedFrame: '/assets/environment/oblique/fixture.garbage-room.waste-bin-yaw+60-elev40.a573c065a873.png',
  exposedFrameSha256: 'a573c065a8733517712fdbecd752a47599b407cd1dcd0847a9fc00470cb9e348',
  cameraTarget: [.5, .5, .5949999681859961],
} as const;
