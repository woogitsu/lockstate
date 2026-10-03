import { expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand, placeObjectSchema } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { objectFootprintTiles } from '../../src/simulation/objects/placed-object';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { CLASSROOM_BOOTSTRAP, CLASSROOM_ORIGIN } from '../fixtures/native-classroom-desk-plan';

const base = { type: 'PlaceObject', orderId: 'desk', definitionId: 'desk-wooden', x: 8, y: 5 } as const;

it('strictly carries approved optional quarterTurns and preserves the old omitted default', () => {
  expect(packCommand(placeObjectSchema.parse(base)).data).toEqual(base);
  for (const quarterTurns of [0, 1, 2, 3]) {
    const parsed = placeObjectSchema.safeParse({ ...base, quarterTurns });
    expect(parsed.success, `approved quarterTurns ${quarterTurns}`).toBe(true);
    if (parsed.success) expect(packCommand(parsed.data).data).toEqual({ ...base, quarterTurns });
  }
  for (const quarterTurns of [-1, 4, 1.5, '1', null])
    expect(placeObjectSchema.safeParse({ ...base, quarterTurns }).success).toBe(false);
  expect(placeObjectSchema.safeParse({ ...base, orientation: 1 }).success).toBe(false);
  expect(placeObjectSchema.safeParse({ ...base, objectOrientation: 1 }).success).toBe(false);
});

it('purchases and builds individual desks through the typed kernel, checks secondary claims, and restores whole V8', () => {
  const runtime = createNewSimulationRuntime(73);
  const submit = (command: Parameters<typeof packCommand>[0]): void => {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`individual-rotation-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  };
  const finish = (): void => {
    const completed = () => runtime.roomTemplates.snapshot().pending.length === 0 && runtime.construction.allOrders().every(order => order.state === 'completed');
    for (let ticks = 0; ticks < 15000 && !completed(); ticks++) runtime.kernel.step();
    expect(completed(), 'real purchased materials reach completed construction').toBe(true);
  };
  const roundtrip = (): void => {
    const before = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({ gameVersion: 'individual-rotation-proof', prisonId: 'individual-rotation', revision: 1, createdAt: 0, updatedAt: 1, ...before });
    expect(envelope.saveSchemaVersion).toBe(9);
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('actual oriented purchase V8 refused');
    expect(captureSessionSnapshot(restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle).runtime), 'ALL persisted subsystems').toEqual(before);
  };
  for (const plan of [...CLASSROOM_BOOTSTRAP, { templateId: 'classroom-basic', origin: CLASSROOM_ORIGIN }] as const) {
    submit({ type: 'PlaceRoomTemplate', templateId: plan.templateId, origin: plan.origin });
    finish();
  }
  expect(runtime.treasury.balanceMinorUnits).toBe(19530);
  expect(getBuildableDefinition('desk-wooden')).toMatchObject({ materialsRequired: [{ itemId: 'item.wood-plank', quantity: 2 }], workRequired: 60 });
  submit({ type: 'PurchaseMaterials', orderId: 'individual-desks-materials', itemId: 'item.wood-plank', quantity: 8 });
  expect(runtime.treasury.balanceMinorUnits).toBe(19010); // 4 identical exact 130 quotes.
  const cases = [
    { orderId: 'individual-q1', x: 8, y: 5, quarterTurns: 1, tiles: [[8, 5], [8, 6]] },
    { orderId: 'individual-q3', x: 9, y: 7, quarterTurns: 3, tiles: [[9, 7], [9, 8]] },
    { orderId: 'individual-q2', x: 8, y: 9, quarterTurns: 2, tiles: [[8, 9], [9, 9]] },
    { orderId: 'individual-default', x: 6, y: 9, tiles: [[6, 9], [7, 9]] },
  ] as const;
  for (const slot of cases) {
    const { tiles: _tiles, ...placement } = slot;
    submit(placeObjectSchema.parse({ ...base, ...placement }));
    expect(runtime.construction.getOrder(slot.orderId)).toMatchObject({ state: 'approved', location: { x: slot.x, y: slot.y },
      ...('quarterTurns' in slot ? { objectOrientation: slot.quarterTurns } : {}) });
  }
  const beforeRefusal = runtime.construction.allOrders().length;
  // Anchor 7,6 is still free in the registry; ONLY secondary tile 8,6 is claimed by q1.
  submit(placeObjectSchema.parse({ ...base, orderId: 'secondary-pending-collision', x: 7, y: 6, quarterTurns: 0 }));
  expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({ reason: 'tile-occupied', tile: { x: 8, y: 6 } });
  expect(runtime.construction.allOrders()).toHaveLength(beforeRefusal);
  roundtrip(); // The actual pending orders retain their nondefault orientation too.
  finish();
  expect(runtime.treasury.balanceMinorUnits).toBe(19010);
  for (const slot of cases) {
    const placed = runtime.placedObjects.getSnapshot().find(object => object.sourceOrderId === slot.orderId);
    expect(placed).toMatchObject({ objectId: 'object.desk', anchorTile: { x: slot.x, y: slot.y }, orientation: 'quarterTurns' in slot ? slot.quarterTurns : 0 });
    if (!placed) throw new Error(`missing actual completed ${slot.orderId}`);
    expect(objectFootprintTiles(defaultObjectRegistry.getById('object.desk')!, placed.anchorTile, placed.orientation).map(tile => [tile.x, tile.y])).toEqual(slot.tiles);
    expect(runtime.construction.getOrder(slot.orderId)).toMatchObject({ state: 'completed', materialsAllocated: [{ itemId: 'item.wood-plank', quantity: 2 }] });
  }
  submit(placeObjectSchema.parse({ ...base, orderId: 'secondary-standing-collision', x: 7, y: 5, quarterTurns: 0 }));
  expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({ reason: 'tile-occupied', tile: { x: 8, y: 5 } });
  expect(runtime.construction.allOrders()).toHaveLength(beforeRefusal);
  roundtrip();
});

it('refuses a rotated second square on unloaded land before room containment', () => {
  const runtime = createNewSimulationRuntime(73);
  const command = placeObjectSchema.parse({ ...base, orderId: 'boundary-rotated', x: 8, y: 31, quarterTurns: 1 });
  runtime.kernel.submitCommand('boundary', runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  expect(runtime.kernel.dispatchDueCommands()).toBe(1);
  expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject({ reason: 'out-of-bounds', tile: { x: 8, y: 32 } });
  expect(runtime.construction.allOrders()).toHaveLength(0);
});

it('checks ownership of a loaded secondary square, retaining the unrotated anchor control', () => {
  const runtime = createNewSimulationRuntime(73);
  // Normal world streaming loads the neighbour; it does not grant ownership.
  runtime.world.load({ x: chunkCoordinate(0), y: chunkCoordinate(1) });
  for (const quarterTurns of [1, 0] as const) {
    const sequence = runtime.kernel.expectedSequence;
    runtime.kernel.submitCommand(`loaded-boundary-${quarterTurns}`, sequence, runtime.kernel.tick,
      packCommand(placeObjectSchema.parse({ ...base, orderId: `loaded-boundary-${quarterTurns}`, x: 8, y: 31, quarterTurns })));
    expect(runtime.kernel.dispatchDueCommands()).toBe(1);
    expect(runtime.objectPlacement.recentRefusals().at(-1)).toMatchObject(quarterTurns === 1
      ? { reason: 'unowned-land', tile: { x: 8, y: 32 } }
      : { reason: 'outside-room', tile: { x: 8, y: 31 } });
    expect(runtime.construction.allOrders()).toHaveLength(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(25000);
  }
});
