import type Phaser from 'phaser';
import { actorAnimationPhase, actorFrameOrdinal, createActorPose, selectActorPose } from '../actors/actor-pose';
import { createCrowdOffset, crowdKeyForPosition, crowdSpreadOffset, NO_CROWD_KEY } from '../actors/crowd-spread';
import { createSpritePlacement, placeFootPivotSprite } from '../actors/sprite-placement';
import type { AtlasFrameIndex } from '../assets/atlas-frame-index';
import { depthForAnchor } from '../depth';
import type { RenderActor } from '../feed/render-feed';
import { TILE_SIZE_PX, tileCentreToWorld, tileRangeContains, type TileRange } from '../tile-metrics';

/**
 * Draws simulated actors as pooled, culled atlas sprites.
 *
 * ### The budget
 *
 * The project targets thousands of concurrent actors, so this layer is written
 * to a cost model rather than to convenience:
 *
 * - **Nothing is created or destroyed per frame.** A `Phaser.GameObjects.Image`
 *   is taken from a free list when an actor comes into view and returned when
 *   it leaves. The pool therefore grows to the largest number of *visible*
 *   actors ever reached -- which is bounded by the viewport, not by the
 *   population -- and stays there.
 * - **Culling is a numeric range test per actor**, so an off-screen crowd
 *   costs a comparison each and no display objects at all.
 * - **The per-frame path allocates no view data.** Pose selection, frame
 *   lookup, pivot placement and the crowd offset all fill caller-owned
 *   objects, the two scratch arrays the co-location pass fills are reused and
 *   grow to a high-water mark like the sprite pool, and the atlas frame index
 *   answers with pre-built descriptors instead of building them per call. The
 *   one thing that does allocate is inside the two `Map`s the co-location pass
 *   keys by drawn position: `Map.set` with a key not seen since the last
 *   `clear()` allocates an entry, so a frame drawing *v* visible actors on *d*
 *   distinct points pays *d* of those. This bullet used to read "allocates
 *   nothing", which was true before the co-location pass existed and is not
 *   true now; the sentence is corrected rather than kept.
 * - **Redundant GPU state is skipped**: `setTexture` and the origin/scale that
 *   go with it are touched only when the resolved frame actually changed.
 *
 * What it costs, honestly: one sprite-pool `Map` probe, two co-location `Map`
 * probes, one pose selection and a handful of setter calls per *visible* actor
 * per frame, plus one range test per actor anywhere in the world. The remaining
 * per-frame cost that does scale with total population is that range test,
 * which is what a spatial index would remove later.
 *
 * ### Two actors on one spot
 *
 * A snapshot legitimately puts several actors on the same tile -- a room's
 * `anchorTile` is where every actor performing an action in that room stands
 * (`docs/research/2026-09-04-why-they-stack.md`), so a housed population
 * stacks by construction. Drawn at one point they are one figure, which is
 * issue #944: 28 actors on two tiles drew two figures. So before drawing, this
 * layer walks the visible actors once to find which of them share a drawn
 * point, and `crowd-spread.ts` turns each one's rank in its group into a
 * bounded offset inside its own tile. That module's docblock carries the rule,
 * the reason the answer is a placement and not a depth bias, and -- stated
 * there rather than implied -- the exact limit of what it buys.
 */

/** Tiles of slack around the viewport, so a sprite taller than its tile does not pop at the edge. */
const CULL_MARGIN_TILES = 3;

interface PooledSprite {
  readonly image: Phaser.GameObjects.Image;
  textureKey: string;
  frameName: string;
  lastSeenFrame: number;
}

export interface ActorLayerStats {
  /** Actors drawn this frame. */
  readonly visible: number;
  /** Sprites held, drawn or idle. This is the pool's high-water mark. */
  readonly pooled: number;
  /** Actors whose logical asset id is not in the loaded atlas batch. */
  readonly unresolved: number;
}

export class ActorLayer {
  private readonly active = new Map<number, PooledSprite>();
  private readonly free: PooledSprite[] = [];
  private readonly pose = createActorPose();
  private readonly placement = createSpritePlacement();
  private readonly crowdOffset = createCrowdOffset();
  /**
   * The visible actors of the frame being drawn, and their crowd keys, in the
   * feed's order.
   *
   * Two parallel scratch arrays rather than one array of pairs, so the second
   * pass needs no per-actor object, and reused across frames rather than
   * rebuilt: `length = 0` keeps the backing store, so this grows to the
   * largest visible population ever reached and then allocates nothing, which
   * is the sprite pool's own bargain.
   */
  private readonly visibleActors: RenderActor[] = [];
  private readonly visibleCrowdKeys: number[] = [];
  /** Actors sharing each drawn point this frame, then how many of each group have been drawn. */
  private readonly crowdSizes = new Map<number, number>();
  private readonly crowdRanks = new Map<number, number>();
  private frameCounter = 0;
  private visibleCount = 0;
  private unresolvedCount = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly index: AtlasFrameIndex,
  ) {}

  public update(actors: readonly RenderActor[], range: TileRange, nowSeconds: number): void {
    this.frameCounter += 1;
    this.visibleCount = 0;
    this.unresolvedCount = 0;

    const culled: TileRange = {
      minTileX: range.minTileX - CULL_MARGIN_TILES,
      maxTileX: range.maxTileX + CULL_MARGIN_TILES,
      minTileY: range.minTileY - CULL_MARGIN_TILES,
      maxTileY: range.maxTileY + CULL_MARGIN_TILES,
    };

    // Pass one: cull, and tally how many actors share each drawn point.
    //
    // A *moving* actor takes no part. It is already distinguishable by its
    // motion, the stack #944 measured is motionless, and an extrapolated
    // position that momentarily rounds onto a standing actor's point would
    // otherwise shove that actor sideways for a frame or two -- a visible pop
    // in exchange for nothing.
    this.visibleActors.length = 0;
    this.visibleCrowdKeys.length = 0;
    this.crowdSizes.clear();
    this.crowdRanks.clear();
    for (const actor of actors) {
      if (!tileRangeContains(culled, actor.tileX, actor.tileY)) continue;
      const key =
        actor.deltaX === 0 && actor.deltaY === 0 ? crowdKeyForPosition(actor.tileX, actor.tileY) : NO_CROWD_KEY;
      this.visibleActors.push(actor);
      this.visibleCrowdKeys.push(key);
      if (key !== NO_CROWD_KEY) this.crowdSizes.set(key, (this.crowdSizes.get(key) ?? 0) + 1);
    }

    // Pass two: draw, in the feed's order, so the rank a crowd offset comes
    // from is that order -- which is documented and deterministic
    // (`actorsFromSnapshot`, `encodeRenderActorsKeyframe`).
    for (let index = 0; index < this.visibleActors.length; index += 1) {
      const actor = this.visibleActors[index]!;
      const key = this.visibleCrowdKeys[index]!;
      const size = key === NO_CROWD_KEY ? 1 : (this.crowdSizes.get(key) ?? 1);
      if (size > 1) {
        const rank = this.crowdRanks.get(key) ?? 0;
        this.crowdRanks.set(key, rank + 1);
        crowdSpreadOffset(rank, size, this.crowdOffset);
      } else {
        this.crowdOffset.x = 0;
        this.crowdOffset.y = 0;
      }
      if (this.draw(actor, nowSeconds, this.crowdOffset.x, this.crowdOffset.y)) this.visibleCount += 1;
    }

    this.releaseUnseen();
  }

  public get stats(): ActorLayerStats {
    return { visible: this.visibleCount, pooled: this.active.size + this.free.length, unresolved: this.unresolvedCount };
  }

  public destroy(): void {
    for (const sprite of this.active.values()) sprite.image.destroy();
    for (const sprite of this.free) sprite.image.destroy();
    this.active.clear();
    this.free.length = 0;
  }

  /** `offsetTilesX`/`offsetTilesY` come from `crowd-spread.ts` and are zero for an actor standing alone. */
  private draw(actor: RenderActor, nowSeconds: number, offsetTilesX: number, offsetTilesY: number): boolean {
    const pose = selectActorPose(actor, this.pose);

    // Fall back to the idle clip rather than dropping the actor: an asset that
    // has no walk cycle should stand, not disappear.
    const clip = this.index.clip(actor.assetId, pose.clipId) ?? this.index.clip(actor.assetId, 'idle');
    if (clip === undefined) {
      this.unresolvedCount += 1;
      return false;
    }

    const ordinal = actorFrameOrdinal(
      nowSeconds,
      clip.fps,
      clip.frameCount,
      clip.loop,
      actorAnimationPhase(actor.id),
    );
    const frame = clip.byDirection.get(pose.direction)?.[ordinal];
    if (frame === undefined) {
      this.unresolvedCount += 1;
      return false;
    }

    const placement = placeFootPivotSprite(
      tileCentreToWorld(actor.tileX) + offsetTilesX * TILE_SIZE_PX,
      tileCentreToWorld(actor.tileY) + offsetTilesY * TILE_SIZE_PX,
      frame,
      undefined,
      this.placement,
    );

    const sprite = this.acquire(actor.id, frame.imageUrl, frame.frameName);
    if (sprite.textureKey !== frame.imageUrl || sprite.frameName !== frame.frameName) {
      sprite.image.setTexture(frame.imageUrl, frame.frameName);
      sprite.image.setOrigin(placement.originX, placement.originY);
      sprite.image.setScale(placement.scale);
      sprite.textureKey = frame.imageUrl;
      sprite.frameName = frame.frameName;
    }

    sprite.image.setPosition(placement.x, placement.y);
    // The feet are the depth anchor, and they are half a tile south of the
    // actor's tile centre in world terms -- the same southern-edge rule the
    // tile layer sorts structures by, so an actor and a wall on one row agree.
    //
    // `placement.y` is the *drawn* foot, crowd offset included, and that is
    // load-bearing rather than incidental: a crowd's members are offset south
    // by distinct amounts, so they get distinct depths and the overlap order
    // of two actors on one tile is decided by where they are drawn instead of
    // by which block of the feed's array they came from (#944 §2).
    sprite.image.setDepth(depthForAnchor(placement.y + TILE_SIZE_PX / 2, 'actor'));
    sprite.lastSeenFrame = this.frameCounter;
    return true;
  }

  private acquire(actorId: number, textureKey: string, frameName: string): PooledSprite {
    const existing = this.active.get(actorId);
    if (existing !== undefined) return existing;

    const pooled = this.free.pop();
    if (pooled !== undefined) {
      pooled.image.setVisible(true);
      this.active.set(actorId, pooled);
      return pooled;
    }

    const image = this.scene.add.image(0, 0, textureKey, frameName);
    // Deliberately recorded as carrying no frame yet, so the caller's
    // "did the frame change?" check runs and applies the pivot origin and
    // scale for the first time.
    const created: PooledSprite = { image, textureKey: '', frameName: '', lastSeenFrame: this.frameCounter };
    this.active.set(actorId, created);
    return created;
  }

  private releaseUnseen(): void {
    for (const [actorId, sprite] of this.active) {
      if (sprite.lastSeenFrame === this.frameCounter) continue;
      this.active.delete(actorId);
      sprite.image.setVisible(false);
      this.free.push(sprite);
    }
  }
}
