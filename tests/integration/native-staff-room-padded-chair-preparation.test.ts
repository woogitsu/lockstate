import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { projectRoomTemplateCost } from '../../src/simulation/presentation/room-template-cost';
import { projectRoomTemplatePreflight } from '../../src/simulation/presentation/room-template-preflight';
import { instantiateRoomTemplateForConstruction } from '../../src/simulation/construction/room-template-build-plan';
import { assertStaffNativeOwners } from '../browser/staff-room-padded-chair/native-evidence';

const plans = [
  { templateId: 'storage-room-basic', origin: { x: 5, y: 5 }, orders: 18, cost: 1395, cumulativeOrders: 18, balance: 23605 },
  { templateId: 'delivery-bay-basic', origin: { x: 12, y: 5 }, orders: 21, cost: 1780, cumulativeOrders: 39, balance: 21825 },
  { templateId: 'staff-room-basic', origin: { x: 20, y: 5 }, orders: 23, cost: 1845, cumulativeOrders: 62, balance: 19980 },
] as const;

it.each([0, 1] as const)('prepares the existing public Staff route q%s with paid owners and whole V9 roundtrip', turns => {
  const runtime = createNewSimulationRuntime(73);
  expect(runtime.treasury.balanceMinorUnits).toBe(25000);
  const receipt: { templateId: string; elapsedTicks: number; balance: number; completedOrders: number }[] = [];
  for (const plan of plans) {
    const quarterTurns = plan.templateId === 'staff-room-basic' ? turns : 0;
    const geometry = instantiateRoomTemplateForConstruction(plan.templateId, plan.origin, false, quarterTurns);
    expect(plan.origin.x + geometry.width).toBeLessThanOrEqual(32);
    expect(plan.origin.y + geometry.height).toBeLessThanOrEqual(32);
    expect(projectRoomTemplateCost(plan.templateId)).toMatchObject({ orderCount: plan.orders, catalogueCostMinorUnits: plan.cost });
    expect(projectRoomTemplatePreflight(runtime.roomTemplates, plan.templateId, plan.origin, false, quarterTurns)).toEqual({ ok: true });
    if (plan.templateId === 'staff-room-basic') {
      const expected = turns === 0 ? [[21,6,2,1,0],[21,7,1,1,0],[23,8,1,1,0]] : [[24,6,1,2,1],[23,6,1,1,1],[22,8,1,1,1]];
      expect(geometry.objects.map(object => [object.x, object.y, object.width, object.height, object.quarterTurns])).toEqual(expected);
    }
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`staff-preparation-${sequence}`, sequence, runtime.kernel.tick,
      packCommand({ type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin,
        ...(quarterTurns === 0 ? {} : { quarterTurns }) }));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
    const completed = () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed');
    let ticks = 0;
    for (; ticks < 15000 && !completed(); ticks++) runtime.kernel.step();
    expect(completed(), 'actual public deliveries/builders must complete the existing paid plan').toBe(true);
    expect(runtime.treasury.balanceMinorUnits).toBe(plan.balance);
    expect(runtime.construction.allOrders()).toHaveLength(plan.cumulativeOrders);
    receipt.push({ templateId: plan.templateId, elapsedTicks: ticks, balance: runtime.treasury.balanceMinorUnits,
      completedOrders: runtime.construction.allOrders().length });
  }
  const before = captureSessionSnapshot(runtime); assertStaffNativeOwners(before, turns);
  const envelope = createSaveEnvelope({ gameVersion: 'staff-chair-native-preparation', prisonId: `staff-chair-q${turns}`,
    revision: 1, createdAt: 0, updatedAt: 1, ...before });
  expect(envelope.saveSchemaVersion).toBe(10);
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Actual completed Staff V9 save refused');
  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
  const loaded = captureSessionSnapshot(restored);
  expect(loaded, 'whole current V9 snapshot across every persisted subsystem').toEqual(before);
  assertStaffNativeOwners(loaded, turns);
  mkdirSync('assets/intermediate/staff-room-padded-chair-native-preparation', { recursive: true });
  writeFileSync(`assets/intermediate/staff-room-padded-chair-native-preparation/actual-typed-q${turns}-V9-roundtrip.json`,
    JSON.stringify({ quarterTurns: turns, receipt, wholeBefore: before, wholeAfter: loaded,
      wholeV9RoundtripExact: true, nativeBrowserRun: false }, null, 2));
});
