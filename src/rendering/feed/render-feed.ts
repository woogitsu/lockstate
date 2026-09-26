import type { AtlasDirection } from '../assets/atlas-manifest';
import type { RenderStructure } from '../world/structures';
import { WorldRenderView } from '../world/world-view';

/**
 * What the renderer needs to draw one frame, and nothing else.
 *
 * A feed is a one-way valve: it turns snapshots the simulation published into
 * immutable view data. Nothing downstream of it can write back, which is how
 * `AGENTS.md` boundary 1 ("rendering is not simulation") is enforced in code
 * rather than by convention.
 */

export interface RenderActor {
  /** Stable simulation entity id -- used to keep the same pooled sprite across frames. */
  readonly id: number;
  /** Logical asset id, resolved through the generated manifest (ADR-0014). Never a filename. */
  readonly assetId: string;
  /** Continuous tile coordinates of the actor's feet. */
  readonly tileX: number;
  readonly tileY: number;
  /** Movement per second in tiles, `+x` east and `+y` south. */
  readonly deltaX: number;
  readonly deltaY: number;
  /** Facing to hold while standing still. */
  readonly facing?: AtlasDirection;
  /** A live incident has claimed this guard for response duty. */
  readonly incidentResponse?: boolean;
  /** A live contraband search has claimed this guard. */
  readonly contrabandSearch?: boolean;
  /** An open riot names this prisoner as a participant. */
  readonly openRiot?: boolean;
  /** An open assault names this prisoner as a participant. */
  readonly openAssault?: boolean;
}

/**
 * A `RenderActor` its owner may refill in place.
 *
 * `SimulationSnapshotFeed` advances each actor's drawn position from the
 * position it was published at on every frame
 * ([ADR 0059](../../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
 * `actor-extrapolation.ts`), and allocating a fresh object per actor per frame
 * would be garbage proportional to the population. The mutability is the
 * feed's alone: `RenderFrame.actors` hands them out as `readonly RenderActor`,
 * and every consumer reads them within the frame it asked for.
 */
export type MutableRenderActor = { -readonly [K in keyof RenderActor]: RenderActor[K] };

/**
 * One room instance's rectangle, as the geometry pull published it.
 *
 * [ADR 0111](../../../docs/adr/0111-how-a-room-instances-rectangle-reaches-the-render-side.md)
 * decision 1's payload, and the first room-instance identity ever to cross
 * this seam: `room-labels.ts`'s own docblock still records the state this
 * closes -- *"The renderer has no room-instance identity."* -- which is why a
 * mark keyed on a per-tile scalar field merges two adjacent cells into one
 * verdict and a mark keyed on this one cannot.
 *
 * A **sibling field on the frame rather than a member of `WorldRenderView`**,
 * which is ADR 0111 open question 1 answered in the direction the document
 * expected: that view is per-tile by construction and a room is not, so a
 * rectangle set living inside it would have to be addressed by a tile lookup
 * that has no answer for the tiles between two rooms.
 *
 * Rooms whose rectangle the bundle does not record are absent from this list
 * (`rooms-from-snapshot.ts`), and absence means "no rectangle was published",
 * never "no room".
 */
export interface RenderRoom {
  /** `catalogId:x:y` of the room's north-west corner -- the simulation's own instance id, carried verbatim. */
  readonly instanceId: string;
  readonly roomCatalogId: string;
  /** The rectangle's north-west corner, in tiles. The key `RenderRoomCondition` joins on. */
  readonly anchorTileX: number;
  readonly anchorTileY: number;
  /** Always at least 1: a degenerate rectangle is refused rather than published. */
  readonly width: number;
  readonly height: number;
}

/**
 * What the simulation last said about one room's condition, keyed by the
 * room's anchor tile.
 *
 * [ADR 0097](../../../docs/adr/0097-what-the-world-view-is-required-to-communicate.md)
 * decision 2's channel: this arrives on `simulation/delta`, not on the
 * geometry pull, because *"a 30-second-stale claim about whether a cell is
 * working is a false claim"*. `condition` is one of the
 * `RENDER_ROOM_CONDITION_*` ordinals, which are ADR 0108's `RoomAccess`
 * vocabulary and answer exactly one question: can anybody get in.
 */
export interface RenderRoomCondition {
  readonly anchorTileX: number;
  readonly anchorTileY: number;
  readonly condition: number;
}

export interface RenderFrame {
  /**
   * Increments whenever `world` or `structures` change. The tile painter
   * repaints on a change of revision or of visible range, and on nothing else.
   */
  readonly revision: number;
  readonly world: WorldRenderView;
  readonly structures: readonly RenderStructure[];
  readonly actors: readonly RenderActor[];
  /**
   * The room rectangles the last geometry pull carried, and therefore on the
   * same freshness terms as `world` and `structures`: they move with
   * `revision`.
   */
  readonly rooms: readonly RenderRoom[];
  /**
   * The condition ordinals the last delta carried, on the delta's own
   * freshness terms and **not** on `revision`'s.
   *
   * The two lists are published on two channels on purpose (ADR 0111 decision
   * 2), so they can disagree for one round trip: a room zoned a moment ago has
   * a rectangle and no condition yet, and a room unzoned a moment ago can have
   * a condition and no rectangle. A consumer joins them by anchor tile and
   * draws nothing for a row it cannot join, which is the only reading that
   * cannot assert a room the frame does not hold.
   */
  readonly roomConditions: readonly RenderRoomCondition[];
}

export interface RenderFeed {
  /**
   * Called once per rendered frame. `nowSeconds` is presentation time, never
   * simulation time: it drives animation phase and poll scheduling only.
   */
  readFrame(nowSeconds: number): RenderFrame;
}

export const EMPTY_RENDER_FRAME: RenderFrame = {
  revision: 0,
  world: WorldRenderView.empty(),
  structures: [],
  actors: [],
  rooms: [],
  roomConditions: [],
};
