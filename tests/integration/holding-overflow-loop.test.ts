import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { stateIncomeForCompletedDay } from '../../src/simulation/economy/income';
import { packCommand } from '../../src/simulation/protocol/commands';
import { HOLDING_FULL_DAY_TICKS, HOLDING_GRACE_TICKS } from '../../src/simulation/prisoners/needs-system';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { wallRoomPerimeter } from '../helpers/room-walls';

const ROOM = { x: 4, y: 6, width: 2, height: 2 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function saveAndLoad(runtime: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'holding-loop', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('the holding save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 590).runtime;
}

describe('a player-built holding cell (#590)', () => {
  it('admits into bench capacity, earns only an occupied place, and keeps pressure age across save/load', () => {
    const runtime = createNewSimulationRuntime(590);
    submit(runtime, 'buy-benches', packCommand({ type: 'PurchaseMaterials', orderId: 'benches', itemId: 'item.wood-plank', quantity: 3 }));
    wallRoomPerimeter(runtime.world, ROOM, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-holding', packCommand({ type: 'ZoneRoom', roomId: 'room.holding-cell', ...ROOM }));
    submit(runtime, 'place-bench', packCommand({ type: 'PlaceObject', orderId: 'bench', definitionId: 'bench-wooden', x: ROOM.x, y: ROOM.y }));
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed', definitionId: 'bed-wooden', x: ROOM.x, y: ROOM.y + 1 }));
    stepTo(runtime, 1_000);
    const holding = runtime.prisoners.roomInstances.allByRoomCatalogId('room.holding-cell')[0]!;
    expect(holding.residentCapacity).toBe(2);
    expect(holding.objectCapabilities).not.toContain('sleep-surface');

    for (let index = 0; index < 2; index += 1) {
      submit(runtime, `admit-${index}`, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, ...ARRIVAL }));
    }
    submit(runtime, 'queue-third', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, ...ARRIVAL }));
    stepTo(runtime, 1_050);
    expect(runtime.refusals.count).toBe(0);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).prisoners).toBe(2);
    expect(runtime.prisoners.delayedIntakeCount).toBe(1);
    expect(runtime.prisoners.roomInstances.occupancyOf(runtime.prisoners.roomInstances.allByRoomCatalogId('room.holding-cell')[0]!.instanceId)).toBe(2);
    expect(stateIncomeForCompletedDay(runtime.prisoners)).toBe(600);
    expect(runtime.prisoners.holdingAgeBands(runtime.kernel.tick)).toEqual({ grace: 2, strained: 0, critical: 0 });

    const savedStays = runtime.prisoners.intakeSystem.getHoldingSnapshot();
    const restored = saveAndLoad(runtime);
    expect(restored.prisoners.intakeSystem.getHoldingSnapshot()).toEqual(savedStays);
    expect(restored.prisoners.delayedIntakeCount).toBe(1);
    expect(stateIncomeForCompletedDay(restored.prisoners)).toBe(600);

    stepTo(restored, savedStays[1]![1] + HOLDING_GRACE_TICKS + 1);
    expect(restored.prisoners.holdingAgeBands(restored.kernel.tick)).toEqual({ grace: 0, strained: 2, critical: 0 });
    const heldIndex = restored.prisoners.entityStore.getIndex(savedStays[0]![0]);
    const safetyBefore = restored.prisoners.needs.getScaled(heldIndex, 'safety');
    stepTo(restored, restored.kernel.tick + 20);
    expect(safetyBefore - restored.prisoners.needs.getScaled(heldIndex, 'safety')).toBeGreaterThan(200);
    stepTo(restored, savedStays[1]![1] + HOLDING_FULL_DAY_TICKS + 1);
    expect(restored.prisoners.holdingAgeBands(restored.kernel.tick)).toEqual({ grace: 0, strained: 0, critical: 2 });
    const sleepBefore = restored.prisoners.needs.getScaled(heldIndex, 'sleep');
    stepTo(restored, restored.kernel.tick + 20);
    expect(sleepBefore - restored.prisoners.needs.getScaled(heldIndex, 'sleep')).toBeGreaterThan(120);
    expect(restored.prisoners.delayedIntakeCount).toBe(1);
  });
});
