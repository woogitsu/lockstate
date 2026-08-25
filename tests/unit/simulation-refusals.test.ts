import { describe, expect, it } from 'vitest';
import { BUILD_ORDER_FAIL_REASONS } from '../../src/simulation/construction/build-order';
import { packCommand } from '../../src/simulation/protocol/commands';
import { REFUSAL_REASONS, type RefusalReason } from '../../src/simulation/protocol/types';
import {
  BUILD_REFUSAL_REASONS,
  HIRE_REFUSAL_REASONS,
  PURCHASE_REFUSAL_REASONS,
  RefusalLog,
  ZONE_REFUSAL_REASONS,
} from '../../src/simulation/refusals';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

/**
 * What the simulation refuses, and how it says so (issue #261).
 *
 * The defect this closes is a *silence*, so most of what follows is an
 * assertion that something is now said. A player command travels through two
 * acceptances -- the worker takes the message and answers `status: 'queued'`,
 * and then a system decides at the command's tick what it means -- and only
 * the first was ever reported. `ConstructionSystem.submitOrder` set
 * `state: 'failed'` with a `failReason`, `phaseOf` drew a failed order as
 * nothing, and the HUD's refusal line answers a *rejected command* rather
 * than a refused one. `ProcurementSystem.purchase` returned a
 * `PurchaseOutcome` that the session command handler discarded and said so in
 * its own comment.
 *
 * `RoomZoningService` is the third producer and the one that was written for
 * this route rather than despite it: it already kept a bounded window of its
 * refusals, with a comment saying it did so "because the reporting route is
 * #261 step 2". This is that route.
 *
 * These tests drive the real kernel and the real command handler, because the
 * gap was never in either component: both were correct and the handler simply
 * threw the answer away.
 */

/** The starting chunk `createNewSimulationRuntime` owns is 32x32 at the origin, so this tile is inside it and owned. */
const OWNED_TILE = { x: 4, y: 4 };
/** Outside every materialised chunk, which is what the Build panel's unbounded coordinate fields let a player type. */
const OUT_OF_BOUNDS_TILE = { x: 100, y: 100 };

/** Submits one command to the kernel and runs the tick it executes on. */
function submit(runtime: SimulationRuntime, sequence: number, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(`cmd-${String(sequence)}`, sequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function placeWall(runtime: SimulationRuntime, sequence: number, tile: { x: number; y: number }): void {
  submit(
    runtime,
    sequence,
    packCommand({
      type: 'PlaceBuildOrder',
      orderId: `order-${String(sequence)}`,
      definitionId: 'wall-brick',
      x: tile.x,
      y: tile.y,
    }),
  );
}

describe('RefusalLog: the snapshot shape a cadence channel can carry', () => {
  it('reports nothing at all before anything has been refused', () => {
    const log = new RefusalLog();
    expect(log.last).toBeUndefined();
    // Not `1`, and not a placeholder record: "no refusal has happened" is a
    // different fact from "a refusal happened", and the wire says so with an
    // absent field rather than a present one holding nothing.
    expect(log.count).toBe(0);
  });

  it('carries the ordinal and the total in one number, so neither has to be sent twice', () => {
    const log = new RefusalLog();
    log.record('build.unowned-land', 12);
    expect(log.last).toEqual({ sequence: 1, tick: 12, reason: 'build.unowned-land' });

    log.record('purchase.insufficient-funds', 40);
    // The second refusal replaces the first -- a queue is what this channel
    // cannot carry honestly -- and `sequence` is still the count.
    expect(log.last).toEqual({ sequence: 2, tick: 40, reason: 'purchase.insufficient-funds' });
    expect(log.count).toBe(2);
  });

  it('keeps the tick the refusal happened on, not the tick it is read at', () => {
    // The publication stamps its envelope with a later tick, and a refusal
    // that is still the most recent one keeps its own. Without this a player
    // could not tell a refusal that just happened from one that has been
    // standing for a minute.
    const log = new RefusalLog();
    log.record('build.out-of-bounds', 7);
    expect(log.last?.tick).toBe(7);
    expect(log.last?.tick).not.toBe(0);
  });
});

describe('the wire vocabulary is exactly what the four domains can produce', () => {
  it('maps every build, hiring, purchase and zoning refusal onto a declared reason', () => {
    const produced = [
      ...Object.values(BUILD_REFUSAL_REASONS),
      ...Object.values(HIRE_REFUSAL_REASONS),
      ...Object.values(PURCHASE_REFUSAL_REASONS),
      ...Object.values(ZONE_REFUSAL_REASONS),
    ];
    for (const reason of produced) {
      expect(REFUSAL_REASONS, `${reason} is produced but not declared on the wire`).toContain(reason);
    }
    // Both directions. A member declared here and produced by nothing is a
    // sentence in the catalog that no session can ever show, which is the
    // failure `tests/foundation/unconsumed-content-contract.test.ts` exists
    // for one layer over. `Record` exhaustiveness gives the other direction
    // at compile time; this gives this one.
    expect([...produced].sort()).toEqual([...REFUSAL_REASONS].sort());
  });

  it('covers every build fail reason the construction system declares', () => {
    // `BUILD_REFUSAL_REASONS` is a `Record` over the union, so `tsc` already
    // guarantees this -- but the union and the runtime tuple are two
    // declarations, and only this compares them.
    expect(Object.keys(BUILD_REFUSAL_REASONS).sort()).toEqual([...BUILD_ORDER_FAIL_REASONS].sort());
  });

  it('declares its reasons in canonical code-unit order', () => {
    // `docs/DETERMINISM.md`: never `localeCompare`, never insertion order. The
    // list is never iterated at runtime, so this is about the source staying
    // readable in one predictable order rather than about a hash -- but the
    // ordering rule is the repository's, so the declaration follows it.
    expect([...REFUSAL_REASONS]).toEqual([...REFUSAL_REASONS].sort());
  });

  it('names the four commands it can answer, so the vocabularies cannot collide', () => {
    const prefixes = new Set(REFUSAL_REASONS.map((reason) => reason.split('.')[0]));
    expect([...prefixes].sort()).toEqual(['build', 'hire', 'purchase', 'zone']);
  });

  it('keeps a spelling that two domains share as two different wire ids', () => {
    // This is what the namespace is *for*, and it is not hypothetical:
    // `out-of-bounds` and `unowned-land` are members of both
    // `BuildOrderFailReason` and `ZoneRoomRefusalReason`. They are the same
    // condition and a different sentence -- the player asked for a room, not
    // a wall -- so one flat id per spelling would put one message on both.
    const shared = Object.keys(BUILD_REFUSAL_REASONS).filter((reason) =>
      Object.hasOwn(ZONE_REFUSAL_REASONS, reason),
    );
    expect(shared.sort()).toEqual(['out-of-bounds', 'unowned-land']);
    for (const reason of shared) {
      const fromBuild = BUILD_REFUSAL_REASONS[reason as keyof typeof BUILD_REFUSAL_REASONS];
      const fromZone = ZONE_REFUSAL_REASONS[reason as keyof typeof ZONE_REFUSAL_REASONS];
      expect(fromZone, `${reason} must not be one wire id for two commands`).not.toBe(fromBuild);
    }

    // And the second such pair, which arrived with hiring (ADR 0025): the
    // treasury refuses a purchase and a hire for the same reason, and only the
    // command says which panel the player should be looking at.
    expect(HIRE_REFUSAL_REASONS['insufficient-funds']).not.toBe(
      PURCHASE_REFUSAL_REASONS['insufficient-funds'],
    );
  });
});

describe('a build order the simulation refuses reaches the session log', () => {
  it('records the refusal a player produces by typing a coordinate outside the map', () => {
    // Issue #261's reproduction, exactly: the Build panel's coordinate fields
    // carry no `min`/`max`, so `100, 100` is a value a player can enter, and
    // the order comes back `failed`/`out-of-bounds`.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);

    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: 0, reason: 'build.out-of-bounds' });
  });

  it('records a wall placed on ground the prison does not own', () => {
    const runtime = createNewSimulationRuntime(0x261);
    // Inside the materialised starting chunk, but disowned first, so the
    // ownership check refuses rather than the bounds check. The two are
    // decided in that order and both had nowhere to go.
    runtime.world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, false);
    placeWall(runtime, 0, OWNED_TILE);

    expect(runtime.refusals.last?.reason).toBe('build.unowned-land');
  });

  it('says nothing about an order the simulation accepted', () => {
    // The other direction, and it is the one that makes the assertions above
    // mean something: a log that recorded every order would be just as
    // useless as one that recorded none.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OWNED_TILE);

    expect(runtime.refusals.last).toBeUndefined();
    expect(runtime.refusals.count).toBe(0);
  });

  it('counts each refusal separately, so a second one replaces the first rather than being lost', () => {
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
    placeWall(runtime, 1, OWNED_TILE);
    placeWall(runtime, 2, { x: -100, y: -100 });

    // Two of the three were refused, and the accepted one in between did not
    // clear the log or advance the count.
    expect(runtime.refusals.count).toBe(2);
    expect(runtime.refusals.last).toEqual({ sequence: 2, tick: 2, reason: 'build.out-of-bounds' });
  });
});

describe('a purchase the treasury refuses reaches the session log', () => {
  it('records a purchase the balance cannot cover', () => {
    const runtime = createNewSimulationRuntime(0x261);
    // The starting balance is 25,000 minor units and a brick is 40, so 1,000
    // bricks is 40,000 and cannot be paid for. The quantity is well inside
    // `MAX_PURCHASE_QUANTITY`, so this is the treasury refusing and not the
    // quantity bound.
    submit(runtime, 0, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1_000 }));

    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: 0, reason: 'purchase.insufficient-funds' });
    // And the refusal left the treasury alone, which is what makes it a
    // refusal rather than a failure.
    expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
  });

  it('records a purchase of something that is not for sale', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(runtime, 0, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.waste', quantity: 1 }));

    expect(runtime.refusals.last?.reason).toBe('purchase.unknown-material');
  });

  it('records a duplicate order id rather than silently buying nothing', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(runtime, 0, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1 }));
    expect(runtime.refusals.last).toBeUndefined();

    submit(runtime, 1, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1 }));
    expect(runtime.refusals.last?.reason).toBe('purchase.duplicate-order');
  });

  it('shares one log with construction, so the last refusal is the last refusal', () => {
    // Both systems write to the session's single `RefusalLog`. A separate log
    // per system would mean the HUD had to decide which of two "last"
    // refusals is more recent, which is a decision with no basis.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
    submit(runtime, 1, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.brick', quantity: 1_000 }));

    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    expect(runtime.refusals.count).toBe(2);
  });
});

describe('a zoning rectangle the simulation refuses reaches the session log', () => {
  it('records a room zoned outside the map', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(
      runtime,
      0,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 100, y: 100, width: 2, height: 2 }),
    );

    expect(runtime.refusals.last?.reason).toBe('zone.out-of-bounds');
  });

  it('records a room type the prison does not know', () => {
    const runtime = createNewSimulationRuntime(0x261);
    submit(
      runtime,
      0,
      packCommand({ type: 'ZoneRoom', roomId: 'room.not-a-room', x: 2, y: 2, width: 2, height: 2 }),
    );

    expect(runtime.refusals.last?.reason).toBe('zone.unknown-room-type');
  });

  it('records a rectangle that overlaps a room already there', () => {
    const runtime = createNewSimulationRuntime(0x261);
    const zone = (sequence: number, x: number, y: number): void =>
      submit(
        runtime,
        sequence,
        packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x, y, width: 3, height: 3 }),
      );

    zone(0, 2, 2);
    expect(runtime.refusals.last).toBeUndefined();

    // Shifted by one tile, so the two rectangles overlap while their anchors
    // differ. Re-zoning the *identical* rectangle refuses as
    // `duplicate-instance-id` instead -- the instance id is derived from the
    // anchor -- which is a different refusal and has its own sentence.
    zone(1, 3, 3);
    expect(runtime.refusals.last?.reason).toBe('zone.overlaps-existing-room');
  });

  it('reports the same condition under a different id from a build order', () => {
    // The reason the wire ids are namespaced, end to end: the same tile, out
    // of bounds for both commands, produces two different refusals because
    // the player asked for two different things.
    const runtime = createNewSimulationRuntime(0x261);
    placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
    expect(runtime.refusals.last?.reason).toBe('build.out-of-bounds');

    submit(
      runtime,
      1,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 100, y: 100, width: 2, height: 2 }),
    );
    expect(runtime.refusals.last?.reason).toBe('zone.out-of-bounds');
  });

  it('leaves the service its own window, which is diagnosis rather than the alert', () => {
    // `RoomZoningService.recentRefusals()` keeps the request and the deciding
    // tile for the last thirty-two refusals. The channel carries the reason
    // and nothing else, so the two are not duplicates: one is a bounded
    // developer-facing record inside the worker, the other is one sentence on
    // screen.
    const runtime = createNewSimulationRuntime(0x261);
    submit(
      runtime,
      0,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: 100, y: 100, width: 2, height: 2 }),
    );

    expect(runtime.roomZoning.recentRefusals()).toHaveLength(1);
    expect(runtime.roomZoning.recentRefusals()[0]?.reason).toBe('out-of-bounds');
    expect(runtime.refusals.last?.reason).toBe('zone.out-of-bounds');
  });
});

describe('recording a refusal is deterministic', () => {
  it('records the same refusals, in the same order, at the same ticks, for the same commands', () => {
    // The log is written from inside the kernel's command dispatch, so it is
    // simulation-adjacent state and has to behave like it: same input, same
    // output. `docs/DETERMINISM.md`.
    const run = (): readonly (RefusalReason | undefined)[] => {
      const runtime = createNewSimulationRuntime(0x261);
      const seen: (RefusalReason | undefined)[] = [];
      placeWall(runtime, 0, OUT_OF_BOUNDS_TILE);
      seen.push(runtime.refusals.last?.reason);
      submit(runtime, 1, packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.waste', quantity: 2 }));
      seen.push(runtime.refusals.last?.reason);
      placeWall(runtime, 2, OWNED_TILE);
      seen.push(runtime.refusals.last?.reason);
      return seen;
    };

    expect(run()).toEqual(run());
    expect(run()).toEqual(['build.out-of-bounds', 'purchase.unknown-material', 'purchase.unknown-material']);
  });
});
