import { expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, type AuthoredRoomTemplateId } from '../../src/content/room-template-catalog';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import type { RoomTemplateCostView } from '../../src/simulation/presentation/room-template-cost';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { formatRoomTemplateQuote } from '../../src/ui/hud/room-template-quote';

type Runtime = ReturnType<typeof createNewSimulationRuntime>;
const orientations = [false, true].flatMap(mirrorX => ([0, 1, 2, 3] as const).map(quarterTurns => ({ mirrorX, quarterTurns })));
const locale = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

function send(runtime: Runtime, command: SimulationCommand) {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`template-economy-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
}

function until(runtime: Runtime, condition: () => boolean) {
  for (let ticks = 0; ticks < 30_000 && !condition(); ticks++) runtime.kernel.step();
  expect(condition()).toBe(true);
}

function finish(runtime: Runtime) {
  until(runtime, () => runtime.roomTemplates.snapshot().pending.length === 0 &&
    runtime.construction.allOrders().every(order => order.state === 'completed'));
}

function reload(runtime: Runtime): Runtime {
  const bundle = captureSessionSnapshot(runtime);
  const encoded = createSaveEnvelope({
    gameVersion: 'test', prisonId: 'template-economy', revision: 1, createdAt: 0, updatedAt: 1,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(encoded)));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('Template financial state must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime;
}

function quote(runtime: Runtime, templateId: AuthoredRoomTemplateId) {
  return PROJECTION_CATALOG['world/room-template-cost'].project(runtime, runtime.kernel.tick, {
    target: { kind: 'room-template', templateId, origin: { x: 5, y: 5 } },
  }).view as unknown as RoomTemplateCostView;
}

// Catalogue value is distinct from a debit: shell and fixture orders are
// submitted in stages, and stock can reduce a debit. Here fresh sessions start
// with no stock, no residents/income and no staff/payroll, so actual completed
// procurement must equal the worker's whole-template quote exactly.
it.each(ROOM_TEMPLATE_IDS)('charges the worker whole-template quote once per actual completed %s build after encoded Load', templateId => {
  let runtime = createNewSimulationRuntime(73);
  const expected = quote(runtime, templateId);
  expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
  send(runtime, { type: 'PlaceRoomTemplate', templateId, origin: { x: 5, y: 5 } });
  runtime = reload(runtime);
  finish(runtime);
  expect(runtime.construction.allOrders()).toHaveLength(expected.orderCount);
  expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - expected.catalogueCostMinorUnits!);
  const quantities = new Map<string, number>();
  for (const order of runtime.construction.allOrders()) for (const material of order.materialsAllocated)
    quantities.set(material.itemId, (quantities.get(material.itemId) ?? 0) + material.quantity);
  expect([...quantities].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([itemId, quantity]) => ({ itemId, quantity })))
    .toEqual(expected.materials);
  runtime = reload(runtime);
  send(runtime, { type: 'Undo' });
  // Approved completed-cancellation policy destroys the already used spend.
  expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - expected.catalogueCostMinorUnits!);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.treasury.balanceMinorUnits).toBe(25_000 - 2 * expected.catalogueCostMinorUnits!);
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
});

it.each(orientations)('quotes staged Cell materials while a saved paid delivery cancellation refunds the entire pending gesture, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  const expected = quote(runtime, 'cell-basic');
  expect(expected).toEqual({ orderCount: 20, materials: [
    { itemId: 'item.brick', quantity: 35 }, { itemId: 'item.wood-plank', quantity: 2 },
  ], catalogueCostMinorUnits: 1_530 });
  expect(formatRoomTemplateQuote(locale, expected)).toBe('Brick × 35 · Wood Plank × 2 · Materials catalogue value: 1,530');
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 }, ...orientation });
  runtime.kernel.step();
  // Seventeen 80-cost square walls + one 65-cost door. The 65-cost bed
  // and 40-cost toilet are quoted but not submitted until the shell stands.
  expect(runtime.treasury.balanceMinorUnits).toBe(23_575);
  expect(runtime.construction.allOrders()).toHaveLength(18);
  expect(runtime.procurement.pendingDeliveries.reduce((sum, delivery) => sum + delivery.paidMinorUnits, 0)).toBe(1_425);
  runtime = reload(runtime);
  const delivery = runtime.procurement.pendingDeliveries.find(row => row.itemId === 'item.brick')!;
  expect(delivery).toBeDefined();
  send(runtime, { type: 'CancelMaterialPurchase', orderId: delivery.orderId });
  expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled')).toBe(true);
  expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
  runtime = reload(runtime);
  for (let ticks = 0; ticks < 300; ticks++) runtime.kernel.step();
  expect(runtime.treasury.balanceMinorUnits).toBe(25_000);
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
});

it.each(orientations)('refunds saved assigned row fixtures but retains started spend before saved Redo, mirror=$mirrorX turn=$quarterTurns', orientation => {
  let runtime = createNewSimulationRuntime(73);
  const expected = quote(runtime, 'cell-row-four');
  expect(expected).toEqual({ orderCount: 66, materials: [
    { itemId: 'item.brick', quantity: 112 }, { itemId: 'item.wood-plank', quantity: 8 },
  ], catalogueCostMinorUnits: 5_000 });
  expect(formatRoomTemplateQuote(locale, expected)).toBe('Brick × 112 · Wood Plank × 8 · Materials catalogue value: 5,000');
  send(runtime, { type: 'PlaceRoomTemplate', templateId: 'cell-row-four', origin: { x: 5, y: 5 }, ...orientation });
  until(runtime, () => runtime.construction.allOrders().some(order => order.id.includes('-2-object-') && order.state === 'in-progress'));
  const orders = runtime.construction.allOrders();
  expect(orders.filter(order => order.state === 'completed')).toHaveLength(58);
  expect(orders.filter(order => order.state === 'in-progress').map(order => order.definitionId)).toEqual(['bed-wooden']);
  expect(orders.filter(order => order.state === 'assigned')).toHaveLength(7);
  expect(runtime.treasury.balanceMinorUnits).toBe(20_000);
  runtime = reload(runtime);
  send(runtime, { type: 'Undo' });
  // Shell: 54 walls ×80 +4 doors ×65 =4,580; first bed is started (65).
  // Refund: 3 assigned beds ×65 +4 assigned toilets ×40 =355. No materials
  // are manufactured or preserved beside that monetary refund.
  expect(runtime.treasury.balanceMinorUnits).toBe(20_355);
  expect(runtime.construction.allOrders().every(order => order.state === 'cancelled' && order.materialsAllocated.length === 0)).toBe(true);
  expect(runtime.procurement.pendingDeliveries).toEqual([]);
  expect(runtime.placedObjects.getSnapshot()).toEqual([]);
  runtime = reload(runtime);
  send(runtime, { type: 'Redo' });
  finish(runtime);
  expect(runtime.treasury.balanceMinorUnits).toBe(15_355);
  expect(runtime.placedObjects.getSnapshot()).toHaveLength(8);
  runtime = reload(runtime);
  expect(runtime.treasury.balanceMinorUnits).toBe(15_355);
  expect(quote(runtime, 'cell-row-four')).toEqual(expected);
});
