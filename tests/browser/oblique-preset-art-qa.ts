import Phaser from 'phaser';
import { instantiateRoomTemplate, ROOM_TEMPLATE_IDS, type RoomTemplateId } from '../../src/content/room-template-catalog';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { catalogueObjectId } from '../../src/rendering/world/structures';
import { obliqueCanonicalAssetIdForObject } from '../../src/rendering/assets/oblique-object-mapping';
import { parseObliqueModuleCatalog, selectObliqueModuleFrame, type ObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { parseObliqueModuleRegistry } from '../../src/rendering/assets/oblique-module-registry';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';

const allowed = ROOM_TEMPLATE_IDS;
const selected = new URLSearchParams(window.location.search).get('preset');
const actorDepthProbe = new URLSearchParams(window.location.search).has('actorDepth');
if (!allowed.some((id) => id === selected)) throw new Error(`Unsupported art QA preset: ${selected}`);
const preset = selected as RoomTemplateId;
const plan = instantiateRoomTemplate(preset, { x: 4, y: 4 });
const world = new SparseWorld(32);
const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
world.load(origin);
world.setOwned(origin, true);
for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
  world.setTerrain({ x: tileCoordinate(x), y: tileCoordinate(y) }, 'concrete');
}
for (const square of plan.wallSquares) {
  world.setSquareStructure({ x: tileCoordinate(square.x), y: tileCoordinate(square.y) }, 1);
}
for (const zone of plan.zones) {
  const definition = defaultRoomContentRegistry.getById(zone.roomId);
  if (definition === undefined) throw new Error(`Missing room definition: ${zone.roomId}`);
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      world.setZoning({ x: tileCoordinate(x), y: tileCoordinate(y) }, definition.numericId);
    }
  }
}
const structures = plan.objects.map((object, index) => ({
  id: `fixture-${index}`, definitionId: object.buildableId, tileX: object.x,
  tileY: object.y, phase: 'built' as const,
}));
const frame: RenderFrame = {
  revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures,
  actors: actorDepthProbe ? [
    { id: 1, assetId: 'actor.prisoner', tileX: 3.5, tileY: 5.5, deltaX: 0, deltaY: 0 },
    { id: 2, assetId: 'actor.prisoner', tileX: 10, tileY: 8, deltaX: 0, deltaY: 0 },
  ] : [], rooms: [], roomConditions: [],
};

const expectedAssets = new Set<string>(['wall.square.brick.full', 'wall.square.brick.low']);
for (const structure of structures) {
  const logicalId = catalogueObjectId(structure.definitionId);
  const assetId = obliqueCanonicalAssetIdForObject(logicalId ?? structure.definitionId);
  if (assetId === undefined) throw new Error(`Missing Blender alias for ${structure.definitionId}`);
  expectedAssets.add(assetId);
}
const registryResponse = await fetch('/game-content/oblique-module-registry.v1.json');
if (!registryResponse.ok) throw new Error(`Registry unavailable: ${registryResponse.status}`);
const registry = parseObliqueModuleRegistry(await registryResponse.json());
const catalogs = new Map<string, ObliqueModuleCatalog>();
for (const assetId of expectedAssets) {
  const entry = registry.entries.find((candidate) => candidate.assetId === assetId);
  if (entry === undefined) throw new Error(`Asset not registered: ${assetId}`);
  const response = await fetch(entry.manifest);
  if (!response.ok) throw new Error(`Manifest unavailable: ${entry.manifest}`);
  catalogs.set(assetId, parseObliqueModuleCatalog(await response.json()));
}

const scene = new ObliqueWorldScene({
  feed: { readFrame: () => frame }, catalogs,
  keyValueStore: { getItem: () => null, setItem: () => {} },
});
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'oblique-preset-art-root', width: window.innerWidth,
  height: window.innerHeight, scene: [scene], backgroundColor: '#0b0e12',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false, pixelArt: false },
});

interface Report {
  readonly actors: readonly { id: number; foot: { x: number; y: number } }[];
  readonly preset: string;
  readonly zoningNumericIds: readonly number[];
  readonly builtFixtureCount: number;
  readonly builtWallCount: number;
  readonly projectedFixtureCount: number;
  readonly projectedSolidCount: number;
  readonly projectedAssetIds: readonly string[];
  readonly missingAssetIds: readonly string[];
  readonly loadedTextureKeys: readonly string[];
  readonly expectedTextureKeys: readonly string[];
  readonly imageCount: number;
  readonly fallbackCommands: number;
}
declare global {
  interface Window {
    lockstatePresetArtQA: { ready(): Promise<void>; setPose(yaw: number, elevation: number): Promise<void>; report(): Report };
  }
}
window.lockstatePresetArtQA = {
  ready: () => scene.ready(),
  async setPose(yaw, elevation) {
    const privateScene = scene as unknown as { pose: { target: { x: number; y: number } } };
    privateScene.pose.target = {
      x: (plan.origin.x + plan.width / 2) * TILE_SIZE_PX,
      y: (plan.origin.y + plan.height / 2) * TILE_SIZE_PX,
    };
    scene.setPoseRadians(yaw * Math.PI / 180, elevation * Math.PI / 180);
    await new Promise<void>((resolve) => game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()));
  },
  report() {
    const projection = projectObliqueWorldFrame(frame, scene.cameraPose);
    const solids = projection.raised.filter((item) => item.kind !== 'actor');
    const assetIds = solids.map((item) => item.assetId).filter((id): id is string => id !== undefined);
    const privateScene = scene as unknown as {
      assetTextureKeys: Map<string, string>;
      assetImages: Phaser.GameObjects.Image[];
      raisedGraphics: Phaser.GameObjects.Graphics;
    };
    return {
      actors: projection.raised.filter((item) => item.kind === 'actor').map((item) => ({ id: item.id, foot: item.foot })),
      preset,
      zoningNumericIds: plan.zones.map((zone) => world.getZoning({ x: tileCoordinate(zone.x), y: tileCoordinate(zone.y) })),
      builtFixtureCount: structures.length, builtWallCount: plan.wallSquares.length,
      projectedFixtureCount: solids.filter((item) => String(item.id).startsWith('fixture-')).length,
      projectedSolidCount: solids.length,
      projectedAssetIds: [...new Set(assetIds)].sort(),
      missingAssetIds: solids.filter((item) => item.assetId === undefined || !catalogs.has(item.assetId)).map((item) => String(item.id)),
      loadedTextureKeys: [...privateScene.assetTextureKeys.values()].sort(),
      expectedTextureKeys: [...new Set(assetIds)].sort().map((id) => {
        const selected = selectObliqueModuleFrame(catalogs.get(id)!, scene.cameraPose);
        return `oblique:${id}:${selected.yawDegrees}:${selected.elevationDegrees}`;
      }),
      imageCount: privateScene.assetImages.length,
      fallbackCommands: (privateScene.raisedGraphics as unknown as { commandBuffer: unknown[] }).commandBuffer.length,
    };
  },
};
