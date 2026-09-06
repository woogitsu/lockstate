/**
 * Types for the rendered-art catalog validator, so
 * `tests/contract/rendered-art-pipeline-contract.test.ts` can import and run
 * its aspect-invariant recomputation directly rather than retyping the same
 * arithmetic a second time. See `tooling/build-rendered-art-catalog.d.mts`
 * for the sibling generator's own declaration file, and this module's own
 * docblock for what `exactPixelAspectMatchesFootprint` proves and why it
 * never reads `frameAspectDriftFromFootprint`.
 */

export function validateRenderedArtCatalog(options?: {
  catalogPath?: string;
  sidecarPath?: string;
  renderedDir?: string;
  publishedDir?: string;
}): Promise<{ errors: string[]; entryCount: number }>;

export function exactPixelAspectMatchesFootprint(
  footprintTiles: { width: number; height: number },
  pixelSize: { width: number; height: number },
): { ok: true } | { ok: false; reason: string };
