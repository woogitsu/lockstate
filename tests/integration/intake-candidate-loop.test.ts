import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

const ROOM = { x: 4, y: 6, width: 2, height: 3 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function restore(runtime: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(runtime);
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0', prisonId: 'candidate-loop', revision: 1,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel, world: bundle.world, construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error('candidate save must decode');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, 594).runtime;
}

describe('daily intake offers (#594)', () => {
  it('preserves screening across save and pays a one-off only when the accepted candidate occupies a place', () => {
    const runtime = createNewSimulationRuntime(594);
    const candidate = runtime.intakeCandidates.snapshot().candidates[0]!;
    submit(runtime, 'buy-bed', packCommand({ type: 'PurchaseMaterials', orderId: 'bed', itemId: 'item.wood-plank', quantity: 3 }));
    wallRoomPerimeter(runtime.world, ROOM, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...ROOM }));
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed', definitionId: 'bed-wooden', x: ROOM.x, y: ROOM.y }));
    stepTo(runtime, 1_000);
    const cell = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')[0]!;
    expect(cell.residentCapacity).toBe(1);
    const existing = runtime.prisoners.requestAdmission({ sentenceLengthTicks: 100_000, priorIncidents: 0 }, ARRIVAL, runtime.kernel.tick);
    expect(existing.kind).toBe('admitted');
    if (existing.kind !== 'admitted') throw new Error('existing occupant must enter');
    stepTo(runtime, 1_050);
    expect(runtime.prisoners.roomInstances.occupancyOf(cell.instanceId)).toBe(1);
    const balanceBeforeOffer = runtime.treasury.balanceMinorUnits;
    submit(runtime, 'accept', packCommand({ type: 'AcceptIntakeCandidate', candidateId: candidate.id, ...ARRIVAL }));
    expect(runtime.prisoners.delayedIntakeCount).toBe(1);
    expect(runtime.treasury.balanceMinorUnits).toBe(balanceBeforeOffer);
    expect(runtime.intakeCandidates.snapshot().candidates.some((entry) => entry.id === candidate.id)).toBe(false);

    const restored = restore(runtime);
    expect(restored.prisoners.delayedIntakeCount).toBe(1);
    expect(restored.prisoners.releasePrisoner(existing.entityId, restored.kernel.tick)).toBe(true);
    stepTo(restored, 1_150);
    expect(restored.prisoners.admittedCount).toBe(1);
    const prisonerId = restored.prisoners.roomInstances.occupantsOf(cell.instanceId)[0]!;
    const index = restored.prisoners.entityStore.getIndex(prisonerId);
    expect(restored.prisoners.records.riskTier[index]).toBe(candidate.riskTier);
    expect(restored.prisoners.records.sentenceLengthTicks[index]).toBe(candidate.sentenceLengthTicks);
    expect(restored.treasury.balanceMinorUnits).toBe(balanceBeforeOffer + candidate.bountyMinorUnits);
  });
});
