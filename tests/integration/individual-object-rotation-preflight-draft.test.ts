import { afterEach, expect, it, vi } from 'vitest';
import { ObjectTool } from '../../src/ui/object-tool';
import { createSimulationObjectPlacementPreflight } from '../../src/ui/simulation-object-placement-port';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { decodeMainToWorkerMessage, decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import { expectOk } from '../helpers/expect-ok';

afterEach(() => vi.useRealTimers());

it('DRAFT rotation owns the actual q1 worker footprint, drops an older real q0 reply and buys the exact oriented object', async () => {
  vi.useFakeTimers();
  const runtime = createNewSimulationRuntime(73);
  for (const [id, command] of [['zone', { type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 }],
    ['claim', { type: 'PlaceObject', orderId: 'claim-below', definitionId: 'desk-wooden', x: 7, y: 7 }]] as const) {
    runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, 0, packCommand(command));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  }
  const initial = captureSessionSnapshot(runtime);
  const listeners: ((message: WorkerToMainMessage) => void)[] = [], outputs: WorkerToMainMessage[] = [],
    held: WorkerToMainMessage[] = [], requests: MainToWorkerMessage[] = [];
  let delay = false, sequence = 0;
  const deliver = (message: WorkerToMainMessage) => listeners.forEach(listener => listener(message));
  const machine = new SimulationWorkerStateMachine({ postMessage(raw: unknown) {
    const decoded = decodeWorkerToMainMessage(raw); expectOk(decoded, 'actual worker output');
    outputs.push(decoded.value);
    if (delay && decoded.value.kind === 'simulation/projection') held.push(decoded.value); else deliver(decoded.value);
  } }, 'rotation-draft', () => 0);
  const channel = { addListener(listener: (message: WorkerToMainMessage) => void) { listeners.push(listener); },
    send(raw: MainToWorkerMessage) { requests.push(raw); const decoded = decodeMainToWorkerMessage(raw);
      expectOk(decoded, 'actual strict main wire'); machine.handleMessage(decoded.value); } };
  channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'initialize', kind: 'simulation/initialize',
    payload: { sessionId: 'rotation-draft', source: { kind: 'snapshot', snapshot: { transport: 'structured-clone',
      schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: initial as unknown as null } } } });
  const read = (): SessionSnapshotBundle => {
    const messageId = `read-${sequence++}`;
    channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    const actual = outputs.find(reply => reply.kind === 'simulation/snapshot' && reply.replyTo === messageId);
    if (actual?.kind !== 'simulation/snapshot') throw new Error('Actual snapshot reply absent');
    return actual.payload.snapshot.data as unknown as SessionSnapshotBundle;
  };
  const tool = new ObjectTool({ preflight: createSimulationObjectPlacementPreflight(channel), worldRevision: () => 1 });
  const aim = (x = 7, y = 6) => tool.target({ tileX: x, tileY: y, ...tool.footprint()! });
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const projections = () => requests.filter(message => message.kind === 'simulation/request-projection');
  tool.setArmed(true, { definitionId: 'desk-wooden', footprint: { width: 2, height: 1 }, quarterTurns: 0 });
  aim(); await settle(); expect(tool.previewVerdict()).toBe('allowed');
  expect(projections()).toHaveLength(1);
  delay = true; tool.resetPreview(); aim(); // A genuine worker-produced q0 reply, delayed only at transport delivery.
  expect(held).toHaveLength(1);
  delay = false; tool.setArmed(true, { quarterTurns: 1 }); aim(); await settle();
  expect(projections()).toHaveLength(3);
  expect(projections().at(-1)!.payload).toMatchObject({ target: { kind: 'object-placement', definitionId: 'desk-wooden',
    anchor: { x: 7, y: 6 }, quarterTurns: 1 } });
  expect(tool.previewVerdict()).toBe('blocked');
  const reply = outputs.filter(message => message.kind === 'simulation/projection').at(-1)!;
  expect(reply.payload.view?.data).toEqual({ ok: false, reason: 'tile-occupied', tile: { x: 7, y: 7 },
    footprint: [{ x: 7, y: 6 }, { x: 7, y: 7 }], catalogueCostMinorUnits: 130 });
  held.forEach(deliver); await settle(); expect(tool.previewVerdict()).toBe('blocked');
  for (let frame = 0; frame < 100; frame++) aim();
  expect(projections()).toHaveLength(3); expect(read()).toEqual(initial);
  aim(10, 8); await settle(); expect(tool.previewVerdict()).toBe('allowed');
  tool.attachGestures(gesture => {
    if (gesture.kind !== 'place') throw new Error('Expected real placing gesture');
    channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'purchase', kind: 'simulation/submit-command',
      payload: { commandId: 'fresh-q1', sequence: runtime.kernel.expectedSequence, executeAtTick: 0,
        command: packCommand({ type: 'PlaceObject', orderId: 'fresh-q1', definitionId: gesture.definitionId,
        x: gesture.x, y: gesture.y, ...(gesture.quarterTurns === undefined ? {} : { quarterTurns: gesture.quarterTurns }) }) } });
  });
  tool.place({ tileX: 10, tileY: 8 });
  const purchased = read();
  expect(purchased.construction.orders).toHaveLength(2);
  expect(purchased.construction.orders.find(order => order.id === 'fresh-q1')).toMatchObject({ definitionId: 'desk-wooden',
    location: { x: 10, y: 8 }, objectOrientation: 1, state: 'approved' });
  expect(purchased.simulation?.economy?.treasury.balanceMinorUnits).toBe(24740);
  const envelope = createSaveEnvelope({ gameVersion: 'rotation-draft', prisonId: 'rotation-draft-save',
    revision: 1, createdAt: 0, updatedAt: 1, ...purchased });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope))); expectOk(decoded, 'whole actual V8');
  expect(captureSessionSnapshot(restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime)).toEqual(purchased);
});
