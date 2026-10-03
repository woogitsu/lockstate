import { expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';
import { decodeMainToWorkerMessage, decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import { createSimulationObjectPlacementPreflight } from '../../src/ui/simulation-object-placement-port';
import { expectOk } from '../helpers/expect-ok';

function send(runtime: SimulationRuntime, command: Parameters<typeof packCommand>[0]): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`preflight-parity-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}
function inspect(runtime: SimulationRuntime, request: { definitionId: string; x: number; y: number; objectOrientation?: 0 | 1 | 2 | 3; orderId?: string }): unknown {
  return runtime.objectPlacement.preflight(request);
}
const desk = { definitionId: 'desk-wooden', x: 8, y: 5, objectOrientation: 1 } as const;

it('reads the exact oriented footprint and cost without touching ANY session state or refusal history', () => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 });
  const before = captureSessionSnapshot(runtime), refusals = [...runtime.objectPlacement.recentRefusals()];
  for (let read = 0; read < 3; read++) expect(inspect(runtime, desk)).toEqual({ ok: true,
    footprint: [{ x: 8, y: 5 }, { x: 8, y: 6 }], catalogueCostMinorUnits: 130, roomInstanceId: 'room.yard:4:4' });
  expect(captureSessionSnapshot(runtime)).toEqual(before);
  expect(runtime.objectPlacement.recentRefusals()).toEqual(refusals);
  send(runtime, { type: 'PlaceObject', orderId: 'actual-q1', definitionId: desk.definitionId, x: desk.x, y: desk.y, quarterTurns: 1 });
  expect(runtime.construction.getOrder('actual-q1')).toMatchObject({ state: 'approved', objectOrientation: 1 });
  expect(runtime.treasury.balanceMinorUnits).toBe(24870); // real unchanged auto-purchase at the accepted press
});

it('answers the actual typed UI port through the real worker and preserves the whole paused snapshot', async () => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 });
  send(runtime, { type: 'PlaceObject', orderId: 'actual-q1', definitionId: desk.definitionId, x: desk.x, y: desk.y, quarterTurns: 1 });
  const snapshot = captureSessionSnapshot(runtime);
  const messages: WorkerToMainMessage[] = [], listeners: ((message: WorkerToMainMessage) => void)[] = [];
  const machine = new SimulationWorkerStateMachine({ postMessage(raw: unknown) {
    const decoded = decodeWorkerToMainMessage(raw);
    expectOk(decoded, 'actual worker reply must decode');
    const message = decoded.value;
    messages.push(message);
    for (const listener of listeners) listener(message);
  } }, 'object-preflight-worker', () => 0);
  const channel = { addListener(listener: (message: WorkerToMainMessage) => void) { listeners.push(listener); },
    send(raw: MainToWorkerMessage) {
      const decoded = decodeMainToWorkerMessage(raw);
      expectOk(decoded, 'actual UI query must decode');
      machine.handleMessage(decoded.value);
    } };
  channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'initialize', kind: 'simulation/initialize',
    payload: { sessionId: 'object-preflight-session', source: { kind: 'snapshot', snapshot: {
      transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
      data: snapshot as unknown as null,
    } } } });
  expect(messages.filter(message => message.kind === 'protocol/error')).toEqual([]);
  const query = createSimulationObjectPlacementPreflight(channel);
  for (const quarterTurns of [0, 1, 2, 3] as const) {
    const target = { definitionId: 'desk-wooden', anchor: { x: 7, y: 6 }, quarterTurns };
    expect(await query(target)).toEqual(runtime.objectPlacement.preflight({ definitionId: target.definitionId,
      x: target.anchor.x, y: target.anchor.y, objectOrientation: quarterTurns }));
  }
  expect(messages.filter(message => message.kind === 'simulation/projection')).toHaveLength(4);
  channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'snapshot-after-reads',
    kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
  const after = messages.find(message => message.kind === 'simulation/snapshot');
  expect(after?.kind).toBe('simulation/snapshot');
  if (after?.kind !== 'simulation/snapshot') throw new Error('The actual worker returned no snapshot');
  expect(after.payload.snapshot.data).toEqual(snapshot);
});

it('strictly validates the existing query envelope and all four facings without widening saves', () => {
  const query = (target: unknown) => decodeMainToWorkerMessage({ protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'strict-preflight', kind: 'simulation/request-projection', payload: {
      projectionId: 'world/object-placement-preflight', target,
    } });
  const base = { kind: 'object-placement', definitionId: 'desk-wooden', anchor: { x: 8, y: 5 } };
  for (const quarterTurns of [undefined, 0, 1, 2, 3]) expect(query({ ...base,
    ...(quarterTurns === undefined ? {} : { quarterTurns }) }).ok).toBe(true);
  for (const quarterTurns of [-1, 4, 1.5, '1', null]) expect(query({ ...base, quarterTurns }).ok).toBe(false);
  expect(query({ ...base, extra: true }).ok).toBe(false);
  expect(query({ ...base, anchor: { x: 8, y: 5, extra: true } }).ok).toBe(false);
  expect(query({ ...base, anchor: { x: 8.5, y: 5 } }).ok).toBe(false);
});

it('retains complete secondary pending-claim refusal parity with the real typed placement', () => {
  const runtime = createNewSimulationRuntime(73);
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 });
  send(runtime, { type: 'PlaceObject', orderId: 'actual-q1', definitionId: desk.definitionId, x: desk.x, y: desk.y, quarterTurns: 1 });
  const before = captureSessionSnapshot(runtime), refusals = [...runtime.objectPlacement.recentRefusals()];
  const collision = { definitionId: 'desk-wooden', x: 7, y: 6, objectOrientation: 0 } as const;
  expect(inspect(runtime, collision)).toEqual({ ok: false, reason: 'tile-occupied', tile: { x: 8, y: 6 },
    footprint: [{ x: 7, y: 6 }, { x: 8, y: 6 }], catalogueCostMinorUnits: 130 });
  expect(captureSessionSnapshot(runtime)).toEqual(before);
  expect(runtime.objectPlacement.recentRefusals()).toEqual(refusals);
  send(runtime, { type: 'PlaceObject', orderId: 'actual-collision', definitionId: collision.definitionId, x: collision.x, y: collision.y });
  expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({ reason: 'tile-occupied', tile: { x: 8, y: 6 } });
  expect(runtime.construction.getOrder('actual-collision')).toBeUndefined();
  expect(runtime.treasury.balanceMinorUnits).toBe(24870);
});

it('unknown, structural, outside-room and duplicate checks stay pure and match actual place', () => {
  const runtime = createNewSimulationRuntime(73);
  for (const [definitionId, reason] of [['missing-object', 'unknown-buildable'], ['wall-brick', 'not-a-placeable-object'], ['desk-wooden', 'outside-room']] as const) {
    const request = { definitionId, x: 8, y: 5 };
    const before = captureSessionSnapshot(runtime), refusals = [...runtime.objectPlacement.recentRefusals()];
    expect(inspect(runtime, request)).toMatchObject({ ok: false, reason });
    expect(captureSessionSnapshot(runtime)).toEqual(before);
    expect(runtime.objectPlacement.recentRefusals()).toEqual(refusals);
    send(runtime, { type: 'PlaceObject', orderId: definitionId, ...request });
    expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({ reason });
  }
  send(runtime, { type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 });
  send(runtime, { type: 'PlaceObject', orderId: 'actual-q1', definitionId: desk.definitionId, x: desk.x, y: desk.y, quarterTurns: 1 });
  const before = captureSessionSnapshot(runtime), refusals = [...runtime.objectPlacement.recentRefusals()];
  expect(inspect(runtime, { ...desk, orderId: 'actual-q1' })).toMatchObject({ ok: false, reason: 'duplicate-order' });
  expect(captureSessionSnapshot(runtime)).toEqual(before);
  expect(runtime.objectPlacement.recentRefusals()).toEqual(refusals);
  send(runtime, { type: 'PlaceObject', orderId: 'actual-q1', definitionId: desk.definitionId, x: desk.x, y: desk.y, quarterTurns: 1 });
  expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({ reason: 'duplicate-order' });
});
