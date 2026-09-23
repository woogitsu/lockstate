import { describe, expect, it } from 'vitest';
import { LocomotionStore } from '../../src/simulation/locomotion/locomotion';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { decodeStepPath, encodeStepPath } from '../../src/simulation/world/step-path';

const tile = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/**
 * The encoding a save uses for every tile path it carries (issue #1373): a walk
 * in progress and a cached route. The expected values are written out by hand
 * rather than produced by the encoder, so a wrong letter table fails here.
 */
describe('a step path is its start tile and one letter per orthogonal step', () => {
  const walk = [tile(3, 3), tile(4, 3), tile(4, 4), tile(3, 4), tile(3, 3)];

  it('writes E, S, W and N for x+1, y+1, x-1 and y-1', () => {
    expect(encodeStepPath(walk)).toBe('ESWN');
    expect(encodeStepPath([tile(0, 0)])).toBe('');
  });

  it('reads back the tiles it was written from, start included', () => {
    expect(decodeStepPath(tile(3, 3), 'ESWN')).toEqual(walk);
  });

  it('refuses a leg that is not one orthogonal step, rather than approximating it', () => {
    expect(() => encodeStepPath([tile(0, 0), tile(1, 1)])).toThrow(/not one orthogonal step/);
    expect(() => encodeStepPath([tile(0, 0), tile(0, 0)])).toThrow(/not one orthogonal step/);
    expect(() => decodeStepPath(tile(0, 0), 'EX')).toThrow(RangeError);
  });

  it('carries a walk in progress as its remaining legs, and restores it to the same position', () => {
    const store = new LocomotionStore();
    store.beginWalk(7, [tile(0, 0), tile(1, 0), tile(2, 0), tile(2, 1)]);
    store.advance(3, () => true, () => undefined);
    const snapshot = store.getSnapshot();
    expect(snapshot.walks).toHaveLength(1);
    const [carried] = snapshot.walks;
    expect(carried!.path.length + 1, 'only the legs still ahead').toBeLessThanOrEqual(4);

    const restored = new LocomotionStore();
    restored.loadSnapshot(snapshot);
    expect(restored.getSnapshot()).toEqual(snapshot);
  });
});
