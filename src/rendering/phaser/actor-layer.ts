import type Phaser from 'phaser';
import { actorAnimationPhase, actorFrameOrdinal, createActorPose, selectActorPose } from '../actors/actor-pose';
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
 * - **The per-frame path allocates nothing.** Pose selection, frame lookup and
 *   pivot placement all fill caller-owned objects, and the atlas frame index
 *   answers with pre-built descriptors instead of building them per call.
 * - **Redundant GPU state is skipped**: `setTexture` and the origin/scale that
 *   go with it are touched only when the resolved frame actually changed.
 *
 * What it costs, honestly: one `Map` probe, one pose selection and a handful of
 * setter calls per *visible* actor per frame, plus one range test per actor
 * anywhere in the world. The remaining per-frame cost that does scale with
 * total population is that range test, which is what a spatial index would
 * remove later.
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

    for (const actor of actors) {
      if (!tileRangeContains(culled, actor.tileX, actor.tileY)) continue;
      if (this.draw(actor, nowSeconds)) this.visibleCount += 1;
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

  private draw(actor: RenderActor, nowSeconds: number): boolean {
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
      tileCentreToWorld(actor.tileX),
      tileCentreToWorld(actor.tileY),
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
