import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { collectProtocolTransferables } from '../../src/simulation/protocol/transferables';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  MAIN_TO_WORKER_MESSAGE_KINDS,
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  RENDER_DELTA_PUBLISH_INTERVAL_MS,
  SimulationWorkerStateMachine,
  type MessagePortLike,
} from '../../src/simulation/worker/state-machine';
import { buildDeterminismScenario, SCENARIO_SEED } from '../helpers/determinism-scenario';
import { createWalkReading, LOCOMOTION_SUBTILE_UNITS } from '../../src/simulation/locomotion';
import {
  packRenderActorFields,
  RENDER_ACTOR_POPULATION_GUARD,
  RENDER_ACTOR_POPULATION_PRISONER,
} from '../../src/simulation/protocol/render-actors-payload';
import { readRenderActorsPayload, type ReadRenderActorRecord } from '../helpers/render-actors-reader';
import { decodeRenderActorsPayload } from '../../src/simulation/protocol/render-actors-payload';
import { actorsFromDelta } from '../../src/rendering/feed/actors-from-delta';
import { expectOk } from '../helpers/expect-ok';

/**
 * The worker's half of ADR 0040 slice 1: when a `simulation/delta` goes out,
 * when it does not, and what it says.
 *
 * The payload's *layout* is `tests/unit/render-delta-payload.test.ts`; this
 * file is about the publication -- the ceiling, the skip, the `baseTick` chain
 * and the transfer -- and about the one thing only the real state machine can
 * show, which is that the bytes on the wire describe the prison the kernel
 * actually holds. Every payload assertion goes through the hand-written reader
 * for the reason that file gives.
 */

class RecordingPort implements MessagePortLike {
  public readonly messages: WorkerToMainMessage[] = [];
  public readonly transfers: (Transferable[] | undefined)[] = [];
  public postMessage(message: WorkerToMainMessage, transfer?: Transferable[]): void {
    this.messages.push(message);
    this.transfers.push(transfer);
  }
}

type DeltaMessage = Extract<WorkerToMainMessage, { kind: 'simulation/delta' }>;

class Harness {
  public readonly port = new RecordingPort();
  public readonly machine: SimulationWorkerStateMachine;
  public nowMs = 0;

  /**
   * A worker hosting either a fresh session or one restored from `snapshot`.
   *
   * The populated case is restored from a bundle the *test* still holds the
   * live runtime for, which is what lets the payload be compared against a
   * simulation this file did not describe twice.
   */
  public constructor(snapshot?: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'render-delta-test', () => this.nowMs);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-render-delta',
        source:
          snapshot === undefined
            ? { kind: 'new', masterSeed: 3 }
            : {
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
    if (fault !== undefined) throw new Error(`The worker refused the snapshot: ${JSON.stringify(fault.payload)}`);
  }

  public send(message: MainToWorkerMessage): void {
    this.machine.handleMessage(message);
  }

  public run(): void {
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'run',
      kind: 'simulation/set-clock',
      payload: { mode: 'running', speed: 1 },
    });
  }

  /** One wake of the real tick loop, `millisecondsPerWake` of wall clock later. */
  public wake(millisecondsPerWake: number): void {
    this.nowMs += millisecondsPerWake;
    vi.advanceTimersByTime(15);
  }

  public deltas(): readonly DeltaMessage[] {
    return this.port.messages.filter((message): message is DeltaMessage => message.kind === 'simulation/delta');
  }
}

/** The live prisoners of the scenario the worker below is restored from. */
/**
 * What the scenario's own store says its actors are, in the payload's units.
 *
 * The sub-tile position and the velocity come from `LocomotionStore` since ADR
 * 0059, so this reads it too -- against the store rather than against a list
 * written here, which is the property that makes the comparison below worth
 * making.
 */
function scenarioActors(runtime: SimulationRuntime): readonly ReadRenderActorRecord[] {
  const { entityStore, position, locomotion } = runtime.prisoners;
  const actors: ReadRenderActorRecord[] = [];
  const reading = createWalkReading();
  for (let index = 0; index <= entityStore.maxActiveIndex; index += 1) {
    if (!entityStore.isIndexAlive(index)) continue;
    locomotion.read(index, position.tileX[index]!, position.tileY[index]!, reading);
    actors.push({
      entityId: entityStore.getIdByIndex(index),
      packedFields: packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER, reading.headingX, reading.headingY),
      subX: reading.subX,
      subY: reading.subY,
      velocitySubX: reading.velocitySubX * TICKS_PER_WALL_SECOND,
      velocitySubY: reading.velocitySubY * TICKS_PER_WALL_SECOND,
    });
  }
  // Guards, after every prisoner: `encodeRenderActorsKeyframe` writes the
  // prisoner pass then the guard pass (ADR 0040 slice 2). Since ADR 0088 a
  // guard has its own `LocomotionStore` on `GuardRoster.locomotion`, read the
  // same way the prisoner one is above.
  for (const guardId of runtime.securityGuards.allGuardIds()) {
    const tile = runtime.securityGuards.getTile(guardId);
    runtime.securityGuards.locomotion.read(guardId, tile.x, tile.y, reading);
    actors.push({
      entityId: guardId,
      packedFields: packRenderActorFields(RENDER_ACTOR_POPULATION_GUARD, reading.headingX, reading.headingY, runtime.incidentResponseSystem.claimedGuardIds().includes(guardId), runtime.searchSystem.claimedGuardIds().includes(guardId)),
      subX: reading.subX,
      subY: reading.subY,
      velocitySubX: reading.velocitySubX * TICKS_PER_WALL_SECOND,
      velocitySubY: reading.velocitySubY * TICKS_PER_WALL_SECOND,
    });
  }
  return actors;
}

/** The kernel's 50 ms step at speed 1, which is what the harness runs at. */
const TICKS_PER_WALL_SECOND = 20;

describe('the worker publishes a render delta', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says where the prisoners the kernel holds actually are', () => {
    const scenario = buildDeterminismScenario(SCENARIO_SEED);
    const harness = new Harness(captureSessionSnapshot(scenario));
    harness.run();
    harness.wake(RENDER_DELTA_PUBLISH_INTERVAL_MS);

    const [delta] = harness.deltas();
    expect(delta).toBeDefined();
    const read = readRenderActorsPayload(delta!.payload.delta.data as ArrayBuffer);

    // Against the scenario's own store rather than against a list written here
    // -- the payload has to describe a simulation, and the simulation is the
    // only honest authority for what it holds.
    // The restored worker may claim a guard for a search during its first
    // step; this assertion is about positions, not the live duty flag.
    expect(read.records.map((record) => ({ ...record, packedFields: record.packedFields & ~(1 << 13) })))
      .toEqual(scenarioActors(scenario).map((record) => ({ ...record, packedFields: record.packedFields & ~(1 << 13) })));
    expect(read.records.some((record) => (record.packedFields & (1 << 13)) !== 0)).toBe(true);
    const drawnActors = actorsFromDelta(decodeRenderActorsPayload(delta!.payload.delta.data as ArrayBuffer));
    expect(drawnActors.filter((actor) => actor.assetId === 'actor.guard.search')).toHaveLength(1);

    // And a literal, so the comparison above cannot be satisfied by two empty
    // sets or by the same wrong tile read twice. `buildDeterminismScenario`
    // admits four prisoners, at these origins, and hires five guards
    // (`tests/helpers/determinism-scenario.ts`) who stay unassigned at the
    // origin for this harness's short run -- ADR 0040 slice 2 puts them on the
    // same keyframe, after every prisoner.
    expect(read.recordCount).toBe(9);
    // In sub-tile units, which is what layout 2 carries.
    expect(read.records.map((record) => [record.subX / LOCOMOTION_SUBTILE_UNITS, record.subY / LOCOMOTION_SUBTILE_UNITS])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    // The population byte tells the two apart on the wire, since their tiles
    // alone would not: the low byte is 0 (prisoner) for the first four records
    // and 1 (guard) for the five that follow.
    expect(read.records.map((record) => record.packedFields & 0xff)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it('sends an envelope that the main thread decoder accepts', () => {
    const harness = new Harness();
    harness.run();
    harness.wake(RENDER_DELTA_PUBLISH_INTERVAL_MS);

    const [delta] = harness.deltas();
    expect(delta).toBeDefined();
    const decoded = decodeWorkerToMainMessage(delta!);
    expectOk(decoded, 'the first render-delta envelope the worker published');

    // A publication, not a reply. `deltaMessageSchema` is built from
    // `requestEnvelopeFields` and is `.strict()`, so a `replyTo` would be
    // refused outright -- ADR 0003's 2026-08-24 amendment.
    expect(Object.hasOwn(delta!, 'replyTo')).toBe(false);
    expect(delta!.payload.delta.transport).toBe('array-buffer');
    expect(delta!.payload.delta.schemaId).toBe('lockstate.render-actors');
    // 2 since ADR 0059 added a sub-tile position, a velocity and a heading to
    // the record, 3 since ADR 0099 added the drawn world's marker as a fifth
    // header word; the envelope, the transport and the content type are
    // untouched by both, which is the point of versioning the read model
    // inside the payload (ADR 0003 decision 5).
    // 4 since ADR 0097's per-room condition block joined this payload; the
    // envelope's own `SIMULATION_PROTOCOL_VERSION` is untouched by it, which
    // is the property versioning the read model inside the payload buys.
    expect(delta!.payload.delta.schemaVersion).toBe(6);
    if (delta!.payload.delta.transport !== 'array-buffer') throw new Error('unreachable');
    expect(delta!.payload.delta.contentType).toBe('application/x-lockstate-render-actors');
    expect(delta!.payload.delta.byteLength).toBe(delta!.payload.delta.data.byteLength);
  });

  it('hands the buffer to the transfer list rather than copying it', () => {
    const harness = new Harness();
    harness.run();
    harness.wake(RENDER_DELTA_PUBLISH_INTERVAL_MS);

    const index = harness.port.messages.findIndex((message) => message.kind === 'simulation/delta');
    expect(index).toBeGreaterThanOrEqual(0);
    const delta = harness.port.messages[index] as DeltaMessage;
    if (delta.payload.delta.transport !== 'array-buffer') throw new Error('unreachable');
    expect(harness.port.transfers[index]).toEqual([delta.payload.delta.data]);
    // Exactly the payload's buffer and nothing else -- the property
    // `collectProtocolTransferables` has been able to state since the
    // protocol's first commit with nothing ever asking it.
    expect(collectProtocolTransferables(delta)).toEqual([delta.payload.delta.data]);
  });

  it('chains baseTick to the previous publication, so no message can be applied out of order', () => {
    const harness = new Harness();
    harness.run();
    for (let wake = 0; wake < 6; wake += 1) harness.wake(RENDER_DELTA_PUBLISH_INTERVAL_MS);

    const deltas = harness.deltas();
    expect(deltas.length).toBeGreaterThan(2);
    // The first is measured against tick 0, which is the base a session starts
    // at and the reason a keyframe cannot be expressed at tick 0 at all.
    expect(deltas[0]!.payload.baseTick).toBe(0);
    for (let index = 0; index < deltas.length; index += 1) {
      expect(deltas[index]!.payload.tick).toBeGreaterThan(deltas[index]!.payload.baseTick);
      if (index > 0) expect(deltas[index]!.payload.baseTick).toBe(deltas[index - 1]!.payload.tick);
    }
  });

  it('holds to a one-hundred-millisecond ceiling', () => {
    /*
     * The figure as a literal, not as the module's own constant: importing it
     * for the comparison would make the assertion true of any cadence it holds,
     * including one message per wake. The tick loop wakes every 15 ms, so a
     * channel with no ceiling would put a population-sized buffer on the
     * boundary ~66 times a second.
     */
    expect(RENDER_DELTA_PUBLISH_INTERVAL_MS).toBe(100);

    const harness = new Harness();
    harness.run();
    // Six wakes of 60 ms: 360 ms of wall clock, and 60 ms is more than the
    // clock's 50 ms step, so every one of them advances the tick and would
    // publish if the ceiling were the only thing stopping it. Under a 100 ms
    // ceiling the publications land at 60, 180 and 300 ms.
    for (let wake = 0; wake < 6; wake += 1) harness.wake(60);
    expect(harness.deltas()).toHaveLength(3);
    // Non-vacuous in the direction that matters: the tick really did move on
    // every one of the six wakes, so the three that published nothing were
    // stopped by the cadence and not by the skip.
    const ticks = harness.port.messages
      .filter((message) => message.kind === 'simulation/clock-state')
      .map((message) => (message as Extract<WorkerToMainMessage, { kind: 'simulation/clock-state' }>).payload.tick);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(6);
  });

  it('says nothing while the tick stands still, which the first wake after play is', () => {
    /*
     * The skip, driven at the tick loop's real cadence rather than at the
     * channel's. `setInterval(..., 15)` and a 50 ms clock step mean the first
     * two wakes after the player presses play execute no tick at all, and the
     * ceiling is wide open on the first wake of a session -- so "nothing has
     * changed" is not a rare case, it is the very first thing that happens.
     *
     * Written this way after the version that paused the clock was measured
     * and found vacuous: pausing calls `stopTickLoop`, so `publishRenderDelta`
     * was never reached and the assertion held with the skip deleted.
     */
    const harness = new Harness();
    harness.run();

    harness.wake(15);
    expect(harness.deltas()).toEqual([]);
    harness.wake(15);
    expect(harness.deltas()).toEqual([]);

    // Non-vacuous: the loop really did wake, and the tick really was still 0 --
    // read off the clock readout the same wakes produced, which is a second
    // publication with its own gates and therefore an independent witness.
    const clockStates = harness.port.messages.filter(
      (message): message is Extract<WorkerToMainMessage, { kind: 'simulation/clock-state' }> =>
        message.kind === 'simulation/clock-state',
    );
    expect(clockStates).toHaveLength(1);
    expect(clockStates[0]!.payload.tick).toBe(0);

    harness.wake(15);
    harness.wake(15); // 60 ms: the first tick.
    expect(harness.deltas()).toHaveLength(1);
    expect(harness.deltas()[0]!.payload.tick).toBe(1);
  });

  it('never publishes a message its own decoder would refuse', () => {
    /*
     * `deltaMessageSchema` enforces `tick > baseTick`, so a publication at a
     * tick that has not moved is not merely redundant -- it is a message the
     * main thread drops on the floor, taking the whole channel with it for as
     * long as the condition lasts. Driven at the loop's real 15 ms cadence, so
     * the wakes that execute no tick are included rather than skipped past.
     */
    const harness = new Harness();
    harness.run();
    for (let wake = 0; wake < 60; wake += 1) harness.wake(15);

    const deltas = harness.deltas();
    expect(deltas.length).toBeGreaterThan(3);
    for (const delta of deltas) {
      const decoded = decodeWorkerToMainMessage(delta);
      expectOk(decoded, `the delta published from tick ${String(delta.payload.baseTick)} to ${String(delta.payload.tick)}`);
    }
  });

  it('costs a paused prison nothing at all', () => {
    // The other half of "a ceiling, not a rate", and a different mechanism from
    // the skip: pausing stops the tick loop, so no wake happens to be gated.
    // Both are asserted because a change to either would leave a prison the
    // player has paused posting buffers.
    const harness = new Harness();
    harness.run();
    harness.wake(RENDER_DELTA_PUBLISH_INTERVAL_MS);
    expect(harness.deltas()).toHaveLength(1);

    harness.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'pause',
      kind: 'simulation/set-clock',
      payload: { mode: 'paused' },
    });
    // Twenty seconds of wall clock, two hundred ceilings' worth.
    for (let wake = 0; wake < 20; wake += 1) harness.wake(1_000);
    expect(harness.deltas()).toHaveLength(1);
  });

  it('publishes an empty population rather than falling silent', () => {
    // A fresh session admits nobody, so this is the ordinary case rather than
    // an edge one: a receiver that never hears from the channel cannot tell an
    // empty prison from a broken worker.
    const harness = new Harness();
    harness.run();
    harness.wake(RENDER_DELTA_PUBLISH_INTERVAL_MS);

    const read = readRenderActorsPayload(harness.deltas()[0]!.payload.delta.data as ArrayBuffer);
    expect(read.recordCount).toBe(0);
    expect(read.keyframe).toBe(true);
  });

  it('is caused by no message the main thread can send', () => {
    /*
     * ADR 0040: the channel takes no request, so there is no feedback path from
     * the renderer into the simulation to close -- `AGENTS.md` boundary 1.
     * "No request" is a claim about the whole main-to-worker vocabulary, so it
     * is driven from `MAIN_TO_WORKER_MESSAGE_KINDS` rather than from a list
     * written here: a kind added to the protocol arrives in this loop without
     * anybody having to remember it.
     *
     * The session is **armed** first, and that is load-bearing: both of
     * `publishRenderDelta`'s gates have to be open, or a handler that called it
     * would return early and this would hold for the wrong reason. Measured --
     * with the clock never started the tick is 0, the skip fires, and a
     * mutation that pushed a delta out of `handleRequestSnapshot` left this
     * green. So the harness runs two wakes: the first publishes at tick 1, the
     * second advances the tick without publishing because the ceiling has not
     * elapsed, and the clock is then paused. From there the tick is ahead of
     * the last publication and the wall clock is far past the ceiling, so a
     * handler that reached the channel would be heard.
     */
    const harness = new Harness();
    harness.run();
    harness.wake(60);
    harness.wake(60);
    expect(harness.deltas()).toHaveLength(1);
    harness.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'pause-before-sweep',
      kind: 'simulation/set-clock',
      payload: { mode: 'paused' },
    });
    harness.nowMs += 10_000_000; // Far past the ceiling, so nothing is suppressed by the cadence.

    const messageFor: Readonly<Record<string, MainToWorkerMessage>> = {
      'protocol/handshake': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-handshake',
        kind: 'protocol/handshake',
        payload: { clientBuildId: 'test', supportedProtocolVersions: [SIMULATION_PROTOCOL_VERSION], capabilities: [] },
      },
      'protocol/ping': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-ping',
        kind: 'protocol/ping',
        payload: { nonce: 'n' },
      },
      'simulation/initialize': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-initialize',
        kind: 'simulation/initialize',
        payload: { sessionId: 'session-second', source: { kind: 'new', masterSeed: 5 } },
      },
      'simulation/set-clock': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-set-clock',
        kind: 'simulation/set-clock',
        payload: { mode: 'paused' },
      },
      'simulation/submit-command': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-submit',
        kind: 'simulation/submit-command',
        payload: {
          commandId: 'cmd-1',
          sequence: 1,
          executeAtTick: 0,
          command: packCommand({ type: 'PlaceBuildOrder', orderId: 'w', definitionId: 'wall-brick', x: 4, y: 2 }),
        },
      },
      'simulation/request-snapshot': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-snapshot',
        kind: 'simulation/request-snapshot',
        payload: { reason: 'consistency-check' },
      },
      'simulation/request-projection': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-projection',
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/status-strip' },
      },
      'simulation/shutdown': {
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: 'k-shutdown',
        kind: 'simulation/shutdown',
        payload: { reason: 'user-request' },
      },
    };

    // Every declared kind has a message here, so the loop below cannot be
    // exhaustive by accident.
    expect(Object.keys(messageFor).sort()).toEqual([...MAIN_TO_WORKER_MESSAGE_KINDS].sort());

    for (const kind of MAIN_TO_WORKER_MESSAGE_KINDS) {
      // Shutdown last: it is the one that ends the session, and a kind sent
      // after it would be answered by a stopped worker rather than a live one.
      if (kind === 'simulation/shutdown') continue;
      harness.nowMs += 10_000;
      harness.send(messageFor[kind]!);
    }
    harness.send(messageFor['simulation/shutdown']!);

    // Still the one the tick loop published while arming, and nothing else.
    expect(harness.deltas()).toHaveLength(1);
    // Non-vacuous: the worker really was alive and answering throughout.
    const kinds = harness.port.messages.map((message) => message.kind);
    expect(kinds).toContain('simulation/snapshot');
    expect(kinds).toContain('simulation/projection');
    expect(kinds).toContain('simulation/stopped');
  });

  it('reaches the publication from the tick loop and from nowhere else', () => {
    /*
     * The behavioural case above drives the vocabulary the protocol declares
     * today. This is its static complement and covers the thing that case
     * cannot: a call added to a handler by a later change would be a
     * request-shaped route into a publication however the message that
     * provoked it was spelled.
     */
    const source = readFileSync(join(__dirname, '../../src/simulation/worker/state-machine.ts'), 'utf8');
    const calls = [...source.matchAll(/this\.publishRenderDelta\(/g)];
    expect(calls).toHaveLength(1);
    const enclosing = source.slice(0, calls[0]!.index).lastIndexOf('  private ');
    expect(source.slice(enclosing, enclosing + 40)).toMatch(/private onTickLoop\(/);
  });
});
