import { expect, it, vi } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildSingleDoorFixture } from '../helpers/navigation-fixture';

const tile = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });
const left = tile(1, 1);
const right = tile(6, 1);
function createFixture() {
  const fixture = buildSingleDoorFixture();
  const navigation = new NavigationSystem(fixture.world,
    { workBudgetPerTick: 40, agingIntervalTicks: 10, flowFieldActivationThreshold: 6 }, fixture.doors);
  navigation.setLoadedChunks([fixture.chunkA, fixture.chunkB]);
  return { ...fixture, navigation };
}

it('fails closed for either invalid endpoint and same-region queries do not walk portals', () => {
  const { navigation } = createFixture();
  const graph = navigation.getGraph();
  const portals = vi.spyOn(graph.regionPortals, 'get');
  expect(navigation.sharesPhysicalComponent(left, tile(2, 2))).toBe(true);
  expect(navigation.sharesPhysicalComponent(left, tile(8, 1))).toBe(false);
  expect(navigation.sharesPhysicalComponent(tile(8, 1), left)).toBe(false);
  expect(navigation.sharesPhysicalComponent(tile(8, 1), tile(9, 1))).toBe(false);
  expect(portals).not.toHaveBeenCalled();
  expect(navigation.pendingCount()).toBe(0);
  expect(navigation.getQueueMetrics().totalExpansions).toBe(0);
  portals.mockRestore();
});

it('reuses physical labels without search work while locked-door failure stays in the real queue', () => {
  const { navigation, doors } = createFixture();
  const graph = navigation.getGraph();
  const portals = vi.spyOn(graph.regionPortals, 'get');
  const metrics = navigation.getQueueMetrics();
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(true);
  expect(portals).toHaveBeenCalled();
  portals.mockClear();
  doors.setState('door-clearance', 'locked');
  expect(navigation.getGraph()).toBe(graph);
  for (let query = 0; query < 100; query++) {
    expect(navigation.sharesPhysicalComponent(left, right)).toBe(true);
    expect(navigation.sharesPhysicalComponent(right, left)).toBe(true);
  }
  expect(portals).not.toHaveBeenCalled();
  expect(navigation.getQueueMetrics()).toEqual(metrics);
  expect(navigation.pendingCount()).toBe(0);
  expect(navigation.resultCount()).toBe(0);
  portals.mockRestore();

  const kernel = new Kernel();
  kernel.registerSystem(navigation);
  navigation.requestRoute('actual-locked-door', left, right,
    { role: 'prisoner', securityClearance: 0 }, 1, kernel.tick);
  kernel.step();
  expect(navigation.getResult('actual-locked-door')?.result).toEqual({ ok: false,
    failure: { reason: 'permission-denied', blockedBy: { doorId: 'door-clearance', reason: 'locked' } } });
  expect(navigation.getQueueMetrics().resolvedCount).toBe(1);
  expect(navigation.getQueueMetrics().totalExpansions).toBeGreaterThan(0);
});

it('ordinary gap and door structural changes replace the graph and cannot reuse old connectivity', () => {
  const { navigation, world, doors } = createFixture();
  const originalDoor = doors.getById('door-clearance')!;
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(true);
  let graph = navigation.getGraph();
  expect(doors.unregister(originalDoor.id)).toBe(true);
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(false);
  expect(navigation.getGraph()).not.toBe(graph);
  graph = navigation.getGraph();
  world.setLeftEdge(tile(4, 0), 0);
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(true);
  expect(navigation.getGraph()).not.toBe(graph);
  graph = navigation.getGraph();
  world.setLeftEdge(tile(4, 0), 1);
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(false);
  expect(navigation.getGraph()).not.toBe(graph);
  graph = navigation.getGraph();
  doors.register(originalDoor);
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(true);
  expect(navigation.getGraph()).not.toBe(graph);
  expect(navigation.pendingCount()).toBe(0);
  expect(navigation.getQueueMetrics().totalExpansions).toBe(0);
});

it('loaded chunk replacement rejects absent endpoints and restored area derives fresh labels', () => {
  const { navigation, chunkA, chunkB } = createFixture();
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(true);
  const originalGraph = navigation.getGraph();
  navigation.setLoadedChunks([chunkA]);
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(false);
  expect(navigation.getGraph()).not.toBe(originalGraph);
  const smallerGraph = navigation.getGraph();
  navigation.setLoadedChunks([chunkA, chunkB]);
  expect(navigation.sharesPhysicalComponent(left, right)).toBe(true);
  expect(navigation.getGraph()).not.toBe(smallerGraph);
  expect(navigation.pendingCount()).toBe(0);
  expect(navigation.getQueueMetrics().totalExpansions).toBe(0);
});
