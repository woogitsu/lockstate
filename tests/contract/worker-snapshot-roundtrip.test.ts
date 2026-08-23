import { describe, expect, it } from 'vitest';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';

class MockPort implements MessagePortLike {
  public messages: any[] = [];
  public postMessage(message: any): void {
    this.messages.push(message);
  }
  public last(): any {
    return this.messages[this.messages.length - 1];
  }
  public ofKind(kind: string): any[] {
    return this.messages.filter((message) => message.kind === kind);
  }
}

function startWorker(source: unknown = { kind: 'new', masterSeed: 1234 }): { port: MockPort; machine: SimulationWorkerStateMachine } {
  const port = new MockPort();
  const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'init',
    kind: 'simulation/initialize',
    payload: { sessionId: 'session-1', source },
  } as never);
  return { port, machine };
}

function requestSnapshot(port: MockPort, machine: SimulationWorkerStateMachine): any {
  machine.handleMessage({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'snap',
    kind: 'simulation/request-snapshot',
    payload: { reason: 'manual-save' },
  } as never);
  const reply = port.last();
  expect(reply.kind).toBe('simulation/snapshot');
  return reply.payload.snapshot;
}

/**
 * ADR 0003: "Saving is represented by a snapshot request and correlated
 * snapshot response", and later issues must use the protocol "rather than
 * bypassing it". These tests pin that contract at the worker boundary
 * itself -- independent of Phaser, IndexedDB or a real `Worker`, per
 * docs/TESTING.md's "worker protocol tests ... independently of Phaser".
 */
describe('worker snapshot protocol: the only way persisted state leaves the simulation', () => {
  it('a snapshot reply correlates to its request and carries the versioned session bundle', () => {
    const { port, machine } = startWorker();
    const snapshot = requestSnapshot(port, machine);

    expect(port.last().replyTo).toBe('snap');
    expect(snapshot.schemaId).toBe(SESSION_SNAPSHOT_SCHEMA_ID);
    expect(snapshot.schemaVersion).toBe(SESSION_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.transport).toBe('structured-clone');
  });

  it('the bundle carries the full save payload, not just the kernel', () => {
    const { port, machine } = startWorker();
    const { data } = requestSnapshot(port, machine);

    // The kernel alone is not a save -- world and construction are what make
    // a restored prison an actual prison, and since #70 `simulation` is what
    // makes it a *populated* one.
    expect(Object.keys(data).sort()).toEqual(['construction', 'entities', 'kernel', 'simulation', 'world']);
    expect(data.kernel.rngStates.length).toBeGreaterThan(0);
    expect(data.world.chunks.length).toBeGreaterThan(0);
    expect(data.construction).toHaveProperty('orders');
  });

  it('is structured-clone safe: the bundle survives a JSON round trip unchanged', () => {
    const { port, machine } = startWorker();
    const { data } = requestSnapshot(port, machine);
    // Typed arrays would silently degrade crossing a real worker boundary;
    // asserting JSON-stability catches that here rather than in production.
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it('round-trips a live simulation into a second worker, pending command queue included', () => {
    const first = startWorker();
    // Queued for a future tick, so it is still pending at snapshot time --
    // an in-flight command queue is exactly the state a naive kernel-only
    // save would drop on the floor.
    first.machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'cmd',
      kind: 'simulation/submit-command',
      payload: { commandId: 'build-1', sequence: 0, executeAtTick: 500, command: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-1', definitionId: 'wall-brick', x: 1, y: 1 }) },
    } as never);

    const snapshot = requestSnapshot(first.port, first.machine);
    expect(snapshot.data.kernel.commands).toHaveLength(1);

    // A genuinely separate worker instance, initialized from that snapshot
    // after a JSON round trip (what crossing a real worker boundary does).
    const second = startWorker({ kind: 'snapshot', snapshot: JSON.parse(JSON.stringify(snapshot)) });
    expect(second.machine.state).toBe('paused');
    expect(second.port.ofKind('protocol/error')).toHaveLength(0);

    const restored = requestSnapshot(second.port, second.machine);
    expect(restored.data.kernel.tick).toBe(snapshot.data.kernel.tick);
    expect(restored.data.kernel.commands).toEqual(snapshot.data.kernel.commands);
    expect(restored.data.kernel.rngStates).toEqual(snapshot.data.kernel.rngStates);
    expect(restored.data.construction.orders).toEqual(snapshot.data.construction.orders);
    expect(restored.data.world.chunks).toEqual(snapshot.data.world.chunks);
  });

  it('faults rather than restoring a snapshot schema this build does not understand', () => {
    const { port, machine } = startWorker();
    const snapshot = requestSnapshot(port, machine);

    const future = startWorker({ kind: 'snapshot', snapshot: { ...snapshot, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION + 1 } });
    const faults = future.port.ofKind('protocol/error');
    expect(faults).toHaveLength(1);
    expect(faults[0].payload.code).toBe('snapshot-incompatible');
    expect(future.machine.state).not.toBe('paused');
  });

  it('faults rather than restoring a structurally corrupt snapshot', () => {
    const { port, machine } = startWorker();
    const snapshot = requestSnapshot(port, machine);

    const corrupt = startWorker({
      kind: 'snapshot',
      snapshot: { ...snapshot, data: { ...snapshot.data, world: { ...snapshot.data.world, chunks: 'not-an-array' } } },
    });
    const faults = corrupt.port.ofKind('protocol/error');
    expect(faults).toHaveLength(1);
    expect(faults[0].payload.code).toBe('snapshot-incompatible');
  });

  it('refuses to snapshot before the simulation is initialized', () => {
    const port = new MockPort();
    const machine = new SimulationWorkerStateMachine(port, 'test-build', () => 0);
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'snap',
      kind: 'simulation/request-snapshot',
      payload: { reason: 'manual-save' },
    } as never);

    expect(port.ofKind('protocol/error')[0].payload.code).toBe('not-initialized');
  });

  it('honours the master seed from the initialize message, so the same seed reproduces the same RNG state', () => {
    const a = startWorker({ kind: 'new', masterSeed: 4242 });
    const b = startWorker({ kind: 'new', masterSeed: 4242 });
    const c = startWorker({ kind: 'new', masterSeed: 9999 });

    const rngOf = (w: ReturnType<typeof startWorker>) => requestSnapshot(w.port, w.machine).data.kernel.rngStates;

    expect(rngOf(b)).toEqual(rngOf(a));
    expect(rngOf(c)).not.toEqual(rngOf(a));
  });
});
