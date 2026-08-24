import { describe, expect, it } from 'vitest';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  captureSessionSnapshot,
} from '../../src/simulation/runtime/restore-session';
import { DemoActorFeed, isDemoActorsRequested } from '../../src/rendering/feed/demo-actor-feed';
import { EMPTY_RENDER_FRAME, type RenderFeed } from '../../src/rendering/feed/render-feed';
import {
  SimulationSnapshotFeed,
  type SimulationMessageSource,
} from '../../src/rendering/feed/simulation-snapshot-feed';
import { selectActorPose } from '../../src/rendering/actors/actor-pose';

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
  const bundle = captureSessionSnapshot(createNewSimulationRuntime(7));
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

function newFeed(client: FakeClient): { feed: SimulationSnapshotFeed; errors: Error[] } {
  const errors: Error[] = [];
  let counter = 0;
  const feed = new SimulationSnapshotFeed(client, {
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

  it('carries no actors, because no snapshot carries actor positions', () => {
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
    const { feed } = newFeed(client);

    client.emit(ready('running'));
    feed.readFrame(0);
    client.emit(snapshotReply(client.lastRequestId, 0));

    feed.readFrame(1); // Inside the interval.
    expect(client.sent).toHaveLength(1);

    feed.readFrame(2.5);
    expect(client.sent).toHaveLength(2);
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
    const { feed } = newFeed(client);

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
});
