import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS } from '../../src/content/room-template-catalog';
import { roomPerimeterEnclosure } from '../../src/simulation/rooms/enclosure';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createBuildOrder } from '../../src/simulation/construction/build-order';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

describe('room template session command', () => {
  it.each([
    ['bed-wooden', 5, 4],
    ['desk-wooden', 4, 5],
  ] as const)('refuses a template over the second square of a queued %s anchored outside it', (definitionId, x, y) => {
    const runtime = createNewSimulationRuntime(72);
    runtime.construction.submitOrder(createBuildOrder('pending-object', definitionId, tile(x, y), undefined, 0));
    expect(runtime.construction.getOrder('pending-object')).toBeDefined();
    runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
    }));
    runtime.kernel.step();
    expect(runtime.construction.getOrder('pending-object')?.state).not.toBe('failed');
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    expect(runtime.construction.allOrders()).toHaveLength(1);
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: tile(5, 5) });
  });

  it('reserves the entire pending plan, including empty interior squares, through save and load', () => {
    const runtime = createNewSimulationRuntime(72);
    expect(runtime.roomTemplates.place({ templateId: 'canteen-basic', origin: { x: 10, y: 10 }, mirrorX: false, sequence: 0 })).toEqual({ ok: true });
    const nested = createRoomTemplateBuildPlan('kitchen-basic', { x: 11, y: 11 }, false, 1).plan;
    expect(runtime.roomTemplates.preflight(nested)).toEqual({
      ok: false, reason: 'structure-occupied', tile: tile(11, 11),
    });
    const restored = restoreSimulationRuntime(captureSessionSnapshot(runtime)).runtime;
    expect(restored.roomTemplates.preflight(nested)).toEqual({
      ok: false, reason: 'structure-occupied', tile: tile(11, 11),
    });
  });
  it('preflights the whole footprint of a pending two-square object, including its non-anchor square', () => {
    const runtime = createNewSimulationRuntime(72);
    const desk = createBuildOrder('pending-desk', 'desk-wooden', tile(9, 10), undefined, 0);
    runtime.construction.submitOrder(desk);
    expect(desk.state).not.toBe('failed');
    const plan = createRoomTemplateBuildPlan('cell-basic', { x: 10, y: 10 }, false, 1).plan;

    expect(runtime.roomTemplates.preflight(plan)).toEqual({
      ok: false, reason: 'object-occupied', tile: tile(10, 10),
    });
    expect(runtime.construction.allOrders()).toHaveLength(1);
  });
  it('reports the first unowned square through the existing construction refusal channel', () => {
    const runtime = createNewSimulationRuntime(72);
    runtime.kernel.submitCommand('template-unowned', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 29, y: 5 },
    }));
    runtime.kernel.step();
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unowned-land', tile: tile(32, 5) });
    expect(runtime.construction.allOrders()).toEqual([]);
  });

  it('refuses an occupied footprint atomically before any shell order enters the queue', () => {
    const runtime = createNewSimulationRuntime(72);
    runtime.world.setSquareStructure(tile(7, 7), 1);
    runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
    }));
    runtime.kernel.step();
    expect(runtime.construction.allOrders()).toEqual([]);
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable', tile: tile(7, 7) });
  });

  it('rejects an overlapping second template while the first shell is still queued', () => {
    const runtime = createNewSimulationRuntime(72);
    runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
    }));
    runtime.kernel.submitCommand('template-1', 1, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 6, y: 5 },
    }));
    runtime.kernel.step();
    expect(runtime.roomTemplates.snapshot().pending).toHaveLength(1);
    expect(runtime.construction.allOrders()).toHaveLength(createRoomTemplateBuildPlan('cell-basic', { x: 5, y: 5 }, false, 0).shellOrderIds.length);
    expect(runtime.refusals.last).toMatchObject({ reason: 'build.unbuildable' });
  });

  it('accepts one complete shell and preserves its pending zoning obligation over save/reload', () => {
    const runtime = createNewSimulationRuntime(72);
    runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
    }));
    runtime.kernel.step();
    const before = runtime.roomTemplates.snapshot();
    expect(before.pending).toEqual([{ templateId: 'cell-basic', origin: { x: 5, y: 5 }, mirrorX: false, sequence: 0 }]);
    expect(runtime.construction.allOrders()).toHaveLength(createRoomTemplateBuildPlan('cell-basic', { x: 5, y: 5 }, false, 0).shellOrderIds.length);
    expect(runtime.construction.allOrders().every((order) => order.state !== 'failed')).toBe(true);

    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0', prisonId: 'room-template-test', revision: 1,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('Room template save must decode');
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle);
    expect(restored.runtime.roomTemplates.snapshot()).toEqual(before);
    expect(restored.runtime.construction.allOrders()).toEqual(runtime.construction.allOrders());
    for (let tick = 0; tick < 4000; tick += 1) {
      runtime.kernel.step();
      restored.runtime.kernel.step();
      if (runtime.roomTemplates.snapshot().pending.length === 0 &&
          runtime.construction.allOrders().every((order) => order.state === 'completed')) break;
    }
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    expect(restored.runtime.roomTemplates.snapshot().pending).toEqual([]);
    expect(restored.runtime.construction.allOrders()).toEqual(runtime.construction.allOrders());
    expect(restored.runtime.placedObjects.getSnapshot()).toEqual(runtime.placedObjects.getSnapshot());
    expect(restored.runtime.world.snapshot()).toEqual(runtime.world.snapshot());
  });

  it.each(ROOM_TEMPLATE_IDS.flatMap((templateId) => [false, true].map((mirrorX) => ({ templateId, mirrorX }))))('builds, zones, furnishes and reloads $templateId mirrored=$mirrorX through scheduled construction', ({ templateId, mirrorX }) => {
    const runtime = createNewSimulationRuntime(73);
    runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId, origin: { x: 5, y: 5 }, mirrorX,
    }));
    for (let tick = 0; tick < 20000 && (runtime.roomTemplates.snapshot().pending.length > 0 || tick === 0); tick += 1) {
      runtime.kernel.step();
    }
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    const preview = createRoomTemplateBuildPlan(templateId, { x: 5, y: 5 }, mirrorX, 0).plan;
    for (const zone of preview.zones) {
      expect(runtime.prisoners.roomInstances.getById(`${zone.roomId}:${zone.x}:${zone.y}`)).toBeDefined();
      expect(roomPerimeterEnclosure(runtime.world, zone).enclosure).toBe(zone.roomId === 'room.yard' ? 'open' : 'sealed');
    }
    const objectOrders = runtime.construction.allOrders().filter((order) => order.id.includes('-2-object-'));
    expect(objectOrders).toHaveLength(preview.objects.length);
    for (let tick = 0; tick < 5000 && objectOrders.some((order) => order.state !== 'completed'); tick += 1) {
      runtime.kernel.step();
    }
    expect(objectOrders.every((order) => order.state === 'completed')).toBe(true);
    for (const object of preview.objects) expect(runtime.placedObjects.isTileOccupied(tile(object.x, object.y))).toBe(true);
    for (const square of preview.wallSquares) expect(runtime.world.getSquareStructure(tile(square.x, square.y))).toBe(1);
    for (const object of preview.objects) expect(runtime.world.getSquareStructure(tile(object.x, object.y))).toBe(0);
    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0', prisonId: 'room-template-test', revision: 1,
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('Room template save must decode');
    const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle);
    expect(restored.runtime.world.snapshot()).toEqual(runtime.world.snapshot());
    expect(restored.runtime.placedObjects.getSnapshot()).toEqual(runtime.placedObjects.getSnapshot());
    for (const zone of preview.zones) {
      expect(restored.runtime.prisoners.roomInstances.getById(`${zone.roomId}:${zone.x}:${zone.y}`)).toBeDefined();
      expect(roomPerimeterEnclosure(restored.runtime.world, zone).enclosure).toBe(zone.roomId === 'room.yard' ? 'open' : 'sealed');
    }
  }, 30000);
});
