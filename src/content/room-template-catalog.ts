/** Player-authored plans use occupied squares; the simulation never infers them from a rendered wall face. */
export interface TemplateSquare {
  readonly x: number;
  readonly y: number;
}

export interface TemplateDoorSquare extends TemplateSquare {
  /** A north-facing doorway uses the north edge of the tile just inside the room. */
  readonly orderTile?: TemplateSquare;
}

export interface RoomTemplatePlan {
  readonly id: AuthoredRoomTemplateId;
  readonly origin: TemplateSquare;
  readonly width: number;
  readonly height: number;
  readonly wallSquares: readonly TemplateSquare[];
  readonly doorSquares: readonly TemplateDoorSquare[];
  readonly zone: { readonly roomId: 'room.cell' | 'room.shower-room'; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Every separately designated room; `zone` retains the first for older readers. */
  readonly zones: readonly RoomTemplatePlan['zone'][];
  readonly objects: readonly { readonly buildableId: RoomTemplateObjectId; readonly x: number; readonly y: number }[];
}

export const ROOM_TEMPLATE_IDS = ['cell-basic', 'cell-large', 'shower-room'] as const;
// The four-cell block is accepted by the simulation before its HUD preset is
// surfaced; the UI catalog adds it once its name and full preview are ready.
export type RoomTemplateId = (typeof ROOM_TEMPLATE_IDS)[number];
export type AuthoredRoomTemplateId = RoomTemplateId | 'cell-row-four';
type RoomTemplateObjectId = 'bed-wooden' | 'toilet-brick' | 'shower-head-brick';

interface TemplateDefinition {
  readonly width: number;
  readonly height: number;
  readonly roomId: RoomTemplatePlan['zone']['roomId'];
  readonly doorX: number;
  readonly objects: readonly { readonly buildableId: RoomTemplateObjectId; readonly x: number; readonly y: number }[];
}

const TEMPLATES: Readonly<Record<(typeof ROOM_TEMPLATE_IDS)[number], TemplateDefinition>> = {
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
    objects: definition.objects.map((object) => ({ buildableId: object.buildableId, ...square(object.x, object.y) })),
  };
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
      const bed = square(cellX + 1, cellY + (northFacing ? 5 : 1));
      const toilet = square(cellX + 2, cellY + (northFacing ? 2 : 4));
      objects.push({ buildableId: 'bed-wooden', ...bed }, { buildableId: 'toilet-brick', ...toilet });
    }
  }
  return {
    id: 'cell-row-four', origin: { ...origin }, width, height,
    wallSquares, doorSquares, zones, zone: zones[0]!, objects,
  };
}
