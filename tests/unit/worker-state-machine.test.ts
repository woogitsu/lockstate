import { test, expect, vi } from 'vitest';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
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
  expect(port.messages.length).toBe(2);
  expect(port.messages[1].kind).toBe('simulation/ready');
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
  expect(port.messages[port.messages.length - 1].kind).toBe('simulation/clock-state');
  expect(port.messages[port.messages.length - 1].payload.clock.mode).toBe('running');
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
