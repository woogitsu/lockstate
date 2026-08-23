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
   * How far ahead of the last tick we heard about to schedule a command while
   * the clock is running.
   *
   * Zero would be wrong: the last tick we know of is as old as the last
   * snapshot (the render feed polls every couple of seconds), so the worker
   * has already moved past it and would reject the command as scheduled in
   * the past. While the clock is *paused* the tick cannot have moved, so no
   * lead is added and the order runs on the first step after play.
   */
  readonly runningLeadTicks?: number;
}

const DEFAULT_RUNNING_LEAD_TICKS = 60; // 3 seconds at the kernel's 20 Hz.

export class SimulationCommandSender {
  private ready = false;
  private clockRunning = false;
  private lastTick = 0;
  private nextSequence = 0;
  private sequenceSynced = false;

  private readonly generateMessageId: () => string;
  private readonly generateCommandId: () => string;
  private readonly runningLeadTicks: number;

  public constructor(
    private readonly transport: SimulationCommandTransport,
    options: SimulationCommandSenderOptions = {},
  ) {
    this.generateMessageId = options.generateMessageId ?? (() => `command-${crypto.randomUUID()}`);
    this.generateCommandId = options.generateCommandId ?? (() => `player-${crypto.randomUUID()}`);
    this.runningLeadTicks = options.runningLeadTicks ?? DEFAULT_RUNNING_LEAD_TICKS;
    this.transport.addListener((message) => this.observe(message));
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
   * "Place order", nothing happens, and nothing says why. The HUD's gate
   * reports a thrown error on the control that was pressed.
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
        executeAtTick: this.lastTick + (this.clockRunning ? this.runningLeadTicks : 0),
        command: packCommand(command),
      },
    });
    this.nextSequence = sequence + 1;
  }

  /** Asks the worker to pause or run. The worker owns the clock; this only asks. */
  public setClock(control: { readonly mode: 'paused' } | { readonly mode: 'running'; readonly speed: 1 | 2 | 4 }): void {
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
        this.lastTick = message.payload.tick;
        this.clockRunning = message.payload.clock.mode === 'running';
        // A *restored* session does not start at sequence zero -- it resumes
        // the count its save was written with. So the baseline is never
        // assumed here; it is read from the first snapshot that arrives.
        this.sequenceSynced = false;
        break;

      case 'simulation/clock-state':
        this.lastTick = message.payload.tick;
        this.clockRunning = message.payload.clock.mode === 'running';
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

    this.lastTick = Math.max(this.lastTick, payload.tick);
    if (!this.sequenceSynced || expected > this.nextSequence) this.nextSequence = expected;
    this.sequenceSynced = true;
  }
}
