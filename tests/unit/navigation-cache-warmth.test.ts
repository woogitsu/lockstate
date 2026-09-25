import { describe, expect, it } from 'vitest';
import { FlowFieldCache } from '../../src/simulation/navigation/flow-field';
import { PathRequestQueue } from '../../src/simulation/navigation/path-request-queue';
import { RouteCache } from '../../src/simulation/navigation/route-cache';
import { buildCellBlockFixture, buildFixtureGraph } from '../helpers/navigation-fixture';

describe('saved navigation cache membership (#1373)', () => {
  it('rebuilds a 24-route crowd with one shared field, then invalidates both when a depended-on door changes', () => {
    const fixture = buildCellBlockFixture(24);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const routes = new RouteCache();
    const fields = new FlowFieldCache();
    const queue = new PathRequestQueue({ agingIntervalTicks: 15, flowFieldActivationThreshold: 6 });
    const context = { role: 'guard', securityClearance: 5, permissions: ['medical-wing'] };
    const destination = fixture.canteenTiles[0]!;
    for (let index = 0; index < 24; index += 1) {
      queue.enqueue({ id: `crowd-${index}`, origin: fixture.cellTiles[index]!, destination, context, priority: 0 }, 0);
    }
    queue.processTick({ tick: 0, workBudget: 10_000, world: fixture.world, doors: fixture.doors, graph, routeCache: routes, flowFieldCache: fields });
    const routeKeys = routes.getWarmthSnapshot(graph, fixture.doors);
    const fieldKeys = fields.getWarmthSnapshot(graph, fixture.doors);
    expect(routeKeys).toHaveLength(24);
    expect(fieldKeys).toHaveLength(1);

    const restoredRoutes = new RouteCache();
    const restoredFields = new FlowFieldCache();
    const throughJson = JSON.parse(JSON.stringify({ routeKeys, fieldKeys })) as { routeKeys: typeof routeKeys; fieldKeys: typeof fieldKeys };
    restoredRoutes.loadWarmthSnapshot(throughJson.routeKeys, fixture.world, graph, fixture.doors);
    restoredFields.loadWarmthSnapshot(throughJson.fieldKeys, graph, fixture.doors);
    expect(restoredRoutes.getWarmthSnapshot(graph, fixture.doors)).toEqual(routeKeys);
    expect(restoredFields.getWarmthSnapshot(graph, fixture.doors)).toEqual(fieldKeys);
    expect(restoredRoutes.get(fixture.cellTiles[0]!, destination, context, graph, fixture.doors)).toBeDefined();

    fixture.doors.setState(fixture.canteenEntranceDoorId, 'locked');
    expect(restoredRoutes.get(fixture.cellTiles[0]!, destination, context, graph, fixture.doors)).toBeUndefined();
    expect(restoredFields.get(fieldKeys[0]!.destinationRegion, context, graph, fixture.doors)).toBeUndefined();
    expect(restoredRoutes.getWarmthSnapshot(graph, fixture.doors)).toHaveLength(0);
    expect(restoredFields.getWarmthSnapshot(graph, fixture.doors)).toHaveLength(0);
  });

  it('refuses repeated cache identities rather than silently changing their membership', () => {
    const fixture = buildCellBlockFixture(1);
    const graph = buildFixtureGraph(fixture.world, fixture.doors, fixture.chunkPositions);
    const context = { role: 'guard', securityClearance: 5 };
    const route = { origin: fixture.cellTiles[0]!, destination: fixture.canteenTiles[0]!, context };
    const field = { destinationRegion: graph.tileToRegion.get(`${route.destination.x},${route.destination.y}`)!, context };
    expect(() => new RouteCache().loadWarmthSnapshot([route, route], fixture.world, graph, fixture.doors)).toThrow('Duplicate route-cache warmth key');
    expect(() => new FlowFieldCache().loadWarmthSnapshot([field, field], graph, fixture.doors)).toThrow('Duplicate flow-field warmth key');
  });
});
