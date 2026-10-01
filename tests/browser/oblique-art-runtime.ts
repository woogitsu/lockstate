import Phaser from 'phaser';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';

const storageRack = new URLSearchParams(window.location.search).get('asset') === 'storage-rack';
const response = await fetch(storageRack ? '/game-content/oblique-cell-storage-rack.v1.json' : '/game-content/oblique-furniture.medical-bed.v1.json');
if (!response.ok) throw new Error(`Cannot load oblique art: ${response.status}`);
const catalog = parseObliqueModuleCatalog(await response.json());
const world = new SparseWorld(16);
const origin = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
world.load(origin);
world.setOwned(origin, true);
for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
  world.setTerrain({ x: tileCoordinate(x), y: tileCoordinate(y) }, 'concrete');
}
const frame: RenderFrame = {
  revision: 1,
  world: WorldRenderView.fromSnapshot(world.snapshot()),
  structures: [{ id: 'art-qa', definitionId: storageRack ? 'object.storage-rack' : 'object.medical-bed', tileX: 7, tileY: 7, phase: 'built' }],
  actors: [], rooms: [], roomConditions: [],
};
const scene = new ObliqueWorldScene({
  feed: { readFrame: () => frame },
  catalogs: new Map([[catalog.assetId, catalog]]),
  keyValueStore: { getItem: () => null, setItem: () => {} },
});
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'oblique-art-root', width: window.innerWidth, height: window.innerHeight,
  scene: [scene], backgroundColor: '#0b0e12',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false, pixelArt: false },
});

declare global {
  interface Window {
    lockstateObliqueArtRuntime: {
      ready(): Promise<void>;
      setPose(yawDegrees: number, elevationDegrees: number): Promise<void>;
      key(): string | undefined;
      imageCount(): number;
      imageWidth(): number | undefined;
      imageOriginY(): number | undefined;
      fallbackCommands(): number;
      zoomIn(): Promise<void>;
    };
  }
}

window.lockstateObliqueArtRuntime = {
  ready: () => scene.ready(),
  async setPose(yawDegrees, elevationDegrees) {
    scene.setPoseRadians(yawDegrees * Math.PI / 180, elevationDegrees * Math.PI / 180);
    await new Promise<void>((resolve) => game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()));
  },
  key: () => (scene as unknown as { assetTextureKeys: Map<string, string> }).assetTextureKeys.get(catalog.assetId),
  imageCount: () => (scene as unknown as { assetImages: Phaser.GameObjects.Image[] }).assetImages.length,
  imageWidth: () => (scene as unknown as { assetImages: Phaser.GameObjects.Image[] }).assetImages[0]?.displayWidth,
  imageOriginY: () => (scene as unknown as { assetImages: Phaser.GameObjects.Image[] }).assetImages[0]?.originY,
  fallbackCommands: () => {
    const graphics = (scene as unknown as { raisedGraphics: Phaser.GameObjects.Graphics }).raisedGraphics;
    return (graphics as unknown as { commandBuffer: unknown[] }).commandBuffer.length;
  },
  async zoomIn() {
    scene.stepCameraZoom('in');
    await new Promise<void>((resolve) => game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()));
  },
};
