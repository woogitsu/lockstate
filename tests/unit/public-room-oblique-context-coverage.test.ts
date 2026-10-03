import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOM_TEMPLATE_IDS, type RoomTemplateId } from '../../src/content/room-template-catalog';
import { instantiateOrientedRoomTemplate } from '../../src/content/room-template-rotation';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { getBuildableDefinition } from '../../src/simulation/construction/definition';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame, RenderRoom } from '../../src/rendering/feed/render-feed';
import type { RenderStructure } from '../../src/rendering/world/structures';
import type { ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { groundToScreen } from '../../src/rendering/camera/oblique-projection';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';

// Independent authored expectations: never derive these from the mapping under test.
const expected: Record<RoomTemplateId, readonly string[]> = {
  'cell-basic': ['furniture.cell.cot.single', 'fixture.cell.toilet_sink'],
  'cell-large': ['furniture.cell.cot.single', 'furniture.cell.cot.single', 'fixture.cell.toilet_sink'],
  'shower-room': ['fixture.shower.head', 'fixture.shower.head'],
  'cell-row-four': [
    'furniture.cell.cot.single', 'fixture.cell.toilet_sink', 'furniture.cell.cot.single', 'fixture.cell.toilet_sink',
    'furniture.cell.cot.single', 'fixture.cell.toilet_sink', 'furniture.cell.cot.single', 'fixture.cell.toilet_sink',
  ],
  'canteen-basic': ['furniture.dining.table.wooden', 'furniture.dining.table.wooden',
    'furniture.corridor.bench.variants', 'furniture.corridor.bench.variants',
    'furniture.corridor.bench.variants', 'furniture.corridor.bench.variants'],
  'kitchen-basic': ['furniture.kitchen.stove.variants', 'furniture.kitchen.prep-counter.variants', 'furniture.kitchen.fridge.variants'],
  'holding-cell-basic': ['furniture.corridor.bench.variants', 'furniture.corridor.bench.variants'],
  'solitary-cell-basic': ['furniture.cell.cot.single', 'fixture.cell.toilet_sink'],
  'reception-basic': ['furniture.reception.registration-desk', 'furniture.reception.waiting-armchair', 'furniture.reception.waiting-armchair'],
  'laundry-basic': ['utility.washing-machine.variants', 'utility.washing-machine.variants'],
  'yard-basic': [],
  'common-room-basic': ['furniture.common-room.upholstered-bench', 'furniture.common-room.upholstered-bench'],
  'classroom-basic': ['furniture.library.bookshelf.variants', 'furniture.classroom.student-chair',
    'furniture.classroom.student-chair', 'furniture.classroom.student-chair', 'furniture.classroom.student-chair'],
  'infirmary-basic': ['furniture.medical-bed.variants', 'fixture.medicine-cabinet.variants'],
  'security-office-basic': ['utility.security-console.variants'],
  'staff-room-basic': ['furniture.office.desk.employee.variants', 'furniture.chair.wooden', 'furniture.chair.wooden'],
  'storage-room-basic': ['furniture.storage-room.timber-rack', 'furniture.storage-room.timber-rack'],
  'delivery-bay-basic': ['utility.loading-dock-door.variants'],
  'garbage-room-basic': ['fixture.garbage-room.waste-bin', 'fixture.garbage-room.waste-bin'],
  'utility-room-basic': ['utility.utility-panel.variants'],
};

const publicRoot = new URL('../../public/', import.meta.url);
const repoRoot = new URL('../../', import.meta.url);
const json = (path: string): unknown => JSON.parse(readFileSync(new URL(path, publicRoot), 'utf8').replace(/^\uFEFF/, ''));
const registry = parseObliqueModuleRegistry(json('game-content/oblique-module-registry.v1.json'));
const footprintOf = (id: string) => defaultObjectRegistry.getById(getBuildableDefinition(id).placesObjectId!)!.footprint;
const cases = ROOM_TEMPLATE_IDS.flatMap(id => ([0, 1, 2, 3] as const).flatMap(quarterTurns =>
  [false, true].map(mirrorX => ({ id, quarterTurns, mirrorX }))));

describe('actual public template consumers reach intended room art', () => {
  it.each(cases)('$id q$quarterTurns mirror=$mirrorX retains owners, complete occupied squares and source-local poses', ({ id, quarterTurns, mirrorX }) => {
    const plan = instantiateOrientedRoomTemplate(id, { x: 4, y: 4 }, { quarterTurns, mirrorX }, footprintOf);
    const rooms: RenderRoom[] = plan.zones.map((zone, index) => ({ instanceId: `${id}:zone:${index}`, roomCatalogId: zone.roomId,
      anchorTileX: zone.x, anchorTileY: zone.y, width: zone.width, height: zone.height }));
    const structures: RenderStructure[] = plan.objects.map((object, index) => ({ id: `${id}:object:${index}`,
      definitionId: object.buildableId, tileX: object.x, tileY: object.y, orientation: object.quarterTurns, phase: 'built' }));
    const world = new SparseWorld(16);
    for (const x of [0, 1]) for (const y of [0, 1]) {
      const chunk = { x: chunkCoordinate(x), y: chunkCoordinate(y) }; world.load(chunk); world.setOwned(chunk, true);
    }
    const renderFrame: RenderFrame = { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
      structures, rooms, actors: [], roomConditions: [] };
    const camera: ObliqueCameraState = { target: { x: (4 + plan.width / 2) * 64, y: (4 + plan.height / 2) * 64 },
      viewport: { width: 1920, height: 1080 }, zoom: 0.5, yawRadians: Math.PI / 3, elevationRadians: 40 * Math.PI / 180 };
    const before = JSON.stringify({ structures, rooms });
    const projected = projectObliqueWorldFrame(renderFrame, camera);
    expect(structures).toHaveLength(expected[id].length);
    for (const [index, object] of plan.objects.entries()) {
      const solid = projected.raised.find(item => item.id === `${id}:object:${index}`);
      expect(solid?.assetId, `${id} object ${index} actual completed context`).toBe(expected[id][index]);
      if (solid === undefined || solid.kind !== 'structure') throw new Error('Template consumer missing from actual world projection');
      const zone = rooms.find(room => object.x >= room.anchorTileX && object.y >= room.anchorTileY &&
        object.x + object.width <= room.anchorTileX + room.width && object.y + object.height <= room.anchorTileY + room.height);
      expect(zone, 'all occupied squares must belong to one published room').toBeDefined();
      const corners = [[object.x, object.y], [object.x + object.width, object.y],
        [object.x + object.width, object.y + object.height], [object.x, object.y + object.height]];
      expect(solid.footprint).toEqual(corners.map(([x, y]) => groundToScreen({ x: x! * 64, y: y! * 64 }, camera)));
      // Identity orientation intentionally omits the optional projection metadata.
      expect(solid.orientation ?? 0).toBe(quarterTurns);
      expect(solid.assetYawRadians ?? camera.yawRadians).toBeCloseTo(camera.yawRadians + quarterTurns * Math.PI / 2, 12);
      const entry = registry.entries.find(candidate => candidate.assetId === expected[id][index]);
      expect(entry, 'the actually selected context model must be registered').toBeDefined();
      if (entry === undefined) throw new Error('Intended room context asset omitted from registry');
      const catalog = parseObliqueModuleCatalog(json(entry.manifest.slice(1)));
      const selected = selectObliqueModuleFrame(catalog, { yawRadians: solid.assetYawRadians ?? camera.yawRadians, elevationRadians: camera.elevationRadians });
      // The retained toilet source uses the original signed grid offset by 15 degrees.
      const authoredYaws = catalog.assetId === 'fixture.cell.toilet_sink' ? [45, 135, -135, -45] : [60, 150, 240, 330];
      expect(selected.yawDegrees).toBe(authoredYaws[quarterTurns]);
      expect(selected.elevationDegrees).toBe(40);
    }
    expect(JSON.stringify({ structures, rooms })).toBe(before);
  });

  it.each([...new Set(Object.values(expected).flat())])('%s retains genuine source bytes and all canonical frame bodies', assetId => {
    const entry = registry.entries.find(candidate => candidate.assetId === assetId);
    expect(entry, 'selected actual template context must exist in registry').toBeDefined();
    if (entry === undefined) throw new Error('Template-selected descriptor absent from runtime registry');
    const catalog = parseObliqueModuleCatalog(json(entry.manifest.slice(1)));
    expect(catalog.assetId).toBe(assetId);
    expect(createHash('sha256').update(readFileSync(new URL(catalog.source, repoRoot))).digest('hex')).toBe(catalog.sourceSha256);
    for (const dependency of catalog.sourceDependencies ?? []) {
      expect(createHash('sha256').update(readFileSync(new URL(dependency.source, repoRoot))).digest('hex')).toBe(dependency.sha256);
    }
    expect(catalog.frames).toHaveLength(72);
    expect(catalog.nominalPixelsPerTile).toBe(64);
    for (const frame of catalog.frames) {
      const body = readFileSync(new URL(frame.image.slice(1), publicRoot));
      expect(createHash('sha256').update(body).digest('hex'), frame.image).toBe(frame.sha256);
      expect(body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect([body.readUInt32BE(16), body.readUInt32BE(20)], frame.image).toEqual(catalog.resolutionPx);
    }
  });
});
