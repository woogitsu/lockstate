import { expect, it, vi } from 'vitest';
import { instantiateRoomTemplate } from '../../src/content/room-template-catalog';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

function saveAndLoad(runtime: ReturnType<typeof createNewSimulationRuntime>) {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'row-proof', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('row save did not decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 73).runtime;
}

it('authors four separate cells with north and south doors around a two-tile corridor', () => {
  const plan = instantiateRoomTemplate('cell-row-four', { x: 10, y: 10 });
  expect({ width: plan.width, height: plan.height }).toEqual({ width: 7, height: 16 });
  expect(plan.zones).toEqual([
    { roomId: 'room.cell', x: 11, y: 11, width: 2, height: 5 },
    { roomId: 'room.cell', x: 14, y: 11, width: 2, height: 5 },
    { roomId: 'room.cell', x: 11, y: 20, width: 2, height: 5 },
    { roomId: 'room.cell', x: 14, y: 20, width: 2, height: 5 },
  ]);
  expect(plan.doorSquares.map(({ x, y }) => ({ x, y }))).toEqual([
    { x: 11, y: 16 }, { x: 14, y: 16 },
    { x: 11, y: 19 }, { x: 14, y: 19 },
  ]);
  expect(new Set(plan.wallSquares.map(({ x, y }) => `${x}:${y}`)).size).toBe(plan.wallSquares.length);
  expect(plan.objects).toHaveLength(8);
  expect(plan.wallSquares.every((square) => square.y !== 17 && square.y !== 18)).toBe(true);
  expect(projectRoomTemplateCost('cell-row-four').orderCount).toBe(createRoomTemplateBuildPlan('cell-row-four', { x: 10, y: 10 }, false, 0).orders.length);
  const mirrored = instantiateRoomTemplate('cell-row-four', { x: 10, y: 10 }, { mirrorX: true });
  expect(mirrored.doorSquares.map(({ x, y }) => ({ x, y }))).toEqual(plan.doorSquares.map(({ x, y }) => ({ x: 26 - x, y })));
});

it('restores one pending row and completes all four cells after save and load', () => {
  const runtime = createNewSimulationRuntime(73);
  runtime.kernel.submitCommand('row-save', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 5, y: 5 },
  }));
  runtime.kernel.step();
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  const restored = saveAndLoad(runtime);
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(1);
  for (let tick = 0; tick < 30000; tick += 1) {
    restored.kernel.step();
    if (restored.roomTemplates.snapshot().pending.length === 0 &&
        restored.construction.allOrders().every((order) => order.state === 'completed')) break;
  }
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
  for (const zone of instantiateRoomTemplate('cell-row-four', { x: 5, y: 5 }).zones) {
    expect(restored.prisoners.roomInstances.getById(`room.cell:${zone.x}:${zone.y}`)).toBeDefined();
  }
});

it('cancels the whole row when one shell order is cancelled, including across save and load', () => {
  const runtime = createNewSimulationRuntime(73);
  const origin = { x: 5, y: 5 };
  runtime.kernel.submitCommand('row-cancel', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin,
  }));
  runtime.kernel.step();
  const shell = createRoomTemplateBuildPlan('cell-row-four', origin, false, 0).shellOrderIds;
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
  runtime.construction.cancelOrder(shell[0]!);
  expect(runtime.construction.getOrder(shell[0]!)?.state).toBe('cancelled');
  const restored = saveAndLoad(runtime);
  for (let tick = 0; tick < 20; tick += 1) restored.kernel.step();
  expect(restored.roomTemplates.snapshot().pending).toHaveLength(0);
  expect(restored.construction.allOrders().every((order) => order.state === 'cancelled')).toBe(true);
  expect(restored.roomTemplates.preflight(instantiateRoomTemplate('cell-row-four', origin))).toEqual({ ok: true });
});

it('rolls back earlier cells if a later designation refuses after the shell finishes', () => {
  const runtime = createNewSimulationRuntime(73);
  const origin = { x: 5, y: 5 };
  const first = instantiateRoomTemplate('cell-row-four', origin).zones[0]!;
  const originalZone = runtime.roomZoning.zone.bind(runtime.roomZoning);
  let calls = 0;
  vi.spyOn(runtime.roomZoning, 'zone').mockImplementation((request, tick, templateSequence) => {
    calls += 1;
    return originalZone(calls === 2 ? { ...request, x: first.x, y: first.y } : request, tick, templateSequence);
  });
  runtime.kernel.submitCommand('row-refusal', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin,
  }));
  for (let tick = 0; tick < 30000; tick += 1) {
    runtime.kernel.step();
    if (runtime.roomTemplates.snapshot().pending.length === 0 && calls > 0) break;
  }
  expect(calls).toBe(2);
  expect(runtime.roomTemplates.snapshot().pending).toHaveLength(0);
  for (const zone of instantiateRoomTemplate('cell-row-four', origin).zones) {
    expect(runtime.prisoners.roomInstances.getById(`room.cell:${zone.x}:${zone.y}`)).toBeUndefined();
  }
  expect(runtime.construction.allOrders().every((order) => order.state === 'cancelled')).toBe(true);
  expect(runtime.roomTemplates.preflight(instantiateRoomTemplate('cell-row-four', origin))).toEqual({ ok: true });
});

it('builds four individually zoned and furnished cells from one command', () => {
  const runtime = createNewSimulationRuntime(73);
  expect(runtime.roomTemplates.preflight(instantiateRoomTemplate('cell-row-four', { x: 5, y: 5 }))).toEqual({ ok: true });
  runtime.kernel.submitCommand('row-0', 0, runtime.kernel.tick, packCommand({
    type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 5, y: 5 },
  }));
  for (let tick = 0; tick < 30000; tick += 1) {
    runtime.kernel.step();
    const objectOrders = runtime.construction.allOrders().filter((order) => order.id.includes('-2-object-'));
    if (runtime.roomTemplates.snapshot().pending.length === 0 && objectOrders.length === 8 &&
        objectOrders.every((order) => order.state === 'completed')) break;
  }
  const plan = instantiateRoomTemplate('cell-row-four', { x: 5, y: 5 });
  for (const zone of plan.zones) {
    expect(runtime.prisoners.roomInstances.getById(`room.cell:${zone.x}:${zone.y}`)).toBeDefined();
  }
  expect(runtime.construction.allOrders()).toHaveLength(createRoomTemplateBuildPlan('cell-row-four', { x: 5, y: 5 }, false, 0).orders.length);
  expect(runtime.construction.allOrders().every((order) => order.state === 'completed')).toBe(true);
});
