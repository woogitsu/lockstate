import type { MainToWorkerMessage, WorkerToMainMessage } from '../../simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../simulation/protocol/types';
import {
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../simulation/runtime/restore-session';
import { structuresFromConstruction } from '../world/structures';
import { WorldRenderView } from '../world/world-view';
import { actorsFromSnapshot } from './actors-from-snapshot';
import { EMPTY_RENDER_FRAME, type RenderFeed, type RenderFrame } from './render-feed';

/**
 * Feeds the renderer from the simulation worker over the existing protocol.
 *
 * ### Why this polls snapshots
 *
 * ADR-0003's protocol publishes three things to the main thread: correlated
 * snapshots, `simulation/delta` and domain events. Only the snapshot path is
 * implemented today -- nothing emits a delta -- so a snapshot request is the
 * only way world geometry can legally reach the renderer. The renderer is
 * therefore a *reader* of the same request/response the save path uses, with
 * `reason: 'consistency-check'` distinguishing its requests from saves.
 *
 * That is deliberately a placeholder for a render-delta channel, and it is
 * priced accordingly: each poll makes the worker capture a full session
 * bundle. So this feed does not poll on a timer. It polls when the world can
 * actually have changed:
 *
 * - once when a session becomes ready, to get the initial world;
 * - after any command is accepted, since commands are what change geometry;
 * - on an interval only while the simulation clock is running.
 *
 * A paused, idle session costs exactly one request. A running one costs one
 * bundle capture per interval, which is the same work an autosave already
 * does and is why the interval is seconds rather than frames.
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

const DEFAULT_POLL_INTERVAL_SECONDS = 2;
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 15;

export class SimulationSnapshotFeed implements RenderFeed {
  private frame: RenderFrame = EMPTY_RENDER_FRAME;
  private sessionReady = false;
  private clockRunning = false;
  /** Set when something happened that could have changed the world. */
  private dirty = false;
  private pendingMessageId: string | undefined;
  private pendingSince = 0;
  private nextPollAt = Number.POSITIVE_INFINITY;
  private lastAppliedTick: number | undefined;

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
    return this.frame;
  }

  /** Exposed for the scene's one-time camera framing and for tests. */
  public get hasWorld(): boolean {
    return this.frame.revision > 0;
  }

  private handleMessage(message: WorkerToMainMessage): void {
    switch (message.kind) {
      case 'simulation/ready':
        this.sessionReady = true;
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
        break;

      case 'simulation/clock-state':
        this.clockRunning = message.payload.clock.mode === 'running';
        // A clock that just started may have executed queued commands.
        if (this.clockRunning) this.dirty = true;
        break;

      case 'simulation/command-result':
        if (message.payload.status === 'queued') this.dirty = true;
        break;

      case 'simulation/snapshot':
        if (message.replyTo !== this.pendingMessageId) return; // Somebody else's snapshot (a save).
        this.pendingMessageId = undefined;
        this.apply(message.payload);
        break;

      case 'simulation/stopped':
        this.sessionReady = false;
        this.clockRunning = false;
        this.pendingMessageId = undefined;
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

  private apply(payload: Extract<WorkerToMainMessage, { kind: 'simulation/snapshot' }>['payload']): void {
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

    // Nothing in the world can change without the simulation advancing, so an
    // unchanged tick means the decoded view we already hold is still correct.
    if (this.lastAppliedTick === payload.tick && this.frame.revision > 0) return;

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
        // nothing in `src/` calls `admitPrisoner`, so a prison a player can
        // currently reach holds no prisoners to draw. What this feed no longer
        // does is discard the ones a bundle carries.
        //
        // Positions only. The bundle publishes no velocity and no facing, so
        // every prisoner is drawn with the idle clip and the pose module's
        // default facing; `actors-from-snapshot.ts` states which fields are
        // defaults rather than simulation state. A render-delta channel is
        // still what would publish real motion.
        actors: actorsFromSnapshot(bundle.simulation, bundle.entities),
      };
      this.lastAppliedTick = payload.tick;
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
