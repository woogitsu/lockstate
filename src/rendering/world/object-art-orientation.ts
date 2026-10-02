import type { ObjectFootprint, ObjectOrientation } from '../../simulation/objects/placed-object';

/** Rotate an authored source point into the minimum-corner occupied rectangle. */
export function orientedObjectArtTarget(
  target: readonly [number, number, number], footprint: ObjectFootprint, orientation: ObjectOrientation,
): readonly [number, number, number] {
  const [x, y, z] = target;
  switch (orientation) {
    case 0: return [x, y, z];
    case 1: return [footprint.height - y, x, z];
    case 2: return [footprint.width - x, footprint.height - y, z];
    case 3: return [y, footprint.width - x, z];
  }
}

/** Choose a source frame in the object's local coordinates, preserving perspective. */
export function objectArtYaw(cameraYawRadians: number, orientation: ObjectOrientation): number {
  return cameraYawRadians - orientation * Math.PI / 2;
}
