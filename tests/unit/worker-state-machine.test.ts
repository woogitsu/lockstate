import { afterEach, describe, test, expect, vi } from 'vitest';
import {
  CLOCK_STATE_PUBLISH_INTERVAL_MS,
  SimulationWorkerStateMachine,
  type MessagePortLike,
} from '../../src/simulation/worker/state-machine';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';

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
  
  expect(machine.state).toBe('faulted');
  expect(port.messages.length).toBe(1);
  expect(port.messages[0].kind).toBe('protocol/error');
  expect(port.messages[0].payload.code).toBe('not-initialized');
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
      expect(decoded.ok, decoded.ok ? '' : JSON.stringify(decoded.error)).toBe(true);
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
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.length).toBeLessThanOrEqual(Math.ceil(1_000 / CLOCK_STATE_PUBLISH_INTERVAL_MS));
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
  
  const response = port.messages[port.messages.length - 1];
  expect(response.kind).toBe('simulation/command-result');
  expect(response.payload.status).toBe('queued');
});
