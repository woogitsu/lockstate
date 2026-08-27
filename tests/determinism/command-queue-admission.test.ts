import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedStepClock } from '../../src/simulation/clock/fixed-step-clock';
import { Kernel } from '../../src/simulation/kernel/kernel';
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
 * What `Kernel.submitCommand` admits, and why it does not refuse a command
 * scheduled behind one already queued.
 *
 * [ADR 0020](../../docs/adr/0020-deterministic-kernel.md)'s amendment of
 * 2026-08-27 left one question open -- *"the honest options are to correct the
 * sentence, or to make `submitCommand` refuse an `executeAtTick` below the
 * highest already queued so the two orders can never disagree"* -- and its
 * section headed *"`submitCommand` keeps admitting a command scheduled behind one
 * already queued"* closes it: **no refusal is added**. This file
 * is the guard for that decision, because the decision is only defensible if
 * the shape it keeps admitting is one a real player reaches through the real
 * front door, and if refusing it would cost what the ADR says it costs.
 *
 * Both halves are measured here rather than asserted in prose:
 *
 * - the end-to-end case drives the shipped `SimulationCommandSender` against
 *   the shipped `SimulationWorkerStateMachine` -- a real `Kernel` and a real
 *   `FixedStepClock` inside it -- and watches the pause produce a command
 *   whose `sequence` is higher and whose `executeAtTick` is lower than the one
 *   still queued ahead of it;
 * - the paused-run case shows the cost is not one refusal but every refusal
 *   for the length of the pause, because `FixedStepClock.pump` returns `0`
 *   while paused, so nothing drains the command that would be blocking them.
 *
 * The ordering itself -- `(executeAtTick, sequence)`, on submission and on
 * both restore paths -- is pinned by `kernel-system-order.test.ts`; this file
 * is about *admission*, not about order.
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

interface Accepted {
  readonly sequence: number;
  readonly scheduledForTick: number;
}

/** Every `queued` acknowledgement the worker has posted, in order. */
function accepted(port: LoopbackPort): readonly Accepted[] {
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

/** The tick of the worker's most recent unsolicited or correlated tick report. */
function reportedTick(port: LoopbackPort): number {
  for (let index = port.outbound.length - 1; index >= 0; index -= 1) {
    const message = port.outbound[index]!;
    if (message.kind === 'simulation/clock-state' || message.kind === 'simulation/ready') return message.payload.tick;
  }
  return expect.unreachable('the worker reported no tick at all');
}

/** The pending command queue out of the worker's own session snapshot. */
function pendingQueue(port: LoopbackPort): readonly { readonly id: string; readonly sequence: number; readonly executeAtTick: number }[] {
  for (let index = port.outbound.length - 1; index >= 0; index -= 1) {
    const message = port.outbound[index]!;
    if (message.kind !== 'simulation/snapshot') continue;
    const bundle = message.payload.snapshot.data as unknown as SessionSnapshotBundle;
    return bundle.kernel.commands;
  }
  return expect.unreachable('the worker posted no snapshot');
}

/**
 * The whole live loop: the shipped HUD sender talking to the shipped worker
 * state machine over a port that hands the worker's replies straight back.
 * The only doubles are that port and the clock source.
 */
function startLoop(from?: SessionSnapshotBundle): {
  readonly port: LoopbackPort;
  readonly machine: SimulationWorkerStateMachine;
  readonly sender: SimulationCommandSender;
  readonly wake: (times: number) => void;
  readonly requestSnapshot: () => void;
} {
  vi.useFakeTimers();
  let nowMs = 1_000;
  let requests = 0;

  const port = new LoopbackPort();
  const machine = new SimulationWorkerStateMachine(port, 'admission-test', () => nowMs);
  const transport = {
    addListener: (handler: (message: WorkerToMainMessage) => void) => port.attach(handler),
    send: (message: MainToWorkerMessage) => machine.handleMessage(message),
  };
  // No `leadTicks` override: the twenty-tick default is the lead a player
  // actually gets, and it is the whole width of the window these cases are about.
  const sender = new SimulationCommandSender(transport, { now: () => nowMs });

  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'handshake',
    kind: 'protocol/handshake',
    payload: { clientBuildId: 'admission-test', supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION], capabilities: [] },
  });
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'initialize',
    kind: 'simulation/initialize',
    payload: {
      sessionId: 'admission-session',
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

  // The sender will not submit until a snapshot has given it a sequence
  // baseline, exactly as in the running app.
  requestSnapshot();
  expect(sender.canSend).toBe(true);

  return {
    port,
    machine,
    sender,
    requestSnapshot,
    wake: (times: number) => {
      for (let index = 0; index < times; index += 1) {
        nowMs += 15;
        vi.advanceTimersByTime(15);
      }
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the front door admits what a pause actually submits', () => {
  it('takes a paused order scheduled behind one still queued ahead, through the shipped HUD and the shipped worker', () => {
    const { port, sender, wake, requestSnapshot } = startLoop();

    // Play, and let the worker's own tick loop run for two seconds of real time.
    sender.setClock({ mode: 'running', speed: 1 });
    wake(140);
    expect(sender.isClockRunning).toBe(true);

    // The player's first order, given while the clock runs. The HUD projects
    // the worker's tick forward and adds its lead, so this lands in the future.
    sender.submit({ type: 'Undo' });

    // The player pauses. `handleSetClock` answers with the kernel's exact
    // tick, so the HUD's projection collapses onto it -- no lead, because a
    // paused clock cannot have moved.
    sender.setClock({ mode: 'paused' });
    const tickAtPause = reportedTick(port);
    expect(sender.isClockRunning).toBe(false);

    // The player's second order, given during that pause.
    sender.submit({ type: 'Redo' });

    // Nothing was refused: this is the decision, stated against the worker's
    // own acknowledgements rather than against the kernel's internals. Asserted
    // before anything is read out of the acknowledgements, so a build that does
    // refuse reports *its refusal message* rather than a missing element.
    expect(refusals(port)).toEqual([]);

    const [first, second] = accepted(port);
    if (first === undefined || second === undefined) return expect.unreachable('both orders should have been acknowledged');
    // Non-vacuous in both directions. The first order really is in the future
    // relative to the pause, so it really is still queued...
    expect(first.scheduledForTick).toBeGreaterThan(tickAtPause);
    // ...and the paused projection really is the exact current tick.
    expect(second.scheduledForTick).toBe(tickAtPause);
    // Which is the shape the refused-`executeAtTick` guard would have
    // rejected: a later sequence at an earlier tick.
    expect(second.sequence).toBeGreaterThan(first.sequence);
    expect(second.scheduledForTick).toBeLessThan(first.scheduledForTick);

    // And the kernel holds them head-first by tick, not by sequence.
    requestSnapshot();
    expect(pendingQueue(port).map((command) => command.sequence)).toEqual([second.sequence, first.sequence]);
  });

  it('takes the first order after a load, though the loaded queue holds commands seventy ticks out', () => {
    // The restore interaction, and the reason it is not a hypothetical. Every
    // save taken while orders are in flight carries them: this bundle is
    // `buildDeterminismScenario`'s own command list captured at tick 0, with
    // build orders still pending at ticks 30 and 70. `Kernel.restore` puts them
    // straight into the queue -- "Bypassing submitCommand validation as this is
    // a restore from valid state" -- so the player's very next order meets a
    // queue whose highest tick is far ahead of the tick the HUD projects.
    const source = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(source);
    const bundle = captureSessionSnapshot(source);

    const { port, sender, requestSnapshot } = startLoop(bundle);
    requestSnapshot();
    const loadedQueue = pendingQueue(port);
    // Non-vacuous: the load really did bring pending commands, and really did
    // bring one well ahead of where the HUD is about to aim.
    const highestLoaded = Math.max(...loadedQueue.map((command) => command.executeAtTick));
    expect(loadedQueue.length).toBeGreaterThan(0);
    expect(highestLoaded).toBeGreaterThanOrEqual(70);

    // A restored session arrives paused, so this is the first thing a player
    // can do with it.
    sender.submit({ type: 'Undo' });

    expect(refusals(port)).toEqual([]);
    const [order] = accepted(port);
    if (order === undefined) return expect.unreachable('the first order after a load should have been acknowledged');
    expect(order.scheduledForTick).toBeLessThan(highestLoaded);
    // And it resumed the saved count rather than restarting at zero.
    expect(order.sequence).toBe(loadedQueue.length);
  });

  it('a pause admits a whole run of them, because a paused clock drains nothing', () => {
    // The cost of refusing is not one refusal. While the clock is paused the
    // worker runs no tick, so the command queued ahead never leaves the queue
    // and never stops being the highest tick in it -- every further order the
    // player gives during that pause would meet the same refusal.
    const paused = new FixedStepClock(50, { mode: 'paused' });
    paused.pump(0, 5);
    expect(paused.pump(60_000, 5)).toBe(0);

    const log: string[] = [];
    const kernel = new Kernel();
    kernel.setCommandHandler((command) => log.push(command.id));

    // One order given while running, twenty ticks ahead.
    kernel.submitCommand('running-order', 0, 20, null);
    // Then five given during the pause that follows, all at the current tick.
    for (let index = 0; index < 5; index += 1) {
      kernel.submitCommand(`paused-order-${String(index)}`, index + 1, 0, null);
    }

    // The first step after play dispatches all five, in the order the player
    // gave them, and the running order keeps its own tick.
    kernel.step();
    expect(log).toEqual(['paused-order-0', 'paused-order-1', 'paused-order-2', 'paused-order-3', 'paused-order-4']);
    for (let step = 0; step < 20; step += 1) kernel.step();
    expect(log.at(-1)).toBe('running-order');
    expect(kernel.snapshot().commands).toEqual([]);
  });

  it('refusing at the front door would not make dispatch order equal sequence order anyway, because both restore paths admit the shape', () => {
    // This is why the ADR's two options were never symmetric. A guard on
    // `submitCommand` cannot establish the invariant the guard is *for*:
    // `Kernel.restore` says outright that it bypasses the validation, and the
    // save boundary validates `tick` and each `executeAtTick` as independent
    // non-negative integers and never their relation
    // (`src/persistence/save-schema.ts`, `kernelSnapshotSchema`). So no
    // downstream reader could rely on the guard, and ADR 0020's sentence would
    // still have been false for a restored session.
    const disagreeing = {
      tick: 0,
      expectedSequence: 2,
      rngStates: [],
      commands: [
        { id: 'earlier-sequence-later-tick', sequence: 0, executeAtTick: 7, payload: null },
        { id: 'later-sequence-earlier-tick', sequence: 1, executeAtTick: 0, payload: null },
      ],
    };

    const viaInstance: string[] = [];
    const instance = new Kernel();
    instance.setCommandHandler((command) => viaInstance.push(command.id));
    instance.restoreState(disagreeing);

    const viaStatic: string[] = [];
    const built = Kernel.restore(disagreeing, [], (command) => viaStatic.push(command.id));

    for (let step = 0; step < 8; step += 1) {
      instance.step();
      built.step();
    }

    expect(viaInstance).toEqual(['later-sequence-earlier-tick', 'earlier-sequence-later-tick']);
    expect(viaStatic).toEqual(viaInstance);
  });
});
