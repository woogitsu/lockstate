import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A wall the player finishes while somebody is walking towards it is a wall
 * to them too.**
 *
 * ## The finding this file settles
 *
 * Two independent read-only audits of `4c18bc4` reached the same place from
 * different directions: a simulation audit called it a confirmed defect
 * (*"active locomotion routes are not invalidated by later topology changes"*)
 * and a red-team audit refused to call it confirmed, because neither had run
 * anything and neither had shown that a **legitimate player sequence** can
 * leave a walk alive across the construction transition. This file is the
 * producer-side proof the second one was missing, and it is written the way
 * that audit asked for it: the edge is closed through the real
 * `PlaceBuildOrder` command path, not by poking a store.
 *
 * `LocomotionStore.beginWalk` validates the *shape* of a waypoint list --
 * non-empty, one orthogonal tile per leg -- and its own comment says it
 * refuses a malformed route rather than "put actors through walls and report
 * nothing". It retained no geometry version, no door version and no route
 * dependency token, and `advance` incremented progress and wrote the reached
 * tile without asking whether the edge was still crossable. Navigation's cache
 * invalidation is correct and could not help: by then the route has left the
 * navigation subsystem and become locomotion state.
 *
 * ## What was measured before the fix, on this fixture
 *
 * Seed `0x0b1ec7`. The prisoner is admitted at tick 1,500 and its first walk
 * begins at tick **1,541**; the player places the wall on that same tick. The
 * order completes and `topEdge(28, 31)` becomes brick at tick **1,621**, with
 * the prisoner at `(15, 27)` and still walking -- thirteen tiles short of the
 * edge. It crossed that edge at tick **1,657**, thirty-six ticks after the
 * wall was standing, and finished the errand at `(28, 27)`: inside a cell that
 * nothing in the prison could still reach.
 *
 * ## Why the fixture is shaped like this
 *
 * The dominant defect shape in this repository is a guard whose fixture cannot
 * reach the mechanism it names. Here that would be a walk so short that the
 * edge is crossed on the tick it is built, which proves nothing about the
 * window. So the geometry is built to make the window large and to make it
 * *measured* rather than assumed:
 *
 * - The cell sits in the far corner from the arrival tile, so the first errand
 *   is a sixty-one-tile walk -- about 122 ticks at
 *   `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` -- against roughly eighty ticks for a
 *   `wall-brick` order to travel `approved -> materials-pending -> assigned ->
 *   in-progress -> completed` at `ConstructionSystem`'s ten-tick cadence.
 * - `(28, 30)` is walled on its west and east sides, so the cell's doorway is
 *   reachable only from `(28, 31)`. The order therefore closes the one edge
 *   every route into that cell must cross, and the test does not have to guess
 *   which tiles the router chose.
 * - The test asserts the prisoner was **more than one tile short** of the edge
 *   when the wall completed. That is what makes the run non-vacuous: it is the
 *   difference between "walked through a wall" and "crossed on the tick it
 *   appeared".
 *
 * ## Why the oracle is spelled out by hand
 *
 * `blockedEdgeBetween` below reads the two edge slots `SparseWorld` actually
 * stores and the door registry, rather than calling any navigation helper. A
 * fixture that asked the code under test what it thinks is passable would hold
 * for any implementation. This asks the *world* what is standing there.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored 2x3 minimum, in the corner diagonally opposite the arrival tile. */
const CELL_RECT = { x: 28, y: 27, width: 2, height: 3 } as const;
/** Where the cell's doorway is approached from, and the far side of the edge the player closes. */
const APPROACH: TilePosition = { x: 28, y: 31 };
const DOORWAY: TilePosition = { x: 28, y: 30 };

const ARRIVAL = { x: 1, y: 1 } as const;
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 } as const;
const BUILT_BY = 1_500;
const WATCH_UNTIL = 3_000;

/** The wall value `wallRoomPerimeter` writes; arbitrary and non-zero, exactly as that helper documents. */
const FIXTURE_WALL = 7;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

const tile = (x: number, y: number): TilePosition => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/**
 * Whether a wall stands between two orthogonally adjacent tiles *right now*,
 * read straight out of the world.
 *
 * `SparseWorld` stores two edges per tile -- the boundary with the tile to the
 * north and the boundary with the tile to the west (`build-order.ts` argues
 * why only two) -- so the boundary between `(x, y)` and `(x, y + 1)` is the
 * *lower* tile's top edge, and the boundary between `(x, y)` and `(x + 1, y)`
 * is the *right* tile's left edge. A registered door on that slot makes it
 * crossable whatever the edge value says, which is the rule
 * `buildNavigationGraph` and `canStep` both follow and the reason a doorway is
 * not a wall.
 *
 * Returns `undefined` for a pair that is not a single orthogonal step, so a
 * caller that saw a teleport gets a distinguishable answer rather than a
 * silent `false`.
 */
function blockedEdgeBetween(runtime: SimulationRuntime, from: TilePosition, to: TilePosition): boolean | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return undefined;

  const owner = dy === 1 ? to : dy === -1 ? from : dx === 1 ? to : from;
  const side = dy === 0 ? 'left' : 'top';
  if (runtime.navigation.doors.getByEdge(owner, side) !== undefined) return false;
  const value = side === 'top' ? runtime.world.getTopEdge(owner) : runtime.world.getLeftEdge(owner);
  return value !== 0;
}

/**
 * A prison whose only cell is in the opposite corner from the delivery gate,
 * reachable through one tile.
 *
 * The perimeter and the two side walls beside the doorway are written straight
 * into the world, which is what `wallRoomPerimeter` exists for and what every
 * fixture whose subject is something other than construction does. The wall
 * this test is *about* is not: it goes through `PlaceBuildOrder`.
 */
function prisonWithOneDistantCell(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 4 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  // The doorway tile is a cul-de-sac: west and east closed, so the only way in
  // is from the row below. That is what makes the edge the player closes the
  // one edge every route to this cell has to cross.
  runtime.world.setLeftEdge(DOORWAY, FIXTURE_WALL);
  runtime.world.setLeftEdge(tile(DOORWAY.x + 1, DOORWAY.y), FIXTURE_WALL);

  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'bed', packCommand({ type: 'PlaceObject', orderId: 'o-bed', definitionId: 'bed-wooden', x: CELL_RECT.x, y: CELL_RECT.y }));
  submit(runtime, 'toilet', packCommand({ type: 'PlaceObject', orderId: 'o-toilet', definitionId: 'toilet-brick', x: CELL_RECT.x + 1, y: CELL_RECT.y }));
  // Let the furniture orders finish, so the build crew is free for the wall
  // and the wall's eighty ticks are the eighty ticks this test reasons about.
  while (runtime.kernel.tick < BUILT_BY) runtime.kernel.step();

  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  return runtime;
}

interface Observation {
  readonly sealedAtTick: number;
  readonly walkingWhenSealed: boolean;
  readonly tilesShortWhenSealed: number;
  readonly crossings: readonly string[];
  readonly finalTile: TilePosition;
  readonly reachedTiles: number;
}

/**
 * Runs the sequence a player performs -- wait until the prisoner is walking,
 * then place the wall -- and records what the prisoner did with it.
 */
function walkThenWall(): Observation {
  const runtime = prisonWithOneDistantCell();
  const prisoners = runtime.prisoners;
  const index = prisoners.entityStore.getIndex(prisoners.entityStore.getIdByIndex(0));

  while (!prisoners.locomotion.isWalking(index) && runtime.kernel.tick < WATCH_UNTIL) runtime.kernel.step();

  // The player drags a wall across the mouth of the cell corridor while the
  // prisoner is on their way to it. Nothing refuses this: the tile is owned,
  // the bricks are in stock, and ADR 0029 decision 2 gives a traveller no
  // claim on anything.
  submit(runtime, 'wall', packCommand({ type: 'PlaceBuildOrder', orderId: 'o-wall', definitionId: 'wall-brick', x: APPROACH.x, y: APPROACH.y, edge: 'north' }));

  let sealedAtTick = -1;
  let walkingWhenSealed = false;
  let tilesShortWhenSealed = -1;
  let reachedTiles = 0;
  const crossings: string[] = [];
  let previous = tile(prisoners.position.tileX[index]!, prisoners.position.tileY[index]!);

  while (runtime.kernel.tick < WATCH_UNTIL) {
    runtime.kernel.step();
    const current = tile(prisoners.position.tileX[index]!, prisoners.position.tileY[index]!);

    if (sealedAtTick < 0 && blockedEdgeBetween(runtime, APPROACH, DOORWAY) === true) {
      sealedAtTick = runtime.kernel.tick;
      walkingWhenSealed = prisoners.locomotion.isWalking(index);
      tilesShortWhenSealed = Math.abs(current.x - APPROACH.x) + Math.abs(current.y - APPROACH.y);
    }

    if (current.x !== previous.x || current.y !== previous.y) {
      reachedTiles += 1;
      // The question is not "did the prisoner move" but "was that edge
      // standing when they crossed it", asked on the tick of the crossing.
      if (blockedEdgeBetween(runtime, previous, current) !== false) {
        crossings.push(`tick ${String(runtime.kernel.tick)}: (${String(previous.x)}, ${String(previous.y)}) -> (${String(current.x)}, ${String(current.y)})`);
      }
    }
    previous = current;
  }

  return { sealedAtTick, walkingWhenSealed, tilesShortWhenSealed, crossings, finalTile: previous, reachedTiles };
}

describe('a wall finished mid-walk stops the walker', () => {
  it('does not let a prisoner cross an edge that was closed after their route was calculated', () => {
    const observed = walkThenWall();

    // Non-vacuity, first: a run in which the wall never finished, or in which
    // the prisoner had already passed the corridor mouth, would satisfy the
    // invariant below while proving nothing about the window.
    expect(observed.sealedAtTick, 'the wall order never completed, so nothing was tested').toBeGreaterThan(0);
    expect(observed.walkingWhenSealed, 'the prisoner was not walking when the wall completed').toBe(true);
    expect(
      observed.tilesShortWhenSealed,
      'the prisoner was already at the corridor mouth when the wall completed, so this run says nothing about the window',
    ).toBeGreaterThan(1);
    expect(observed.reachedTiles, 'the prisoner never went anywhere').toBeGreaterThan(20);

    /*
     * **The assertion the defect fails.** Before the fix this reported
     * `tick 1657: (28, 31) -> (28, 30)`.
     */
    expect(observed.crossings, 'an actor crossed an edge that was not traversable on the tick it crossed it').toEqual([]);
  });

  it('leaves the prisoner outside a cell nothing can reach any more', () => {
    const observed = walkThenWall();

    const insideCell =
      observed.finalTile.x >= CELL_RECT.x &&
      observed.finalTile.x < CELL_RECT.x + CELL_RECT.width &&
      observed.finalTile.y >= CELL_RECT.y &&
      observed.finalTile.y < CELL_RECT.y + CELL_RECT.height;

    // The player-visible half. The cell's one approach is walled, so a prisoner
    // standing in it got there by walking through the wall -- which is what a
    // player would report as a prisoner ghosting through a build, and which
    // disappears on reload because no save carries a walk.
    expect(insideCell, `the prisoner ended up inside the sealed cell at (${String(observed.finalTile.x)}, ${String(observed.finalTile.y)})`).toBe(false);
  });
});
