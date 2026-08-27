import { DOOR_EDGE_NUMERIC_ID } from '../../src/simulation/construction/definition';
import { DoorConstructionService } from '../../src/simulation/construction/door-construction';
import type { DoorRegistry } from '../../src/simulation/navigation/door';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import type { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * Walls a rectangle's perimeter in a fixture world, so that
 * `RoomZoningService.zone` will accept it as an `enclosed` room.
 *
 * ## Why this helper exists at all
 *
 * `zone` used to accept a room whose perimeter was open and merely report the
 * fact on the outcome. It now **refuses** one whose definition authors an
 * `enclosed` requirement — the owner's ruling, recorded in the ADR "Must a
 * zoned room be enclosed" — and 17 of the 18 shipped room definitions author
 * it, `room.cell` and `room.canteen` among them.
 *
 * Every integration fixture in this repository zones its rooms over the starter
 * prison's open ground, because until that ruling there was nothing to make it
 * do otherwise. Measured when the refusal landed: about 104 tests in 16 files
 * went red, and not one of them was a test *of* enclosure — they are tests of
 * intake, object placement, meals, incidents, removal and the save round trip,
 * each of which now needs its rooms to be rooms before it can begin.
 *
 * One helper rather than the same twelve lines in twelve files, so that the
 * reason lives in one place and a fixture cannot quietly wall three sides.
 *
 * ## What it is not
 *
 * **It is not a substitute for the construction path.** A player buys bricks
 * and waits for one `wall-brick` order per segment; this writes the edges those
 * completed orders would have written. That is the right shortcut for a file
 * whose subject is something else, and the wrong one for a file whose subject
 * is construction — `tests/integration/door-construction-loop.test.ts` says so
 * about itself and must keep going the long way round.
 *
 * ## The two edges, and the two neighbours
 *
 * `SparseWorld` stores a **north** edge and a **west** edge per tile, so a
 * rectangle's south boundary is the north edge of the row *below* it and its
 * east boundary is the west edge of the column to its *right* — tiles outside
 * the rectangle. Two consequences a caller has to know:
 *
 * - `setTopEdge`/`setLeftEdge` **materialise** the chunk they write into,
 *   unlike the getters `roomPerimeterEnclosure` reads through. Never call this
 *   for a rectangle a test wants refused `out-of-bounds`: it would give that
 *   rectangle a chunk to land in.
 * - Two rectangles that share a boundary share the stored edge, so walling both
 *   is idempotent on the shared side. That is the same fact that makes adjacent
 *   rooms subdivision rather than double-walling in play.
 *
 * ## The door, which is not optional in practice
 *
 * **A perimeter with no gap in it is a room nobody can walk into.** That is not
 * a quirk of the fixture, it is the thing itself: `buildNavigationGraph` reads
 * the edge layers, and a wall on all four sides is impassable. It was measured
 * the moment these fixtures were first walled --
 * `tests/integration/own-accommodation-claim-restore.test.ts` failed with *"No
 * own-accommodation action was performed before tick 3000"*, because the
 * prisoner housed in the cell could no longer reach it.
 *
 * So `options.doors` puts a door in one perimeter segment, and a caller whose
 * test has anybody walk into the room needs it. A door is what makes a room
 * both `sealed` and enterable: `roomPerimeterEnclosure` sees a non-zero edge
 * value and answers `sealed`, while `buildNavigationGraph` reads `DoorRegistry`
 * *before* it reads the edge value and answers "crossable".
 *
 * What it writes is exactly what a completed `door-wooden` order writes --
 * `DOOR_EDGE_NUMERIC_ID` into the edge layer (`finalizeConstruction`'s half)
 * and a registered `DoorDefinition` (`DoorConstructionService`'s half, called
 * here rather than reimplemented, so the two cannot drift). It goes on the
 * rectangle's **south** boundary at its left column -- stored, as always, as
 * the north edge of the row below -- which is a fixed choice so that two runs
 * of a fixture put the door in the same place.
 *
 * South rather than north, and this was measured too. Several fixtures zone
 * their cells at `y: 0`, on the top row of the one chunk a new prison owns; a
 * door in a rectangle's *north* wall there opens onto `y = -1`, which is not
 * in the materialised world, so the room stays unreachable and
 * `contended-canteen-meal-fallback` reported six prisoners who ate in the
 * canteen and never once slept or used a toilet. A caller whose rectangle sits
 * on the world's *southern* frontier has the mirror problem and needs
 * `doorSide: 'north'`.
 */
export function wallRoomPerimeter(
  world: SparseWorld,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  options?: {
    /** Hand this the session's registry to put a door in the wall, so the room can be walked into. */
    readonly doors?: DoorRegistry;
    /** Which boundary the door goes in. `'south'` by default; see the note above on why. */
    readonly doorSide?: 'north' | 'south';
    /** The wall edge value. Any non-zero id seals; the default is arbitrary and nothing reads which. */
    readonly edgeValue?: number;
  },
): void {
  const edgeValue = options?.edgeValue ?? 7;
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

  for (let x = rect.x; x <= right; x += 1) {
    world.setTopEdge(tile(x, rect.y), edgeValue);
    world.setTopEdge(tile(x, bottom + 1), edgeValue);
  }
  for (let y = rect.y; y <= bottom; y += 1) {
    world.setLeftEdge(tile(rect.x, y), edgeValue);
    world.setLeftEdge(tile(right + 1, y), edgeValue);
  }

  if (options?.doors === undefined) return;
  // Both are stored as a *north* edge: the rectangle's south boundary is the
  // north edge of the row below it.
  const doorway = options.doorSide === 'north' ? tile(rect.x, rect.y) : tile(rect.x, bottom + 1);
  // Registration first: if the edge already holds a door -- two adjacent rooms
  // sharing a wall, walled twice -- the service answers `false` and the edge
  // value it already carries is left as it is.
  if (new DoorConstructionService(options.doors).onDoorOrderCompleted('door-wooden', doorway, 'north')) {
    world.setTopEdge(doorway, DOOR_EDGE_NUMERIC_ID);
  }
}
