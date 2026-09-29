import type { ObliqueAnglePose } from './oblique-module-catalog';
import type { ResolvedObliqueFrame } from './oblique-frame-loader';

export interface ObliqueModuleLayerInput {
  readonly frame: ResolvedObliqueFrame;
  readonly cameraPose: ObliqueAnglePose;
  readonly solid: boolean;
}

export interface ObliqueModuleLayer {
  readonly image: string;
  readonly pivotPx: readonly [number, number];
  readonly scale: number;
  readonly solid: boolean;
}

/** Pure projection payload for a renderer; no Phaser or scene dependency. */
export function projectObliqueModuleLayer(input: ObliqueModuleLayerInput): ObliqueModuleLayer {
  const scale = input.frame.nominalPixelsPerTile / 16;
  return { image: input.frame.frame.image, pivotPx: input.frame.pivotPx, scale, solid: input.solid };
}
