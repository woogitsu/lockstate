import { describe, expect, it } from 'vitest';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

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
    // makes it a *populated* one. `masterSeed` joined them in #412: it is what
    // says *which run* this is, and since #415 it is also what a stream the
    // bundle does not carry is re-seeded from.
    expect(Object.keys(data).sort()).toEqual(['construction', 'entities', 'identity', 'kernel', 'masterSeed', 'simulation', 'world']);
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

  /**
   * Issue #103: a fault raised while handling a specific request is a
   * response to that request, and the main thread resolves pending requests
   * by `replyTo` alone (`WorkerSessionHost.handleMessage` discards a
   * `protocol/error` without one). An uncorrelated fault therefore left the
   * `initialize` promise pending until its 15 s timeout, and the player was
   * told the worker had not replied rather than that their save was bad.
   *
   * ADR 0003 decision 2 already permits this -- "A protocol fault may
   * optionally identify the rejected request" -- and its 2026-08-23
   * amendment states the rule: "A fault that *was* prompted by a request is
   * free to carry the `replyTo` its schema already permits", while an
   * unsolicited message must not present itself as a request response.
   */
  it('correlates a refused snapshot to the initialize that carried it', () => {
    const { port, machine } = startWorker();
    const snapshot = requestSnapshot(port, machine);

    const corrupt = startWorker({
      kind: 'snapshot',
      snapshot: { ...snapshot, data: { ...snapshot.data, world: { ...snapshot.data.world, chunks: 'not-an-array' } } },
    });

    const fault = corrupt.port.ofKind('protocol/error')[0];
    // `startWorker` sends its initialize with messageId 'init'.
    expect(fault.replyTo).toBe('init');
    expect(fault.payload.code).toBe('snapshot-incompatible');
  });

  it('stays usable after refusing a snapshot, so the next generation can be tried on the same worker', () => {
    const { port, machine } = startWorker();
    const snapshot = requestSnapshot(port, machine);

    const corrupt = startWorker({
      kind: 'snapshot',
      snapshot: { ...snapshot, data: { ...snapshot.data, world: { ...snapshot.data.world, chunks: 'not-an-array' } } },
    });

    // Refusing a snapshot installs no runtime, so the worker is still
    // uninitialized in substance. Reporting it as `faulted` made one bad save
    // cost the whole tab: `handleInitialize` accepts only `uninitialized`, so
    // every later load -- including one from a good generation -- came back as
    // `already-initialized`.
    expect(corrupt.machine.state).toBe('uninitialized');
    expect(corrupt.port.ofKind('protocol/error')[0].payload.recoverable).toBe(true);

    corrupt.machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init-again',
      kind: 'simulation/initialize',
      payload: { sessionId: 'session-2', source: { kind: 'snapshot', snapshot } },
    } as never);

    expect(corrupt.machine.state).toBe('paused');
    expect(corrupt.port.ofKind('simulation/ready')).toHaveLength(1);
    expect(corrupt.port.ofKind('protocol/error')).toHaveLength(1);
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

  /**
   * The alerts log crosses the boundary, and says which side of the save it
   * came from (the owner's decisions 3 and 4 of 2026-09-01 on
   * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)).
   *
   * Driven through a real worker rather than through the log's own methods,
   * because what these two decisions turn on is the *wire*: a restored record
   * has to reach the main thread as a row without reaching the band as an
   * announcement, and a dismissal has to be in the save the next worker starts
   * from.
   */
  describe('the alerts log a save carries', () => {
    /** A prison that has said two things, one of them twice. */
    function prisonWithALog(): ReturnType<typeof captureSessionSnapshot> {
      const runtime = createNewSimulationRuntime(0x0084);
      // Recorded through the producers' own methods, at ticks of their own, so
      // these are the records a session really writes rather than objects
      // shaped like them.
      runtime.events.recordIncidentsAllClear(40);
      runtime.events.recordDischarge(2, 80);
      runtime.events.recordIncidentsAllClear(120);
      return captureSessionSnapshot(runtime);
    }

    function restore(bundle: unknown): ReturnType<typeof startWorker> {
      return startWorker({
        kind: 'snapshot',
        snapshot: JSON.parse(JSON.stringify({
          schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
          schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
          transport: 'structured-clone',
          data: bundle,
        })),
      });
    }

    it('republishes what the save held, before a single tick has run, marked as restored', () => {
      const { port } = restore(prisonWithALog());

      const published = port.ofKind('simulation/event');
      expect(published.map((message) => message.payload.event.sequence), 'every record the save carried, in the order it was recorded').toEqual([1, 2, 3]);
      // The flag is what keeps the events band silent about a tick the player
      // was not looking at, while the list is rebuilt from the same messages.
      expect(published.every((message) => message.payload.restored === true)).toBe(true);
      // A restored session arrives paused, so this had to be published without
      // waiting for the player to press play -- the same reason the first
      // counts readout goes out here.
      expect(port.last().kind).toBe('simulation/event');
    });

    it('publishes nothing for a session that has said nothing', () => {
      const { port } = startWorker();
      expect(port.ofKind('simulation/event')).toEqual([]);
    });

    it('keeps a dismissed row dismissed across the reload that would otherwise bring it back', () => {
      /*
       * The interaction the owner's decisions 3 and 4 have with each other,
       * end to end and through the wire: a row the player retired must not
       * come back on the next load, or the two decisions undo one another.
       *
       * The two all-clears are one row on the player's screen -- the same
       * sentence twice -- so the dismissal names the run that row stands for,
       * ordinals 1 through 3. The discharge between them is a different row
       * and is deliberately inside that range: what must survive is *it*,
       * which is the half a range-only rule would get wrong.
       */
      const first = restore(prisonWithALog());
      const tick = requestSnapshot(first.port, first.machine).data.kernel.tick;
      first.machine.handleMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'cmd-dismiss',
        kind: 'simulation/submit-command',
        payload: {
          commandId: 'dismiss-1',
          sequence: 0,
          // Due now, so a paused worker dispatches it immediately (ADR 0051).
          executeAtTick: tick,
          command: packCommand({ type: 'DismissAlert', fromSequence: 1, throughSequence: 3 }),
        },
      } as never);

      const saved = requestSnapshot(first.port, first.machine);
      expect(saved.data.simulation.alerts.dismissed, 'the two all-clears, and not the discharge between them').toEqual([1, 3]);

      const second = restore(saved.data);
      expect(
        second.port.ofKind('simulation/event').map((message) => message.payload.event.sequence),
        'a row the player dismissed must not be handed back by the load',
      ).toEqual([2]);
    });
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
