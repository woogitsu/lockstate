import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { findRoute } from '../../src/simulation/navigation/router';
import type { RouteContext } from '../../src/simulation/navigation/route-context';
import { buildFixtureGraph, buildSingleDoorFixture, buildTwoRoomFixture } from '../helpers/navigation-fixture';

const LEFT_TILE = { x: tileCoordinate(1), y: tileCoordinate(1) };
const RIGHT_TILE = { x: tileCoordinate(6), y: tileCoordinate(1) };

const GUARD: RouteContext = { role: 'guard', securityClearance: 5 };
const PRISONER: RouteContext = { role: 'prisoner', securityClearance: 0 };
const MEDICAL_STAFF: RouteContext = { role: 'staff', securityClearance: 0, permissions: ['medical-wing'] };

describe('findRoute: cross-chunk portals and multiple route alternatives', () => {
  it('routes a sufficiently-cleared actor through the clearance-gated door, crossing chunks', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.segments.length).toBeGreaterThanOrEqual(2);
    const doorIdsCrossed = result.route.segments.map((s) => s.enteredViaDoorId).filter((id) => id !== undefined);
    expect(doorIdsCrossed).toEqual(['door-clearance']);
    expect(result.route.segments.at(0)?.waypoints.at(0)).toEqual(LEFT_TILE);
    expect(result.route.segments.at(-1)?.waypoints.at(-1)).toEqual(RIGHT_TILE);
  });

  it('routes a permission-holding actor through the OTHER door when they lack clearance for the first', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, MEDICAL_STAFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doorIdsCrossed = result.route.segments.map((s) => s.enteredViaDoorId).filter((id) => id !== undefined);
    expect(doorIdsCrossed).toEqual(['door-medical']);
  });

  it('denies a route with a structured, actionable reason when the actor qualifies for no door', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, PRISONER);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('permission-denied');
    expect(result.failure.blockedBy).toBeDefined();
    expect(['insufficient-clearance', 'missing-permission']).toContain(result.failure.blockedBy?.reason);
  });
});

describe('findRoute: door state and emergency override', () => {
  it('locked blocks even an otherwise-qualified actor', () => {
    const { world, doors, chunkA, chunkB } = buildSingleDoorFixture();
    doors.setState('door-clearance', 'locked');
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    // The medical door is still a valid (if unpermitted-for-guard) alternative,
    // so a guard with no medical permission is now fully denied.
    expect(result).toMatchObject({ ok: false, failure: { reason: 'permission-denied', blockedBy: { doorId: 'door-clearance', reason: 'locked' } } });
  });

  it('emergencyOverride bypasses a lock but never bypasses clearance', () => {
    const { world, doors, chunkA, chunkB } = buildSingleDoorFixture();
    doors.setState('door-clearance', 'locked');
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const uncleared: RouteContext = { role: 'prisoner', securityClearance: 0, emergencyOverride: true };
    const uncleared_result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, uncleared);
    expect(uncleared_result).toMatchObject({
      ok: false,
      failure: { reason: 'permission-denied', blockedBy: { doorId: 'door-clearance', reason: 'insufficient-clearance' } },
    });

    const cleared: RouteContext = { role: 'guard', securityClearance: 5, emergencyOverride: true };
    const cleared_result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, cleared);
    expect(cleared_result.ok).toBe(true);
  });
});

describe('findRoute: structured failure reasons and no partial mutation', () => {
  it('reports invalid-destination for a tile outside any loaded chunk', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const farAway = { x: tileCoordinate(1000), y: tileCoordinate(1000) };
    const result = findRoute(world, doors, graph, LEFT_TILE, farAway, GUARD);
    expect(result).toEqual({ ok: false, failure: { reason: 'invalid-destination' } });
  });

  it('reports unreachable, not permission-denied, when no door exists at all between two regions', () => {
    const { world, chunkA, chunkB } = buildTwoRoomFixture();
    // No doors registered at all: the two regions have zero portals.
    const noDoors = new DoorRegistry();
    const graph = buildFixtureGraph(world, noDoors, [chunkA, chunkB]);

    const result = findRoute(world, noDoors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    expect(result).toEqual({ ok: false, failure: { reason: 'unreachable' } });
  });

  it('never mutates world/door/graph state on a failed route', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const accessRevisionBefore = doors.accessRevision;
    const structuralRevisionBefore = doors.structuralRevision;
    const geometrySignatureBefore = graph.geometrySignature;
    const chunkGeometryBefore = world.getChunk(chunkA)?.geometryRevision;

    findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, PRISONER);

    expect(doors.accessRevision).toBe(accessRevisionBefore);
    expect(doors.structuralRevision).toBe(structuralRevisionBefore);
    expect(graph.geometrySignature).toBe(geometrySignatureBefore);
    expect(world.getChunk(chunkA)?.geometryRevision).toBe(chunkGeometryBefore);
  });

  it('is deterministic: identical requests return identical routes', () => {
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const first = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    const second = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    expect(first).toEqual(second);

    const firstDenied = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, PRISONER);
    const secondDenied = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, PRISONER);
    expect(firstDenied).toEqual(secondDenied);
  });
});

describe('findRoute: local search stays bounded to the resolved regions', () => {
  it('never expands into a third, unrelated region reachable only through a different door', () => {
    // A third, disconnected room reachable only via a dedicated door the
    // requested route never needs; if local search were unbounded it could
    // still legally wander there since it is physically connected -- the
    // bounded search must not visit any of its tiles.
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    // Extra single-tile room carved out of chunk B's interior at (6,2),
    // walled on all four sides except a door on its north edge, reachable
    // only via a third door the guard route below never needs to cross.
    world.setTopEdge({ x: tileCoordinate(6), y: tileCoordinate(2) }, 1); // north: gated by door-side-room below
    world.setLeftEdge({ x: tileCoordinate(6), y: tileCoordinate(2) }, 1); // west
    world.setLeftEdge({ x: tileCoordinate(7), y: tileCoordinate(2) }, 1); // east
    world.setTopEdge({ x: tileCoordinate(6), y: tileCoordinate(3) }, 1); // south
    doors.register({
      id: 'door-side-room',
      position: { x: tileCoordinate(6), y: tileCoordinate(2) },
      side: 'top',
      state: 'open',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);

    const result = findRoute(world, doors, graph, LEFT_TILE, RIGHT_TILE, GUARD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sideRoomTile = { x: tileCoordinate(6), y: tileCoordinate(2) };
    const visitedTiles = result.route.segments.flatMap((segment) => segment.waypoints);
    expect(visitedTiles).not.toContainEqual(sideRoomTile);
  });
});
