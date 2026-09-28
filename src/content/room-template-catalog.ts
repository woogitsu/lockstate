/** Player-authored plans use occupied squares; the simulation never infers them from a rendered wall face. */
import { defaultObjectRegistry } from './object-catalog';

export interface TemplateSquare {
  readonly x: number;
  readonly y: number;
}

export interface TemplateDoorSquare extends TemplateSquare {
  /** A north-facing doorway uses the north edge of the tile just inside the room. */
  readonly orderTile?: TemplateSquare;
  /** Canonical world edge; absent preserves the authored north-edge door. */
  readonly edge?: 'north' | 'west';
}

export interface RoomTemplatePlan {
  readonly id: AuthoredRoomTemplateId;
  readonly origin: TemplateSquare;
  readonly width: number;
  readonly height: number;
  readonly wallSquares: readonly TemplateSquare[];
  readonly doorSquares: readonly TemplateDoorSquare[];
  readonly zone: { readonly roomId: 'room.cell' | 'room.shower-room' | 'room.canteen' | 'room.kitchen' | 'room.infirmary' | 'room.laundry' | 'room.classroom' | 'room.common-room' | 'room.security-office' | 'room.storage-room' | 'room.staff-room' | 'room.solitary-cell' | 'room.delivery-bay' | 'room.holding-cell'; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Every separately designated room; `zone` retains the first for older readers. */
  readonly zones: readonly RoomTemplatePlan['zone'][];
  readonly objects: readonly { readonly buildableId: RoomTemplateObjectId; readonly x: number; readonly y: number; readonly orientation?: 0 | 1 | 2 | 3 }[];
}

/** Player-facing choices; backend-authored additions can join after HUD copy and controls land. */
export const ROOM_TEMPLATE_IDS = ['cell-basic', 'cell-large', 'shower-room', 'cell-row-four', 'canteen-basic', 'kitchen-basic', 'infirmary-basic', 'laundry-basic', 'classroom-basic', 'common-room-basic', 'security-office-basic', 'storage-room-basic', 'staff-room-basic', 'solitary-cell-basic', 'delivery-bay-basic'] as const;
export type RoomTemplateId = (typeof ROOM_TEMPLATE_IDS)[number];
export type AuthoredRoomTemplateId = RoomTemplateId | 'holding-cell-basic';
type RoomTemplateObjectId = 'bed-wooden' | 'toilet-brick' | 'shower-head-brick' | 'dining-table-wooden' | 'bench-wooden' | 'stove-brick' | 'prep-counter-brick' | 'fridge-brick' | 'medical-bed-wooden' | 'medicine-cabinet-wooden' | 'washing-machine-brick' | 'bookshelf-wooden' | 'chair-wooden' | 'security-console-brick' | 'storage-rack-wooden' | 'desk-wooden' | 'loading-dock-door-wooden';

/** Authored object names resolve to the same catalogue footprint used by placement. */
const TEMPLATE_OBJECT_IDS: Readonly<Record<RoomTemplateObjectId, string>> = {
  'bed-wooden': 'object.bed',
  'toilet-brick': 'object.toilet',
  'shower-head-brick': 'object.shower-head',
  'dining-table-wooden': 'object.dining-table',
  'bench-wooden': 'object.bench',
  'stove-brick': 'object.stove',
  'prep-counter-brick': 'object.prep-counter',
  'fridge-brick': 'object.fridge',
  'medical-bed-wooden': 'object.medical-bed',
  'medicine-cabinet-wooden': 'object.medicine-cabinet',
  'washing-machine-brick': 'object.washing-machine',
  'bookshelf-wooden': 'object.bookshelf',
  'chair-wooden': 'object.chair',
  'security-console-brick': 'object.security-console',
  'storage-rack-wooden': 'object.storage-rack',
  'desk-wooden': 'object.desk',
  'loading-dock-door-wooden': 'object.loading-dock-door',
};

/** Full occupied furniture squares, shared by catalogue diagram and world ghost. */
export function roomTemplateObjectSquares(plan: RoomTemplatePlan): readonly TemplateSquare[] {
  return plan.objects.flatMap((object) => {
    const footprint = defaultObjectRegistry.getById(TEMPLATE_OBJECT_IDS[object.buildableId])?.footprint;
    if (footprint === undefined) throw new Error(`Missing footprint for room template object: ${object.buildableId}`);
    const squares: TemplateSquare[] = [];
    for (let dy = 0; dy < footprint.height; dy += 1) {
      for (let dx = 0; dx < footprint.width; dx += 1) squares.push({ x: object.x + dx, y: object.y + dy });
    }
    return squares;
  });
}

interface TemplateDefinition {
  readonly width: number;
  readonly height: number;
  readonly roomId: RoomTemplatePlan['zone']['roomId'];
  readonly doorX: number;
  readonly objects: readonly { readonly buildableId: RoomTemplateObjectId; readonly x: number; readonly y: number; readonly width?: number }[];
}

const TEMPLATES: Readonly<Record<Exclude<AuthoredRoomTemplateId, 'cell-row-four'>, TemplateDefinition>> = {
  'cell-basic': {
    width: 4, height: 7, roomId: 'room.cell', doorX: 1,
    objects: [{ buildableId: 'bed-wooden', x: 1, y: 1 }, { buildableId: 'toilet-brick', x: 2, y: 4 }],
  },
  'cell-large': {
    width: 6, height: 7, roomId: 'room.cell', doorX: 2,
    objects: [
      { buildableId: 'bed-wooden', x: 1, y: 1 },
      { buildableId: 'bed-wooden', x: 4, y: 1 },
      { buildableId: 'toilet-brick', x: 1, y: 4 },
    ],
  },
  'shower-room': {
    width: 5, height: 5, roomId: 'room.shower-room', doorX: 2,
    objects: [{ buildableId: 'shower-head-brick', x: 1, y: 1 }, { buildableId: 'shower-head-brick', x: 3, y: 1 }],
  },
  'canteen-basic': {
    width: 8, height: 8, roomId: 'room.canteen', doorX: 3,
    objects: [
      { buildableId: 'dining-table-wooden', x: 1, y: 1, width: 3 },
      { buildableId: 'dining-table-wooden', x: 4, y: 1, width: 3 },
      { buildableId: 'bench-wooden', x: 1, y: 3, width: 2 },
      { buildableId: 'bench-wooden', x: 4, y: 3, width: 2 },
      { buildableId: 'bench-wooden', x: 1, y: 5, width: 2 },
      { buildableId: 'bench-wooden', x: 4, y: 5, width: 2 },
    ],
  },
  'kitchen-basic': {
    width: 6, height: 6, roomId: 'room.kitchen', doorX: 2,
    objects: [
      { buildableId: 'stove-brick', x: 1, y: 1, width: 2 },
      { buildableId: 'prep-counter-brick', x: 3, y: 1, width: 2 },
      { buildableId: 'fridge-brick', x: 1, y: 3 },
    ],
  },
  'infirmary-basic': {
    width: 6, height: 6, roomId: 'room.infirmary', doorX: 2,
    objects: [
      { buildableId: 'medical-bed-wooden', x: 1, y: 1 },
      { buildableId: 'medicine-cabinet-wooden', x: 3, y: 1 },
    ],
  },
  'laundry-basic': {
    width: 6, height: 6, roomId: 'room.laundry', doorX: 2,
    objects: [
      { buildableId: 'washing-machine-brick', x: 1, y: 1, width: 2 },
      { buildableId: 'washing-machine-brick', x: 1, y: 3, width: 2 },
    ],
  },
  'classroom-basic': {
    width: 7, height: 7, roomId: 'room.classroom', doorX: 3,
    objects: [
      { buildableId: 'bookshelf-wooden', x: 1, y: 1, width: 2 },
      { buildableId: 'chair-wooden', x: 1, y: 3 },
      { buildableId: 'chair-wooden', x: 2, y: 3 },
      { buildableId: 'chair-wooden', x: 3, y: 3 },
      { buildableId: 'chair-wooden', x: 4, y: 3 },
    ],
  },
  'common-room-basic': {
    width: 7, height: 7, roomId: 'room.common-room', doorX: 3,
    objects: [
      { buildableId: 'bench-wooden', x: 1, y: 1, width: 2 },
      { buildableId: 'bench-wooden', x: 4, y: 1, width: 2 },
      { buildableId: 'bench-wooden', x: 1, y: 4, width: 2 },
      { buildableId: 'bench-wooden', x: 4, y: 4, width: 2 },
    ],
  },
  'security-office-basic': {
    width: 5, height: 5, roomId: 'room.security-office', doorX: 2,
    objects: [{ buildableId: 'security-console-brick', x: 1, y: 1, width: 2 }],
  },
  'storage-room-basic': {
    width: 5, height: 5, roomId: 'room.storage-room', doorX: 2,
    objects: [
      { buildableId: 'storage-rack-wooden', x: 1, y: 1 },
      { buildableId: 'storage-rack-wooden', x: 3, y: 1 },
    ],
  },
  'staff-room-basic': {
    width: 5, height: 5, roomId: 'room.staff-room', doorX: 2,
    objects: [
      { buildableId: 'desk-wooden', x: 1, y: 1, width: 2 },
      { buildableId: 'chair-wooden', x: 1, y: 3 },
      { buildableId: 'chair-wooden', x: 3, y: 3 },
    ],
  },
  'solitary-cell-basic': {
    width: 4, height: 4, roomId: 'room.solitary-cell', doorX: 1,
    objects: [
      { buildableId: 'bed-wooden', x: 2, y: 1 },
      { buildableId: 'toilet-brick', x: 1, y: 1 },
    ],
  },
  'holding-cell-basic': {
    width: 4, height: 4, roomId: 'room.holding-cell', doorX: 1,
    objects: [{ buildableId: 'bench-wooden', x: 1, y: 1, width: 2 }],
  },
  'delivery-bay-basic': {
    width: 6, height: 6, roomId: 'room.delivery-bay', doorX: 2,
    // The 3×1 dock marker touches the room's northern boundary. It is a
    // capability object, not a navigable wall door; the southern door serves
    // the actual walk into the bay.
    objects: [{ buildableId: 'loading-dock-door-wooden', x: 1, y: 1, width: 3 }],
  },
};

/**
 * Returns the complete geometry of one room before any order is submitted.
 * A mirrored copy faces the other half of a shared corridor without changing
 * the occupied footprint or moving furniture onto a wall square.
 */
export function instantiateRoomTemplate(
  id: AuthoredRoomTemplateId,
  origin: TemplateSquare,
  options: { readonly mirrorX?: boolean } = {},
): RoomTemplatePlan {
  if (!Number.isSafeInteger(origin.x) || !Number.isSafeInteger(origin.y)) {
    throw new RangeError('Room template origin must use safe integer tile coordinates.');
  }
  if (!roomTemplateOriginFitsSafeCoordinates(id, origin)) {
    throw new RangeError('Room template footprint exceeds safe tile coordinates.');
  }
  if (id === 'cell-row-four') return instantiateCellRow(origin, options.mirrorX === true);
  const definition = TEMPLATES[id];
  if (definition === undefined) throw new RangeError(`Unknown room template: ${id}`);
  const { width, height } = definition;
  const worldX = (localX: number): number => origin.x + (options.mirrorX === true ? width - 1 - localX : localX);
  const square = (localX: number, localY: number): TemplateSquare => ({ x: worldX(localX), y: origin.y + localY });
  const wallSquares: TemplateSquare[] = [];
  const doorSquares: TemplateDoorSquare[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x !== 0 && x !== width - 1 && y !== 0 && y !== height - 1) continue;
      (x === definition.doorX && y === height - 1 ? doorSquares : wallSquares).push(square(x, y));
    }
  }

  return {
    id,
    origin: { x: origin.x, y: origin.y },
    width,
    height,
    wallSquares,
    doorSquares,
    zone: { roomId: definition.roomId, x: origin.x + 1, y: origin.y + 1, width: width - 2, height: height - 2 },
    zones: [{ roomId: definition.roomId, x: origin.x + 1, y: origin.y + 1, width: width - 2, height: height - 2 }],
    // Placed objects grow east from their anchor. Mirror the complete width,
    // rather than only the anchor, so the far tile stays inside the room.
    objects: definition.objects.map((object) => ({ buildableId: object.buildableId, ...square(object.x + (options.mirrorX === true ? (object.width ?? 1) - 1 : 0), object.y) })),
  };
}

/** Includes the exclusive loop bounds used by placement and pending claims. */
export function roomTemplateOriginFitsSafeCoordinates(id: AuthoredRoomTemplateId, origin: TemplateSquare, quarterTurns: 0 | 1 | 2 | 3 = 0): boolean {
  const dimensions = id === 'cell-row-four' ? { width: 7, height: 16 } : TEMPLATES[id];
  const width = dimensions === undefined ? 0 : quarterTurns % 2 === 0 ? dimensions.width : dimensions.height;
  const height = dimensions === undefined ? 0 : quarterTurns % 2 === 0 ? dimensions.height : dimensions.width;
  return dimensions !== undefined && Number.isSafeInteger(origin.x) && Number.isSafeInteger(origin.y) &&
    origin.x <= Number.MAX_SAFE_INTEGER - dimensions.width &&
    origin.y <= Number.MAX_SAFE_INTEGER - dimensions.height &&
    origin.x <= Number.MAX_SAFE_INTEGER - width &&
    origin.y <= Number.MAX_SAFE_INTEGER - height;
}

/** Four basic Cells share party walls across each bank of a clear two-tile corridor. */
function instantiateCellRow(origin: TemplateSquare, mirrorX: boolean): RoomTemplatePlan {
  const width = 7;
  const height = 16;
  const worldX = (localX: number): number => origin.x + (mirrorX ? width - 1 - localX : localX);
  const square = (localX: number, localY: number): TemplateSquare => ({ x: worldX(localX), y: origin.y + localY });
  const wallSquares: TemplateSquare[] = [];
  const doorSquares: TemplateDoorSquare[] = [];
  const objects: { buildableId: RoomTemplateObjectId; x: number; y: number }[] = [];
  const zones: RoomTemplatePlan['zone'][] = [];
  const wallKeys = new Set<string>();

  for (const cellY of [0, 9]) {
    for (const cellX of [0, 3]) {
      const northFacing = cellY === 9;
      for (let localY = 0; localY < 7; localY += 1) {
        for (let localX = 0; localX < 4; localX += 1) {
          if (localX !== 0 && localX !== 3 && localY !== 0 && localY !== 6) continue;
          const at = square(cellX + localX, cellY + localY);
          if (localX === 1 && localY === (northFacing ? 0 : 6)) {
            doorSquares.push(northFacing
              ? { ...at, orderTile: square(cellX + localX, cellY + 1) }
              : at);
          } else {
            const key = `${at.x}:${at.y}`;
            if (!wallKeys.has(key)) {
              wallKeys.add(key);
              wallSquares.push(at);
            }
          }
        }
      }
      zones.push({
        roomId: 'room.cell', x: origin.x + (mirrorX ? 6 - (cellX + 2) : cellX + 1),
        y: origin.y + cellY + 1, width: 2, height: 5,
      });
      // Beds occupy two north-south tiles; the northern bank must leave its
      // last perimeter row clear just as the southern bank leaves its first.
      const bed = square(cellX + 1, cellY + (northFacing ? 4 : 1));
      const toilet = square(cellX + 2, cellY + (northFacing ? 2 : 4));
      objects.push({ buildableId: 'bed-wooden', ...bed }, { buildableId: 'toilet-brick', ...toilet });
    }
  }
  return {
    id: 'cell-row-four', origin: { ...origin }, width, height,
    wallSquares, doorSquares, zones, zone: zones[0]!, objects,
  };
}
