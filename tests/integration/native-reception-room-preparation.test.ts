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
import { RECEPTION_BOOTSTRAP, RECEPTION_CASES, RECEPTION_ORIGIN, RECEPTION_PLAN } from '../fixtures/native-reception-room-plan';
import { assertReceptionCapacity, assertReceptionRoom } from '../browser/native-reception-room-evidence';

it.each([0, 1] as const)('builds literal public Reception Room q%s owners and square shell with whole V8 roundtrip', turns => {
  const runtime = createNewSimulationRuntime(73);
  expect(runtime.treasury.balanceMinorUnits).toBe(25000);
  const receipt: { templateId: string; elapsedTicks: number; balance: number; completedOrders: number }[] = [];
  for (const plan of [...RECEPTION_BOOTSTRAP, { ...RECEPTION_PLAN, origin: RECEPTION_ORIGIN }]) {
    const quarterTurns = plan.templateId === 'reception-basic' ? turns : 0;
    const geometry = instantiateRoomTemplateForConstruction(plan.templateId, plan.origin, false, quarterTurns);
    expect(plan.origin.x + geometry.width).toBeLessThanOrEqual(32);
    expect(plan.origin.y + geometry.height).toBeLessThanOrEqual(32);
    expect(projectRoomTemplateCost(plan.templateId)).toMatchObject({ orderCount: plan.orders, catalogueCostMinorUnits: plan.cost });
    expect(projectRoomTemplatePreflight(runtime.roomTemplates, plan.templateId, plan.origin, false, quarterTurns)).toEqual({ ok: true });
    if (plan.templateId === 'reception-basic') {
      assertReceptionCapacity(captureSessionSnapshot(runtime));
      expect({ width: geometry.width, height: geometry.height }).toEqual({ width: 6, height: 6 });
      expect(geometry.objects.map(object => [object.x, object.y, object.width, object.height, object.quarterTurns])).toEqual(
        [[...RECEPTION_CASES[turns].desk, turns], ...RECEPTION_CASES[turns].chairs.map(([x, y]) => [x, y, 1, 1, turns])]);
    }
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`reception-preparation-${sequence}`, sequence, runtime.kernel.tick,
      packCommand({ type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin,
        ...(quarterTurns === 0 ? {} : { quarterTurns }) }));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
    if (plan.templateId === 'reception-basic') assertReceptionRoom(captureSessionSnapshot(runtime), turns, false);
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
  assertReceptionRoom(before, turns, true);
  const rooms = PROJECTION_CATALOG['hud/room-list'].project(runtime, runtime.kernel.tick, {}).view as unknown as RoomListViewModel;
  expect(rooms.totals).toEqual({ instances: 3, occupants: 0, capacity: 0 });
  expect(rooms.rooms.rows.every(room => room.access === 'doorway' && room.requirementSummary.missingCapability === 0)).toBe(true);
  const room = rooms.rooms.rows.find(room => room.roomCatalogId === 'room.reception')!;
  expect(room.instanceId).toBe('room.reception:5:5');
  expect(room.concurrentUse).toEqual([{ capability: 'seating', capacity: 2, inUse: 0 }, { capability: 'workstation', capacity: 2, inUse: 0 }]);
  const materials = new Map<string, number>();
  for (const order of runtime.construction.allOrders()) for (const material of order.materialsAllocated)
    materials.set(material.itemId, (materials.get(material.itemId) ?? 0) + material.quantity);
  expect(Object.fromEntries(materials)).toEqual({ 'item.brick': 106, 'item.wood-plank': 12 });
  const envelope = createSaveEnvelope({ gameVersion: 'reception-native-preparation', prisonId: `reception-q${turns}`,
    revision: 1, createdAt: 0, updatedAt: 1, ...before });
  expect(envelope.saveSchemaVersion).toBe(10);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed Reception Room V8 save refused');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  const loaded = captureSessionSnapshot(restored);
  expect(loaded, 'whole stopped V8 snapshot across every persisted subsystem').toEqual(before);
  assertReceptionRoom(loaded, turns, true);
  mkdirSync('assets/intermediate/reception-room-native-preparation', { recursive: true });
  writeFileSync(`assets/intermediate/reception-room-native-preparation/actual-typed-q${turns}-V8-roundtrip.json`,
    JSON.stringify({ quarterTurns: turns, receipt, roomProjection: rooms, materialTotals: Object.fromEntries(materials),
      wholeBefore: before, wholeAfter: loaded, wholeV8RoundtripExact: true, nativeBrowserRun: false }, null, 2));
});
