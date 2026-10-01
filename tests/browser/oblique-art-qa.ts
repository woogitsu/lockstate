import Phaser from 'phaser';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { WorldRenderView } from '../../src/rendering/world/world-view';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';

const entries = [
  ['fixture.cell.waste_bin', '/game-content/oblique-fixture-cell-waste-bin.v1.json'],
  ['furniture.office.desk.generic', '/game-content/oblique-furniture-office-desk-generic.v1.json'],
  ['fixture.cell.sink.handwash', '/game-content/oblique-fixture-cell-sink-handwash.v1.json'],
] as const;
const catalogs = new Map(await Promise.all(entries.map(async ([id, url]) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${id}: ${response.status}`);
  return [id, parseObliqueModuleCatalog(await response.json())] as const;
})));

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
  structures: [
    { id: 'desk-qa', definitionId: 'desk-wooden', tileX: 6, tileY: 7, phase: 'built' },
    { id: 'bin-qa', definitionId: 'waste-bin-brick', tileX: 10, tileY: 7, phase: 'built' },
    { id: 'sink-qa', definitionId: 'object.sink', tileX: 10, tileY: 9, phase: 'built' },
  ],
  actors: [], rooms: [], roomConditions: [],
};

const scene = new ObliqueWorldScene({ feed: { readFrame: () => frame }, catalogs });
const game = new Phaser.Game({
  type: Phaser.AUTO, parent: 'oblique-art-root', width: window.innerWidth, height: window.innerHeight,
  scene: [scene], backgroundColor: '#0b0e12',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false, pixelArt: false },
});

declare global {
  interface Window {
    lockstateObliqueArtQa: {
      ready(): Promise<void>;
      setPose(yawDegrees: number, elevationDegrees: number): Promise<void>;
      keys(): Record<string, string | undefined>;
      shownImages(): number;
    };
  }
}

window.lockstateObliqueArtQa = {
  ready: () => scene.ready(),
  async setPose(yawDegrees, elevationDegrees) {
    scene.setPoseRadians(yawDegrees * Math.PI / 180, elevationDegrees * Math.PI / 180);
    await new Promise<void>((resolve) => game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()));
  },
  keys: () => {
    const map = (scene as unknown as { assetTextureKeys: Map<string, string> }).assetTextureKeys;
    return Object.fromEntries(entries.map(([id]) => [id, map.get(id)]));
  },
  shownImages: () => (scene as unknown as { assetImages: Phaser.GameObjects.Image[] }).assetImages.length,
};
