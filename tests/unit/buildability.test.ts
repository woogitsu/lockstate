import { describe, expect, it } from 'vitest';
import {
  canBuildAt,
  createParcelRect,
  SparseWorld,
  tileCoordinate,
} from '../../src/simulation/world';

describe('buildability checks', () => {
  it('rejects construction on unowned land', () => {
    const world = new SparseWorld(32);
    const tile = { x: tileCoordinate(5), y: tileCoordinate(5) };

    const result = canBuildAt(world, tile);
    expect(result).toEqual({ buildable: false, reason: 'unowned_land' });
  });

  it('allows construction on owned parcel with buildable terrain', () => {
    const world = new SparseWorld(32);
    world.registerParcel({
      id: 'main',
      bounds: createParcelRect(0, 0, 16, 16),
      basePrice: 1000,
    });
    world.setParcelOwned('main', true);

    const insideTile = { x: tileCoordinate(5), y: tileCoordinate(5) };
    const outsideTile = { x: tileCoordinate(20), y: tileCoordinate(20) };

    expect(canBuildAt(world, insideTile)).toEqual({ buildable: true, reason: 'ok' });
    expect(canBuildAt(world, outsideTile)).toEqual({ buildable: false, reason: 'unowned_land' });
  });

  it('rejects construction on unbuildable terrain (rock, water) even if land is owned', () => {
    const world = new SparseWorld(32);
    world.registerParcel({
      id: 'main',
      bounds: createParcelRect(0, 0, 32, 32),
      basePrice: 1000,
    });
    world.setParcelOwned('main', true);

    const rockTile = { x: tileCoordinate(2), y: tileCoordinate(2) };
    const waterTile = { x: tileCoordinate(3), y: tileCoordinate(3) };

    world.setTerrain(rockTile, 'rock');
    world.setTerrain(waterTile, 'water');

    expect(canBuildAt(world, rockTile)).toEqual({ buildable: false, reason: 'unbuildable_terrain' });
    expect(canBuildAt(world, waterTile)).toEqual({ buildable: false, reason: 'water_blocked' });
    expect(canBuildAt(world, waterTile, { allowWater: true, requiresBuildableTerrain: false })).toEqual({
      buildable: true,
      reason: 'ok',
    });
  });

  it('handles buildability across multi-chunk parcels and negative coordinates', () => {
    const world = new SparseWorld(32);
    // Parcel spanning from x: -10..30 (crosses chunk -1 and chunk 0)
    world.registerParcel({
      id: 'cross-chunk',
      bounds: createParcelRect(-10, -10, 40, 40),
      basePrice: 5000,
    });
    world.setParcelOwned('cross-chunk', true);

    const negTile = { x: tileCoordinate(-5), y: tileCoordinate(-5) };
    const posTile = { x: tileCoordinate(15), y: tileCoordinate(15) };
    const outTile = { x: tileCoordinate(35), y: tileCoordinate(35) };

    expect(canBuildAt(world, negTile)).toEqual({ buildable: true, reason: 'ok' });
    expect(canBuildAt(world, posTile)).toEqual({ buildable: true, reason: 'ok' });
    expect(canBuildAt(world, outTile)).toEqual({ buildable: false, reason: 'unowned_land' });
  });
});
