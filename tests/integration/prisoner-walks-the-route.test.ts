import { describe, expect, it } from 'vitest';
import { createWalkReading, LOCOMOTION_SUBTILE_UNITS } from '../../src/simulation/locomotion';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A prisoner covers the tiles between two rooms, one at a time.**
 *
 * This is the player-facing half of
 * [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)
 * and the defect issue #414 is named after. Until it landed, an actor's
 * position changed **twice per errand**: `ActionSystem.continueTravelling`
 * wrote the destination anchor into `PositionComponent` in the same statement
 * that resolved the route, and `components.ts` called it an *abstracted
 * arrival* in so many words. Every consumer downstream -- the render delta
 * channel included -- therefore saw a teleport, and
 * [ADR 0040](../../docs/adr/0040-the-shape-of-the-render-delta-channel.md)
 * measured that no cadence on that channel could turn it into walking.
 *
 * ## What is asserted, and why in this shape
 *
 * The strong statement is a **bound on one tick**, not a count of tiles: no
 * tick may move a prisoner by more than one tile. A count alone would pass for
 * a prison that teleported an actor two tiles at a time, and the whole defect
 * was a single large jump. The tile *path* is collected as well, so the run is
 * non-vacuous -- a prisoner who never left their cell would satisfy the bound
 * and prove nothing.
 *
 * The sub-tile reading is asserted separately, because it is what the renderer
 * draws between two whole tiles and it is the reason 100 ms publications look
 * like walking rather than like a slideshow.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored 2x3 minimum. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** `room.canteen`'s authored 6x6 minimum, clear of the cell and well across the chunk from it. */
const CANTEEN_RECT = { x: 20, y: 20, width: 6, height: 6 } as const;

const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 } as const;
const BUILT_BY = 1_500;
const WATCH_UNTIL = 6_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/** A furnished cell and a canteen with a dining table, far apart, so an errand is a real journey. */
function prisonWithADistantCanteen(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 4 }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  wallRoomPerimeter(runtime.world, CANTEEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN_RECT }));
  submit(runtime, 'bed', packCommand({ type: 'PlaceObject', orderId: 'o-bed', definitionId: 'bed-wooden', x: 4, y: 6 }));
  submit(runtime, 'toilet', packCommand({ type: 'PlaceObject', orderId: 'o-toilet', definitionId: 'toilet-brick', x: 5, y: 6 }));
  submit(runtime, 'dining-table', packCommand({ type: 'PlaceObject', orderId: 'o-dt', definitionId: 'dining-table-wooden', x: 20, y: 20 }));
  while (runtime.kernel.tick < BUILT_BY) runtime.kernel.step();
  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  return runtime;
}

describe('a prisoner walks to the room instead of appearing in it', () => {
  it('never moves more than one tile in a tick, and covers a real distance doing it', () => {
    const runtime = prisonWithADistantCanteen();
    const prisoners = runtime.prisoners;
    const index = prisoners.entityStore.getIndex(prisoners.entityStore.getIdByIndex(0));

    let previousX = prisoners.position.tileX[index]!;
    let previousY = prisoners.position.tileY[index]!;
    const path: string[] = [`${String(previousX)},${String(previousY)}`];
    let worstStep = 0;
    let longestJourneyTiles = 0;
    let tilesThisJourney = 0;
    let ticksInTransit = 0;

    while (runtime.kernel.tick < WATCH_UNTIL) {
      runtime.kernel.step();
      const x = prisoners.position.tileX[index]!;
      const y = prisoners.position.tileY[index]!;
      const stepped = Math.abs(x - previousX) + Math.abs(y - previousY);
      worstStep = Math.max(worstStep, stepped);
      if (stepped > 0) {
        tilesThisJourney += 1;
        path.push(`${String(x)},${String(y)}`);
      }
      if (prisoners.locomotion.isWalking(index)) {
        ticksInTransit += 1;
      } else {
        longestJourneyTiles = Math.max(longestJourneyTiles, tilesThisJourney);
        tilesThisJourney = 0;
      }
      previousX = x;
      previousY = y;
    }

    /*
     * **The assertion the defect fails.** With the abstracted arrival this is
     * the Manhattan distance from the delivery tile to the room anchor -- 18
     * for the first errand in this prison -- because the whole journey happened
     * in one tick. One is what walking looks like.
     */
    expect(worstStep, 'a prisoner moved more than one tile in a single tick').toBe(1);

    // Non-vacuous, in three independent ways: the prisoner really travelled,
    // really covered ground in an unbroken run of tile crossings, and really
    // spent ticks between two tiles rather than on one.
    expect(path.length, 'the prisoner never moved at all').toBeGreaterThan(30);
    expect(longestJourneyTiles, 'no single journey in this run crossed more than a couple of tiles').toBeGreaterThan(8);
    expect(ticksInTransit, 'no tick was spent between two tiles').toBeGreaterThan(200);
  });

  it('holds a position between two tiles while it is walking, with a velocity and a heading to draw it by', () => {
    const runtime = prisonWithADistantCanteen();
    const prisoners = runtime.prisoners;
    const index = prisoners.entityStore.getIndex(prisoners.entityStore.getIdByIndex(0));
    const reading = createWalkReading();

    let sawFraction = false;
    let sawVelocity = false;
    while (runtime.kernel.tick < WATCH_UNTIL && !(sawFraction && sawVelocity)) {
      runtime.kernel.step();
      if (!prisoners.locomotion.isWalking(index)) continue;
      prisoners.locomotion.read(index, prisoners.position.tileX[index]!, prisoners.position.tileY[index]!, reading);

      // Off the tile grid: this is the value the render payload carries and the
      // reason a 100 ms publication does not look like a slideshow.
      if (reading.subX % LOCOMOTION_SUBTILE_UNITS !== 0 || reading.subY % LOCOMOTION_SUBTILE_UNITS !== 0) sawFraction = true;

      // Exactly one axis moves, because `neighbors` offers four neighbours.
      const moving = Math.abs(Math.sign(reading.velocitySubX)) + Math.abs(Math.sign(reading.velocitySubY));
      expect(moving, 'a walking actor must be moving along exactly one axis').toBe(1);
      expect(Math.sign(reading.velocitySubX)).toBe(reading.headingX);
      expect(Math.sign(reading.velocitySubY)).toBe(reading.headingY);
      if (moving === 1) sawVelocity = true;
    }

    expect(sawFraction, 'no tick found the prisoner between two tiles').toBe(true);
    expect(sawVelocity, 'no tick found the prisoner with a velocity to draw').toBe(true);
  });
});
