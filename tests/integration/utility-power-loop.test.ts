import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

type ProvisionCase = 'shower' | 'laundry' | 'kitchen';

function provision(caseId: ProvisionCase, utilityPanel: boolean): number {
  const roomId = caseId === 'shower' ? 'room.shower-room' : caseId === 'laundry' ? 'room.laundry' : 'room.kitchen';
  const actionId = caseId === 'shower' ? 'action.shower' : caseId === 'laundry' ? 'action.laundry-work' : 'action.kitchen-work';
  const needId = caseId === 'kitchen' ? 'hunger' : 'hygiene';
  const orders = caseId === 'shower'
    ? [['head-1', 'shower-head-brick', 6, 1], ['head-2', 'shower-head-brick', 7, 1]] as const
    : caseId === 'laundry'
      ? [['washer-1', 'washing-machine-brick', 6, 1], ['washer-2', 'washing-machine-brick', 6, 2]] as const
      : [['stove', 'stove-brick', 6, 1], ['prep', 'prep-counter-brick', 6, 2], ['fridge', 'fridge-brick', 6, 3]] as const;
  const runtime = createNewSimulationRuntime(0x595);
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'planks', itemId: 'item.wood-plank', quantity: 1 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'bricks', itemId: 'item.brick', quantity: 12 }));
  for (const [id, zonedRoomId, rect] of [
    ['cell', 'room.cell', { x: 1, y: 1, width: 2, height: 3 }],
    ['provider', roomId, { x: 6, y: 1, width: caseId === 'kitchen' ? 4 : 3, height: caseId === 'kitchen' ? 4 : 3 }],
    ['utility', 'room.utility-room', { x: 12, y: 1, width: 2, height: 2 }],
  ] as const) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${id}`, packCommand({ type: 'ZoneRoom', roomId: zonedRoomId, ...rect }));
  }
  submit(runtime, 'bed', packCommand({ type: 'PlaceObject', orderId: 'bed', definitionId: 'bed-wooden', x: 1, y: 1 }));
  for (const [id, definitionId, x, y] of orders) {
    submit(runtime, id, packCommand({ type: 'PlaceObject', orderId: id, definitionId, x, y }));
  }
  if (utilityPanel) submit(runtime, 'panel', packCommand({ type: 'PlaceObject', orderId: 'panel', definitionId: 'utility-panel-brick', x: 12, y: 1 }));
  while (runtime.kernel.tick < 1_000) runtime.kernel.step();
  expect(runtime.refusals.count).toBe(0);
  expect(runtime.placedObjects.all().length).toBe(orders.length + (utilityPanel ? 2 : 1));

  submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 100_000, priorIncidents: 0, x: 16, y: 16 }));
  runtime.prisoners.needs.set(0, needId, 0);
  for (let steps = 0; steps < 12_000; steps += 1) {
    const before = runtime.prisoners.needs.getScaled(0, needId);
    runtime.kernel.step();
    const action = DEFAULT_ACTIONS[runtime.prisoners.currentAction.actionIndex[0]!];
    const gain = runtime.prisoners.needs.getScaled(0, needId) - before;
    if (action?.id === actionId && gain > 0) return gain;
  }
  throw new Error(`the prisoner never gained ${needId} from ${actionId}`);
}

describe('issue #595 utility panels change the prisoner need actually provisioned', () => {
  for (const caseId of ['shower', 'laundry', 'kitchen'] as const) {
    it(`a furnished utility room doubles the first ${caseId} need gain over the same unpowered prison`, () => {
      const unpowered = provision(caseId, false);
      const powered = provision(caseId, true);
      expect(unpowered).toBeGreaterThan(0);
      // The first work tick also includes baseline need decay (100 scaled
      // units for hunger), so compare the added provision rather than the
      // total net gain. Shower's authored rate is four times the work rate.
      expect(powered - unpowered).toBe(caseId === 'shower' ? 8_000 : 2_000);
    });
  }
});
