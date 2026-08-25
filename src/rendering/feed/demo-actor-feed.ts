import type { AtlasDirection } from '../assets/atlas-manifest';
import type { RenderActor, RenderFeed, RenderFrame } from './render-feed';

/**
 * Representative actors for looking at the sprite path with your own eyes.
 *
 * **This is not game state and never becomes game state.** A fresh Lockstate
 * session contains no actors at all: the simulation deliberately fabricates no
 * default content, so a prison holds nobody to draw until the player admits
 * somebody through the Intake panel (#261 step 4).
 *
 * `SimulationSnapshotFeed` does now decode the prisoners a bundle carries
 * (`actors-from-snapshot.ts`), so this is no longer the only path to a sprite
 * -- it is the only one that works on an *empty* prison, which is every prison
 * before its first admission. A snapshot also carries no velocity and no
 * facing, so a decoded
 * prisoner stands still; the scripted walk below is what shows the walk cycle
 * and the eight authored directions at all.
 *
 * So this feed puts a scripted walk in front of the camera when explicitly
 * asked for (`?actors=demo`). It is opt-in, it is clearly labelled, and it
 * wraps a real feed instead of replacing it, so the world underneath is still
 * the real world from the real snapshot.
 *
 * It does **replace** the frame's actor list rather than adding to it, so a
 * prison that did hold prisoners would show the demo instead of them while the
 * flag is on. That is deliberate: the demo numbers its actors from 1 and
 * `EntityId`s start at 0, so a merged list could hand two actors the same
 * pooled sprite. A flag that exists to look at the art is the wrong place to
 * fix that, and the flag is off by default.
 *
 * The motion is a closed-form function of presentation time, so it is
 * deterministic, allocation-free per frame, and sweeps all eight authored
 * directions once per revolution.
 */

interface MutableActor {
  id: number;
  assetId: string;
  tileX: number;
  tileY: number;
  deltaX: number;
  deltaY: number;
  facing?: AtlasDirection;
}

export interface DemoActorFeedOptions {
  /** Logical asset ids, resolved through the manifest by the renderer. */
  readonly assetIds: readonly string[];
  readonly centreTileX?: number;
  readonly centreTileY?: number;
  readonly radiusTiles?: number;
  readonly revolutionSeconds?: number;
}

const DEFAULT_RADIUS_TILES = 7;
const DEFAULT_REVOLUTION_SECONDS = 28;

/** `?actors=demo` on the page URL. Kept pure so the parsing rule is testable. */
export function isDemoActorsRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get('actors') === 'demo';
  } catch {
    return false;
  }
}

export class DemoActorFeed implements RenderFeed {
  private readonly walkers: MutableActor[] = [];
  private readonly stander: MutableActor;
  private readonly actors: MutableActor[];
  private readonly radiusTiles: number;
  private readonly revolutionSeconds: number;
  private readonly centreTileX: number | undefined;
  private readonly centreTileY: number | undefined;
  private composed: RenderFrame | undefined;
  private composedSource: RenderFrame | undefined;

  public constructor(
    private readonly inner: RenderFeed,
    options: DemoActorFeedOptions,
  ) {
    if (options.assetIds.length === 0) throw new RangeError('A demo actor feed needs at least one asset id.');
    this.radiusTiles = options.radiusTiles ?? DEFAULT_RADIUS_TILES;
    this.revolutionSeconds = options.revolutionSeconds ?? DEFAULT_REVOLUTION_SECONDS;
    if (this.radiusTiles <= 0) throw new RangeError('Demo radius must be positive.');
    if (this.revolutionSeconds <= 0) throw new RangeError('Demo revolution time must be positive.');
    this.centreTileX = options.centreTileX;
    this.centreTileY = options.centreTileY;

    options.assetIds.forEach((assetId, index) => {
      this.walkers.push({ id: index + 1, assetId, tileX: 0, tileY: 0, deltaX: 0, deltaY: 0 });
    });
    // One actor stands still, so the idle clip and the "hold your facing"
    // rule are visible next to the walk cycle rather than only in a test.
    this.stander = {
      id: this.walkers.length + 1,
      assetId: options.assetIds[0] as string,
      tileX: 0,
      tileY: 0,
      deltaX: 0,
      deltaY: 0,
      facing: 'south',
    };
    this.actors = [...this.walkers, this.stander];
  }

  public readFrame(nowSeconds: number): RenderFrame {
    const frame = this.inner.readFrame(nowSeconds);
    const bounds = frame.world.loadedBounds;
    const centreX = this.centreTileX ?? (bounds === undefined ? 16 : (bounds.minTileX + bounds.maxTileX + 1) / 2);
    const centreY = this.centreTileY ?? (bounds === undefined ? 16 : (bounds.minTileY + bounds.maxTileY + 1) / 2);

    const angularSpeed = (Math.PI * 2) / this.revolutionSeconds;
    const count = this.walkers.length;

    for (let index = 0; index < count; index += 1) {
      const walker = this.walkers[index] as MutableActor;
      const angle = angularSpeed * nowSeconds + (Math.PI * 2 * index) / count;
      walker.tileX = centreX + Math.cos(angle) * this.radiusTiles;
      walker.tileY = centreY + Math.sin(angle) * this.radiusTiles;
      // Exact derivative of the position above: the sprite always faces the
      // way it is actually travelling, which is the property worth seeing.
      walker.deltaX = -Math.sin(angle) * this.radiusTiles * angularSpeed;
      walker.deltaY = Math.cos(angle) * this.radiusTiles * angularSpeed;
    }

    this.stander.tileX = centreX;
    this.stander.tileY = centreY;

    if (this.composed === undefined || this.composedSource !== frame) {
      this.composedSource = frame;
      this.composed = {
        revision: frame.revision,
        world: frame.world,
        structures: frame.structures,
        actors: this.actors as readonly RenderActor[],
      };
    }
    return this.composed;
  }
}
