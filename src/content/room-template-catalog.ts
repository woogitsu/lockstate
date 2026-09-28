/** Player-authored plans use occupied squares; the simulation never infers them from a rendered wall face. */
export interface TemplateSquare {
  readonly x: number;
  readonly y: number;
}

export interface RoomTemplatePlan {
  readonly id: 'cell-basic';
  readonly origin: TemplateSquare;
  readonly width: number;
  readonly height: number;
  readonly wallSquares: readonly TemplateSquare[];
  readonly doorSquares: readonly TemplateSquare[];
  readonly zone: { readonly roomId: 'room.cell'; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly objects: readonly { readonly buildableId: 'bed-wooden' | 'toilet-brick'; readonly x: number; readonly y: number }[];
}

/** The reference Cell has a 2×5 interior enclosed by one-square-thick walls in a 4×7 footprint. */
const CELL_WIDTH = 4;
const CELL_HEIGHT = 7;

/**
 * Returns the complete geometry of one Cell before any order is submitted.
 * A mirrored copy faces the other half of a shared corridor without changing
 * the occupied footprint or moving furniture onto a wall square.
 */
export function instantiateRoomTemplate(
  id: 'cell-basic',
  origin: TemplateSquare,
  options: { readonly mirrorX?: boolean } = {},
): RoomTemplatePlan {
  if (!Number.isSafeInteger(origin.x) || !Number.isSafeInteger(origin.y)) {
    throw new RangeError('Room template origin must use safe integer tile coordinates.');
  }
  const worldX = (localX: number): number => origin.x + (options.mirrorX === true ? CELL_WIDTH - 1 - localX : localX);
  const square = (localX: number, localY: number): TemplateSquare => ({ x: worldX(localX), y: origin.y + localY });
  const wallSquares: TemplateSquare[] = [];
  const doorSquares: TemplateSquare[] = [];

  for (let y = 0; y < CELL_HEIGHT; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) {
      if (x !== 0 && x !== CELL_WIDTH - 1 && y !== 0 && y !== CELL_HEIGHT - 1) continue;
      (x === 1 && y === CELL_HEIGHT - 1 ? doorSquares : wallSquares).push(square(x, y));
    }
  }

  return {
    id,
    origin: { x: origin.x, y: origin.y },
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    wallSquares,
    doorSquares,
    zone: { roomId: 'room.cell', x: origin.x + 1, y: origin.y + 1, width: 2, height: 5 },
    objects: [
      { buildableId: 'bed-wooden', ...square(1, 1) },
      { buildableId: 'toilet-brick', ...square(2, 4) },
    ],
  };
}
