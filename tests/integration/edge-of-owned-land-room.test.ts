import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { WALL_EDGE_NUMERIC_ID } from '../../src/simulation/construction';
import { packCommand } from '../../src/simulation/protocol/commands';
import { roomInstanceIdFor } from '../../src/simulation/rooms/zoning';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { chunkCoordinate, tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';

/**
 * Issue #448 / [ADR 0047](../../docs/adr/0047-raising-a-building-on-open-ground.md)
 * decision 6: **a cell in the corner of the prison's own land can be walled
 * and zoned.**
 *
 * This is the case
 * [ADR 0045](../../docs/adr/0045-must-a-zoned-room-be-enclosed.md) recorded as
 * broken and did not fix -- *"a room flush against the edge of owned land is
 * unzonable"* -- and it is the whole user-visible point of the change.
 *
 * ## Why it was impossible, mechanically
 *
 * `SparseWorld` keeps one storage slot per tile edge and keeps it on the
 * north and west side, so a rectangle's **south** boundary is the north edge
 * of the row below it and its **east** boundary is the west edge of the column
 * to its right (`src/simulation/rooms/enclosure.ts`, the two comments on the
 * second and fourth loops). Those two tiles are outside the rectangle. For a
 * room in the corner of the one chunk a new session owns they are outside the
 * *world*: rows and columns 32, in chunks that have never been materialised.
 *
 * `ConstructionSystem.submitOrder` used to ask its bounds and ownership
 * questions of the order's own tile alone, so those six orders came back
 * `out-of-bounds` and the perimeter could never be closed. Since ADR 0045
 * `zone` refuses an open `enclosed` room, so the room could never be zoned
 * either -- which is the difference between a wrong readout and a wrong
 * refusal.
 *
 * ## What this file refuses to shortcut
 *
 * The walls. `tests/integration/room-zoning-loop.test.ts` writes its
 * perimeter with `setTopEdge`/`setLeftEdge` directly and says so, because its
 * subject is the `ZoneRoom` command path. Here the walls **are** the subject:
 * every one of the ten is a real `PlaceBuildOrder`, paid for with real bricks
 * bought through `PurchaseMaterials`, built by the real one-order-at-a-time
 * crew over real ticks. A fixture that wrote the edges by hand would prove
 * that enclosure can read them and would say nothing about whether the player
 * is allowed to build them, which is the entire defect.
 *
 * The ten edges are written out as literal coordinates rather than derived
 * from the rectangle by a loop. `roomPerimeterEnclosure` derives its perimeter
 * from the same rectangle, and a fixture that re-derived it with the same
 * arithmetic would agree with the code under test for any arithmetic at all.
 */

const SEED = 0x448;
const CELL = 'room.cell';

/** The last two columns and last three rows of the one chunk a new session owns. */
const ROOM = { x: 30, y: 29, width: 2, height: 3 } as const;

/**
 * Every edge of `ROOM`'s perimeter, in the slot the world keeps it in.
 *
 * Enumerated by hand, four faces, ten edges. The last four are the ones no
 * player could order before #448: rows and columns 32 are past the edge of
 * owned land and past the edge of the materialised world.
 */
const PERIMETER = [
  // North face -- row 29's own north edge. Inside owned land.
  { x: 30, y: 29, edge: 'north' },
  { x: 31, y: 29, edge: 'north' },
  // West face -- column 30's own west edge. Inside owned land.
  { x: 30, y: 29, edge: 'west' },
  { x: 30, y: 30, edge: 'west' },
  { x: 30, y: 31, edge: 'west' },
  // South face -- the north edge of row 32, which is in chunk (0, 1).
  { x: 30, y: 32, edge: 'north' },
  { x: 31, y: 32, edge: 'north' },
  // East face -- the west edge of column 32, which is in chunk (1, 0).
  { x: 32, y: 29, edge: 'west' },
  { x: 32, y: 30, edge: 'west' },
  { x: 32, y: 31, edge: 'west' },
] as const satisfies readonly { readonly x: number; readonly y: number; readonly edge: 'north' | 'west' }[];

/** The five of those ten that lie outside the one owned chunk: two south, three east. */
const BEYOND_OWNED_LAND = PERIMETER.filter((wall) => wall.x > 31 || wall.y > 31);

const BRICKS_PER_WALL = 2;

const SOUTH_CHUNK = { x: chunkCoordinate(0), y: chunkCoordinate(1) };
const EAST_CHUNK = { x: chunkCoordinate(1), y: chunkCoordinate(0) };

function at(position: { readonly x: number; readonly y: number }): TilePosition {
  return { x: tileCoordinate(position.x), y: tileCoordinate(position.y) };
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function wallOrderId(index: number): string {
  return `wall-${String(index).padStart(2, '0')}`;
}

interface SubmittedOrder {
  readonly index: number;
  readonly state: string;
  readonly failReason: string | undefined;
}

/**
 * Buys the bricks and orders all ten walls, as ten pointer gestures would.
 *
 * Each order's state is read back **immediately after its own command**, and
 * recorded as accepted-or-refused rather than as a lifecycle state: `submit`
 * steps the kernel, `ConstructionSystem` updates every tenth tick, and an
 * order that arrives on one of those ticks has already left `'approved'`
 * before this reads it. `'failed'` is the only terminal answer `submitOrder`
 * can give, so "not failed" is exactly the question this file asks, and the
 * ten `'completed'` assertions downstream are what close the gap between
 * accepted and built.
 */
function orderThePerimeter(runtime: SimulationRuntime): readonly SubmittedOrder[] {
  const submitted: SubmittedOrder[] = [];
  submit(
    runtime,
    'buy-bricks',
    packCommand({
      type: 'PurchaseMaterials',
      orderId: 'bricks-1',
      itemId: 'item.brick',
      quantity: PERIMETER.length * BRICKS_PER_WALL,
    }),
  );

  PERIMETER.forEach((wall, index) => {
    submit(
      runtime,
      `place-${wallOrderId(index)}`,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: wallOrderId(index),
        definitionId: 'wall-brick',
        x: wall.x,
        y: wall.y,
        edge: wall.edge,
        transactionId: 'perimeter-gesture',
      }),
    );
    const order = runtime.construction.getOrder(wallOrderId(index));
    submitted.push({ index, state: order?.state ?? 'missing', failReason: order?.failReason });

  });

  return submitted;
}

function zoneTheCell(runtime: SimulationRuntime, commandId: string): void {
  submit(
    runtime,
    commandId,
    packCommand({ type: 'ZoneRoom', roomId: CELL, x: ROOM.x, y: ROOM.y, width: ROOM.width, height: ROOM.height }),
  );
}

/**
 * Ten walls at 50 work each, one order at a time at +10 per scheduled tick on
 * a ten-tick schedule, behind a 100-tick procurement delivery. Comfortably
 * past that and not on a boundary.
 */
const TICKS_TO_FINISH_THE_PERIMETER = 1_000;

describe('a room flush against the edge of owned land (#448)', () => {
  it('cannot be zoned while its south and east walls are missing', () => {
    // The half that makes the rest of this file mean something: without the
    // perimeter the cell is refused, so a later acceptance cannot be a room
    // that was zonable all along.
    const runtime = createNewSimulationRuntime(SEED);
    zoneTheCell(runtime, 'zone-unwalled');

    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(0);
    expect(runtime.roomZoning.recentRefusals().map((refusal) => refusal.reason)).toEqual(['not-enclosed']);
  });

  it('has its outer two faces on tiles no order could reach before', () => {
    // The fixture's own claim, asserted rather than asserted-by-comment: the
    // six outer edges really are outside the owned, materialised world, so the
    // six orders below are not a re-run of the four inner ones.
    const runtime = createNewSimulationRuntime(SEED);

    expect(BEYOND_OWNED_LAND).toHaveLength(5);
    expect(runtime.world.isTileOwned(at({ x: 31, y: 31 })), 'the room corner itself is owned').toBe(true);
    for (const wall of BEYOND_OWNED_LAND) {
      expect(runtime.world.isTileOwned(at(wall)), `${wall.x},${wall.y} must be unowned`).toBe(false);
    }
    expect(runtime.world.getChunk(SOUTH_CHUNK), 'the chunk below the world must not exist yet').toBeUndefined();
    expect(runtime.world.getChunk(EAST_CHUNK), 'the chunk right of the world must not exist yet').toBeUndefined();
  });

  it('can be sealed with ten real build orders and then zoned', () => {
    const runtime = createNewSimulationRuntime(SEED);
    const submitted = orderThePerimeter(runtime);

    // Accepted at submission -- the assertion the one-sided predicate fails.
    // Compared as one list so a failure names every face that was refused and
    // the reason each was refused for, rather than stopping at the first.
    expect(
      submitted.map((order) => {
        const wall = PERIMETER[order.index]!;
        const verdict = order.state === 'failed' ? `refused ${order.failReason ?? 'for no stated reason'}` : 'accepted';
        return `${wall.x},${wall.y} ${wall.edge}: ${verdict}`;
      }),
    ).toEqual(PERIMETER.map((wall) => `${wall.x},${wall.y} ${wall.edge}: accepted`));

    stepTo(runtime, TICKS_TO_FINISH_THE_PERIMETER);

    for (const [index] of PERIMETER.entries()) {
      expect(runtime.construction.getOrder(wallOrderId(index))?.state, `wall ${index}`).toBe('completed');
    }

    // The bricks were really spent, so these are built walls and not approvals
    // that stalled with nothing behind them.
    expect(runtime.containers.require('construction-materials').quantityOf('item.brick')).toBe(0);

    // Every one of the ten slots the world keeps for this rectangle's
    // perimeter now holds a wall -- including the five that live on tiles
    // outside it, which is where the whole defect was.
    for (const wall of PERIMETER) {
      const value = wall.edge === 'north' ? runtime.world.getTopEdge(at(wall)) : runtime.world.getLeftEdge(at(wall));
      expect(value, `${wall.x},${wall.y} ${wall.edge}`).toBe(WALL_EDGE_NUMERIC_ID);
    }

    zoneTheCell(runtime, 'zone-walled');

    expect(runtime.roomZoning.recentRefusals(), 'the walled cell must be accepted').toEqual([]);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).rooms).toBe(1);
    const instance = runtime.prisoners.roomInstances.getById(roomInstanceIdFor(CELL, at(ROOM)));
    expect(instance?.anchorTile).toEqual(at(ROOM));
    // And the shape reached the world, so the renderer has a room to draw in
    // the corner the player dragged.
    expect(runtime.world.getZoning(at({ x: 31, y: 31 }))).toBe(defaultRoomContentRegistry.getById(CELL)!.numericId);
  });

  it('materialises the two neighbouring chunks when those walls finish, and grants no land doing it', () => {
    /*
     * The consequence ADR 0047 decision 6 names and `docs/WORLD.md` records as
     * deferred, pinned so that it is a decision somebody took rather than
     * something a later reader discovers on screen. `writeEdge` ->
     * `setTopEdge` -> `setMapValue` loads the chunk it is asked to write into,
     * and `WorldRenderView` draws every loaded chunk -- so finishing these
     * walls puts two fresh 32x32 blocks of unowned ground on the display.
     *
     * What must **not** happen is the prison quietly acquiring them. Building
     * on the far side of your own fence is not buying the field.
     */
    const runtime = createNewSimulationRuntime(SEED);
    orderThePerimeter(runtime);

    expect(runtime.world.getChunk(SOUTH_CHUNK), 'ordering must materialise nothing').toBeUndefined();
    expect(runtime.world.getChunk(EAST_CHUNK), 'ordering must materialise nothing').toBeUndefined();

    stepTo(runtime, TICKS_TO_FINISH_THE_PERIMETER);

    expect(runtime.world.getChunk(SOUTH_CHUNK)?.lifecycle).toBe('loaded');
    expect(runtime.world.getChunk(EAST_CHUNK)?.lifecycle).toBe('loaded');
    expect(runtime.world.isTileOwned(at({ x: 30, y: 32 })), 'the new ground stays unowned').toBe(false);
    expect(runtime.world.isTileOwned(at({ x: 32, y: 30 })), 'the new ground stays unowned').toBe(false);
    // A cell may not be zoned onto it either: the room's own tiles still have
    // to be owned, and only the wall was ever allowed across the line.
    submit(
      runtime,
      'zone-over-the-line',
      packCommand({ type: 'ZoneRoom', roomId: CELL, x: 30, y: 32, width: 2, height: 3 }),
    );
    expect(runtime.roomZoning.recentRefusals().map((refusal) => refusal.reason)).toEqual(['unowned-land']);
  });
});
