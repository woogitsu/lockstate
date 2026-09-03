import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { wallRoomPerimeter } from '../helpers/room-walls';

const SEED = 0x0b1ec7;
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BAY_RECT = { x: 10, y: 6, width: 4, height: 4 } as const;
const STORE_RECT = { x: 20, y: 20, width: 3, height: 3 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}
function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

describe('probe', () => {
  it('walks a delivery', () => {
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
    submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: 6 }));

    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
    submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: 4, y: 6 }));
    submit(runtime, 'place-toilet', packCommand({ type: 'PlaceObject', orderId: 'toilet-1', definitionId: 'toilet-brick', x: 5, y: 6 }));

    wallRoomPerimeter(runtime.world, BAY_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-bay', packCommand({ type: 'ZoneRoom', roomId: 'room.delivery-bay', ...BAY_RECT }));
    wallRoomPerimeter(runtime.world, STORE_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-store', packCommand({ type: 'ZoneRoom', roomId: 'room.storage-room', ...STORE_RECT }));

    // eslint-disable-next-line no-console
    console.log('refusals', runtime.refusals.last, runtime.refusals.count);
    // eslint-disable-next-line no-console
    console.log('rooms', runtime.prisoners.roomInstances.allByRoomCatalogId('room.delivery-bay').map((r) => r.instanceId), runtime.prisoners.roomInstances.allByRoomCatalogId('room.storage-room').map((r) => r.instanceId));

    submit(runtime, 'buy-planks2', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-4', itemId: 'item.wood-plank', quantity: 10 }));
    submit(runtime, 'place-rack1', packCommand({ type: 'PlaceObject', orderId: 'rack-1', definitionId: 'storage-rack-wooden', x: 20, y: 20 }));
    submit(runtime, 'place-rack2', packCommand({ type: 'PlaceObject', orderId: 'rack-2', definitionId: 'storage-rack-wooden', x: 21, y: 20 }));
    submit(runtime, 'place-dock', packCommand({ type: 'PlaceObject', orderId: 'dock-1', definitionId: 'loading-dock-door-wooden', x: 10, y: 6 }));

    stepTo(runtime, 600);
    // eslint-disable-next-line no-console
    console.log('caps', runtime.prisoners.roomInstances.allByRoomCatalogId('room.delivery-bay').map((r) => r.objectCapabilities), runtime.prisoners.roomInstances.allByRoomCatalogId('room.storage-room').map((r) => r.objectCapabilities));
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 200_000, priorIncidents: 0, ...ARRIVAL }));
    stepTo(runtime, 1_350);

    submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-3', itemId: 'item.brick', quantity: 5 }));

    const store = runtime.prisoners.entityStore;
    const entityId = store.getIdByIndex(0);
    const index = store.getIndex(entityId);
    const seen = new Set<string>();
    for (let tick = runtime.kernel.tick; tick < 2_400; tick += 1) {
      runtime.kernel.step();
      const jobs = runtime.jobs.allSorted();
      const ai = runtime.prisoners.currentAction.actionIndex[index]!;
      const line = `${jobs.map((j) => `${j.id}:${j.state}:${j.leg}:${String(j.assignedWorkerId)}`).join(',')}|${ai >= 0 ? DEFAULT_ACTIONS[ai]!.id : 'none'}|${ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!]}`;
      if (!seen.has(line)) {
        seen.add(line);
        // eslint-disable-next-line no-console
        console.log(runtime.kernel.tick, line, tileCoordinate(runtime.prisoners.position.tileX[index]!), tileCoordinate(runtime.prisoners.position.tileY[index]!));
      }
    }
    // eslint-disable-next-line no-console
    console.log('containers', runtime.containers.getSnapshot());
    expect(true).toBe(true);
  }, 60_000);
});
