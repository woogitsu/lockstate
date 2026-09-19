import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BuildOrder } from '../../src/simulation/construction/build-order';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { SimulationCommandSender } from '../../src/ui/simulation-commands';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';

/**
 * That a player's orders reach the simulation in the order the player gave
 * them, across a pause -- issue #437, decided by
 * [ADR 0056](../../docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md).
 *
 * **The defect this exists for.** `SimulationCommandSender.projectExecuteTick`
 * used to be non-monotonic: it added a twenty-tick lead while the clock ran
 * and returned the bare reported tick while it was paused, so an order given
 * during play and a gesture given in the pause that followed it -- inside that
 * lead -- carried a *higher* sequence at a *lower* tick. The kernel dispatches
 * in ascending `(executeAtTick, sequence)`, so the second one ran first. For
 * twelve of the thirteen gestures that reach the simulation that is invisible,
 * because they commute; for `Undo` and `Redo` it is not, because they count
 * positions in that stream (ADR 0009) and the undo executed before the order
 * it was aimed at existed.
 *
 * `tests/determinism/command-queue-admission.test.ts` is this file's sibling
 * and covers the other half of the same interaction: what the *kernel* admits,
 * and why no refusal was added there. Admission is unchanged by this file --
 * the shape it admits is now simply never submitted.
 *
 * **Driven end to end, because the defect only exists end to end.** The
 * shipped `SimulationCommandSender` talks to the shipped
 * `SimulationWorkerStateMachine`, with a real `Kernel`, a real
 * `FixedStepClock` and the real `ConstructionSystem` inside it. The only
 * doubles are the port and the clock source. The defect is produced by the
 * interaction of the lead, the pause reply and the dispatch comparator, so a
 * hand-built queue cannot show it and cannot guard it.
 *
 * **Every tick below is written out rather than read back from
 * `projectExecuteTick`** (#375). A fixture that asks the code under test what
 * it expects holds for any implementation, including the broken one.
 */

/** A port that loops the worker's output straight back to the main thread's listener. */
class LoopbackPort implements MessagePortLike {
  public readonly outbound: WorkerToMainMessage[] = [];
  private listener: ((message: WorkerToMainMessage) => void) | undefined;

  public postMessage(message: unknown): void {
    const typed = message as WorkerToMainMessage;
    this.outbound.push(typed);
    this.listener?.(typed);
  }

  public attach(listener: (message: WorkerToMainMessage) => void): void {
    this.listener = listener;
  }
}

/** Every `queued` acknowledgement the worker has posted, in order. */
function accepted(port: LoopbackPort): readonly { readonly sequence: number; readonly scheduledForTick: number }[] {
  return port.outbound.flatMap((message) =>
    message.kind === 'simulation/command-result' && message.payload.status === 'queued'
      ? [{ sequence: message.payload.sequence, scheduledForTick: message.payload.scheduledForTick }]
      : [],
  );
}

/** Every refusal the worker has posted, in order. */
function refusals(port: LoopbackPort): readonly string[] {
  return port.outbound.flatMap((message) =>
    message.kind === 'simulation/command-result' && message.payload.status === 'rejected'
      ? [message.payload.fault.message]
      : [],
  );
}

/** The most recent session bundle the worker posted. */
function bundleFrom(port: LoopbackPort): SessionSnapshotBundle {
  for (let index = port.outbound.length - 1; index >= 0; index -= 1) {
    const message = port.outbound[index]!;
    if (message.kind === 'simulation/snapshot') return message.payload.snapshot.data as unknown as SessionSnapshotBundle;
  }
  return expect.unreachable('the worker posted no snapshot');
}

/**
 * One named order's own state, or `'absent'` when the simulation never made
 * it -- which is a distinguishable outcome and not the same as `'cancelled'`.
 *
 * Asserted on the named orders rather than on a count, because a count of
 * cancelled orders is satisfied by cancelling the wrong one, which is the
 * entire defect.
 */
function stateOf(port: LoopbackPort, orderId: string): BuildOrder['state'] | 'absent' {
  return bundleFrom(port).construction.orders.find((order) => order.id === orderId)?.state ?? 'absent';
}

/**
 * Everything the player can still take back, oldest first.
 *
 * `undoStack` alone is not that list. `ConstructionSystem` keeps the newest
 * gesture in a `currentTransaction` buffer and pushes it onto the stack only
 * when a *different* transaction id arrives or when `undo()` itself flushes it
 * (#108, and the field's own docblock) -- so the same history reads as
 * `undoStack: [a], open: [b]` before an undo and as `undoStack: [a, b]`,
 * nothing open, after an undo and a redo. Comparing the composite is what
 * makes "Undo then Redo returns to where it started" a statement about the
 * player's history rather than about which side of that buffer it is sitting
 * on.
 */
function undoHistory(port: LoopbackPort): readonly (readonly string[])[] {
  const { undoStack, currentTransaction } = bundleFrom(port).construction;
  const open = currentTransaction === undefined || currentTransaction.length === 0 ? [] : [[...currentTransaction]];
  return [...undoStack.map((transaction) => [...transaction]), ...open];
}

interface Loop {
  readonly port: LoopbackPort;
  readonly sender: SimulationCommandSender;
  /** Advances real time by `times * 15 ms`, running the worker's tick loop with it. */
  readonly wake: (times: number) => void;
  readonly requestSnapshot: () => void;
  /** Runs the clock long enough for every queued command to have been dispatched, then pauses again. */
  readonly drain: () => void;
}

/** The whole live loop: shipped HUD sender, shipped worker, one port between them. */
function startLoop(from?: SessionSnapshotBundle): Loop {
  vi.useFakeTimers();
  let nowMs = 1_000;
  let requests = 0;

  const port = new LoopbackPort();
  const machine = new SimulationWorkerStateMachine(port, 'monotonicity-test', () => nowMs);
  // No `leadTicks` override: twenty is the lead a player actually gets, and
  // that window is the whole width of what these cases are about.
  const sender = new SimulationCommandSender(
    {
      addListener: (handler: (message: WorkerToMainMessage) => void) => port.attach(handler),
      send: (message: MainToWorkerMessage) => machine.handleMessage(message),
    },
    { now: () => nowMs },
  );

  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'handshake',
    kind: 'protocol/handshake',
    payload: { clientBuildId: 'monotonicity-test', supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION], capabilities: [] },
  });
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'initialize',
    kind: 'simulation/initialize',
    payload: {
      sessionId: 'monotonicity-session',
      source:
        from === undefined
          ? { kind: 'new', masterSeed: 1_234 }
          : {
              kind: 'snapshot',
              snapshot: {
                transport: 'structured-clone',
                schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
                schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
                data: from as unknown as null,
              },
            },
    },
  });
  const refusedInit = port.outbound.find((message) => message.kind === 'protocol/error');
  if (refusedInit !== undefined) expect.unreachable(`the worker refused the session: ${String(refusedInit.payload.message)}`);

  const requestSnapshot = (): void => {
    requests += 1;
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `snapshot-${String(requests)}`,
      kind: 'simulation/request-snapshot',
      payload: { reason: 'consistency-check' },
    });
  };

  const wake = (times: number): void => {
    for (let index = 0; index < times; index += 1) {
      nowMs += 15;
      vi.advanceTimersByTime(15);
    }
  };

  // The sender will not submit until a snapshot has given it a sequence
  // baseline, exactly as in the running app.
  requestSnapshot();
  expect(sender.canSend).toBe(true);

  return {
    port,
    sender,
    wake,
    requestSnapshot,
    drain: () => {
      sender.setClock({ mode: 'running', speed: 1 });
      // 200 wakes is 3 s of real time and 60 kernel ticks at x1 -- comfortably
      // past the twenty-tick lead anything here is given.
      wake(200);
      sender.setClock({ mode: 'paused' });
      requestSnapshot();
    },
  };
}

/**
 * Issue #437's own gesture, verbatim: place `first` while paused, press play,
 * place `second`, pause inside the lead, press Undo.
 *
 * **One correction to the issue's script, and it is load-bearing.** The
 * reproduction filed there submits both build orders with **no**
 * `transactionId`. The shipped HUD never does: `src/main.ts` mints
 * `build-${crypto.randomUUID()}` once per intent, so one drag is one undo step
 * and two presses are two. With no id at all, `registerTransactionOrder`
 * compares `undefined` with `undefined`, finds a match, and joins every order
 * ever placed into a single open transaction -- so a single Undo takes back
 * the whole session. That is a different (and pre-existing, and documented)
 * behaviour of the grouping rule, and folding it into this case would have
 * measured the two together. Each gesture is given its own id here, which is
 * what a player produces.
 */
function placeWall(loop: Loop, orderId: string, x: number, y: number): void {
  loop.sender.submit({
    type: 'PlaceBuildOrder',
    orderId,
    definitionId: 'wall-brick',
    x,
    y,
    transactionId: `gesture-${orderId}`,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('a pause inside the command lead does not reorder what the player did', () => {
  it("undoes the order the player was taking back, not the one before it", () => {
    const loop = startLoop();
    const { port, sender, wake } = loop;

    // Paused at tick 0. The first wall.
    placeWall(loop, 'first', 4, 4);
    // Play, then the second wall -- given while the clock runs, so it carries
    // the lead.
    sender.setClock({ mode: 'running', speed: 1 });
    wake(1);
    placeWall(loop, 'second', 5, 4);
    // Pause inside that lead. `handleSetClock` answers with the kernel's exact
    // tick, which is still 0: one 15 ms wake buys no 50 ms step.
    sender.setClock({ mode: 'paused' });
    // And the gesture the whole issue is about.
    sender.submit({ type: 'Undo' });

    expect(refusals(port)).toEqual([]);

    loop.drain();

    /*
     * What the player sees, asserted first and on the **named orders' own
     * states** -- a count of cancelled orders is satisfied by cancelling the
     * wrong one, which is exactly what happened. Before the fix these two read
     * the other way round: `first` cancelled and `second` alive at
     * `materials-pending`.
     */
    expect(stateOf(port, 'second')).toBe('cancelled');
    expect(stateOf(port, 'first')).not.toBe('cancelled');
    expect(stateOf(port, 'first')).not.toBe('absent');

    /*
     * And the stacks describe what the player did: one gesture left to take
     * back, and the one just taken back on offer to restore.
     *
     * Before the fix, measured on this exact gesture, **both stacks were
     * empty** -- `undoStack: [], redoStack: [], open: ["second"]`. The Undo
     * ran first and consumed `first`; then `second` arrived with a transaction
     * id of its own, and `registerTransactionOrder` clears the redo stack for
     * a new gesture. So the wall the player never asked to remove was gone,
     * a second Undo did nothing, and Redo could not bring it back either.
     *
     * That is one step worse than #437's own report, which shows
     * `redoStack: [["first"]]` -- because that reproduction submitted no
     * transaction ids, so nothing cleared the stack. See `placeWall`.
     */
    const construction = bundleFrom(port).construction;
    expect(construction.undoStack).toEqual([['first']]);
    expect(construction.redoStack).toEqual([['second']]);

    /*
     * Then the mechanism that produced it, with the ticks written out.
     *
     * Before the fix these read 0, 21, **0** -- the Undo backdated behind the
     * wall it was aimed at. The third number is the whole change: the Undo now
     * shares `second`'s tick instead of undercutting it, and the strictly
     * increasing `sequence` breaks the tie in submission order.
     */
    expect(accepted(port)).toEqual([
      { sequence: 0, scheduledForTick: 0 },
      { sequence: 1, scheduledForTick: 21 },
      { sequence: 2, scheduledForTick: 21 },
    ]);
  });

  it('comes back to where the player started when they press Redo after that Undo', () => {
    /*
     * The second half of the acceptance criteria, and it is deliberately run
     * against **#437's own gesture** rather than against a quiet session:
     * after a drain the floor no longer binds, so an Undo/Redo pair taken with
     * the queue empty would pass with or without the fix and guard nothing.
     */
    const loop = startLoop();
    const { port, sender, wake } = loop;

    placeWall(loop, 'first', 4, 4);
    sender.setClock({ mode: 'running', speed: 1 });
    wake(1);
    placeWall(loop, 'second', 5, 4);
    sender.setClock({ mode: 'paused' });
    sender.submit({ type: 'Undo' });
    loop.drain();

    expect(stateOf(port, 'second')).toBe('cancelled');

    sender.submit({ type: 'Redo' });
    loop.drain();

    /*
     * Both walls ordered and nothing taken back -- which is where the player
     * was standing before they pressed Undo, and the only reading of "Redo
     * puts it back" that a player would accept.
     *
     * Before the fix none of it held, and this was measured rather than
     * predicted: after the Undo, `first=cancelled second=materials-pending`
     * with both stacks empty; after the Redo, **exactly the same** -- the redo
     * stack had been cleared by `second` opening a gesture of its own, so the
     * Redo was a no-op and the wrongly cancelled wall could not be recovered
     * by any gesture at all.
     */
    expect(stateOf(port, 'first')).not.toBe('cancelled');
    expect(stateOf(port, 'first')).not.toBe('absent');
    expect(stateOf(port, 'second')).not.toBe('cancelled');
    expect(stateOf(port, 'second')).not.toBe('absent');
    expect(undoHistory(port)).toEqual([['first'], ['second']]);
    expect(bundleFrom(port).construction.redoStack).toEqual([]);
    expect(refusals(port)).toEqual([]);
  });

  it('never projects below the highest tick it has already submitted, across play -> pause -> play -> pause', () => {
    const loop = startLoop();
    const { port, sender, wake } = loop;

    // Paused at tick 0.
    sender.submit({ type: 'Undo' });
    // Play. One 15 ms wake, so the kernel is still on tick 0 and the estimate
    // is 0 + ceil(15/50) + 20.
    sender.setClock({ mode: 'running', speed: 1 });
    wake(1);
    sender.submit({ type: 'Undo' });
    // Pause inside the lead. Without the floor the estimate collapses to the
    // kernel's exact tick, which is 0.
    sender.setClock({ mode: 'paused' });
    sender.submit({ type: 'Undo' });
    // Play again, briefly, and pause again inside the new lead.
    sender.setClock({ mode: 'running', speed: 1 });
    wake(1);
    sender.submit({ type: 'Undo' });
    sender.setClock({ mode: 'paused' });
    sender.submit({ type: 'Undo' });

    expect(refusals(port)).toEqual([]);

    /*
     * Written out, not derived. Before the fix this read
     * `[0, 21, 0, 21, 0]` -- the two paused gestures each collapsing behind
     * the running one ahead of them.
     *
     * The fourth is 21 for the plain reason and not a coincidence: a pause
     * *does* re-baseline the timestamp -- `handleSetClock` replies with a
     * `simulation/clock-state` and `noteTick` stamps it -- so the second play
     * measures its own fresh 15 ms and lands on 0 + ceil(15/50) + 20 again.
     * The kernel never leaves tick 0 in this case, because one 15 ms wake buys
     * no 50 ms step.
     */
    expect(accepted(port).map((command) => command.scheduledForTick)).toEqual([0, 21, 21, 21, 21]);

    // The property itself, so a future change of cadence that moves the
    // literals above still has to keep the thing they are there to show.
    const ticks = accepted(port).map((command) => command.scheduledForTick);
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index]!, `command ${String(index)} was projected behind command ${String(index - 1)}`).toBeGreaterThanOrEqual(ticks[index - 1]!);
    }

    // Non-vacuous the other way too: the floor is a floor and not a freeze.
    // Once the clock has run past it, the estimate leads again.
    loop.drain();
    sender.setClock({ mode: 'running', speed: 1 });
    wake(1);
    sender.submit({ type: 'Undo' });
    const last = accepted(port).at(-1);
    if (last === undefined) return expect.unreachable('the last order should have been acknowledged');
    expect(last.scheduledForTick).toBeGreaterThan(21);
  });

  it('respects a queue it inherited from a save, not only the commands it submitted itself', () => {
    /*
     * The half a sender-side fix is incomplete without, and the case ADR 0020
     * named when it named the floor: *"a restored queue can hold commands
     * ahead of anything that sender has submitted"*. Those commands were
     * issued before the save was written, so the player's first gesture after
     * a load must not overtake them.
     *
     * This repository's own determinism scenario is that shape -- captured at
     * tick 0 with build orders still pending at ticks 30 and 70 -- and a
     * restored session arrives paused at tick 0, which is where the bare
     * projection would have aimed.
     */
    const source = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(source);
    const bundle = captureSessionSnapshot(source);

    const loop = startLoop(bundle);
    const { port, sender } = loop;
    loop.requestSnapshot();

    const loaded = bundleFrom(port).kernel.commands;
    // Non-vacuous: the load really did bring pending commands, and really did
    // bring one well ahead of where the HUD would otherwise aim.
    const highestLoaded = Math.max(...loaded.map((command) => command.executeAtTick));
    expect(highestLoaded).toBe(70);
    expect(bundleFrom(port).kernel.tick).toBe(0);

    sender.submit({ type: 'Undo' });

    expect(refusals(port)).toEqual([]);
    const first = accepted(port).at(-1);
    if (first === undefined) return expect.unreachable('the first order after a load should have been acknowledged');
    // 70, written out: the highest tick the restored queue holds, not the
    // tick 0 the session resumed at.
    expect(first.scheduledForTick).toBe(70);
  });
});
