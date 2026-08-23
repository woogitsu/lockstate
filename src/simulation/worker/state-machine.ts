import { STARTER_SCENARIO } from '../../content/scenario-catalog';
import { Kernel } from '../kernel/kernel';
import { applyScenario } from '../runtime/apply-scenario';
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
import { 
  type MainToWorkerMessage, 
  type WorkerToMainMessage, 
  SIMULATION_PROTOCOL_VERSION 
} from '../protocol/types';

export type WorkerState = 
  | 'uninitialized'
  | 'ready'
  | 'running'
  | 'paused'
  | 'shutting-down'
  | 'faulted';

export interface MessagePortLike {
  postMessage(message: any, transfer?: Transferable[]): void;
}

export class SimulationWorkerStateMachine {
  private _state: WorkerState = 'uninitialized';
  private _kernel: Kernel | null = null;
  private _runtime: SimulationRuntime | null = null;
  private _clock: FixedStepClock = new FixedStepClock(50, { mode: 'paused' });
  private _tickTimerId: any | null = null;

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
    if (this._tickTimerId !== null) return;
    this._tickTimerId = setInterval(() => this.onTickLoop(), 15);
  }

  private stopTickLoop(): void {
    if (this._tickTimerId !== null) {
      clearInterval(this._tickTimerId);
      this._tickTimerId = null;
    }
  }

  private onTickLoop(): void {
    if (this._state !== 'running' && this._state !== 'paused') return;
    
    try {
      const budget = 5; // Handle up to 5 ticks per 15ms wake to avoid locking worker thread
      const executed = this._clock.pump(this.performanceNow(), budget);
      
      if (this._kernel && executed > 0) {
        for (let i = 0; i < executed; i++) {
          this._kernel.step();
        }
      }
    } catch (e) {
      this.fault('internal-error', e instanceof Error ? e.message : String(e));
    }
  }

  public fault(code: string, message: string): void {
    this.transition('faulted');
    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      kind: 'protocol/error',
      payload: {
        code: code as any, // mapping code to protocol fault code
        message,
        recoverable: false,
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
        case 'simulation/request-snapshot':
          this.handleRequestSnapshot(msg);
          break;
        case 'simulation/shutdown':
          this.handleShutdown(msg);
          break;
      }
    } catch (e) {
      this.fault('internal-error', e instanceof Error ? e.message : String(e));
    }
  }

  private handleHandshake(msg: Extract<MainToWorkerMessage, { kind: 'protocol/handshake' }>): void {
    if (this._state !== 'uninitialized') {
      return this.fault('already-initialized', 'Worker is already past handshake.');
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
      return this.fault('already-initialized', 'Kernel is already initialized.');
    }

    if (msg.payload.source.kind === 'new') {
      const runtime = createNewSimulationRuntime(msg.payload.source.masterSeed);
      // A new prison opens with the starter scenario's declared stock (ADR
      // 0018). `createNewSimulationRuntime` still fabricates nothing; this
      // is the session layer choosing what the session starts with. The
      // protocol carries no scenario id because there is exactly one
      // scenario -- issue #33 is where a choice belongs.
      applyScenario(runtime, STARTER_SCENARIO);
      this._runtime = runtime;
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
        );
      }
      if (snapshot.transport !== 'structured-clone') {
        return this.fault('snapshot-incompatible', `Session snapshots must use the structured-clone transport, got "${snapshot.transport}".`);
      }

      try {
        this._runtime = restoreSimulationRuntime(snapshot.data as unknown as SessionSnapshotBundle).runtime;
      } catch (error) {
        return this.fault('snapshot-incompatible', `Snapshot could not be restored: ${error instanceof Error ? error.message : String(error)}`);
      }
      this._kernel = this._runtime.kernel;
    }

    this._clock = new FixedStepClock(50, { mode: 'paused' });
    this.transition('paused');

    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      replyTo: msg.messageId,
      kind: 'simulation/ready',
      payload: {
        sessionId: msg.payload.sessionId,
        tick: this._kernel.tick,
        clock: { mode: 'paused' },
      }
    });
  }

  private handleSetClock(msg: Extract<MainToWorkerMessage, { kind: 'simulation/set-clock' }>): void {
    if (this._state !== 'paused' && this._state !== 'running') {
      return this.fault('invalid-state', 'Cannot set clock in current state.');
    }

    this._clock.setControl(msg.payload, this.performanceNow());
    this.transition(msg.payload.mode === 'paused' ? 'paused' : 'running');

    this.post({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: crypto.randomUUID(),
      kind: 'simulation/clock-state',
      replyTo: msg.messageId,
      payload: {
        tick: this._kernel!.tick,
        clock: msg.payload,
      }
    });
  }

  private handleSubmitCommand(msg: Extract<MainToWorkerMessage, { kind: 'simulation/submit-command' }>): void {
    if (!this._kernel) {
      return this.fault('not-initialized', 'Kernel is not initialized.');
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
            code: 'invalid-state', // or sequence-gap, duplicate-message
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
      return this.fault('not-initialized', 'Kernel is not initialized.');
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
          data: bundle as any, // Structurally JSON-compatible; validated as a save envelope on the persistence side.
        }
      }
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
