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
/** A clock the test moves by hand, so nothing here depends on real elapsed time. */
let nowMs: number;

function executeTicks(): readonly number[] {
  return transport.sent
    .filter((message) => message.kind === 'simulation/submit-command')
    .map((message) => (message.kind === 'simulation/submit-command' ? message.payload.executeAtTick : -1));
}

function sequences(): readonly number[] {
  return transport.sent
    .filter((message) => message.kind === 'simulation/submit-command')
    .map((message) => (message.kind === 'simulation/submit-command' ? message.payload.sequence : -1));
}

beforeEach(() => {
  nowMs = 1_000;
  transport = new FakeTransport();
  sender = new SimulationCommandSender(transport, {
    generateMessageId: () => 'msg',
    generateCommandId: () => 'cmd',
    leadTicks: 20,
    now: () => nowMs,
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

    expect(sequences()).toEqual([7, 8]);
  });

  it('schedules at the current tick while the clock is paused, however long ago it was reported', () => {
    transport.emit(ready(120));
    transport.emit(snapshot(120, 0));
    nowMs += 60_000; // a minute of the player thinking about it

    sender.submit(PLACE_WALL);

    // A paused worker cannot have moved past the tick it reported, so no lead
    // is needed and the order runs on the very first step after play.
    expect(executeTicks()).toEqual([120]);
  });

  it('carries the tick forward by elapsed real time while the clock runs', () => {
    transport.emit(ready(0, true));
    transport.emit(snapshot(500, 0));
    nowMs += 2_000; // 2s at 50ms/tick, speed 1 -> 40 ticks

    sender.submit(PLACE_WALL);

    expect(executeTicks()).toEqual([500 + 40 + 20]);
  });

  it('scales the projection by the clock speed', () => {
    transport.emit(ready(0, true));
    transport.emit(snapshot(500, 0));
    transport.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'm-clock',
      replyTo: 'r-5',
      kind: 'simulation/clock-state',
      payload: { tick: 500, clock: { mode: 'running', speed: 4 } },
    });
    nowMs += 2_000; // 2s at x4 -> 160 ticks

    sender.submit(PLACE_WALL);

    expect(executeTicks()).toEqual([500 + 160 + 20]);
  });

  it('survives a tick report that has gone badly stale', () => {
    // Observed for real: a non-compositing or backgrounded tab stops the
    // render feed's polling, the last tick report ages by tens of seconds,
    // and a fixed lead sends every order into the worker's past --
    // "Cannot schedule command in the past: tick 1168 < current 1595".
    transport.emit(ready(0, true));
    transport.emit(snapshot(1_100, 0));
    nowMs += 25_000; // 25s unobserved -> 500 ticks

    sender.submit(PLACE_WALL);

    const [executeAt] = executeTicks();
    expect(executeAt).toBeGreaterThanOrEqual(1_100 + 500);
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

    expect(sequences()).toEqual([0, 1]);
  });

  it('re-baselines downward after a rejection, which is the one case going back is right', () => {
    transport.emit(ready(0));
    transport.emit(snapshot(0, 5));
    sender.submit(PLACE_WALL); // 5
    transport.emit(rejected());

    expect(sender.canSend).toBe(false);
    transport.emit(snapshot(0, 5)); // the worker never accepted it
    sender.submit(PLACE_WALL);

    expect(sequences()).toEqual([5, 5]);
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
