import { describe, expect, it } from 'vitest';

import { DoorRegistry } from '../../src/simulation/navigation/door';
import {
  buildNavigationGraph,
  resolveEdge,
  type NavigationGraph,
  type RegionId,
} from '../../src/simulation/navigation/region-graph';
import { chunkCoordinate, tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import type { TileRectangle } from '../../src/simulation/rooms/enclosure';

/**
 * ADR 0108's own named weakest claim, run.
 *
 * The document says, of decision 1's exterior anchor: *"the exterior rule is
 * proved against room rectangles only ... it shows nothing about a sealed
 * structure on the frontier that is **not** a zoned room -- a corridor boxed in
 * by walls, an unzoned shed -- whose tiles would still seed the exterior and
 * could then vouch for everything behind their own door. **What would falsify
 * it:** the same probe with a walled, unzoned rectangle in the corner instead
 * of a room. I did not run it, and I expect it to fail."*
 *
 * This is that probe. It builds each scenario once and scores three candidate
 * seed rules against it, so the table says which rules survive rather than
 * only that one of them died:
 *
 * - **R1, the ADR's rule** -- regions holding a boundary-ring tile that is not
 *   inside any zoned room's rectangle.
 * - **R2, the frontier-opening rule** -- regions holding a ring tile with an
 *   *open crossing out of the loaded area*: the edge between it and its
 *   missing neighbour holds no geometry, or holds a registered door. No room
 *   clause at all.
 * - **R3** -- R2's crossing test *and* R1's room-rectangle exclusion.
 * - **R4, the rule this repository ships** -- R2, and R1 only when R2 finds
 *   nothing at all. See `exteriorRegions` in
 *   `src/simulation/rooms/reachability.ts`, which is this rule and is kept
 *   honest against this file by `tests/unit/rooms-reachability.test.ts`.
 *
 * Every rule is followed by the same portal walk and the same `tileToRegion`
 * lookup per room, so the only variable is the seed set.
 *
 * ## What it found, 2026-09-11
 *
 * **R1 is defeated by S2, in the reassuring direction**, which is what the ADR
 * expected and is why decision 1 could not ship as written. R2 repairs S2 and
 * is then defeated by S6 -- a loaded area walled flush at its own boundary has
 * no opening, so every room in the prison reads unreachable at once. R4 is the
 * smallest rule that survives both. **S3 and S7 defeat every rule here**, and
 * neither is repairable by a seed rule: both turn on the loaded area's frontier
 * being open ground to the edge layers and a wall to the region graph, which is
 * the ambiguity `enclosure.ts:44-50` says nobody has written a rule for.
 */

const CHUNK = 32;
const ORIGIN = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
const WALL = 1;

function tile(x: number, y: number): TilePosition {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

function tileKey(position: TilePosition): string {
  return `${position.x},${position.y}`;
}

/** Walls the whole perimeter of `rect`, in the same edge vocabulary the world stores. */
function wallRectangle(world: SparseWorld, rect: TileRectangle): void {
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  for (let x = rect.x; x <= right; x += 1) {
    world.setTopEdge(tile(x, rect.y), WALL);
    world.setTopEdge(tile(x, bottom + 1), WALL);
  }
  for (let y = rect.y; y <= bottom; y += 1) {
    world.setLeftEdge(tile(rect.x, y), WALL);
    world.setLeftEdge(tile(right + 1, y), WALL);
  }
}

interface Scenario {
  readonly name: string;
  readonly world: SparseWorld;
  readonly doors: DoorRegistry;
  readonly graph: NavigationGraph;
  /** Zoned room rectangles, in the shape `roomBoundsOf` hands them over. */
  readonly rooms: ReadonlyMap<string, TileRectangle>;
  /** What a player would say about each room, independent of any rule below. */
  readonly truth: ReadonlyMap<string, boolean>;
}

function graphOf(world: SparseWorld, doors: DoorRegistry): NavigationGraph {
  const chunks = [world.getChunk(ORIGIN)!];
  return buildNavigationGraph(world, doors, chunks);
}

/** Every loaded tile with at least one neighbour outside the loaded set. */
function ringTiles(graph: NavigationGraph): readonly TilePosition[] {
  const ring: TilePosition[] = [];
  const keys = [...graph.tileToRegion.keys()].sort();
  for (const key of keys) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    const neighbours = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const;
    if (neighbours.some(([nx, ny]) => !graph.tileToRegion.has(`${nx},${ny}`))) ring.push(tile(x, y));
  }
  return ring;
}

function insideAnyRoom(rooms: Iterable<TileRectangle>, position: TilePosition): boolean {
  for (const rect of rooms) {
    if (
      position.x >= rect.x &&
      position.x < rect.x + rect.width &&
      position.y >= rect.y &&
      position.y < rect.y + rect.height
    ) {
      return true;
    }
  }
  return false;
}

/** Whether this ring tile has an open crossing to a tile outside the loaded area. */
function opensOutOfLoadedArea(
  world: SparseWorld,
  doors: DoorRegistry,
  graph: NavigationGraph,
  position: TilePosition,
): boolean {
  const neighbours = [
    tile(position.x + 1, position.y),
    tile(position.x - 1, position.y),
    tile(position.x, position.y + 1),
    tile(position.x, position.y - 1),
  ];
  for (const neighbour of neighbours) {
    if (graph.tileToRegion.has(tileKey(neighbour))) continue;
    const edge = resolveEdge(world, position, neighbour);
    if (doors.getByEdge(edge.ownerTile, edge.side) !== undefined) return true;
    if (edge.wallValue === 0) return true;
  }
  return false;
}

type SeedRule = 'R1-ring-minus-rooms' | 'R2-frontier-opening' | 'R3-both' | 'R4-shipped';

function seedRegions(scenario: Scenario, rule: SeedRule): ReadonlySet<RegionId> {
  if (rule === 'R4-shipped') {
    const escaping = seedRegions(scenario, 'R2-frontier-opening');
    return escaping.size > 0 ? escaping : seedRegions(scenario, 'R1-ring-minus-rooms');
  }

  const { world, doors, graph, rooms } = scenario;
  const rects = [...rooms.values()];
  const seeds = new Set<RegionId>();
  for (const position of ringTiles(graph)) {
    if (rule !== 'R2-frontier-opening' && insideAnyRoom(rects, position)) continue;
    if (rule !== 'R1-ring-minus-rooms' && !opensOutOfLoadedArea(world, doors, graph, position)) continue;
    const region = graph.tileToRegion.get(tileKey(position));
    if (region !== undefined) seeds.add(region);
  }
  return seeds;
}

function walk(graph: NavigationGraph, seeds: ReadonlySet<RegionId>): ReadonlySet<RegionId> {
  const reached = new Set<RegionId>(seeds);
  const stack = [...seeds].sort((a, b) => a - b);
  while (stack.length > 0) {
    const region = stack.pop()!;
    for (const portal of graph.regionPortals.get(region) ?? []) {
      for (const side of [portal.regionA, portal.regionB]) {
        if (reached.has(side)) continue;
        reached.add(side);
        stack.push(side);
      }
    }
  }
  return reached;
}

function roomIsReachable(scenario: Scenario, rule: SeedRule, rect: TileRectangle): boolean {
  const reached = walk(scenario.graph, seedRegions(scenario, rule));
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const region = scenario.graph.tileToRegion.get(tileKey(tile(x, y)));
      if (region !== undefined && reached.has(region)) return true;
    }
  }
  return false;
}

/**
 * S1 -- the ADR's own anchor probe, rebuilt here so the three rules are scored
 * on it too: two identical sealed zoned rooms with a door each, one interior
 * and one whose interior tiles sit on the boundary ring. Both doors are walled
 * up from outside; neither room is reachable.
 */
function scenarioAnchor(): Scenario {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  const doors = new DoorRegistry();

  const frontier: TileRectangle = { x: 0, y: 0, width: 3, height: 3 };
  const interior: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
  for (const rect of [frontier, interior]) wallRectangle(world, rect);

  // A door on each room's south wall, and the corridor tile outside it walled
  // off on its three remaining sides -- the act-4a state.
  let index = 0;
  for (const rect of [frontier, interior]) {
    const doorTile = tile(rect.x + 1, rect.y + rect.height);
    doors.register({
      id: `door-${index}`,
      position: doorTile,
      side: 'top',
      state: 'closed',
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
    world.setTopEdge(tile(doorTile.x, doorTile.y + 1), WALL);
    world.setLeftEdge(doorTile, WALL);
    world.setLeftEdge(tile(doorTile.x + 1, doorTile.y), WALL);
    index += 1;
  }

  return {
    name: 'S1 anchor: sealed zoned rooms, one interior and one on the ring',
    world,
    doors,
    graph: graphOf(world, doors),
    rooms: new Map([
      ['frontier room', frontier],
      ['interior room', interior],
    ]),
    truth: new Map([
      ['frontier room', false],
      ['interior room', false],
    ]),
  };
}

/**
 * S2 -- THE FALSIFIER. A walled, **unzoned** shed in the corner, walled on all
 * four sides including the two that lie on the world frontier, with the only
 * way into a zoned room leading through it.
 */
function scenarioUnzonedShed(): Scenario {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  const doors = new DoorRegistry();

  const shed: TileRectangle = { x: 0, y: 0, width: 3, height: 3 };
  const room: TileRectangle = { x: 0, y: 4, width: 3, height: 3 };
  wallRectangle(world, shed);
  wallRectangle(world, room);

  // The corridor row y = 3 lies between the shed's south wall and the room's
  // north wall. Seal its two ends so the only way into it is out of the shed.
  world.setLeftEdge(tile(0, 3), WALL);
  world.setLeftEdge(tile(3, 3), WALL);
  // A door out of the shed into that row, and a door out of that row into the
  // room. Both rooms' perimeters stay sealed; both doors are real portals.
  doors.register({
    id: 'shed-hatch',
    position: tile(1, 3),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });
  doors.register({
    id: 'room-door',
    position: tile(1, 4),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  return {
    name: 'S2 FALSIFIER: walled UNZONED shed in the corner, the only way into a zoned room',
    world,
    doors,
    graph: graphOf(world, doors),
    rooms: new Map([['room behind the shed', room]]),
    truth: new Map([['room behind the shed', false]]),
  };
}

/**
 * S3 -- the same shed, but leaning on the edge of the loaded area for two of
 * its walls instead of building them. The world model calls unmaterialised
 * space open ground (`getTopEdge` answers 0 for a chunk that does not exist),
 * so this shed is not sealed by any wall; it is unreachable only because
 * nothing streams chunks in. Recorded to separate the two cases.
 */
function scenarioFrontierLeanShed(): Scenario {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  const doors = new DoorRegistry();

  const room: TileRectangle = { x: 0, y: 4, width: 3, height: 3 };
  wallRectangle(world, room);
  // Only the shed's south and east walls; its north and west sides are the
  // edge of the loaded area.
  for (let x = 0; x <= 2; x += 1) world.setTopEdge(tile(x, 3), WALL);
  for (let y = 0; y <= 2; y += 1) world.setLeftEdge(tile(3, y), WALL);

  world.setLeftEdge(tile(0, 3), WALL);
  world.setLeftEdge(tile(3, 3), WALL);
  doors.register({
    id: 'shed-hatch',
    position: tile(1, 3),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });
  doors.register({
    id: 'room-door',
    position: tile(1, 4),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  return {
    name: 'S3: unzoned shed leaning on the loaded-area edge for two of its walls',
    world,
    doors,
    graph: graphOf(world, doors),
    rooms: new Map([['room behind the shed', room]]),
    truth: new Map([['room behind the shed', false]]),
  };
}

/** S4 -- the ordinary case: a sealed room with a door onto open yard. Reachable. */
function scenarioOpenYard(): Scenario {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  const doors = new DoorRegistry();

  const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
  wallRectangle(world, room);
  doors.register({
    id: 'room-door',
    position: tile(11, 13),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  return {
    name: 'S4 control: a sealed room with a door onto open yard',
    world,
    doors,
    graph: graphOf(world, doors),
    rooms: new Map([['ordinary room', room]]),
    truth: new Map([['ordinary room', true]]),
  };
}

/**
 * S5 -- a prison perimeter wall two tiles inside the frontier, with one gate,
 * and a room inside it. Everything inside is reachable through the gate; this
 * is the case a rule that demands an opening at the frontier could break.
 */
function scenarioPerimeterWall(): Scenario {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  const doors = new DoorRegistry();

  wallRectangle(world, { x: 2, y: 2, width: CHUNK - 4, height: CHUNK - 4 });
  doors.register({
    id: 'main-gate',
    position: tile(5, 2),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
  wallRectangle(world, room);
  doors.register({
    id: 'room-door',
    position: tile(11, 13),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  return {
    name: 'S5: perimeter wall two tiles inside the frontier, one gate, a room inside',
    world,
    doors,
    graph: graphOf(world, doors),
    rooms: new Map([['room inside the wall', room]]),
    truth: new Map([['room inside the wall', true]]),
  };
}

/**
 * S6 -- the degenerate case a frontier-opening rule has to be asked about: the
 * player walls the loaded area's own boundary flush, so no tile has an opening
 * out of it at all.
 */
function scenarioFlushPerimeter(): Scenario {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  const doors = new DoorRegistry();

  wallRectangle(world, { x: 0, y: 0, width: CHUNK, height: CHUNK });

  const room: TileRectangle = { x: 10, y: 10, width: 3, height: 3 };
  wallRectangle(world, room);
  doors.register({
    id: 'room-door',
    position: tile(11, 13),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  return {
    name: 'S6 degenerate: the loaded area walled flush at its own boundary',
    world,
    doors,
    graph: graphOf(world, doors),
    rooms: new Map([['room inside the flush wall', room]]),
    truth: new Map([['room inside the flush wall', true]]),
  };
}

/**
 * S7 -- the compound case, and the residual limit of R4. The loaded area is
 * walled flush *and* a walled unzoned shed sits in the corner, so no region
 * escapes, R4 falls back to the ring rule, and the shed seeds the exterior
 * again. Recorded because a limit that is measured is worth more than one that
 * is asserted: any rule that answers S6 by relaxing the loaded-area boundary
 * relaxes it for the shed's own walls too.
 */
function scenarioFlushPerimeterWithShed(): Scenario {
  const world = new SparseWorld(CHUNK);
  world.load(ORIGIN);
  const doors = new DoorRegistry();

  wallRectangle(world, { x: 0, y: 0, width: CHUNK, height: CHUNK });
  wallRectangle(world, { x: 0, y: 0, width: 3, height: 3 });

  const room: TileRectangle = { x: 0, y: 4, width: 3, height: 3 };
  wallRectangle(world, room);
  world.setLeftEdge(tile(0, 3), WALL);
  world.setLeftEdge(tile(3, 3), WALL);
  doors.register({
    id: 'shed-hatch',
    position: tile(1, 3),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });
  doors.register({
    id: 'room-door',
    position: tile(1, 4),
    side: 'top',
    state: 'closed',
    requiredSecurityClearance: 0,
    costMultiplier: 1,
  });

  return {
    name: 'S7 residual: flush-walled loaded area AND a walled unzoned shed in the corner',
    world,
    doors,
    graph: graphOf(world, doors),
    rooms: new Map([['room behind the shed', room]]),
    truth: new Map([['room behind the shed', false]]),
  };
}

const RULES: readonly SeedRule[] = ['R1-ring-minus-rooms', 'R2-frontier-opening', 'R3-both', 'R4-shipped'];

describe('ADR 0108 decision 1: the exterior anchor, against the falsifier it declined to run', () => {
  const scenarios = [
    scenarioAnchor(),
    scenarioUnzonedShed(),
    scenarioFrontierLeanShed(),
    scenarioOpenYard(),
    scenarioPerimeterWall(),
    scenarioFlushPerimeter(),
    scenarioFlushPerimeterWithShed(),
  ];

  it('scores every candidate seed rule on every scenario', () => {
    const lines: string[] = [];
    for (const scenario of scenarios) {
      lines.push('');
      lines.push(scenario.name);
      lines.push(
        `  regions ${new Set(scenario.graph.tileToRegion.values()).size}, portals ${scenario.graph.portals.length}`,
      );
      for (const [label, rect] of scenario.rooms) {
        const truth = scenario.truth.get(label)!;
        lines.push(`  ${label}: truth=${truth ? 'reachable' : 'unreachable'}`);
        for (const rule of RULES) {
          const answer = roomIsReachable(scenario, rule, rect);
          lines.push(
            `    ${rule}=${answer ? 'reachable' : 'unreachable'}${answer === truth ? '' : '   <-- WRONG'}`,
          );
        }
      }
      for (const rule of RULES) {
        const seeds = [...seedRegions(scenario, rule)].sort((a, b) => a - b);
        lines.push(`  seeds under ${rule}: ${seeds.length === 0 ? '(none)' : seeds.join(', ')}`);
      }
    }
    console.log(lines.join('\n'));
    expect(scenarios).toHaveLength(7);
  });
});
