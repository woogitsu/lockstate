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
      // `sequence-gap`, not `invalid-state`: this fixture used to pair the
      // collapsed code with a message that named the real condition, which is
      // the #187 finding 2 defect reproduced in a test double. The worker now
      // reports the two apart, so a double that did not would be testing the UI
      // against a message the worker can no longer send.
      fault: { code: 'sequence-gap', message: 'Command sequence gap: expected 7, got 0', recoverable: true },
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

  /**
   * Issue #445: a snapshot repeating a tick the client already knows still
   * has to re-anchor the clock estimate.
   *
   * `noteTick` sets two fields -- `lastTick` *and* `lastTickAt` -- so the
   * comparison in `baseline` decides freshness, not just novelty. Narrowing
   * it to `payload.tick > this.lastTick` leaves `lastTick` correct and
   * `lastTickAt` stale, and `projectExecuteTick` then adds the whole elapsed
   * interval a second time: the order is scheduled further into the future
   * than intended, which is worst right after a pause or a load, when the
   * worker reports the same tick repeatedly while wall time runs on.
   *
   * The repeated-snapshot case above cannot see this, and could not be
   * extended to: it runs on a *paused* clock, where `projectExecuteTick`
   * returns `lastTick` unchanged and no timestamp can matter. This one needs
   * a running clock, so it is a separate case rather than an extra assertion
   * there.
   *
   * Every expected tick below is a literal. Each is stated in the comment as
   * the arithmetic the projection is *supposed* to do, but the assertion is
   * the number, so re-deriving it from `leadTicks` or from elapsed time --
   * the production expression in the test's clothes -- cannot make it agree
   * with a broken projection.
   *
   * **The order of the two submissions is load-bearing, and it changed with
   * ADR 0056.** This case used to submit its non-vacuity control *first* --
   * one order at 560, then the re-anchored one at 520 -- and read the drop
   * from 560 to 520 as the evidence. `projectExecuteTick` is now floored at
   * the highest tick this sender has already submitted (#437: an order that
   * goes backwards reorders `Undo` against the order it was aimed at), so a
   * projection can no longer be observed dropping: with the control first the
   * three numbers are 560, 560, 560, and the reading the case was built on is
   * gone even though the literals were still wrong in a detectable way.
   *
   * Rather than re-derive three numbers around a floor that now sits over two
   * of them, the discriminating submission is moved **first**, where the floor
   * is provably 0 and can mask nothing, and the control follows it. The
   * stale-timestamp defect makes the projection too *high*, which a floor
   * never hides in any arrangement -- with `payload.tick > this.lastTick` in
   * `baseline` the first number below is 580 rather than 540. That was
   * mutation-checked rather than reasoned about.
   */
  it('re-anchors the clock estimate on a snapshot repeating the tick it already knows', () => {
    transport.emit(ready(0, true)); // running, speed 1
    transport.emit(snapshot(500, 0)); // tick 500 reported at nowMs = 1_000

    // The worker reports the same tick again -- an idle or just-unpaused
    // session does exactly this -- 2s later than the report before it.
    nowMs += 2_000;
    transport.emit(snapshot(500, 0));

    // 1s from the *new* anchor. Re-anchored, that is 20 ticks of elapsed time;
    // with the timestamp left stale it is the whole 3s, i.e. 60.
    nowMs += 1_000;

    sender.submit(PLACE_WALL); // 500 + 20 + 20, and 500 + 60 + 20 when stale

    // The control that makes the assertion non-vacuous, and it has to come
    // after the discriminating order now that the projection is floored:
    // elapsed time really does still move it, so 540 above is a re-anchored
    // projection and not one that ignores the clock.
    nowMs += 2_000; // 3s from the new anchor -> 60 ticks

    sender.submit(PLACE_WALL); // 500 + 60 + 20

    expect(executeTicks()).toEqual([540, 580]);
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

/**
 * Issue #146: the 30-second autosave never fired.
 *
 * `AutosaveScheduler` is purely dirty-driven -- no `markDirty`, no timer, no
 * save -- and nothing in the application called it, so the interval was
 * configured, reached the scheduler, and did nothing. The only automatic save
 * was the best-effort one on `pagehide`, which meant a crash, a force-quit or
 * an OS kill wrote nothing since the last manual save. It also falsified the
 * reasoning the lifecycle save rests on: #92 and `docs/PERSISTENCE.md` justify
 * that save being fire-and-forget *because* an interval autosave is the
 * durability mechanism, and there was no interval autosave.
 *
 * The mechanism was thoroughly tested and the wiring was not, which is the
 * shape #115 and #113 both had. So these assert the seam rather than the
 * scheduler -- the scheduler's coalescing, its trailing edge and its
 * at-most-one-in-flight rule are already proven in
 * `tests/unit/persistence-local-autosave.test.ts` and are not re-tested here.
 *
 * The mutation the issue names -- *"delete `SessionController.markDirty()`
 * entirely"* -- is now killed by `tsc` rather than by a test, which is
 * stronger: `src/main.ts` calls it, so removing it is a compile error in the
 * composition root as well as in the two unit files that always called it
 * directly. Measured: 5 errors across `src/main.ts` and
 * `tests/unit/persistence-session-controller.test.ts`.
 */
describe('an accepted command marks the session dirty (#146)', () => {
  const queuedResult = (commandId: string): WorkerToMainMessage => ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `m-${commandId}`,
    replyTo: 'r-1',
    kind: 'simulation/command-result',
    payload: { commandId, sequence: 0, status: 'queued', scheduledForTick: 20 },
  });

  it('notifies its listener when the simulation accepts a command', () => {
    let marks = 0;
    const sender = new SimulationCommandSender(transport);
    sender.onCommandAccepted(() => { marks += 1; });

    transport.emit(queuedResult('c-1'));
    expect(marks).toBe(1);
  });

  it('says nothing when the simulation refuses one', () => {
    // The distinction the fix turns on: a refused command changed no
    // simulation state, so there is nothing to save and marking the session
    // dirty would schedule a write for a prison that did not move.
    let marks = 0;
    const sender = new SimulationCommandSender(transport);
    sender.onCommandAccepted(() => { marks += 1; });

    transport.emit(rejected());
    expect(marks).toBe(0);
  });

  it('notifies once per acceptance, leaving coalescing to the scheduler', () => {
    // Deliberately *not* de-duplicated here. `AutosaveScheduler` coalesces per
    // prison into one trailing-edge save, so a chatty signal is exactly what it
    // is built for -- and a sender that suppressed repeats would be a second,
    // undocumented coalescing rule competing with the real one.
    let marks = 0;
    const sender = new SimulationCommandSender(transport);
    sender.onCommandAccepted(() => { marks += 1; });

    transport.emit(queuedResult('c-1'));
    transport.emit(queuedResult('c-2'));
    transport.emit(queuedResult('c-3'));
    expect(marks).toBe(3);
  });

  it('is inert with no listener attached, which is a browser without persistence', () => {
    // `src/main.ts` attaches this inside `bootPersistence`, which runs only
    // when a worker started and local storage was reachable. A page that got
    // neither must still send commands rather than throw on every result.
    const sender = new SimulationCommandSender(transport);
    expect(() => transport.emit(queuedResult('c-1'))).not.toThrow();
  });
});
