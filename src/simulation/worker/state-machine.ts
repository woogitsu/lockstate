import { CommandRejectedError, type CommandRejectionKind, Kernel } from '../kernel/kernel';
import {
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../runtime/restore-session';
import { FixedStepClock, type ClockControl } from '../clock/fixed-step-clock';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../presentation/view-model';
import { 
  type MainToWorkerMessage, 
  type ProtocolFaultCode,
  type SimulationStatusCounts,
  type WorkerToMainMessage, 
  SIMULATION_PROTOCOL_VERSION 
} from '../protocol/types';
import type { JsonValue } from '../../shared/json';
import { collectProtocolTransferables } from '../protocol/transferables';
import {
  RENDER_ACTORS_CONTENT_TYPE,
  RENDER_ACTORS_SCHEMA_ID,
  RENDER_ACTORS_SCHEMA_VERSION,
} from '../protocol/render-actors-payload';
import { PROJECTION_CATALOG, type ProjectionRequest } from './projection-catalog';
import { encodeRenderActorsKeyframe } from './render-actors-keyframe';
import { projectStatusCounts, statusCountsEqual } from './status-counts';

export type WorkerState = 
  | 'uninitialized'
  | 'ready'
  | 'running'
  | 'paused'
  | 'shutting-down'
  | 'faulted';

/**
 * The part of a `MessagePort`/worker global this machine uses.
 *
 * `message` is the protocol union rather than `any`, so the one place that
 * posts is checked against the schema's own shape. A real port declares
 * `postMessage(message: any)` and stays assignable to this, because a
 * function accepting anything satisfies one accepting less.
 */
export interface MessagePortLike {
  postMessage(message: WorkerToMainMessage, transfer?: Transferable[]): void;
}

/**
 * How often, at most, a running clock publishes an unsolicited
 * `simulation/clock-state`.
 *
 * The tick loop wakes every 15 ms; publishing on every wake would put ~66
 * messages a second on the boundary to move a day counter and a progress
 * figure. This is a readout cadence, not a simulation cadence: it changes
 * only how often the main thread is *told* the tick, never which ticks run
 * or what they compute.
 */
export const CLOCK_STATE_PUBLISH_INTERVAL_MS = 250;

/**
 * How often, at most, the worker publishes `simulation/status-counts`.
 *
 * Twice the clock's interval, because the two readouts have different jobs.
 * Day progress is a continuously moving quantity and a coarse step in it
 * reads as a stutter; the counts are levels that only move when a discrete
 * event happens -- a prisoner is admitted, a guard is hired, a room is
 * registered, a search finds something -- and a counter that refreshes twice
 * a second is indistinguishable to a player from one that refreshes every
 * frame. Issue #104 asked for "a low fixed cadence"; this is the lower of
 * the two cadences on the boundary.
 *
 * It is a **ceiling, not a rate**: `publishStatusCounts` skips the
 * publication when nothing it reports has changed, so a session in which
 * nothing happens posts nothing at all after the first readout.
 *
 * **#29 narrows that, deliberately.** `stateIncomeAccruedTodayMinorUnits` is
 * the first count here that is not a level -- it rises on every tick that any
 * place is occupied -- so once the prison holds anybody the skip stops firing
 * and the channel runs at its full two messages a second for the rest of the
 * session. The ceiling still bounds it, which is the reason this is acceptable
 * and the reason the cadence is expressed as one. It is not being paid yet:
 * nothing in `src/` can admit a prisoner, so the accrual is a constant zero
 * and the skip still applies. `docs/HUD_PROJECTIONS.md` records the trade
 * beside the paging contract it bears on.
 *
 * Wall-clock milliseconds rather than a count of ticks, for the same reason
 * the clock's interval is: it governs how often the *main thread* is told,
 * so it must be bounded in the units the main thread's frame budget is in.
 * At x4 the same 500 ms covers four times as many ticks and still costs the
 * boundary at most two messages a second.
 */
export const STATUS_COUNTS_PUBLISH_INTERVAL_MS = 500;

/**
 * How often, at most, the worker publishes `simulation/delta` -- the render
 * delta channel of ADR 0040, slice 1.
 *
 * **A ceiling, not a rate**, in the same sense
 * `STATUS_COUNTS_PUBLISH_INTERVAL_MS` is one and enforced by the cheaper of the
 * two tests available: `publishRenderDelta` returns without encoding anything
 * when the tick has not moved since the last publication. Nothing in this
 * payload can change without the kernel stepping -- an actor's position is
 * written by a system inside a tick and by nothing else -- so an unmoved tick
 * is exactly "nothing changed", and a paused prison posts nothing at all. That
 * is the same rule `publishClockState` uses and it is strictly stronger here,
 * because it is also what keeps `deltaMessageSchema`'s `tick > baseTick`
 * satisfiable: `baseTick` is the previous publication's tick, so publishing
 * twice at one tick would be a message the main thread's decoder refuses.
 *
 * A fifth of the counts' interval and two and a half times the clock's,
 * because the three readouts have different jobs. The counts are levels a
 * player reads; the clock is a progress bar; this one is where the actors
 * *are*, which is the thing the player is looking straight at. ADR 0040 puts
 * it at 100 ms and gives the reason it is not per-tick: at x4 the tick loop
 * runs up to 5 ticks per 15 ms wake, so a per-tick channel would put a
 * population-sized buffer on the boundary ~66 times a second to move a handful
 * of arrivals.
 *
 * Wall-clock milliseconds rather than a count of ticks, for the reason the
 * other two intervals are: it governs how often the *main thread* is told, so
 * it must be bounded in the units the main thread's frame budget is in.
 */
export const RENDER_DELTA_PUBLISH_INTERVAL_MS = 100;

/**
 * How `handleInitialize` reports a snapshot it refuses to restore: correlated
 * to the `simulation/initialize` that carried it, and leaving the worker
 * usable.
 *
 * Refusing a snapshot installs nothing -- `_runtime` and `_kernel` are only
 * assigned once `restoreSimulationRuntime` has returned -- so the worker is
 * still `uninitialized` in substance, and `recoverable: true` says exactly
 * that: this worker can still be used.
 *
 * This agrees with ADR 0006's own definition of the state rather than
 * stretching it: `faulted` is "reached when an unhandled exception or protocol
 * decode error occurs", and a snapshot this build declines to restore is
 * neither -- it is a request rejected with its reason, which is what
 * `protocol/error` is for.
 *
 * It used to carry a second, larger reason as well: because `handleInitialize`
 * accepts only `uninitialized` and `src/main.ts` built one worker per *page*,
 * faulting here made one bad save refuse every later load in the tab. That
 * consequence is gone -- since #149 the main thread claims a worker that has
 * hosted no session for each new session, so no fault of any kind can outlive
 * the load that caused it. What the recoverable refusal still buys is the
 * worker itself: it is not spent, and the state it reports is the state it is
 * actually in.
 */
function rejectedSnapshotFault(requestMessageId: string): { readonly replyTo: string; readonly recoverable: boolean } {
  return { replyTo: requestMessageId, recoverable: true };
}

/**
 * Which fault code each kernel refusal reports.
 *
 * A `Record` over `CommandRejectionKind` rather than a `switch` with a
 * `default`, because that makes it **exhaustive at compile time**: a fourth
 * rejection kind added in `../kernel/kernel` fails to compile here until
 * somebody decides what the main thread should be told, which is the property
 * the collapsed version did not have.
 *
 * This is what makes `duplicate-message` and `sequence-gap` reachable. Both
 * were members of the twelve-code `ProtocolFaultCode` vocabulary that **nothing
 * in the repository could emit** (#187 finding 2) -- the same state #184 found
 * and fixed for `unsupported-protocol-version` and `unknown-message-kind` one
 * module over.
 *
 * `past-tick` maps to `invalid-state` and that is not a fallback: the enum has
 * no member for scheduling in the past, and a command aimed at a tick already
 * executed genuinely is an invalid state. It also keeps `invalid-state`
 * emitted, which matters -- moving all three off it would have replaced two
 * dead codes with a third.
 */
const COMMAND_REJECTION_FAULT_CODES: Readonly<Record<CommandRejectionKind, ProtocolFaultCode>> = {
  'duplicate-sequence': 'duplicate-message',
  'sequence-gap': 'sequence-gap',
  'past-tick': 'invalid-state',
};

/**
 * `invalid-state` for anything that is not a typed kernel refusal.
 *
 * Deliberately *not* widened to inspect the message text. Reading a code out of
 * an English sentence is what this change exists to stop: the distinction was
 * always in the message and never in the code, and parsing it back would
 * reproduce the defect with extra steps. An untyped throw from a system handler
 * is a genuine invalid state and says so.
 */
function commandRejectionFaultCode(error: unknown): ProtocolFaultCode {
  return error instanceof CommandRejectedError ? COMMAND_REJECTION_FAULT_CODES[error.kind] : 'invalid-state';
}

export class SimulationWorkerStateMachine {
  private _state: WorkerState = 'uninitialized';
  private _kernel: Kernel | null = null;
  private _runtime: SimulationRuntime | null = null;
  private _clock: FixedStepClock = new FixedStepClock(50, { mode: 'paused' });
  // `setTimeout`/`setInterval` return a number in the DOM and a `Timeout`
  // object in Node, and this file runs under both. `ReturnType` says exactly
  // that without reaching for `any`.
  private _tickTimerId: ReturnType<typeof setInterval> | undefined;
  /** The tick the main thread was last told about, so an unchanged clock says nothing. */
  private _publishedTick: number | null = null;
  private _publishedAtMs = Number.NEGATIVE_INFINITY;
  /** The counts the main thread was last told, so an unchanged prison says nothing. */
  private _publishedCounts: SimulationStatusCounts | null = null;
  /**
   * The `sequence` of the refusal the main thread was last told about, `0`
   * for none.
   *
   * Tracked beside the counts rather than inside them because a refusal
   * changes no count: an out-of-bounds wall leaves the prisoner, staff, room,
   * incident, contraband and treasury figures exactly where they were, so
   * `statusCountsEqual` alone would suppress the publication that carries it
   * and the refusal would be lost between the simulation and the HUD for a
   * second time (#261).
   */
  private _publishedRefusalSequence = 0;
  /**
   * The `sequence` of the zoning notice the main thread was last told about,
   * `0` for none.
   *
   * A second sequence beside the refusal's rather than one shared with it,
   * because the two are independent: a session can refuse a purchase without
   * zoning anything and zone a room without refusing anything, and a shared
   * counter would make either open the other's gate. Tracked here for exactly
   * the reason the refusal's is -- an accepted zoning *does* move the `rooms`
   * count, so `statusCountsEqual` would carry it, but it does not move it on
   * a **re-zoning of the same tiles after a removal**, where the count
   * returns to a figure already published; the notice would be lost on the
   * one gesture a player is most likely to repeat.
   */
  private _publishedZoningSequence = 0;
  /** When the counts were last *projected*, which bounds the projection's cost as well as the message rate. */
  private _countsProjectedAtMs = Number.NEGATIVE_INFINITY;
  /**
   * The tick of the last `simulation/delta`, `0` for none, which is the
   * `baseTick` the next one declares.
   *
   * `0` rather than `null` because tick 0 is genuinely the base a session's
   * first publication is measured against, and because `deltaMessageSchema`
   * refuses `tick <= baseTick` -- so a session that has published nothing and a
   * session whose last publication was at tick 0 want the same behaviour, and
   * tick 0 cannot be published at all. That is not a gap: a tick-0 session is
   * exactly the case `simulation/ready` and the feed's first snapshot already
   * cover.
   */
  private _publishedDeltaTick = 0;
  private _deltaPublishedAtMs = Number.NEGATIVE_INFINITY;

  public constructor(
    private readonly port: MessagePortLike,
    public readonly workerBuildId: string,
    private readonly performanceNow: () => number,
  ) {}

  public get state(): WorkerState { return this._state; }

  private post(msg: WorkerToMainMessage, transfer?: Transferable[]): void {
    this.port.postMessage(msg, transfer);
  }

  private transition(newState: WorkerState): void {
    this._state = newState;
    if (newState === 'running') {
      this.startTickLoop();
    } else {
      this.stopTickLoop();
    }
  }

  private startTickLoop(): void {
    if (this._tickTimerId !== undefined) return;
    this._tickTimerId = setInterval(() => this.onTickLoop(), 15);
  }

  private stopTickLoop(): void {
    if (this._tickTimerId !== undefined) {
      clearInterval(this._tickTimerId);
      this._tickTimerId = undefined;
    }
  }

  private onTickLoop(): void {
    if (this._state !== 'running' && this._state !== 'paused') return;

    try {
      const now = this.performanceNow();
      const budget = 5; // Handle up to 5 ticks per 15ms wake to avoid locking worker thread
      const executed = this._clock.pump(now, budget);

      if (this._kernel && executed > 0) {
        for (let i = 0; i < executed; i++) {
          this._kernel.step();
        }
      }

      this.publishClockState(now);
      this.publishStatusCounts(now);
      this.publishRenderDelta(now);
    } catch (e) {
      this.fault('internal-error', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Tells the main thread where the clock has got to, unprompted.
   *
   * Strictly a *report*. It reads `Kernel.tick` and the clock's own control
   * and posts them; it calls nothing on the kernel, advances nothing and
   * cannot be reached from inside a tick. Rate-limiting it therefore changes
   * how often the HUD's day counter refreshes and nothing else -- which is
   * what keeps ADR 0009's guarantee intact while the transport controls work
   * (`tests/determinism/clock-transport.test.ts`).
   *
   * Silent when the tick has not moved: a clock state nobody asked for and
   * that says nothing new is noise. A *control* change is reported by the
   * correlated reply in `handleSetClock` instead, so pausing is never missed
   * just because the tick stood still.
   */
  private publishClockState(nowMilliseconds: number): void {
    if (this._kernel === null) return;
    const tick = this._kernel.tick;
    if (tick === this._publishedTick) return;
    if (nowMilliseconds - this._publishedAtMs < CLOCK_STATE_PUBLISH_INTERVAL_MS) return;

    this.notePublished(tick, nowMilliseconds);
    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      kind: 'simulation/clock-state',
      // No `replyTo`: nobody asked for this one. ADR 0003 forbids an
      // unsolicited message from presenting itself as a request response.
      payload: {
        tick,
        clock: this._clock.control,
      },
    });
  }

  private notePublished(tick: number, nowMilliseconds: number): void {
    this._publishedTick = tick;
    this._publishedAtMs = nowMilliseconds;
  }

  /**
   * Tells the main thread how many prisoners, staff, rooms, open incidents
   * and contraband finds the session has, and what it last refused,
   * unprompted.
   *
   * This is the channel issue #104 asked for: without it the HUD's counts
   * are literal zeros with nothing behind them, and
   * `src/simulation/presentation/` -- the read-model layer written for
   * exactly this -- is unreachable from the interface.
   *
   * It carries the session's last accepted room designation as well, and for
   * the same reason it carries the last refusal: `RoomZoningService.zone`
   * evaluates the room definition's `enclosed`/`outdoors` requirement against
   * the rectangle's own perimeter and *reports* the answer rather than
   * refusing on it (`src/simulation/rooms/enclosure.ts` states why), so the
   * answer needs a way out and a command reply is not one.
   *
   * It carries the session's last refusal too, since #261. A command the
   * kernel accepts and a system then refuses on its content -- a wall on
   * ground the player does not own, a purchase the treasury cannot cover, a
   * room zoned over one already there -- has no other way out: `handleSubmitCommand` has already answered
   * `status: 'queued'`, which ADR 0003 decision 9 says is receipt and not
   * effect, and the correlated reply is spent. This is a snapshot channel and
   * the payload is snapshot-shaped to match: the most recent refusal and its
   * 1-based ordinal, never a queue. `RefusalLog` argues that shape in full.
   *
   * Strictly a *report*, exactly like `publishClockState`. It reads
   * `Kernel.tick`, `RefusalLog.last` and a pure projection over the runtime's
   * registries and posts the result; it calls nothing on the kernel, steps
   * nothing and writes nothing, so it cannot change what a tick computes
   * (`tests/determinism/status-counts-publication.test.ts`).
   *
   * **Two gates, and their order is the point.** The interval is checked
   * *before* projecting, so the projection runs at most twice a second
   * rather than on all ~66 tick-loop wakes; the value comparison happens
   * after, so a prison in which nothing counted here has changed posts
   * nothing even though it was projected. Issue #104 names the failure mode
   * both halves exist to avoid: "a per-tick firehose that serialises every
   * projection every tick and eats the frame budget".
   *
   * **A new refusal opens the interval gate, and that is bounded.** A refusal
   * is a player-initiated event, not a level: waiting up to 500 ms to report
   * it would be a delay the player feels on their own action, and pausing
   * inside that window would stop the tick loop and strand the refusal until
   * the clock next ran. Reading `RefusalLog.last` is a field access, so the
   * extra gate costs nothing on a wake that has none; and it can open at most
   * once per refusal, because publishing records the sequence it published.
   * The bound is therefore "one extra projection per command the simulation
   * refuses" -- bounded by how fast a player can press a button, which is not
   * a firehose. The refusal reaches the HUD on the same tick-loop wake the
   * command was refused on (#261).
   *
   * Every payload carries the tick it was read at, so a readout can never be
   * mistaken for a statement about a later state, and no list crosses at all
   * -- twelve integers of counts beside at most one refusal record, which is
   * why `docs/HUD_PROJECTIONS.md` contract 5 (paging) has nothing to bound
   * here yet. It was eleven until #29's income line added
   * `stateIncomeAccruedTodayMinorUnits`, and the number is checked against the
   * projection's own schema rather than trusted
   * (`tests/foundation/documentation-claims-contract.test.ts`).
   */
  private publishStatusCounts(nowMilliseconds: number): void {
    if (this._kernel === null || this._runtime === null) return;

    const refusal = this._runtime.refusals.last;
    const refusalSequence = refusal?.sequence ?? 0;
    const refusalIsNew = refusalSequence !== this._publishedRefusalSequence;
    // A newly designated room opens the interval gate for the reason a
    // refusal does, and with the same bound: both are player-initiated
    // events rather than levels, both are a field access to test, and each
    // can open the gate at most once because publishing records the sequence
    // it published. So the cost stays "one extra projection per room the
    // player designates", which is bounded by how fast a rectangle can be
    // dragged.
    const zoning = this._runtime.roomZoning.lastNotice;
    const zoningSequence = zoning?.sequence ?? 0;
    const zoningIsNew = zoningSequence !== this._publishedZoningSequence;
    const eventIsNew = refusalIsNew || zoningIsNew;
    if (!eventIsNew && nowMilliseconds - this._countsProjectedAtMs < STATUS_COUNTS_PUBLISH_INTERVAL_MS) return;
    this._countsProjectedAtMs = nowMilliseconds;

    const tick = this._kernel.tick;
    const counts = projectStatusCounts(this._runtime, tick);
    if (!eventIsNew && this._publishedCounts !== null && statusCountsEqual(this._publishedCounts, counts)) return;
    this._publishedCounts = counts;
    this._publishedRefusalSequence = refusalSequence;
    this._publishedZoningSequence = zoningSequence;

    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      // No `replyTo`, and the schema has no slot for one: nobody asked for
      // this. ADR 0003 forbids an unsolicited message from presenting itself
      // as a request response.
      kind: 'simulation/status-counts',
      payload: {
        tick,
        // The projection's own schema version, so the view-model shape can
        // evolve without an envelope-version change (ADR 0003 decision 5).
        schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
        counts,
        // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
        // is on, and the payload schema is `.strict()` over an *optional*
        // field, so "nothing has been refused" is an absent key rather than a
        // present one holding nothing.
        //
        // The refusal is republished with every later readout for as long as
        // it is still the most recent one. That is what makes this channel a
        // snapshot rather than an event stream: the main thread never has to
        // remember a message it saw, and a listener that starts late sees the
        // same state as one that was there all along.
        ...(refusal === undefined ? {} : { refusal }),
        // The same snapshot discipline as `refusal`, one field over: absent
        // until this session has designated a room, and then republished with
        // every later readout for as long as it is still the most recent
        // designation. "The last room designated was open ground against an
        // enclosed requirement" is a statement a listener that starts late can
        // read correctly; an event would not be.
        ...(zoning === undefined ? {} : { zoning }),
      },
    });
  }

  /**
   * Tells the main thread where the actors are, unprompted.
   *
   * ADR 0040 slice 1, and the first production user the `array-buffer`
   * transport has had since the protocol's first commit. Before this the
   * renderer read actor positions out of a *session bundle* it obtained by
   * sending the persistence path's own `simulation/request-snapshot` every two
   * seconds; the whole bundle then went through `jsonValueSchema`, which is
   * `isJsonValue` recursing with an `Object.getOwnPropertyDescriptor` per array
   * element and per object key. That is a main-thread cost proportional to the
   * population and the loaded chunk count, paid to move two integers per
   * prisoner. `arrayBufferPayloadSchema` validates a schema id, a content type
   * and a `byteLength` cross-check and never looks inside the body, so this
   * message's boundary cost is flat in the population -- which is what issue
   * #414 asked for and what the size of the buffer, alone, does not give.
   *
   * **Keyframe only, and that is the slice.** Every message carries the
   * complete live set. ADR 0040's changed-only messages need a worker-side
   * mirror of what was last published and a base-tick rule on the receiver;
   * both are its slice 3, and the `flags` word and the removal list are already
   * in the layout so that landing them changes no version.
   *
   * **Strictly a report**, exactly like `publishClockState` and
   * `publishStatusCounts`. It reads `Kernel.tick` and the prisoner position SoA
   * after the tick loop has finished stepping, calls nothing on the kernel,
   * steps nothing and writes nothing but the buffer it posts
   * (`tests/determinism/render-delta-publication.test.ts`). There is no request
   * that provokes it and no main-thread module that can ask for one, so there
   * is no feedback path from the renderer into the simulation to close --
   * `AGENTS.md` boundary 1, in the only form a publication can take it.
   *
   * **Two gates, and their order is the point**, as it is one method up. The
   * tick test comes first because it is both the cheaper check and the
   * correctness one: `deltaMessageSchema` refuses `tick <= baseTick`, so a
   * second publication at an unmoved tick would be a message the main thread's
   * decoder rejects. The interval is checked next, and both are field reads, so
   * a wake that publishes nothing costs two comparisons. Only then does the
   * encoder walk the store.
   */
  private publishRenderDelta(nowMilliseconds: number): void {
    if (this._kernel === null || this._runtime === null) return;

    const tick = this._kernel.tick;
    // Nothing in this payload can move without a tick, so an unmoved tick is
    // "nothing changed" -- the skip `STATUS_COUNTS_PUBLISH_INTERVAL_MS`
    // describes, reached without a mirror of the last published positions.
    if (tick <= this._publishedDeltaTick) return;
    if (nowMilliseconds - this._deltaPublishedAtMs < RENDER_DELTA_PUBLISH_INTERVAL_MS) return;

    const data = encodeRenderActorsKeyframe(this._runtime.prisoners);
    const message: WorkerToMainMessage = {
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      // No `replyTo`, and `deltaMessageSchema` is built from
      // `requestEnvelopeFields` so it has no slot for one: nobody asked for
      // this. ADR 0003's 2026-08-24 amendment forbids an unsolicited message
      // from presenting itself as a request response.
      kind: 'simulation/delta',
      payload: {
        baseTick: this._publishedDeltaTick,
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
    };

    this._publishedDeltaTick = tick;
    this._deltaPublishedAtMs = nowMilliseconds;
    // Transferred rather than copied, which is what the transport is for and
    // what `collectProtocolTransferables` has been able to say since the
    // protocol's first commit without anything ever asking it. The buffer is
    // freshly built here and read by nothing else, so detaching it costs this
    // side nothing.
    this.post(message, collectProtocolTransferables(message));
  }

  /**
   * Raises a structured protocol fault.
   *
   * `replyTo` is the id of the request that provoked the fault, and every
   * caller handling a specific message passes it. ADR 0003 decision 2: "A
   * protocol fault may optionally identify the rejected request", and its
   * 2026-08-23 amendment states the rule the two forms follow -- "A fault
   * that *was* prompted by a request is free to carry the `replyTo` its
   * schema already permits", while an unsolicited one must not present
   * itself as a request response. So a fault raised inside the tick loop or
   * by an undecodable message (whose `messageId` this worker never
   * validated) stays uncorrelated rather than naming a request id it cannot
   * know: `WorkerSessionHost` resolves pending requests by `replyTo`, so a
   * fabricated one would settle whichever request happened to share the id.
   *
   * Correlating the ones that *are* answers matters because the main thread
   * discards an uncorrelated `protocol/error`: without a `replyTo` the
   * request it rejected stayed pending until its 15 s timeout and the player
   * was told the worker had not replied, rather than what was actually
   * wrong.
   *
   * `recoverable` says whether this worker can still be used. It is false by
   * default and the worker transitions to `faulted`; a caller passes true
   * only where the fault rejected a request *without* touching simulation
   * state, so leaving the worker unusable would strand the session for a
   * failure it did not cause.
   */
  public fault(
    code: ProtocolFaultCode,
    message: string,
    options: { readonly replyTo?: string; readonly recoverable?: boolean } = {},
  ): void {
    const recoverable = options.recoverable ?? false;
    if (!recoverable) this.transition('faulted');
    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      ...(options.replyTo === undefined ? {} : { replyTo: options.replyTo }),
      kind: 'protocol/error',
      payload: {
        code,
        message,
        recoverable,
      }
    });
  }

  public handleMessage(msg: MainToWorkerMessage): void {
    try {
      switch (msg.kind) {
        case 'protocol/handshake':
          this.handleHandshake(msg);
          break;
        case 'protocol/ping':
          this.handlePing(msg);
          break;
        case 'simulation/initialize':
          this.handleInitialize(msg);
          break;
        case 'simulation/set-clock':
          this.handleSetClock(msg);
          break;
        case 'simulation/submit-command':
          this.handleSubmitCommand(msg);
          break;
        case 'simulation/request-projection':
          this.handleRequestProjection(msg);
          break;
        case 'simulation/request-snapshot':
          this.handleRequestSnapshot(msg);
          break;
        case 'simulation/shutdown':
          this.handleShutdown(msg);
          break;
      }
    } catch (e) {
      this.fault('internal-error', e instanceof Error ? e.message : String(e), { replyTo: msg.messageId });
    }
  }

  private handleHandshake(msg: Extract<MainToWorkerMessage, { kind: 'protocol/handshake' }>): void {
    if (this._state !== 'uninitialized') {
      return this.fault('already-initialized', 'Worker is already past handshake.', { replyTo: msg.messageId });
    }
    
    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      replyTo: msg.messageId,
      kind: 'protocol/handshake-accepted',
      payload: {
        workerBuildId: this.workerBuildId,
        selectedProtocolVersion: SIMULATION_PROTOCOL_VERSION,
        capabilities: [],
      }
    });
  }

  private handlePing(msg: Extract<MainToWorkerMessage, { kind: 'protocol/ping' }>): void {
    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      replyTo: msg.messageId,
      kind: 'protocol/pong',
      payload: { nonce: msg.payload.nonce },
    });
  }

  private handleInitialize(msg: Extract<MainToWorkerMessage, { kind: 'simulation/initialize' }>): void {
    if (this._state !== 'uninitialized') {
      return this.fault('already-initialized', 'Kernel is already initialized.', { replyTo: msg.messageId });
    }

    if (msg.payload.source.kind === 'new') {
      this._runtime = createNewSimulationRuntime(msg.payload.source.masterSeed);
      this._kernel = this._runtime.kernel;
    } else {
      // Restore from a persisted snapshot (ADR 0003: "Initialization
      // explicitly chooses either a new simulation with a u32 master seed
      // or a versioned snapshot"). The envelope schema/checksum was already
      // validated by the persistence layer before the snapshot was sent;
      // what this boundary must still reject is a payload carrying a
      // schemaId/version this worker build does not understand.
      const { snapshot } = msg.payload.source;
      if (snapshot.schemaId !== SESSION_SNAPSHOT_SCHEMA_ID || snapshot.schemaVersion !== SESSION_SNAPSHOT_SCHEMA_VERSION) {
        return this.fault(
          'snapshot-incompatible',
          `Cannot restore snapshot "${snapshot.schemaId}" v${snapshot.schemaVersion}; this build understands "${SESSION_SNAPSHOT_SCHEMA_ID}" v${SESSION_SNAPSHOT_SCHEMA_VERSION}.`,
          rejectedSnapshotFault(msg.messageId),
        );
      }
      if (snapshot.transport !== 'structured-clone') {
        return this.fault('snapshot-incompatible', `Session snapshots must use the structured-clone transport, got "${snapshot.transport}".`, rejectedSnapshotFault(msg.messageId));
      }

      // **A catch-all, and what hangs off it.** Every exception out of
      // `restoreSimulationRuntime` is reported under one code, so a payload
      // this build genuinely cannot restore and a *bug in this build's own
      // restore code* are indistinguishable from here. That code is not
      // inert on the other side: `WorkerSessionHost` turns
      // `snapshot-incompatible` into `SnapshotRestoreRejectedError`, which is
      // the one error `SessionController.loadPrison` demotes a save
      // generation for -- and demotion deletes.
      //
      // Bounded rather than solved, and the bound has moved since this comment
      // was written. It used to say the floor in
      // `PrisonSaveRepository.demoteGeneration` -- which refuses to delete the
      // last retained generation (docs/PERSISTENCE.md, "Never the last copy")
      // -- is what stops a deterministic failure here from walking a player's
      // whole retained window. That was true, and it cost all but one
      // generation: measured at three to one in a single load, and at three to
      // zero before the floor existed. It is now #403 mitigation (d) that does
      // the stopping -- a refused generation is retired only once a *different*
      // one has restored -- so a deterministic failure costs **nothing**, and
      // the floor is the second belt rather than the first. Telling
      // the two causes apart is the fix this comment is not: it needs every
      // deliberate rejection on the restore path to be a declared verdict
      // rather than whichever error class was nearest, which is a decision
      // about the restore modules and not about this call site.
      try {
        this._runtime = restoreSimulationRuntime(snapshot.data as unknown as SessionSnapshotBundle).runtime;
      } catch (error) {
        return this.fault('snapshot-incompatible', `Snapshot could not be restored: ${error instanceof Error ? error.message : String(error)}`, rejectedSnapshotFault(msg.messageId));
      }
      this._kernel = this._runtime.kernel;
    }

    this._clock = new FixedStepClock(50, { mode: 'paused' });
    this.transition('paused');
    this.notePublished(this._kernel.tick, this.performanceNow());

    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      replyTo: msg.messageId,
      kind: 'simulation/ready',
      payload: {
        sessionId: msg.payload.sessionId,
        tick: this._kernel.tick,
        // Read back from the clock rather than restated as a literal: this
        // message is what the main thread paints its transport controls
        // from, so it must report the clock that will actually drive the
        // kernel, not a second opinion about it.
        clock: this._clock.control,
      }
    });
    // And one counts readout straight away, before any tick has run. A
    // restored session arrives `paused`, so the tick loop is not running and
    // the next publication would otherwise wait for the player to press
    // play -- leaving a prison that has a population on screen as the same
    // row of zeros this channel exists to remove. For a new session the
    // counts genuinely are all zero, and this first readout is the baseline
    // the later "publish only what changed" comparison is made against.
    this.publishStatusCounts(this.performanceNow());
  }

  private handleSetClock(msg: Extract<MainToWorkerMessage, { kind: 'simulation/set-clock' }>): void {
    if (this._state !== 'paused' && this._state !== 'running') {
      return this.fault('invalid-state', 'Cannot set clock in current state.', { replyTo: msg.messageId });
    }

    const now = this.performanceNow();
    this._clock.setControl(msg.payload, now);
    this.transition(this._clock.control.mode === 'paused' ? 'paused' : 'running');
    this.notePublished(this._kernel!.tick, now);

    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      kind: 'simulation/clock-state',
      replyTo: msg.messageId,
      payload: {
        tick: this._kernel!.tick,
        // The clock's own control, not the request echoed back. An echo
        // would report success for a control the clock never took.
        clock: this._clock.control,
      }
    });
  }

  private handleSubmitCommand(msg: Extract<MainToWorkerMessage, { kind: 'simulation/submit-command' }>): void {
    if (!this._kernel) {
      return this.fault('not-initialized', 'Kernel is not initialized.', { replyTo: msg.messageId });
    }
    if (this._state === 'shutting-down' || this._state === 'faulted') {
      return; // Ignore commands during shutdown
    }

    try {
      this._kernel.submitCommand(
        msg.payload.commandId, 
        msg.payload.sequence, 
        msg.payload.executeAtTick, 
        msg.payload.command
      );
      this.post({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: crypto.randomUUID(),
        replyTo: msg.messageId,
        kind: 'simulation/command-result',
        payload: {
          status: 'queued',
          commandId: msg.payload.commandId,
          sequence: msg.payload.sequence,
          scheduledForTick: msg.payload.executeAtTick,
        }
      });
    } catch (e) {
      this.post({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: crypto.randomUUID(),
        replyTo: msg.messageId,
        kind: 'simulation/command-result',
        payload: {
          status: 'rejected',
          commandId: msg.payload.commandId,
          sequence: msg.payload.sequence,
          fault: {
            code: commandRejectionFaultCode(e),
            message: e instanceof Error ? e.message : String(e),
            recoverable: true,
          }
        }
      });
    }
  }

  /**
   * ADR 0003: "Saving is represented by a snapshot request and correlated
   * snapshot response." This is therefore the *only* way persisted state
   * leaves the simulation — the main thread never holds an authoritative
   * runtime of its own, and never scrapes renderer state (issue #19: "save
   * creation consumes explicit Worker snapshots, not renderer internals").
   *
   * The payload carries the full session bundle (kernel + world +
   * construction + entities) rather than the kernel alone, under its own
   * `schemaId`/`schemaVersion` — which ADR 0003 explicitly allows to evolve
   * independently of the envelope version.
   */
  private handleRequestSnapshot(msg: Extract<MainToWorkerMessage, { kind: 'simulation/request-snapshot' }>): void {
    if (!this._kernel || !this._runtime) {
      return this.fault('not-initialized', 'Kernel is not initialized.', { replyTo: msg.messageId });
    }

    const bundle = captureSessionSnapshot(this._runtime);
    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      replyTo: msg.messageId,
      kind: 'simulation/snapshot',
      payload: {
        tick: this._kernel.tick,
        reason: msg.payload.reason,
        snapshot: {
          transport: 'structured-clone',
          schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
          schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
          // A `SessionSnapshotBundle` is JSON-compatible in fact but does
          // not structurally satisfy the recursive `JsonValue`, so the
          // assertion stays. It names its target rather than `any`, which
          // would switch off checking for the whole object. The claim it
          // rests on is checkable: the main thread re-validates this against
          // `versionedPayloadSchema` in `workerToMainMessageSchema`, and the
          // persistence layer validates it again as a save payload in
          // `decodeSaveEnvelope` (`src/persistence/save-schema.ts`).
          data: bundle as unknown as JsonValue,
        }
      }
    });
  }

  /**
   * Answers one request for one read model (#104, #157 finding 1).
   *
   * This is the general route the two special cases asked for. `simulation/clock-state`
   * and `simulation/status-counts` are each a *publication* of one projection
   * on a cadence, and each needed a message kind of its own to exist; the nine
   * read models left over could not have nine more without the protocol
   * growing with the read model. So this handler is written against
   * `PROJECTION_CATALOG` rather than against any projection: the kind names
   * the *family*, the payload's `projectionId` selects the member, and adding
   * a twelfth is a catalog entry rather than a protocol change.
   *
   * **Pull, not push, and that is the design.** A level the player is always
   * looking at belongs on a cadence -- which is why the counts stay where they
   * are and are not moved onto this route. A list only an open panel cares
   * about, in a window only that panel knows, belongs on a request; and
   * requesting it is also what makes #157 finding 2 not arise, because
   * `IncidentLog.all()` is unbounded and `ConfiscationLedger` has no windowed
   * accessor, and on this route neither is read until something asks. Nothing
   * in this file publishes a projection on a timer.
   *
   * **Three refusals before any projection runs**, all `invalid-payload` and
   * all recoverable, because each rejects a request without touching
   * simulation state:
   *
   * - a page window on a projection that has no list, which would otherwise be
   *   silently ignored and leave a caller believing it had paged;
   * - a target that is not the one the entry declares, so a request naming a
   *   room instance on the staff roster fails rather than being dropped;
   * - a missing target on a detail projection, which would otherwise reach the
   *   catalog as a throw and be reported as `internal-error`.
   *
   * `limit` needs no ceiling check here: `MAX_PROJECTION_PAGE_LIMIT` is on the
   * schema, so an over-large window never decodes.
   *
   * **Strictly a report**, exactly like `publishClockState` and
   * `publishStatusCounts`. It reads `Kernel.tick` and runs a pure projection
   * over the runtime's registries; it calls nothing on the kernel, steps
   * nothing, advances no clock and writes nothing, so no number of requests can
   * change what a tick computes
   * (`tests/determinism/projection-request.test.ts`).
   *
   * The reply is **correlated** -- `replyTo` is required by the schema, not
   * optional -- because unlike the two publications it is only ever an answer.
   * ADR 0003 decision 2, read in the direction its 2026-08-23 amendment does
   * not need to relax.
   *
   * It answers from `paused` as well as `running`: a panel opened while the
   * simulation is paused must show the prison as it stands, not wait for the
   * player to press play.
   */
  private handleRequestProjection(msg: Extract<MainToWorkerMessage, { kind: 'simulation/request-projection' }>): void {
    if (!this._kernel || !this._runtime) {
      return this.fault('not-initialized', 'Kernel is not initialized.', { replyTo: msg.messageId });
    }

    const { projectionId, offset, limit, target } = msg.payload;
    const entry = PROJECTION_CATALOG[projectionId];

    if (!entry.paged && (offset !== undefined || limit !== undefined)) {
      return this.fault(
        'invalid-payload',
        `Projection "${projectionId}" has no list to page; drop offset/limit.`,
        { replyTo: msg.messageId, recoverable: true },
      );
    }

    const requestedTargetKind = target?.kind ?? 'none';
    if (requestedTargetKind !== entry.target) {
      return this.fault(
        'invalid-payload',
        `Projection "${projectionId}" takes a "${entry.target}" target, got "${requestedTargetKind}".`,
        { replyTo: msg.messageId, recoverable: true },
      );
    }

    const request: ProjectionRequest = {
      ...(offset === undefined ? {} : { offset }),
      ...(limit === undefined ? {} : { limit }),
      ...(target === undefined ? {} : { target }),
    };

    const tick = this._kernel.tick;
    const { view, page } = entry.project(this._runtime, tick, request);

    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      replyTo: msg.messageId,
      kind: 'simulation/projection',
      payload: {
        projectionId,
        // The tick the projection was read at, so a reply that arrives after
        // the simulation has moved on cannot be mistaken for a statement
        // about the state that exists when it is painted.
        tick,
        // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
        // is on, and both fields are `.strict()`-optional. An absent `view` is
        // "no such target", and an absent `page` is "this projection has no
        // list" -- neither is a zero.
        ...(page === undefined ? {} : { page }),
        ...(view === undefined
          ? {}
          : {
              view: {
                transport: 'structured-clone' as const,
                schemaId: entry.schemaId,
                schemaVersion: entry.schemaVersion,
                data: view,
              },
            }),
      },
    });
  }

  private handleShutdown(msg: Extract<MainToWorkerMessage, { kind: 'simulation/shutdown' }>): void {
    this.transition('shutting-down');
    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      replyTo: msg.messageId,
      kind: 'simulation/stopped',
      payload: {
        tick: this._kernel ? this._kernel.tick : 0,
        reason: msg.payload.reason === 'fatal-error' ? 'fatal-error' : 'shutdown-requested',
      }
    });
  }
}
