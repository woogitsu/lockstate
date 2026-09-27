import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate, type TileCoordinate } from '../../src/simulation/world/coordinates';
import {
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  captureSessionSnapshot,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { GUARD_ACTOR_ASSET_ID, PRISONER_ACTOR_ASSET_ID, actorsFromSnapshot } from '../../src/rendering/feed/actors-from-snapshot';
import { constantDeploymentSchedule, createGradedDoor } from '../../src/simulation/security';
import { DemoActorFeed, isDemoActorsRequested } from '../../src/rendering/feed/demo-actor-feed';
import { EMPTY_RENDER_FRAME, type RenderFeed } from '../../src/rendering/feed/render-feed';
import {
  SimulationSnapshotFeed,
  type SimulationMessageSource,
} from '../../src/rendering/feed/simulation-snapshot-feed';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { selectActorPose } from '../../src/rendering/actors/actor-pose';
import { LOCOMOTION_SUBTILE_UNITS } from '../../src/simulation/locomotion';
import { writeRenderActorsPayload, type ReadRenderActorRecord } from '../helpers/render-actors-reader';

/** Sub-tile units in a tile, spelled once so the records below read as tiles. */
const SUB = LOCOMOTION_SUBTILE_UNITS;

/**
 * The feed is where the renderer touches the worker protocol, so it is worth
 * pinning what it sends and when: too eagerly and every frame costs the worker
 * a full snapshot capture; too lazily and the world never appears.
 *
 * The snapshots here are real ones, captured from a real simulation runtime,
 * so a change to the session bundle shape fails this test rather than silently
 * producing an empty world.
 */

class FakeClient implements SimulationMessageSource {
  public readonly sent: MainToWorkerMessage[] = [];
  private readonly handlers: ((message: WorkerToMainMessage) => void)[] = [];

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handlers.push(handler);
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public emit(message: WorkerToMainMessage): void {
    for (const handler of this.handlers) handler(message);
  }

  public get lastRequestId(): string {
    const last = this.sent.at(-1);
    if (last === undefined) throw new Error('Nothing was sent.');
    return last.messageId;
  }
}

const ready = (mode: 'paused' | 'running' = 'paused'): WorkerToMainMessage =>
  ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'worker-ready',
    replyTo: 'init',
    kind: 'simulation/ready',
    payload: { sessionId: 'session-1', tick: 0, clock: mode === 'paused' ? { mode: 'paused' } : { mode: 'running', speed: 1 } },
  }) as WorkerToMainMessage;

function snapshotReply(replyTo: string, tick: number): WorkerToMainMessage {
  return snapshotReplyFor(captureSessionSnapshot(createNewSimulationRuntime(7)), replyTo, tick);
}

/**
 * The unsolicited readout a running worker posts, and the message this file
 * did not have.
 *
 * `SimulationWorkerStateMachine.publishClockState` posts one of these on every
 * tick-loop wake where the tick has moved and `CLOCK_STATE_PUBLISH_INTERVAL_MS`
 * has elapsed -- up to four a second, for the life of a running session. No
 * `replyTo`, because nobody asked (ADR 0003 forbids an unsolicited message
 * presenting itself as a response), which is what distinguishes it from the
 * correlated reply `handleSetClock` sends.
 *
 * Every case below that claims something about a *running* clock has to lay
 * these over its render frames, or it pins its claim on a wire trace a running
 * worker never produces.
 */
const clockState = (tick: number, mode: 'paused' | 'running'): WorkerToMainMessage =>
  ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `clock-${String(tick)}`,
    kind: 'simulation/clock-state',
    payload: { tick, clock: mode === 'paused' ? { mode: 'paused' } : { mode: 'running', speed: 1 } },
  }) as WorkerToMainMessage;

/**
 * The same reply built around a caller-supplied bundle, so a test can put a
 * *populated* prison on the wire. Captured from a real runtime by the caller,
 * for the reason the file header gives: a change to the bundle shape must fail
 * a test rather than quietly produce an empty world.
 */
function snapshotReplyFor(bundle: SessionSnapshotBundle, replyTo: string, tick: number): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `snap-${replyTo}`,
    replyTo,
    kind: 'simulation/snapshot',
    payload: {
      tick,
      reason: 'consistency-check',
      snapshot: {
        transport: 'structured-clone',
        schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
        schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
        data: bundle,
      },
    },
  } as unknown as WorkerToMainMessage;
}

/**
 * One approved build order on a session still at tick 0.
 *
 * Written straight onto the construction system rather than through the
 * kernel, so the fixture states the *world* the feed is handed and borrows
 * nothing from the dispatch path under discussion. `submitOrder` is what the
 * `PlaceBuildOrder` handler calls and it writes the order's state itself, so
 * this is the same order a paused dispatch produces.
 */
function withPausedOrder(runtime: SimulationRuntime): SimulationRuntime {
  runtime.construction.submitOrder(
    createBuildOrder('order-paused', 'wall-brick', { x: tileCoordinate(5), y: tileCoordinate(5) }),
  );
  return runtime;
}

function newFeed(
  client: FakeClient,
  options: { readonly pollIntervalSeconds?: number } = {},
): { feed: SimulationSnapshotFeed; errors: Error[] } {
  const errors: Error[] = [];
  let counter = 0;
  const feed = new SimulationSnapshotFeed(client, {
    ...options,
    generateMessageId: () => `render-${(counter += 1)}`,
    onError: (error) => errors.push(error),
  });
  return { feed, errors };
}

describe('simulation snapshot feed', () => {
  it('draws nothing and asks for nothing until a session exists', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client);

    expect(feed.readFrame(0)).toBe(EMPTY_RENDER_FRAME);
    expect(feed.readFrame(60)).toBe(EMPTY_RENDER_FRAME);
    expect(client.sent).toHaveLength(0);
  });

  it('asks for the world once a session is ready, and builds it from the reply', () => {
    const client = new FakeClient();
    const { feed, errors } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);

    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]?.kind).toBe('simulation/request-snapshot');
    // Distinguishable from a save request, which is what `manual-save` and
    // `autosave` mean on this same channel.
    expect((client.sent[0] as { payload: { reason: string } }).payload.reason).toBe('consistency-check');

    client.emit(snapshotReply(client.lastRequestId, 0));
    const frame = feed.readFrame(0.1);

    expect(errors).toEqual([]);
    expect(frame.revision).toBe(1);
    expect(frame.world.isChunkLoaded(0, 0)).toBe(true);
    expect(frame.world.isTileOwned(5, 5)).toBe(true);
    expect(feed.hasWorld).toBe(true);
  });

  // The bundle carries prisoner tiles and this feed now reads them, so an
  // empty `actors` here is a statement about the *prison*, not about the
  // decoder: a fresh session has no prisoners because nothing in `src/` calls
  // `admitPrisoner`. The populated case is `describe('actors from a session
  // snapshot')` below, which admits through the real runtime.
  it('carries no actors for a fresh session, which genuinely has no prisoners', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client);
    client.emit(ready());
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));

    expect(feed.readFrame(1).actors).toEqual([]);
  });

  it('stops polling a paused session, so an idle prison costs one request', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));

    for (let second = 1; second < 60; second += 1) feed.readFrame(second);
    expect(client.sent).toHaveLength(1);
  });

  it('polls again once the clock is running, at its interval', () => {
    const client = new FakeClient();
    // The interval is stated here rather than taken from the default, so this
    // case is about the *rule* and the case below is about the shipped figure.
    // They were one test until ADR 0040 slice 1 moved the default from 2 s to
    // 30 s, at which point a test that asserted both said neither clearly.
    const { feed } = newFeed(client, { pollIntervalSeconds: 2 });

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));

    feed.readFrame(1); // Inside the interval.
    expect(client.sent).toHaveLength(1);

    feed.readFrame(2.5);
    expect(client.sent).toHaveLength(2);
  });

  it('polls on a thirty-second consistency interval by default, not on the render path', () => {
    /*
     * The shipped figure, as a literal, because it is the half of ADR 0040
     * slice 1 that is a decision rather than a mechanism: with the actors on
     * `simulation/delta`, this request is a consistency net and no longer the
     * data path, so it goes from 2 s to 30 s -- fifteen times fewer full
     * session-bundle captures on the worker and fifteen times fewer
     * `jsonValueSchema` walks on this thread.
     *
     * A literal rather than the module's own constant on purpose: importing
     * `DEFAULT_POLL_INTERVAL_SECONDS` would make this assertion true for any
     * value it holds, which is the self-comparison `docs/TESTING.md` names.
     * The old default is checked too, so a revert reads as a failure here
     * rather than as a silently slower poll.
     */
    const client = new FakeClient();
    const { feed } = newFeed(client);

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));

    // The readouts a running worker posts while this interval elapses. Without
    // them the case pins the interval on a wire a running session never puts
    // on the boundary, and every `simulation/clock-state` in between is free to
    // request a snapshot without failing anything here.
    feed.readFrame(2.5); // Would have polled under the old 2 s default.
    client.emit(clockState(50, 'running'));
    feed.readFrame(2.6);
    client.emit(clockState(598, 'running'));
    feed.readFrame(29.9);
    expect(client.sent).toHaveLength(1);

    feed.readFrame(30);
    expect(client.sent).toHaveLength(2);
  });

  it('costs two requests over thirty running seconds, not one per clock readout', () => {
    /*
     * The figure `docs/RENDERING.md` prints, measured over the traffic a real
     * running session produces rather than over `readFrame` alone: sixty render
     * frames a second for thirty seconds, with the worker's own 250 ms
     * `simulation/clock-state` cadence laid over them and every request
     * answered, so the count is bounded by the feed's rule and not by the
     * pending-request timeout.
     *
     * It is written out as a literal for the same reason the case above states
     * 30: two is the *claim* -- one request to build the world when the session
     * becomes ready, one consistency poll at t=30 -- and a count derived from
     * the feed's own constants would hold for any rule it implements. Before
     * this was pinned the same trace produced 121, because
     * `simulation/clock-state` marked the world dirty on the running *state*
     * rather than on the transition into it, and a snapshot request is a full
     * `captureSessionSnapshot` on the worker, a `jsonValueSchema` walk on this
     * thread and -- via the frame revision -- a full `TileLayer` rebuild on the
     * thread that draws.
     */
    const client = new FakeClient();
    const { feed } = newFeed(client);
    // Captured once. A fresh capture per reply would make this case a
    // measurement of `createNewSimulationRuntime` rather than of the feed.
    const bundle = captureSessionSnapshot(createNewSimulationRuntime(7));

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 0));

    const frames = 30 * 60;
    let answered = 1;
    let nextClockAtSeconds = 0.25;
    let tick = 0;
    for (let frame = 1; frame <= frames; frame += 1) {
      const nowSeconds = frame / 60;
      while (nowSeconds >= nextClockAtSeconds) {
        // The kernel runs at 20 Hz, so a quarter second is five ticks. The
        // number matters only in that it *moves*: a clock state whose tick
        // stood still is one the worker would not have posted, and a snapshot
        // at an unchanged tick is one this feed skips applying.
        tick += 5;
        client.emit(clockState(tick, 'running'));
        nextClockAtSeconds += 0.25;
      }
      feed.readFrame(nowSeconds);
      while (client.sent.length > answered) {
        answered += 1;
        client.emit(snapshotReplyFor(bundle, client.sent[answered - 1]!.messageId, tick));
      }
    }

    expect(client.sent).toHaveLength(2);
  });

  it('polls when the clock starts, and not on the readouts saying it is still running', () => {
    /*
     * The transition is the event, and the state is not. A command queued while
     * the clock was paused does not execute until the first tick after it
     * starts (`Kernel.step` dispatches, and a paused clock does not step), so a
     * clock that *started* genuinely can have changed the world. A clock that
     * is merely still running has changed nothing this message reports.
     */
    const client = new FakeClient();
    const { feed } = newFeed(client);
    const bundle = captureSessionSnapshot(createNewSimulationRuntime(7));

    client.emit(ready()); // Paused.
    feed.readFrame(0);
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 0));
    expect(client.sent).toHaveLength(1);

    client.emit(clockState(5, 'running'));
    feed.readFrame(0.25);
    expect(client.sent).toHaveLength(2);
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 5));

    client.emit(clockState(10, 'running'));
    feed.readFrame(0.5);
    client.emit(clockState(15, 'running'));
    feed.readFrame(0.75);
    expect(client.sent).toHaveLength(2);
  });

  it('polls again once the tick reaches a queued command, since that is when it changes the world', () => {
    /*
     * `SimulationCommandSender.projectExecuteTick` schedules a command a lead
     * ahead of the tick it was sent at -- twenty ticks, a second at the
     * kernel's 20 Hz -- so the poll the acceptance triggers captures a world
     * the command has not touched yet. Something has to ask again once the
     * simulation has actually reached it, and with the clock-state rule fixed
     * to fire on the transition, nothing else would: the build would appear on
     * the next thirty-second consistency poll.
     *
     * The tick the worker names in its own acceptance is what says when, so
     * this needs no timer and no second copy of the lead.
     */
    const client = new FakeClient();
    const { feed } = newFeed(client);
    const bundle = captureSessionSnapshot(createNewSimulationRuntime(7));

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 0));

    client.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'result-1',
      replyTo: 'command-1',
      kind: 'simulation/command-result',
      payload: { status: 'queued', commandId: 'command-1', sequence: 0, scheduledForTick: 20 },
    } as WorkerToMainMessage);
    feed.readFrame(0.1);
    expect(client.sent).toHaveLength(2); // The acceptance, ahead of the effect.
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 2));

    client.emit(clockState(15, 'running')); // Not there yet.
    feed.readFrame(0.75);
    expect(client.sent).toHaveLength(2);

    client.emit(clockState(20, 'running')); // The command has run.
    feed.readFrame(1);
    expect(client.sent).toHaveLength(3);
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 20));

    // And once, not on every readout after it.
    client.emit(clockState(25, 'running'));
    feed.readFrame(1.25);
    client.emit(clockState(30, 'running'));
    feed.readFrame(1.5);
    expect(client.sent).toHaveLength(3);
  });

  /**
   * The unchanged-tick skip, and the case that made it wrong (ADR 0051).
   *
   * The skip's comment read *"nothing in the world can change without the
   * simulation advancing"*, and that sentence stopped being true when the
   * worker began dispatching a command submitted against a paused clock: a
   * wall ordered during a pause becomes an `approved` build order **at the
   * tick the session is already on**, and `structuresFromConstruction` maps
   * that to the `planned` ghost this renderer has always known how to draw.
   * The feed asked for the snapshot that carried it -- an acceptance sets
   * `dirty` -- and then threw the answer away on the tick test, so the
   * player's order stayed invisible until they pressed play.
   *
   * Both halves are measured, because only the pair says the fix is not just
   * "apply everything": the reply to a poll something provoked is applied at
   * an unmoved tick, and the reply to the thirty-second consistency poll is
   * still skipped at one.
   */
  it('applies a snapshot at an unmoved tick when a command provoked the poll', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client);

    const empty = captureSessionSnapshot(createNewSimulationRuntime(7));
    // The same session with one order in it, at the same tick: exactly the
    // bundle the worker now captures after a paused dispatch.
    const ordered = captureSessionSnapshot(withPausedOrder(createNewSimulationRuntime(7)));
    expect(ordered.kernel.tick, 'the fixture advanced the clock, so it is not the case under test').toBe(0);
    expect(ordered.construction.orders.length, 'the fixture carries no order to notice').toBe(1);

    client.emit(ready()); // Paused.
    feed.readFrame(0);
    client.emit(snapshotReplyFor(empty, client.lastRequestId, 0));
    expect(feed.readFrame(0.1).structures).toEqual([]);
    const revisionBefore = feed.readFrame(0.1).revision;

    client.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'result-1',
      replyTo: 'command-1',
      kind: 'simulation/command-result',
      payload: { status: 'queued', commandId: 'command-1', sequence: 0, scheduledForTick: 0 },
    } as WorkerToMainMessage);
    feed.readFrame(0.2);
    expect(client.sent).toHaveLength(2);

    // The tick has not moved and the world has, which is the whole case.
    client.emit(snapshotReplyFor(ordered, client.lastRequestId, 0));
    const painted = feed.readFrame(0.3);
    expect(painted.structures.map((structure) => structure.phase)).toEqual(['planned']);
    expect(painted.revision).toBeGreaterThan(revisionBefore);
  });

  it('still skips a consistency poll answered at the tick it already drew', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client, { pollIntervalSeconds: 1 });
    const bundle = captureSessionSnapshot(createNewSimulationRuntime(7));

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 4));
    const revisionBefore = feed.readFrame(0.1).revision;

    // The interval, and nothing else: no command, no session, no resume. The
    // worker answers at the tick already drawn, and rebuilding the whole world
    // view for it would be the cost this skip exists to avoid.
    feed.readFrame(1.5);
    expect(client.sent).toHaveLength(2);
    client.emit(snapshotReplyFor(bundle, client.lastRequestId, 4));
    expect(feed.readFrame(1.6).revision).toBe(revisionBefore);
  });

  it('polls immediately after a command is accepted, since commands change geometry', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));
    feed.readFrame(0.1);
    expect(client.sent).toHaveLength(1);

    client.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'result-1',
      replyTo: 'command-1',
      kind: 'simulation/command-result',
      payload: { status: 'queued', commandId: 'command-1', sequence: 0, scheduledForTick: 4 },
    } as WorkerToMainMessage);

    feed.readFrame(0.2);
    expect(client.sent).toHaveLength(2);
  });

  it('ignores a snapshot it did not ask for, such as one captured for a save', () => {
    const client = new FakeClient();
    const { feed, errors } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);
    client.emit(snapshotReply('some-other-request', 12));

    expect(feed.readFrame(0.1).revision).toBe(0);
    expect(errors).toEqual([]);
  });

  it('does not rebuild the view when the simulation has not advanced', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client, { pollIntervalSeconds: 2 });

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 4));
    const first = feed.readFrame(0.1);

    feed.readFrame(3);
    client.emit(snapshotReply(client.lastRequestId, 4));
    expect(feed.readFrame(3.1)).toBe(first);

    feed.readFrame(6);
    client.emit(snapshotReply(client.lastRequestId, 9));
    expect(feed.readFrame(6.1).revision).toBe(2);
  });

  it('redraws for a new session even when its tick matches the last one drawn', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));
    const first = feed.readFrame(0.1);
    expect(first.revision).toBe(1);

    // A second session in the same page, which #149 made reachable: the
    // worker behind this feed is a different one and its prison is a
    // different prison. Tick 0 is the ordinary case for both -- a freshly
    // created prison and a saved-while-paused one -- so the "nothing has
    // advanced, keep the frame" shortcut would otherwise leave the first
    // prison on screen under the second one's name.
    client.emit(ready());
    feed.readFrame(1);
    client.emit(snapshotReply(client.lastRequestId, 0));
    expect(feed.readFrame(1.1).revision).toBe(2);
  });

  it('reports an incompatible snapshot instead of drawing something wrong', () => {
    const client = new FakeClient();
    const { feed, errors } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);
    const reply = snapshotReply(client.lastRequestId, 1) as unknown as {
      payload: { snapshot: { schemaVersion: number } };
    };
    reply.payload.snapshot.schemaVersion = SESSION_SNAPSHOT_SCHEMA_VERSION + 1;
    client.emit(reply as unknown as WorkerToMainMessage);

    expect(feed.readFrame(0.1).revision).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('this renderer understands');
  });

  it('retries after a request the worker never answers', () => {
    const client = new FakeClient();
    const { feed, errors } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);
    expect(client.sent).toHaveLength(1);

    feed.readFrame(5); // Still inside the timeout.
    expect(client.sent).toHaveLength(1);

    feed.readFrame(30);
    expect(client.sent).toHaveLength(2);
    expect(errors[0]?.message).toContain('did not answer');
  });

  it('stops asking once the session stops', () => {
    const client = new FakeClient();
    const { feed } = newFeed(client);

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));
    client.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'stopped',
      replyTo: 'shutdown',
      kind: 'simulation/stopped',
      payload: { tick: 3, reason: 'shutdown-requested' },
    } as WorkerToMainMessage);

    feed.readFrame(30);
    expect(client.sent).toHaveLength(1);
  });
});

/**
 * The receiving half of ADR 0040 slice 1.
 *
 * Every buffer here is built by `writeRenderActorsPayload`, a hand-written
 * writer over the ADR's layout table, so the feed's production decoder is
 * driven by bytes it did not produce -- `tests/helpers/render-actors-reader.ts`
 * says why at length.
 */
describe('the render delta channel feeds the actors', () => {
  function delta(
    tick: number,
    records: readonly ReadRenderActorRecord[],
    overrides: {
      readonly baseTick?: number;
      readonly flags?: number;
      readonly layoutVersion?: number;
      readonly schemaId?: string;
      readonly schemaVersion?: number;
      /**
       * ADR 0099's fifth header word. Defaults to `0` and therefore never
       * moves across two calls, so every case in this describe block that is
       * about the actors keeps the wire trace it had before the word existed:
       * a marker that stood still is a delta the feed does not fetch on.
       */
      readonly worldRevision?: number;
    } = {},
  ): WorkerToMainMessage {
    const data = writeRenderActorsPayload({
      // Layout 6 carries both live guard-claim flags beside ADR 0097's room block. The
      // cases in this block carry no rooms, which is a zero in the room-count
      // word and the same actor bytes layout 3 wrote.
      layoutVersion: overrides.layoutVersion ?? 6,
      flags: overrides.flags ?? 1,
      worldRevision: overrides.worldRevision ?? 0,
      records,
      removed: [],
    });
    return {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `delta-${String(tick)}`,
      kind: 'simulation/delta',
      payload: {
        baseTick: overrides.baseTick ?? tick - 1,
        tick,
        delta: {
          schemaId: overrides.schemaId ?? 'lockstate.render-actors',
          schemaVersion: overrides.schemaVersion ?? 6,
          transport: 'array-buffer',
          contentType: 'application/x-lockstate-render-actors',
          byteLength: data.byteLength,
          data,
        },
      },
    } as unknown as WorkerToMainMessage;
  }

  /** One standing prisoner on tile (5, 7): sub-tile units, no velocity, and the biased `0, 0` heading. */
  const RECORD: ReadRenderActorRecord = {
    entityId: 12,
    packedFields: 0b0101 << 8,
    subX: 5 * SUB,
    subY: 7 * SUB,
    velocitySubX: 0,
    velocitySubY: 0,
  };

  /** A feed holding a real world, so "the world is left alone" is a statement about something. */
  function feedWithWorld(): { client: FakeClient; feed: SimulationSnapshotFeed; errors: Error[] } {
    const client = new FakeClient();
    const { feed, errors } = newFeed(client);
    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 1));
    feed.readFrame(0.1);
    return { client, feed, errors };
  }

  it('replaces the actors and leaves the world and the structures alone', () => {
    const { client, feed } = feedWithWorld();
    const before = feed.readFrame(0.2);
    expect(before.world.loadedChunkCount).toBeGreaterThan(0);

    client.emit(delta(4, [RECORD]));
    const after = feed.readFrame(0.3);

    expect(after.actors).toEqual([
      { id: 12, assetId: PRISONER_ACTOR_ASSET_ID, tileX: 5, tileY: 7, deltaX: 0, deltaY: 0 },
    ]);
    // The same objects, not merely equal ones: the tile painter and the
    // structure layer must have nothing to redo.
    expect(after.world).toBe(before.world);
    expect(after.structures).toBe(before.structures);
  });

  it('does not move the revision, so the tile painter does not repaint', () => {
    /*
     * `RenderFrame.revision` is geometry-only -- "increments whenever `world`
     * or `structures` change" -- and `TileLayer` repaints on a change of
     * revision or of visible range and on nothing else. An actor-only update
     * that bumped it would repaint every visible chunk up to ten times a
     * second to move some sprites, which is the cost this channel exists to
     * remove rather than to add.
     */
    const { client, feed } = feedWithWorld();
    const revision = feed.readFrame(0.2).revision;
    expect(revision).toBe(1);

    for (let tick = 2; tick <= 12; tick += 1) client.emit(delta(tick, [{ ...RECORD, subX: tick * SUB }]));

    const after = feed.readFrame(0.3);
    expect(after.revision).toBe(revision);
    // Non-vacuous: eleven deltas really were applied, and the last one won.
    expect(after.actors[0]!.tileX).toBe(12);
  });

  it('draws actors before any snapshot has arrived, on a frame with no world', () => {
    // The channel is the data path for actors, so it must not be gated on the
    // consistency poll having answered -- which, at thirty seconds, it may not
    // have.
    const client = new FakeClient();
    const { feed } = newFeed(client);
    client.emit(ready('running'));

    client.emit(delta(2, [RECORD]));
    const frame = feed.readFrame(0);
    expect(frame.actors).toHaveLength(1);
    expect(frame.revision).toBe(0);
  });

  it('discards a coalesced or reordered publication instead of moving actors backwards', () => {
    const { client, feed } = feedWithWorld();
    client.emit(delta(9, [{ ...RECORD, subX: 9 * SUB }]));
    expect(feed.readFrame(0.2).actors[0]!.tileX).toBe(9);

    client.emit(delta(5, [{ ...RECORD, subX: 5 * SUB }]));
    client.emit(delta(9, [{ ...RECORD, subX: 99 * SUB }]));
    expect(feed.readFrame(0.3).actors[0]!.tileX).toBe(9);

    client.emit(delta(10, [{ ...RECORD, subX: 10 * SUB }]));
    expect(feed.readFrame(0.4).actors[0]!.tileX).toBe(10);
  });

  it('accepts a delta from a new session at a tick the previous one had passed', () => {
    // Two prisons paused at the same tick are two different simulations, which
    // is the reason `simulation/ready` clears what the feed last drew. Without
    // it the second session's actors would be discarded as stale.
    const { client, feed } = feedWithWorld();
    client.emit(delta(9, [{ ...RECORD, subX: 9 * SUB }]));
    expect(feed.readFrame(0.2).actors[0]!.tileX).toBe(9);

    client.emit(ready('running'));
    client.emit(delta(2, [{ ...RECORD, subX: 2 * SUB }]));
    expect(feed.readFrame(0.3).actors[0]!.tileX).toBe(2);
  });

  it('keeps the actors it has when a payload is one it cannot read', () => {
    const cases: readonly [string, WorkerToMainMessage, RegExp][] = [
      ['a schema id from another read model', delta(6, [RECORD], { schemaId: 'lockstate.something-else' }), /understands "lockstate.render-actors"/],
      ['a payload version this build does not know', delta(6, [RECORD], { schemaVersion: 7 }), /v7/],
      ['a header version this build does not know', delta(6, [RECORD], { layoutVersion: 7 }), /layout 7/],
      ['a changed-only message, which this receiver cannot apply', delta(6, [RECORD], { flags: 0 }), /keyframes only/],
    ];

    for (const [why, message, expected] of cases) {
      const { client, feed, errors } = feedWithWorld();
      client.emit(delta(4, [{ ...RECORD, subX: 4 * SUB }]));
      expect(feed.readFrame(0.2).actors[0]!.tileX, why).toBe(4);

      client.emit(message);
      const after = feed.readFrame(0.3);
      expect(after.actors[0]!.tileX, why).toBe(4);
      expect(errors.at(-1)?.message, why).toMatch(expected);
    }
  });

  it('reports a body whose length contradicts its own header rather than drawing a phantom', () => {
    const { client, feed, errors } = feedWithWorld();
    const truncated = delta(6, [RECORD]) as { payload: { delta: { data: ArrayBuffer; byteLength: number } } };
    truncated.payload.delta.data = truncated.payload.delta.data.slice(0, 32);
    truncated.payload.delta.byteLength = 32;

    client.emit(truncated as unknown as WorkerToMainMessage);
    expect(feed.readFrame(0.3).actors).toEqual([]);
    // Forty-four since ADR 0097's room-count word joined the header: six
    // words and one twenty-byte record. It was 40 for ADR 0099's five-word
    // header, and 36 before that.
    expect(errors.at(-1)?.message).toMatch(/must be 44 bytes, got 32/);
  });

  /*
   * ADR 0099's sixth `dirty` mark, both halves of it.
   *
   * `docs/adr/0099-how-the-renderer-learns-the-world-changed.md`'s
   * consequences ask for exactly these two cases and say which one matters
   * more: *"a delta whose marker moved provokes exactly one request, and a
   * delta whose marker did not provokes none. The second half is the one worth
   * watching go red -- a marker read unconditionally would put a snapshot
   * request on every delta, which is 10 Hz and worse than the bug."*
   */
  it('asks for a snapshot when a delta says the drawn world changed', () => {
    const { client, feed } = feedWithWorld();
    const requestsBefore = client.sent.length;

    // Two deltas at the same marker establish the baseline and prove it is
    // being read: the second is where an unconditional read would fire.
    client.emit(delta(4, [RECORD], { worldRevision: 7 }));
    feed.readFrame(0.2);
    client.emit(delta(5, [RECORD], { worldRevision: 7 }));
    feed.readFrame(0.3);
    expect(client.sent).toHaveLength(requestsBefore);

    // Something was built.
    client.emit(delta(6, [RECORD], { worldRevision: 8 }));
    feed.readFrame(0.4);
    expect(client.sent).toHaveLength(requestsBefore + 1);
    expect(client.sent.at(-1)?.kind).toBe('simulation/request-snapshot');

    // And the answer to it is applied even though `pump` single-flights: the
    // world the request fetched is what makes the notification worth sending.
    client.emit(snapshotReply(client.lastRequestId, 6));
    expect(feed.readFrame(0.5).revision).toBe(2);
  });

  it('asks for nothing across a hundred deltas whose marker never moved', () => {
    /*
     * The half worth watching go red. A hundred deltas is ten seconds of the
     * worker's 100 ms ceiling, and an unconditional `dirty` would send a
     * hundred `captureSessionSnapshot`s in that time -- each one also a
     * `jsonValueSchema` walk on this thread and, through the frame revision, a
     * whole `TileLayer` rebuild on the thread that draws. The literal is the
     * claim.
     */
    const { client, feed } = feedWithWorld();
    const requestsBefore = client.sent.length;

    for (let tick = 4; tick < 104; tick += 1) {
      client.emit(delta(tick, [{ ...RECORD, subX: tick * SUB }], { worldRevision: 12 }));
      feed.readFrame(tick / 60);
    }

    expect(client.sent).toHaveLength(requestsBefore);
    // Non-vacuous: a hundred deltas really were applied.
    expect(feed.readFrame(2).actors[0]!.tileX).toBe(103);
  });

  it('costs one redundant request for a command that moved the marker, and not two', () => {
    /*
     * The cost ADR 0099 does not mention, pinned so it cannot quietly grow.
     *
     * A command that changes geometry sets `dirty` twice on its own -- at its
     * acceptance, and again at the tick it was scheduled for -- and the second
     * of those already fetches a world carrying the write. The write also
     * moved the marker, so the next delta fetches once more for a change this
     * feed has already drawn. Three requests where two would do, and the third
     * is the safe direction to be wrong in; removing it would need the marker
     * on the snapshot *reply*, which is a protocol change ADR 0099 declines.
     *
     * The literal is the claim: **one** extra, and every further delta at the
     * same marker is free.
     */
    const client = new FakeClient();
    const { feed } = newFeed(client);

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 1));
    client.emit(delta(2, [RECORD], { worldRevision: 5 }));
    feed.readFrame(0.1);
    expect(client.sent).toHaveLength(1);

    // A zoning command: accepted, then reached.
    client.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'ack',
      replyTo: 'cmd-1',
      kind: 'simulation/command-result',
      payload: { status: 'queued', commandId: 'cmd-1', sequence: 0, scheduledForTick: 20 },
    } as unknown as WorkerToMainMessage);
    feed.readFrame(0.2);
    client.emit(snapshotReply(client.lastRequestId, 10));
    client.emit(clockState(20, 'running'));
    feed.readFrame(0.3);
    client.emit(snapshotReply(client.lastRequestId, 20));
    expect(client.sent).toHaveLength(3);

    // The write that command made moved the marker, and this feed has not seen
    // the new value yet, so the next delta asks a third time for a world it is
    // already holding.
    client.emit(delta(21, [RECORD], { worldRevision: 6 }));
    feed.readFrame(0.4);
    expect(client.sent).toHaveLength(4);
    client.emit(snapshotReply(client.lastRequestId, 21));

    // And exactly one: every further delta at the same marker is free.
    for (let tick = 22; tick < 40; tick += 1) {
      client.emit(delta(tick, [RECORD], { worldRevision: 6 }));
      feed.readFrame(0.4 + tick / 100);
    }
    expect(client.sent).toHaveLength(4);
  });

  it('treats the first marker of a session as a baseline rather than as a change', () => {
    /*
     * The judgement in this mechanism that ADR 0099 does not force, so it is
     * pinned rather than left to the implementation: a session's opening
     * request has already gone out on `simulation/ready`, and asking again on
     * the first delta would ask for a world nothing has touched. It is also
     * what keeps the pinned floor of *two requests over thirty running
     * seconds* above -- a third would be this.
     */
    const client = new FakeClient();
    const { feed } = newFeed(client);

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 1));
    expect(client.sent).toHaveLength(1);

    // A marker this feed has never seen before, and a large one: the counter
    // starts at zero in a new world, so anything non-zero here is a world that
    // has already been written to before the first delta went out.
    client.emit(delta(4, [RECORD], { worldRevision: 4_294_967_295 }));
    feed.readFrame(0.2);
    expect(client.sent).toHaveLength(1);

    // And a second session's marker is compared against nothing either: the
    // counter restarts at zero, so `0` after `4,294,967,295` is not a change
    // by 4 billion, it is a different simulation.
    client.emit(ready('running'));
    feed.readFrame(0.3);
    const afterSecondReady = client.sent.length;
    client.emit(delta(1, [RECORD], { worldRevision: 0 }));
    feed.readFrame(0.4);
    expect(client.sent).toHaveLength(afterSecondReady);
  });

  it('moves a walking actor between publications, from where it was published', () => {
    /*
     * **The other half of #414's "actors teleport", and the half that is this
     * side of the worker boundary.** ADR 0059 gives an actor a velocity; the
     * worker publishes on a 100 ms ceiling; the scene draws every frame. Left
     * alone, a prisoner walking at five tiles a second would move in half-tile
     * steps ten times a second. `readFrame` advances the published position by
     * the published velocity instead -- bounded, corrected by the next
     * publication, and feeding nothing (`actor-extrapolation.ts` argues why
     * that is not the renderer-side movement model `AGENTS.md` boundary 1
     * forbids).
     */
    const { client, feed } = feedWithWorld();
    // Five tiles a second east, published standing on tile 5.
    client.emit(delta(4, [{ ...RECORD, subX: 5 * SUB, velocitySubX: 5 * SUB, packedFields: 0b0110 << 8 }]));

    // The first frame after a publication is when it is "sampled": a message
    // handler has no presentation clock, so the frame loop supplies one.
    expect(feed.readFrame(1).actors[0]!.tileX).toBe(5);
    expect(feed.readFrame(1.05).actors[0]!.tileX).toBeCloseTo(5.25, 10);
    expect(feed.readFrame(1.1).actors[0]!.tileX).toBeCloseTo(5.5, 10);

    // The next publication is the correction, and it resets the base: the
    // renderer never accumulates its own idea of where an actor is.
    client.emit(delta(6, [{ ...RECORD, subX: 6 * SUB, velocitySubX: 5 * SUB, packedFields: 0b0110 << 8 }]));
    expect(feed.readFrame(1.2).actors[0]!.tileX).toBe(6);
    expect(feed.readFrame(1.25).actors[0]!.tileX).toBeCloseTo(6.25, 10);
  });

  it('stops advancing actors the moment the clock pauses, rather than sliding them on', () => {
    // A paused worker publishes nothing -- the publication is skipped on an
    // unmoved tick -- so the last velocity it sent would otherwise carry every
    // walking actor a quarter of a second past the pause.
    const { client, feed } = feedWithWorld();
    client.emit(delta(4, [{ ...RECORD, subX: 5 * SUB, velocitySubX: 5 * SUB, packedFields: 0b0110 << 8 }]));
    expect(feed.readFrame(1).actors[0]!.tileX).toBe(5);
    expect(feed.readFrame(1.05).actors[0]!.tileX).toBeCloseTo(5.25, 10);

    client.emit(clockState(4, 'paused'));
    expect(feed.readFrame(1.1).actors[0]!.tileX).toBe(5);
    expect(feed.readFrame(2).actors[0]!.tileX).toBe(5);
  });

  it('lets a later snapshot correct the actors, since the poll is still a consistency net', () => {
    const { client, feed } = feedWithWorld();
    client.emit(delta(4, [RECORD]));
    expect(feed.readFrame(0.2).actors).toHaveLength(1);

    feed.readFrame(31);
    client.emit(snapshotReply(client.lastRequestId, 40));
    const after = feed.readFrame(31.1);

    // A fresh session's bundle carries no prisoners, so the snapshot's answer
    // is "none" and it is the answer that stands. That is the point of the net:
    // the two paths disagreeing must resolve towards the authoritative capture.
    expect(after.actors).toEqual([]);
    // And the geometry it carried did move the revision, so this case is not
    // quietly asserting that the snapshot was ignored.
    expect(after.revision).toBe(2);
  });
});

describe('demo actor feed', () => {
  const world: RenderFeed = { readFrame: () => EMPTY_RENDER_FRAME };

  it('is opt-in through an explicit URL flag', () => {
    expect(isDemoActorsRequested('?actors=demo')).toBe(true);
    expect(isDemoActorsRequested('?debug=1&actors=demo')).toBe(true);
    expect(isDemoActorsRequested('')).toBe(false);
    expect(isDemoActorsRequested('?actors=real')).toBe(false);
  });

  it('leaves the real world underneath untouched', () => {
    const feed = new DemoActorFeed(world, { assetIds: ['actor.prisoner.base'] });
    const frame = feed.readFrame(1);
    expect(frame.world).toBe(EMPTY_RENDER_FRAME.world);
    expect(frame.structures).toBe(EMPTY_RENDER_FRAME.structures);
    expect(frame.revision).toBe(EMPTY_RENDER_FRAME.revision);
  });

  it('produces actors whose facing follows the path they are actually walking', () => {
    const feed = new DemoActorFeed(world, {
      assetIds: ['actor.prisoner.base'],
      centreTileX: 0,
      centreTileY: 0,
      radiusTiles: 4,
      revolutionSeconds: 8,
    });

    const directions = new Set<string>();
    for (let step = 0; step < 8; step += 1) {
      const actors = feed.readFrame(step).actors;
      const walker = actors[0];
      expect(walker).toBeDefined();
      // The walker stays on its circle: position and heading agree.
      expect(Math.hypot(walker!.tileX, walker!.tileY)).toBeCloseTo(4, 6);
      directions.add(selectActorPose(walker!).direction);
    }
    expect(directions.size).toBeGreaterThanOrEqual(4);
  });

  it('includes a standing actor, so the idle clip is visible too', () => {
    const feed = new DemoActorFeed(world, { assetIds: ['actor.guard.base'], centreTileX: 3, centreTileY: 5 });
    const actors = feed.readFrame(2).actors;
    const stander = actors.at(-1);
    expect(stander).toMatchObject({ tileX: 3, tileY: 5, deltaX: 0, deltaY: 0 });
    expect(selectActorPose(stander!)).toEqual({ clipId: 'idle', direction: 'south' });
  });

  it('is deterministic: the same presentation time gives the same scene', () => {
    const options = { assetIds: ['actor.cook.base', 'actor.medic.base'], centreTileX: 0, centreTileY: 0 };
    const left = new DemoActorFeed(world, options).readFrame(3.25).actors.map((actor) => ({ ...actor }));
    const right = new DemoActorFeed(world, options).readFrame(3.25).actors.map((actor) => ({ ...actor }));
    expect(left).toEqual(right);
  });

  it('gives every actor a distinct id so pooled sprites cannot collide', () => {
    const feed = new DemoActorFeed(world, { assetIds: ['a.b.c', 'd.e.f', 'g.h.i'] });
    const ids = feed.readFrame(0).actors.map((actor) => actor.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('replaces the actors the wrapped feed carries rather than adding to them', () => {
    // The demo numbers its actors from 1 and `EntityId`s start at 0, so a
    // merged list could hand two actors one pooled sprite. While the flag is
    // on, a populated prison therefore shows the demo, not its prisoners.
    const populated: RenderFeed = {
      readFrame: () => ({
        ...EMPTY_RENDER_FRAME,
        actors: [{ id: 1, assetId: 'actor.prisoner.base', tileX: 4, tileY: 4, deltaX: 0, deltaY: 0 }],
      }),
    };
    const actors = new DemoActorFeed(populated, { assetIds: ['a.b.c'] }).readFrame(0).actors;
    expect(actors.map((actor) => actor.assetId)).toEqual(['a.b.c', 'a.b.c']);
  });
});

/**
 * The half of the sprite path that was missing until now: turning the
 * prisoners a session snapshot already carries into `RenderFrame.actors`.
 *
 * Every prison here is built by admitting through `PrisonerOperationsRuntime`
 * and captured with `captureSessionSnapshot`, so what these tests decode is
 * the bundle production writes -- not a hand-built fixture that could agree
 * with a wrong decoder.
 *
 * **What this does not claim.** Nothing in `src/` calls `admitPrisoner`, so
 * the shipped app still draws no prisoners: it draws them when something
 * admits one, which is a separate step (#31). That is why these tests admit
 * rather than loading the page.
 */
describe('actors from a session snapshot', () => {
  const TILE = (x: number, y: number): { readonly x: TileCoordinate; readonly y: TileCoordinate } => ({
    x: tileCoordinate(x),
    y: tileCoordinate(y),
  });

  function prisonWith(tiles: readonly (readonly [number, number])[]): SimulationRuntime {
    const runtime = createNewSimulationRuntime(7);
    for (const [x, y] of tiles) {
      runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900 + x, priorIncidents: y }, TILE(x, y));
    }
    return runtime;
  }

  it('puts every admitted prisoner on the frame, at the tile the simulation holds', () => {
    const runtime = prisonWith([
      [4, 9],
      [11, 2],
    ]);
    const client = new FakeClient();
    const { feed, errors } = newFeed(client);

    client.emit(ready());
    feed.readFrame(0);
    client.emit(snapshotReplyFor(captureSessionSnapshot(runtime), client.lastRequestId, 0));

    const actors = feed.readFrame(0.1).actors;
    expect(errors).toEqual([]);
    expect(actors.map((actor) => ({ tileX: actor.tileX, tileY: actor.tileY, assetId: actor.assetId }))).toEqual([
      { tileX: 4, tileY: 9, assetId: PRISONER_ACTOR_ASSET_ID },
      { tileX: 11, tileY: 2, assetId: PRISONER_ACTOR_ASSET_ID },
    ]);
  });

  it('keys actors by the simulation entity id, so a sprite cannot change owner between frames', () => {
    const runtime = prisonWith([
      [1, 1],
      [2, 1],
    ]);
    const expected = [0, 1].map((index) => runtime.prisoners.entityStore.getIdByIndex(index));

    const first = captureSessionSnapshot(runtime);
    expect(actorsFromSnapshot(first.simulation, first.entities).map((actor) => actor.id)).toEqual(expected);

    // A second capture of the same prison: same ids, so the pool keeps the
    // same sprite on the same prisoner rather than flickering.
    const second = captureSessionSnapshot(runtime);
    expect(actorsFromSnapshot(second.simulation, second.entities).map((actor) => actor.id)).toEqual(expected);
  });

  it('draws only live prisoners, not the freed slots their positions are still written in', () => {
    const runtime = prisonWith([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    const destroyed = runtime.prisoners.entityStore.getIdByIndex(1);
    runtime.prisoners.entityStore.destroy(destroyed);

    // The middle prisoner's tile is still in the component arrays -- nothing
    // clears them on destroy -- so drawing it would be reading a dead slot.
    const bundle = captureSessionSnapshot(runtime);
    expect(bundle.simulation?.prisoners.components.tileX[1]).toBe(2);
    const actors = actorsFromSnapshot(bundle.simulation, bundle.entities);
    expect(actors.map((actor) => [actor.tileX, actor.tileY])).toEqual([
      [1, 1],
      [3, 1],
    ]);

    // Recycling that index issues a new id at a bumped generation, so the new
    // occupant does not inherit the destroyed prisoner's pooled sprite.
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 600, priorIncidents: 9 }, TILE(8, 8));
    const recycled = captureSessionSnapshot(runtime);
    const ids = actorsFromSnapshot(recycled.simulation, recycled.entities).map((actor) => actor.id);
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain(destroyed);
  });

  it('orders actors by ascending entity index, the canonical simulation order', () => {
    const runtime = prisonWith([
      [9, 9],
      [1, 1],
      [5, 5],
    ]);
    const bundle = captureSessionSnapshot(runtime);
    const actors = actorsFromSnapshot(bundle.simulation, bundle.entities);
    expect(actors.map((actor) => actor.id)).toEqual(
      [0, 1, 2].map((index) => runtime.prisoners.entityStore.getIdByIndex(index)),
    );
    expect(actors.map((actor) => [actor.tileX, actor.tileY])).toEqual([
      [9, 9],
      [1, 1],
      [5, 5],
    ]);
  });

  it('publishes no movement and no facing, because the snapshot carries neither', () => {
    const bundle = captureSessionSnapshot(prisonWith([[6, 6]]));
    const actor = actorsFromSnapshot(bundle.simulation, bundle.entities)[0];

    expect(actor).toMatchObject({ deltaX: 0, deltaY: 0 });
    // Left unset rather than written, so `actor-pose.ts` applies its own
    // documented default instead of the feed claiming the simulation chose it.
    expect(actor).not.toHaveProperty('facing');
    expect(selectActorPose(actor!)).toEqual({ clipId: 'idle', direction: 'south' });
  });

  it('draws nothing for a bundle that carries no prisoner sections, such as a V2 save', () => {
    const bundle = captureSessionSnapshot(prisonWith([[2, 2]]));
    expect(actorsFromSnapshot(undefined, bundle.entities)).toEqual([]);
    expect(actorsFromSnapshot(bundle.simulation, undefined)).toEqual([]);
  });

  it('draws prisoners with the prisoner art the shipped atlas batch publishes', () => {
    // The literal, not just "some id in the registry": every other assertion
    // in this file reaches the asset id through the constant, so a constant
    // quietly repointed at `actor.guard.base` -- which is in the registry too
    // -- would leave them all green while the yard filled with guards.
    expect(PRISONER_ACTOR_ASSET_ID).toBe('actor.prisoner.base');

    const registry = JSON.parse(
      readFileSync(new URL('../../public/assets/actors/asset-registry.json', import.meta.url), 'utf8'),
    ) as { readonly assets: readonly { readonly assetId: string }[] };
    expect(registry.assets.map((asset) => asset.assetId)).toContain(PRISONER_ACTOR_ASSET_ID);
  });
});

/**
 * ADR 0040 slice 2, issue #414's surviving half: guards decoded off the real
 * hiring and posting path, not off a hand-built `GuardRecord` (#375 -- a
 * fixture that supplies the very state the test then measures proves nothing).
 * Every prison below hires through `GuardRoster.hire`, the real production
 * entry point `StaffHiringService` also calls, and reaches its post by
 * stepping the real `DeploymentSystem`/`PatrolSystem`/navigation stack, exactly
 * as `tests/unit/new-session-runtime.test.ts`'s own security test does.
 */
describe('guards from a session snapshot (ADR 0040 slice 2)', () => {
  function prisonWithAGuardOnPost(): { runtime: SimulationRuntime; guardId: number; postTile: { x: number; y: number } } {
    const runtime = createNewSimulationRuntime(11);
    const doorPosition = { x: tileCoordinate(2), y: tileCoordinate(1) };
    runtime.navigation.doors.register(createGradedDoor('door-1', doorPosition, 'left', 'open', 'grade.general'));
    const postTile = { x: tileCoordinate(3), y: tileCoordinate(1) };
    runtime.securitySectors.register({ id: 'sector-1', gradeId: 'grade.general', doorIds: ['door-1'], postTile });
    runtime.securitySchedules.push(constantDeploymentSchedule('sector-1', 1));

    const guardId = runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
    for (let i = 0; i < 200 && runtime.securityGuards.getDeploymentPhase(guardId) !== 'on-post'; i += 1) {
      runtime.kernel.step();
    }
    expect(runtime.securityGuards.getDeploymentPhase(guardId)).toBe('on-post');
    return { runtime, guardId, postTile: { x: postTile.x, y: postTile.y } };
  }

  it('draws a hired, posted guard at the tile the real deployment stack actually walked it to', () => {
    const { runtime, postTile } = prisonWithAGuardOnPost();
    const bundle = captureSessionSnapshot(runtime);
    const actors = actorsFromSnapshot(bundle.simulation, bundle.entities);

    // The derived default sector (ADR 0036) also wants a guard and gets none,
    // so exactly one guard actor is on the frame -- this test's own hire.
    const guards = actors.filter((actor) => actor.assetId === GUARD_ACTOR_ASSET_ID);
    expect(guards).toHaveLength(1);
    expect(guards[0]).toMatchObject({ tileX: postTile.x, tileY: postTile.y, deltaX: 0, deltaY: 0 });
    expect(Object.hasOwn(guards[0]!, 'facing')).toBe(false);
  });

  it('draws a prisoner and a posted guard on the same frame, each with its own art', () => {
    const { runtime } = prisonWithAGuardOnPost();
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 }, { x: tileCoordinate(6), y: tileCoordinate(6) });

    const bundle = captureSessionSnapshot(runtime);
    const actors = actorsFromSnapshot(bundle.simulation, bundle.entities);

    expect(actors.map((actor) => actor.assetId).sort()).toEqual([GUARD_ACTOR_ASSET_ID, PRISONER_ACTOR_ASSET_ID]);
  });

  it("gives the guard and the prisoner different ids even though each population's own EntityStore starts at index 0", () => {
    const { runtime } = prisonWithAGuardOnPost();
    // The prisoner admitted here is index 0 of `prisoners.entityStore`, exactly
    // like the guard hired in `prisonWithAGuardOnPost` is index 0 of
    // `securityGuards.entityStore` -- the collision `composeRenderActorId`
    // exists to prevent (`render-actors-payload.ts`).
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 }, { x: tileCoordinate(6), y: tileCoordinate(6) });

    const bundle = captureSessionSnapshot(runtime);
    const actors = actorsFromSnapshot(bundle.simulation, bundle.entities);
    const ids = actors.map((actor) => actor.id);

    expect(new Set(ids).size).toBe(ids.length);
    // `ActorLayer` pools sprites in one `Map<number, …>` keyed by this id, so a
    // collision here would mean one sprite silently jumping between the two.
  });

  it('draws guard art the shipped atlas batch actually publishes', () => {
    expect(GUARD_ACTOR_ASSET_ID).toBe('actor.guard.base');
    const registry = JSON.parse(
      readFileSync(new URL('../../public/assets/actors/asset-registry.json', import.meta.url), 'utf8'),
    ) as { readonly assets: readonly { readonly assetId: string }[] };
    expect(registry.assets.map((asset) => asset.assetId)).toContain(GUARD_ACTOR_ASSET_ID);
  });
});
