import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function showerProvision(utilityPanel: boolean): number {
  const runtime = createNewSimulationRuntime(0x595);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'planks', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'bricks', itemId: 'item.brick', quantity: utilityPanel ? 3 : 2 }));
  for (const [id, roomId, rect] of [
    ['cell', 'room.cell', { x: 1, y: 1, width: 2, height: 3 }],
    ['shower', 'room.shower-room', { x: 6, y: 1, width: 3, height: 3 }],
    ['utility', 'room.utility-room', { x: 12, y: 1, width: 2, height: 2 }],
  ] as const) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${id}`, packCommand({ type: 'ZoneRoom', roomId, ...rect }));
  }
  submit(runtime, 'bed', packCommand({ type: 'PlaceObject', orderId: 'bed', definitionId: 'bed-wooden', x: 1, y: 1 }));
  submit(runtime, 'head-1', packCommand({ type: 'PlaceObject', orderId: 'head-1', definitionId: 'shower-head-brick', x: 6, y: 1 }));
  submit(runtime, 'head-2', packCommand({ type: 'PlaceObject', orderId: 'head-2', definitionId: 'shower-head-brick', x: 7, y: 1 }));
  if (utilityPanel) submit(runtime, 'panel', packCommand({ type: 'PlaceObject', orderId: 'panel', definitionId: 'utility-panel-brick', x: 12, y: 1 }));
  while (runtime.kernel.tick < 1_000) runtime.kernel.step();
  expect(runtime.refusals.count).toBe(0);
  expect(runtime.placedObjects.all().length).toBe(utilityPanel ? 4 : 3);

  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, x: 16, y: 16 }));
  runtime.prisoners.needs.set(0, 'hygiene', 0);
  for (let steps = 0; steps < 12_000; steps += 1) {
    const before = runtime.prisoners.needs.getScaled(0, 'hygiene');
    runtime.kernel.step();
    const action = DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[0]!];
    const gain = runtime.prisoners.needs.getScaled(0, 'hygiene') - before;
    if (action?.id === 'action.shower' && gain > 0) return gain;
  }
  throw new Error('the prisoner never gained hygiene from a real shower action');
}

describe('issue #595 utility panels change the prisoner need actually provisioned', () => {
  it('a furnished utility room doubles the first shower gain over the same unpowered prison', () => {
    const unpowered = showerProvision(false);
    const powered = showerProvision(true);
    expect(unpowered).toBeGreaterThan(0);
    expect(powered - unpowered).toBe(8_000);
  });
});
