import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand, placeObjectSchema } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomTemplatePreflight } from '../../src/simulation/presentation/room-template-preflight';
import { instantiateRoomTemplateForConstruction } from '../../src/simulation/construction/room-template-build-plan';
import { objectFootprintTiles } from '../../src/simulation/objects/placed-object';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import type { RoomListViewModel } from '../../src/simulation/presentation/room-projection';
import { CLASSROOM_BOOTSTRAP, CLASSROOM_CASES, CLASSROOM_DESK, CLASSROOM_ORIGIN, CLASSROOM_PLAN } from '../fixtures/native-classroom-desk-plan';
import { assertClassroomCapacity, assertClassroomDesk, assertClassroomPlan } from '../browser/native-classroom-desk-evidence';

it.each([0, 1] as const)('buys a separate public orientation0 desk inside literal Classroom q%s and roundtrips whole V8', turns => {
  const runtime = createNewSimulationRuntime(73);
  const receipts: { templateId: string; elapsedTicks: number; balance: number; completedOrders: number }[] = [];
  const submit = (command: Parameters<typeof packCommand>[0]): void => {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`classroom-preparation-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  };
  const finish = (): number => {
    const completed = () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed');
    let ticks = 0;
    for (; ticks < 15000 && !completed(); ticks++) runtime.kernel.step();
    expect(completed(), 'actual public procurement and construction completes').toBe(true);
    return ticks;
  };
  expect(runtime.treasury.balanceMinorUnits).toBe(25000);
  for (const plan of [...CLASSROOM_BOOTSTRAP, { ...CLASSROOM_PLAN, origin: CLASSROOM_ORIGIN }]) {
    const quarterTurns = plan.templateId === 'classroom-basic' ? turns : 0;
    const geometry = instantiateRoomTemplateForConstruction(plan.templateId, plan.origin, false, quarterTurns);
    expect(plan.origin.x + geometry.width).toBeLessThanOrEqual(32);
    expect(plan.origin.y + geometry.height).toBeLessThanOrEqual(32);
    expect(projectRoomTemplateCost(plan.templateId)).toMatchObject({ orderCount: plan.orders, catalogueCostMinorUnits: plan.cost });
    expect(projectRoomTemplatePreflight(runtime.roomTemplates, plan.templateId, plan.origin, false, quarterTurns)).toEqual({ ok: true });
    if (plan.templateId === 'classroom-basic') {
      assertClassroomCapacity(captureSessionSnapshot(runtime));
      expect({ width: geometry.width, height: geometry.height }).toEqual({ width: 7, height: 7 });
      expect(geometry.objects.map(object => [object.buildableId, object.x, object.y, object.width, object.height, object.quarterTurns])).toEqual(
        CLASSROOM_CASES[turns].objects.map(([, id, x, y, width, height]) => [id, x, y, width, height, turns]));
    }
    submit({ type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin, ...(quarterTurns === 0 ? {} : { quarterTurns }) });
    if (plan.templateId === 'classroom-basic') assertClassroomPlan(captureSessionSnapshot(runtime), turns, false);
    const elapsedTicks = finish();
    expect(elapsedTicks).toBe(plan.ticks); expect(runtime.treasury.balanceMinorUnits).toBe(plan.balance);
    expect(runtime.construction.allOrders()).toHaveLength(plan.cumulativeOrders);
    receipts.push({ templateId: plan.templateId, elapsedTicks, balance: runtime.treasury.balanceMinorUnits, completedOrders: plan.cumulativeOrders });
  }
  const beforeDesk = captureSessionSnapshot(runtime);
  assertClassroomPlan(beforeDesk, turns, true);
  const slot = CLASSROOM_CASES[turns];
  const footprint = objectFootprintTiles(defaultObjectRegistry.getById('object.desk')!, { x: tileCoordinate(slot.desk.x), y: tileCoordinate(slot.desk.y) }, 0);
  expect(footprint.map(tile => [tile.x, tile.y])).toEqual(slot.deskTiles);
  const occupied = new Set(CLASSROOM_CASES[turns].objects.flatMap(([, , x, y, width, height]) =>
    Array.from({ length: width * height }, (_, i) => `${x + i % width}:${y + Math.floor(i / width)}`)));
  for (const tile of footprint) {
    expect(tile.x).toBeGreaterThanOrEqual(5); expect(tile.x).toBeLessThan(10);
    expect(tile.y).toBeGreaterThanOrEqual(5); expect(tile.y).toBeLessThan(10);
    expect(occupied.has(`${tile.x}:${tile.y}`), 'literal desk square is free of all retained template objects').toBe(false);
  }
  expect(occupied.size).toBe(6);
  expect(getBuildableDefinition('desk-wooden')).toMatchObject({ workRequired: 60, materialsRequired: CLASSROOM_DESK.materials });
  const owner = 'classroom-individual-desk';
  // Same separate public purchase then PlaceObject generated by Build UI.
  submit({ type: 'PurchaseMaterials', orderId: 'classroom-desk-materials', itemId: 'item.wood-plank', quantity: 2 });
  expect(runtime.treasury.balanceMinorUnits).toBe(19400);
  submit({ type: 'PlaceObject', orderId: owner, definitionId: 'desk-wooden', ...slot.desk });
  const queued = captureSessionSnapshot(runtime);
  expect(queued.construction.orders.find(order => order.id === owner)).toMatchObject({ id: owner, definitionId: 'desk-wooden', location: slot.desk, state: 'approved' });
  const deskElapsedTicks = finish(); expect(deskElapsedTicks).toBe(180);
  const before = captureSessionSnapshot(runtime); assertClassroomDesk(before, turns, owner);
  // Existing individual public protocol genuinely refuses invented rotation.
  expect(placeObjectSchema.safeParse({ type: 'PlaceObject', orderId: 'bad-rotation', definitionId: 'desk-wooden', ...slot.desk, orientation: 1 }).success).toBe(false);
  const rooms = PROJECTION_CATALOG['hud/room-list'].project(runtime, runtime.kernel.tick, {}).view as unknown as RoomListViewModel;
  expect(rooms.totals).toEqual({ instances: 3, occupants: 0, capacity: 0 });
  expect(rooms.rooms.rows.find(room => room.roomCatalogId === 'room.classroom')).toMatchObject({
    instanceId: 'room.classroom:5:5', access: 'doorway', requirementSummary: { missingCapability: 0, notEvaluated: 2 },
    concurrentUse: [{ capability: 'education', capacity: 2, inUse: 0 }, { capability: 'seating', capacity: 4, inUse: 0 }, { capability: 'workstation', capacity: 2, inUse: 0 }],
  });
  const materials = new Map<string, number>();
  for (const order of runtime.construction.allOrders()) for (const material of order.materialsAllocated)
    materials.set(material.itemId, (materials.get(material.itemId) ?? 0) + material.quantity);
  expect(Object.fromEntries(materials)).toEqual({ 'item.brick': 114, 'item.wood-plank': 16 });
  const envelope = createSaveEnvelope({ gameVersion: 'classroom-desk-native-preparation', prisonId: `classroom-q${turns}`, revision: 1, createdAt: 0, updatedAt: 1, ...before });
  expect(envelope.saveSchemaVersion).toBe(8);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope))); expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed Classroom desk V8 refused');
  const loaded = captureSessionSnapshot(restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime);
  expect(loaded, 'ALL persisted subsystem state survives whole V8 roundtrip').toEqual(before);
  assertClassroomDesk(loaded, turns, owner);
  mkdirSync('assets/intermediate/classroom-desk-native-preparation', { recursive: true });
  writeFileSync(`assets/intermediate/classroom-desk-native-preparation/actual-typed-q${turns}-V8-roundtrip.json`,
    JSON.stringify({ turns, receipts, beforeDesk, queued, deskElapsedTicks, rooms, materialTotals: Object.fromEntries(materials), wholeBefore: before, wholeAfter: loaded,
      wholeV8RoundtripExact: true, publicIndividualDeskOrientation: 0, nativeBrowserRun: false }, null, 2));
});
