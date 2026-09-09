import type { SimulationMessageSource } from '../../src/rendering/feed/simulation-snapshot-feed';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import {
  RENDER_ACTORS_CONTENT_TYPE,
  RENDER_ACTORS_SCHEMA_ID,
  RENDER_ACTORS_SCHEMA_VERSION,
} from '../../src/simulation/protocol/render-actors-payload';
import { encodeRenderActorsKeyframe } from '../../src/simulation/worker/render-actors-keyframe';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  captureSessionSnapshot,
} from '../../src/simulation/runtime/restore-session';

/**
 * `FixedStepClock`'s default step, and therefore how much wall clock one tick
 * is. Here rather than in each caller because `publishDelta` below divides by
 * it to state the keyframe's frame rate, so a caller that disagreed with this
 * file about the step would encode a rate the worker never publishes.
 */
export const TICK_MILLISECONDS = 50;

/**
 * The worker, as much of it as a feed test needs: it answers a snapshot
 * request with a real `captureSessionSnapshot` and it publishes real keyframe
 * bytes.
 *
 * The envelope is assembled the way `publishRenderDelta` assembles it, and the
 * body comes from the production encoder, so **ADR 0099's marker -- the fifth
 * header word of `lockstate.render-actors` -- is written by the code that
 * writes it in the worker** rather than by a test. That is the whole reason
 * this stands in for a `Worker` instead of a hand-built message: a fake that
 * wrote the marker itself would prove only that the feed reads what the fake
 * put there.
 *
 * ## Why it lives here rather than beside one test
 *
 * `tests/integration/a-finished-build-reaches-the-drawn-frame.test.ts`
 * defined it first, for #1037. It is shared the moment a second file needs the
 * same loopback -- and the alternative, a copy, is the shape in which two
 * tests quietly stop agreeing about what the worker sends. Nothing about it is
 * specific to what either caller watches: it forwards snapshots and deltas and
 * has no opinion about doors, walls or rooms.
 */
export class LoopbackWorker implements SimulationMessageSource {
  /** The `messageId` of every snapshot request the feed has sent, in order. */
  public readonly requested: string[] = [];
  private readonly handlers: ((message: WorkerToMainMessage) => void)[] = [];
  private publishedDeltaTick = 0;

  public constructor(private readonly runtime: SimulationRuntime) {}

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handlers.push(handler);
  }

  public send(message: MainToWorkerMessage): void {
    if (message.kind !== 'simulation/request-snapshot') return;
    this.requested.push(message.messageId);
    const bundle = captureSessionSnapshot(this.runtime);
    this.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `snapshot-${message.messageId}`,
      replyTo: message.messageId,
      kind: 'simulation/snapshot',
      payload: {
        tick: this.runtime.kernel.tick,
        reason: 'consistency-check',
        snapshot: {
          transport: 'structured-clone',
          schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
          schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
          data: bundle,
        },
      },
    } as unknown as WorkerToMainMessage);
  }

  public emit(message: WorkerToMainMessage): void {
    for (const handler of this.handlers) handler(message);
  }

  /** What `publishRenderDelta` posts, including ADR 0099's marker read off the live world. */
  public publishDelta(): void {
    const tick = this.runtime.kernel.tick;
    if (tick <= this.publishedDeltaTick) return;
    const data = encodeRenderActorsKeyframe(
      this.runtime.prisoners,
      1_000 / TICK_MILLISECONDS,
      this.runtime.world.drawnWorldRevision,
      this.runtime.securityGuards,
    );
    const message = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `delta-${String(tick)}`,
      kind: 'simulation/delta',
      payload: {
        baseTick: this.publishedDeltaTick,
        tick,
        delta: {
          schemaId: RENDER_ACTORS_SCHEMA_ID,
          schemaVersion: RENDER_ACTORS_SCHEMA_VERSION,
          transport: 'array-buffer',
          contentType: RENDER_ACTORS_CONTENT_TYPE,
          byteLength: data.byteLength,
          data,
        },
      },
    } as unknown as WorkerToMainMessage;
    this.publishedDeltaTick = tick;
    this.emit(message);
  }
}
