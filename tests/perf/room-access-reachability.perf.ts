import { describe, expect, it } from 'vitest';

import { DoorRegistry } from '../../src/simulation/navigation/door';
import { buildNavigationGraph, type NavigationGraph } from '../../src/simulation/navigation/region-graph';
import {
  roomPerimeterEnclosure,
  roomPerimeterHoldsDoor,
  type TileRectangle,
} from '../../src/simulation/rooms/enclosure';
import { roomAccess, roomReachability } from '../../src/simulation/rooms/reachability';
import { chunkCoordinate, tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { SparseWorld, type ChunkState } from '../../src/simulation/world/sparse-world';
import { environmentSummary, formatMs, measureSync, renderTable } from './measure';

/**
 * What answering "can anybody get into this room" costs, against what asking
 * the old question cost (ADR 0108).
 *
 * **The ADR's whole case is that the new answer is CHEAPER than the one it
 * replaces**, because the region partition already exists -- `NavigationSystem`
 * rebuilds it every tick geometry moves, for routing, whether or not anything
 * here reads it. That claim was measured on the ADR's own branch against the
 * rule it published; this repository ships an amended rule (decision 1 as
 * amended to R4, after `tests/research/0108-exterior-anchor-falsifier.research.ts`
 * defeated the published one), which adds a per-ring-tile crossing test to the
 * seed selection. So the claim has to be re-measured against what shipped, and
 * this is that measurement.
 *
 * ## The four columns, and why the third and fourth are both here
 *
 * - **A, the old answer.** `roomPerimeterEnclosure` then `roomPerimeterHoldsDoor`
 *   over every room -- which is exactly what the deleted `roomPerimeterAccess`
 *   did, composed from the two functions it was made of rather than from a
 *   reconstruction of it, so this column cannot drift from the thing it claims
 *   to price.
 * - **B, the graph.** One `buildNavigationGraph`. **Not a cost of this change**
 *   and it must not be read as one: `NavigationSystem.update` calls
 *   `ensureGraph()` every tick and every wall edit bumps `geometryRevision`, so
 *   this is already paid. It is here because a reader who does not see it will
 *   assume it was hidden.
 * - **C, the marginal cost.** The exterior walk once, plus one `reaches()` per
 *   room. This is the column ADR 0108's table calls C and the one its claim is
 *   about.
 * - **D, what actually ships.** A full `roomAccess` pass: A's two perimeter
 *   walks and C's lookup, per room, in the order the function asks them. The
 *   honest "what does the projection now spend" figure, and necessarily above
 *   both A and C.
 *
 * Method is `measure.ts`'s and `docs/BENCHMARKING.md`'s: warmup iterations
 * discarded, then the **minimum** of the measured samples, because preemption
 * on a shared container is one-sided and the minimum is the closest available
 * estimate of uncontended cost.
 *
 * **Reporting only.** Nothing here asserts an elapsed time -- `docs/TESTING.md`
 * forbids proving correctness by the clock and `docs/BENCHMARKING.md` forbids a
 * timing threshold without controlled baselines. The assertions are on the
 * prison: that it has the rooms it says it has, and that the two answers
 * disagree on exactly the rooms that were deliberately walled up.
 */

const CHUNK = 32;
const WALL = 7;
/** Rooms with a 3x3 interior sharing walls, in bands separated by a one-tile corridor row. */
const ROOM_INTERIOR = 3;
const ROOM_STRIDE_X = ROOM_INTERIOR; // shared side walls
const ROOM_STRIDE_Y = ROOM_INTERIOR + 1; // plus the corridor row the doors open onto
/** Every seventh room has the tile outside its door walled in -- the act-4a state #1006 measured. */
const SEALED_EVERY = 7;

/**
 * Two prisons at every size, because the first run of this file found the cost
 * turns on something the ADR's table does not have a column for.
 *
 * `reaches` walks the room's rectangle and **exits on the first tile it finds
 * in a reached region**, so a room somebody can get into costs one lookup and a
 * room nobody can get into costs `width x height` of them. The share of rooms
 * in the second state is therefore the variable, and the `sealEvery: 0` rows
 * are the control that isolates it.
 */
const PRISONS: readonly { readonly side: number; readonly sealEvery: number }[] = [
  { side: 1, sealEvery: SEALED_EVERY },
  { side: 2, sealEvery: SEALED_EVERY },
  { side: 4, sealEvery: SEALED_EVERY },
  { side: 8, sealEvery: SEALED_EVERY },
  { side: 1, sealEvery: 0 },
  { side: 2, sealEvery: 0 },
  { side: 4, sealEvery: 0 },
  { side: 8, sealEvery: 0 },
];

function tile(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

function wallRectangle(world: SparseWorld, rect: TileRectangle): void {
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  for (let x = rect.x; x <= right; x += 1) {
    world.setTopEdge(tile(x, rect.y), WALL);
    world.setTopEdge(tile(x, bottom + 1), WALL);
  }
  for (let y = rect.y; y <= bottom; y += 1) {
    world.setLeftEdge(tile(rect.x, y), WALL);
    world.setLeftEdge(tile(right + 1, y), WALL);
  }
}

interface CellBlock {
  readonly world: SparseWorld;
  readonly doors: DoorRegistry;
  readonly rooms: readonly TileRectangle[];
  /** Indices into `rooms` whose door opens onto a tile deliberately boxed in. */
  readonly sealed: ReadonlySet<number>;
  readonly graph: NavigationGraph;
}

/**
 * A cell block over `side x side` chunks: rooms on a lattice, one door each on
 * the room's south wall opening onto the corridor row below it, and every
 * seventh of those corridor tiles boxed in on its three other sides.
 */
function cellBlock(side: number, sealEvery: number): CellBlock {
  const world = new SparseWorld(CHUNK);
  const chunks: ChunkState[] = [];
  for (let cy = 0; cy < side; cy += 1) {
    for (let cx = 0; cx < side; cx += 1) {
      chunks.push(world.load({ x: chunkCoordinate(cx), y: chunkCoordinate(cy) }));
    }
  }

  const span = side * CHUNK;
  const doors = new DoorRegistry();
  const rooms: TileRectangle[] = [];
  const sealed = new Set<number>();
  let index = 0;
  for (let y = 0; y + ROOM_STRIDE_Y <= span; y += ROOM_STRIDE_Y) {
    for (let x = 0; x + ROOM_INTERIOR < span; x += ROOM_STRIDE_X) {
      const room: TileRectangle = { x, y, width: ROOM_INTERIOR, height: ROOM_INTERIOR };
      wallRectangle(world, room);
      const corridor = tile(x + 1, y + ROOM_INTERIOR);
      doors.register({
        id: `door-${String(index)}`,
        position: corridor,
        side: 'top',
        state: 'closed',
        requiredSecurityClearance: 0,
        costMultiplier: 1,
      });
      if (sealEvery > 0 && index % sealEvery === 0) {
        // The one tile the door opens onto, boxed in: a door that leads nowhere.
        world.setTopEdge(tile(corridor.x, corridor.y + 1), WALL);
        world.setLeftEdge(corridor, WALL);
        world.setLeftEdge(tile(corridor.x + 1, corridor.y), WALL);
        sealed.add(index);
      }
      rooms.push(room);
      index += 1;
    }
  }

  return { world, doors, rooms, sealed, graph: buildNavigationGraph(world, doors, chunks) };
}

/** Column A: the answer `roomPerimeterAccess` gave before ADR 0108, composed from the two functions it was made of. */
function perimeterOnly(block: CellBlock, room: TileRectangle): 'gap' | 'doorway' | 'no-way-in' {
  if (roomPerimeterEnclosure(block.world, room).enclosure === 'open') return 'gap';
  return roomPerimeterHoldsDoor(block.doors, room) ? 'doorway' : 'no-way-in';
}

describe('what ADR 0108 costs against what it replaces', () => {
  it('prices the old edge scan, the graph, the marginal walk and the shipped answer', () => {
    const rows: string[][] = [];
    const lines: string[] = [];

    for (const { side, sealEvery } of PRISONS) {
      const block = cellBlock(side, sealEvery);
      const { world, doors, graph, rooms } = block;

      // The prison is the assertion, not the clock.
      expect(rooms.length, 'the lattice must produce rooms at all').toBeGreaterThan(0);
      expect(graph.portals.length, 'every room contributes one door portal').toBe(rooms.length);

      // A: today's answer, every room.
      const edgeScan = measureSync(3, 7, () => {
        for (const room of rooms) perimeterOnly(block, room);
      });

      // B: the graph, which is already paid for by routing.
      const chunkStates: ChunkState[] = [];
      for (let cy = 0; cy < side; cy += 1) {
        for (let cx = 0; cx < side; cx += 1) {
          chunkStates.push(world.getChunk({ x: chunkCoordinate(cx), y: chunkCoordinate(cy) })!);
        }
      }
      const graphBuild = measureSync(1, 3, () => {
        buildNavigationGraph(world, doors, chunkStates);
      });

      // C: the marginal cost -- one exterior walk, then one lookup per room.
      const walk = measureSync(3, 7, () => {
        const reachability = roomReachability(world, doors, graph, () => rooms);
        for (const room of rooms) reachability.reaches(room);
      });

      // D: what the projection now spends, in the order `roomAccess` asks.
      const shipped = measureSync(3, 7, () => {
        const reachability = roomReachability(world, doors, graph, () => rooms);
        for (const room of rooms) roomAccess(world, doors, reachability, room);
      });

      /*
       * The two answers have to disagree, and about the right rooms, or the
       * columns above are pricing a measurement of nothing.
       *
       * **Every deliberately sealed room is unreachable, and MORE rooms than
       * that are** -- which the first draft of this file asserted away and the
       * fixture refuted: 30 unreachable against 12 sealed at one chunk. Boxing
       * in the tile outside a door puts two vertical walls into the corridor
       * row, and where two sealed doors fall in the same row the corridor
       * segment between them is bounded by walls on all four sides. Every room
       * whose door opens into that segment is stranded too. That is a true
       * property of the prison and not of the code: **the act-4a state is
       * contagious**, and a player who walls one doorway can kill a row of
       * cells. Asserted as a floor plus an exact identity rather than smoothed
       * into a number that happened to come out.
       */
      const reachability = roomReachability(world, doors, graph, () => rooms);
      let disagreements = 0;
      let unreachable = 0;
      let sealedAndUnreachable = 0;
      for (const [roomIndex, room] of rooms.entries()) {
        const before = perimeterOnly(block, room);
        const after = roomAccess(world, doors, reachability, room);
        if (after === 'unreachable') {
          unreachable += 1;
          if (block.sealed.has(roomIndex)) sealedAndUnreachable += 1;
        }
        if (before !== after) disagreements += 1;
      }
      expect(sealedAndUnreachable, 'every room whose door was walled up reads unreachable').toBe(block.sealed.size);
      expect(unreachable, 'and so do the neighbours stranded with them').toBeGreaterThanOrEqual(block.sealed.size);
      expect(disagreements, 'the old answer called every one of them a doorway').toBe(unreachable);

      rows.push([
        sealEvery === 0 ? 'none' : `1 in ${String(sealEvery)}`,
        String(side * side),
        String(side * CHUNK),
        String(rooms.length),
        String(new Set(graph.tileToRegion.values()).size),
        String(graph.portals.length),
        formatMs(edgeScan.min),
        formatMs(graphBuild.min),
        formatMs(walk.min),
        formatMs(shipped.min),
        String(unreachable),
      ]);
      lines.push(
        `${String(rooms.length)} rooms, ${String(unreachable)} unreachable:` +
          ` A ${edgeScan.raw.map((value) => formatMs(value)).join(' / ')}` +
          ` | C ${walk.raw.map((value) => formatMs(value)).join(' / ')}`,
      );
    }

    console.log(`\n${environmentSummary()}\n`);
    console.log(
      renderTable(
        [
          'doors walled',
          'chunks',
          'side',
          'rooms',
          'regions',
          'portals',
          'A edge ms',
          'B graph ms',
          'C walk ms',
          'D shipped ms',
          'unreachable',
        ],
        rows,
      ),
    );
    console.log(`\nevery sample, so an outlier can be explained rather than dropped:\n${lines.join('\n')}\n`);
  });
});
