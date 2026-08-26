import { describe, expect, it } from 'vitest';
import {
  ConstructionSystem,
  DOOR_EDGE_NUMERIC_ID,
  DoorConstructionService,
  WALL_EDGE_NUMERIC_ID,
  createBuildOrder,
  doorSideForBuildEdge,
  edgeNumericIdFor,
  getBuildableDefinition,
  occupiesTileEdge,
  type BuildEdge,
} from '../../src/simulation/construction';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { DoorRegistry, constructedDoorIdFor } from '../../src/simulation/navigation/door';
import { buildNavigationGraph } from '../../src/simulation/navigation/region-graph';
import { packCommand } from '../../src/simulation/protocol/commands';
import { roomPerimeterEnclosure } from '../../src/simulation/rooms/enclosure';
import { TopologyManager } from '../../src/simulation/rooms/topology';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { chunkCoordinate, tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * **A completed `door-wooden` order produces a door the simulation can see.**
 *
 * That row has been in `BUILDABLE_REGISTRY` since #16 and, until the change
 * this file arrived with, a completed order for it consumed a plank and changed
 * nothing whatever: `edgeNumericIdFor` answered `0`, `ConstructionSystem` held
 * no `DoorRegistry`, and the only buildable the Build panel offered that could
 * not finish meaningfully finished anyway.
 *
 * ## The two questions a door answers differently, which is the whole design
 *
 * Nothing here asserts that a door "joins two regions", because that is not
 * what a door does in this tree, and getting it wrong in either direction is a
 * defect:
 *
 *  - **Topology and enclosure** read the world's edge layers alone
 *    (`TopologyManager`, `roomPerimeterEnclosure`). A door writes
 *    `DOOR_EDGE_NUMERIC_ID` there, so a room with a door in its wall line stays
 *    **two regions and sealed** -- which is what makes a cell a cell. A door
 *    that merged the cell with the corridor would have un-made the room.
 *  - **Navigation** reads `DoorRegistry` *before* it reads the edge value
 *    (`buildNavigationGraph`, `boundedLocalSearch`), so the same door is a
 *    `Portal`: two regions, joined by a permission-checked crossing. That is
 *    what makes the cell reachable.
 *
 * Both are measured below on the same built geometry, and each has a control
 * that goes red without the other half.
 *
 * ## Which navigation site each half actually pins
 *
 * Deleting the `DoorRegistry` lookup in `boundedLocalSearch` turns every built
 * door into a wall, and this file is where that goes red: the walker below is
 * refused at the crossing. Deleting the one in `buildNavigationGraph`'s region
 * walk does *not* go red here, and cannot -- a built door writes
 * `DOOR_EDGE_NUMERIC_ID`, so the wall check on the next line separates the two
 * sides just the same. That rule is pinned where its only observable case
 * lives: `navigation-region-graph.test.ts`, "treats a door as a region boundary
 * even where the world edge value is 0".
 *
 * ## Nothing here writes the world
 *
 * Every wall and every door arrives as a `PlaceBuildOrder` through the real
 * kernel, the real command handler and the real `ContainerMaterialsProvider`
 * drawing real bricks and planks out of the session's construction container --
 * the rule `construction-geometry.test.ts` set for itself, and the reason a
 * green result here says something about the pipeline rather than about a
 * fixture. `setTopEdge`, `setLeftEdge` and `DoorRegistry.register` are never
 * called by this file on a session's own world.
 */

const CHUNK_0 = { x: chunkCoordinate(0), y: chunkCoordinate(0) };

function tile(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

interface Segment {
  readonly x: number;
  readonly y: number;
  readonly edge: BuildEdge;
}

/** The 12 edge segments that seal the 3x3 block of tiles x=5..7, y=5..7 -- `construction-geometry.test.ts`'s room, reused so the two files measure the same shape. */
const PERIMETER: readonly Segment[] = [
  { x: 5, y: 5, edge: 'north' },
  { x: 6, y: 5, edge: 'north' },
  { x: 7, y: 5, edge: 'north' },
  { x: 5, y: 8, edge: 'north' },
  { x: 6, y: 8, edge: 'north' },
  { x: 7, y: 8, edge: 'north' },
  { x: 5, y: 5, edge: 'west' },
  { x: 5, y: 6, edge: 'west' },
  { x: 5, y: 7, edge: 'west' },
  { x: 8, y: 5, edge: 'west' },
  { x: 8, y: 6, edge: 'west' },
  { x: 8, y: 7, edge: 'west' },
];

/** Where the door goes: the middle segment of the room's west wall, between (4,6) outside and (5,6) inside. */
const DOORWAY: Segment = { x: 5, y: 6, edge: 'west' };
const DOOR_ORDER_ID = 'seg-07';

const ROOM_RECT = { x: 5, y: 5, width: 3, height: 3 } as const;
const INSIDE = tile(6, 6);
const OUTSIDE = tile(1, 1);

/** Whoever is walking. `grade.general` asks for clearance 0 and no permission, so this context is admitted -- which is the point of the grade, not an accident of the number. */
const WALKER = { role: 'prisoner', securityClearance: 0 } as const;

function session(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(1);
  // Session/scenario setup, the role `new-session.ts` documents for it: stock
  // the well-known container so orders consume real materials. 12 walls x 2
  // bricks and one plank per door, with headroom.
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.brick', 100);
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.wood-plank', 10);
  return runtime;
}

/**
 * Submits the whole perimeter, building `door-wooden` at whichever segments are
 * named and `wall-brick` everywhere else.
 *
 * Order ids are zero-padded so the canonical (ascending id) processing order is
 * also the readable order, and so the door's id is a fixed string this file can
 * cancel by name.
 */
function submitPerimeter(runtime: SimulationRuntime, doorwayIndices: readonly number[] = []): void {
  // Walls first, then the doors, so the gesture the undo stack has on top is
  // the door -- the sequence a player who has just built one is actually in.
  // Each segment carries a transaction id of its own, so one `Undo` reverses
  // one segment rather than the whole perimeter.
  const submit = (index: number): void => {
    const segment = PERIMETER[index]!;
    runtime.kernel.submitCommand(
      `cmd-${String(index).padStart(2, '0')}`,
      runtime.kernel.expectedSequence,
      0,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: `seg-${String(index).padStart(2, '0')}`,
        definitionId: doorwayIndices.includes(index) ? 'door-wooden' : 'wall-brick',
        x: segment.x,
        y: segment.y,
        edge: segment.edge,
        transactionId: `perimeter-${index}`,
      }),
    );
  };
  PERIMETER.forEach((_, index) => {
    if (!doorwayIndices.includes(index)) submit(index);
  });
  for (const index of doorwayIndices) submit(index);
}

const DOORWAY_INDEX = PERIMETER.findIndex(
  (segment) => segment.x === DOORWAY.x && segment.y === DOORWAY.y && segment.edge === DOORWAY.edge,
);

function step(runtime: SimulationRuntime, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) runtime.kernel.step();
}

/** Recomputes topology the way a host would: from the world's own chunk states. `TopologyManager.update` has no caller in `src/`, so this is what a caller would do. */
function topologyOf(runtime: SimulationRuntime): TopologyManager {
  const chunk = runtime.world.getChunk(CHUNK_0);
  expect(chunk).toBeDefined();
  runtime.topology.update([chunk!]);
  return runtime.topology;
}

/**
 * Asks the real `NavigationSystem` for a route and drives the kernel until it
 * answers.
 *
 * Through `requestRoute`/`getResult` rather than `findRoute` directly, because
 * the question is whether an actor can get there -- the same two-state poll
 * every one of the six production callers uses (ADR 0007's amendment).
 */
function routeFrom(runtime: SimulationRuntime, origin: TilePosition, destination: TilePosition, id: string) {
  runtime.navigation.requestRoute(id, origin, destination, WALKER, 0, runtime.kernel.tick);
  for (let index = 0; index < 20 && runtime.navigation.getResult(id) === undefined; index += 1) {
    runtime.kernel.step();
  }
  const resolved = runtime.navigation.getResult(id);
  expect(resolved, `route ${id} never resolved`).toBeDefined();
  return resolved!.result;
}

/** The edge value the world holds at a segment. */
function edgeValueAt(runtime: SimulationRuntime, segment: Segment): number {
  const at = tile(segment.x, segment.y);
  return segment.edge === 'north' ? runtime.world.getTopEdge(at) : runtime.world.getLeftEdge(at);
}

const DOOR_ID = constructedDoorIdFor(tile(DOORWAY.x, DOORWAY.y), doorSideForBuildEdge(DOORWAY.edge));

describe('what a door buildable declares', () => {
  it('names a security grade rather than a hand-picked clearance', () => {
    const definition = getBuildableDefinition('door-wooden');
    expect(definition.placesDoor).toEqual({
      securityGradeId: 'grade.general',
      initialState: 'closed',
      costMultiplier: 1,
    });
    // Not an object, and the two are mutually exclusive by validation. A door is
    // a fact about an edge; a placed object is addressed by an anchor tile.
    expect(definition.placesObjectId).toBeUndefined();
  });

  it('occupies a tile edge, which used to be true of walls alone', () => {
    expect(occupiesTileEdge(getBuildableDefinition('door-wooden'))).toBe(true);
    expect(occupiesTileEdge(getBuildableDefinition('wall-brick'))).toBe(true);
    expect(occupiesTileEdge(getBuildableDefinition('bed-wooden'))).toBe(false);
  });

  it('writes an edge value of its own, distinct from a wall segment', () => {
    expect(edgeNumericIdFor(getBuildableDefinition('door-wooden'))).toBe(DOOR_EDGE_NUMERIC_ID);
    expect(edgeNumericIdFor(getBuildableDefinition('wall-brick'))).toBe(WALL_EDGE_NUMERIC_ID);
    expect(edgeNumericIdFor(getBuildableDefinition('bed-wooden'))).toBe(0);
    expect(DOOR_EDGE_NUMERIC_ID).not.toBe(WALL_EDGE_NUMERIC_ID);
  });

  it('derives a door id from the edge alone, never from the order that built it', () => {
    // Reproducible from state: the same edge always mints the same id, and no
    // part of it comes from how many gestures the player has made. That is what
    // lets `buildNavigationGraph`'s portal sort -- which is by door id -- be a
    // function of geometry rather than of build history (ADR 0012).
    expect(constructedDoorIdFor(tile(5, 6), 'left')).toBe(constructedDoorIdFor(tile(5, 6), 'left'));
    expect(constructedDoorIdFor(tile(5, 6), 'left')).not.toBe(constructedDoorIdFor(tile(5, 6), 'top'));
    expect(constructedDoorIdFor(tile(5, 6), 'left')).not.toBe(constructedDoorIdFor(tile(6, 5), 'left'));
    // The two vocabularies for the same two storage slots.
    expect(doorSideForBuildEdge('north')).toBe('top');
    expect(doorSideForBuildEdge('west')).toBe('left');
  });
});

describe('a wall line with a door in it', () => {
  /** The whole perimeter built, with the west wall's middle segment ordered as a door. */
  function builtWithDoor(): SimulationRuntime {
    const runtime = session();
    submitPerimeter(runtime, [DOORWAY_INDEX]);
    step(runtime, 200);
    for (let index = 0; index < PERIMETER.length; index += 1) {
      expect(runtime.construction.getOrder(`seg-${String(index).padStart(2, '0')}`)?.state, `order ${index}`).toBe(
        'completed',
      );
    }
    return runtime;
  }

  it('registers exactly one door, on the edge the order named', () => {
    const runtime = builtWithDoor();

    expect(runtime.navigation.doors.all().map((door) => door.id)).toEqual([DOOR_ID]);
    expect(runtime.navigation.doors.getByEdge(tile(DOORWAY.x, DOORWAY.y), 'left')).toMatchObject({
      id: DOOR_ID,
      state: 'closed',
      // Read off `grade.general`, not written on the buildable.
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
    expect(runtime.navigation.doors.getByEdge(tile(DOORWAY.x, DOORWAY.y), 'left')?.requiredPermission).toBeUndefined();
  });

  it('writes the door edge value there and the wall value everywhere else', () => {
    const runtime = builtWithDoor();

    for (const [index, segment] of PERIMETER.entries()) {
      expect(edgeValueAt(runtime, segment), `${segment.x},${segment.y} ${segment.edge}`).toBe(
        index === DOORWAY_INDEX ? DOOR_EDGE_NUMERIC_ID : WALL_EDGE_NUMERIC_ID,
      );
    }
  });

  it('leaves the room enclosed: the door does not un-seal what the walls sealed', () => {
    const runtime = builtWithDoor();

    // The perimeter reads sealed *with a door in it*, which is a state
    // `enclosure.ts` recorded as unreachable -- "the only enclosure the world
    // can express today is a rectangle with no way in".
    expect(roomPerimeterEnclosure(runtime.world, ROOM_RECT)).toEqual({ enclosure: 'sealed' });

    const topology = topologyOf(runtime);
    const inside = topology.getTopologyId(INSIDE);
    const outside = topology.getTopologyId(OUTSIDE);
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
    expect(inside, 'a door must not merge the room with the ground outside it').not.toBe(outside);

    // Every interior tile is in that one region and the tile on the far side of
    // the door is not -- a separated region, not an artefact of one lookup.
    for (let y = 5; y <= 7; y += 1) {
      for (let x = 5; x <= 7; x += 1) {
        expect(topology.getTopologyId(tile(x, y)), `${x},${y}`).toBe(inside);
      }
    }
    expect(topology.getTopologyId(tile(DOORWAY.x - 1, DOORWAY.y)), 'the tile the door opens onto').toBe(outside);
  });

  it('joins the two navigation regions with a portal, and an actor walks through it', () => {
    const runtime = builtWithDoor();

    const graph = runtime.navigation.getGraph();
    const insideRegion = graph.tileToRegion.get(`${INSIDE.x},${INSIDE.y}`);
    const outsideRegion = graph.tileToRegion.get(`${OUTSIDE.x},${OUTSIDE.y}`);
    expect(insideRegion).toBeDefined();
    expect(outsideRegion).toBeDefined();
    // Still two regions here as well -- a door is a region *boundary* in
    // `buildNavigationGraph` too. What differs is that a portal spans it.
    expect(insideRegion).not.toBe(outsideRegion);
    expect(graph.portals.map((portal) => portal.doorId)).toEqual([DOOR_ID]);
    expect(new Set([graph.portals[0]!.regionA, graph.portals[0]!.regionB])).toEqual(
      new Set([insideRegion, outsideRegion]),
    );

    const result = routeFrom(runtime, OUTSIDE, INSIDE, 'walk-in');
    expect(result.ok, 'a walker outside must be able to reach the room through its door').toBe(true);
    if (!result.ok) return;
    // And it is *this* door they crossed, not a gap somewhere in the wall line.
    expect(result.route.segments.map((segment) => segment.enteredViaDoorId).filter((id) => id !== undefined)).toEqual([
      DOOR_ID,
    ]);
    const crossing = result.route.segments.flatMap((segment) => segment.waypoints);
    expect(crossing).toContainEqual(tile(DOORWAY.x - 1, DOORWAY.y));
    expect(crossing).toContainEqual(tile(DOORWAY.x, DOORWAY.y));
  });

  it('adds nothing to the room it encloses -- a door is not a placed object', () => {
    /*
     * The question ADR 0028 decision 2 makes worth asking, and the reason a
     * door is deliberately not a `placesObjectId`.
     *
     * `deriveRoomCapacity` sums `footprint.width` over the placed objects
     * standing in a room's rectangle. Its `concurrentUseCapacity` half sums
     * **every** object regardless of capability -- an open defect, and the
     * reason a loading-dock door would grant three prisoners yard capacity --
     * so a door written as an object would silently hand its cell another unit
     * of occupancy. A door is not a `PlacedObject`, so it contributes nothing
     * to either figure and no capability: this room is as empty after the door
     * is built as it was before, which is correct, because nothing has been put
     * *in* it.
     */
    const runtime = builtWithDoor();
    runtime.kernel.submitCommand(
      'cmd-zone',
      runtime.kernel.expectedSequence,
      runtime.kernel.tick,
      packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...ROOM_RECT }),
    );
    runtime.kernel.step();

    const instance = runtime.prisoners.roomInstances.getById(`room.cell:${ROOM_RECT.x}:${ROOM_RECT.y}`);
    expect(instance, 'the room must really have been zoned for this to assert anything').toBeDefined();
    expect(instance).toMatchObject({ residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [] });
    expect(runtime.placedObjects.size).toBe(0);
  });

  it('is unreachable when the same wall line has no door in it -- the control', () => {
    /*
     * The red-proof for every assertion above. Twelve walls and no door is the
     * identical geometry minus one order, and if this case did not report
     * `unreachable` then "the walker got in" would be evidence of a hole in the
     * fixture rather than of a working door.
     */
    const runtime = session();
    submitPerimeter(runtime);
    step(runtime, 200);

    expect(runtime.navigation.doors.all()).toEqual([]);
    expect(roomPerimeterEnclosure(runtime.world, ROOM_RECT)).toEqual({ enclosure: 'sealed' });

    const topology = topologyOf(runtime);
    expect(topology.getTopologyId(INSIDE)).not.toBe(topology.getTopologyId(OUTSIDE));

    // The same pair the door case asserts, on the identical geometry minus one
    // order: `buildNavigationGraph` separates the two sides here too, and with
    // no door there is nothing spanning them. Stated at the graph level and not
    // only as a failed route, so a merged graph and a blocked crossing cannot
    // both be reported by the same red line.
    const graph = runtime.navigation.getGraph();
    const insideRegion = graph.tileToRegion.get(`${INSIDE.x},${INSIDE.y}`);
    const outsideRegion = graph.tileToRegion.get(`${OUTSIDE.x},${OUTSIDE.y}`);
    expect(insideRegion).toBeDefined();
    expect(outsideRegion).toBeDefined();
    expect(insideRegion).not.toBe(outsideRegion);
    expect(graph.portals).toEqual([]);

    const result = routeFrom(runtime, OUTSIDE, INSIDE, 'walk-in-sealed');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('unreachable');
  });
});

describe('taking a built door back', () => {
  function builtWithDoor(): SimulationRuntime {
    const runtime = session();
    submitPerimeter(runtime, [DOORWAY_INDEX]);
    step(runtime, 200);
    return runtime;
  }

  it('undo removes the door itself, not merely its edge value', () => {
    const runtime = builtWithDoor();
    expect(runtime.navigation.doors.getById(DOOR_ID)).toBeDefined();
    const structuralBefore = runtime.navigation.doors.structuralRevision;

    // The producer a player actually has for taking a completed order back.
    // `CancelBuildOrder` has no producer (`unconsumed-command-contract`), and
    // each perimeter segment was submitted under its own transaction id so an
    // undo reverses exactly one of them.
    runtime.kernel.submitCommand('cmd-undo', runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand({ type: 'Undo' }));
    runtime.kernel.step();

    expect(runtime.construction.getOrder(DOOR_ORDER_ID)?.state).toBe('cancelled');
    // No phantom: the row is gone from both lookup paths and from `all()`.
    expect(runtime.navigation.doors.getById(DOOR_ID)).toBeUndefined();
    expect(runtime.navigation.doors.getByEdge(tile(DOORWAY.x, DOORWAY.y), 'left')).toBeUndefined();
    expect(runtime.navigation.doors.all()).toEqual([]);
    // A removal changes the region/portal graph exactly as an addition does, so
    // it has to move the counter `isNavigationGraphStale` compares.
    expect(runtime.navigation.doors.structuralRevision).toBe(structuralBefore + 1);
    expect(runtime.navigation.getGraph().portals).toEqual([]);
  });

  it('leaves an opening where the door was, exactly as cancelling a wall does', () => {
    const runtime = builtWithDoor();
    runtime.kernel.submitCommand('cmd-undo', runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand({ type: 'Undo' }));
    runtime.kernel.step();

    /*
     * The edge falls to `0`, because nothing else claims it. This is the honest
     * answer rather than an oversight: what the player built there was a
     * barrier, and taking a barrier away leaves a gap. So the room is `'open'`
     * again, the two topology regions merge, and a walker gets in through the
     * hole -- which is what the world now actually looks like.
     */
    expect(edgeValueAt(runtime, DOORWAY)).toBe(0);
    expect(roomPerimeterEnclosure(runtime.world, ROOM_RECT)).toMatchObject({ enclosure: 'open' });

    const topology = topologyOf(runtime);
    expect(topology.getTopologyId(INSIDE)).toBe(topology.getTopologyId(OUTSIDE));

    const result = routeFrom(runtime, OUTSIDE, INSIDE, 'walk-in-after-undo');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Through a hole, so no door was crossed -- the state before the door was
    // built, reached back exactly.
    expect(result.route.segments.every((segment) => segment.enteredViaDoorId === undefined)).toBe(true);
  });

  it('restores the wall underneath when one was built on the same edge', () => {
    /*
     * The other half of removal, and the reason `revertConstruction` reverses
     * the door *before* it rewrites the edge. Nothing rejects a second order on
     * an edge that already has one, so a player can wall an edge and then put a
     * door on the same edge. Cancelling the door must leave the wall standing
     * *and* take the crossing away -- an edge that still said "door" with no
     * door registered on it would report a route the player had just paid to
     * remove.
     */
    const runtime = builtWithDoor();
    // A wall on the very edge the door occupies, ordered after it.
    runtime.kernel.submitCommand(
      'cmd-extra',
      runtime.kernel.expectedSequence,
      runtime.kernel.tick,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: 'seg-99-wall-under-door',
        definitionId: 'wall-brick',
        x: DOORWAY.x,
        y: DOORWAY.y,
        edge: DOORWAY.edge,
        transactionId: 'wall-under-door',
      }),
    );
    step(runtime, 200);
    expect(runtime.construction.getOrder('seg-99-wall-under-door')?.state).toBe('completed');
    // The door still crosses it: `DoorRegistry` is authoritative for the edge
    // whatever the world's own value there is.
    expect(routeFrom(runtime, OUTSIDE, INSIDE, 'walk-in-two-claimants').ok).toBe(true);

    runtime.construction.cancelOrder(DOOR_ORDER_ID);

    expect(runtime.navigation.doors.all()).toEqual([]);
    expect(edgeValueAt(runtime, DOORWAY)).toBe(WALL_EDGE_NUMERIC_ID);
    expect(roomPerimeterEnclosure(runtime.world, ROOM_RECT)).toEqual({ enclosure: 'sealed' });
    const result = routeFrom(runtime, OUTSIDE, INSIDE, 'walk-in-wall-restored');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('unreachable');
  });

  it('keeps the door when another completed order still puts one on that edge', () => {
    /*
     * The same rule the edge value has always followed -- "another completed
     * order may occupy the same edge, and clearing it would delete a wall this
     * order never built" -- applied to the registry. Two door orders on one
     * edge: the second registers nothing because the edge is taken, and
     * cancelling the *first* must not delete the door the second one paid for.
     */
    const runtime = builtWithDoor();
    runtime.construction.submitOrder(createBuildOrder('seg-98-second-door', 'door-wooden', tile(DOORWAY.x, DOORWAY.y), DOORWAY.edge));
    step(runtime, 200);
    expect(runtime.construction.getOrder('seg-98-second-door')?.state).toBe('completed');
    expect(runtime.navigation.doors.all().map((door) => door.id)).toEqual([DOOR_ID]);

    runtime.construction.cancelOrder(DOOR_ORDER_ID);

    expect(runtime.navigation.doors.all().map((door) => door.id)).toEqual([DOOR_ID]);
    expect(edgeValueAt(runtime, DOORWAY)).toBe(DOOR_EDGE_NUMERIC_ID);
    expect(routeFrom(runtime, OUTSIDE, INSIDE, 'walk-in-second-door').ok).toBe(true);
  });
});

describe('the door sink refuses rather than throwing, because it runs inside a scheduled update', () => {
  /** A bare world/system pair, so the two unreachable paths can be reached deliberately. */
  function bareSession() {
    const world = new SparseWorld(32);
    world.load(CHUNK_0);
    world.setOwned(CHUNK_0, true);
    const doors = new DoorRegistry();
    const construction = new ConstructionSystem(world, undefined, undefined, new DoorConstructionService(doors));
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    return { world, doors, construction, kernel };
  }

  it('answers false for an edge that already holds a door, instead of throwing out of update()', () => {
    const { doors, construction, kernel } = bareSession();
    const service = new DoorConstructionService(doors);

    construction.submitOrder(createBuildOrder('door-a', 'door-wooden', tile(4, 6), 'west'));
    for (let index = 0; index < 200; index += 1) kernel.step();
    expect(doors.all().map((door) => door.id)).toEqual([constructedDoorIdFor(tile(4, 6), 'left')]);

    // `DoorRegistry.register` throws on a taken edge. The sink must not.
    expect(service.onDoorOrderCompleted('door-wooden', tile(4, 6), 'west')).toBe(false);
    expect(doors.all()).toHaveLength(1);
  });

  it('answers false for a buildable that is not a door at all', () => {
    const { doors } = bareSession();
    const service = new DoorConstructionService(doors);
    expect(service.onDoorOrderCompleted('wall-brick', tile(4, 6), 'west')).toBe(false);
    expect(service.onDoorOrderReverted('wall-brick', tile(4, 6), 'west')).toBe(false);
    expect(doors.all()).toEqual([]);
  });

  it('answers false for a reversal aimed at an edge holding somebody else\'s door', () => {
    const { doors } = bareSession();
    const service = new DoorConstructionService(doors);
    doors.register({
      id: 'hand-authored-door',
      position: tile(4, 6),
      side: 'left',
      state: 'open',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });

    expect(service.onDoorOrderReverted('door-wooden', tile(4, 6), 'west')).toBe(false);
    expect(doors.getById('hand-authored-door')).toBeDefined();
  });

  it('a session without a door sink writes the edge and registers nothing', () => {
    // Stated because it is what a bare `ConstructionSystem` gives, and because
    // it is *not* the pre-door behaviour: a door with no sink is a barrier with
    // no crossing, which is why the composition root passes one.
    const world = new SparseWorld(32);
    world.load(CHUNK_0);
    world.setOwned(CHUNK_0, true);
    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);
    construction.submitOrder(createBuildOrder('door-a', 'door-wooden', tile(4, 6), 'west'));
    for (let index = 0; index < 200; index += 1) kernel.step();

    expect(construction.getOrder('door-a')?.state).toBe('completed');
    expect(world.getLeftEdge(tile(4, 6))).toBe(DOOR_EDGE_NUMERIC_ID);
    const doors = new DoorRegistry();
    expect(buildNavigationGraph(world, doors, [world.getChunk(CHUNK_0)!]).portals).toEqual([]);
  });
});
