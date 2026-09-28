import { z } from 'zod';

const frameSchema = z.object({
  yawDegrees: z.number().int(), elevationDegrees: z.number().int(),
  image: z.string().regex(/^\/assets\/environment\/oblique\/[a-z0-9+.-]+\.png$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const obliqueModuleSchema = z.object({
  schemaVersion: z.literal(1),
  assetId: z.string().min(1), source: z.string().endsWith('.blend'),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  sourceDependencies: z.array(z.object({ source: z.string().endsWith('.blend'), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).optional(),
  resolutionPx: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  nominalPixelsPerTile: z.number().positive(),
  pivotPx: z.tuple([z.number(), z.number()]),
  cameraTargetTiles: z.tuple([z.number(), z.number(), z.number()]),
  projection: z.literal('orthographic'),
  yawDegrees: z.array(z.number().int()).min(1),
  elevationDegrees: z.array(z.number().int()).min(1),
  frames: z.array(frameSchema).min(1),
}).strict();

export type ObliqueModuleCatalog = z.infer<typeof obliqueModuleSchema>;
export type ObliqueModuleFrame = ObliqueModuleCatalog['frames'][number];
export type ObliqueAnglePose = { readonly yawRadians: number; readonly elevationRadians: number };

export function parseObliqueModuleCatalog(input: unknown): ObliqueModuleCatalog {
  const catalog = obliqueModuleSchema.parse(input);
  const pairs = new Set(catalog.frames.map((frame) => `${frame.yawDegrees},${frame.elevationDegrees}`));
  if (pairs.size !== catalog.frames.length) throw new Error('Duplicate oblique module pose.');
  for (const yaw of catalog.yawDegrees) for (const elevation of catalog.elevationDegrees) {
    if (!pairs.has(`${yaw},${elevation}`)) throw new Error(`Missing oblique module pose ${yaw},${elevation}.`);
  }
  if (pairs.size !== catalog.yawDegrees.length * catalog.elevationDegrees.length) {
    throw new Error('Unexpected oblique module pose.');
  }
  return catalog;
}

function closest(value: number, options: readonly number[]): number {
  if (!Number.isFinite(value)) throw new RangeError('Camera angle must be finite.');
  return options.reduce((best, option) => Math.abs(option - value) < Math.abs(best - value) ? option : best);
}

function closestYaw(value: number, options: readonly number[]): number {
  if (!Number.isFinite(value)) throw new RangeError('Camera yaw must be finite.');
  // The authored grid uses [-180, 180). A +179° camera must select -180°,
  // not jump backward to +165° merely because the numbers straddle a seam.
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  const distance = (option: number): number => {
    const difference = Math.abs(option - normalized);
    return Math.min(difference, 360 - difference);
  };
  return options.reduce((best, option) => distance(option) < distance(best) ? option : best);
}

/** Select one authored pose for the camera state; the image path remains catalog owned. */
export function selectObliqueModuleFrame(catalog: ObliqueModuleCatalog, pose: ObliqueAnglePose): ObliqueModuleFrame {
  const yaw = closestYaw(pose.yawRadians * 180 / Math.PI, catalog.yawDegrees);
  const elevation = closest(pose.elevationRadians * 180 / Math.PI, catalog.elevationDegrees);
  const frame = catalog.frames.find((entry) => entry.yawDegrees === yaw && entry.elevationDegrees === elevation);
  if (!frame) throw new Error(`Missing oblique module pose ${yaw},${elevation}.`);
  return frame;
}

export async function fetchObliqueModuleCatalog(url = '/game-content/oblique-modules.v1.json'): Promise<ObliqueModuleCatalog> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load oblique module catalog: HTTP ${response.status}.`);
  return parseObliqueModuleCatalog(await response.json());
}
