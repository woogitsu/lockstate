/** Independent literals for ordinary public plans/purchase/placement. No
 * injected room, material container, treasury or authored desk in the template. */
export const CLASSROOM_BOOTSTRAP = [
  { templateId: 'storage-room-basic', name: 'Storage Room', origin: { x: 12, y: 18 }, orders: 18, cumulativeOrders: 18, cost: 1395, balance: 23605, ticks: 1251 },
  { templateId: 'delivery-bay-basic', name: 'Delivery Bay', origin: { x: 20, y: 18 }, orders: 21, cumulativeOrders: 39, cost: 1780, balance: 21825, ticks: 1520 },
] as const;
export const CLASSROOM_ORIGIN = { x: 4, y: 4 } as const;
export const CLASSROOM_PLAN = { templateId: 'classroom-basic', name: 'Classroom', width: 7, height: 7,
  roomAnchor: { x: 5, y: 5 }, roomWidth: 5, roomHeight: 5, cost: 2295, orders: 29,
  cumulativeOrders: 68, balance: 19530, ticks: 1890 } as const;
export const CLASSROOM_DESK = { definitionId: 'desk-wooden', objectId: 'object.desk', orientation: 0,
  cost: 130, materials: [{ itemId: 'item.wood-plank', quantity: 2 }], workRequired: 60,
  cumulativeOrders: 69, balance: 19400, ticks: 180, width: 2, height: 1 } as const;
export const CLASSROOM_CASES = {
  0: { walls: [[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[4,5],[10,5],[4,6],[10,6],[4,7],[10,7],[4,8],[10,8],[4,9],[10,9],[4,10],[5,10],[6,10],[8,10],[9,10],[10,10]],
    doorOrder: { x: 7, y: 10, edge: 'north' }, doorwaySquare: [7,10],
    objects: [['object.bookshelf','bookshelf-wooden',5,5,2,1],['object.chair','chair-wooden',5,7,1,1],['object.chair','chair-wooden',7,7,1,1],['object.chair','chair-wooden',5,8,1,1],['object.chair','chair-wooden',7,8,1,1]],
    desk: { x: 8, y: 5 }, deskTiles: [[8,5],[9,5]] },
  1: { walls: [[10,4],[10,5],[10,6],[10,7],[10,8],[10,9],[10,10],[9,4],[9,10],[8,4],[8,10],[7,4],[7,10],[6,4],[6,10],[5,4],[5,10],[4,4],[4,5],[4,6],[4,8],[4,9],[4,10]],
    doorOrder: { x: 5, y: 7, edge: 'west' }, doorwaySquare: [4,7],
    objects: [['object.bookshelf','bookshelf-wooden',9,5,1,2],['object.chair','chair-wooden',7,5,1,1],['object.chair','chair-wooden',7,7,1,1],['object.chair','chair-wooden',6,5,1,1],['object.chair','chair-wooden',6,7,1,1]],
    desk: { x: 5, y: 8 }, deskTiles: [[5,8],[6,8]] },
} as const;

export function classroomOwner(kind: 'wall' | 'door' | 'object', ordinal: number): string {
  const stage = { wall: 0, door: 1, object: 2 } as const;
  return `room-template-000000000002-${stage[kind]}-${kind}-${String(ordinal).padStart(3, '0')}`;
}
export const CLASSROOM_ART = {
  assetId: 'furniture.classroom.teacher-desk', descriptor: '/game-content/oblique-furniture-classroom-teacher-desk.v1.json',
  source: 'assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend',
  sourceSha256: 'a879bba0f04a4f8b08a66fb9e607d1d815a7a6c2a8f7cb84c1d20c7c0d26d376',
  exposedFrame: '/assets/environment/oblique/furniture.classroom.teacher-desk-yaw+60-elev40.5c8ee6a0fc92.png',
  exposedFrameSha256: '5c8ee6a0fc927377c5e6ea80f92444764d0ba794a25ddd14acafeec79dfa25e7',
  cameraTarget: [1, .5, .6349999904632568], cameraRightClicks: 7,
} as const;

/** The room keeps its authored chair orientation while the separately bought
 * teacher desk stays orientation0. At world60/e40 this selects 60 vs150. */
export const CLASSROOM_STUDENT_ART = {
  assetId: 'furniture.classroom.student-chair',
  descriptor: '/game-content/oblique-furniture-classroom-student-chair.v1.json',
  source: 'assets/source/blender/furniture.classroom.student-chair.blend',
  sourceSha256: '0c3d7dc54a594659c810f8e1d76bd4980bf1293f7a5b22c367805760de1a9b1b',
  frames: {
    0: { yawDegrees: 60, elevationDegrees: 40,
      image: '/assets/environment/oblique/furniture.classroom.student-chair-yaw+60-elev40.eb690a439214.png',
      sha256: 'eb690a4392146a594fa1b692a2dc0b28b881820e541a7125f7f112c474c50260' },
    1: { yawDegrees: 150, elevationDegrees: 40,
      image: '/assets/environment/oblique/furniture.classroom.student-chair-yaw+150-elev40.1da832419795.png',
      sha256: '1da832419795e08cf8062eea139ddcc9e34bcbbdcf4e5b76ed74024326420479' },
  },
} as const;
