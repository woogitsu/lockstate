import type { Point } from './coordinates';
import type { ObliqueCameraState } from './oblique-projection';

/** In-memory renderer state only. It is deliberately absent from game saves. */
export interface RendererCameraView {
  readonly centre: Point;
  readonly zoom: number;
  readonly yawRadians?: number;
  readonly elevationRadians?: number;
}
export function boundedRendererView(view: RendererCameraView): RendererCameraView {
  if (![view.centre.x,view.centre.y,view.zoom,view.yawRadians ?? 0,view.elevationRadians ?? 1].every(Number.isFinite)) throw new RangeError('Renderer view must be finite');
  return {...view,centre:{...view.centre},zoom:Math.min(3,Math.max(0.2,view.zoom))};
}
export function captureObliqueView(pose: ObliqueCameraState): RendererCameraView {
  return {centre:{...pose.target},zoom:pose.zoom,yawRadians:pose.yawRadians,elevationRadians:pose.elevationRadians};
}
export function restoreObliqueView(pose: ObliqueCameraState, view: RendererCameraView): ObliqueCameraState {
  const bounded=boundedRendererView(view);
  return {...pose,target:bounded.centre,zoom:bounded.zoom,yawRadians:bounded.yawRadians ?? pose.yawRadians,
    elevationRadians:Math.min(80*Math.PI/180,Math.max(20*Math.PI/180,bounded.elevationRadians ?? pose.elevationRadians))};
}
