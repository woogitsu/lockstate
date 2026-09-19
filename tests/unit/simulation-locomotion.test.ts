import { describe, expect, it } from 'vitest';
import {
  createWalkReading,
  DEFAULT_WALK_SUBTILE_UNITS_PER_TICK,
  LOCOMOTION_SUBTILE_UNITS,
  LocomotionStore,
} from '../../src/simulation/locomotion';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { OPEN_GROUND } from '../helpers/open-ground';

/**
 * The walk itself, with no prison around it
 * ([ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
 *
 * `LocomotionStore` is where the decision lives that #414's *"actors teleport"*
 * was about: before it, a resolved route was applied to the position component
 * in one statement and no cadence on the render channel could turn that into
 * walking. Everything here is a plain value, so the rule is testable without a
 * kernel, a world or a worker -- which is also why the integration side of it
 * (`tests/integration/prisoner-walks-the-route.test.ts`) can be about the
 * prison rather than about the arithmetic.
 */

const tile = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/** Four tiles east, origin first, the shape `routeWaypoints` produces. */
const EASTWARD = [tile(3, 7), tile(4, 7), tile(5, 7), tile(6, 7)];

interface Written {
  readonly key: number;
  readonly tile: TilePosition;
}

function drive(store: LocomotionStore, ticks: number): { readonly written: Written[]; readonly arrived: number[] } {
  const written: Written[] = [];
  const arrived: number[] = [];
  for (let n = 0; n < ticks; n += 1) {
    store.advance(1, OPEN_GROUND, (key, position) => written.push({ key, tile: position }), (keys) => arrived.push(...keys));
  }
  return { written, arrived };
}

describe('a walk covers the tiles between, one at a time', () => {
  it('writes each waypoint exactly once, in order, and reports the arrival on the tick it happens', () => {
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS / 2); // two ticks a tile, so the sub-tile state is observable
    expect(store.beginWalk(1, EASTWARD)).toBe(false);
    expect(store.isWalking(1)).toBe(true);

    const { written, arrived } = drive(store, 6);

    // Three legs at two ticks each: the origin is where the actor already is
    // and is never written, and the destination is written once.
    expect(written).toEqual([
      { key: 1, tile: tile(4, 7) },
      { key: 1, tile: tile(5, 7) },
      { key: 1, tile: tile(6, 7) },
    ]);
    expect(arrived).toEqual([1]);
    expect(store.isWalking(1)).toBe(false);
    expect(store.walkingCount).toBe(0);
  });

  it('reads a position halfway between two tiles, with a velocity and a heading', () => {
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS / 2);
    store.beginWalk(1, EASTWARD);
    store.advance(1, OPEN_GROUND, () => {}, () => {});

    // The owner's position store still says tile 3: the actor has not crossed
    // into tile 4 yet, and that is exactly the state the sub-tile reading
    // exists to describe.
    const reading = store.read(1, 3, 7, createWalkReading());
    expect(reading).toEqual({
      subX: 3 * LOCOMOTION_SUBTILE_UNITS + LOCOMOTION_SUBTILE_UNITS / 2,
      subY: 7 * LOCOMOTION_SUBTILE_UNITS,
      velocitySubX: LOCOMOTION_SUBTILE_UNITS / 2,
      velocitySubY: 0,
      headingX: 1,
      headingY: 0,
    });
  });

  it('keeps the heading after the walk ends, so a standing actor faces the way it came', () => {
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS);
    store.beginWalk(1, [tile(2, 2), tile(2, 1)]); // one tile north
    drive(store, 1);

    const reading = store.read(1, 2, 1, createWalkReading());
    expect(reading).toEqual({
      subX: 2 * LOCOMOTION_SUBTILE_UNITS,
      subY: 1 * LOCOMOTION_SUBTILE_UNITS,
      velocitySubX: 0,
      velocitySubY: 0,
      headingX: 0,
      headingY: -1,
    });
  });

  it('reports an actor with no walk as standing exactly on the tile it was handed', () => {
    const store = new LocomotionStore();
    expect(store.read(9, -4, 11, createWalkReading())).toEqual({
      subX: -4 * LOCOMOTION_SUBTILE_UNITS,
      subY: 11 * LOCOMOTION_SUBTILE_UNITS,
      velocitySubX: 0,
      velocitySubY: 0,
      headingX: 0,
      headingY: 0,
    });
  });

  it('arrives immediately, and stores no walk, for a route that is one waypoint long', () => {
    const store = new LocomotionStore();
    expect(store.beginWalk(4, [tile(1, 1)])).toBe(true);
    expect(store.isWalking(4)).toBe(false);
    expect(store.walkingCount).toBe(0);
  });

  it('cannot overshoot the destination however much of the tick is left over', () => {
    // A tick's worth of movement is four whole tiles; the route is three legs.
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS * 4);
    store.beginWalk(1, EASTWARD);
    const { written, arrived } = drive(store, 1);

    expect(written.map((entry) => entry.tile)).toEqual([tile(4, 7), tile(5, 7), tile(6, 7)]);
    expect(arrived).toEqual([1]);
  });

  it('refuses a route whose legs are not one tile along one axis, rather than cutting the corner', () => {
    const store = new LocomotionStore();
    // `neighbors` offers four neighbours, so a diagonal cannot come out of the
    // router -- and walking one would take an actor through the corner of a
    // wall with nothing reporting it.
    expect(() => store.beginWalk(1, [tile(0, 0), tile(1, 1)])).toThrow(/one tile along one axis/);
    expect(() => store.beginWalk(1, [tile(0, 0), tile(4, 0)])).toThrow(/one tile along one axis/);
    expect(() => store.beginWalk(1, [])).toThrow(/at least the tile it starts on/);
  });

  it('hands simultaneous arrivals over in ascending key order, whatever order the walks began in', () => {
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS);
    // Begun highest-first, so insertion order and key order disagree.
    for (const key of [7, 2, 5]) store.beginWalk(key, [tile(0, 0), tile(1, 0)]);

    const { arrived } = drive(store, 1);

    // ADR 0005's canonical entity order. The *owner* re-sorts by need urgency
    // (ADR 0062, `ActionSystem.onWalksArrived`), which is why this is handed
    // over as a set rather than one key at a time -- but a total order out of
    // this module is what stops "whoever set off first" being the fallback.
    expect(arrived).toEqual([2, 5, 7]);
  });

  it('forgets a walk and its heading on `forget`, so a recycled key inherits nothing', () => {
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS);
    store.beginWalk(1, [tile(0, 0), tile(0, 1)]);
    drive(store, 1);
    expect(store.read(1, 0, 1, createWalkReading()).headingY).toBe(1);

    store.forget(1);
    expect(store.read(1, 0, 1, createWalkReading()).headingY).toBe(0);
  });

  it('leaves a cancelled walker on the tile it had reached, and stops moving it', () => {
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS);
    store.beginWalk(1, EASTWARD);
    drive(store, 1);
    store.cancelWalk(1);

    const { written, arrived } = drive(store, 5);
    expect(written).toEqual([]);
    expect(arrived).toEqual([]);
    expect(store.isWalking(1)).toBe(false);
  });

  it('refuses a leg the world closed under it, and leaves the walker on the tile it had reached', () => {
    // The store-level half of the finding
    // `tests/integration/wall-built-mid-walk.test.ts` reproduces through the
    // real command path: a route calculated against one tick's world does not
    // entitle its walker to a later tick's.
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS);
    const written: Written[] = [];
    const arrived: number[] = [];
    // Closed *after* the walk began, which is the whole shape of the defect:
    // `beginWalk` had no complaint about this route when it was handed over.
    let closedLeg: readonly [TilePosition, TilePosition] | undefined;
    const canCross = (_key: number, from: TilePosition, to: TilePosition): boolean =>
      closedLeg === undefined || !(from.x === closedLeg[0].x && from.y === closedLeg[0].y && to.x === closedLeg[1].x && to.y === closedLeg[1].y);
    const step = (ticks: number): void => {
      for (let n = 0; n < ticks; n += 1) {
        store.advance(1, canCross, (key, position) => written.push({ key, tile: position }), (keys) => arrived.push(...keys));
      }
    };

    store.beginWalk(1, EASTWARD);
    step(1);
    expect(written.map((entry) => `${String(entry.tile.x)},${String(entry.tile.y)}`)).toEqual(['4,7']);

    closedLeg = [tile(5, 7), tile(6, 7)];
    step(4);

    // It walked the leg that was still open and stopped at the one that was
    // not. Asserting the tiles rather than a count, because a walker that
    // never moved again after the first tick would satisfy a count.
    expect(written.map((entry) => `${String(entry.tile.x)},${String(entry.tile.y)}`)).toEqual(['4,7', '5,7']);
    expect(arrived, 'a walker stopped by a wall was reported as having arrived').toEqual([]);
    expect(store.isWalking(1)).toBe(false);
    expect(store.walkingCount).toBe(0);
  });

  it('leaves a refused walker exactly on its tile rather than part-way into the wall', () => {
    // Two ticks a tile, so there is a sub-tile state to get wrong: the actor
    // spends one tick half-way across the leg before the refusal is asked.
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS / 2);
    store.beginWalk(1, [tile(0, 0), tile(1, 0)]);
    store.advance(1, () => false, () => {});
    // Still mid-leg: nothing has been refused yet, because nothing has tried
    // to cross. This is the tick that makes the next assertion non-vacuous.
    expect(store.read(1, 0, 0, createWalkReading()).subX).toBe(LOCOMOTION_SUBTILE_UNITS / 2);

    store.advance(1, () => false, () => {});
    const reading = store.read(1, 0, 0, createWalkReading());
    expect(reading.subX, 'a refused walker was left inside the edge it was refused').toBe(0);
    expect(reading.velocitySubX, 'a stopped walker still had a velocity to draw').toBe(0);
  });

  it('asks about a leg once, when it is crossed, and not once per tick', () => {
    // The cost claim on `advance`, measured rather than asserted in prose: the
    // per-tick price of the re-validation is one predicate call per *tile
    // crossed*, so at the shipped speed it is one call every two ticks per
    // walker and none at all for a standing population.
    const store = new LocomotionStore(LOCOMOTION_SUBTILE_UNITS / 2);
    const asked: string[] = [];
    const canCross = (_key: number, from: TilePosition, to: TilePosition): boolean => {
      asked.push(`${String(from.x)},${String(from.y)}->${String(to.x)},${String(to.y)}`);
      return true;
    };

    store.beginWalk(1, EASTWARD);
    for (let n = 0; n < 6; n += 1) store.advance(1, canCross, () => {});
    expect(asked).toEqual(['3,7->4,7', '4,7->5,7', '5,7->6,7']);

    // Arrived: no walk, so no question, however many ticks pass.
    for (let n = 0; n < 10; n += 1) store.advance(1, canCross, () => {});
    expect(asked).toHaveLength(3);
  });

  it('walks at the documented speed: two ticks a tile at the shipped default', () => {
    // Pinned rather than derived, because the number is a balance decision ADR
    // 0059 argues for at length and a silent change to it changes how a prison
    // plays: at half this speed a prison with a shower room and a yard starved
    // its prisoner to hunger 0, measured, because a journey outlasted the
    // 100-tick regime block that had sent them on it.
    expect(LOCOMOTION_SUBTILE_UNITS / DEFAULT_WALK_SUBTILE_UNITS_PER_TICK).toBe(2);
  });
});
