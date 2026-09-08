import { afterEach, describe, test, expect, vi } from 'vitest';
import {
  CLOCK_STATE_PUBLISH_INTERVAL_MS,
  SimulationWorkerStateMachine,
  type MessagePortLike,
} from '../../src/simulation/worker/state-machine';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { packCommand } from '../../src/simulation/protocol/commands';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import {
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
} from '../../src/simulation/economy';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage } from '../../src/simulation/protocol/types';
import { expectOk } from '../helpers/expect-ok';

class MockPort implements MessagePortLike {
  public messages: any[] = [];
  postMessage(message: any): void {
    this.messages.push(message);
  }
}

test('StateMachine transitions from uninitialized to ready', () => {
  const port = new MockPort();
  const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);
  
  expect(machine.state).toBe('uninitialized');
  
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-1',
    kind: 'protocol/handshake',
    payload: {
      clientBuildId: 'test-client',
      supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION],
      capabilities: [],
    }
  });
  
  expect(port.messages.length).toBe(1);
  expect(port.messages[0].kind).toBe('protocol/handshake-accepted');
  
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-2',
    kind: 'simulation/initialize',
    payload: {
      sessionId: 'session-1',
      source: { kind: 'new', masterSeed: 1234 },
    }
  });
  
  expect(machine.state).toBe('paused');
  // Two answers to the initialize, in this order: the correlated
  // `simulation/ready`, and then the first unsolicited status-counts readout
  // -- which a restored session needs before any tick runs, or a prison with a
  // population would sit behind a row of zeros until the player pressed play
  // (issue #104, and `tests/unit/worker-status-counts.test.ts`).
  expect(port.messages.map((message) => message.kind)).toEqual([
    'protocol/handshake-accepted',
    'simulation/ready',
    'simulation/status-counts',
  ]);
  expect(port.messages[1].kind).toBe('simulation/ready');
  // A new session starts stopped at tick zero, and says so. The main thread
  // paints its transport controls and its day counter from this message, so
  // it must report the clock that will actually drive the kernel rather than
  // a literal restated beside it.
  expect(port.messages[1].payload).toEqual({
    sessionId: 'session-1',
    tick: 0,
    clock: { mode: 'paused' },
  });
});

test('StateMachine rejects commands before initialize', () => {
  const port = new MockPort();
  const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);
  
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-1',
    kind: 'simulation/submit-command',
    payload: {
      commandId: 'cmd-1',
      sequence: 0,
      executeAtTick: 5,
      command: {
        transport: 'structured-clone',
        schemaId: 'test',
        schemaVersion: 1,
        data: null,
      },
    }
  });
  
  // **This assertion used to read `expect(machine.state).toBe('faulted')`,
  // and the refusal it describes is unchanged: the command is still rejected,
  // still with `not-initialized`, and still without reaching a kernel.** What
  // changed is what the refusal costs the worker (#680). Spending the worker
  // on a request that touched no simulation state is what made the first
  // "New prison" of a page fail `already-initialized` after any panel had
  // read from the boot worker; `SimulationWorkerStateMachine.fault` documents
  // `recoverable: true` for exactly this condition, and ADR 0024 §1 settled
  // the same argument for the decode path.
  expect(machine.state).toBe('uninitialized');
  expect(port.messages.length).toBe(1);
  expect(port.messages[0].kind).toBe('protocol/error');
  expect(port.messages[0].payload.code).toBe('not-initialized');
  expect(port.messages[0].payload.recoverable).toBe(true);
});

/**
 * Issue #680: a request refused *because there is no simulation yet* must not
 * spend the worker.
 *
 * The page's panel readers are built at boot over the channel, not over a
 * session (#149), so the very first `.ui-tab` press asks the **boot worker**
 * -- the one `SimulationWorkerChannel.claimForSession` hands to the first
 * session -- for a projection it cannot have. Answering that with a
 * non-recoverable fault moved the worker to `faulted`, and `faulted` is not
 * `uninitialized`, so `handleInitialize` then refused the player's first
 * "New prison" with `already-initialized` and the message *"Kernel is already
 * initialized."* -- about a worker that had no kernel and never had one.
 *
 * The rule this asserts is `fault()`'s own: `recoverable` is true "where the
 * fault rejected a request *without* touching simulation state, so leaving the
 * worker unusable would strand the session for a failure it did not cause". A
 * guard that fires *before* any kernel exists cannot have touched one.
 *
 * `tests/integration/session-first-create-after-a-panel-read.test.ts` carries
 * the composition half.
 */
describe('a request refused before there is a simulation (#680)', () => {
  const REFUSED_BEFORE_INITIALIZE: readonly {
    readonly what: string;
    readonly code: string;
    readonly message: MainToWorkerMessage;
  }[] = [
    {
      what: 'a projection read, which is what every tab press fires',
      code: 'not-initialized',
      message: {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'projection-1',
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/prisoner-population' },
      },
    },
    {
      what: 'a snapshot request',
      code: 'not-initialized',
      message: {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'snapshot-1',
        kind: 'simulation/request-snapshot',
        payload: { reason: 'manual-save' },
      },
    },
    {
      what: 'a submitted command',
      code: 'not-initialized',
      message: {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'command-1',
        kind: 'simulation/submit-command',
        payload: {
          commandId: 'cmd-1',
          sequence: 0,
          executeAtTick: 5,
          command: { transport: 'structured-clone', schemaId: 'test', schemaVersion: 1, data: null },
        },
      },
    },
    {
      what: 'a clock control',
      code: 'invalid-state',
      message: {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'clock-1',
        kind: 'simulation/set-clock',
        payload: { mode: 'running', speed: 1 },
      },
    },
  ];

  for (const { what, code, message } of REFUSED_BEFORE_INITIALIZE) {
    test(`${what} is refused, reported as recoverable, and leaves the worker able to start a session`, () => {
      const port = new MockPort();
      const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);

      machine.handleMessage(message);

      expect(port.messages.map((m) => m.kind)).toEqual(['protocol/error']);
      expect(port.messages[0].payload.code).toBe(code);
      // The half that costs the player their first prison: a fault the worker
      // survives, rather than one that spends it.
      expect(port.messages[0].payload.recoverable).toBe(true);
      expect(machine.state).toBe('uninitialized');

      machine.handleMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'init-1',
        kind: 'simulation/initialize',
        payload: { sessionId: 'session-1', source: { kind: 'new', masterSeed: 1234 } },
      });

      expect(machine.state).toBe('paused');
      expect(port.messages[1].kind).toBe('simulation/ready');
    });
  }
});

test('StateMachine handles clock controls', () => {
  const port = new MockPort();
  let time = 0;
  const machine = new SimulationWorkerStateMachine(port, 'test-build', () => time);
  
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-init',
    kind: 'simulation/initialize',
    payload: { sessionId: 's1', source: { kind: 'new', masterSeed: 1 } }
  });
  
  expect(machine.state).toBe('paused');
  
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-run',
    kind: 'simulation/set-clock',
    payload: { mode: 'running', speed: 1 }
  });
  
  expect(machine.state).toBe('running');
  const acknowledgement = port.messages[port.messages.length - 1];
  expect(acknowledgement.kind).toBe('simulation/clock-state');
  expect(acknowledgement.payload.clock).toEqual({ mode: 'running', speed: 1 });
  // The acknowledgement of a request the main thread made, so it is
  // correlated to it (ADR 0003's envelope contract). The main thread's
  // pending-request bookkeeping resolves on `replyTo` and nothing else.
  expect(acknowledgement.replyTo).toBe('msg-run');
});

/**
 * The clock the worker *publishes*, as opposed to the one it acknowledges.
 *
 * Without this the main thread can only learn the tick by asking for a whole
 * session bundle, so the HUD's day counter either stands still while the
 * simulation runs on or gets extrapolated from wall time on the wrong side
 * of the boundary.
 */
describe('publishing the clock while it runs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Initialises a worker whose clock is driven from `now`, not from wall time. */
  function running(): {
    port: MockPort;
    advance: (milliseconds: number) => void;
    pause: () => void;
  } {
    vi.useFakeTimers();
    const port = new MockPort();
    let now = 0;
    const machine = new SimulationWorkerStateMachine(port, 'test-build', () => now);

    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'msg-init',
      kind: 'simulation/initialize',
      payload: { sessionId: 's1', source: { kind: 'new', masterSeed: 7 } },
    });
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'msg-run',
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed: 1 },
    });

    return {
      port,
      advance: (milliseconds: number) => {
        now += milliseconds;
        vi.advanceTimersByTime(15);
      },
      pause: () => {
        machine.handleMessage({
          protocolVersion: SIMULATION_PROTOCOL_VERSION,
          messageId: 'msg-pause',
          kind: 'simulation/set-clock',
          payload: { mode: 'paused' },
        });
      },
    };
  }

  const published = (port: MockPort): any[] =>
    port.messages.filter((message) => message.kind === 'simulation/clock-state' && message.replyTo === undefined);

  test('reports the advancing tick without being asked', () => {
    const { port, advance } = running();
    expect(published(port)).toHaveLength(0);

    // Twelve 50ms steps at x1: twelve ticks over 600ms. The publication
    // interval is 250ms, so the tick is reported at 250ms and again at 500ms.
    for (let step = 0; step < 12; step += 1) advance(50);

    const reports = published(port);
    expect(reports.map((report) => report.payload.tick)).toEqual([5, 10]);
    expect(reports[reports.length - 1].payload.clock).toEqual({ mode: 'running', speed: 1 });
  });

  test('carries no replyTo, so it cannot be mistaken for an answer to a request', () => {
    // ADR 0003: "Unsolicited deltas and domain events do not pretend to be
    // request responses." A fabricated `replyTo` would also resolve whichever
    // pending request on the main thread happened to carry that id.
    const { port, advance } = running();
    for (let step = 0; step < 6; step += 1) advance(50);

    for (const report of published(port)) {
      expect('replyTo' in report).toBe(false);
    }
  });

  test('is a message the main thread will actually accept', () => {
    // The protocol decoder is the gate every worker message passes through.
    // Before this change `simulation/clock-state` required `replyTo`, so an
    // unsolicited one would have been dropped as an invalid payload and the
    // HUD would have gone on showing nothing.
    const { port, advance } = running();
    for (let step = 0; step < 6; step += 1) advance(50);

    const reports = published(port);
    expect(reports.length).toBeGreaterThan(0);
    for (const report of reports) {
      const decoded = decodeWorkerToMainMessage(report);
      expectOk(decoded, `the unsolicited clock-state report at tick ${String(report.payload.tick)}`);
    }
  });

  test('never reports the same tick twice', () => {
    // A report that repeats what the main thread already knows is noise on a
    // boundary that also carries whole session snapshots. A hundred wakes of
    // 10ms is twenty ticks: most wakes have nothing new to say.
    const { port, advance } = running();
    for (let step = 0; step < 100; step += 1) advance(10);

    const ticks = published(port).map((report) => report.payload.tick);
    expect(ticks).toEqual([5, 10, 15, 20]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  test('does not publish on every wake of the tick loop', () => {
    // The loop wakes every 15ms. Publishing each time would put ~66 messages
    // a second on the boundary to move a day counter.
    const { port, advance } = running();
    for (let step = 0; step < 20; step += 1) advance(50); // 20 ticks over 1s.

    const reports = published(port);
    // Written out rather than `Math.ceil(1_000 / CLOCK_STATE_PUBLISH_INTERVAL_MS)`,
    // which recomputed the ceiling from the constant it was bounding, so the
    // ceiling rose by exactly the factor the traffic did (#375). 1,000 ms at a
    // 250 ms interval is four, and four is what the loop produces, so the
    // equality is the bound and it fails in both directions. Measured: the
    // derived form stayed green at `250 -> 50`, twenty reports against a
    // ceiling that had grown to twenty; the two cases above this one caught it.
    expect(CLOCK_STATE_PUBLISH_INTERVAL_MS, 'the bound below is written against a 250 ms interval').toBe(250);
    expect(reports.length).toBe(4);
  });

  test('stops publishing once the clock is paused', () => {
    const { port, advance, pause } = running();
    for (let step = 0; step < 6; step += 1) advance(50);
    expect(published(port).length).toBeGreaterThan(0);

    pause();
    port.messages.length = 0;

    // A minute of wall time with the clock stopped. A paused simulation must
    // cost the boundary nothing, and there is nothing new to say.
    for (let step = 0; step < 60; step += 1) advance(1_000);
    expect(published(port)).toHaveLength(0);
  });
});

test('StateMachine queues valid commands', () => {
  const port = new MockPort();
  const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);
  
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-init',
    kind: 'simulation/initialize',
    payload: { sessionId: 's1', source: { kind: 'new', masterSeed: 1 } }
  });
  
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'msg-cmd',
    kind: 'simulation/submit-command',
    payload: {
      commandId: 'cmd-1',
      sequence: 0,
      executeAtTick: 0,
      command: {
        transport: 'structured-clone',
        schemaId: 'test',
        schemaVersion: 1,
        data: null,
      }
    }
  });
  
  // The last *command result*, not the last message. A command accepted while
  // the clock is paused is now dispatched on the spot, and that publishes a
  // `simulation/status-counts` behind the acknowledgement (ADR 0051), so
  // "the last message" stopped naming the reply. The assertion is unchanged in
  // substance and narrower in what it reads.
  const results = port.messages.filter((message) => message.kind === 'simulation/command-result');
  const response = results[results.length - 1];
  expect(response.kind).toBe('simulation/command-result');
  expect(response.payload.status).toBe('queued');
});

/**
 * Issue #187 finding 2: every kernel refusal reported `invalid-state`, and two
 * members of the twelve-code `ProtocolFaultCode` vocabulary --
 * `duplicate-message` and `sequence-gap` -- were emitted by nothing at all.
 *
 * The issue reads that as needing design work first: *"the classification does
 * not exist yet. The kernel throws a bare `Error`; distinguishing a duplicate
 * command from a sequence gap from a genuine invalid state needs
 * distinguishable kernel error types first. That is the real work."*
 *
 * **The classification did exist.** `Kernel.submitCommand` decided all three
 * cases in three adjacent `if` branches and put the answer in the `Error`
 * message: a rejected gap arrived at the main thread reading
 * `code: 'invalid-state'`, `message: 'Command sequence gap: expected 0, got 1'`
 * -- the distinction present in the prose and absent from the field built to
 * carry it. What was missing was a *type*, not a decision, and the enum already
 * named both outcomes, so no vocabulary question had to be answered either.
 *
 * These three cases are why that is now true rather than argued. They also kill
 * the surviving mutation the issue names -- "change `'invalid-state'` to any
 * other member of `protocolFaultCodeSchema` and the whole suite stays green,
 * because no test reads that code".
 *
 * **What is not asserted here, stated rather than implied.** The mapping's
 * fallback -- an untyped throw from inside a system handler, which must stay
 * `invalid-state` and must not be recovered from the message text -- is not
 * reachable through this seam: the state machine builds its own runtime and
 * registers its own systems, so no test can install a throwing one from
 * outside. The three typed branches above are the whole reachable surface. The
 * fallback is guarded by `commandRejectionFaultCode` having no other return
 * path, which is a reading of four lines and not a test, and it is why
 * `tests/foundation/fault-code-reachability-contract.test.ts` asserts the
 * *vocabulary* rather than trying to drive every producer.
 */
describe('a refused command reports which refusal it was (#187 finding 2)', () => {
  const initialized = (): MockPort => {
    const port = new MockPort();
    const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'msg-init',
      kind: 'simulation/initialize',
      payload: { sessionId: 's1', source: { kind: 'new', masterSeed: 1 } },
    });
    (port as MockPort & { machine?: SimulationWorkerStateMachine }).machine = machine;
    return port;
  };

  const submit = (port: MockPort, sequence: number, executeAtTick: number): void => {
    const machine = (port as MockPort & { machine?: SimulationWorkerStateMachine }).machine!;
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `msg-${sequence}-${executeAtTick}`,
      kind: 'simulation/submit-command',
      payload: {
        commandId: `cmd-${sequence}`,
        sequence,
        executeAtTick,
        command: { transport: 'structured-clone', schemaId: 'test', schemaVersion: 1, data: null },
      },
    });
  };

  /**
   * The last command result, which is not always the last message: an accepted
   * command against a paused clock is dispatched at once and publishes a
   * counts readout after the acknowledgement (ADR 0051). A refusal publishes
   * none -- nothing was dispatched -- so this filter changes nothing for the
   * cases below and stops the helper from depending on that.
   */
  const lastCommandResult = (port: MockPort): any => {
    const results = port.messages.filter((message) => message.kind === 'simulation/command-result');
    return results[results.length - 1];
  };

  const lastFault = (port: MockPort): { code: string; message: string } => {
    const last = lastCommandResult(port);
    expect(last.kind).toBe('simulation/command-result');
    expect(last.payload.status).toBe('rejected');
    return last.payload.fault;
  };

  test('a sequence gap reports sequence-gap', () => {
    const port = initialized();
    // Expected sequence is 0; 1 skips one.
    submit(port, 1, 0);
    const fault = lastFault(port);
    expect(fault.code).toBe('sequence-gap');
    // The message is unchanged by this fix, which is the point: the text always
    // knew, and now the code does too. Asserting both together is what stops a
    // future change from moving the distinction back into the prose.
    expect(fault.message).toContain('Command sequence gap');
  });

  test('a replayed sequence reports duplicate-message', () => {
    const port = initialized();
    submit(port, 0, 0);
    expect(lastCommandResult(port).payload.status).toBe('queued');
    // Sequence 0 again, now that the kernel expects 1.
    submit(port, 0, 0);
    const fault = lastFault(port);
    expect(fault.code).toBe('duplicate-message');
    expect(fault.message).toContain('Duplicate command sequence');
  });

  test('a command aimed at an already-executed tick still reports invalid-state', () => {
    // The third branch, asserted so the mapping is pinned in both directions:
    // `invalid-state` must stay *emitted*. Without this, a change that moved
    // all three refusals onto their own codes would replace two dead enum
    // members with a third and nothing would notice.
    //
    // A fresh session sits at tick 0, so any negative target is behind it --
    // no clock has to run for this branch to be reached, and the sequence is
    // the expected one so the two branches above it do not fire first.
    const port = initialized();
    submit(port, 0, -1);
    expect(lastFault(port).code).toBe('invalid-state');
  });
});

/**
 * The paused drain, at the boundary that owns it (ADR 0051).
 *
 * The behaviour under test is the worker's, not the kernel's, and the split is
 * deliberate: `Kernel.submitCommand` still only queues, and
 * `Kernel.dispatchDueCommands` still only dispatches when it is called. What
 * changed is that `handleSubmitCommand` calls it while the clock is stopped,
 * because nothing else will -- `transition` runs the tick loop only in the
 * `running` state, so before this a command a player gave during a pause was
 * acknowledged and then produced nothing until they pressed play.
 *
 * `tests/browser/app-shell.spec.ts` ("answers an order given while the clock is
 * paused") is the half that shows the player is told; this is the half that
 * shows the simulation was changed, and neither implies the other.
 */
describe('a command submitted against a paused clock', () => {
  const placeWall = (machine: SimulationWorkerStateMachine, sequence: number, tile: number): void => {
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: `place-${String(sequence)}`,
      kind: 'simulation/submit-command',
      payload: {
        commandId: `order-command-${String(sequence)}`,
        sequence,
        // A fresh session sits at tick 0, which is what the HUD projects for a
        // paused clock (`SimulationCommandSender.projectExecuteTick` adds no
        // lead while stopped), so this is a *due* command rather than a
        // contrived one.
        executeAtTick: 0,
        command: packCommand({
          type: 'PlaceBuildOrder',
          orderId: `order-${String(sequence)}`,
          definitionId: 'wall-brick',
          x: tile,
          y: tile,
        }),
      },
    });
  };

  const start = (): { port: MockPort; machine: SimulationWorkerStateMachine } => {
    const port = new MockPort();
    const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: { sessionId: 'paused-session', source: { kind: 'new', masterSeed: 99 } },
    });
    expect(machine.state).toBe('paused');
    return { port, machine };
  };

  /** The construction orders the worker would put in a save right now. */
  const orderStates = (port: MockPort, machine: SimulationWorkerStateMachine): string[] => {
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'snap',
      kind: 'simulation/request-snapshot',
      payload: { reason: 'manual-save' },
    });
    const reply = port.messages[port.messages.length - 1];
    expect(reply.kind).toBe('simulation/snapshot');
    return (reply.payload.snapshot.data.construction.orders as { state: string }[]).map((order) => order.state);
  };

  test('is dispatched immediately, so the order exists before any tick has run', () => {
    const { port, machine } = start();
    placeWall(machine, 0, 5);

    // The kernel is still at tick 0 -- nothing here advanced time -- and the
    // order is nonetheless real and approved. Both halves matter: an order
    // that arrived by way of a tick would be a different fix.
    const snapshotReply = port.messages.filter((message) => message.kind === 'simulation/ready')[0];
    expect(snapshotReply.payload.tick).toBe(0);
    expect(orderStates(port, machine)).toEqual(['approved']);
    // And the command is out of the queue rather than waiting in it, which is
    // what distinguishes "dispatched" from "still acknowledged".
    const snapshot = port.messages[port.messages.length - 1];
    expect(snapshot.payload.snapshot.data.kernel.commands).toEqual([]);
    expect(snapshot.payload.snapshot.data.kernel.tick).toBe(0);
  });

  test('publishes a counts readout the player-facing readouts ride on, even though no count moved', () => {
    const { port, machine } = start();
    const before = port.messages.filter((message) => message.kind === 'simulation/status-counts').length;
    // One baseline, from `handleInitialize`, and nothing else yet.
    expect(before).toBe(1);

    placeWall(machine, 0, 5);

    const after = port.messages.filter((message) => message.kind === 'simulation/status-counts');
    // A build order moves none of the figures this payload carries, so
    // `statusCountsEqual` would have suppressed this publication: the forced
    // event flag is the only reason it exists. It is what `src/main.ts`
    // refreshes the Build panel's queue block on, and while the clock is
    // stopped there is no tick-loop wake behind it to catch the miss.
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].payload.tick).toBe(0);
  });

  /**
   * The paused drain publishes a success sentence too, not only a counts
   * readout (issue #749, found by playing rather than by this file).
   *
   * `createConstructionCommandHandler` writes `construction.order-cancelled`
   * to `SimulationEventLog` on a successful `CancelBuildOrder`, and until this
   * test's production fix, nothing published it while the clock stayed
   * paused: `onTickLoop` is the only caller of `publishEvents()`, and
   * `transition` stops the tick-loop interval for every state but `running`.
   * A player who cancels a queued order -- almost always done while paused,
   * managing a queue -- saw the row vanish and the treasury move, correctly,
   * and never saw the sentence #749 exists to add, until they next pressed
   * Play. Reproduced on the assembled page:
   * `tests/browser/playtest-749-say-it-when-it-works.playtest.ts` act a, run
   * against the unfixed worker, held the band empty for the whole of a 3 s
   * wait and showed the sentence only after Play was pressed.
   *
   * Mutation: comment out the `this.publishEvents()` line this test guards
   * -> 1 failed ("no simulation/event message reached the port before any
   * tick had run") | the rest of this describe block still passed, which is
   * the point: status counts alone do not catch this.
   */
  test('publishes the cancellation sentence immediately too, not only on the next tick-loop wake', () => {
    const { port, machine } = start();
    placeWall(machine, 0, 5);
    const orderId = 'order-0';

    const beforeEvents = port.messages.filter((message) => message.kind === 'simulation/event').length;
    expect(beforeEvents).toBe(0);

    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'cancel-0',
      kind: 'simulation/submit-command',
      payload: {
        commandId: 'cancel-command-0',
        sequence: 1,
        executeAtTick: 0,
        command: packCommand({ type: 'CancelBuildOrder', orderId }),
      },
    });

    // No tick has run -- `orderStates` above establishes that a paused-drain
    // command does not advance `Kernel.tick` -- so a message here is not one
    // that could have ridden a tick-loop wake. It has to be this handler's own
    // publish.
    const events = port.messages.filter((message) => message.kind === 'simulation/event');
    expect(events.length).toBe(1);
    expect(events[0].payload.event.type).toBe('construction.order-cancelled');
    expect(events[0].payload.tick).toBe(0);
  });

  test('answers a run of orders given during one pause, one publication each', () => {
    const { port, machine } = start();
    for (let sequence = 0; sequence < 3; sequence += 1) placeWall(machine, sequence, 5 + sequence);

    expect(orderStates(port, machine)).toEqual(['approved', 'approved', 'approved']);
    // Three presses, three readouts, on top of the one baseline -- the bound
    // this forced publication is argued on is "one per command the player
    // submits", and a run of them is where that bound is worth checking. The
    // 500 ms interval does not suppress them: `performanceNow` is pinned at 0
    // here, so every one of these is inside one window.
    expect(port.messages.filter((message) => message.kind === 'simulation/status-counts').length).toBe(4);
  });

  /**
   * The worker's own refusal of a purchase, at the layer where it stays
   * deterministic.
   *
   * `tests/browser/app-shell.spec.ts` used to drive this through the Build
   * panel by pressing Buy twice against a paused clock: both presses passed
   * `src/main.ts`'s pre-flight because a paused clock had dispatched neither,
   * and `ProcurementSystem` refused the second once the clock ran. The paused
   * drain closes that window -- the first press is paid for at once and the
   * second meets an accurate pre-flight -- so from that panel the refusal is
   * now reachable only inside the twenty-tick lead an order given while the
   * clock *runs* carries, which is a one-second race the browser suite lost
   * when it was tried.
   *
   * Here there is no pre-flight to pre-empt it: the pre-flight lives in the
   * composition root's intent handler, not in the command sender and not in
   * the worker, so two `PurchaseMaterials` submitted straight at this boundary
   * reach `Treasury.spend` exactly as a command from any other producer would
   * -- a queued command in a restored save, or a future one. What this asserts
   * is `ProcurementSystem`'s refusal reaching `RefusalLog` and riding out on
   * `simulation/status-counts`. The *rest* of that route -- the payload
   * becoming a band and an alerts row in the assembled page -- is proven by
   * the refused build order in `tests/browser/app-shell.spec.ts`, which takes
   * the identical path with a different reason id.
   */
  test('publishes the refusal when the treasury cannot cover a purchase dispatched during the pause', () => {
    const { port, machine } = start();
    const unitPrice = procurableMaterial('item.brick')?.unitPriceMinorUnits;
    if (unitPrice === undefined) return expect.unreachable('item.brick is not for sale, so no purchase can be driven');
    /*
     * Half of what the prison can *spend*, plus one unit: affordable once,
     * never twice.
     *
     * **This divided `TREASURY_STARTING_BALANCE_MINOR_UNITS` and that was the
     * whole of spending power** while `Treasury`'s floor was zero. #703 ruling A
     * opens a standing overdraft in every session
     * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
     * §2), so half the opening balance was affordable twice over and the second
     * purchase was not refused at all. The two bounds asserted below are the
     * property the case needs and they are unchanged; only what they are
     * measured against moved.
     */
    const spendable = TREASURY_STARTING_BALANCE_MINOR_UNITS - TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS;
    const quantity = Math.floor(spendable / unitPrice / 2) + 1;
    expect(quantity * unitPrice).toBeLessThanOrEqual(spendable);
    expect(2 * quantity * unitPrice).toBeGreaterThan(spendable);

    const purchase = (sequence: number): void => {
      machine.handleMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: `buy-${String(sequence)}`,
        kind: 'simulation/submit-command',
        payload: {
          commandId: `buy-command-${String(sequence)}`,
          sequence,
          executeAtTick: 0,
          command: packCommand({
            type: 'PurchaseMaterials',
            orderId: `purchase-${String(sequence)}`,
            itemId: 'item.brick',
            quantity,
          }),
        },
      });
    };

    purchase(0);
    const afterFirst = port.messages.filter((message) => message.kind === 'simulation/status-counts').at(-1);
    // The first one was paid for, during the pause, and the readout says so.
    expect(afterFirst.payload.counts.treasuryMinorUnits).toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - quantity * unitPrice,
    );
    expect(afterFirst.payload.refusal).toBeUndefined();

    purchase(1);
    const afterSecond = port.messages.filter((message) => message.kind === 'simulation/status-counts').at(-1);
    // The second could not be, so `ProcurementSystem` refused it and the
    // refusal rode out on the same channel the balance did.
    expect(afterSecond.payload.counts.treasuryMinorUnits).toBe(
      TREASURY_STARTING_BALANCE_MINOR_UNITS - quantity * unitPrice,
    );
    expect(afterSecond.payload.refusal?.reason).toBe('purchase.insufficient-funds');
    // The refusal is what opened the gate: an unchanged balance would have
    // been suppressed by `statusCountsEqual` without it.
    expect(afterSecond).not.toBe(afterFirst);
  });

  test('leaves a command scheduled ahead of the pause alone, which is ADR 0020 decision territory', () => {
    const { port, machine } = start();
    // An order given while the clock was running carries a twenty-tick lead,
    // so it is not due at tick 0 and must stay queued: draining it early would
    // dispatch a command before the tick it names, which is the one thing this
    // change must not do.
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'ahead',
      kind: 'simulation/submit-command',
      payload: {
        commandId: 'order-command-ahead',
        sequence: 0,
        executeAtTick: 20,
        command: packCommand({ type: 'PlaceBuildOrder', orderId: 'order-ahead', definitionId: 'wall-brick', x: 9, y: 9 }),
      },
    });

    expect(orderStates(port, machine)).toEqual([]);
    const snapshot = port.messages[port.messages.length - 1];
    expect(
      (snapshot.payload.snapshot.data.kernel.commands as { executeAtTick: number }[]).map(
        (command) => command.executeAtTick,
      ),
    ).toEqual([20]);
  });
});
