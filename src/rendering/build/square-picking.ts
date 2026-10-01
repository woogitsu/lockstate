import { MAX_RUN_SEGMENTS } from './edge-picking';

export interface SquareTarget {
  readonly x: number;
  readonly y: number;
}

/** A wall gesture addresses occupied tiles, never a sub-tile edge or raised face. */
export function squareRun(start: SquareTarget, end: SquareTarget): readonly SquareTarget[] {
  if (![start.x, start.y, end.x, end.y].every(Number.isSafeInteger)) {
    throw new RangeError('A square gesture needs integer tile coordinates.');
  }
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const length = Math.min(MAX_RUN_SEGMENTS - 1, horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y));
  const step = horizontal ? Math.sign(end.x - start.x) : Math.sign(end.y - start.y);
  const squares: SquareTarget[] = [];
  for (let i = 0; i <= length; i += 1) {
    squares.push(horizontal ? { x: start.x + step * i, y: start.y } : { x: start.x, y: start.y + step * i });
  }
  return squares;
}

/** The angled scene reports exact occupied squares to the same HUD command path. */
export interface SquareBuildToolPort {
  isArmed(): boolean;
  usesSquareFootprint(): boolean;
  placeSquares(squares: readonly SquareTarget[]): void;
  targetSquares?(squares: readonly SquareTarget[] | undefined): void;
}
