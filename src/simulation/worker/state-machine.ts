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
  sessionSnapshotBundleFromTransport,
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
import { refusalBandCeilingPassed } from '../refusals/refusal-band-lifetime';
import { RESTORE_CODE_FAULT, restoreFailureDetails, restoreFailureReasonOf } from '../runtime/restore-refusal';
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
 * and the reason the cadence is expressed as one.
 *
 * **This used to end "It is not being paid yet: nothing in `src/` can admit a
 * prisoner, so the accrual is a constant zero and the skip still applies."
 * That is false.** `src/main.ts` submits `AdmitPrisoner` from the Intake
 * panel's control, and a playtest pressed it twelve times in one session. So
 * the accrual does rise, the skip does stop firing, and this channel does run
 * at its full two messages a second once a prison holds anybody -- which is
 * the case the paragraph above describes and this sentence used to say could
 * not arise. The ceiling is what makes that acceptable, exactly as stated;
 * what is withdrawn is the claim that it is untested in practice. `docs/HUD_PROJECTIONS.md` records the trade
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
 * Stronger in a second sense measured by #444 item 4: here the tick test really
 * fires with the interval open -- 31 times across the tick-loop test files, on
 * the first wake of a session, when `_deltaPublishedAtMs` is still `-Infinity`
 * -- whereas the same two lines in `publishClockState` never do.
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
 * Why every `not-initialized` guard reports a fault this worker survives.
 *
 * A guard that fires because there is **no kernel** cannot have touched
 * simulation state: it is the first line of its handler and the runtime does
 * not exist yet. That is the condition `fault()` documents `recoverable: true`
 * for -- *"a caller passes true only where the fault rejected a request
 * without touching simulation state, so leaving the worker unusable would
 * strand the session for a failure it did not cause"* -- and the same argument
 * ADR 0024 §1 accepted for a message that failed to decode: *"There is nothing
 * half-applied to protect and nothing to fail closed against."*
 *
 * **Issue #680 is what happens when it is taken by omission instead.** The
 * page's panel readers are built once at boot, over the channel rather than
 * over a session, because they have to keep working across a worker swap
 * (#149). So the very first `.ui-tab` a player presses asks the **boot
 * worker** -- the one `SimulationWorkerChannel.claimForSession` hands to the
 * first session -- for a projection, `handleRequestProjection` refuses it, and
 * with the default `recoverable: false` that refusal moved the worker to
 * `faulted`. `faulted` is not `uninitialized`, so `handleInitialize`'s first
 * line then refused the player's first "New prison" with `already-initialized`
 * and the message *"Kernel is already initialized."* -- said about a worker
 * that had no kernel and never had one. The second press worked because the
 * first had already *claimed* that worker, so the channel threw it away and
 * built a fresh one. Measured on five of five tabs.
 *
 * Named rather than written as a bare `true` at each of the three sites,
 * because the three are one decision and a reader who changes one should see
 * the other two.
 *
 * This is deliberately **not** extended to `already-initialized` or to
 * `internal-error`. ADR 0024 §1 names both as real faults and the reason holds:
 * `internal-error` follows a caught exception that may have left a system
 * part-way through its work, and `already-initialized` is refused *because*
 * there is authoritative state to protect.
 */
const RECOVERABLE_BECAUSE_THERE_IS_NOTHING_TO_SPEND = true;

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
   * Whether the refusal the main thread was last told about carried
   * `routeDecidedSince` (ADR 0091 decision 2, option F).
   *
   * A second watermark beside the sequence rather than folded into it,
   * because the flag turns over on a refusal whose `sequence` does not move:
   * `RefusalLog.supersede` sets it on the *standing* record, and nothing about
   * that record's ordinal changes. Without this the gate below would read
   * "same sequence, nothing new" and suppress the one publication the band
   * needs in order to retire the sentence -- the same failure mode
   * `_publishedRefusalSequence`'s own comment describes for a refusal that
   * moves no count, one field over.
   *
   * It is a boolean rather than a count because the fact is monotone per
   * record: `false` -> `true` at most once, and a `record` that replaces the
   * standing refusal moves `sequence` and opens the gate on its own.
   */
  private _publishedRefusalRouteDecided = false;
  /**
   * Whether the refusal the main thread was last told about had already
   * outlived the band's tick ceiling when that publication left
   * (`REFUSAL_BAND_TICK_CEILING`, ruled in ticks by the owner 2026-09-20).
   *
   * **A third watermark, for the same reason there is a second one, and it is
   * the half of this that could not be done on the main thread alone.** The
   * ceiling is crossed by the *clock* rather than by anything the player did,
   * so no ordinal moves and no count moves -- and a refusal in a prison where
   * nothing further happens is exactly the case where `statusCountsEqual`
   * suppresses every publication there is. The main thread already holds both
   * numbers it needs (the publication's `tick` and the refusal's own), so it
   * needs no new field on the wire; what it cannot do is make a publication
   * happen. This is that publication, and there is exactly one of it per
   * refusal.
   *
   * Monotone per record like `_publishedRefusalRouteDecided`: ticks only
   * advance within a session, and a `record` that replaces the standing
   * refusal moves `sequence` and opens the gate on its own. A session loaded
   * over a running one is a new state machine, so a restored kernel cannot
   * carry this backwards.
   */
  private _publishedRefusalOutlivedBand = false;
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
  /**
   * The `sequence` of the last event the main thread was told about, `0` for
   * none (issue #507).
   *
   * A watermark on the *publisher* rather than a cursor inside
   * `SimulationEventLog`, and that is what keeps publication a pure report:
   * `tests/determinism/status-counts-publication.test.ts` pins the rule that
   * publishing changes nothing the kernel can observe, and a `drain()` on the
   * log would break it -- the tick loop would then depend on how often the
   * wall clock let a publication run. The same reason the two sequences above
   * live here.
   *
   * Unlike those two it gates nothing: events are posted on their own message
   * and never fold into the counts payload, so there is no interval to open
   * and no `statusCountsEqual` to bypass.
   */
  private _publishedEventSequence = 0;
  /**
   * The highest ordinal this session **restored** rather than recorded (the
   * owner's decision 4 of 2026-09-01 on
   * [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)).
   *
   * `0` for a session that started new, so nothing it publishes is ever
   * marked. For a restored one it is the log's `count` at the moment the
   * runtime was installed: every record at or below it came out of the save,
   * and every record above it is something this session has just done.
   *
   * A watermark rather than a flag on the record, for the reason the two
   * watermarks above are watermarks: what "restored" means is a property of
   * *this publication run*, not of the event, and writing it onto the record
   * would put it into the next save as though it were a fact about the prison.
   */
  private _restoredThroughSequence = 0;
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
      this.publishEvents();
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
   *
   * **The interval is the gate; the equality check is belt-and-braces** (#444
   * item 4). Both sentences above, and ADR 0003's amendment ("at most every
   * 250 ms and only when the tick has moved"), read as though the two
   * conditions each rule out cases the other admits. Measured, the second rules
   * out none:
   *
   * - `publishClockState` is called from `onTickLoop` and nowhere else, and
   *   `onTickLoop`'s timer exists only while `running` -- `transition` starts
   *   it for `running` and clears it for every other state, so the `paused`
   *   arm of that method's own guard is unreachable too.
   * - The only route into `running` is `handleSetClock`, which calls
   *   `notePublished(kernel.tick, now)` immediately after `transition`. So
   *   `_publishedTick` and `_publishedAtMs` are always a *matched pair*, set at
   *   a moment when the loop was not running.
   * - From there the interval opens at `now - _publishedAtMs >= 250`, and the
   *   kernel steps at least once per 50 ms of wall time: `FixedStepClock(50)`,
   *   `SIMULATION_SPEEDS` is `{1, 2, 4}` so ×1 is the slowest, and the 5-tick
   *   budget per 15 ms wake is far above the ~1 tick per 3 wakes ×1 asks for.
   *   At least five ticks have therefore run before the interval opens.
   *
   * Deleting the equality check changed not one published message across the
   * 15 test files that drive the tick loop (151 tests). Instrumented instead of
   * inferred: of 3,038 entries to this method, all with `state === 'running'`,
   * 221 returned here on the unmoved tick and **none** of those 221 had the
   * interval open -- the largest `now - _publishedAtMs` on this path was 45 ms
   * against a 250 ms interval.
   *
   * The check stays. A defensive branch with no case behind it is not a defect;
   * a sentence claiming it is load-bearing is, which is what this comment
   * fixes. It also stops being decorative the moment `CLOCK_STATE_PUBLISH_INTERVAL_MS`
   * drops below a tick of wall time, or a speed below ×1 joins
   * `SIMULATION_SPEEDS` -- neither of which anything currently forbids.
   *
   * **`publishRenderDelta`'s identical-looking check is not in this position**,
   * which is the useful contrast rather than a caveat. Nothing resets
   * `_publishedDeltaTick`/`_deltaPublishedAtMs` the way `notePublished` resets
   * this pair, so on the first wake of a session `_deltaPublishedAtMs` is still
   * `-Infinity`, the interval is trivially open, and the tick test is the only
   * thing stopping a delta with `tick === baseTick` -- which
   * `deltaMessageSchema` refuses. Measured at 31 occurrences across the same 15
   * files. Two methods, the same two lines, and only one of them dead.
   */
  private publishClockState(nowMilliseconds: number): void {
    if (this._kernel === null) return;
    const tick = this._kernel.tick;
    // Belt-and-braces, not the gate: see the docblock. Unreachable while
    // `running`, because the interval below cannot open inside one tick of
    // wall time.
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

  /**
   * The two fields `publishClockState` gates on, written together and never
   * apart.
   *
   * That is load-bearing and easy to lose: `handleInitialize` and
   * `handleSetClock` both call this, so entering `running` always leaves the
   * pair agreeing about one moment. Writing only the timestamp -- or only the
   * tick -- would break the argument in `publishClockState`'s docblock that its
   * equality check cannot fire while the interval is open, and would break it
   * silently, because that check would then start doing the work the interval
   * is credited with (#444 item 4).
   */
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
   * -- twenty-one integers of counts beside at most one refusal record, which is
   * why `docs/HUD_PROJECTIONS.md` contract 5 (paging) has nothing to bound
   * here yet. It was eleven until #29's income line added
   * `stateIncomeAccruedTodayMinorUnits`, twelve until `accommodationCapacity`
   * gave the strip's occupancy bar a denominator, thirteen until payroll
   * (ADR 0042 step 3) added the daily wage bill and the arrears beside it,
   * fifteen until issue #588 added the three guard-coverage rungs the
   * population is standing on, eighteen until issue #585 added
   * `occupiedPlaces` -- the residency places that currently exist, which is
   * what the state pays for and which nothing on this channel said -- and
   * nineteen until the owner's ruling 18 of 2026-08-31 added
   * `treasuryOverdraftFloorMinorUnits`, the treasury's own floor, without which
   * the strip could say the balance was negative and not how much of the
   * facility was left, and twenty until issue #890 added
   * `stateIncomeWithheldTodayMinorUnits` -- how much of today's grant unmet
   * needs have kept back, which the prison's own roster showed the cause of
   * and no readout anywhere showed the money of. And
   * the number is checked against the projection's own schema rather than
   * trusted (`tests/foundation/documentation-claims-contract.test.ts`).
   *
   * **`dispatchedWhilePaused` is a third player-initiated event**, on exactly
   * the terms the refusal and the zoning notice are: it opens the interval
   * gate and it bypasses the "nothing changed" comparison, and it can fire at
   * most once per command the player submits against a paused clock, which is
   * bounded by how fast a button can be pressed. It bypasses the comparison
   * because it has to: a build order moves none of the fifteen figures this
   * payload carries, so `statusCountsEqual` would suppress the very
   * publication the six pull readouts in `src/main.ts` ride on -- and while
   * the clock is paused there is no tick-loop wake behind it to catch the
   * miss. See [ADR 0051](../../../docs/adr/0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md).
   */
  private publishStatusCounts(nowMilliseconds: number, dispatchedWhilePaused = false): void {
    if (this._kernel === null || this._runtime === null) return;

    const refusal = this._runtime.refusals.last;
    const refusalSequence = refusal?.sequence ?? 0;
    const refusalRouteDecided = refusal?.routeDecidedSince === true;
    // Read once, here rather than beside `tick` below, because it has to be
    // available to the interval gate: a ceiling that only reached the payload
    // would be computed on publications this method had already declined to
    // make.
    const refusalOutlivedBand =
      refusal !== undefined && refusalBandCeilingPassed(refusal.tick, this._kernel.tick);
    const refusalIsNew =
      refusalSequence !== this._publishedRefusalSequence ||
      refusalRouteDecided !== this._publishedRefusalRouteDecided ||
      refusalOutlivedBand !== this._publishedRefusalOutlivedBand;
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
    const eventIsNew = refusalIsNew || zoningIsNew || dispatchedWhilePaused;
    if (!eventIsNew && nowMilliseconds - this._countsProjectedAtMs < STATUS_COUNTS_PUBLISH_INTERVAL_MS) return;
    this._countsProjectedAtMs = nowMilliseconds;

    const tick = this._kernel.tick;
    const counts = projectStatusCounts(this._runtime, tick);
    if (!eventIsNew && this._publishedCounts !== null && statusCountsEqual(this._publishedCounts, counts)) return;
    this._publishedCounts = counts;
    this._publishedRefusalSequence = refusalSequence;
    this._publishedRefusalRouteDecided = refusalRouteDecided;
    this._publishedRefusalOutlivedBand = refusalOutlivedBand;
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
   * `publishStatusCounts`. It reads `Kernel.tick`, the prisoner position SoA and
   * the live `GuardRoster` (ADR 0040 slice 2) after the tick loop has finished
   * stepping, calls nothing on the kernel, steps nothing and writes nothing but
   * the buffer it posts
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
  /**
   * Tells the main thread what the prison just did, unprompted (issue #507).
   *
   * The third publication on the tick loop, and the one with **no rate gate at
   * all** -- which is the difference between an event channel and the two
   * above it, not an omission.
   *
   * `publishStatusCounts` and `publishRenderDelta` both carry *levels*: what
   * the prison currently is, and where the actors currently are. A level
   * tolerates being sampled, so both are gated to protect the frame budget and
   * both are correct when a wake is skipped, because the next sample supersedes
   * the missed one. An event has no next sample. "Two prisoners finished their
   * sentences at tick 40,000" is not a value that can be re-read later, so a
   * gate here would not delay a message, it would delete one -- and deleting
   * it is the defect issue #507 exists to close, arrived at by a different
   * route.
   *
   * **What bounds it instead is the producers.** `PrisonerDischargeSystem`
   * emits at most one event per tick it runs and it runs on
   * `DISCHARGE_CHECK_INTERVAL_TICKS`; `PayrollSystem` emits at most one per
   * in-game day. So the ceiling is not "one per tick" but roughly "one per
   * discharge check plus one per day", and both producers aggregate rather
   * than emitting per subject -- a tick that discharges eleven prisoners posts
   * one message carrying eleven, not eleven messages. `docs/HUD_PROJECTIONS.md`
   * contract 5 is satisfied by each payload being four fields wide whatever
   * the population, exactly as the counts payload is.
   *
   * One message per event rather than one carrying an array, because
   * `eventMessageSchema` is a single event and the main thread folds them into
   * its list one at a time either way; a batch would buy nothing and would make
   * `payload.tick` ambiguous across the members.
   *
   * A read, start to finish: `since` does not drain and the watermark is this
   * object's own, so a publication changes nothing the kernel can observe
   * (`tests/determinism/status-counts-publication.test.ts`).
   */
  private publishEvents(): void {
    if (this._kernel === null || this._runtime === null) return;

    const pending = this._runtime.events.since(this._publishedEventSequence);
    if (pending.length === 0) return;

    const tick = this._kernel.tick;
    for (const event of pending) {
      this.post({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: crypto.randomUUID(),
        // No `replyTo`, and the schema has no slot for one: nobody asked. ADR
        // 0003 decision 2's "asynchronous domain events", which is the family
        // this message kind was declared for and had no producer for until now.
        kind: 'simulation/event',
        payload: {
          // The tick this is being *published* at, which is not the tick the
          // event happened on -- `event.tick` carries that. The same
          // distinction `simulation/status-counts` draws around `refusal`, and
          // it is wider here: an event recorded mid-budget is published after
          // the whole five-tick budget has run.
          tick,
          event,
          /*
           * Whether the prison just did this, or the save remembered it (the
           * owner's decision 4 of 2026-09-01 on ADR 0084).
           *
           * The alerts list builds a row either way -- that decision is the
           * whole point -- and the events band ignores a restored one, because
           * the band carries what is happening now and this happened on a tick
           * the player was not looking at. Read from a watermark taken when the
           * runtime was installed rather than from anything on the record, so a
           * record that survives into the *next* save carries no trace of
           * having been replayed.
           *
           * The key is omitted rather than set to `false`: `restored` is
           * `z.literal(true).optional()` and `exactOptionalPropertyTypes` is
           * on, so absent is the one spelling of "the prison just did this".
           */
          ...(event.sequence <= this._restoredThroughSequence ? { restored: true as const } : {}),
        },
      });
      // Advanced per message rather than once after the loop, so a `post` that
      // throws mid-batch leaves the events it did not send still pending
      // instead of silently skipping them.
      this._publishedEventSequence = event.sequence;
    }
  }

  private publishRenderDelta(nowMilliseconds: number): void {
    if (this._kernel === null || this._runtime === null) return;

    const tick = this._kernel.tick;
    // Nothing in this payload can move without a tick, so an unmoved tick is
    // "nothing changed" -- the skip `STATUS_COUNTS_PUBLISH_INTERVAL_MS`
    // describes, reached without a mirror of the last published positions.
    if (tick <= this._publishedDeltaTick) return;
    if (nowMilliseconds - this._deltaPublishedAtMs < RENDER_DELTA_PUBLISH_INTERVAL_MS) return;

    // Sub-tile units a tick become sub-tile units a wall-clock second inside
    // the encoder, and this is the rate: the kernel's step duration and the
    // player's current speed multiplier, both of which live here and neither
    // of which the main thread should have to track (ADR 0059).
    const control = this._clock.control;
    const ticksPerWallSecond = (1_000 / this._clock.stepMilliseconds) * (control.mode === 'running' ? control.speed : 1);
    // ADR 0099 decision 3's marker, read off the world it is a marker for and
    // published unexamined. `publishRenderDelta` is still strictly a read: the
    // counter is incremented at the write sites that change what the renderer
    // draws, never here.
    const data = encodeRenderActorsKeyframe(
      this._runtime.prisoners,
      ticksPerWallSecond,
      this._runtime.world.drawnWorldRevision,
      this._runtime.securityGuards,
    );
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
    options: { readonly replyTo?: string; readonly recoverable?: boolean; readonly details?: JsonValue } = {},
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
        // `protocolFaultSchema` has declared an optional `details` since ADR
        // 0003's envelope contract and nothing emitted one until #431, which
        // is why carrying a machine-readable refusal reason across this
        // boundary needs no protocol version and no new fault code. Spread
        // rather than written as `undefined`: the schema is `.strict()` and a
        // key holding `undefined` does not survive a structured clone the
        // same way on both sides, so a fault with nothing to add posts exactly
        // the payload it posted before this field was used.
        ...(options.details === undefined ? {} : { details: options.details }),
      }
    });
  }

  /**
   * Refuses a request that arrived after `simulation/shutdown`, with the fault
   * code the vocabulary has carried for exactly this since it was closed.
   * Answers `true` when it refused, so a handler reads
   * `if (this.refusedBecauseShuttingDown(msg.messageId)) return;`.
   *
   * ## What this replaces, measured rather than described
   *
   * Issue #444 drove five request kinds through a shut-down state machine and
   * got five different answers, *"none of them using the fault code named for
   * it"*: `submit-command` got **no reply at all** and the caller waited out
   * `WorkerSessionHost`'s 15-second timeout; `request-snapshot` got **a full
   * session bundle, handed out during shutdown**; `request-projection` got a
   * projection; `set-clock` got a refusal under the generic `'invalid-state'`;
   * `ping` got a pong. Three of those are this method's callers and the fourth
   * is the code change beside it.
   *
   * `'ping'` is deliberately not a caller. It is a liveness probe -- *"is this
   * worker still answering"* -- and a worker mid-shutdown is, so a pong is the
   * true answer rather than a gap. (Nothing in `src/` sends one either;
   * `tests/foundation/message-kind-reachability-contract.test.ts` records that
   * and records that whether to keep it is the owner's open decision on #274.)
   *
   * ## Why this is not a new decision
   *
   * [ADR 0024](../../../docs/adr/0024-protocol-fault-recoverability.md) §1 is
   * accepted and settles the shape: a request that reached no simulation state
   * *"must not end the session -- but it must be reported to the player, and
   * the two are one decision rather than two."* Its own Context names this
   * path's symptom in the same breath -- *"`handleSubmitCommand` returns
   * **without replying at all**"* and *"a pending request waits out its 15 s
   * timeout before reporting the wrong cause"*. So the refusal is
   * `recoverable`, for the reason `RECOVERABLE_BECAUSE_THERE_IS_NOTHING_TO_SPEND`
   * states at the `not-initialized` guards: a request refused at the first
   * line of its handler has touched nothing, and `fault()` therefore leaves
   * `_state` where it is. **The worker stays `shutting-down` and this method
   * changes no session's lifetime** -- which is what separates it from issue
   * #444 item 2, the `recoverable` flag on the four *premature* guards, an
   * amendment this does not make and does not need.
   *
   * ## What it is worth to a player
   *
   * `src/ui/simulation-alerts.ts` has mapped `'shutting-down'` to
   * `hud.alert.fault.shutting-down` since that table was written, and
   * `src/content/default-locale-en.ts` ships the sentence. Nothing could
   * produce the code, so the sentence was a string the game could never say.
   * A correlated `protocol/error` rejects the pending request the moment it
   * arrives (`WorkerSessionHost.settle`), so a save or a command sent into a
   * closing session is reported for what it is instead of resolving fifteen
   * seconds later as a worker that did not reply.
   */
  private refusedBecauseShuttingDown(requestMessageId: string): boolean {
    if (this._state !== 'shutting-down') return false;
    this.fault('shutting-down', 'The session is shutting down; this request was not served.', {
      replyTo: requestMessageId,
      recoverable: RECOVERABLE_BECAUSE_THERE_IS_NOTHING_TO_SPEND,
    });
    return true;
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
          { ...rejectedSnapshotFault(msg.messageId), details: restoreFailureDetails('unsupported-by-this-build') },
        );
      }
      if (snapshot.transport !== 'structured-clone') {
        return this.fault(
          'snapshot-incompatible',
          `Session snapshots must use the structured-clone transport, got "${snapshot.transport}".`,
          { ...rejectedSnapshotFault(msg.messageId), details: restoreFailureDetails('unsupported-by-this-build') },
        );
      }

      // **Not a catch-all any more, and this comment used to say it was.**
      //
      // It read: *"Every exception out of `restoreSimulationRuntime` is
      // reported under one code, so a payload this build genuinely cannot
      // restore and a bug in this build's own restore code are
      // indistinguishable from here"*, and it closed by naming the fix it was
      // not -- *"it needs every deliberate rejection on the restore path to be
      // a declared verdict rather than whichever error class was nearest,
      // which is a decision about the restore modules and not about this call
      // site."* That is #431, and it landed: the decision is in the restore
      // modules, and what is left here is one call to the classifier they
      // declare (`../runtime/restore-refusal.ts`).
      //
      // Kept in the past tense rather than deleted, because the bound that
      // stood in for it is still load-bearing and still worth reading. Before
      // #403 (d) a deterministic refusal here cost the player every retained
      // generation -- measured at three to zero in a single load, and at three
      // to one once `PrisonSaveRepository.demoteGeneration` gained its
      // "never the last copy" floor. A refused generation is now retired only
      // once a *different* one has restored, so a deterministic refusal costs
      // nothing at all. What this call site adds on top is that a refusal our
      // own code caused is no longer *called* a refusal: it goes out as
      // `internal-error`, which is what it is.
      //
      // Two codes, and neither is a fallback:
      //
      // - `snapshot-incompatible`, recoverable, for a declared verdict about
      //   the save. Nothing was installed, so the worker is not spent -- ADR
      //   0024 §1, and ADR 0038 §5's *"whatever is refused is refused at
      //   restore, and is never an `internal-error`"*.
      // - `internal-error` for an exception nothing declared. ADR 0038 §5 is
      //   not contradicted by that: what §5 forbids is a *save-compatibility
      //   condition* arriving as an internal error, and a defect in our own
      //   restore code is not one.
      //
      // **And it is recoverable, which is the one place this departs from a
      // sentence ADR 0024 wrote.** §1 contrasts a refused envelope with the
      // other call sites -- *"`internal-error` after a caught exception may
      // have left a system part-way through its work ... Those are real
      // faults"* -- and the operative word is *may*. The test that sentence
      // applies is whether the failure reached simulation state, and here it
      // provably did not: `restoreSimulationRuntime` is a factory that holds
      // no reference to this machine and builds an entirely new runtime, and
      // `this._runtime` and `this._kernel` are assigned only from its return
      // value. A throw inside it leaves this worker exactly `uninitialized`,
      // which is the same fact `rejectedSnapshotFault` passes
      // `recoverable: true` for one branch up. Reporting it as spent would
      // also cost the player a recovery: `SessionController.loadPrison` tries
      // the next-oldest generation after a code fault, and a `faulted` worker
      // answers that attempt `already-initialized`.
      //
      // Both carry the reason in the fault's `details`, which is what lets
      // `WorkerSessionHost` re-raise the right class on the other side without
      // reading a message string.
      try {
        this._runtime = restoreSimulationRuntime(sessionSnapshotBundleFromTransport(snapshot.data)).runtime;
      } catch (error) {
        const reason = restoreFailureReasonOf(error);
        const detail = error instanceof Error ? error.message : String(error);
        if (reason === RESTORE_CODE_FAULT) {
          return this.fault('internal-error', `Restoring this snapshot threw where nothing declared a refusal: ${detail}`, {
            ...rejectedSnapshotFault(msg.messageId),
            details: restoreFailureDetails(reason),
          });
        }
        return this.fault('snapshot-incompatible', `Snapshot could not be restored: ${detail}`, {
          ...rejectedSnapshotFault(msg.messageId),
          details: restoreFailureDetails(reason),
        });
      }
      this._kernel = this._runtime.kernel;
      // Everything the log came back holding is a record this session is
      // replaying rather than making, and `publishEvents` says so on the wire.
      this._restoredThroughSequence = this._runtime.events.count;
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
    /*
     * And the alerts log, before any tick has run, for exactly the reason the
     * counts readout above goes out here (the owner's decision 4 of
     * 2026-09-01 on ADR 0084).
     *
     * A restored session arrives `paused`, so the tick loop is not running and
     * the next publication would otherwise wait for the player to press play
     * -- leaving a prison whose log the save carried reading "No active
     * alerts" until they did. For a new session the log is empty and this
     * posts nothing, which is the same baseline the counts readout is.
     */
    this.publishEvents();
  }

  private handleSetClock(msg: Extract<MainToWorkerMessage, { kind: 'simulation/set-clock' }>): void {
    // Before the generic guard below, which would otherwise answer a shut-down
    // session under `'invalid-state'` -- *"the simulation cannot do that right
    // now"*, true but the least specific true thing available. Same refusal,
    // same `recoverable: true`, same terminal state untouched; only the code
    // and the sentence the player is shown change.
    if (this.refusedBecauseShuttingDown(msg.messageId)) return;
    if (this._state !== 'paused' && this._state !== 'running') {
      // Recoverable, for the reason stated once at the three `not-initialized`
      // guards and applying unchanged here: no clock was set, so no simulation
      // state was touched, and there is nothing half-applied to fail closed
      // against.
      return this.fault('invalid-state', 'Cannot set clock in current state.', {
        replyTo: msg.messageId,
        recoverable: true,
      });
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
      return this.fault('not-initialized', 'Kernel is not initialized.', {
        replyTo: msg.messageId,
        recoverable: RECOVERABLE_BECAUSE_THERE_IS_NOTHING_TO_SPEND,
      });
    }
    if (this.refusedBecauseShuttingDown(msg.messageId)) return;
    if (this._state === 'faulted') {
      // Unchanged, and deliberately not folded into the refusal above. A
      // faulted worker has *already* posted the `protocol/error` that says so,
      // and the vocabulary has no code meaning "this worker is faulted" to
      // post a second one with. Whether a silent drop is right here at all is
      // the other half of issue #444 item 2, and it is not answered by giving
      // `shutting-down` the emitter it never had.
      return;
    }

    let accepted = false;
    try {
      this._kernel.submitCommand(
        msg.payload.commandId,
        msg.payload.sequence,
        msg.payload.executeAtTick,
        msg.payload.command
      );
      accepted = true;
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

    if (!accepted) return;

    /*
     * The paused drain (ADR 0051).
     *
     * **Why anything happens here at all.** The tick loop is the only thing
     * that calls `Kernel.step()`, and `transition` runs that loop only while
     * the state is `running` -- so before this, a command a player gave
     * against a paused clock was accepted, acknowledged, and then sat in the
     * kernel's queue producing nothing a player could see. That is thirteen
     * gestures with no answer: a wall that does not appear, a room that does
     * not register, a hire that changes no figure, an `Undo` that undoes
     * nothing. It is not a *publication* gap and republishing would not have
     * closed it -- nothing had been applied, so there was nothing new to
     * publish.
     *
     * **After the acknowledgement, never before it.** ADR 0003 decision 9:
     * the worker "never reports a command as applied merely because the
     * message was received", and `status: 'queued'` is receipt. Composing
     * that reply first keeps it true of the moment it describes.
     *
     * **Only while paused.** A running clock's tick loop dispatches within one
     * 15 ms wake, so there is nothing to add and a second dispatch site on the
     * hot path would be cost for nothing.
     *
     * **Every command a player submits while paused is due**, so this is not a
     * rare branch: `SimulationCommandSender.projectExecuteTick` returns the
     * last reported tick with no lead while the clock is stopped, and
     * `handleSetClock` answers with the kernel's exact tick so that number is
     * not stale. A command still queued ahead at a *future* tick -- one given
     * while running and then paused inside its lead -- is not due and is left
     * alone, which is what keeps ADR 0020's admission decision intact.
     *
     * **The catch matches `onTickLoop`'s and not `handleMessage`'s**: a throw
     * out of a command handler has already touched simulation state, so the
     * fault is unrecoverable, and it carries no `replyTo` because the request
     * that provoked it has already been answered.
     *
     * **`publishEvents()` runs here too, and it was not until #749 made the
     * paragraph above false for five members of `SIMULATION_EVENT_TYPES`.**
     * "Nothing had been applied, so there was nothing new to publish" held
     * while every route this drain could reach wrote only to status counts --
     * a wall, a room, a hire. `createConstructionCommandHandler` and
     * `createSessionCommandHandler` now also write to `SimulationEventLog` on
     * a successful cancel, undo, redo or delivery cancellation, and that log
     * is otherwise drained only by `onTickLoop`'s own `publishEvents()` --
     * which `transition` stops from running at all while paused, because it
     * stops the tick-loop interval for every state but `running`
     * (`stopTickLoop`). Nothing then calls it again until the player presses
     * Play.
     *
     * Measured by playing, not inferred: cancelling a queued build order while
     * paused removed the row and refunded the treasury instantly -- the
     * status-counts publish this branch already ran -- and the events band
     * stayed empty for as long as the clock stayed paused, then showed "The
     * order was cancelled -- the money it cost is refunded" the instant Play
     * was pressed, on a tick the player did not cause pressing it. Exactly the
     * player-visible promise the code did not keep that `AGENTS.md`'s fourth
     * exclusion is about, for the one control -- Cancel on a queued order --
     * that issue #749 exists to fix and that a player manages almost
     * exclusively while paused.
     *
     * Both directions are marked rather than the paragraph above rewritten
     * (`docs/AGENT_WORKFLOW.md` section 4): it is still true of every command
     * this branch reached before #749, and false of the five it reaches now.
     *
     * Ordered after `publishStatusCounts`, matching `onTickLoop`'s own
     * ordering of the two.
     */
    if (this._clock.control.mode !== 'paused') return;
    try {
      if (this._kernel.dispatchDueCommands() > 0) {
        this.publishStatusCounts(this.performanceNow(), true);
        this.publishEvents();
      }
    } catch (e) {
      this.fault('internal-error', e instanceof Error ? e.message : String(e));
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
      return this.fault('not-initialized', 'Kernel is not initialized.', {
        replyTo: msg.messageId,
        recoverable: RECOVERABLE_BECAUSE_THERE_IS_NOTHING_TO_SPEND,
      });
    }
    // After the kernel guard and before the capture, because the capture is
    // the thing being refused: issue #444 measured this handler answering a
    // post-shutdown request with **a full session bundle**. A shut-down
    // session is not a state a save may be taken of. The main-thread path that
    // can arrive here is named in `SessionController.closeSession`: autosave's
    // `dispose()` cancels pending timers and *"does not await a capture
    // already past its `state = 'saving'` line"* (issue #582 FINAL-004), so a
    // capture in flight when the shutdown is sent can land after it.
    if (this.refusedBecauseShuttingDown(msg.messageId)) return;

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
   * on a cadence, and each needed a message kind of its own to exist; the
   * read models left over could not each have one without the protocol
   * growing with the read model. So this handler is written against
   * `PROJECTION_CATALOG` rather than against any projection: the kind names
   * the *family*, the payload's `projectionId` selects the member, and adding
   * another is a catalog entry rather than a protocol change.
   *
   * Both sentences carried a tally before (`the nine read models`, `a twelfth`)
   * and both were already wrong at `4da7b2a3`, the commit that wrote them, where
   * `PROJECTION_IDS` held twelve. Derive the number instead of restating it:
   * `node -e "import('./src/simulation/protocol/types.ts').then(m => console.log(m.PROJECTION_IDS.length))"`.
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
      return this.fault('not-initialized', 'Kernel is not initialized.', {
        replyTo: msg.messageId,
        recoverable: RECOVERABLE_BECAUSE_THERE_IS_NOTHING_TO_SPEND,
      });
    }

    // The reachable one of the three, and the reason this guard is here rather
    // than only on the two above. A panel's readouts are registered once at
    // boot over `SimulationMessageChannel` and *"have to keep working across a
    // worker swap without knowing one happened"* (#149,
    // `src/ui/simulation-projections.ts`), so an open panel goes on asking a
    // worker that the session layer has already told to shut down.
    if (this.refusedBecauseShuttingDown(msg.messageId)) return;

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
