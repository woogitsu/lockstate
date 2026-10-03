/** Literal player route, independently pinned against the production kernel.
 * This module contains no simulation mutation or fixture placement helper. */
export const SMALL_PRISON_PLANS = [
  { templateId: 'storage-room-basic', name: 'Storage Room', origin: { x: 5, y: 5 }, quarterTurns: 0, width: 5, height: 5, cost: 1395, orders: 18, rooms: 1, balance: 23605, cumulativeOrders: 18 },
  { templateId: 'delivery-bay-basic', name: 'Delivery Bay', origin: { x: 12, y: 5 }, quarterTurns: 0, width: 6, height: 6, cost: 1780, orders: 21, rooms: 2, balance: 21825, cumulativeOrders: 39 },
  { templateId: 'cell-row-four', name: 'Four-cell row', origin: { x: 3, y: 13 }, quarterTurns: 1, width: 16, height: 7, cost: 5000, orders: 66, rooms: 6, balance: 16825, cumulativeOrders: 105 },
  { templateId: 'kitchen-basic', name: 'Kitchen', origin: { x: 20, y: 5 }, quarterTurns: 0, width: 6, height: 6, cost: 1785, orders: 23, rooms: 7, balance: 15040, cumulativeOrders: 128 },
  { templateId: 'shower-room', name: 'Shower room', origin: { x: 20, y: 12 }, quarterTurns: 0, width: 5, height: 5, cost: 1345, orders: 18, rooms: 8, balance: 13695, cumulativeOrders: 146 },
  { templateId: 'canteen-basic', name: 'Canteen', origin: { x: 20, y: 19 }, quarterTurns: 0, width: 8, height: 8, cost: 3135, orders: 34, rooms: 9, balance: 10560, cumulativeOrders: 180 },
  { templateId: 'yard-basic', name: 'Yard', origin: { x: 10, y: 22 }, quarterTurns: 0, width: 8, height: 8, cost: 0, orders: 0, rooms: 10, balance: 10560, cumulativeOrders: 180 },
] as const;

/** [template gesture ordinal, fixture ordinal, definition, object, x, y, orientation].
 * Values were reviewed against authored geometry; consumers do not learn them
 * from the placed objects they are meant to verify. */
export const SMALL_PRISON_FIXTURES = [
  [0, 0, 'storage-rack-wooden', 'object.storage-rack', 6, 6, 0],
  [0, 1, 'storage-rack-wooden', 'object.storage-rack', 8, 6, 0],
  [1, 0, 'loading-dock-door-wooden', 'object.loading-dock-door', 13, 6, 0],
  [2, 0, 'bed-wooden', 'object.bed', 16, 14, 1],
  [2, 1, 'toilet-brick', 'object.toilet', 14, 15, 1],
  [2, 2, 'bed-wooden', 'object.bed', 16, 17, 1],
  [2, 3, 'toilet-brick', 'object.toilet', 14, 18, 1],
  [2, 4, 'bed-wooden', 'object.bed', 4, 14, 1],
  [2, 5, 'toilet-brick', 'object.toilet', 7, 15, 1],
  [2, 6, 'bed-wooden', 'object.bed', 4, 17, 1],
  [2, 7, 'toilet-brick', 'object.toilet', 7, 18, 1],
  [3, 0, 'stove-brick', 'object.stove', 21, 6, 0],
  [3, 1, 'prep-counter-brick', 'object.prep-counter', 23, 6, 0],
  [3, 2, 'fridge-brick', 'object.fridge', 21, 8, 0],
  [4, 0, 'shower-head-brick', 'object.shower-head', 21, 13, 0],
  [4, 1, 'shower-head-brick', 'object.shower-head', 23, 13, 0],
  [5, 0, 'dining-table-wooden', 'object.dining-table', 21, 20, 0],
  [5, 1, 'dining-table-wooden', 'object.dining-table', 24, 20, 0],
  [5, 2, 'bench-wooden', 'object.bench', 21, 22, 0],
  [5, 3, 'bench-wooden', 'object.bench', 24, 22, 0],
  [5, 4, 'bench-wooden', 'object.bench', 21, 24, 0],
  [5, 5, 'bench-wooden', 'object.bench', 24, 24, 0],
] as const;

export function showcaseOwnerId(gesture: number, fixture: number): string {
  return `room-template-${String(gesture).padStart(12, '0')}-2-object-${String(fixture).padStart(3, '0')}`;
}

export const SMALL_PRISON_ROOM_IDS = [
  'room.canteen:21:20', 'room.cell:13:14', 'room.cell:13:17', 'room.cell:4:14', 'room.cell:4:17',
  'room.delivery-bay:13:6', 'room.kitchen:21:6', 'room.shower-room:21:13', 'room.storage-room:6:6', 'room.yard:10:22',
] as const;

export const SMALL_PRISON_CAMERA_POSES = [
  { name: 'whole-315-45', rightClicks: 0, raiseClicks: 0, yawDegrees: -45, elevationDegrees: 45 },
  { name: 'whole-45-45', rightClicks: 6, raiseClicks: 0, yawDegrees: 45, elevationDegrees: 45 },
  { name: 'whole-135-55', rightClicks: 6, raiseClicks: 1, yawDegrees: 135, elevationDegrees: 55 },
] as const;
