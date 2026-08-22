import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERRAIN_DEFINITIONS,
  TerrainRegistry,
} from '../../src/simulation/world';

describe('terrain definitions and registry', () => {
  it('initializes with valid default definitions and stable numeric IDs', () => {
    const registry = new TerrainRegistry();
    expect(registry.has('dirt')).toBe(true);
    expect(registry.has('grass')).toBe(true);
    expect(registry.has('water')).toBe(true);
    expect(registry.has('rock')).toBe(true);

    const dirt = registry.requireById('dirt');
    expect(dirt.numericId).toBe(0);
    expect(dirt.buildable).toBe(true);
    expect(dirt.walkable).toBe(true);

    const water = registry.requireById('water');
    expect(water.numericId).toBe(5);
    expect(water.buildable).toBe(false);
    expect(water.walkable).toBe(false);
    expect(water.isWater).toBe(true);

    expect(registry.requireByNumericId(0).id).toBe('dirt');
    expect(registry.requireByNumericId(5).id).toBe('water');
  });

  it('rejects duplicate IDs or duplicate numeric IDs', () => {
    const registry = new TerrainRegistry([]);
    registry.register({
      id: 'sand',
      numericId: 10,
      name: 'Sand',
      buildable: true,
      walkable: true,
      movementCost: 1.1,
      isWater: false,
    });

    expect(() =>
      registry.register({
        id: 'sand',
        numericId: 11,
        name: 'Sand Duplicate ID',
        buildable: true,
        walkable: true,
        movementCost: 1.0,
        isWater: false,
      }),
    ).toThrow(/Duplicate terrain id/);

    expect(() =>
      registry.register({
        id: 'mud',
        numericId: 10,
        name: 'Mud Duplicate Numeric',
        buildable: true,
        walkable: true,
        movementCost: 1.5,
        isWater: false,
      }),
    ).toThrow(/Duplicate terrain numericId/);
  });

  it('rejects invalid numeric IDs outside [0, 255]', () => {
    const registry = new TerrainRegistry([]);
    expect(() =>
      registry.register({
        id: 'invalid',
        numericId: 256,
        name: 'Invalid',
        buildable: true,
        walkable: true,
        movementCost: 1.0,
        isWater: false,
      }),
    ).toThrow(RangeError);
  });
});
