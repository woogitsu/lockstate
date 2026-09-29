import { selectObliqueModuleFrame, type ObliqueAnglePose, type ObliqueModuleCatalog, type ObliqueModuleFrame } from './oblique-module-catalog';

export interface ResolvedObliqueFrame {
  readonly frame: ObliqueModuleFrame;
  readonly resolutionPx: readonly [number, number];
  readonly nominalPixelsPerTile: number;
  readonly pivotPx: readonly [number, number];
  readonly cameraTargetTiles: readonly [number, number, number];
}

/** Resolve the authored image URL for a camera pose; Phaser consumers can load the returned URL. */
export function resolveObliqueFrame(catalog: ObliqueModuleCatalog, pose: ObliqueAnglePose): ResolvedObliqueFrame {
  return { frame: selectObliqueModuleFrame(catalog, pose), resolutionPx: catalog.resolutionPx, nominalPixelsPerTile: catalog.nominalPixelsPerTile, pivotPx: catalog.pivotPx, cameraTargetTiles: catalog.cameraTargetTiles };
}
