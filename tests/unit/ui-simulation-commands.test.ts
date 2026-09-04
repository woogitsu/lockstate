import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulationSpeed } from '../../src/simulation/clock/fixed-step-clock';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
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

  /**
   * **This case asserted `500 + 160 + 20` until #942, and the third term is
   * the defect it was pinning.** Elapsed time was scaled by the speed and the
   * margin was not, so twenty ticks of tolerance was one second of real time
   * at ×1 and 250 ms at ×4 -- and a main thread that read the worker later
   * than that put every press into the kernel's past. The margin is now
   * converted from real time exactly as elapsed is, which at ×4 is eighty
   * ticks: still one real second, which is what the constant has always
   * claimed to be.
   *
   * Both numbers are literals for the reason the block below the sibling case
   * gives: a value re-derived from `leadTicks` and the speed is the production
   * expression in the test's clothes and agrees with any implementation.
   */
  it('scales the projection and its own margin by the clock speed (#942)', () => {
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

    // 160 ticks of elapsed time, and a margin of 1s of real time, which at x4
    // is 80 ticks of kernel time.
    expect(executeTicks()).toEqual([500 + 160 + 80]);
  });

  // The other half of that statement -- that nothing moved at x1 -- is the
  // case above it, `carries the tick forward by elapsed real time while the
  // clock runs`, whose `500 + 40 + 20` this change leaves untouched. It is
  // what makes the case above a claim about *speed* rather than about the
  // margin having grown.

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

/**
 * Issue #942: a run of presses silently losing some of them.
 *
 * **Measured live at 4×, and it is what these cases exist for:** twenty-five
 * `Admit` presses produced seventeen prisoners with *"The simulation has not
 * reported its command sequence yet; try again in a moment."* in the console
 * seven times, and eight `Hire Guard` presses produced three guards against a
 * treasury of 43,040. The same session pressed twenty times at 400 ms apart at
 * ×1 and got twenty commands, so the controls were never the suspect.
 *
 * ### The two halves of the defect, and why one test cannot show either
 *
 * 1. **The margin was tick-denominated against a wall-clock deadline.** Twenty
 *    ticks is one second of *kernel* time, which is 250 ms of real time at ×4.
 *    Any real time between the tick a worker message reports and the moment
 *    this thread reads it is skew the margin has to cover, and at ×4 it covered
 *    a quarter of what it claimed.
 * 2. **One refusal then disabled every press after it.** A `past-tick`
 *    rejection cleared the sequence baseline, and `submit` throws with no
 *    baseline until a snapshot restates it -- which the render feed brings no
 *    sooner than its thirty-second consistency poll, because it marks itself
 *    dirty on a `queued` result and not on a `rejected` one.
 *
 * **Why the existing cases in this file could not see either.** They drive the
 * sender through a fake transport and an injected clock, so the sender's idea
 * of the tick is whatever the fixture says and no real time ever passes
 * between a report being produced and being read. There is no *worker* in
 * them, so nothing refuses anything, and a fixture that refused would be
 * asserting the cascade against a rejection this repository had authored for
 * itself -- including the fault code the recovery reads, which is the one
 * value that must not come from a double.
 *
 * So these cases run the **shipped `SimulationWorkerStateMachine`**, with a
 * real `Kernel` and a real `FixedStepClock` inside it, over a port that
 * delivers the worker's messages late. The only doubles are the port and the
 * clock source. A change to `COMMAND_REJECTION_FAULT_CODES` in the worker
 * therefore fails here rather than quietly turning the recovery off.
 *
 * **The skew is delivery latency and not elapsed time**, which is the part
 * worth being precise about: `projectFromClock` already carries the anchor
 * forward by however long ago it read it, so a thread that sleeps and then
 * catches up on a backlog is fine. What is not fine is reading a report that
 * was *produced* long before it was read -- a long task that lets a click
 * handler run ahead of the messages queued behind it, or a snapshot whose own
 * deserialisation on this thread is the delay. A port with a latency is
 * exactly that, and it is why these use one rather than a `sleep`.
 */
describe('a run of presses is a run of commands (#942)', () => {
  /**
   * A loopback port that hands the worker's messages to the main thread
   * `latencyMs` after they were posted, and only when the test says so.
   *
   * Nothing here models a *slow worker*: the worker keeps ticking on its own
   * timer throughout. It models a main thread that reads what the worker said
   * later than the worker said it, which is the only condition the defect
   * needs.
   */
  class DelayedPort implements MessagePortLike {
    public readonly outbound: WorkerToMainMessage[] = [];
    public latencyMs = 0;
    private listener: ((message: WorkerToMainMessage) => void) | undefined;
    private readonly held: { readonly message: WorkerToMainMessage; readonly dueAt: number }[] = [];

    public constructor(private readonly clock: () => number) {}

    public postMessage(message: WorkerToMainMessage): void {
      this.outbound.push(message);
      this.held.push({ message, dueAt: this.clock() + this.latencyMs });
    }

    public attach(listener: (message: WorkerToMainMessage) => void): void {
      this.listener = listener;
    }

    /** Delivers everything whose latency has expired, oldest first. */
    public deliver(): void {
      const now = this.clock();
      while (this.held.length > 0 && this.held[0]!.dueAt <= now) {
        this.listener?.(this.held.shift()!.message);
      }
    }

    /**
     * Delivers one held message of a given kind, however old it is, leaving
     * everything else held.
     *
     * This is the case A of the defect: the press runs on an anchor that was
     * produced a while ago, with nothing fresher having been read yet. A
     * `deliver()` of the whole backlog is the *benign* case -- the newest
     * message in it is nearly current -- so a test that flushed could not see
     * this.
     */
    public releaseOne(kind: WorkerToMainMessage['kind']): void {
      const index = this.held.findIndex((entry) => entry.message.kind === kind);
      if (index < 0) return expect.unreachable(`the worker had posted no ${kind} to release`);
      const [entry] = this.held.splice(index, 1);
      this.listener?.(entry!.message);
    }
  }

  /** Every `queued` acknowledgement the worker posted, in order. */
  function accepted(port: DelayedPort): readonly number[] {
    return port.outbound.flatMap((message) =>
      message.kind === 'simulation/command-result' && message.payload.status === 'queued'
        ? [message.payload.sequence]
        : [],
    );
  }

  /** Every refusal the worker posted, as `code: message` so a red test says which. */
  function refusals(port: DelayedPort): readonly string[] {
    return port.outbound.flatMap((message) =>
      message.kind === 'simulation/command-result' && message.payload.status === 'rejected'
        ? [`${message.payload.fault.code}: ${message.payload.fault.message}`]
        : [],
    );
  }

  /** A distinct wall per press, so nothing here is refused for being a repeat. */
  function wall(index: number) {
    return { ...PLACE_WALL, orderId: `order-${String(index)}`, x: 4 + index } as const;
  }

  interface Loop {
    readonly port: DelayedPort;
    readonly sender: SimulationCommandSender;
    /** Advances the shared clock by `times * 15 ms`, running the worker's tick loop with it. */
    readonly wake: (times: number) => void;
  }

  /**
   * The shipped sender talking to the shipped worker over a late port, with
   * the clock already running at `speed` and the sequence already baselined.
   *
   * The 15 ms step is the worker's own tick-loop interval
   * (`SimulationWorkerStateMachine.startTickLoop`), so waking `n` times is
   * `n * 15` ms of real time in which the kernel does whatever it would do.
   */
  function startLoop(options: {
    readonly speed: SimulationSpeed;
    readonly latencyMs: number;
    readonly leadTicks?: number;
  }): Loop {
    vi.useFakeTimers();
    let workerNow = 1_000;
    const port = new DelayedPort(() => workerNow);
    const machine = new SimulationWorkerStateMachine(port, 'lead-margin-test', () => workerNow);
    const sender = new SimulationCommandSender(
      {
        addListener: (handler: (message: WorkerToMainMessage) => void) => port.attach(handler),
        send: (message: MainToWorkerMessage) => machine.handleMessage(message),
      },
      { now: () => workerNow, ...(options.leadTicks === undefined ? {} : { leadTicks: options.leadTicks }) },
    );

    const wake = (times: number): void => {
      for (let index = 0; index < times; index += 1) {
        workerNow += 15;
        vi.advanceTimersByTime(15);
        port.deliver();
      }
    };

    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'handshake',
      kind: 'protocol/handshake',
      payload: {
        clientBuildId: 'lead-margin-test',
        supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION],
        capabilities: [],
      },
    });
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'initialize',
      kind: 'simulation/initialize',
      payload: { sessionId: 'lead-margin-session', source: { kind: 'new', masterSeed: 942 } },
    });
    const refusedInit = port.outbound.find((message) => message.kind === 'protocol/error');
    if (refusedInit !== undefined) expect.unreachable(`the worker refused the session: ${String(refusedInit.payload.message)}`);

    // The session handshake is read promptly, because a stall before the
    // player has a prison is a different (and empty) story. The latency starts
    // with the clock.
    port.deliver();
    port.latencyMs = options.latencyMs;
    sender.setClock({ mode: 'running', speed: options.speed });
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'snapshot-1',
      kind: 'simulation/request-snapshot',
      payload: { reason: 'consistency-check' },
    });

    // Long enough for the late port to have handed over the clock reply and
    // the baseline, and no longer: what the presses run against is an anchor
    // that is `latencyMs` old, which is the state the rest of the run stays in.
    wake(Math.ceil(options.latencyMs / 15) + 4);
    expect(sender.isClockRunning).toBe(true);
    expect(sender.canSend).toBe(true);

    return { port, sender, wake };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The headline reproduction: five presses, spaced as a player spaces them,
   * against a main thread that is 400 ms behind the worker.
   *
   * 400 ms at ×4 is 32 ticks of skew. The margin used to be 20 ticks at every
   * speed, so the first press landed 12 ticks inside the kernel's past; with
   * the margin scaled it is 80 ticks and every press clears it.
   *
   * **What this looked like with the unscaled margin, measured rather than
   * described:** `[] accepted`, five refusals -- one
   * `invalid-state: Cannot schedule command in the past` and four
   * `sequence-gap`, because the presses behind the first one carried numbers
   * the kernel had not reached -- and a sixth press throwing *"The simulation
   * has not reported its command sequence yet"*. That is the cascade, and it
   * is why the assertion is on the *count* of accepted commands rather than on
   * the first one: a run of presses is either a run of commands or it is this.
   */
  it('five presses at x4 all reach the kernel while this thread reads it 400ms late', () => {
    const loop = startLoop({ speed: 4, latencyMs: 400 });

    for (let press = 0; press < 5; press += 1) {
      loop.sender.submit(wall(press));
      loop.wake(7); // ~105 ms between presses
    }

    expect(refusals(loop.port)).toEqual([]);
    expect(accepted(loop.port)).toEqual([0, 1, 2, 3, 4]);
  });

  /**
   * The same run at ×1, which is the control that makes the case above a
   * statement about **speed**.
   *
   * 400 ms at ×1 is 8 ticks of skew, comfortably inside twenty, so this case
   * passes with the margin scaled and passes with it unscaled. A fix that
   * simply enlarged the margin would be indistinguishable from the real one
   * without it -- and this is also the pair the issue asked for: restore the
   * unscaled margin and this stays green while the ×4 case above goes red.
   */
  it('five presses at x1 reach the kernel through the same late port, which they always did', () => {
    const loop = startLoop({ speed: 1, latencyMs: 400 });

    for (let press = 0; press < 5; press += 1) {
      loop.sender.submit(wall(press));
      loop.wake(7);
    }

    expect(refusals(loop.port)).toEqual([]);
    expect(accepted(loop.port)).toEqual([0, 1, 2, 3, 4]);
  });

  /**
   * The second half of the defect, isolated from the first: a press that
   * genuinely *is* refused must not take the presses after it with it.
   *
   * `leadTicks: 0` removes the margin entirely, which makes the refusal
   * certain rather than a matter of timing -- the point of this case is what
   * happens *after* a `past-tick` refusal, and a case that had to provoke one
   * through the margin would be testing both halves at once.
   *
   * The assertion is the reused sequence number, and it is three claims in
   * one. That a command was submitted at all says the baseline survived the
   * refusal (with it dropped, `submit` throws and the worker sees nothing).
   * That its sequence is the *refused* one says the recovery rewound to what
   * the kernel still expects rather than merely staying "synced" at a number
   * one too high -- which the kernel would answer with `sequence-gap`. And
   * that it was `queued` says the kernel agreed.
   */
  it('a refused press leaves the next one working, on the sequence the kernel still expects', () => {
    const loop = startLoop({ speed: 4, latencyMs: 400, leadTicks: 0 });

    loop.sender.submit(wall(0));
    loop.wake(40); // the refusal makes its own late trip back

    // The kernel's own sentence, and the two numbers in it are the defect
    // stated arithmetically: 32 ticks of skew is 400 ms of latency at x4.
    expect(refusals(loop.port)).toEqual([
      'invalid-state: Cannot schedule command in the past: tick 5 < current 37',
    ]);
    expect(loop.sender.canSend).toBe(true);

    // The stall passes: this thread is reading the worker promptly again.
    // Long enough for the backlog posted *during* the stall to come due as
    // well -- the port is a queue, so a report already in it is still late.
    loop.port.latencyMs = 0;
    loop.wake(35);
    loop.sender.submit(wall(1));
    loop.wake(2);

    expect(accepted(loop.port)).toEqual([0]);
  });

  /**
   * The one case in this file that meets the real margin in real time, which
   * is the reason none of the others could have found this (#942 §4).
   *
   * Every other case here and above injects a clock, and the option that lets
   * them says so -- *"Injected so a test is not tied to a real clock"*. That
   * is exactly why they never met the margin: a fixture that decides both when
   * the worker ticked and when the main thread read it can make the skew
   * anything, including nothing. This one lets the worker's own `setInterval`
   * tick against `performance.now()` for a real 600 ms and then hands the
   * sender the snapshot that was captured *before* that 600 ms -- a snapshot
   * arriving late is the ordinary case in the running app, because the reply
   * carries the whole session bundle and this thread has to deserialise it.
   *
   * 600 ms at ×4 is 48 ticks of skew: outside the 20-tick margin this issue
   * found by 28 ticks, and inside the scaled 80-tick margin by 32. Neither
   * bound is close enough for a loaded machine to decide the outcome.
   */
  it('a press at x4 clears a snapshot that took a real 600ms to reach this thread', async () => {
    vi.useRealTimers();
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

    const port = new DelayedPort(() => performance.now());
    const machine = new SimulationWorkerStateMachine(port, 'real-time-margin', () => performance.now());
    const sender = new SimulationCommandSender({
      addListener: (handler: (message: WorkerToMainMessage) => void) => port.attach(handler),
      send: (message: MainToWorkerMessage) => machine.handleMessage(message),
    });

    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'handshake',
      kind: 'protocol/handshake',
      payload: {
        clientBuildId: 'real-time-margin',
        supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION],
        capabilities: [],
      },
    });
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'initialize',
      kind: 'simulation/initialize',
      payload: { sessionId: 'real-time-session', source: { kind: 'new', masterSeed: 942 } },
    });
    port.deliver();
    sender.setClock({ mode: 'running', speed: 4 });

    // A little real play, read promptly, so the sender knows the clock is
    // running and at what speed.
    await sleep(200);
    port.deliver();
    expect(sender.isClockRunning).toBe(true);

    // The snapshot is captured now and read 600 ms from now, with the worker
    // ticking throughout and nothing fresher delivered in between.
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'snapshot-1',
      kind: 'simulation/request-snapshot',
      payload: { reason: 'consistency-check' },
    });
    await sleep(600);
    port.releaseOne('simulation/snapshot');
    expect(sender.canSend).toBe(true);

    sender.submit(wall(0));

    expect(refusals(port)).toEqual([]);
    expect(accepted(port)).toEqual([0]);
  });
});
