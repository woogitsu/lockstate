import { z } from 'zod';

/**
 * Typed runtime contract for the generated atlas manifests (issue #32).
 *
 * `assets/contracts/runtime-atlas-manifest.schema.json` describes the same
 * shape as JSON Schema for tooling outside this repository; nothing in the
 * browser executes it. This module is the executable half: it is what makes
 * "runtime code references logical asset IDs through a generated manifest, not
 * fragile filenames" true rather than aspirational, and it follows the Zod
 * catalog idiom already used in `src/content/`.
 *
 * Everything here is presentation metadata. Direction, pivot and frame
 * rectangles are shared by the renderer and by placement previews so both agree
 * on where a sprite sits; none of it is simulation authority (architectural
 * boundary 1 in `AGENTS.md`). Simulation state is owned by the worker and
 * arrives as snapshots.
 */

/** The only legal direction order. Matches `assets/contracts/character-8-direction.contract.json`. */
export const ATLAS_DIRECTIONS = [
  'south',
  'southWest',
  'west',
  'northWest',
  'north',
  'northEast',
  'east',
  'southEast',
] as const;

export type AtlasDirection = (typeof ATLAS_DIRECTIONS)[number];

export const atlasDirectionSchema = z.enum(ATLAS_DIRECTIONS);

const assetIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const nonNegativeIntSchema = z.number().int().min(0);
const pixelSizeSchema = z.number().int().min(1);

export const atlasFrameRectSchema = z
  .object({ x: nonNegativeIntSchema, y: nonNegativeIntSchema, width: pixelSizeSchema, height: pixelSizeSchema })
  .strict();
export type AtlasFrameRect = z.infer<typeof atlasFrameRectSchema>;

export const atlasClipSchema = z
  .object({
    fps: z.number().positive(),
    loop: z.boolean(),
    /**
     * Exhaustive: a clip missing a direction is a build-time failure caught by
     * `tooling/validate-runtime-atlas.mjs`, so runtime code that has parsed a
     * manifest can index any direction without a null check.
     */
    frames: z.record(atlasDirectionSchema, z.array(atlasFrameRectSchema).min(1)),
  })
  .strict();
export type AtlasClip = z.infer<typeof atlasClipSchema>;

export const atlasManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: assetIdSchema,
    image: z.string().regex(/^[a-z0-9][a-z0-9.-]*\.png$/),
    widthPx: pixelSizeSchema,
    heightPx: pixelSizeSchema,
    frame: z
      .object({
        widthPx: pixelSizeSchema,
        heightPx: pixelSizeSchema,
        /** Anchor point inside a frame: where the actor's feet meet the ground. */
        footPivotPx: z.object({ x: nonNegativeIntSchema, y: nonNegativeIntSchema }).strict(),
        extrudePx: nonNegativeIntSchema,
      })
      .strict(),
    directions: z.array(atlasDirectionSchema).length(8),
    clips: z.record(z.string(), atlasClipSchema),
  })
  .strict();
export type AtlasManifest = z.infer<typeof atlasManifestSchema>;

/** One `<assetId>.atlas-manifests.json` file: one clip manifest per clip image. */
export const atlasManifestFileSchema = z.array(atlasManifestSchema).min(1);
export type AtlasManifestFile = z.infer<typeof atlasManifestFileSchema>;

export const assetRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    assets: z
      .array(
        z
          .object({
            assetId: assetIdSchema,
            manifest: z.string().regex(/^[a-z0-9][a-z0-9.-]*\.json$/),
            clips: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type AssetRegistry = z.infer<typeof assetRegistrySchema>;
