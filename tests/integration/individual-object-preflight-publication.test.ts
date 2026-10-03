import { afterEach, expect, it, vi } from 'vitest';
import { ObjectTool } from '../../src/ui/object-tool';
import { createSimulationObjectPlacementPreflight, SimulationObjectPlacementPreviewRevision } from '../../src/ui/simulation-object-placement-port';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { decodeMainToWorkerMessage, decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import { expectOk } from '../helpers/expect-ok';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

afterEach(() => vi.useRealTimers());

it('refreshes a stationary ghost after a REAL paused pending claim, then drops real delayed replies across disarm/New/Load', async () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('zone', runtime.kernel.expectedSequence, 0,
    packCommand({ type: 'ZoneRoom', roomId: 'room.yard', x: 4, y: 4, width: 8, height: 8 }));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  const snapshot = captureSessionSnapshot(runtime);
  const listeners: ((message: WorkerToMainMessage) => void)[] = [], held: WorkerToMainMessage[] = [], requests: MainToWorkerMessage[] = [], outputs: WorkerToMainMessage[] = [];
  let delay = false, machine: SimulationWorkerStateMachine, now = 0;
  const deliver = (message: WorkerToMainMessage) => { for (const listener of listeners) listener(message); };
  const port = { postMessage(raw: unknown) {
    const decoded = decodeWorkerToMainMessage(raw); expectOk(decoded, 'actual worker publication');
    outputs.push(decoded.value);
    if (delay && decoded.value.kind === 'simulation/projection') held.push(decoded.value);
    else deliver(decoded.value);
  } };
  const channel = { addListener(listener: (message: WorkerToMainMessage) => void) { listeners.push(listener); },
    send(raw: MainToWorkerMessage) { requests.push(raw); const decoded = decodeMainToWorkerMessage(raw);
      expectOk(decoded, 'actual main request'); machine.handleMessage(decoded.value); } };
  const revision = new SimulationObjectPlacementPreviewRevision(channel, () => tool.setArmed(false), () => tool.refreshPreview());
  const tool = new ObjectTool({ preflight: createSimulationObjectPlacementPreflight(channel), worldRevision: () => revision.revision });
  const arm = () => tool.setArmed(true, { definitionId: 'desk-wooden', footprint: { width: 2, height: 1 } });
  const aim = () => tool.target({ tileX: 7, tileY: 6, width: 2, height: 1 });
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const initialize = (source: Extract<MainToWorkerMessage, { kind: 'simulation/initialize' }>['payload']['source'], id: string) => {
    machine = new SimulationWorkerStateMachine(port, id, () => now);
    channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: `init-${id}`, kind: 'simulation/initialize',
      payload: { sessionId: id, source } });
  };
  const load = { kind: 'snapshot', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
    schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: snapshot as unknown as null } } as const;
  initialize(load, 'original'); arm(); aim(); await settle();
  expect(tool.previewVerdict()).toBe('allowed');
  const before = revision.revision;
  channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'claim', kind: 'simulation/submit-command', payload: {
    commandId: 'claim-secondary', sequence: runtime.kernel.expectedSequence, executeAtTick: 0,
    command: packCommand({ type: 'PlaceObject', orderId: 'claim-secondary', definitionId: 'desk-wooden', x: 8, y: 5, quarterTurns: 1 }),
  } });
  expect(revision.revision).toBeGreaterThan(before); // actual forced same-tick publication; no render-feed revision used
  expect(tool.previewVerdict()).toBeUndefined(); await settle();
  expect(tool.previewVerdict()).toBe('blocked');
  for (let paint = 0; paint < 100; paint++) aim();
  expect(requests.filter(message => message.kind === 'simulation/request-projection')).toHaveLength(2);
  channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'save-actual-pending',
    kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
  const saved = outputs.find(message => message.kind === 'simulation/snapshot' && message.replyTo === 'save-actual-pending');
  if (saved?.kind !== 'simulation/snapshot') throw new Error('Actual pending worker snapshot absent');
  const actual = saved.payload.snapshot.data as unknown as SessionSnapshotBundle;
  const envelope = createSaveEnvelope({ gameVersion: 'object-preflight', prisonId: 'object-preflight',
    revision: 1, createdAt: 0, updatedAt: 1, ...actual });
  expect(envelope.saveSchemaVersion).toBe(9);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope))); expectOk(decoded, 'actual worker pending purchase V8');
  expect(captureSessionSnapshot(restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime)).toEqual(actual);
  delay = true; tool.target(undefined); aim(); tool.setArmed(false);
  for (const reply of held.splice(0)) deliver(reply); await settle();
  expect(tool.previewVerdict()).toBeUndefined();
  arm(); aim(); expect(held).toHaveLength(1);
  initialize({ kind: 'new', masterSeed: 74 }, 'new-session');
  for (const reply of held.splice(0)) deliver(reply); await settle();
  expect(tool.isArmed()).toBe(false); expect(tool.previewVerdict()).toBeUndefined();
  arm(); aim(); expect(held).toHaveLength(1);
  initialize(load, 'loaded-session');
  for (const reply of held.splice(0)) deliver(reply); await settle();
  expect(tool.isArmed()).toBe(false); expect(tool.previewVerdict()).toBeUndefined();
  delay = false; arm(); aim(); await settle(); expect(tool.previewVerdict()).toBe('allowed');
  vi.useFakeTimers();
  const beforeRunning = requests.filter(message => message.kind === 'simulation/request-projection').length;
  channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'run-loaded',
    kind: 'simulation/set-clock', payload: { mode: 'running', speed: 1 } });
  expect(requests.filter(message => message.kind === 'simulation/request-projection')).toHaveLength(beforeRunning);
  now = 300; vi.advanceTimersByTime(15); await settle();
  expect(outputs.some(message => message.kind === 'simulation/clock-state' && message.replyTo === undefined && message.payload.tick > 0)).toBe(true);
  expect(requests.filter(message => message.kind === 'simulation/request-projection')).toHaveLength(beforeRunning + 1);
  expect(tool.previewVerdict()).toBe('allowed');
  channel.send({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'stop-loaded',
    kind: 'simulation/shutdown', payload: { reason: 'user-request' } });
  expect(tool.isArmed()).toBe(false);
});
