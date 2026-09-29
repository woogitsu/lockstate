import { selectObliqueModuleFrame, type ObliqueAnglePose, type ObliqueModuleCatalog, type ObliqueModuleFrame } from './oblique-module-catalog';

/** Resolve the authored image URL for a camera pose; Phaser consumers can load the returned URL. */
export function resolveObliqueFrame(catalog: ObliqueModuleCatalog, pose: ObliqueAnglePose): ObliqueModuleFrame {
  return selectObliqueModuleFrame(catalog, pose);
}
