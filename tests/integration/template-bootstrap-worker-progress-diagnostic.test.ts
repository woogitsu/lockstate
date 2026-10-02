import { afterEach, expect, it, vi } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, type MainToWorkerMessage, type WorkerToMainMessage, type VersionedPayload } from '../../src/simulation/protocol/types';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import { SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

afterEach(() => vi.useRealTimers());
type Request = { [Kind in MainToWorkerMessage['kind']]:
  Omit<Extract<MainToWorkerMessage, { kind: Kind }>, 'protocolVersion' | 'messageId'> }[MainToWorkerMessage['kind']];

it('diagnoses the exact paused Storage/Delivery bootstrap through real x4 worker transport and partial encoded Load', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const results = [false, true].map(restorePartial => {
    let replies: WorkerToMainMessage[] = [];
    let machine = new SimulationWorkerStateMachine({ postMessage: message => {
      if (message.kind !== 'simulation/delta') replies.push(message);
    } }, 'bootstrap-diagnostic', () => Date.now());
    let id = 0;
    const send = (message: Request) => {
      machine.handleMessage({ ...message, protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: `request-${++id}` });
      expect(replies.filter(reply => reply.kind === 'protocol/error')).toEqual([]);
    };
    const snapshot = (): SessionSnapshotBundle => {
      send({ kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
      const reply = replies.findLast(reply => reply.kind === 'simulation/snapshot');
      if (reply?.kind !== 'simulation/snapshot') throw new Error('Worker did not return its snapshot');
      const bundle = reply.payload.snapshot.data as unknown as SessionSnapshotBundle;
      replies = [];
      return bundle;
    };
    send({ kind: 'simulation/initialize', payload: { sessionId: 'bootstrap', source: { kind: 'new', masterSeed: 73 } } });
    for (const [sequence, templateId, x] of [[0, 'storage-room-basic', 5], [1, 'delivery-bay-basic', 12]] as const) {
      send({ kind: 'simulation/submit-command', payload: {
        commandId: `plan-${sequence}`, sequence, executeAtTick: 0,
        command: packCommand({ type: 'PlaceRoomTemplate', templateId, origin: { x, y: 5 } }),
      } });
    }
    const initial = snapshot();
    expect(initial.kernel.tick).toBe(0);
    expect(initial.simulation?.roomTemplates?.pending).toHaveLength(2);
    send({ kind: 'simulation/set-clock', payload: { mode: 'running', speed: 4 } });
    let loaded = false;
    let final = initial;
    const progress: { wallMs: number; tick: number; unfinished: number; completed: number }[] = [];
    for (let second = 1; second <= 120; second += 1) {
      vi.advanceTimersByTime(1000);
      final = snapshot();
      const orders = final.construction.orders;
      progress.push({ wallMs: second * 1000, tick: final.kernel.tick,
        unfinished: orders.filter(order => order.state !== 'completed').length,
        completed: orders.filter(order => order.state === 'completed').length });
      if (restorePartial && !loaded && orders.some(order => order.state === 'completed')) {
        expect(final.simulation?.roomTemplates?.pending).toHaveLength(2);
        send({ kind: 'simulation/set-clock', payload: { mode: 'paused' } });
        const envelope = createSaveEnvelope({
          gameVersion: 'test', prisonId: 'bootstrap-partial', revision: 1,
          createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
          ...final,
        });
        const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) throw new Error('Partial worker bootstrap save did not decode');
        replies = [];
        machine = new SimulationWorkerStateMachine({ postMessage: message => {
          if (message.kind !== 'simulation/delta') replies.push(message);
        } }, 'bootstrap-diagnostic', () => Date.now());
        send({ kind: 'simulation/initialize', payload: { sessionId: 'loaded-bootstrap', source: {
          kind: 'snapshot', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
            schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: decoded.value.payload as unknown as Extract<VersionedPayload, { transport: 'structured-clone' }>['data'] },
        } } });
        const restored = snapshot();
        expect(restored.construction).toEqual(final.construction);
        expect(restored.simulation?.roomTemplates).toEqual(final.simulation?.roomTemplates);
        expect(restored.kernel.tick).toBe(final.kernel.tick);
        send({ kind: 'simulation/set-clock', payload: { mode: 'running', speed: 4 } });
        loaded = true;
      }
      if (orders.every(order => order.state === 'completed') && final.simulation?.roomTemplates?.pending.length === 0) break;
    }
    send({ kind: 'simulation/set-clock', payload: { mode: 'paused' } });
    expect(final.construction.orders.length).toBeGreaterThan(0);
    expect(final.construction.orders.every(order => order.state === 'completed')).toBe(true);
    expect(final.simulation?.roomTemplates?.pending).toEqual([]);
    expect(final.simulation?.objects?.placedObjects.map(object => object.objectId).sort())
      .toEqual(['object.loading-dock-door', 'object.storage-rack', 'object.storage-rack']);
    expect(loaded).toBe(restorePartial);
    return { restorePartial, progress, construction: final.construction, simulation: final.simulation };
  });
  expect(results[1]?.construction).toEqual(results[0]?.construction);
  expect(results[1]?.simulation?.objects).toEqual(results[0]?.simulation?.objects);
  if (process.env['LOCKSTATE_BOOTSTRAP_DIAGNOSTIC'] === '1') {
    process.stdout.write('BOOTSTRAP_WORKER_DIAGNOSTIC ' + JSON.stringify(results.map(({ restorePartial, progress }) => ({ restorePartial, progress }))) + '\n');
  }
}, 30_000);
