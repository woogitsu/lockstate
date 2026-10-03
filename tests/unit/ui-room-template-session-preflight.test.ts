import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { SimulationWorkerChannel } from '../../src/simulation/worker/worker-channel';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import type { SimulationClient, WorkerMessageHandler } from '../../src/simulation/worker/client';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { WorkerPerSessionHost } from '../../src/persistence/session/worker-per-session-host';
import { SimulationCommandSender } from '../../src/ui/simulation-commands';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';
import { createSimulationRoomTemplatePreflight, createSimulationRoomTemplateQuote } from '../../src/ui/simulation-room-template-port';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

// Transport-only delay: actual worker machine computes every response. No
// substituted verdict/runtime/world/ownership data is introduced.
class InProcessClient {
  readonly listeners = new Set<WorkerMessageHandler>();
  readonly held: WorkerToMainMessage[] = [];
  readonly sent: MainToWorkerMessage[] = [];
  holdPreflight = false;
  terminated = false;
  readonly machine = new SimulationWorkerStateMachine({ postMessage: message => {
    if (this.holdPreflight && message.kind === 'simulation/projection'
      && message.payload.projectionId === 'world/room-template-preflight') this.held.push(message);
    else this.emit(message);
  } }, 'template-session-diagnostic', () => 0);
  addListener(listener: WorkerMessageHandler) { this.listeners.add(listener); }
  removeListener(listener: WorkerMessageHandler) { this.listeners.delete(listener); }
  send(message: MainToWorkerMessage) { this.sent.push(message); this.machine.handleMessage(message); }
  terminate() { this.terminated = true; }
  emit(message: WorkerToMainMessage) { for (const listener of this.listeners) listener(message); }
  release() { this.holdPreflight = false; for (const message of this.held.splice(0)) this.emit(message); }
}

const source = readFileSync('src/main.ts', 'utf8');
const start = source.indexOf('onWorkerAvailability: (available) => {');
const end = source.indexOf('\n      },', start);
if (start < 0 || end < 0) throw Error('Real worker availability callback missing');
const callback = stripTypeScriptTypes(source.slice(start, end + '\n      }'.length).replace(/^onWorkerAvailability: /, ''), { mode: 'strip' });
function availability(tool: RoomTemplateTool) {
  // This template-only fixture mounts no ObjectTool; bind its optional slot explicitly.
  return new Function('roomTemplateTool', 'objectTool', 'worldScene', 'ObliqueWorldScene', 'hud', 'SIMULATION_UNAVAILABLE_NOTICE', 'crashReporter', `return (${callback});`)
    (tool, undefined, { cancelConstructionGesture() {} }, class {}, { setUnavailable() {} }, 'unavailable', undefined) as (available: boolean) => void;
}
afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  const clients: InProcessClient[] = [];
  const channel = new SimulationWorkerChannel(() => {
    const client = new InProcessClient(); clients.push(client);
    return client as unknown as SimulationClient;
  });
  channel.open();
  const commands = new SimulationCommandSender(channel, { now: () => 0 });
  const tool = new RoomTemplateTool({ preflight: createSimulationRoomTemplatePreflight(channel),
    quote: createSimulationRoomTemplateQuote(channel), place: async request => commands.submit({ type: 'PlaceRoomTemplate', ...request }) });
  const host = new WorkerPerSessionHost(channel, { onWorkerAvailability: availability(tool) });
  await host.startNew(73);
  await host.capture();
  commands.submit({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 10, y: 10 } });
  const saved = await host.capture();
  expect(saved.simulation?.roomTemplates?.pending).toHaveLength(1);
  const envelope = createSaveEnvelope({ gameVersion: 'test', prisonId: 'preflight-session', revision: 1,
    createdAt: 0, updatedAt: 1, ...saved });
  expect(envelope.saveSchemaVersion).toBe(10);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw Error('Encoded V8 must decode');
  return { clients, channel, commands, tool, host, saved: decoded.value.payload as unknown as SessionSnapshotBundle };
}

it.each((['new', 'load'] as const).flatMap(operation => [false, true].map(armed => ({ operation, armed }))))
  ('fresh $operation session admits a new plan after outgoing preflight, armed=$armed', async ({ operation, armed }) => {
  const h = await setup();
  if (armed) h.tool.arm();
  h.clients[0]!.holdPreflight = true;
  const previous = h.tool.placeAt({ x: 20, y: 10 }).catch(error => ({ error: String(error) }));
  expect(h.clients[0]!.held).toHaveLength(1);
  if (operation === 'new') await h.host.startNew(74); else await h.host.startFromSnapshot(h.saved);
  await h.host.capture();
  expect(h.clients[0]!.terminated).toBe(true);
  expect(h.tool.isArmed()).toBe(false);
  const before = await h.host.capture();
  h.clients[0]!.release(); // Correct channel suppression must remain intact.
  h.tool.arm();
  expect((await h.tool.inspectAt({ x: 20, y: 10 })).verdict).toEqual({ ok: true });
  const result = await h.tool.placeAt({ x: 20, y: 10 });
  const after = await h.host.capture();
  console.log(JSON.stringify({ operation, result, oldState: h.clients[0]!.machine.state, newState: h.clients[1]!.machine.state,
    beforeOrders: before.construction.orders.length, afterOrders: after.construction.orders.length,
    beforeTreasury: before.simulation?.economy?.treasury, afterTreasury: after.simulation?.economy?.treasury,
    actualNewCommandMessages: h.clients[1]!.sent.filter(message => message.kind === 'simulation/submit-command').length,
    sameAuthoritativeSnapshot: JSON.stringify(before) === JSON.stringify(after) }));
  try {
    expect(result).toEqual({ ok: true });
    expect(after.simulation?.roomTemplates?.pending.length).toBe((before.simulation?.roomTemplates?.pending.length ?? 0) + 1);
    expect(after.construction.orders).toHaveLength(before.construction.orders.length + 18);
    for (const existing of before.construction.orders) expect(after.construction.orders).toContainEqual(existing);
  } finally {
    await vi.advanceTimersByTimeAsync(15_000);
    const staleResult = await previous;
    expect(staleResult).toHaveProperty('error');
    // Observe genuine recovery rather than describing a hypothetical timeout.
    const settled = await h.host.capture();
    expect(settled).toEqual(after);
    if (!result.ok) {
      expect(await h.tool.placeAt({ x: 20, y: 10 })).toEqual({ ok: true });
      const recovered = await h.host.capture();
      console.log(JSON.stringify({ operation, recoveredOrders: recovered.construction.orders.length,
        recoveredPending: recovered.simulation?.roomTemplates?.pending.length,
        recoveredTreasury: recovered.simulation?.economy?.treasury }));
    }
    await h.host.stop();
  }
});

it('a delayed genuine same-session preflight submits exactly one plan', async () => {
  const h = await setup();
  h.tool.arm(); h.clients[0]!.holdPreflight = true;
  const previous = h.tool.placeAt({ x: 20, y: 10 });
  const before = await h.host.capture();
  h.clients[0]!.release();
  expect(await previous).toEqual({ ok: true });
  const after = await h.host.capture();
  expect(after.simulation?.roomTemplates?.pending).toHaveLength(2);
  expect(h.clients[0]!.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(2);
  expect(after.simulation).not.toEqual(before.simulation);
  await h.host.stop();
});

it.each([false, true])('cancel/rearm keeps the newer pending owner when an older real preflight settles, armed=%s', async armed => {
  const h = await setup();
  if (armed) h.tool.arm();
  h.clients[0]!.holdPreflight = true;
  const old = h.tool.placeAt({ x: 20, y: 10 });
  h.tool.standDown(); h.tool.arm();
  const current = h.tool.placeAt({ x: 20, y: 10 });
  const before = await h.host.capture();
  try {
    expect(h.clients[0]!.held).toHaveLength(2);
    h.clients[0]!.emit(h.clients[0]!.held.shift()!);
    expect(await old).toEqual({ ok: false, reason: 'busy' });
    const additional = h.tool.placeAt({ x: 20, y: 10 });
    expect(h.clients[0]!.held).toHaveLength(1);
    expect(await additional).toEqual({ ok: false, reason: 'busy' });
    expect(await h.host.capture()).toEqual(before);
    h.clients[0]!.release();
    expect(await current).toEqual({ ok: true });
    const after = await h.host.capture();
    expect(after.construction.orders).toHaveLength(before.construction.orders.length + 18);
    expect(h.clients[0]!.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(2);
  } finally {
    h.clients[0]!.release(); await Promise.all([old, current]); await h.host.stop();
  }
});

it('an abandoned old session requester timing out cannot release a newer generation busy token', async () => {
  const h = await setup(); h.tool.arm(); h.clients[0]!.holdPreflight = true;
  const old = h.tool.placeAt({ x: 20, y: 10 }).catch(error => ({ error: String(error) }));
  await h.host.startFromSnapshot(h.saved); await h.host.capture();
  await vi.advanceTimersByTimeAsync(1_000);
  h.tool.arm(); h.clients[1]!.holdPreflight = true;
  const current = h.tool.placeAt({ x: 20, y: 10 });
  try {
    expect(h.clients[1]!.held).toHaveLength(1);
    const before = await h.host.capture();
    await vi.advanceTimersByTimeAsync(14_000);
    expect(await old).toHaveProperty('error');
    const additional = h.tool.placeAt({ x: 20, y: 10 });
    expect(h.clients[1]!.held).toHaveLength(1);
    expect(await additional).toEqual({ ok: false, reason: 'busy' });
    expect(await h.host.capture()).toEqual(before);
    h.clients[1]!.release();
    expect(await current).toEqual({ ok: true });
    const after = await h.host.capture();
    expect(after.construction.orders).toHaveLength(before.construction.orders.length + 18);
    expect(h.clients[1]!.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(1);
  } finally {
    h.clients[0]!.release(); h.clients[1]!.release();
    await vi.advanceTimersByTimeAsync(15_000); await Promise.all([old, current]); await h.host.stop();
  }
});

it('standing down a numeric unarmed request discards its actual late clear result', async () => {
  const h = await setup();
  expect(h.tool.isArmed()).toBe(false);
  h.clients[0]!.holdPreflight = true;
  const pending = h.tool.placeAt({ x: 20, y: 10 });
  const before = await h.host.capture();
  h.tool.standDown(); h.clients[0]!.release();
  try {
    expect(await pending).toEqual({ ok: false, reason: 'busy' });
    expect(await h.host.capture()).toEqual(before);
    expect(h.clients[0]!.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(1);
  } finally { await h.host.stop(); }
});

it.each(['selection', 'arm'] as const)('a genuine new %s generation can place before an abandoned old reply and keeps its own busy token', async boundary => {
  const h = await setup(); h.tool.arm(); h.clients[0]!.holdPreflight = true;
  const old = h.tool.placeAt({ x: 20, y: 10 });
  if (boundary === 'selection') h.tool.select('cell-basic', true, 1);
  else h.tool.arm(); // Actual Place on map callback creates a new selection revision.
  const current = h.tool.placeAt({ x: 20, y: 10 });
  const before = await h.host.capture();
  try {
    expect(h.clients[0]!.held, 'new generation must reach its genuine current worker preflight').toHaveLength(2);
    h.clients[0]!.emit(h.clients[0]!.held.shift()!);
    expect(await old).toEqual({ ok: false, reason: 'busy' });
    expect(await h.host.capture()).toEqual(before);
    expect(await h.tool.placeAt({ x: 20, y: 10 })).toEqual({ ok: false, reason: 'busy' });
    expect(h.clients[0]!.held).toHaveLength(1);
    h.clients[0]!.release();
    expect(await current).toEqual({ ok: true });
    const after = await h.host.capture();
    expect(after.construction.orders).toHaveLength(before.construction.orders.length + 18);
    expect(h.clients[0]!.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(2);
    const placed = h.clients[0]!.sent.filter(message => message.kind === 'simulation/submit-command').at(-1)!;
    expect(placed.payload.command.data).toEqual({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 20, y: 10 },
      ...(boundary === 'selection' ? { mirrorX: true, quarterTurns: 1 } : {}) });
    for (const existing of before.construction.orders) expect(after.construction.orders).toContainEqual(existing);
  } finally {
    h.clients[0]!.release(); await Promise.all([old, current]); await h.host.stop();
  }
});

it('a no-op same plan selection preserves the active same-generation busy owner', async () => {
  const h = await setup(); h.tool.arm(); h.clients[0]!.holdPreflight = true;
  const old = h.tool.placeAt({ x: 20, y: 10 });
  const revision = h.tool.revision, before = await h.host.capture();
  h.tool.select('cell-basic', false, 0);
  try {
    expect(h.tool.revision).toBe(revision);
    expect(await h.tool.placeAt({ x: 20, y: 10 })).toEqual({ ok: false, reason: 'busy' });
    expect(h.clients[0]!.held).toHaveLength(1);
    expect(await h.host.capture()).toEqual(before);
    h.clients[0]!.release();
    expect(await old).toEqual({ ok: true });
    expect((await h.host.capture()).construction.orders).toHaveLength(before.construction.orders.length + 18);
    expect(h.clients[0]!.sent.filter(message => message.kind === 'simulation/submit-command')).toHaveLength(2);
  } finally { h.clients[0]!.release(); await old; await h.host.stop(); }
});
