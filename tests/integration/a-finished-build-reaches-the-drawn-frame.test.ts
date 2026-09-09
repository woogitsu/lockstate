import { describe, expect, it } from 'vitest';
import { SimulationSnapshotFeed } from '../../src/rendering/feed/simulation-snapshot-feed';
import type { WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { RENDER_DELTA_PUBLISH_INTERVAL_MS } from '../../src/simulation/worker/state-machine';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { LoopbackWorker, TICK_MILLISECONDS } from '../helpers/loopback-simulation-worker';
import { buildRowIndex } from '../../src/rendering/world/row-index';
import { isDrawnAsWorldEdge } from '../../src/rendering/world/structures';
import type { StructurePhase } from '../../src/rendering/world/structures';

/**
 * **A finished build order reaches the drawn frame without a poll, and it
 * arrives with the edge that suppresses its construction block.**
 *
 * ## The defect this is the gate for
 *
 * Issue #1037, measured five times in
 * `docs/research/2026-09-06-what-a-finished-door-is-drawn-as.md`: **22.0,
 * 25.8, 26.1, 27.6 and 28.0 seconds** of a finished door drawn as a
 * translucent unbuilt ghost, after the Build panel had already stopped listing
 * the order. All five of `SimulationSnapshotFeed`'s `dirty` marks were facts
 * about a message the main thread already had -- a session becoming ready, a
 * clock transition, an accepted command, the tick that command was scheduled
 * for, a lost request -- and a build order completing is a fact about the
 * simulation and nothing else. So the drawn world advanced only on the
 * thirty-second consistency poll.
 *
 * [ADR 0099](../../docs/adr/0099-how-the-renderer-learns-the-world-changed.md)
 * is the accepted answer: the worker publishes a monotone marker as the fifth
 * header word of `lockstate.render-actors`, the feed treats a change in it as
 * a sixth `dirty` mark, and the snapshot request that already exists does the
 * fetching.
 *
 * ## Why the poll is switched off rather than merely long here
 *
 * `pollIntervalSeconds` is a year, and **no `simulation/command-result` and no
 * clock transition is put on the wire after the session becomes ready.** So
 * the five old marks are all spent before the first tick runs, and the *only*
 * thing left that can move what this feed draws is the marker. A run of this
 * file against the tree before ADR 0099 lands does not merely take longer: it
 * never repaints at all, and the assertions below say so in milliseconds
 * rather than in a timeout.
 *
 * The order is submitted straight to the kernel, exactly as
 * `completed-edge-structures-arrive-with-their-edge.test.ts` submits its own,
 * for the same reason: what is under test is the *transport*, and routing the
 * placement through `command-result` would hand the feed a `dirty` mark that
 * has nothing to do with the completion twenty seconds later.
 *
 * ## The clock this runs on
 *
 * One tick is 50 ms (`FixedStepClock.stepMilliseconds`), the worker publishes
 * a delta at most every `RENDER_DELTA_PUBLISH_INTERVAL_MS` = 100 ms, so every
 * second tick, and the scene pumps the feed from its frame loop at 60 Hz --
 * three `readFrame` calls a tick. A snapshot request is answered in the same
 * turn it is sent, which is the one thing here that is faster than a browser:
 * `tests/research/1037-what-a-render-snapshot-costs.research.ts` measured the
 * whole round trip at 0.41 ms for the prison a player actually has, so the
 * error that introduces is under a millisecond against a bound of 200.
 *
 * ## What it does not claim
 *
 * Not a browser measurement. `TileLayer` is Phaser and `environment: 'node'`
 * cannot reach it, so this pins when the *frame* changes and not when the
 * pixel does; `tests/browser/playtest-1027-what-a-finished-door-is-drawn-as.playtest.ts`
 * is the instrument that reads the screen.
 */

/** A year. Long enough that a poll firing would be a bug in this file rather than a slow test. */
const NO_POLL_SECONDS = 31_536_000;

/** The scene's frame loop, which is what calls `readFrame`. */
const FRAMES_PER_SECOND = 60;

const SEED = 0x1037;

/** One door, inside the single chunk a new prison owns and clear of anything else. */
const ORDER_ID = 'door-under-watch';
const DOOR = { x: 12, y: 9, edge: 'north' as const };

/** ADR 0099's bound on how long a drawn phase change may take to reach the frame. */
const BOUND_MILLISECONDS = 200;

function prisonWithADoorOrdered(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const submit = (id: string, payload: ReturnType<typeof packCommand>): void => {
    runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
    runtime.kernel.step();
  };
  submit('buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 4 }));
  submit(
    'place-door',
    packCommand({
      type: 'PlaceBuildOrder',
      orderId: ORDER_ID,
      definitionId: 'door-wooden',
      x: DOOR.x,
      y: DOOR.y,
      edge: DOOR.edge,
      transactionId: 'gesture-door-under-watch',
    }),
  );
  return runtime;
}

/** The phase the frame currently draws the watched door at, or `undefined` when it draws none. */
function drawnPhase(structures: readonly { tileX: number; tileY: number; phase: StructurePhase }[]): StructurePhase | undefined {
  return structures.find((structure) => structure.tileX === DOOR.x && structure.tileY === DOOR.y)?.phase;
}

interface Arrival {
  readonly phase: StructurePhase;
  /** Wall-clock milliseconds from the simulation making the change to the frame carrying it. */
  readonly lagMilliseconds: number;
  /** Whether the world in that same frame already carried the door's edge. */
  readonly edgeArrivedTogether: boolean;
}

describe('a finished build order reaches the drawn frame without a poll (#1037, ADR 0099)', () => {
  it('repaints within ADR 0099\'s bound at both of an order\'s drawn phase changes', () => {
    const runtime = prisonWithADoorOrdered();
    expect(runtime.refusals.count, 'no command may be refused, or this watches an empty queue').toBe(0);

    const worker = new LoopbackWorker(runtime);
    const errors: Error[] = [];
    let messageCounter = 0;
    const feed = new SimulationSnapshotFeed(worker, {
      pollIntervalSeconds: NO_POLL_SECONDS,
      generateMessageId: () => `render-${String((messageCounter += 1))}`,
      onError: (error) => errors.push(error),
    });

    // The one mark this test allows itself, and it is spent before the first
    // tick: a session becoming ready. Nothing after this line puts a
    // `command-result`, a clock transition or a poll on the wire.
    worker.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'worker-ready',
      replyTo: 'init',
      kind: 'simulation/ready',
      payload: { sessionId: 'session-1037', tick: runtime.kernel.tick, clock: { mode: 'running', speed: 1 } },
    } as unknown as WorkerToMainMessage);

    let nowMilliseconds = 0;
    feed.readFrame(nowMilliseconds / 1_000);
    const requestsAfterReady = worker.requested.length;
    expect(requestsAfterReady, 'the session-ready mark must have fetched the initial world').toBe(1);

    /** When the *simulation* last changed the door's drawn phase, and to what. */
    let simulationPhase = drawnPhase([
      {
        tileX: DOOR.x,
        tileY: DOOR.y,
        phase: 'planned',
      },
    ]);
    let simulationPhaseAt = 0;
    let framePhase = drawnPhase(feed.readFrame(nowMilliseconds / 1_000).structures);
    const arrivals: Arrival[] = [];

    // Past the delivery delay and the build itself, with room to spare: 600
    // ticks is thirty seconds of simulation and is not a boundary of anything.
    for (let tick = 0; tick < 600; tick += 1) {
      runtime.kernel.step();
      nowMilliseconds += TICK_MILLISECONDS;

      // What the simulation now draws as, read from the same projection the
      // renderer uses, so this is the moment the frame is *owed* rather than a
      // guess at it.
      const order = runtime.construction.getOrder(ORDER_ID);
      const nextSimulationPhase: StructurePhase | undefined =
        order === undefined
          ? undefined
          : order.state === 'completed'
            ? 'built'
            : order.state === 'in-progress'
              ? 'building'
              : 'planned';
      if (nextSimulationPhase !== simulationPhase) {
        simulationPhase = nextSimulationPhase;
        simulationPhaseAt = nowMilliseconds;
      }

      // The worker's own gate: a tick has moved, and 100 ms is two ticks.
      if (nowMilliseconds % RENDER_DELTA_PUBLISH_INTERVAL_MS === 0) worker.publishDelta();

      for (let frame = 0; frame < FRAMES_PER_SECOND / (1_000 / TICK_MILLISECONDS); frame += 1) {
        const at = nowMilliseconds + (frame * 1_000) / FRAMES_PER_SECOND;
        const rendered = feed.readFrame(at / 1_000);
        const phase = drawnPhase(rendered.structures);
        if (phase === framePhase) continue;
        framePhase = phase;
        if (phase === undefined) continue;
        // The one-frame invariant, asked of the frame the notification
        // produced: for a `built` edge-drawn structure the world in this same
        // frame must already carry the edge, or `TileLayer`'s conjunctive
        // guard would paint an opaque slab over the finished door.
        const structure = rendered.structures.find((candidate) => candidate.tileX === DOOR.x && candidate.tileY === DOOR.y);
        const rows = buildRowIndex(rendered.world, rendered.structures);
        const edgeTileXs = new Set((rows.get(DOOR.y)?.edges ?? []).map((edge) => edge.tileX));
        arrivals.push({
          phase,
          lagMilliseconds: at - simulationPhaseAt,
          edgeArrivedTogether:
            structure === undefined || !isDrawnAsWorldEdge(structure) ? true : edgeTileXs.has(DOOR.x),
        });
      }
    }

    expect(errors, 'no message may be refused along the way').toEqual([]);

    // Both of the two drawn phase changes ADR 0099 decision 3 names, in order.
    // `planned` is already on screen from the session-ready snapshot, so what
    // the marker has to deliver is `building` and then `built`.
    expect(arrivals.map((arrival) => arrival.phase)).toEqual(['building', 'built']);

    for (const arrival of arrivals) {
      expect(
        arrival.lagMilliseconds,
        `"${arrival.phase}" reached the frame ${String(arrival.lagMilliseconds)} ms after the simulation made it`,
      ).toBeLessThan(BOUND_MILLISECONDS);
      // Never separated, and it cannot be: the frame is assembled in one
      // object literal from one `SessionSnapshotBundle`, and a notification
      // cannot split what a single capture joins.
      expect(arrival.edgeArrivedTogether, `"${arrival.phase}" arrived without its edge`).toBe(true);
    }

    // Non-vacuous: the door really was finished, and the frame really is
    // drawing it as finished at the end of the walk.
    expect(runtime.construction.getOrder(ORDER_ID)?.state).toBe('completed');
    expect(framePhase).toBe('built');

    /*
     * AND THE COST IS TWO REQUESTS, WHICH IS THE HALF WORTH WATCHING GO RED.
     *
     * One per drawn phase change, on top of the session-ready fetch. A feed
     * that marked itself dirty on *every* delta instead of on a marker that
     * moved would ask 300 times over these 600 ticks -- 10 Hz, worse than the
     * bug -- and ADR 0099's consequences say so in as many words. The literal
     * is the claim.
     */
    expect(worker.requested).toHaveLength(requestsAfterReady + 2);
  }, 60_000);
});
