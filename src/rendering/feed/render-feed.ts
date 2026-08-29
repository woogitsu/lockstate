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
};
