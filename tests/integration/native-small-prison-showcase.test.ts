import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomTemplatePreflight } from '../../src/simulation/presentation/room-template-preflight';
import type { RoomListViewModel } from '../../src/simulation/presentation/room-projection';
import { instantiateRoomTemplateForConstruction } from '../../src/simulation/construction/room-template-build-plan';
import { packCommand } from '../../src/simulation/protocol/commands';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { SMALL_PRISON_PLANS, SMALL_PRISON_FIXTURES, SMALL_PRISON_ROOM_IDS, showcaseOwnerId } from '../fixtures/native-small-prison-showcase-plan';

/** Every placement is an ordinary typed command; deliveries and the actual
 * builder finish it. No snapshots/objects/stock/treasury are injected.
 * Kernel preparation does not claim a built-client native pass. */
it('builds the literal four-cell prison within 25k and retains the whole stopped save', () => {
  const runtime = createNewSimulationRuntime(73);
  expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
  let elapsedTicks = 0;
  for (const [index, plan] of SMALL_PRISON_PLANS.entries()) {
    const geometry = instantiateRoomTemplateForConstruction(plan.templateId, plan.origin, false, plan.quarterTurns);
    expect({ width: geometry.width, height: geometry.height }).toEqual({ width: plan.width, height: plan.height });
    expect(plan.origin.x).toBeGreaterThanOrEqual(0);
    expect(plan.origin.y).toBeGreaterThanOrEqual(0);
    expect(plan.origin.x + geometry.width).toBeLessThanOrEqual(32);
    expect(plan.origin.y + geometry.height).toBeLessThanOrEqual(32);
    for (const prior of SMALL_PRISON_PLANS.slice(0, index)) {
      const overlaps = plan.origin.x < prior.origin.x + prior.width && plan.origin.x + plan.width > prior.origin.x
        && plan.origin.y < prior.origin.y + prior.height && plan.origin.y + plan.height > prior.origin.y;
      expect(overlaps, `${plan.templateId} overlaps ${prior.templateId}`).toBe(false);
    }
    expect(projectRoomTemplateCost(plan.templateId)).toMatchObject({ orderCount: plan.orders, catalogueCostMinorUnits: plan.cost });
    expect(projectRoomTemplatePreflight(runtime.roomTemplates, plan.templateId, plan.origin, false, plan.quarterTurns)).toEqual({ ok: true });
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`showcase-${sequence}`, sequence, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin, quarterTurns: plan.quarterTurns,
    }));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
    const complete = () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(o => o.state === 'completed');
    let ticks = 0;
    for (; ticks < 30_000 && !complete(); ticks++) runtime.kernel.step();
    elapsedTicks += ticks;
    expect(complete(), `real deliveries/builder stalled at ${plan.templateId}`).toBe(true);
    expect(runtime.treasury.balanceMinorUnits).toBe(plan.balance);
    expect(runtime.construction.allOrders()).toHaveLength(plan.cumulativeOrders);
    const rooms = PROJECTION_CATALOG['hud/room-list'].project(runtime, runtime.kernel.tick, {}).view as unknown as RoomListViewModel;
    expect(rooms.totals.instances).toBe(plan.rooms);
    expect(rooms.rooms.rows.every(room => room.requirementSummary.missingCapability === 0)).toBe(true);
    const fixtures = SMALL_PRISON_FIXTURES.filter(([gesture]) => gesture <= index);
    expect(runtime.placedObjects.getSnapshot()).toHaveLength(fixtures.length);
    for (const [gesture, fixture, definitionId, objectId, x, y, orientation] of fixtures) {
      const id = showcaseOwnerId(gesture, fixture);
      expect(runtime.placedObjects.getSnapshot().find(o => o.placedObjectId === `object:${x}:${y}`)).toEqual({
        placedObjectId: `object:${x}:${y}`, objectId, anchorTile: { x, y }, orientation, sourceOrderId: id,
      });
      expect(runtime.construction.allOrders().find(o => o.id === id)).toMatchObject({ definitionId, location: { x, y }, state: 'completed' });
      expect(runtime.construction.allOrders().find(o => o.id === id)!.objectOrientation ?? 0).toBe(orientation);
    }
  }
  expect(elapsedTicks).toBe(11_981);
  expect(runtime.roomTemplates.snapshot().completed).toHaveLength(7);
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
  expect(runtime.construction.allOrders().filter(o => o.definitionId === 'wall-brick')).toHaveLength(149);
  expect(runtime.construction.allOrders().filter(o => o.definitionId === 'door-wooden')).toHaveLength(9);
  const rooms = PROJECTION_CATALOG['hud/room-list'].project(runtime, runtime.kernel.tick, {}).view as unknown as RoomListViewModel;
  expect(rooms.rooms.rows.map(room => room.instanceId)).toEqual(SMALL_PRISON_ROOM_IDS);
  expect(rooms.totals).toEqual({ instances: 10, occupants: 0, capacity: 4 });
  expect(rooms.rooms.rows.map(room => room.access)).toEqual(Array.from({ length: 10 }, (_, index) => index === 9 ? 'gap' : 'doorway'));
  const quantities = new Map<string, number>();
  for (const order of runtime.construction.allOrders()) for (const m of order.materialsAllocated)
    quantities.set(m.itemId, (quantities.get(m.itemId) ?? 0) + m.quantity);
  expect(Object.fromEntries(quantities)).toEqual({ 'item.brick': 309, 'item.wood-plank': 32 });
  expect(25_000 - runtime.treasury.balanceMinorUnits).toBe(14_440);
  const before = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({ gameVersion: 'showcase-preparation', prisonId: 'small-prison-showcase', revision: 1,
    createdAt: 0, updatedAt: 1, ...before });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('actual completed showcase save refused');
  const loaded = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  // No step between captures: every persisted subsystem must survive.
  expect(captureSessionSnapshot(loaded)).toEqual(before);
});