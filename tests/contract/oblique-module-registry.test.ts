import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';

const root = join(__dirname, '../..');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (path: string): unknown => JSON.parse(readFileSync(join(root, 'public', path.slice(1)), 'utf8')) as unknown;

describe('oblique cell module registry', () => {
  it('publishes forty-five logical modules with complete hashed poses and a shared ground pivot', () => {
    const registry = parseObliqueModuleRegistry(json('/game-content/oblique-module-registry.v1.json'));
    expect(registry.entries.map((entry) => entry.assetId)).toEqual([
      'wall.interior.module.full', 'wall.interior.module.west.full', 'wall.interior.module.cutaway',
      'wall.interior.module.west.cutaway',
      'furniture.cell.bed.single.variants', 'door.interior.open.full', 'door.interior.open.cutaway',
      'door.interior.open.west.full', 'door.interior.open.west.cutaway',
      'fixture.cell.sink', 'fixture.cell.toilet_sink', 'fixture.cell.waste_bin', 'furniture.dining.table.wooden', 'furniture.corridor.bench.variants', 'furniture.kitchen.prep_counter', 'furniture.kitchen.stove', 'furniture.kitchen.fridge', 'furniture.medical.cabinet', 'furniture.medical.bed.single', 'furniture.storage.rack.wooden', 'furniture.chair.wooden',
      'floor.cell.sealed-concrete', 'floor.linoleum.institutional', 'floor.canteen.terrazzo',
      'actor.prisoner.base', 'actor.guard.base',
      'wall.interior.corner.inner.north-west.full', 'wall.interior.corner.inner.north-west.cutaway',
      'floor.shower.ceramic', 'fixture.shower.head',
      'door.shower.privacy.open.full', 'door.shower.privacy.open.cutaway',
      'floor.terrain.dirt',
      'floor.terrain.grass',
      'floor.terrain.dirt-grass.edge.north', 'floor.terrain.dirt-grass.edge.east',
      'floor.terrain.dirt-grass.edge.south', 'floor.terrain.dirt-grass.edge.west',
      'wall.interior.corner.inner.north-east.full', 'wall.interior.corner.inner.north-east.cutaway',
      'wall.interior.corner.inner.south-east.full', 'wall.interior.corner.inner.south-east.cutaway',
      'wall.interior.junction.t.west.full', 'wall.interior.junction.t.west.cutaway',
      'wall.square.brick.low',
    ]);
    for (const entry of registry.entries) {
      const catalog = parseObliqueModuleCatalog(json(entry.manifest));
      expect(catalog.assetId).toBe(entry.assetId);
      const isGround = entry.assetId.startsWith('floor.');
      expect(catalog.resolutionPx).toEqual(isGround ? [128, 128] : [512, 512]);
      expect(catalog.nominalPixelsPerTile).toBe(64);
      expect(catalog.pivotPx).toEqual(isGround ? [64, 64] : [256, 256]);
      expect(catalog.cameraTargetTiles).toEqual([0, 0, 0]);
      const isDense = entry.assetId === 'furniture.cell.bed.single.variants' || entry.assetId === 'fixture.cell.sink' || entry.assetId === 'fixture.cell.toilet_sink' || entry.assetId === 'fixture.cell.waste_bin' || entry.assetId === 'furniture.dining.table.wooden' || entry.assetId === 'furniture.corridor.bench.variants' || entry.assetId === 'furniture.kitchen.prep_counter' || entry.assetId === 'furniture.kitchen.stove' || entry.assetId === 'furniture.kitchen.fridge' || entry.assetId === 'furniture.medical.cabinet' || entry.assetId === 'furniture.medical.bed.single';
      const isWide = entry.assetId.startsWith('wall.interior.module.') || entry.assetId.startsWith('wall.interior.corner.') || entry.assetId.startsWith('wall.interior.junction.') || entry.assetId === 'wall.square.brick.low' || entry.assetId.startsWith('floor.') || entry.assetId.startsWith('actor.') || entry.assetId === 'door.interior.open.cutaway' || entry.assetId.startsWith('door.interior.open.west.') || entry.assetId.startsWith('door.shower.privacy.') || entry.assetId === 'fixture.shower.head';
      expect(catalog.yawDegrees).toEqual(isDense
        ? [-165, -135, -105, -75, -45, -15, 15, 45, 75, 105, 135, 165]
        : isWide
        ? Array.from({ length: 24 }, (_, index) => -180 + index * 15)
        : [-45, 0, 45]);
      expect(catalog.elevationDegrees).toEqual(isDense ? [20, 30, 40, 50, 60, 70] : [25, 45, 65]);
      expect(catalog.frames).toHaveLength(isDense || isWide ? 72 : 9);
      expect(digest(readFileSync(join(root, 'assets/source/blender', catalog.source)))).toBe(catalog.sourceSha256);
      for (const dependency of catalog.sourceDependencies ?? []) {
        expect(digest(readFileSync(join(root, 'assets/source/blender', dependency.source)))).toBe(dependency.sha256);
      }
      for (const frame of catalog.frames) {
        const bytes = readFileSync(join(root, 'public', frame.image.slice(1)));
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[25]]).toEqual([isGround ? 128 : 512, isGround ? 128 : 512, 6]);
        expect(digest(bytes)).toBe(frame.sha256);
        expect(frame.image).toContain(`.${frame.sha256.slice(0, 12)}.png`);
        expect(selectObliqueModuleFrame(catalog, {
          yawRadians: frame.yawDegrees * Math.PI / 180,
          elevationRadians: frame.elevationDegrees * Math.PI / 180,
        })).toEqual(frame);
      }
    }
    const full = parseObliqueModuleCatalog(json('/game-content/oblique-modules.v1.json'));
    const prisoner = parseObliqueModuleCatalog(json('/game-content/oblique-actor-prisoner.v1.json'));
    const guard = parseObliqueModuleCatalog(json('/game-content/oblique-actor-guard.v1.json'));
    const westDoor = parseObliqueModuleCatalog(json('/game-content/oblique-cell-door-west-full.v1.json'));
    const lowWestDoor = parseObliqueModuleCatalog(json('/game-content/oblique-cell-door-west-cutaway.v1.json'));
    expect(westDoor.source).toBe('door.interior.leaf.open.blend');
    expect(lowWestDoor.source).toBe('wall.interior.cutaway.blend');
    expect(lowWestDoor.sourceDependencies).toEqual([]);
    for (let index = 0; index < westDoor.frames.length; index += 1) {
      expect(lowWestDoor.frames[index]!.yawDegrees).toBe(westDoor.frames[index]!.yawDegrees);
      expect(lowWestDoor.frames[index]!.elevationDegrees).toBe(westDoor.frames[index]!.elevationDegrees);
      expect(lowWestDoor.frames[index]!.sha256).not.toBe(westDoor.frames[index]!.sha256);
    }
    for (let index = 0; index < prisoner.frames.length; index += 1) {
      expect(guard.frames[index]!.yawDegrees).toBe(prisoner.frames[index]!.yawDegrees);
      expect(guard.frames[index]!.elevationDegrees).toBe(prisoner.frames[index]!.elevationDegrees);
      expect(guard.frames[index]!.sha256).not.toBe(prisoner.frames[index]!.sha256);
    }
    const west = parseObliqueModuleCatalog(json('/game-content/oblique-wall-west.v1.json'));
    const cutaway = parseObliqueModuleCatalog(json('/game-content/oblique-wall-cutaway.v1.json'));
    const westCutaway = parseObliqueModuleCatalog(json('/game-content/oblique-wall-west-cutaway.v1.json'));
    const northEastFull = parseObliqueModuleCatalog(json('/game-content/oblique-wall-corner-north-east-full.v1.json'));
    const northEastCutaway = parseObliqueModuleCatalog(json('/game-content/oblique-wall-corner-north-east-cutaway.v1.json'));
    const northWestFull = parseObliqueModuleCatalog(json('/game-content/oblique-wall-corner-north-west-full.v1.json'));
    const southEastFull = parseObliqueModuleCatalog(json('/game-content/oblique-wall-corner-south-east-full.v1.json'));
    const southEastCutaway = parseObliqueModuleCatalog(json('/game-content/oblique-wall-corner-south-east-cutaway.v1.json'));
    for (let index = 0; index < full.frames.length; index += 1) {
      expect(west.frames[index]!.yawDegrees).toBe(full.frames[index]!.yawDegrees);
      expect(west.frames[index]!.elevationDegrees).toBe(full.frames[index]!.elevationDegrees);
      expect(west.frames[index]!.sha256).not.toBe(full.frames[index]!.sha256);
      expect(cutaway.frames[index]!.yawDegrees).toBe(full.frames[index]!.yawDegrees);
      expect(cutaway.frames[index]!.elevationDegrees).toBe(full.frames[index]!.elevationDegrees);
      expect(cutaway.frames[index]!.sha256).not.toBe(full.frames[index]!.sha256);
      expect(westCutaway.frames[index]!.yawDegrees).toBe(cutaway.frames[index]!.yawDegrees);
      expect(westCutaway.frames[index]!.elevationDegrees).toBe(cutaway.frames[index]!.elevationDegrees);
      expect(westCutaway.frames[index]!.sha256).not.toBe(cutaway.frames[index]!.sha256);
      expect(northEastFull.frames[index]!.yawDegrees).toBe(northWestFull.frames[index]!.yawDegrees);
      expect(northEastCutaway.frames[index]!.elevationDegrees).toBe(northEastFull.frames[index]!.elevationDegrees);
      expect(northEastFull.frames[index]!.sha256).not.toBe(northWestFull.frames[index]!.sha256);
      expect(northEastCutaway.frames[index]!.sha256).not.toBe(northEastFull.frames[index]!.sha256);
      expect(southEastFull.frames[index]!.yawDegrees).toBe(northEastFull.frames[index]!.yawDegrees);
      expect(southEastCutaway.frames[index]!.elevationDegrees).toBe(southEastFull.frames[index]!.elevationDegrees);
      expect(southEastFull.frames[index]!.sha256).not.toBe(northEastFull.frames[index]!.sha256);
      expect(southEastCutaway.frames[index]!.sha256).not.toBe(southEastFull.frames[index]!.sha256);
    }
    const door = parseObliqueModuleCatalog(json('/game-content/oblique-cell-door-open.v1.json'));
    expect(door.source).toBe('door.interior.leaf.open.blend');
    expect(door.sourceDependencies?.map((dependency) => dependency.source)).toEqual(['wall.interior.cutaway.blend']);
    const lowNorthDoor = parseObliqueModuleCatalog(json('/game-content/oblique-cell-door-north-cutaway.v1.json'));
    expect(lowNorthDoor.source).toBe('wall.interior.cutaway.blend');
    expect(lowNorthDoor.sourceDependencies).toEqual([]);
    for (const frame of door.frames) {
      const lowFrame = lowNorthDoor.frames.find((candidate) => candidate.yawDegrees === frame.yawDegrees
        && candidate.elevationDegrees === frame.elevationDegrees);
      expect(lowFrame).toBeDefined();
      expect(lowFrame!.sha256).not.toBe(frame.sha256);
    }
  }, 15_000);

  it('rejects duplicate registry identities', () => {
    const registry = parseObliqueModuleRegistry(json('/game-content/oblique-module-registry.v1.json'));
    expect(() => parseObliqueModuleRegistry({ ...registry, entries: [...registry.entries, registry.entries[0]] }))
      .toThrow(/Duplicate/);
  });
});
