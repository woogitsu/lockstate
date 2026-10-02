import { describe, expect, it } from 'vitest';
import { squareRun } from '../../src/rendering/build/square-picking';

describe('whole-square wall gesture', () => {
  it('keeps a horizontal drag on the same row and includes both end squares', () => {
    expect(squareRun({ x: 4, y: 7 }, { x: 7, y: 7 })).toEqual([
      { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 7, y: 7 },
    ]);
  });

  it('snaps a slightly diagonal drag to its dominant axis', () => {
    expect(squareRun({ x: 4, y: 7 }, { x: 8, y: 8 })).toEqual([
      { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 7, y: 7 }, { x: 8, y: 7 },
    ]);
  });

  it('builds upward and refuses noninteger tile positions', () => {
    expect(squareRun({ x: 2, y: 3 }, { x: 2, y: 1 })).toEqual([
      { x: 2, y: 3 }, { x: 2, y: 2 }, { x: 2, y: 1 },
    ]);
    expect(() => squareRun({ x: 2.5, y: 3 }, { x: 2, y: 1 })).toThrow(RangeError);
  });
});
