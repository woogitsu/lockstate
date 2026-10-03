import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomTemplatePreflight } from '../../src/simulation/presentation/room-template-preflight';
import { instantiateRoomTemplateForConstruction } from '../../src/simulation/construction/room-template-build-plan';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import type { RoomListViewModel } from '../../src/simulation/presentation/room-projection';
import { GARBAGE_BOOTSTRAP, GARBAGE_CASES, GARBAGE_ORIGIN, GARBAGE_PLAN } from '../fixtures/native-garbage-room-plan';
import { assertGarbageCapacity, assertGarbageRoom } from '../browser/native-garbage-room-evidence';

it.each([0, 1] as const)('builds literal public Garbage Room q%s owners and square shell with whole V8 roundtrip', turns => {
  const runtime = createNewSimulationRuntime(73);
  expect(runtime.treasury.balanceMinorUnits).toBe(25000);
  const receipt: { templateId: string; elapsedTicks: number; balance: number; completedOrders: number }[] = [];
  for (const plan of [...GARBAGE_BOOTSTRAP, { ...GARBAGE_PLAN, origin: GARBAGE_ORIGIN }]) {
    const quarterTurns = plan.templateId === 'garbage-room-basic' ? turns : 0;
    const geometry = instantiateRoomTemplateForConstruction(plan.templateId, plan.origin, false, quarterTurns);
    expect(plan.origin.x + geometry.width).toBeLessThanOrEqual(32);
    expect(plan.origin.y + geometry.height).toBeLessThanOrEqual(32);
    expect(projectRoomTemplateCost(plan.templateId)).toMatchObject({ orderCount: plan.orders, catalogueCostMinorUnits: plan.cost });
    expect(projectRoomTemplatePreflight(runtime.roomTemplates, plan.templateId, plan.origin, false, quarterTurns)).toEqual({ ok: true });
    if (plan.templateId === 'garbage-room-basic') {
      assertGarbageCapacity(captureSessionSnapshot(runtime));
      expect({ width: geometry.width, height: geometry.height }).toEqual({ width: 4, height: 4 });
      expect(geometry.objects.map(object => [object.x, object.y, object.width, object.height, object.quarterTurns])).toEqual(
        GARBAGE_CASES[turns].bins.map(([x, y]) => [x, y, 1, 1, turns]));
    }
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`garbage-preparation-${sequence}`, sequence, runtime.kernel.tick,
      packCommand({ type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin,
        ...(quarterTurns === 0 ? {} : { quarterTurns }) }));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
    if (plan.templateId === 'garbage-room-basic') assertGarbageRoom(captureSessionSnapshot(runtime), turns, false);
    const completed = () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed');
    let ticks = 0;
    for (; ticks < 15000 && !completed(); ticks++) runtime.kernel.step();
    expect(completed(), 'real public typed deliveries/builder completion').toBe(true);
    expect(ticks).toBe(plan.ticks); expect(runtime.treasury.balanceMinorUnits).toBe(plan.balance);
    expect(runtime.construction.allOrders()).toHaveLength(plan.cumulativeOrders);
    receipt.push({ templateId: plan.templateId, elapsedTicks: ticks, balance: runtime.treasury.balanceMinorUnits,
      completedOrders: runtime.construction.allOrders().length });
  }
  const before = captureSessionSnapshot(runtime);
  assertGarbageRoom(before, turns, true);
  const rooms = PROJECTION_CATALOG['hud/room-list'].project(runtime, runtime.kernel.tick, {}).view as unknown as RoomListViewModel;
  expect(rooms.totals).toEqual({ instances: 3, occupants: 0, capacity: 0 });
  expect(rooms.rooms.rows.every(room => room.access === 'doorway' && room.requirementSummary.missingCapability === 0)).toBe(true);
  const room = rooms.rooms.rows.find(room => room.roomCatalogId === 'room.garbage-room')!;
  expect(room.instanceId).toBe('room.garbage-room:5:5');
  expect(room.concurrentUse).toEqual([{ capability: 'waste-disposal', capacity: 2, inUse: 0 }]);
  const materials = new Map<string, number>();
  for (const order of runtime.construction.allOrders()) for (const material of order.materialsAllocated)
    materials.set(material.itemId, (materials.get(material.itemId) ?? 0) + material.quantity);
  expect(Object.fromEntries(materials)).toEqual({ 'item.brick': 92, 'item.wood-plank': 8 });
  const envelope = createSaveEnvelope({ gameVersion: 'garbage-native-preparation', prisonId: `garbage-q${turns}`,
    revision: 1, createdAt: 0, updatedAt: 1, ...before });
  expect(envelope.saveSchemaVersion).toBe(8);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed Garbage Room V8 save refused');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  const loaded = captureSessionSnapshot(restored);
  expect(loaded, 'whole stopped V8 snapshot across every persisted subsystem').toEqual(before);
  assertGarbageRoom(loaded, turns, true);
  mkdirSync('assets/intermediate/garbage-room-native-preparation', { recursive: true });
  writeFileSync(`assets/intermediate/garbage-room-native-preparation/actual-typed-q${turns}-V8-roundtrip.json`,
    JSON.stringify({ quarterTurns: turns, receipt, roomProjection: rooms, materialTotals: Object.fromEntries(materials),
      wholeBefore: before, wholeAfter: loaded, wholeV8RoundtripExact: true, nativeBrowserRun: false }, null, 2));
});
