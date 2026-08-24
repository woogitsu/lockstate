import type { SimulationSpeed } from '../simulation/clock/fixed-step-clock';
import type { SimulationCommand } from '../simulation/protocol/commands';
import { packCommand } from '../simulation/protocol/commands';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../simulation/protocol/types';
import {
  SESSION_SNAPSHOT_SCHEMA_ID,
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
 * direction.
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
   */
  readonly leadTicks?: number;
  /** Injected so a test is not tied to a real clock. */
  readonly now?: () => number;
}

const DEFAULT_LEAD_TICKS = 20; // 1 second at the kernel's 20 Hz.
/** `FixedStepClock`'s step. The worker converts `elapsed * speed` into whole steps of this size. */
const TICK_MILLISECONDS = 50;

export class SimulationCommandSender {
  private ready = false;
  private clockRunning = false;
  private clockSpeed: SimulationSpeed = 1;
  private lastTick = 0;
  /** When `lastTick` was reported, so elapsed real time can carry it forward. */
  private lastTickAt = 0;
  private nextSequence = 0;
  private sequenceSynced = false;

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
   */
  private projectExecuteTick(): number {
    if (!this.clockRunning) return this.lastTick;
    const elapsed = Math.max(0, this.now() - this.lastTickAt);
    return this.lastTick + Math.ceil((elapsed * this.clockSpeed) / TICK_MILLISECONDS) + this.leadTicks;
  }

  private noteTick(tick: number): void {
    this.lastTick = tick;
    this.lastTickAt = this.now();
  }

  /** True once a session exists and the command sequence has been baselined. */
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
   * "Place order", nothing happens, and nothing says why. A throw on the
   * HUD's numeric route now reaches the HUD's own failure surface: the submit
   * button is marked as failed and the refusal line under the status strip
   * says the order was not placed (issue #207 -- until it was fixed, this
   * sentence claimed a report that only ever reached `console.warn`). The
   * thrown text is not what the player reads: it is English raised on this
   * thread, and the HUD may not put untranslated text on screen (ADR 0011),
   * so it travels to the host as diagnostics instead.
   *
   * The *map* route is still console-only. A run laid by dragging on the
   * world goes through `BuildTool`, and its `onError` in `src/main.ts` is a
   * `console.warn` -- that refusal reaches a developer and not a player.
   */
  public submit(command: SimulationCommand): void {
    if (!this.ready) {
      throw new Error('No simulation session is running yet, so the order cannot be submitted.');
    }
    if (!this.sequenceSynced) {
      throw new Error('The simulation has not reported its command sequence yet; try again in a moment.');
    }

    const sequence = this.nextSequence;
    this.transport.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: this.generateMessageId(),
      kind: 'simulation/submit-command',
      payload: {
        commandId: this.generateCommandId(),
        sequence,
        executeAtTick: this.projectExecuteTick(),
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
        break;

      case 'simulation/clock-state':
        this.noteTick(message.payload.tick);
        this.noteClock(message.payload.clock);
        break;

      case 'simulation/snapshot':
        this.baseline(message.payload);
        break;

      case 'simulation/command-result':
        // A rejection means our idea of the sequence is wrong in an unknown
        // direction. Drop the baseline and let the next snapshot restate it.
        if (message.payload.status === 'rejected') this.sequenceSynced = false;
        break;

      case 'simulation/stopped':
        this.ready = false;
        this.sequenceSynced = false;
        this.clockRunning = false;
        break;

      default:
        break;
    }
  }

  private baseline(payload: Extract<WorkerToMainMessage, { kind: 'simulation/snapshot' }>['payload']): void {
    const { snapshot } = payload;
    if (snapshot.schemaId !== SESSION_SNAPSHOT_SCHEMA_ID || snapshot.transport !== 'structured-clone') return;

    const bundle = snapshot.data as unknown as SessionSnapshotBundle;
    const expected = bundle.kernel?.expectedSequence;
    if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0) return;

    if (payload.tick >= this.lastTick) this.noteTick(payload.tick);
    if (!this.sequenceSynced || expected > this.nextSequence) this.nextSequence = expected;
    this.sequenceSynced = true;
  }

  private noteClock(clock: { readonly mode: 'paused' } | { readonly mode: 'running'; readonly speed: SimulationSpeed }): void {
    this.clockRunning = clock.mode === 'running';
    if (clock.mode === 'running') this.clockSpeed = clock.speed;
  }
}
