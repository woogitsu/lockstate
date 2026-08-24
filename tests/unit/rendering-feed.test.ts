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
import { PRISONER_ACTOR_ASSET_ID, actorsFromSnapshot } from '../../src/rendering/feed/actors-from-snapshot';
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
  return snapshotReplyFor(captureSessionSnapshot(createNewSimulationRuntime(7)), replyTo, tick);
}

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
