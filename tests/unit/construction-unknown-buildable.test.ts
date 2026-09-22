import { describe, expect, it } from 'vitest';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { createConstructionCommandHandler } from '../../src/simulation/construction/handler';
import { ConstructionSystem, type ConstructionSnapshot } from '../../src/simulation/construction/system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { packCommand, unpackCommand } from '../../src/simulation/protocol/commands';
import { RefusalLog } from '../../src/simulation/refusals';
import { SimulationEventLog } from '../../src/simulation/events/event-log';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * BUG-01: a `PlaceBuildOrder` naming a buildable nothing declares used to
 * brick the session, permanently, and the save with it.
 *
 * `placeBuildOrderSchema.definitionId` was a plain `z.string()`, so any string
 * decoded -- it is `z.string().min(1)` as of this file's second block. `submitOrder` asked only about the *tile* -- bounds, then ownership
 * -- so an unknown id on an owned in-bounds tile was **approved**, stored in
 * `ConstructionSystem.orders`, and emitted by `snapshot()` into the save. The
 * damage was one line into `update`: `getBuildableDefinition(order.definitionId)`
 * ran unconditionally, at the top of the walk over *every* order, before the
 * state switch. It throws on an unknown id. So from the tick that order
 * entered the map, every scheduled construction update threw out of a system
 * `update` -- which faults the worker -- and no other build order in the
 * prison could ever advance again. `restore()` puts the order straight back,
 * so reloading reproduced it exactly.
 *
 * The three properties below are the three halves of that (the third is why
 * the first two are not enough):
 *
 * 1. the boundary refuses the order, with a reason a player can be told;
 * 2. `update` does not throw -- and that is asserted by **ticking**, not by
 *    observing the refusal came back. A test that stopped at the refusal
 *    would be green against the unfixed `update`;
 * 3. a **later, valid** order still completes. That is the property the
 *    defect actually destroyed, and asserting the bad order's own state says
 *    nothing about it.
 *
 * ## The unknown id is written here, not asked for
 *
 * `UNKNOWN_DEFINITION_ID` is a literal. Deriving it -- "some id the registry
 * does not have" -- would let the fixture supply both sides of the comparison
 * (`docs/TESTING.md`), and would hold for an implementation that had no
 * registry at all. The one assertion that reads `BUILDABLE_REGISTRY` is a
 * tripwire pointing the other way: if a future catalogue ever ships
 * `wall-obsidian`, this file must fail loudly rather than quietly start
 * testing a *known* id.
 */
const UNKNOWN_DEFINITION_ID = 'wall-obsidian';

/**
 * Every tick below is a literal and none of it is read back out of the thing
 * under test, exactly as `construction-crew-capacity.test.ts` requires of
 * itself. The arithmetic is fixed by three numbers this file does not own:
 * `wall-brick` needs `workRequired: 50`, `in-progress` advances `+10`, and
 * `ConstructionSystem.schedule` is `intervalTicks: 10, phaseTicks: 0`. So a
 * `wall-brick` ordered at tick 0 is approved at 0, draws materials at 10,
 * takes the crew at 20, works at 30/40/50/60 and finishes at **70**.
 */
const WALL_COMPLETES_AT = 70;

const CHUNK = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

/** An owned, loaded chunk: neither the bounds check nor the ownership check has anything to say here. */
function ownedWorld(): SparseWorld {
  const world = new SparseWorld(32);
  world.ensureMetadata(CHUNK);
  world.load(CHUNK);
  world.setOwned(CHUNK, true);
  return world;
}

interface Harness {
  readonly construction: ConstructionSystem;
  readonly kernel: Kernel;
  readonly refusals: RefusalLog;
}

/** The real kernel, the real command handler and the real refusal log -- none of the three is where the gap was. */
function harness(): Harness {
  const construction = new ConstructionSystem(ownedWorld());
  const kernel = new Kernel();
  const refusals = new RefusalLog();
  kernel.registerSystem(construction);
  kernel.setCommandHandler(createConstructionCommandHandler(construction, refusals, new SimulationEventLog()));
  return { construction, kernel, refusals };
}

function order(kernel: Kernel, orderId: string, definitionId: string, at: { x: number; y: number }): void {
  kernel.submitCommand(
    `cmd-${orderId}`,
    kernel.expectedSequence,
    kernel.tick,
    packCommand({ type: 'PlaceBuildOrder', orderId, definitionId, x: at.x, y: at.y }),
  );
}

function stepTo(kernel: Kernel, tick: number): void {
  while (kernel.tick <= tick) kernel.step();
}

describe('a build order naming a buildable nothing declares (BUG-01)', () => {
  it('does not name a buildable the catalogue actually has', () => {
    // The tripwire on the literal above, not a derivation of it.
    expect(BUILDABLE_REGISTRY.has(UNKNOWN_DEFINITION_ID)).toBe(false);
    // ...and the id this file uses for the *valid* order really is declared,
    // so "a later order still completes" is a claim about the queue draining
    // rather than about two unknown ids behaving alike.
    expect(BUILDABLE_REGISTRY.has('wall-brick')).toBe(true);
  });

  it('is refused at submission rather than approved', () => {
    const construction = new ConstructionSystem(ownedWorld());
    const bad = createBuildOrder('order-1', UNKNOWN_DEFINITION_ID, tile(4, 6));
    construction.submitOrder(bad);

    expect(bad.state).toBe('failed');
    // The reason is asserted and not just the refusal: `out-of-bounds` and
    // `unowned-land` are the two failures this tile cannot produce, so a test
    // that checked `state` alone would pass on a fixture whose chunk had
    // silently stopped being owned and would say nothing about the catalogue.
    expect(bad.failReason).toBe('unknown-buildable');
    expect(construction.getOrder('order-1')?.state).toBe('failed');
  });

  it('tells the player, through the same route every other build refusal takes', () => {
    const { kernel, refusals } = harness();
    order(kernel, 'order-1', UNKNOWN_DEFINITION_ID, { x: 4, y: 6 });
    kernel.step();

    // A command acknowledgement means RECEIVED; this is the channel that says
    // what the simulation then decided. `build.unknown-buildable` is the wire
    // id, namespaced against `place-object.unknown-buildable`, which is the
    // same condition refusing a different command.
    // And the tile it was aimed at, since 2026-09-22: `refusalSchema.tile`
    // carries the place a refused command named (ADR 0122 option D step 1), so
    // a refusal about a buildable nothing declares still says where the player
    // was pointing.
    expect(refusals.last).toEqual({
      sequence: 1,
      tick: 0,
      reason: 'build.unknown-buildable',
      tile: { x: 4, y: 6 },
    });
  });

  it('leaves the construction system able to tick, and a later valid order still completes', () => {
    const { construction, kernel } = harness();
    // `order-a` sorts before `order-b`, so the walk in `update` reaches the
    // bad order *first*: this is the arrangement in which an unguarded lookup
    // at the top of the loop takes the good order down with it.
    order(kernel, 'order-a', UNKNOWN_DEFINITION_ID, { x: 4, y: 6 });
    order(kernel, 'order-b', 'wall-brick', tile(5, 6));

    // The refusal came back -- and this is where a test that stopped would
    // have proven nothing. Ticking is the assertion.
    expect(() => {
      stepTo(kernel, WALL_COMPLETES_AT);
    }).not.toThrow();

    expect(construction.getOrder('order-a')?.state).toBe('failed');
    expect(construction.getOrder('order-b')?.state).toBe('completed');
    expect(construction.getOrder('order-b')?.progress).toBe(50);
  });
});

describe('an empty definition id, which the save boundary cannot write', () => {
  it('is refused at the decoder rather than reaching the order map', () => {
    /*
     * A different defect from the one above, found by the same sweep and closed
     * at a different layer, because the two ids are wrong in different ways: an
     * unknown id is a real string naming nothing, and `''` is not an id at all.
     *
     * `save-schema.ts`'s `buildOrderSchema` types `definitionId` as
     * `z.string().min(1)`, so a stored order carrying `''` makes the whole
     * prison unsaveable -- measured before the fix as a Zod `too_small` at
     * `construction.orders.0.definitionId` out of `createSaveEnvelope`, on a
     * path a player has no way to connect to anything they did. `submitOrder`
     * refuses an empty id (it names no buildable) but **stores the refused
     * order**, so refusing it there was not enough; the two boundaries have to
     * agree about what a `definitionId` is.
     *
     * Asserted through `unpackCommand` rather than by attempting a save,
     * because what is being pinned is the boundary: the command does not decode,
     * so nothing downstream ever sees it.
     */
    expect(unpackCommand(packCommand({
      type: 'PlaceBuildOrder',
      orderId: 'order-1',
      definitionId: 'wall-brick',
      x: 4,
      y: 6,
    }))).not.toBeNull();

    // `packCommand` parses too, so the empty id is refused on the way out as
    // well as on the way in -- which is the honest place for this assertion,
    // because a producer that composes one should not be able to send it.
    expect(() =>
      packCommand({ type: 'PlaceBuildOrder', orderId: 'order-1', definitionId: '', x: 4, y: 6 }),
    ).toThrow();

    // And the wire form a *restored save's queue* can hand back, which never
    // passes through `packCommand` again: written out as the literal envelope
    // `commandJson` produces, so this reaches `unpackCommand`'s own decision.
    expect(
      unpackCommand({
        schemaId: 'lockstate.simulation.command',
        schemaVersion: 1,
        transport: 'structured-clone',
        data: { type: 'PlaceBuildOrder', orderId: 'order-1', definitionId: '', x: 4, y: 6 },
      }),
    ).toBeNull();
  });

  it('does not refuse a real buildable id arriving the same way', () => {
    // The direction that stops the rule above being "reject everything".
    expect(
      unpackCommand({
        schemaId: 'lockstate.simulation.command',
        schemaVersion: 1,
        transport: 'structured-clone',
        data: { type: 'PlaceBuildOrder', orderId: 'order-1', definitionId: 'wall-brick', x: 4, y: 6 },
      }),
    ).toEqual({ type: 'PlaceBuildOrder', orderId: 'order-1', definitionId: 'wall-brick', x: 4, y: 6 });
  });
});

describe('a save already carrying an approved order for an unknown buildable', () => {
  /**
   * What a v0.0.112 save written before the fix actually holds: the order was
   * *approved*, because nothing refused it, and `snapshot()` emits every order
   * it has. Written out as a literal rather than produced by submitting a bad
   * order through the fixed code -- the fixed code cannot produce this state,
   * which is exactly why the recovery has to be tested against a document.
   *
   * `save-schema.ts`'s `buildOrderSchema` types `definitionId` as
   * `z.string().min(1)`, so this order round-trips through a real save file
   * unchanged; there is no validation between the snapshot and the disk that
   * would have caught it.
   */
  const brickedSnapshot: ConstructionSnapshot = {
    orders: [
      {
        id: 'order-a',
        definitionId: UNKNOWN_DEFINITION_ID,
        location: tile(4, 6),
        state: 'approved',
        progress: 0,
        materialsAllocated: [],
      },
    ],
    undoStack: [],
    redoStack: [],
  };

  it('drains rather than throwing, and reports the order as failed', () => {
    const { construction, kernel } = harness();
    construction.restore(brickedSnapshot);

    expect(() => {
      stepTo(kernel, 10);
    }).not.toThrow();

    const recovered = construction.getOrder('order-a');
    expect(recovered?.state).toBe('failed');
    expect(recovered?.failReason).toBe('unknown-buildable');
  });

  it('lets the prison keep building afterwards', () => {
    // The property the player cares about, and the one the throw removed: a
    // loaded save whose queue holds a bad order is a working prison again.
    const { construction, kernel } = harness();
    construction.restore(brickedSnapshot);
    order(kernel, 'order-b', 'wall-brick', tile(5, 6));

    stepTo(kernel, WALL_COMPLETES_AT);

    expect(construction.getOrder('order-b')?.state).toBe('completed');
  });

  it('leaves a finished order alone rather than un-building it', () => {
    /*
     * The other direction of the recovery, and the reason `update` skips a
     * terminal order *before* it asks about the definition rather than after.
     *
     * `BUILDABLE_REGISTRY` is content, and content moves between builds: a row
     * renamed or retired in a later catalogue makes every *completed* order for
     * it unresolvable in a save that already holds one. Re-failing such an
     * order would be the worse answer of the two -- what it built is written
     * into the world's edge layers, and `cancelOrder` is the only thing that
     * takes that back, so the order would read `failed` beside a wall that is
     * still standing. It reads `completed`, which is what actually happened.
     */
    const { construction, kernel } = harness();
    construction.restore({
      orders: [
        {
          id: 'order-a',
          definitionId: UNKNOWN_DEFINITION_ID,
          location: tile(4, 6),
          state: 'completed',
          progress: 50,
          materialsAllocated: [],
        },
      ],
      undoStack: [],
      redoStack: [],
    });

    expect(() => {
      stepTo(kernel, 10);
    }).not.toThrow();

    const finished = construction.getOrder('order-a');
    expect(finished?.state).toBe('completed');
    expect(finished?.failReason).toBeUndefined();
  });
});
