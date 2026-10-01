/** Player-authored plans use occupied squares; the simulation never infers them from a rendered wall face. */
export interface TemplateSquare {
  readonly x: number;
  readonly y: number;
}

export interface RoomTemplatePlan {
  readonly id: RoomTemplateId;
  readonly origin: TemplateSquare;
  readonly width: number;
  readonly height: number;
  readonly wallSquares: readonly TemplateSquare[];
  readonly doorSquares: readonly TemplateSquare[];
  readonly zone: { readonly roomId: 'room.cell' | 'room.shower-room'; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly objects: readonly { readonly buildableId: RoomTemplateObjectId; readonly x: number; readonly y: number }[];
}

export type RoomTemplateId = 'cell-basic' | 'cell-large' | 'shower-room';
type RoomTemplateObjectId = 'bed-wooden' | 'toilet-brick' | 'shower-head-brick';

interface TemplateDefinition {
  readonly width: number;
  readonly height: number;
  readonly roomId: RoomTemplatePlan['zone']['roomId'];
  readonly doorX: number;
  readonly objects: readonly { readonly buildableId: RoomTemplateObjectId; readonly x: number; readonly y: number }[];
}

const TEMPLATES: Readonly<Record<RoomTemplateId, TemplateDefinition>> = {
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
  id: RoomTemplateId,
  origin: TemplateSquare,
  options: { readonly mirrorX?: boolean } = {},
): RoomTemplatePlan {
  if (!Number.isSafeInteger(origin.x) || !Number.isSafeInteger(origin.y)) {
    throw new RangeError('Room template origin must use safe integer tile coordinates.');
  }
  const definition = TEMPLATES[id];
  if (definition === undefined) throw new RangeError(`Unknown room template: ${id}`);
  const { width, height } = definition;
  const worldX = (localX: number): number => origin.x + (options.mirrorX === true ? width - 1 - localX : localX);
  const square = (localX: number, localY: number): TemplateSquare => ({ x: worldX(localX), y: origin.y + localY });
  const wallSquares: TemplateSquare[] = [];
  const doorSquares: TemplateSquare[] = [];

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
    objects: definition.objects.map((object) => ({ buildableId: object.buildableId, ...square(object.x, object.y) })),
  };
}
