import { describe, expect, it } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { validateRoomTemplatePlacement } from '../../src/simulation/construction/room-template-placement';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const originChunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

describe('whole-room placement preflight', () => {
  it('rejects a template with one occupied wall square before writing any other square', () => {
    const world = new SparseWorld(32);
    world.load(originChunk);
    world.setOwned(originChunk, true);
    world.setSquareStructure(tile(10, 20), 1);
    const before = world.snapshot();

    const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 20 });
    expect(validateRoomTemplatePlacement(world, plan)).toEqual({ ok: false, reason: 'structure-occupied', tile: tile(10, 20) });
    expect(world.snapshot()).toEqual(before);
  });

  it('checks the complete footprint, including furniture and interior, against ownership', () => {
    const world = new SparseWorld(32);
    world.load(originChunk);
    world.setOwned(originChunk, true);
    const plan = instantiateRoomTemplate('cell-basic', { x: 29, y: 10 });

    expect(validateRoomTemplatePlacement(world, plan)).toEqual({ ok: false, reason: 'unowned-land', tile: tile(32, 10) });
    expect(world.getSquareStructure(tile(29, 10))).toBe(0);
  });

  it('refuses a room whose only doorway opens onto unowned land outside its footprint', () => {
    const world = new SparseWorld(32);
    world.load(originChunk);
    world.setOwned(originChunk, true);
    const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 25 });
    const before = world.snapshot();

    expect(validateRoomTemplatePlacement(world, plan)).toEqual({
      ok: false, reason: 'unowned-land', tile: tile(11, 32),
    });
    expect(world.snapshot()).toEqual(before);

    const southernChunk = { x: chunkCoordinate(0), y: chunkCoordinate(1) };
    world.load(southernChunk);
    world.setOwned(southernChunk, true);
    expect(validateRoomTemplatePlacement(world, plan)).toEqual({ ok: true });
  });

  it('accepts a free owned footprint and refuses existing furniture through the occupancy reader', () => {
    const world = new SparseWorld(32);
    world.load(originChunk);
    world.setOwned(originChunk, true);
    const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 20 });

    expect(validateRoomTemplatePlacement(world, plan)).toEqual({ ok: true });
    expect(validateRoomTemplatePlacement(world, plan, ({ x, y }) => x === 11 && y === 21)).toEqual({
      ok: false, reason: 'object-occupied', tile: tile(11, 21),
    });
  });

  it('refuses a claimed but not yet built square before creating any template order', () => {
    const world = new SparseWorld(32);
    world.load(originChunk);
    world.setOwned(originChunk, true);
    const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 20 });
    const before = world.snapshot();

    expect(validateRoomTemplatePlacement(
      world,
      plan,
      () => false,
      ({ x, y }) => x === 12 && y === 20,
    )).toEqual({ ok: false, reason: 'structure-occupied', tile: tile(12, 20) });
    expect(world.snapshot()).toEqual(before);
  });

  it('rejects an existing legacy edge wall inside the template footprint', () => {
    const world = new SparseWorld(32);
    world.load(originChunk);
    world.setOwned(originChunk, true);
    world.setTopEdge(tile(11, 21), 1);
    const plan = instantiateRoomTemplate('cell-basic', { x: 10, y: 20 });

    expect(validateRoomTemplatePlacement(world, plan)).toEqual({
      ok: false, reason: 'structure-occupied', tile: tile(11, 21),
    });
  });
});
