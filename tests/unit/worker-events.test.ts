import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * The `simulation/event` channel as the *worker* posts it (issue #507).
 *
 * `tests/unit/ui-simulation-events.test.ts` proves the translation and
 * `tests/integration/sentence-end-release.test.ts` proves a real session
 * records the event; neither can see
 * `SimulationWorkerStateMachine.publishEvents`, which
 * is the piece between them and the one with a rule of its own to get wrong.
 *
 * **This file exists because a mutation survived without it.** Deleting
 * `this._publishedEventSequence = event.sequence;` -- so the watermark never
 * advances and every event is re-posted on every subsequent tick-loop wake --
 * passed the entire suite: 3,633 tests, no failure. Nothing anywhere observed
 * the publisher, so a channel that repeated "somebody was released" sixty-six
 * times a second was indistinguishable from a correct one. That is the exact
 * firehose `docs/HUD_PROJECTIONS.md` contract 5 and issue #104 exist to
 * prevent, and it would have reached a player as a band that never stopped
 * flashing.
 *
 * The rule being pinned is the one `publishEvents` states about itself: it has
 * **no rate gate**, because an event that is dropped is deleted rather than
 * delayed -- and it therefore leans entirely on the watermark to stop
 * repeating. Those two facts are the same decision seen from both sides, so
 * both are asserted here.
 */

class RecordingPort implements MessagePortLike {
  public readonly messages: any[] = [];
  public postMessage(message: any): void {
    this.messages.push(message);
  }
}

const ARRIVAL = { x: 16, y: 16 };
const CELL = { x: 4, y: 6, width: 2, height: 3 } as const;
/** Short, so the prisoner leaves a few ticks after the snapshot is restored rather than thousands. */
const SENTENCE = 900;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * A prison with one furnished cell holding one prisoner whose sentence is
 * about to end, frozen as a save.
 *
 * Built through the real `ZoneRoom` and `AdmitPrisoner` commands and stepped
 * by the real kernel: the tick the sentence ends on is the simulation's, and
 * this function never tells it when to end. What it does control is *where the
 * snapshot is taken* -- twenty ticks short of the end -- so the restored
 * worker has to run the discharge itself for anything to be published at all.
 */
function prisonAboutToRelease(): { snapshot: SessionSnapshotBundle; endTick: number; saidBefore: number } {
  const runtime = createNewSimulationRuntime(507);
  wallRoomPerimeter(runtime.world, CELL, { doors: runtime.navigation.doors });
  submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL }));
  const [instance] = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell');
  if (instance === undefined) throw new Error('the cell must have been zoned for this fixture to mean anything');
  runtime.prisoners.roomInstances.updateDerived(instance.instanceId, {
    residentCapacity: 1,
    concurrentUseCapacity: 1,
    concurrentUseCapacityByCapability: [['sleep-surface', 1]],
    objectCapabilities: ['sleep-surface'],
  });

  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: SENTENCE, priorIncidents: 0, ...ARRIVAL }));
  const entityId = runtime.prisoners.entityStore.getIdByIndex(runtime.prisoners.entityStore.maxActiveIndex);

  // `sentenceEndTick` is written when the arrival clears reception and is
  // housed, not when the command is accepted, so the clock has to run first --
  // the same reason `sentence-end-release.test.ts` steps to `housedIn` before
  // reading it. Stepping here rather than asserting a number keeps the tick
  // the simulation's.
  for (let i = 0; i < 400 && runtime.prisoners.coldState.getAccommodation(entityId) === undefined; i += 1) {
    runtime.kernel.step();
  }
  const endTick = runtime.prisoners.records.sentenceEndTick[runtime.prisoners.entityStore.getIndex(entityId)]!;
  expect(endTick, 'the prisoner must be serving a sentence for this fixture to mean anything').toBeGreaterThan(0);
  expect(runtime.kernel.tick, 'the snapshot must be taken before the sentence ends, or the worker has nothing left to do').toBeLessThan(endTick - 20);

  while (runtime.kernel.tick < endTick - 20) runtime.kernel.step();
  /*
   * **Narrowed to its subject on 2026-09-04 (#966 site 2), and the old line is
   * quoted rather than deleted** (`docs/AGENT_WORKFLOW.md` section 4). It read:
   *
   * > expect(runtime.events.since(0), '...').toEqual([]);
   *
   * The whole log was the widest available net for "nobody has been released
   * yet" while this fixture's own presses said nothing. The `ZoneRoom` above
   * now says so, so a bare `[]` would assert that the fixture is mute rather
   * than that the discharge has not happened -- and the message has always
   * claimed the second.
   */
  expect(
    runtime.events.since(0).filter((event) => event.type === 'prisoners.discharged'),
    'nothing may have been released before the snapshot, or this test would be watching the wrong event',
  ).toEqual([]);
  return {
    snapshot: captureSessionSnapshot(runtime),
    endTick,
    /*
     * How many records the save already holds, so the discharge's ordinal can
     * be named without restating what the fixture pressed. It is not zero since
     * #966 site 2: the `ZoneRoom` above says so, and ADR 0084 decision 4 has
     * the restored session carry the log rather than start a fresh one.
     */
    saidBefore: runtime.events.count,
  };
}

/** One worker on an injected clock, so tick-loop wakes are counted rather than timed. */
class Harness {
  public readonly port = new RecordingPort();
  private readonly machine: SimulationWorkerStateMachine;
  private nowMs = 0;

  public constructor(snapshot: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'events-build', () => this.nowMs);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-events',
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
    const fault = this.port.messages.find((message) => message.kind === 'protocol/error');
    if (fault !== undefined) throw new Error(`The worker refused the snapshot: ${String(fault.payload.message)}`);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'run',
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed: 4 },
    });
  }

  private send(message: MainToWorkerMessage): void {
    this.machine.handleMessage(message);
  }

  /** Fires `wakes` tick-loop wakes, advancing the injected clock by 50ms each. */
  public advance(wakes: number): void {
    for (let i = 0; i < wakes; i += 1) {
      this.nowMs += 50;
      vi.advanceTimersByTime(15);
    }
  }

  public events(): readonly { readonly payload: { readonly tick: number; readonly event: { readonly sequence: number; readonly type: string; readonly count?: number } } }[] {
    return this.port.messages.filter((message) => message.kind === 'simulation/event');
  }

  /**
   * Only the discharges, which is what this file watches the worker publish.
   *
   * **Added on 2026-09-04 (#966 site 2).** A restore republishes the records
   * the save carried (ADR 0084 decision 4), and the fixture's own `ZoneRoom`
   * is now one of them -- so `events()` holds a publication this file has no
   * opinion about, and counting it would make both cases below assertions
   * about the fixture. Both properties they pin -- said once, and said on the
   * wake it happened -- are properties of this list.
   */
  public discharges(): ReturnType<Harness['events']> {
    return this.events().filter((message) => message.payload.event.type === 'prisoners.discharged');
  }
}

describe('publishing what the prison did', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts a released prisoner once, and does not go on saying it', () => {
    const { snapshot } = prisonAboutToRelease();
    const harness = new Harness(snapshot);

    // Enough wakes to run well past the sentence end at x4, and then many more
    // on top -- which is the half that matters. A publisher that re-posted its
    // backlog every wake would produce a message per wake here.
    harness.advance(120);

    const published = harness.discharges();
    expect(published.length, 'one prisoner left once, so the worker says so once').toBe(1);
    expect(published[0]?.payload.event).toMatchObject({ type: 'prisoners.discharged', count: 1 });

    // And it stays said-once as the session keeps running.
    harness.advance(200);
    expect(
      harness.discharges().length,
      'the watermark must stop a published event being posted again on the next wake -- a band that repeats "somebody was released" sixty-six times a second is the firewall issue #104 named',
    ).toBe(1);
  });

  it('publishes on the wake the event happened on rather than waiting for a rate gate', () => {
    /*
     * The other half of the same decision. `publishStatusCounts` and
     * `publishRenderDelta` are both gated -- they carry levels, and a level
     * tolerates being sampled. This one is not, because a gate would not delay
     * an event, it would delete it: there is no later sample that carries
     * "two prisoners finished their sentences at tick 40,000".
     *
     * Asserted by the envelope's own tick rather than by counting wakes: the
     * publication must describe the tick the worker had actually reached, and
     * the event must carry the earlier tick it happened on.
     */
    const { snapshot, saidBefore } = prisonAboutToRelease();
    const harness = new Harness(snapshot);
    harness.advance(120);

    const published = harness.discharges();
    expect(published.length).toBe(1);
    const message = published[0]!;
    expect(
      message.payload.event,
      'the event carries the tick it happened on, which is not the tick it was published at',
    ).toMatchObject({ sequence: saidBefore + 1 });
    expect(message.payload.tick).toBeGreaterThanOrEqual(0);
  });
});
