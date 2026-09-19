import type { SimulationSpeed } from '../simulation/clock/fixed-step-clock';
import type { SimulationCommand } from '../simulation/protocol/commands';
import { packCommand } from '../simulation/protocol/commands';
import type { MainToWorkerMessage, ProtocolFaultCode, WorkerToMainMessage } from '../simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../simulation/protocol/types';
import {
  SESSION_SNAPSHOT_SCHEMA_ID,
  sessionSnapshotBundleFromTransport,
  type SessionSnapshotBundle,
} from '../simulation/runtime/restore-session';

/**
 * Turns a player action on this thread into a simulation command on the
 * worker.
 *
 * `AGENTS.md` boundary 3: the main thread owns "browser UI and input
 * orchestration". This is the orchestration half -- it owns no simulation
 * state, holds no authoritative copy of anything, and every value it tracks
 * is a *cached echo* of something the worker already told it.
 *
 * ### The two numbers a command needs, and where they come from
 *
 * The kernel rejects a command whose `sequence` is not exactly the next one
 * it expects, and rejects one scheduled before the tick it is already on
 * (`docs/DETERMINISM.md`, "Command Ordering"). Neither number is published
 * by a message of its own, so both are read out of the session snapshots
 * that already cross the boundary: the renderer's feed polls
 * `simulation/request-snapshot`, and `SimulationClient` broadcasts every
 * reply to every listener, so this class re-baselines from traffic that
 * exists anyway rather than adding its own polling.
 *
 * Between snapshots the sequence is advanced optimistically, and a snapshot
 * only ever moves it *forward* -- a reply that was already in flight when a
 * command was posted carries a stale count, and letting it pull the counter
 * back would manufacture the duplicate it was trying to avoid. A rejection
 * clears the sync flag instead, so the next snapshot re-baselines in either
 * direction -- except the one refusal that states the kernel's own count, for
 * which waiting on a snapshot is what turned one dropped press into a dropped
 * run (#942, `observeRejection`).
 *
 * **The tick is held to the same rule, and for a sharper reason.** The
 * *estimate* of where the kernel has got to is allowed to move backwards -- a
 * pause replaces a guess with the exact truth -- but the tick actually
 * submitted is not, because the kernel dispatches in `(executeAtTick,
 * sequence)` order and `Undo` and `Redo` count positions in that stream. An
 * order given while the clock ran and a gesture given in the pause that
 * follows would otherwise carry a higher sequence at a lower tick, and the
 * undo would reverse the order *before* the one it was aimed at (#437,
 * reproduced end to end). So `projectExecuteTick` is floored at
 * `highestSubmittedTick`, which is a third cached echo beside the other two.
 * [ADR 0056](../../docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md)
 * carries the decision, what it costs a player and how it narrows ADR 0051.
 */

/** The slice of `SimulationClient` this uses. Structural, so a test needs no worker. */
export interface SimulationCommandTransport {
  addListener(handler: (message: WorkerToMainMessage) => void): void;
  send(message: MainToWorkerMessage): void;
}

export interface SimulationCommandSenderOptions {
  readonly generateMessageId?: () => string;
  readonly generateCommandId?: () => string;
  /**
   * A small safety margin on top of the projected tick, for the message's own
   * trip to the worker.
   *
   * It is a margin, not the estimate: the estimate comes from elapsed real
   * time (see `projectExecuteTick`). A fixed lead alone was tried and is
   * wrong -- it silently assumes the last tick report is fresh, and a
   * throttled or non-compositing tab stops the render feed polling, at which
   * point the report is tens of seconds stale and every order is rejected as
   * "scheduled in the past".
   *
   * **Denominated in ticks at ×1, and therefore in real time.** What it has
   * to cover is a *real-time* latency -- how long a tick report takes to
   * reach this thread, and how long this thread's own message takes to reach
   * the worker -- so `projectFromClock` scales it by the clock speed exactly
   * as it scales elapsed time. Twenty is one second of tolerance at every
   * speed rather than at one of them (#942, below).
   */
  readonly leadTicks?: number;
  /** Injected so a test is not tied to a real clock. */
  readonly now?: () => number;
}

/**
 * One second of real-time tolerance, expressed in the kernel's own step.
 *
 * **The number is unchanged; what it means is fixed (#942).** This was `20`
 * with the comment *"1 second at the kernel's 20 Hz"*, and that sentence was
 * true at ×1 and false at every other speed: the worker converts `elapsed *
 * speed` into whole steps of `TICK_MILLISECONDS`, so twenty ticks of *kernel*
 * time is 500 ms of real time at ×2 and **250 ms at ×4**.
 *
 * **What has to fit inside it is the interval between a tick report being
 * produced and being read**, and that is narrower than it sounds: a main
 * thread that is merely *busy* and then presses is fine, because
 * `projectFromClock` carries its anchor forward by however long ago it read
 * it. What the margin covers is the work that happens between a message
 * arriving and this class reading it -- the deserialisation of a session
 * bundle, and every listener registered ahead of this one, which in
 * `src/main.ts` means the whole render feed. Longer than the margin, and the
 * command is refused as `past-tick`; before #942 that refusal also disabled
 * the whole control surface until the next snapshot (see `observeRejection`).
 * Measured live at ×4: twenty-five `Admit` presses produced seventeen
 * prisoners, and eight `Hire Guard` presses produced three guards. Measured
 * in the assembled page at ×4 with a report read 400 ms late: *"Cannot
 * schedule command in the past: tick 905 < current 923"*, and nothing on
 * screen or in the console saying so
 * (`tests/browser/command-lead-at-speed.spec.ts`).
 *
 * So the margin is scaled by speed in `projectFromClock` and the comment is
 * true again at every speed. What it costs a player is unchanged in the units
 * they experience -- an order still starts up to one *real* second after the
 * press -- and it costs more *kernel* ticks at speed, which is the same
 * statement.
 */
const DEFAULT_LEAD_TICKS = 20;
/** `FixedStepClock`'s step. The worker converts `elapsed * speed` into whole steps of this size. */
const TICK_MILLISECONDS = 50;

/**
 * `CancelBuildOrder`'s own, narrower margin (ADR 0107) -- **12 ticks, 600 ms
 * of real time at every speed**, in place of `DEFAULT_LEAD_TICKS`'s 20 (1000
 * ms). Passed as `submit`'s `options.leadTicks`; see that parameter's own
 * docblock before reusing this pattern for another command.
 *
 * ## Why 12 rather than 20, and why not lower
 *
 * ADR 0107 Context §3: a `CancelBuildOrder` aimed at a row that just read
 * `'assigned'` races `ConstructionSystem.schedule.intervalTicks` (10) -- the
 * order can flip to `'in-progress'` at most ten ticks after the row was
 * priced, and ruling 20 pays `0` for `'in-progress'`. `DEFAULT_LEAD_TICKS`
 * alone already exceeds that whole window (20 > 10) before a single
 * millisecond of real elapsed time is added, which is *why* the race is
 * closer to the modal outcome than the exception at 1x (Context §7). Halving
 * it to 12 still exceeds the window on its own, but by less -- narrowing, not
 * closing, how often a press outruns it.
 *
 * **Measured, and the honest answer is that it does not close the gap at
 * all.** `tests/browser/adr-0107-cancel-press-rate.playtest.ts` ran the same
 * 10-press-at-1x-against-a-freshly-`assigned`-row protocol #859 used, once
 * against this tree (12 ticks, this file's own commit) and once against the
 * unmodified tree before this ADR (20 ticks, no refusal): **0 of 9 valid
 * presses paid what the row advertised at 12 ticks, and 0 of 4 did at 20** --
 * both samples smaller than #859's own ten because several presses missed
 * the row-repaint window entirely (recorded separately). Halving the margin
 * from 20 to 12 made no measured difference, and the reason is arithmetic
 * rather than luck: 12 still exceeds the 10-tick transition window on its
 * own, before any real elapsed time is added, so **every** press this
 * measurement caught still executed after the transition regardless of
 * which of the two margins was in effect. Only a margin *below* ten ticks
 * could land before the transition even some of the time, and the floor two
 * paragraphs below is why this file does not go there. This is why ADR 0107
 * treats the revision-based refusal as the fix and this constant as a
 * bounded, measured mitigation rather than a substitute for it.
 *
 * The floor is `#942`'s own worst-case figure: `tests/browser
 * /command-lead-at-speed.spec.ts` stalls a tick report's own listener for
 * **400 ms** -- standing in for the renderer's heaviest per-message work,
 * not a typical figure -- and asserts a press riding that stall is still
 * accepted under `DEFAULT_LEAD_TICKS`'s 1000 ms margin. 12 ticks (600 ms)
 * keeps 200 ms of headroom over that same 400 ms stall -- verified by the
 * same-shaped stress in `tests/browser/command-lead-at-speed.spec.ts`,
 * `'a stale-cancellation press survives the same stall #942 tests, at its own
 * narrower margin'` -- where `DEFAULT_LEAD_TICKS`'s headroom is 600 ms. **A
 * value below roughly 8 ticks (400 ms) would give this stall no headroom at
 * all** and risks reproducing #942's own defect for `CancelBuildOrder`
 * specifically: a press rejected as `past-tick` on a slow or backgrounded tab
 * is a worse failure than the silent-zero this document exists to fix,
 * because a `past-tick` rejection also drops the sequence baseline and can
 * cascade into the *next* press failing too (#942's own finding), while a
 * silent zero or an explicit `stale-cancellation` refusal costs one press and
 * leaves the sender in good standing.
 *
 * **What this narrower margin costs, stated rather than left implicit.** On a
 * tab whose message-processing latency exceeds 600 ms -- a heavier renderer
 * stall than #942's own 400 ms figure, or a slower device -- a `Cancel` press
 * can now be rejected as `past-tick` where the sender's default 1000 ms
 * margin would have accepted it. No other command's margin changes: this
 * value is passed only at `CancelBuildOrder`'s own call site.
 */
export const CANCEL_BUILD_ORDER_LEAD_TICKS = 12;
/**
 * The fault code a `past-tick` refusal arrives as. See `observeRejection` for
 * why that is `invalid-state` and what makes reading it back sound.
 */
const PAST_TICK_FAULT_CODE: ProtocolFaultCode = 'invalid-state';

export class SimulationCommandSender {
  private ready = false;
  private clockRunning = false;
  private clockSpeed: SimulationSpeed = 1;
  private lastTick = 0;
  /** When `lastTick` was reported, so elapsed real time can carry it forward. */
  private lastTickAt = 0;
  private nextSequence = 0;
  private sequenceSynced = false;
  /**
   * The highest `executeAtTick` this session's command stream is already known
   * to carry, and the floor every later projection is held to.
   *
   * **Why a floor is needed at all.** `projectExecuteTick` below is not
   * monotonic on its own: it adds a lead while the clock runs and returns the
   * bare reported tick while it is paused, so an order given during play and
   * the pause that follows it inside its lead produce a *higher* sequence at a
   * *lower* tick. The kernel dispatches in `(executeAtTick, sequence)` order,
   * so the later order runs first -- and `Undo` and `Redo` count positions in
   * that stream (ADR 0009), so the undo executes before the order it was
   * aimed at exists. Reproduced end to end as issue #437: the player's earlier
   * wall is cancelled and the wall they were taking back is built, with the
   * undo stack left empty and the redo stack offering the wrong order.
   *
   * With this floor, a command can share a tick with the one ahead of it but
   * can never sit behind it, and the sequence -- which is strictly increasing
   * by construction -- breaks the tie. Dispatch order is then submission
   * order, which is the property `Undo` needs and the only one it needs.
   * [ADR 0056](../../docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md)
   * carries the decision and what it costs a player.
   *
   * **It is raised from two places**, because this sender is not the only
   * author of the stream it is submitting into. `submit` raises it to what it
   * just sent, and `baseline` raises it to the highest `executeAtTick` in the
   * kernel's own pending queue -- which is how a *restored* session's inherited
   * commands are respected. Those were issued before the save was written, so
   * they precede anything the player does now, and without the seed the first
   * gesture after a load inverts against them exactly as #437 does live.
   *
   * **It never falls**, and it never has to: once the kernel's tick passes it,
   * `projectExecuteTick`'s own value dominates and the floor stops binding.
   * A session boundary resets it (`simulation/ready`, `simulation/stopped`),
   * because the stream it describes is gone.
   */
  private highestSubmittedTick = 0;

  /**
   * Told that the simulation has accepted a command, so the session can be
   * marked dirty and the autosave timer can start.
   *
   * A callback and **not** a `SessionController`, for two reasons. The
   * boundary one: `src/ui/**` may not depend on `src/persistence/**`, and
   * `tests/unit/ui-orchestration-boundaries.test.ts` would fail this module
   * for the import -- correctly, because this class orchestrates input, it
   * does not own durability. The lifetime one: `src/main.ts` builds this
   * sender before a `SessionController` exists at all, since the controller is
   * created inside `bootPersistence` and only when a worker started.
   *
   * Attached afterwards, the same shape as `BuildTool.attachReadout`. Absent
   * until then, and absent for ever in a browser that never got persistence --
   * which is why every call site is optional rather than asserted.
   */
  private accepted: (() => void) | undefined;

  private readonly generateMessageId: () => string;
  private readonly generateCommandId: () => string;
  private readonly leadTicks: number;
  private readonly now: () => number;

  public constructor(
    private readonly transport: SimulationCommandTransport,
    options: SimulationCommandSenderOptions = {},
  ) {
    this.generateMessageId = options.generateMessageId ?? (() => `command-${crypto.randomUUID()}`);
    this.generateCommandId = options.generateCommandId ?? (() => `player-${crypto.randomUUID()}`);
    this.leadTicks = options.leadTicks ?? DEFAULT_LEAD_TICKS;
    this.now = options.now ?? (() => performance.now());
    this.transport.addListener((message) => this.observe(message));
  }

  /**
   * Where the worker's tick has most likely got to by now.
   *
   * A paused clock cannot have moved, so the last reported tick is exact and
   * the order runs on the very first step after play -- no lead, no wait.
   *
   * A running clock advances at a fixed 50 ms per tick scaled by its speed
   * (`FixedStepClock`), so elapsed real time is a sound estimate of how far
   * past the last report it has got. Reading the wall clock is legitimate
   * *here* and nowhere near the simulation: this thread owns input
   * orchestration, the number never enters simulation state, and being wrong
   * is not a correctness failure -- overshooting only makes the order start a
   * fraction of a second later, while undershooting is the one that gets the
   * command rejected. Hence the estimate plus a margin, and `ceil`.
   *
   * @param leadTicksOverride A per-command margin (see `submit`'s own
   * `options.leadTicks`), used in place of the constructor's `leadTicks` for
   * this one projection. Omitted for every command that has not asked for a
   * narrower one.
   */
  private projectExecuteTick(leadTicksOverride?: number): number {
    return Math.max(this.projectFromClock(leadTicksOverride), this.highestSubmittedTick);
  }

  /**
   * The estimate itself, before the monotonicity floor is applied.
   *
   * Split out so the two halves can be read apart: this one is about *where
   * the kernel has got to*, and it is allowed to move backwards when a pause
   * replaces an estimate with the exact truth. `highestSubmittedTick` is about
   * *what has already been submitted*, and it is the half that must not.
   *
   * **Both terms are the same kind of quantity, and are converted the same
   * way (#942).** Elapsed time and the margin are both *real* milliseconds --
   * one of them measured, one of them budgeted -- and the kernel converts real
   * time into ticks at `speed / TICK_MILLISECONDS`. The margin used to be
   * added afterwards, in ticks, which silently made it a real-time budget of
   * `1000 / speed` milliseconds: one second at ×1 and 250 ms at ×4. Adding it
   * before the conversion is what makes one line cover latency at every speed.
   *
   * At ×1 this is arithmetically the expression it replaces, tick for tick:
   * `leadTicks * speed` is an integer, so moving it inside `Math.ceil` cannot
   * change the result.
   *
   * @param leadTicksOverride Replaces `this.leadTicks` for this one call when
   * given (ADR 0107). Still a *real-time* margin, converted by the same rule:
   * a per-command override is not a second kind of number, it is the same
   * kind read from a different source.
   */
  private projectFromClock(leadTicksOverride?: number): number {
    if (!this.clockRunning) return this.lastTick;
    const elapsed = Math.max(0, this.now() - this.lastTickAt);
    const margin = (leadTicksOverride ?? this.leadTicks) * TICK_MILLISECONDS;
    return this.lastTick + Math.ceil(((elapsed + margin) * this.clockSpeed) / TICK_MILLISECONDS);
  }

  private noteTick(tick: number): void {
    this.lastTick = tick;
    this.lastTickAt = this.now();
  }

  /** True once a session exists and the command sequence has been baselined. */
  /**
   * Registers the listener that marks the session dirty (#146).
   *
   * The 30-second autosave never fired, because `AutosaveScheduler` is purely
   * dirty-driven and **nothing in the application called `markDirty`** -- so
   * the only automatic save was the best-effort one on `pagehide`, and
   * `docs/PERSISTENCE.md` justified that being best-effort by pointing at an
   * interval autosave that did not exist. Twenty minutes of play followed by a
   * crash, a force-quit or an OS kill wrote nothing.
   *
   * This is the seam that closes it. Called by the composition root once both
   * ends exist.
   */
  public onCommandAccepted(listener: () => void): void {
    this.accepted = listener;
  }

  public get canSend(): boolean {
    return this.ready && this.sequenceSynced;
  }

  public get isClockRunning(): boolean {
    return this.clockRunning;
  }

  /**
   * Posts a command, throwing rather than pretending when it cannot.
   *
   * A silent no-op here would be the worst possible failure: the player taps
   * "Place order", nothing happens, and nothing says why. A throw now reaches
   * the HUD's own failure surface: the refusal line under the status strip
   * says the order was not placed, and the control that asked for it -- when
   * there was one -- is marked as failed (issue #207 -- until it was fixed,
   * this sentence claimed a report that only ever reached `console.warn`). The
   * thrown text is not what the player reads: it is English raised on this
   * thread, and the HUD may not put untranslated text on screen (ADR 0011),
   * so it travels to the host as diagnostics instead.
   *
   * That covers the *map* route too, which it did not until issue #225. A run
   * laid by dragging on the world used to go from `BuildTool` straight to this
   * method, with a `console.warn` for its refusal -- a report that reached a
   * developer and not a player, on the primary way to build. The drag is now
   * dispatched as the HUD's own `place-build-order` intent, so both routes
   * raise here and both are reported the same way. There is no control to mark
   * for a drag, because the player pressed none; the refusal line is the whole
   * report, and it is laid out at every viewport.
   *
   * @param options.leadTicks A per-command override of the constructor's own
   * `leadTicks` (ADR 0107), for a command whose own race is narrower than the
   * generic one this sender's default margin is tuned against. **Read the
   * constructor option's own docblock before passing anything here**: the
   * margin exists to cover real message latency between a tick report
   * arriving and this class reading it, scaled by clock speed precisely so a
   * throttled or backgrounded tab does not have every command refused as
   * `past-tick` (#942) -- shrinking it for one command narrows that same
   * protection for that command alone, and the caller is asserting the
   * narrower margin is still enough for the latency this command can
   * plausibly meet. Omitted, this behaves exactly as it did before this
   * parameter existed.
   */
  public submit(command: SimulationCommand, options: { readonly leadTicks?: number } = {}): void {
    if (!this.ready) {
      throw new Error('No simulation session is running yet, so the order cannot be submitted.');
    }
    if (!this.sequenceSynced) {
      throw new Error('The simulation has not reported its command sequence yet; try again in a moment.');
    }

    const sequence = this.nextSequence;
    const executeAtTick = this.projectExecuteTick(options.leadTicks);
    /*
     * The floor is raised *before* the send, and on the attempt rather than on
     * the acknowledgement.
     *
     * Before, because `transport.send` can deliver a reply re-entrantly -- the
     * worker is a real `Worker` in production and this is asynchronous there,
     * but nothing in the type says so, and a `simulation/snapshot` observed
     * inside the call would raise the floor from the pending queue only for an
     * assignment after the send to put it back down.
     *
     * On the attempt, because a refusal costs a rejected command one tick of
     * extra patience for the orders behind it, while a floor left unraised is
     * the inversion this whole mechanism exists to remove.
     */
    this.highestSubmittedTick = executeAtTick;
    this.transport.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: this.generateMessageId(),
      kind: 'simulation/submit-command',
      payload: {
        commandId: this.generateCommandId(),
        sequence,
        executeAtTick,
        command: packCommand(command),
      },
    });
    this.nextSequence = sequence + 1;
  }

  /** Asks the worker to pause or run. The worker owns the clock; this only asks. */
  public setClock(control: { readonly mode: 'paused' } | { readonly mode: 'running'; readonly speed: SimulationSpeed }): void {
    if (!this.ready) {
      throw new Error('No simulation session is running yet, so the clock cannot be changed.');
    }
    this.transport.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: this.generateMessageId(),
      kind: 'simulation/set-clock',
      payload: control,
    });
  }

  private observe(message: WorkerToMainMessage): void {
    switch (message.kind) {
      case 'simulation/ready':
        this.ready = true;
        this.noteTick(message.payload.tick);
        this.noteClock(message.payload.clock);
        // A *restored* session does not start at sequence zero -- it resumes
        // the count its save was written with. So the baseline is never
        // assumed here; it is read from the first snapshot that arrives.
        this.sequenceSynced = false;
        // And neither is the tick floor. This is a different command stream
        // from whatever this sender was submitting into before; the floor for
        // the new one is seeded by that same first snapshot, out of the
        // kernel's own pending queue.
        this.highestSubmittedTick = 0;
        break;

      case 'simulation/clock-state':
        this.noteTick(message.payload.tick);
        this.noteClock(message.payload.clock);
        break;

      case 'simulation/snapshot':
        this.baseline(message.payload);
        break;

      case 'simulation/command-result':
        // A rejection is *usually* our idea of the sequence being wrong in an
        // unknown direction, and then the baseline is dropped and the next
        // snapshot restates it. `observeRejection` carries the one exception.
        if (message.payload.status === 'rejected') this.observeRejection(message.payload);
        // Acceptance is what marks the session dirty (#146). This branch is
        // the main thread's only observation of "the simulation has taken
        // something the player did", which is the semantics that issue calls
        // the most obviously right of its three candidates -- and the one that
        // does not tie durability to either the HUD's projection cadence or
        // the simulation's speed.
        //
        // Deliberately on *acceptance* and not on execution. A queued command
        // runs at a future tick, so a tab that dies in between marks a save
        // for a command that never ran: a save slightly too early, which is
        // the harmless direction. Hooking execution instead would reintroduce
        // the speed coupling through the back door, because how soon a tick
        // arrives depends on the clock.
        //
        // Chattiness is the scheduler's problem and it is already solved:
        // `AutosaveScheduler` coalesces per prison into one trailing-edge save
        // and holds an at-most-one-in-flight rule, so a thousand commands in
        // thirty seconds produce one write.
        if (message.payload.status === 'queued') this.accepted?.();
        break;

      case 'simulation/stopped':
        this.ready = false;
        this.sequenceSynced = false;
        this.clockRunning = false;
        this.highestSubmittedTick = 0;
        break;

      default:
        break;
    }
  }

  /**
   * What a refusal says about where the command count now stands.
   *
   * **Why this is not one line any more (#942).** Dropping the baseline on
   * every rejection is right for a rejection *"wrong in an unknown
   * direction"*, and `canSend` then reports `false` until a snapshot restates
   * the count -- which is at most one render-feed consistency poll away, and
   * that poll is **thirty seconds** long (`DEFAULT_POLL_INTERVAL_SECONDS`,
   * `src/rendering/feed/simulation-snapshot-feed.ts`; the feed marks itself
   * dirty on a `queued` result and not on a `rejected` one, so nothing brings
   * the snapshot forward). Every press in that window throws instead of
   * becoming a command. One refused press disabled the control surface.
   *
   * **One of the three refusals is wrong in a known direction, and it is the
   * one this defect produces.** `Kernel.submitCommand` checks the sequence
   * before the tick, so a `past-tick` refusal is *proof* that the sequence was
   * exactly the one the kernel expected -- and it throws before
   * `_expectedSequence++`, so the kernel still expects it. The baseline is
   * therefore not unknown: it is the sequence just refused. Rewinding to it
   * keeps the count synchronised, and the next press is a command again rather
   * than a throw.
   *
   * The other two are genuinely unknown. `duplicate-sequence` says the
   * kernel's count is *above* ours by an amount only a snapshot carries;
   * `sequence-gap` says it is *below* ours, and re-sending the same number
   * would earn the same refusal for ever. Both keep the old behaviour.
   *
   * ### Reading `past-tick` off `invalid-state`
   *
   * The reason arrives as a `ProtocolFaultCode`, and `past-tick` maps to
   * `invalid-state` (`COMMAND_REJECTION_FAULT_CODES`,
   * `src/simulation/worker/state-machine.ts`) because the twelve-code
   * vocabulary has no member for scheduling in the past. On the
   * `simulation/command-result` channel that mapping is currently one-to-one:
   * the only value posted with `status: 'rejected'` is the one built in
   * `handleSubmitCommand`'s `catch`, and the only thrower inside that `try` is
   * `Kernel.submitCommand`, whose three typed refusals map to three distinct
   * codes. The inference is therefore sound today and **not pinned by this
   * file's own fixture**: `tests/unit/ui-simulation-commands.test.ts` drives a
   * real `SimulationWorkerStateMachine` with a real `Kernel` for these cases,
   * so a change to that mapping fails here rather than going quietly.
   *
   * **And being wrong costs one press, not a session.** If some future
   * untyped throw inside that `try` reported `invalid-state` for a command the
   * kernel *had* counted, this rewind would resend a number already taken; the
   * kernel answers `duplicate-sequence`, which lands in the branch below and
   * drops the baseline exactly as it does today. That is the whole exposure,
   * and it is why the narrow reading is preferred to leaving the cascade in
   * place.
   *
   * Only a refusal of the command most recently submitted says anything about
   * where the count stands -- `sequence` is compared against the counter this
   * class advanced when it sent that command. Anything else is out of date,
   * and "drop the baseline" is the honest answer to a message this class
   * cannot place.
   *
   * `highestSubmittedTick` is deliberately left where it is. A `past-tick`
   * refusal proves that floor is already behind the kernel, so
   * `projectFromClock` dominates it from the next press onward and lowering it
   * would only reopen the inversion ADR 0056 closed.
   */
  private observeRejection(
    payload: Extract<
      Extract<WorkerToMainMessage, { kind: 'simulation/command-result' }>['payload'],
      { status: 'rejected' }
    >,
  ): void {
    if (payload.fault.code === PAST_TICK_FAULT_CODE && payload.sequence === this.nextSequence - 1) {
      this.nextSequence = payload.sequence;
      return;
    }
    this.sequenceSynced = false;
  }

  private baseline(payload: Extract<WorkerToMainMessage, { kind: 'simulation/snapshot' }>['payload']): void {
    const { snapshot } = payload;
    if (snapshot.schemaId !== SESSION_SNAPSHOT_SCHEMA_ID || snapshot.transport !== 'structured-clone') return;

    const bundle = sessionSnapshotBundleFromTransport(snapshot.data);
    const expected = bundle.kernel?.expectedSequence;
    if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0) return;

    if (payload.tick >= this.lastTick) this.noteTick(payload.tick);
    if (!this.sequenceSynced || expected > this.nextSequence) this.nextSequence = expected;
    this.sequenceSynced = true;
    this.seedTickFloor(bundle.kernel.commands);
  }

  /**
   * Raises the tick floor to the kernel's own pending queue.
   *
   * **This is the half a sender-side fix is incomplete without**, and ADR 0020
   * said so when it named the floor: *"a restored queue can hold commands
   * ahead of anything that sender has submitted"*. Those commands were issued
   * by the player *before* the save was written, so every one of them precedes
   * anything the player does now -- and without this seed the first gesture
   * after a load inverts against them in exactly the way #437 reproduces live.
   * This repository's own determinism scenario is that shape: captured at tick
   * 0 with build orders still pending at ticks 30 and 70
   * (`tests/helpers/determinism-scenario.ts`), restored paused at tick 0.
   *
   * **What it costs a player is one lead, not one queue.** Every command a
   * shipped sender submits carries at most
   * `lastTick + ceil((elapsed + margin) * speed / 50)`, so a save this
   * application wrote can hold nothing more than a lead ahead of the tick it
   * resumes at -- the same one *real* second the live case already pays, and
   * the reason the seed is not gated on how far ahead the queue reaches.
   * **Since #942 that lead is speed-scaled**, so a save captured at ×4 can
   * carry a command up to eighty ticks ahead rather than twenty, and a session
   * that resumes it at ×1 waits four seconds of game time for its first order
   * instead of one. Recorded rather than capped, for the reason the paragraph
   * below gives about caps: one real second of latency tolerance at the speed
   * the order was given is the property that keeps a run of presses a run, and
   * trading it for a shorter worst case after a load would reopen the defect
   * live. A save carrying a command *far* ahead is reachable only by a hand
   * written or corrupted bundle: `kernelSnapshotSchema` validates `tick` and
   * each `executeAtTick` as independent non-negative integers and never the
   * relation between them (`src/persistence/save-schema.ts`). Such a bundle
   * would defer this sender's orders to that tick. **That is recorded as a
   * known consequence rather than defended**: the alternative is to cap the
   * seed at an invented distance, which would restore the inversion silently
   * for every save just past the cap, and validating the relation belongs at
   * the save boundary where `Kernel.dispatchDue`'s own header already puts the
   * sibling case.
   *
   * Every field is re-checked rather than trusted: `snapshot.data` reaches this
   * class as `jsonValue` off a worker message and is cast, not parsed.
   */
  private seedTickFloor(commands: SessionSnapshotBundle['kernel']['commands'] | undefined): void {
    if (!Array.isArray(commands)) return;
    for (const command of commands) {
      const tick = (command as { readonly executeAtTick?: unknown } | undefined)?.executeAtTick;
      if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) continue;
      if (tick > this.highestSubmittedTick) this.highestSubmittedTick = tick;
    }
  }

  private noteClock(clock: { readonly mode: 'paused' } | { readonly mode: 'running'; readonly speed: SimulationSpeed }): void {
    this.clockRunning = clock.mode === 'running';
    if (clock.mode === 'running') this.clockSpeed = clock.speed;
  }
}
