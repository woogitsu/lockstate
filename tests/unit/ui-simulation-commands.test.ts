import { beforeEach, describe, expect, it } from 'vitest';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';
import { SimulationCommandSender } from '../../src/ui/simulation-commands';

/**
 * The main thread's half of "building is reachable from the running app".
 *
 * The kernel refuses a command whose sequence is not exactly the next one it
 * expects and refuses one scheduled before the tick it is on
 * (`docs/DETERMINISM.md`). This sender has to get both right from messages
 * the protocol already publishes -- so these are the cases that decide
 * whether a tap on "Place order" reaches the simulation or bounces.
 */

class FakeTransport {
  public readonly sent: MainToWorkerMessage[] = [];
  private readonly listeners: ((message: WorkerToMainMessage) => void)[] = [];

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.listeners.push(handler);
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public emit(message: WorkerToMainMessage): void {
    for (const listener of this.listeners) listener(message);
  }
}

function ready(tick: number, running = false): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'm-ready',
    replyTo: 'r-1',
    kind: 'simulation/ready',
    payload: {
      sessionId: 'session-1',
      tick,
      clock: running ? { mode: 'running', speed: 1 } : { mode: 'paused' },
    },
  };
}

function snapshot(tick: number, expectedSequence: number): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'm-snap',
    replyTo: 'r-2',
    kind: 'simulation/snapshot',
    payload: {
      tick,
      reason: 'consistency-check',
      snapshot: {
        transport: 'structured-clone',
        schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
        schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
        data: {
          kernel: { tick, expectedSequence, rngStates: [], commands: [] },
          world: { version: 1, chunkSize: 32, ownedChunks: [], chunks: [] },
          construction: { orders: [], undoStack: [], redoStack: [] },
        },
      },
    } as never,
  };
}

function rejected(): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'm-res',
    replyTo: 'r-3',
    kind: 'simulation/command-result',
    payload: {
      commandId: 'c-1',
      sequence: 0,
      status: 'rejected',
      fault: { code: 'invalid-state', message: 'Command sequence gap: expected 7, got 0', recoverable: true },
    },
  };
}

const PLACE_WALL = {
  type: 'PlaceBuildOrder',
  orderId: 'order-1',
  definitionId: 'wall-brick',
  x: 4,
  y: 6,
  edge: 'west',
} as const;

let transport: FakeTransport;
let sender: SimulationCommandSender;

beforeEach(() => {
  transport = new FakeTransport();
  sender = new SimulationCommandSender(transport, {
    generateMessageId: () => 'msg',
    generateCommandId: () => 'cmd',
    runningLeadTicks: 60,
  });
});

describe('SimulationCommandSender refuses to pretend', () => {
  it('throws rather than dropping the order when no session is running', () => {
    expect(() => sender.submit(PLACE_WALL)).toThrow(/no simulation session/i);
    expect(transport.sent).toHaveLength(0);
  });

  it('still throws between ready and the first snapshot, when the sequence is unknown', () => {
    transport.emit(ready(0));
    // A *restored* session resumes its saved sequence, so zero is not a safe
    // guess. Refusing is honest; guessing would produce a rejected command
    // with no explanation on screen.
    expect(sender.canSend).toBe(false);
    expect(() => sender.submit(PLACE_WALL)).toThrow(/command sequence/i);
  });
});

describe('SimulationCommandSender gets the two numbers right', () => {
  it('takes the sequence baseline from the snapshot, not from zero', () => {
    transport.emit(ready(0));
    transport.emit(snapshot(0, 7)); // a restored session, mid-count

    sender.submit(PLACE_WALL);
    sender.submit(PLACE_WALL);

    const sequences = transport.sent.map((message) =>
      message.kind === 'simulation/submit-command' ? message.payload.sequence : -1,
    );
    expect(sequences).toEqual([7, 8]);
  });

  it('schedules at the current tick while the clock is paused', () => {
    transport.emit(ready(120));
    transport.emit(snapshot(120, 0));

    sender.submit(PLACE_WALL);

    const [message] = transport.sent;
    expect(message?.kind).toBe('simulation/submit-command');
    // A paused worker cannot have moved past the tick it reported, so no lead
    // is needed and the order runs on the first step after play.
    if (message?.kind === 'simulation/submit-command') expect(message.payload.executeAtTick).toBe(120);
  });

  it('leads the tick while the clock is running, because the reported tick is already stale', () => {
    transport.emit(ready(0, true));
    transport.emit(snapshot(500, 0));

    sender.submit(PLACE_WALL);

    const [message] = transport.sent;
    if (message?.kind === 'simulation/submit-command') expect(message.payload.executeAtTick).toBe(560);
    else expect.unreachable('expected a submit-command');
  });

  it('never lets a stale snapshot pull the sequence backwards', () => {
    transport.emit(ready(0));
    transport.emit(snapshot(0, 0));
    sender.submit(PLACE_WALL); // consumes 0, local counter now 1

    // A snapshot that was already in flight when the command was posted still
    // reports the old count. Honouring it would reuse sequence 0 and the
    // kernel would reject the next order as a duplicate.
    transport.emit(snapshot(0, 0));
    sender.submit(PLACE_WALL);

    const sequences = transport.sent.map((message) =>
      message.kind === 'simulation/submit-command' ? message.payload.sequence : -1,
    );
    expect(sequences).toEqual([0, 1]);
  });

  it('re-baselines downward after a rejection, which is the one case going back is right', () => {
    transport.emit(ready(0));
    transport.emit(snapshot(0, 5));
    sender.submit(PLACE_WALL); // 5
    transport.emit(rejected());

    expect(sender.canSend).toBe(false);
    transport.emit(snapshot(0, 5)); // the worker never accepted it
    sender.submit(PLACE_WALL);

    const sequences = transport.sent.map((message) =>
      message.kind === 'simulation/submit-command' ? message.payload.sequence : -1,
    );
    expect(sequences).toEqual([5, 5]);
  });

  it('carries the edge through into the packed command payload', () => {
    transport.emit(ready(0));
    transport.emit(snapshot(0, 0));

    sender.submit(PLACE_WALL);

    const [message] = transport.sent;
    if (message?.kind !== 'simulation/submit-command') return expect.unreachable('expected a submit-command');
    expect(message.payload.command.schemaId).toBe('lockstate.simulation.command');
    expect(message.payload.command.data).toMatchObject({ type: 'PlaceBuildOrder', edge: 'west', x: 4, y: 6 });
  });

  it('stops accepting commands once the session stops', () => {
    transport.emit(ready(0));
    transport.emit(snapshot(0, 0));
    expect(sender.canSend).toBe(true);

    transport.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'm-stop',
      replyTo: 'r-4',
      kind: 'simulation/stopped',
      payload: { tick: 10, reason: 'shutdown-requested' },
    });

    expect(sender.canSend).toBe(false);
    expect(() => sender.submit(PLACE_WALL)).toThrow();
  });
});

describe('SimulationCommandSender asks the worker to move the clock', () => {
  it('sends a set-clock message the worker state machine accepts', () => {
    transport.emit(ready(0));
    sender.setClock({ mode: 'running', speed: 2 });

    expect(transport.sent).toEqual([
      {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'msg',
        kind: 'simulation/set-clock',
        payload: { mode: 'running', speed: 2 },
      },
    ]);
  });

  it('tracks the clock state the worker reports, which decides the tick lead', () => {
    transport.emit(ready(0));
    expect(sender.isClockRunning).toBe(false);

    transport.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'm-clock',
      replyTo: 'r-5',
      kind: 'simulation/clock-state',
      payload: { tick: 40, clock: { mode: 'running', speed: 4 } },
    });

    expect(sender.isClockRunning).toBe(true);
  });
});
