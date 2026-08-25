import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicStateHash } from '../../src/simulation/determinism/canonical';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { toJsonValue } from '../helpers/determinism-state';

/**
 * Recovering from a malformed message may not change what the simulation
 * computes (#187 finding 1, ADR 0024).
 *
 * Before this, the question could not arise: the worker faulted, stopped its
 * tick loop and computed nothing further, so there was nothing left to
 * diverge. Choosing to *keep running* is what puts a new event inside the
 * worker that owns the kernel -- classifying a message, building a fault
 * envelope, posting it -- and ADR 0009 makes deterministic replay a product
 * guarantee: a seed plus a command stream is the run. If handling garbage
 * touched a sequence, a clock, an id allocator or an iteration order, then a
 * player whose interface sent one bad envelope would silently be playing a
 * different prison from the same save, and only in the running application --
 * never in a headless replay.
 *
 * So this drives **the real worker entry module**, `src/simulation/worker/worker.ts`,
 * which is what `src/main.ts` loads and what the production build emits as
 * `dist/assets/worker-*.js`. Two identical sessions run the same sixty ticks
 * of the same scenario; one of them is also fed a stream of undecodable
 * messages of every classification the decoder can return, interleaved
 * between wakes. The two sessions must end byte-identical.
 *
 * It is deliberately the entry module and not `SimulationWorkerStateMachine`
 * directly: the decision under test is the one argument at
 * `worker.ts`'s `fault(...)` call, and a harness that called `fault` itself
 * would be asserting against its own copy of the thing that could be wrong.
 */

interface WorkerGlobalStub {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: readonly Transferable[]) => void;
  addEventListener: (type: string, listener: unknown) => void;
}

/** Every classification `decodeMainToWorkerMessage` can return, as inputs. */
const UNDECODABLE: readonly unknown[] = [
  null,
  { protocolVersion: SIMULATION_PROTOCOL_VERSION + 1, messageId: 'x-1', kind: 'protocol/ping', payload: {} },
  { protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'x-2', kind: 'simulation/nope', payload: {} },
  { protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'x-3', kind: 'protocol/ping', payload: { nonce: 42 } },
];

class WorkerEntryHarness {
  private constructor(
    private readonly deliver: (data: unknown) => void,
    /** The same array the worker global's `postMessage` stub appends to. */
    public readonly posted: readonly unknown[],
  ) {}

  public static async start(snapshot: SessionSnapshotBundle): Promise<WorkerEntryHarness> {
    const posted: unknown[] = [];
    const stub: WorkerGlobalStub = {
      onmessage: null,
      postMessage: (message) => {
        posted.push(message);
      },
      addEventListener: () => {},
    };
    vi.stubGlobal('self', stub);
    vi.resetModules();
    await import('../../src/simulation/worker/worker');
    const handler = stub.onmessage;
    if (handler === null) throw new Error('the worker entry point installed no onmessage handler');
    const deliver = (data: unknown): void => {
      handler(new MessageEvent('message', { data }));
    };

    deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'initialize-1',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-fault-determinism',
        source: {
          kind: 'snapshot',
          snapshot: {
            transport: 'structured-clone',
            schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
            schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
            data: snapshot as unknown as null,
          },
        },
      },
    });
    const refusal = posted.find(
      (message) => (message as { kind: string }).kind === 'protocol/error',
    ) as { payload: { message: string } } | undefined;
    if (refusal !== undefined) {
      throw new Error(`the worker refused the scenario snapshot: ${refusal.payload.message}`);
    }

    return new WorkerEntryHarness(deliver, posted);
  }

  public run(): void {
    this.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'run-1',
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed: 1 },
    });
  }

  public send(data: unknown): void {
    this.deliver(data);
  }

  /**
   * Stops this worker's tick loop.
   *
   * Two harnesses in one test share a faked clock and a shared timer queue,
   * so a harness left running keeps ticking while the *other* one is being
   * advanced. Pausing the finished one is what makes "the same number of
   * wakes" mean the same thing for both.
   */
  public pause(): void {
    this.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'pause-1',
      kind: 'simulation/set-clock',
      payload: { mode: 'paused' },
    });
  }

  /** One 50 ms step of simulated time per wake, so `wakes` wakes are `wakes` ticks. */
  public advance(wakes: number, onWake?: (wake: number) => void): void {
    for (let wake = 0; wake < wakes; wake += 1) {
      vi.advanceTimersByTime(50);
      onWake?.(wake);
    }
  }

  public snapshot(): SessionSnapshotBundle {
    this.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'snapshot-1',
      kind: 'simulation/request-snapshot',
      payload: { reason: 'consistency-check' },
    });
    const reply = [...this.posted]
      .reverse()
      .find((message) => (message as { kind: string }).kind === 'simulation/snapshot') as
      | { payload: { snapshot: { data: SessionSnapshotBundle } } }
      | undefined;
    if (reply === undefined) throw new Error('the worker returned no snapshot');
    return reply.payload.snapshot.data;
  }

  public faults(): readonly { payload: { code: string; recoverable: boolean } }[] {
    return this.posted.filter(
      (message) => (message as { kind: string }).kind === 'protocol/error',
    ) as readonly { payload: { code: string; recoverable: boolean } }[];
  }
}

function scenarioSnapshot(): SessionSnapshotBundle {
  const runtime = buildDeterminismScenario(SCENARIO_SEED);
  submitScenarioCommands(runtime);
  return captureSessionSnapshot(runtime);
}

const hashOf = (bundle: SessionSnapshotBundle): string => deterministicStateHash(toJsonValue(bundle));

const TICKS = 60;

describe('recovering from a malformed message cannot change the simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reaches a byte-identical session to the same ticks with no malformed message at all', async () => {
    const start = scenarioSnapshot();

    const clean = await WorkerEntryHarness.start(start);
    clean.run();
    clean.advance(TICKS);
    clean.pause();
    const cleanEnd = clean.snapshot();

    const heckled = await WorkerEntryHarness.start(start);
    heckled.run();
    heckled.advance(TICKS, (wake) => {
      // Every classification, several times over, arriving between wakes --
      // which is where a real one arrives, since the worker is single
      // threaded and a message is handled between tick-loop callbacks.
      heckled.send(UNDECODABLE[wake % UNDECODABLE.length]);
    });
    const heckledEnd = heckled.snapshot();

    // Non-vacuous in both directions: the heckled run really was heckled, and
    // both runs really advanced to the same tick.
    expect(heckled.faults()).toHaveLength(TICKS);
    expect(clean.faults()).toHaveLength(0);
    expect(cleanEnd.kernel.tick).toBe(TICKS);
    expect(heckledEnd.kernel.tick).toBe(TICKS);

    expect(hashOf(heckledEnd)).toBe(hashOf(cleanEnd));
    expect(heckledEnd).toEqual(cleanEnd);
  });

  it('is comparing a session that actually advanced, on a hash that actually moves', () => {
    // Guards the assertion above against passing because nothing happened in
    // either run: the scenario has to move the hash over sixty ticks for
    // "the two agree" to be worth anything.
    const start = scenarioSnapshot();
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    for (let tick = 0; tick < TICKS; tick += 1) runtime.kernel.step();
    expect(hashOf(captureSessionSnapshot(runtime))).not.toBe(hashOf(start));
  });

  it('reports every one of those faults as recoverable, and keeps the clock running', async () => {
    const start = scenarioSnapshot();

    const clean = await WorkerEntryHarness.start(start);
    clean.run();
    clean.advance(10);
    clean.pause();
    const advanced = clean.snapshot().kernel.tick;

    const heckled = await WorkerEntryHarness.start(start);
    heckled.run();
    heckled.advance(10, () => heckled.send(null));
    heckled.pause();

    expect(heckled.faults()).toHaveLength(10);
    expect(heckled.faults().every((fault) => fault.payload.recoverable)).toBe(true);
    // The tick loop is the thing an unrecoverable fault stops, and stopping
    // it is what made "one bad message kills the game" true. Compared against
    // the clean run rather than against a literal, because the number of
    // ticks ten wakes buys depends on where the 15 ms wake lands inside the
    // 50 ms step -- and what is being asserted is that the heckled session
    // kept pace, not what the pace is.
    expect(advanced).toBeGreaterThan(0);
    expect(heckled.snapshot().kernel.tick).toBe(advanced);
  });
});
