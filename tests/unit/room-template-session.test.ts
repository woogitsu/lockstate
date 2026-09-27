import { describe, expect, it } from 'vitest';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { packCommand } from '../../src/simulation/protocol/commands';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { createRoomTemplateBuildPlan } from '../../src/simulation/construction/room-template-build-plan';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

describe('room template session command', () => {
  it('refuses an occupied footprint atomically before any shell order enters the queue', () => {
    const runtime = createNewSimulationRuntime(72);
    runtime.world.setSquareStructure(tile(7, 7), 1);
    runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
    }));
    runtime.kernel.step();
    expect(runtime.construction.allOrders()).toEqual([]);
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
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
  });

  it('builds, zones and furnishes a real Cell through scheduled construction', () => {
    const runtime = createNewSimulationRuntime(73);
    runtime.kernel.submitCommand('template-0', 0, runtime.kernel.tick, packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 5, y: 5 },
    }));
    for (let tick = 0; tick < 20000 && (runtime.roomTemplates.snapshot().pending.length > 0 || tick === 0); tick += 1) {
      runtime.kernel.step();
    }
    expect(runtime.roomTemplates.snapshot().pending).toEqual([]);
    expect(runtime.prisoners.roomInstances.getById('room.cell:6:6')).toBeDefined();
    const objectOrders = runtime.construction.allOrders().filter((order) => order.id.includes('-2-object-'));
    expect(objectOrders).toHaveLength(2);
    for (let tick = 0; tick < 5000 && objectOrders.some((order) => order.state !== 'completed'); tick += 1) {
      runtime.kernel.step();
    }
    expect(objectOrders.every((order) => order.state === 'completed')).toBe(true);
    expect(runtime.placedObjects.isTileOccupied(tile(6, 6))).toBe(true);
    expect(runtime.placedObjects.isTileOccupied(tile(7, 9))).toBe(true);
  }, 30000);
});
