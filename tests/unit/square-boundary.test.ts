import { describe, expect, it } from 'vitest';
import { squareBoundary } from '../../src/simulation/world/square-boundary';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

describe('whole-square construction boundaries (#1585)', () => {
  it('blocks entry to and exit from every face of an occupied wall square', () => {
    const world = new SparseWorld(32);
    world.setSquareStructure(tile(4, 4), 1);
    for (const neighbor of [tile(4, 3), tile(4, 5), tile(3, 4), tile(5, 4)]) {
      expect(squareBoundary(world, neighbor, tile(4, 4))).toBe('wall');
      expect(squareBoundary(world, tile(4, 4), neighbor)).toBe('wall');
    }
    expect(squareBoundary(world, tile(3, 3), tile(4, 3))).toBe('open');
  });

  it('distinguishes a vertical door opening from its closed side faces', () => {
    const world = new SparseWorld(32);
    world.setSquareStructure(tile(4, 4), 2);
    expect(squareBoundary(world, tile(4, 3), tile(4, 4))).toBe('door');
    expect(squareBoundary(world, tile(4, 4), tile(4, 5))).toBe('door');
    expect(squareBoundary(world, tile(3, 4), tile(4, 4))).toBe('wall');
    expect(squareBoundary(world, tile(4, 4), tile(5, 4))).toBe('wall');
  });

  it('rotates a door to east-west passage and refuses nonadjacent probes', () => {
    const world = new SparseWorld(32);
    world.setSquareStructure(tile(4, 4), 3);
    expect(squareBoundary(world, tile(3, 4), tile(4, 4))).toBe('door');
    expect(squareBoundary(world, tile(4, 4), tile(5, 4))).toBe('door');
    expect(squareBoundary(world, tile(4, 3), tile(4, 4))).toBe('wall');
    expect(() => squareBoundary(world, tile(2, 4), tile(4, 4))).toThrow(RangeError);
  });
});
