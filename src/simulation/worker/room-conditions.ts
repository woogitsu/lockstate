import type { RoomInstance } from '../prisoners/room-instance-registry';
import { roomBoundsOf } from '../objects/room-capacity';
import type { RoomDoorReader, RoomEdgeReader, TileRectangle } from '../rooms/enclosure';
import { roomAccess, roomReachability, type RoomAccess, type RoomRegionReader } from '../rooms/reachability';
import {
  RENDER_ROOM_CONDITION_DOORWAY,
  RENDER_ROOM_CONDITION_GAP,
  RENDER_ROOM_CONDITION_NO_WAY_IN,
  RENDER_ROOM_CONDITION_UNREACHABLE,
} from '../protocol/render-actors-payload';

/**
 * The worker's half of ADR 0097's condition channel: one ordinal per room
 * instance, read off the live simulation.
 *
 * ## What it answers, and what it deliberately does not
 *
 * ADR 0097 decision 1 requires the world view to answer *"whether what is
 * here works"*; decision 4 bounds the payload to **one ordinal** per room --
 * *"enough to know which room to look at"*, with the Rooms panel owing the
 * detail. This publishes ADR 0108's `RoomAccess` and nothing else: can
 * anybody get in. Occupancy, requirement satisfaction and concurrent-use
 * pressure are the other clauses of obligation 2 and are **not** folded in
 * here, because folding them into one ordinal needs a precedence order that
 * ADR 0097 open question 3 leaves open, and inventing one inside
 * implementation code is the thing `AGENTS.md` forbids.
 *
 * It is also the clause #1022 measured: a sealed cell and a working one
 * differ by 6,061 pixels of 147,456, and 3,072 of them are the door.
 *
 * ## Strictly a read
 *
 * Like `encodeRenderActorsKeyframe` beside it, and for the same reason: it is
 * called from a wall-clock cadence, so anything it wrote would make a tick's
 * result depend on how often a player's machine published. It calls
 * `getGraph()` -- which rebuilds a stale navigation graph, the same call
 * `projection-catalog.ts` makes for the Rooms panel -- and otherwise only
 * reads registries.
 *
 * ## Why the caller caches it
 *
 * Every input is structural: the world's edge layers, the door registry and
 * the region partition built from both. None of them can change without the
 * drawn world's marker moving (ADR 0099 decision 3 -- `markDrawnWorldChanged`
 * is called on the writes that change what the renderer draws, zoning and
 * completed construction among them), so `state-machine.ts` recomputes this
 * when the marker moves and republishes the cached rows otherwise. That keeps
 * a 10 Hz channel off ADR 0108's exterior walk, which is a per-projection cost
 * rather than a per-frame one.
 */
export interface RoomConditionRow {
  /** The room's north-west corner: the join key the payload carries (`RENDER_ACTORS_ROOM_WORDS`). */
  readonly anchorTileX: number;
  readonly anchorTileY: number;
  /** One of the `RENDER_ROOM_CONDITION_*` ordinals. Never `UNKNOWN`: a room with no answer contributes no row. */
  readonly condition: number;
}

/**
 * The narrow slice of the runtime this reads. Structural, so a test needs no
 * session -- the same shape `RenderActorSource` takes one file over.
 */
export interface RoomConditionSource {
  readonly world: RoomEdgeReader;
  readonly navigation: {
    readonly doors: RoomDoorReader;
    getGraph(): RoomRegionReader;
  };
  readonly prisoners: {
    readonly roomInstances: {
      getSnapshot(): readonly (readonly [string, readonly number[]])[];
      getById(instanceId: string): RoomInstance | undefined;
    };
  };
}

/** ADR 0108's vocabulary as the wire's ordinal. Total over `RoomAccess`, so a fifth member is a compile error here rather than a silent zero. */
export function renderRoomConditionFor(access: RoomAccess): number {
  switch (access) {
    case 'gap':
      return RENDER_ROOM_CONDITION_GAP;
    case 'doorway':
      return RENDER_ROOM_CONDITION_DOORWAY;
    case 'unreachable':
      return RENDER_ROOM_CONDITION_UNREACHABLE;
    case 'no-way-in':
      return RENDER_ROOM_CONDITION_NO_WAY_IN;
  }
}

/**
 * One row per room instance that has a rectangle, in `getSnapshot`'s ascending
 * instance-id order.
 *
 * **An instance with no recorded rectangle contributes nothing**, rather than
 * a guessed rectangle or a guessed verdict: `roomBoundsOf` is this
 * repository's single definition of a room's extent and answers `undefined`
 * for a row the zoning plane cannot support, and ADR 0111 §4 asks a reader to
 * treat a missing room as "no mark available" instead of "no room".
 *
 * The reachability walk is prepared once and asked once per room, exactly as
 * `room-projection.ts` prepares it, so a prison with three hundred rooms pays
 * for one exterior walk rather than three hundred.
 */
export function collectRoomConditions(source: RoomConditionSource): readonly RoomConditionRow[] {
  const snapshot = source.prisoners.roomInstances.getSnapshot();
  if (snapshot.length === 0) return [];

  const instances: RoomInstance[] = [];
  const rectangles: TileRectangle[] = [];
  for (const [instanceId] of snapshot) {
    const instance = source.prisoners.roomInstances.getById(instanceId);
    if (instance === undefined) continue;
    const bounds = roomBoundsOf(instance);
    if (bounds === undefined) continue;
    instances.push(instance);
    rectangles.push(bounds);
  }
  if (instances.length === 0) return [];

  const regions = source.navigation.getGraph();
  const reachability = roomReachability(source.world, source.navigation.doors, regions, () => rectangles);

  const rows: RoomConditionRow[] = [];
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index] as RoomInstance;
    const rectangle = rectangles[index] as TileRectangle;
    rows.push({
      anchorTileX: instance.anchorTile.x,
      anchorTileY: instance.anchorTile.y,
      condition: renderRoomConditionFor(roomAccess(source.world, source.navigation.doors, reachability, rectangle)),
    });
  }
  return rows;
}
