/** Literal public plans and owners. No fixture placement, snapshot injection,
 * or coordinates learned from the producer under test. */
export const RECEPTION_BOOTSTRAP = [
  { templateId: 'storage-room-basic', name: 'Storage Room', origin: { x: 12, y: 18 }, orders: 18, cumulativeOrders: 18, cost: 1395, balance: 23605, ticks: 1251 },
  { templateId: 'delivery-bay-basic', name: 'Delivery Bay', origin: { x: 20, y: 18 }, orders: 21, cumulativeOrders: 39, cost: 1780, balance: 21825, ticks: 1520 },
] as const;
export const RECEPTION_ORIGIN = { x: 4, y: 4 } as const;
export const RECEPTION_PLAN = { templateId: 'reception-basic', name: 'Reception', width: 6, height: 6,
  roomAnchor: { x: 5, y: 5 }, roomWidth: 4, roomHeight: 4, cost: 1845, orders: 23,
  cumulativeOrders: 62, balance: 19980, ticks: 1570 } as const;

export const RECEPTION_CASES = {
  0: { walls: [[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[4,5],[9,5],[4,6],[9,6],[4,7],[9,7],[4,8],[9,8],[4,9],[5,9],[7,9],[8,9],[9,9]],
    doorwaySquare: [6,9], doorOrder: { x: 6, y: 9, edge: 'north' }, desk: [5,5,2,1], chairs: [[5,6],[7,7]], cameraRightClicks: 7 },
  1: { walls: [[9,4],[9,5],[9,6],[9,7],[9,8],[9,9],[8,4],[8,9],[7,4],[7,9],[6,4],[6,9],[5,4],[5,9],[4,4],[4,5],[4,7],[4,8],[4,9]],
    doorwaySquare: [4,6], doorOrder: { x: 5, y: 6, edge: 'west' }, desk: [8,5,1,2], chairs: [[7,5],[6,7]], cameraRightClicks: 1 },
} as const;

/** IDs and order below are independent literal owner expectations. */
export const RECEPTION_CAPACITY_OWNERS = [
  { placedObjectId: 'object:13:19', objectId: 'object.storage-rack', anchorTile: { x: 13, y: 19 }, orientation: 0, sourceOrderId: 'room-template-000000000000-2-object-000' },
  { placedObjectId: 'object:15:19', objectId: 'object.storage-rack', anchorTile: { x: 15, y: 19 }, orientation: 0, sourceOrderId: 'room-template-000000000000-2-object-001' },
  { placedObjectId: 'object:21:19', objectId: 'object.loading-dock-door', anchorTile: { x: 21, y: 19 }, orientation: 0, sourceOrderId: 'room-template-000000000001-2-object-000' },
] as const;

export function receptionOwner(kind: 'wall' | 'door' | 'object', ordinal: number): string {
  const stage = { wall: 0, door: 1, object: 2 } as const;
  return `room-template-000000000002-${stage[kind]}-${kind}-${String(ordinal).padStart(3, '0')}`;
}

export const RECEPTION_ART = {
  assetId: 'furniture.reception.waiting-armchair',
  descriptor: '/game-content/oblique-furniture-reception-waiting-armchair.v1.json',
  descriptorCanonicalTextSha256: '55fa838b7d646a308ce9d97ff2167a2ffbb914aa35d9db3b7544578dab942aea',
  source: 'assets/source/blender/furniture.reception.waiting-armchair.blend',
  sourceSha256: '12cd91c54feb1d35603752eb7efe5c6245be190d77aa31d6e6b81121ea18457d',
  exposedFrame: '/assets/environment/oblique/furniture.reception.waiting-armchair-yaw+60-elev40.4e6ee8fdb156.png',
  exposedFrameSha256: '4e6ee8fdb156be06a9d023f8806d90aede0b12552d048dcdba383c5f68b4cb0d',
  cameraTarget: [.5, .5, .6600000262260437],
} as const;

/** Independently pinned new desk evidence; the existing room plan/owners are unchanged. */
export const RECEPTION_REGISTRATION_DESK_ART = {
  assetId: 'furniture.reception.registration-desk',
  descriptor: '/game-content/oblique-furniture-reception-registration-desk.v1.json',
  descriptorCanonicalTextSha256: '95244f4b7b0a244ca7288e5d64bd52b740da307e22b41ba84b0a43cb52c92ea9',
  source: 'assets/source/blender/furniture.reception.registration-desk.blend',
  sourceSha256: 'be670aa62316c8f8557a1edbed75f3ac87df3ebe4bc78a3958c1e106347bb0dc',
  exposedFrame: '/assets/environment/oblique/furniture.reception.registration-desk-yaw+60-elev40.bac55a0b3bac.png',
  exposedFrameSha256: 'bac55a0b3bacc977eeca707eaf444e58f8661171391a8d1c1d430e521204febe',
  cameraTarget: [1, .5, .6349999904632568],
} as const;
