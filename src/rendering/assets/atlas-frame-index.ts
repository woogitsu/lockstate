import type { AtlasLibrary } from './atlas-library';
import { ATLAS_DIRECTIONS, type AtlasDirection, type AtlasFrameRect } from './atlas-manifest';

/**
 * A flattened, allocation-free view of everything `AtlasLibrary` can resolve.
 *
 * `AtlasLibrary.resolveFrame` is the right shape for asking a question once:
 * it validates, it looks up by string, and it builds a fresh array of frame
 * descriptors for the whole clip on the way. A renderer drawing thousands of
 * actors asks that question thousands of times per frame, so doing it that way
 * would allocate a clip's worth of objects per actor per frame.
 *
 * This index pays that cost once at load time and then answers with a
 * pre-built, shared object. The manifest is still the only source of truth --
 * every entry here came out of `AtlasLibrary`, and no filename is spelled
 * anywhere (ADR-0014).
 */

export interface IndexedFrame {
  /** URL of the atlas image; also the renderer's texture key, so keys cannot drift from content. */
  readonly imageUrl: string;
  /** Stable name for this frame inside its texture. */
  readonly frameName: string;
  readonly rect: AtlasFrameRect;
  readonly footPivotPx: { readonly x: number; readonly y: number };
}

export interface IndexedClip {
  readonly assetId: string;
  readonly clipId: string;
  readonly fps: number;
  readonly loop: boolean;
  readonly frameCount: number;
  /** Every direction is present: the manifest schema makes a clip's direction set exhaustive. */
  readonly byDirection: ReadonlyMap<AtlasDirection, readonly IndexedFrame[]>;
}

/** One atlas image and the frames carved out of it, for a texture loader to register in one pass. */
export interface IndexedImage {
  readonly imageUrl: string;
  readonly frames: readonly { readonly name: string; readonly rect: AtlasFrameRect }[];
}

export function atlasFrameName(clipId: string, direction: AtlasDirection, ordinal: number): string {
  return `${clipId}:${direction}:${ordinal}`;
}

export class AtlasFrameIndex {
  private constructor(
    private readonly clips: ReadonlyMap<string, ReadonlyMap<string, IndexedClip>>,
    private readonly imageList: readonly IndexedImage[],
  ) {}

  public static fromLibrary(library: AtlasLibrary): AtlasFrameIndex {
    const clips = new Map<string, Map<string, IndexedClip>>();
    const images = new Map<string, { name: string; rect: AtlasFrameRect }[]>();

    for (const assetId of library.assetIds()) {
      const byClip = new Map<string, IndexedClip>();

      for (const clipId of library.clipIds(assetId)) {
        const byDirection = new Map<AtlasDirection, readonly IndexedFrame[]>();
        let fps = 1;
        let loop = true;
        let frameCount = 0;

        for (const direction of ATLAS_DIRECTIONS) {
          const resolved = library.resolveClip(assetId, clipId, direction);
          fps = resolved.fps;
          loop = resolved.loop;
          frameCount = resolved.frames.length;

          const frames = resolved.frames.map((frame, ordinal) => {
            const name = atlasFrameName(clipId, direction, ordinal);
            let imageFrames = images.get(frame.imageUrl);
            if (imageFrames === undefined) {
              imageFrames = [];
              images.set(frame.imageUrl, imageFrames);
            }
            imageFrames.push({ name, rect: frame.rect });
            return {
              imageUrl: frame.imageUrl,
              frameName: name,
              rect: frame.rect,
              footPivotPx: frame.footPivotPx,
            } satisfies IndexedFrame;
          });

          byDirection.set(direction, frames);
        }

        byClip.set(clipId, { assetId, clipId, fps, loop, frameCount, byDirection });
      }

      clips.set(assetId, byClip);
    }

    const imageList = [...images.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([imageUrl, frames]) => ({ imageUrl, frames }));

    return new AtlasFrameIndex(clips, imageList);
  }

  public assetIds(): readonly string[] {
    return [...this.clips.keys()];
  }

  public has(assetId: string): boolean {
    return this.clips.has(assetId);
  }

  public images(): readonly IndexedImage[] {
    return this.imageList;
  }

  /** Undefined rather than throwing: a missing clip is a content gap the renderer degrades through, not a crash. */
  public clip(assetId: string, clipId: string): IndexedClip | undefined {
    return this.clips.get(assetId)?.get(clipId);
  }

  /** `ordinal` is expected to already be in range for the clip; out-of-range returns undefined. */
  public frame(assetId: string, clipId: string, direction: AtlasDirection, ordinal: number): IndexedFrame | undefined {
    return this.clip(assetId, clipId)?.byDirection.get(direction)?.[ordinal];
  }
}
