import type { MainToWorkerMessage, WorkerToMainMessage } from '../../simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../simulation/protocol/types';
import {
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../simulation/runtime/restore-session';
import {
  decodeRenderActorsPayload,
  RENDER_ACTORS_LAYOUT_VERSION,
  RENDER_ACTORS_SCHEMA_ID,
  RENDER_ACTORS_SCHEMA_VERSION,
} from '../../simulation/protocol/render-actors-payload';
import { extrapolateActors, type PublishedActorPosition } from './actor-extrapolation';
import { structuresFromConstruction } from '../world/structures';
import { WorldRenderView } from '../world/world-view';
import { actorsFromDelta } from './actors-from-delta';
import { actorsFromSnapshot } from './actors-from-snapshot';
import { EMPTY_RENDER_FRAME, type MutableRenderActor, type RenderFeed, type RenderFrame } from './render-feed';

/**
 * Feeds the renderer from the simulation worker over the existing protocol.
 *
 * ### Two channels, and what each one is for
 *
 * ADR-0003's protocol publishes three things to the main thread: correlated
 * snapshots, `simulation/delta` and domain events. Two of the three now reach
 * this feed.
 *
 * **Actors arrive on `simulation/delta`** (ADR 0040 slice 1). The worker
 * publishes an unsolicited keyframe of the live population on a 100 ms ceiling,
 * as an `array-buffer` payload whose body the protocol decoder does not walk.
 * This is the data path for anything that moves, and applying one replaces
 * `frame.actors` and touches nothing else.
 *
 * **Geometry still arrives on a snapshot request**, and that request is now a
 * consistency net rather than the render path. Each one makes the worker
 * capture a full session bundle and makes this thread deep-walk it, so the feed
 * asks only when the world can actually have changed:
 *
 * - once when a session becomes ready, to get the initial world;
 * - after any command is accepted, since commands are what change geometry,
 *   and again once the simulation reaches the tick that command was scheduled
 *   for, which is when it actually changed any;
 * - when the clock *starts*, since that is when orders queued against a paused
 *   prison run;
 * - on an interval only while the simulation clock is running.
 *
 * A paused, idle session costs exactly one request. The interval is tens of
 * seconds precisely because the actors no longer ride on it; carrying chunk
 * geometry on the delta channel, and retiring the poll for renders altogether,
 * is ADR 0040's slice 4 and is not this one.
 *
 * ### Boundaries
 *
 * It sends only messages the protocol already defines, never mutates worker
 * state, and holds nothing authoritative: everything it keeps is derived from
 * a snapshot and replaced wholesale by the next one. No Phaser, no DOM, no
 * timers -- the scene pumps it from its own frame loop, which keeps it
 * testable with plain values.
 */

/** The slice of `SimulationClient` this feed uses. Structural, so tests need no worker. */
export interface SimulationMessageSource {
  addListener(handler: (message: WorkerToMainMessage) => void): void;
  send(message: MainToWorkerMessage): void;
}

export interface SimulationSnapshotFeedOptions {
  /** Poll cadence while the clock runs. */
  readonly pollIntervalSeconds?: number;
  /** How long to wait before assuming a request was lost and retrying. */
  readonly requestTimeoutSeconds?: number;
  readonly generateMessageId?: () => string;
  readonly onError?: (error: Error) => void;
}

/**
 * How often the consistency poll fires while the clock runs.
 *
 * Was 2 s, when this request was the only way any part of a frame could
 * arrive and actors therefore moved in two-second jumps. Since ADR 0040 slice 1
 * the actors arrive on `simulation/delta` at a 100 ms ceiling and the only
 * thing left on this path is geometry, which changes when the player builds
 * something -- and a build is a command, which already sets `dirty` and polls
 * immediately. So the interval no longer bounds how stale anything a player
 * looks at can be; it bounds how long a *disagreement* could persist between
 * the world this feed holds and the world the worker holds, if one ever arose
 * by a route neither `dirty` nor the delta covers.
 *
 * Thirty seconds is ADR 0040's figure for that job. The saving is the whole
 * point of the slice: each poll costs the worker a full `captureSessionSnapshot`
 * and costs this thread a `jsonValueSchema` walk of the result, so this is
 * fifteen times fewer of both.
 *
 * **That last sentence was false from the day it was written and is true now.**
 * It arrived with `ea117cd` (2026-08-26) beside a `simulation/clock-state` case
 * that had marked the world dirty on the running *state* since `d7b4a56`
 * (2026-08-23), and the worker publishes one of those up to four times a second
 * while the clock runs -- so this interval was never the binding constraint and
 * a thirty-second session cost 121 requests rather than 2, which is worse than
 * the 16 the 2 s default it replaced would have cost. `handleMessage` now reads
 * the transition, and `tests/unit/rendering-feed.test.ts` pins the count over
 * thirty running seconds against the worker's own publication cadence, which is
 * the trace the case that missed this did not put on the wire.
 */
const DEFAULT_POLL_INTERVAL_SECONDS = 30;
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 15;

export class SimulationSnapshotFeed implements RenderFeed {
  private frame: RenderFrame = EMPTY_RENDER_FRAME;
  private sessionReady = false;
  private clockRunning = false;
  /** Set when something happened that could have changed the world. */
  private dirty = false;
  /**
   * Whether the request now in flight was provoked by a change rather than by
   * the consistency interval.
   *
   * It is `dirty`, captured at the moment the request went out, because
   * `dirty` is cleared there and the answer comes back later. `apply` reads it
   * to decide whether the unchanged-tick skip is allowed to fire: a snapshot
   * fetched *because something happened* must be applied even at a tick that
   * did not move, which is the case a command dispatched against a paused
   * clock creates (ADR 0051). A snapshot
   * fetched by the thirty-second consistency poll may still be skipped, which
   * is what the optimisation was for.
   */
  private pendingForcesApply = false;
  private pendingMessageId: string | undefined;
  private pendingSince = 0;
  private nextPollAt = Number.POSITIVE_INFINITY;
  /**
   * The tick an accepted command is scheduled for, while this feed is still
   * waiting for the simulation to reach it.
   *
   * A tick of *this* session, so it is cleared with one for the reason
   * `lastAppliedTick` is: a tick number carried across a session boundary is a
   * statement about a different simulation, and a second prison starting at
   * tick 0 would otherwise look like the first one's order having already run.
   */
  private awaitedCommandTick: number | undefined;
  private lastAppliedTick: number | undefined;
  /**
   * The tick of the last applied `simulation/delta`, tracked separately from
   * `lastAppliedTick`.
   *
   * **Separate on purpose, and the shared field would be a bug.**
   * `lastAppliedTick` guards the snapshot path's "an unchanged tick means the
   * decoded view we already hold is still correct" skip -- a statement about
   * `world` and `structures`. A delta says nothing about either, so letting one
   * advance that field would make the feed skip the very snapshot that builds
   * the world, and a session could run with nothing painted under its actors.
   *
   * What this field is for is ordering: the transport may coalesce or reorder,
   * and a payload arriving with a tick at or behind the one already applied
   * would move actors backwards. It is cleared with a session for the reason
   * `lastAppliedTick` is -- two prisons paused at the same tick are two
   * different simulations.
   */
  private lastDeltaTick: number | undefined;
  /**
   * The actors the last delta published, the positions it published them at,
   * and the presentation time that publication was first drawn at.
   *
   * Held beside `frame.actors` -- which is the *same array* -- because
   * `readFrame` advances each actor from where it was published rather than
   * from where it drew it last frame
   * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
   * `actor-extrapolation.ts`). Accumulating frame by frame would let a dropped
   * frame overshoot; measuring from the publication cannot.
   *
   * The sample time is `undefined` until the first `readFrame` after a
   * publication, because a message handler has no presentation clock: the
   * scene's frame loop is the only thing in this file that knows what time it
   * is, so "when was this published" is answered as "when was it first drawn".
   * The error that introduces is at most one frame and it never accumulates.
   */
  private publishedActors: MutableRenderActor[] = [];
  private publishedAt: PublishedActorPosition[] = [];
  private publishedAtSeconds: number | undefined;

  private readonly pollIntervalSeconds: number;
  private readonly requestTimeoutSeconds: number;
  private readonly generateMessageId: () => string;
  private readonly onError: (error: Error) => void;

  public constructor(
    private readonly client: SimulationMessageSource,
    options: SimulationSnapshotFeedOptions = {},
  ) {
    this.pollIntervalSeconds = options.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
    this.requestTimeoutSeconds = options.requestTimeoutSeconds ?? DEFAULT_REQUEST_TIMEOUT_SECONDS;
    this.generateMessageId = options.generateMessageId ?? (() => `render-${crypto.randomUUID()}`);
    this.onError =
      options.onError ??
      ((error) => {
        console.warn('World renderer could not read a simulation snapshot.', error);
      });
    this.client.addListener((message) => this.handleMessage(message));
  }

  public readFrame(nowSeconds: number): RenderFrame {
    this.pump(nowSeconds);
    this.advanceActors(nowSeconds);
    return this.frame;
  }

  /**
   * Moves the published actors on by the time since they were published.
   *
   * **Only while the clock runs.** A paused worker publishes nothing -- the
   * publication is skipped on an unmoved tick -- so a velocity from the last
   * running publication would otherwise carry actors on for a quarter of a
   * second after the player pressed pause. Reading the clock here is not a
   * second source of truth about motion: it is the same `clockRunning` the
   * poll already keeps, and it gates *whether* to advance rather than by how
   * much.
   */
  private advanceActors(nowSeconds: number): void {
    if (this.publishedActors.length === 0) return;
    if (!this.clockRunning) {
      extrapolateActors(this.publishedActors, this.publishedAt, 0);
      return;
    }
    this.publishedAtSeconds ??= nowSeconds;
    extrapolateActors(this.publishedActors, this.publishedAt, nowSeconds - this.publishedAtSeconds);
  }

  /** Exposed for the scene's one-time camera framing and for tests. */
  public get hasWorld(): boolean {
    return this.frame.revision > 0;
  }

  private handleMessage(message: WorkerToMainMessage): void {
    switch (message.kind) {
      case 'simulation/ready':
        this.sessionReady = true;
        this.publishedActors = [];
        this.publishedAt = [];
        this.publishedAtSeconds = undefined;
        this.clockRunning = message.payload.clock.mode === 'running';
        this.dirty = true;
        // A new session, so the tick this feed last drew is a tick of a
        // *different* simulation and says nothing about whether the frame it
        // holds is still correct. Clearing it is what makes the skip below
        // ("an unchanged tick means the decoded view we already hold is still
        // correct") a statement about one simulation rather than about a
        // number. It became reachable with #149: a page can now start a second
        // session, and two prisons paused at the same tick -- tick 0 being the
        // ordinary case -- would otherwise leave the first one's world painted
        // under the second one's name.
        this.lastAppliedTick = undefined;
        this.lastDeltaTick = undefined;
        this.awaitedCommandTick = undefined;
        break;

      case 'simulation/delta':
        this.applyDelta(message.payload);
        break;

      case 'simulation/clock-state': {
        const running = message.payload.clock.mode === 'running';
        // The **transition**, not the state. A clock that just started may have
        // executed commands queued while it was paused; a clock that is merely
        // still running has changed nothing this message reports, and the
        // worker posts one of these up to four times a second for the life of
        // a running session (`CLOCK_STATE_PUBLISH_INTERVAL_MS`). Reading the
        // state here asked for a full session snapshot on every one of them --
        // 121 requests over thirty running seconds where this file's own header
        // promised 2, each costing a `captureSessionSnapshot`, a
        // `jsonValueSchema` walk and, through the frame revision, a whole
        // `TileLayer` rebuild on the thread that draws.
        //
        // Both routes are read, and they carry different halves of the answer:
        // the unsolicited publication is silent while the tick stands still, so
        // a resume that changes only the control is reported by the correlated
        // reply `handleSetClock` sends and by nothing else.
        if (running && !this.clockRunning) this.dirty = true;
        this.clockRunning = running;

        // The other half of "a command changed the world": *when* it did.
        //
        // A command is scheduled a lead ahead of the tick it was sent at
        // (`SimulationCommandSender.projectExecuteTick`, twenty ticks -- one
        // second at the kernel's 20 Hz), so the poll its acceptance triggers
        // below captures a world it has not touched yet. Without this the
        // player's wall would appear on the next thirty-second consistency
        // poll, which is what makes the transition rule alone insufficient
        // rather than merely stricter.
        //
        // Only on an unsolicited publication: the tick loop steps and *then*
        // publishes, so one of these reporting `scheduledForTick` is posted
        // after the tick that dispatched the command. `handleSetClock`'s
        // correlated reply reports the tick without having stepped it, and
        // treating that as the command having run would clear the wait for a
        // snapshot taken one tick early.
        if (
          message.replyTo === undefined &&
          this.awaitedCommandTick !== undefined &&
          message.payload.tick >= this.awaitedCommandTick
        ) {
          this.awaitedCommandTick = undefined;
          this.dirty = true;
        }
        break;
      }

      case 'simulation/command-result':
        if (message.payload.status === 'queued') {
          this.dirty = true;
          // The latest scheduled tick, so a burst of orders is one wait and not
          // a queue of them: a snapshot taken once the last has run shows all
          // of them, and every earlier one is already in it.
          this.awaitedCommandTick =
            this.awaitedCommandTick === undefined
              ? message.payload.scheduledForTick
              : Math.max(this.awaitedCommandTick, message.payload.scheduledForTick);
        }
        break;

      case 'simulation/snapshot': {
        if (message.replyTo !== this.pendingMessageId) return; // Somebody else's snapshot (a save).
        this.pendingMessageId = undefined;
        const forced = this.pendingForcesApply;
        this.pendingForcesApply = false;
        this.apply(message.payload, forced);
        break;
      }

      case 'simulation/stopped':
        this.sessionReady = false;
        this.clockRunning = false;
        this.pendingMessageId = undefined;
        this.pendingForcesApply = false;
        this.lastDeltaTick = undefined;
        this.awaitedCommandTick = undefined;
        break;

      case 'protocol/error':
        if (message.replyTo !== undefined && message.replyTo === this.pendingMessageId) {
          this.pendingMessageId = undefined;
          this.onError(new Error(`Simulation worker rejected a render snapshot request: ${message.payload.message}`));
        }
        break;

      default:
        break;
    }
  }

  private pump(nowSeconds: number): void {
    if (!this.sessionReady) return;

    if (this.pendingMessageId !== undefined) {
      if (nowSeconds - this.pendingSince < this.requestTimeoutSeconds) return;
      // Treat a silent worker as a lost request rather than wedging the view
      // forever: what we asked for never arrived, so it is still outstanding
      // whatever the clock is doing.
      this.pendingMessageId = undefined;
      this.dirty = true;
      this.onError(new Error('The simulation worker did not answer a render snapshot request; retrying.'));
    }

    const due = this.dirty || (this.clockRunning && nowSeconds >= this.nextPollAt);
    if (!due) return;

    const messageId = this.generateMessageId();
    this.pendingMessageId = messageId;
    this.pendingSince = nowSeconds;
    // Captured before `dirty` is cleared: it is the difference between "we
    // asked because something happened" and "we asked because thirty seconds
    // went by", and only the reply to the first may bypass the unchanged-tick
    // skip in `apply`.
    this.pendingForcesApply = this.dirty;
    this.dirty = false;
    this.nextPollAt = nowSeconds + this.pollIntervalSeconds;

    try {
      this.client.send({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId,
        kind: 'simulation/request-snapshot',
        payload: { reason: 'consistency-check' },
      });
    } catch (error) {
      this.pendingMessageId = undefined;
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Applies a render delta: the actors, and nothing else.
   *
   * ### `revision` deliberately does not move
   *
   * `RenderFrame.revision` is geometry-only -- "increments whenever `world` or
   * `structures` change" (`render-feed.ts`) -- and `TileLayer` repaints on a
   * change of revision or of visible range and on nothing else. This channel
   * changes neither `world` nor `structures`, so bumping the counter here would
   * make every tile in view repaint up to ten times a second to move some
   * sprites, which is the opposite of what the channel is for. The frame object
   * is still replaced rather than mutated, because a `RenderFrame` is immutable
   * view data and `readFrame` hands it out; only the `actors` field differs, and
   * `world` and `structures` are carried across by reference.
   *
   * ### What it refuses, and why it keeps the actors it has
   *
   * A payload this build cannot read is reported and dropped, leaving the
   * previous frame standing. The buffer arrived by transfer and cannot be
   * replayed -- the transfer moved it -- so there is nothing to retry, and the
   * next publication is at most one interval away. Refusing loudly and drawing
   * the last good set is strictly better than blanking a prison over one bad
   * message.
   *
   * A **non-keyframe** payload is dropped for a different reason: this build
   * sends only keyframes, so a diff is a message from a worker newer than this
   * receiver, and applying its record list as if it were the complete live set
   * would delete every actor that merely did not move. ADR 0040 puts the
   * base-tick rule that reads one in its slice 3.
   */
  private applyDelta(payload: Extract<WorkerToMainMessage, { kind: 'simulation/delta' }>['payload']): void {
    const { delta } = payload;
    if (delta.schemaId !== RENDER_ACTORS_SCHEMA_ID || delta.schemaVersion !== RENDER_ACTORS_SCHEMA_VERSION) {
      this.onError(
        new Error(
          `Worker sent a delta "${delta.schemaId}" v${String(delta.schemaVersion)}; this renderer understands "${RENDER_ACTORS_SCHEMA_ID}" v${String(RENDER_ACTORS_SCHEMA_VERSION)}.`,
        ),
      );
      return;
    }
    if (delta.transport !== 'array-buffer') {
      this.onError(new Error(`Render deltas must use the array-buffer transport, got "${delta.transport}".`));
      return;
    }

    // Coalesced or reordered: the frame we hold is already at or ahead of this
    // message, so applying it would move actors backwards.
    if (this.lastDeltaTick !== undefined && payload.tick <= this.lastDeltaTick) return;

    let decoded;
    try {
      decoded = decodeRenderActorsPayload(delta.data);
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    if (decoded.layoutVersion !== RENDER_ACTORS_LAYOUT_VERSION) {
      this.onError(
        new Error(
          `Worker sent render-actors layout ${String(decoded.layoutVersion)}; this renderer reads ${String(RENDER_ACTORS_LAYOUT_VERSION)}.`,
        ),
      );
      return;
    }
    if (!decoded.keyframe) {
      this.onError(new Error('Worker sent a changed-only render delta; this renderer applies keyframes only.'));
      return;
    }

    const actors = actorsFromDelta(decoded);
    this.publishedActors = actors;
    this.publishedAt = actors.map((actor) => ({ tileX: actor.tileX, tileY: actor.tileY }));
    this.publishedAtSeconds = undefined;
    this.frame = {
      revision: this.frame.revision,
      world: this.frame.world,
      structures: this.frame.structures,
      actors,
    };
    this.lastDeltaTick = payload.tick;
  }

  private apply(
    payload: Extract<WorkerToMainMessage, { kind: 'simulation/snapshot' }>['payload'],
    forced: boolean,
  ): void {
    const { snapshot } = payload;
    if (snapshot.schemaId !== SESSION_SNAPSHOT_SCHEMA_ID || snapshot.schemaVersion !== SESSION_SNAPSHOT_SCHEMA_VERSION) {
      this.onError(
        new Error(
          `Worker sent snapshot "${snapshot.schemaId}" v${snapshot.schemaVersion}; this renderer understands "${SESSION_SNAPSHOT_SCHEMA_ID}" v${SESSION_SNAPSHOT_SCHEMA_VERSION}.`,
        ),
      );
      return;
    }
    if (snapshot.transport !== 'structured-clone') {
      this.onError(new Error(`Session snapshots must use the structured-clone transport, got "${snapshot.transport}".`));
      return;
    }

    /*
     * An unchanged tick means the decoded view we already hold is still
     * correct -- **unless something asked for this snapshot**, which is the
     * half of the sentence that used to be missing.
     *
     * It read "nothing in the world can change without the simulation
     * advancing", and that stopped being true when the worker began
     * dispatching a command submitted against a paused clock (ADR 0051). A wall ordered during a pause
     * becomes an `approved` build order at the tick the session is already
     * on, `structuresFromConstruction` maps that to the `planned` ghost this
     * renderer has always known how to draw, and the tick behind it does not
     * move -- so this skip discarded the one snapshot that carried it and the
     * player's order stayed invisible until they pressed play.
     *
     * `forced` is the reason the poll went out, not a property of the reply:
     * a command acknowledgement, a new session, a resumed clock or a lost
     * request set `dirty`, and every one of those means "the world may differ
     * from what is painted". The thirty-second consistency poll sets none of
     * them and is still skipped at an unmoved tick, which is what the
     * optimisation was for.
     */
    if (!forced && this.lastAppliedTick === payload.tick && this.frame.revision > 0) return;

    // Validated as JSON by the protocol decoder before it reached us; the
    // schema id above says which shape that JSON has. `WorldRenderView` still
    // fails closed on anything malformed inside it.
    const bundle = snapshot.data as unknown as SessionSnapshotBundle;
    try {
      this.frame = {
        revision: this.frame.revision + 1,
        world: WorldRenderView.fromSnapshot(bundle.world),
        structures: structuresFromConstruction(bundle.construction),
        // Decoded from the bundle's own `simulation` and `entities` sections
        // (#70 put prisoner tile positions there; `CURRENT_SAVE_RESTORED_SCOPE`
        // reports them under `restored` as `save.scope.prisoners`). Empty
        // whenever the bundle omits either section -- a V2 save does -- and
        // empty on a fresh session for a reason that is not this feed's:
        // since #261 step 4 an `AdmitPrisoner` command exists and the Intake
        // panel produces it, but the boundary refuses an admission into a
        // prison with no accommodation room -- so a prison in which the player
        // has zoned nothing holds no prisoners to draw. Once a cell is zoned
        // (the Rooms tab, #312) the admission is accepted and the arrival is
        // here from that tick. What this feed no longer does is discard the
        // ones a bundle carries.
        //
        // Positions only. The bundle publishes no velocity and no facing, so
        // every prisoner is drawn with the idle clip and the pose module's
        // default facing; `actors-from-snapshot.ts` states which fields are
        // defaults rather than simulation state. That is not something the
        // delta channel fixes and this comment used to say it was: the
        // simulation moves an actor only on arrival at a route's destination,
        // so neither path has a velocity to carry. Simulation-side locomotion
        // is the missing piece, and it is its own decision.
        actors: actorsFromSnapshot(bundle.simulation, bundle.entities),
      };
      // A snapshot's actors carry no velocity and are not advanced between
      // frames; they are also replaced wholesale by the next delta. Dropping
      // the published set here is what stops the *previous* delta's actors
      // being advanced against a frame that no longer holds them.
      this.publishedActors = [];
      this.publishedAt = [];
      this.publishedAtSeconds = undefined;
      this.lastAppliedTick = payload.tick;
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
