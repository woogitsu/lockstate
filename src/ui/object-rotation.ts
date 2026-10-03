/** Main-thread presentation state; the worker validates its command vocabulary. */
export type ObjectQuarterTurns = 0 | 1 | 2 | 3;

export function nextObjectQuarterTurns(value: ObjectQuarterTurns): ObjectQuarterTurns {
  return ((value + 1) % 4) as ObjectQuarterTurns;
}

export function rotatedObjectFootprint(footprint: { readonly width: number; readonly height: number }, quarterTurns: ObjectQuarterTurns): { readonly width: number; readonly height: number } {
  return quarterTurns % 2 === 0 ? footprint : { width: footprint.height, height: footprint.width };
}
