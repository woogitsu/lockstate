import { expect, it } from 'vitest';
import { structureAppearance } from '../../src/rendering/world/appearance';
import { objectArtYaw, orientedObjectArtTarget } from '../../src/rendering/world/object-art-orientation';
import { structuresFromConstruction } from '../../src/rendering/world/structures';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import type { ConstructionSnapshot } from '../../src/simulation/construction/system';
import type { PlacedObject } from '../../src/simulation/objects/placed-object';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { groundToScreen, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';

const anchor = (x: number, y: number) => ({ x: tileCoordinate(x), y: tileCoordinate(y) });

it.each([0, 1, 2, 3] as const)('rotates a two-tile fixture footprint and its authored facing by %s quarter turns', orientation => {
  expect(structureAppearance('washing-machine-brick', orientation).footprintTiles)
    .toEqual(orientation % 2 === 0 ? { width: 2, height: 1 } : { width: 1, height: 2 });
  expect(objectArtYaw(Math.PI / 4, orientation)).toBeCloseTo(Math.PI / 4 - orientation * Math.PI / 2);
});

it.each([
  [0, [0.25, 0.75, 0.4]], [1, [0.25, 0.25, 0.4]],
  [2, [1.75, 0.25, 0.4]], [3, [0.75, 1.75, 0.4]],
] as const)('rotates an off-centre source target inside the occupied rectangle at %s turns', (orientation, expected) => {
  expect(orientedObjectArtTarget([0.25, 0.75, 0.4], { width: 2, height: 1 }, orientation)).toEqual(expected);
});

it('reads pending order facing and authoritative completed facing without duplicating completed objects', () => {
  const snapshot: ConstructionSnapshot = {
    orders: [
      { id: 'pending', definitionId: 'washing-machine-brick', location: anchor(1, 2), state: 'approved',
        progress: 0, materialsAllocated: [], objectOrientation: 3 },
      { id: 'completed', definitionId: 'washing-machine-brick', location: anchor(4, 2), state: 'completed',
        progress: 60, materialsAllocated: [] },
    ], undoStack: [], redoStack: [],
  };
  const placed: readonly PlacedObject[] = [
    { placedObjectId: 'object:4:2', objectId: 'object.washing-machine', anchorTile: anchor(4, 2), orientation: 1 },
    { placedObjectId: 'object:7:2', objectId: 'object.washing-machine', anchorTile: anchor(7, 2), orientation: 2 },
  ];
  expect(structuresFromConstruction(snapshot, placed).map(s => [s.id, s.orientation])).toEqual([
    ['pending', 3], ['completed', 1], ['object:7:2', 2],
  ]);
});

it.each([0, 1, 2, 3] as const)('projects the occupied fixture rectangle and local authored pose at %s turns', orientation => {
  const camera: ObliqueCameraState = { target: { x: 0, y: 0 }, viewport: { width: 1920, height: 1080 },
    zoom: 1, yawRadians: Math.PI / 4, elevationRadians: Math.PI / 4 };
  const projected = projectObliqueWorldFrame({ ...EMPTY_RENDER_FRAME, structures: [
    { id: 'machine', definitionId: 'washing-machine-brick', tileX: 0, tileY: 0, phase: 'built', orientation },
  ] }, camera);
  const solid = projected.raised.find(item => item.kind === 'structure');
  if (solid?.kind !== 'structure') throw new Error('Missing machine');
  const [width, height] = orientation % 2 === 0 ? [2, 1] : [1, 2];
  expect(solid.footprint[2]).toEqual(groundToScreen({ x: width! * 64, y: height! * 64 }, camera));
  expect(solid.assetYawRadians ?? camera.yawRadians).toBeCloseTo(camera.yawRadians - orientation * Math.PI / 2);
});
