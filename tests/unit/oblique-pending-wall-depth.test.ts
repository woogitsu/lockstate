import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { parseObliqueModuleCatalog } from '../../src/rendering/assets/oblique-module-catalog';
import { projectObliqueWorldFrame } from '../../src/rendering/camera/oblique-world-projection';
import type { RenderFrame } from '../../src/rendering/feed/render-feed';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { WorldRenderView } from '../../src/rendering/world/world-view';

const state = vi.hoisted(() => ({ wallReady: false, actorReady: false,
  handlers: new Map<string, (...args: unknown[]) => void>(), completed: undefined as (() => void) | undefined,
  queued: [] as string[], graphics: [] as Array<{ depth: number; destroyed: boolean; polygons: Array<Array<{x:number;y:number}>> }>, images: [] as Array<{ depth: number; texture: { key: string }; destroyed: boolean }> }));
vi.mock('phaser', () => {
  class Graphic {
    depth = 0; destroyed = false; constructor() { state.graphics.push(this); } polygons: Array<Array<{ x: number; y: number }>> = []; path: Array<{ x: number; y: number }> = [];
    setScrollFactor() { return this; } setDepth(depth: number) { this.depth = depth; return this; }
    clear() { this.polygons = []; return this; } fillStyle() { return this; } lineStyle() { return this; }
    beginPath() { this.path = []; } moveTo(x: number, y: number) { this.path.push({ x, y }); }
    lineTo(x: number, y: number) { this.path.push({ x, y }); } closePath() {} fillPath() { this.polygons.push([...this.path]); }
    lineBetween() {} fillCircle() {} destroy() { this.destroyed = true; }
  }
  class Image {
    depth = 0; texture = { key: '' }; destroyed = false;
    constructor(key: string) { this.texture.key = key; state.images.push(this); }
    setScrollFactor() { return this; } setTexture(key: string) { this.texture.key = key; return this; }
    setPosition() { return this; } setVisible() { return this; } setOrigin() { return this; }
    setScale() { return this; } setAlpha() { return this; } setDepth(depth: number) { this.depth = depth; return this; }
    destroy() { this.destroyed = true; }
  }
  class Scene {
    readonly cameras = { main: { width: 1920, height: 1080, setBackgroundColor() {} } };
    readonly add = { graphics: () => new Graphic(), image: (_x: number, _y: number, key: string) => new Image(key) };
    readonly textures = { exists: (key: string) => key.startsWith('oblique:wall.square.brick.full:') ? state.wallReady : key.startsWith('oblique:actor.prisoner.base:') && state.actorReady };
    readonly load = { image: (key: string) => state.queued.push(key), once: (_event: string, callback: () => void) => { state.completed = callback; }, start() {} };
    readonly input = { mouse: { disableContextMenu() {} }, addPointer() {}, manager: { isOver: false },
      on: (event: string, handler: (...args: unknown[]) => void) => state.handlers.set(event, handler) };
    readonly events = { once() {} }; readonly game = { canvas: new EventTarget(), renderer: { type: 2 } };
  }
  return { default: { Scene, WEBGL: 2, Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Loader: { Events: { COMPLETE: 'complete' } } } };
});
afterEach(() => { state.handlers.clear(); state.images.length = 0; state.graphics.length = 0; state.queued.length = 0; state.completed = undefined; vi.unstubAllGlobals(); });
const catalogs = ['oblique-square-brick-full-wall', 'oblique-actor-prisoner'].map(name => parseObliqueModuleCatalog(JSON.parse(readFileSync(new URL(`../../public/game-content/${name}.v1.json`, import.meta.url), 'utf8'))));
const poses = [{ yaw: 0, elevation: 45 }, { yaw: 180, elevation: 65 }];
const controls = [
  { label: 'behind partially loaded wall, actor PNG ready', behind: true, wall: false, actor: true },
  { label: 'behind partially loaded wall, actor fallback', behind: true, wall: false, actor: false },
  { label: 'behind fully loaded wall, actor PNG ready', behind: true, wall: true, actor: true },
  { label: 'behind fully loaded wall, actor fallback', behind: true, wall: true, actor: false },
  { label: 'in front of partially loaded wall', behind: false, wall: false, actor: true },
  { label: 'in front of fully loaded wall', behind: false, wall: true, actor: true },
];
function snapshot(actorY: number): RenderFrame {
  const world = new SparseWorld(16); const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
  world.load(chunk); world.setOwned(chunk, true); world.setSquareStructure({ x: tileCoordinate(5), y: tileCoordinate(5) }, 1);
  return { revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()), structures: [], rooms: [], roomConditions: [],
    actors: [{ id: 1, assetId: 'actor.prisoner', tileX: 5, tileY: actorY, deltaX: 0, deltaY: 0 }] };
}
async function prepare(yaw: number, elevation: number, behind: boolean) {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', { activeElement: null });
  const actorY = (yaw === 0) === behind ? 4.3 : 5.7;
  const frame = snapshot(actorY); const picks: Array<{ x: number; y: number }> = [];
  const scene = new ObliqueWorldScene({ feed: { readFrame: () => frame }, keyValueStore: { getItem: () => null, setItem: () => undefined },
    catalogs: new Map(catalogs.map(catalog => [catalog.assetId, catalog])), onTileSelected: (x, y) => picks.push({ x, y }) });
  // The display/loader plumbing is observed; all scene projection, sorting,
  // texture selection, paintAsset, fallback drawing and pointer handlers run.
  // Native loading/pixels remain outside this source-only diagnosis.
  Reflect.set(scene, 'loadCatalogTextures', async () => undefined); Reflect.set(scene, 'loadFloorTextures', async () => undefined);
  scene.create(); await scene.ready(); scene.update(0, 0);
  scene.restoreCameraView({ centre: { x: 5.5 * 64, y: 5.5 * 64 }, zoom: 1.6, yawRadians: yaw * Math.PI / 180, elevationRadians: elevation * Math.PI / 180 });
  return { scene, frame, picks, actorY };
}
function depths(scene: ObliqueWorldScene) {
  const actorImage = state.images.find(image => !image.destroyed && image.texture.key.startsWith('oblique:actor.prisoner.base:'));
  const wallImage = state.images.find(image => !image.destroyed && image.texture.key.startsWith('oblique:wall.square.brick.full:'));
  const actorGraphic = (Reflect.get(scene, 'actorGraphics') as Map<number, { depth: number }>).get(1);
  const drawnWalls = state.graphics.filter(graphic => !graphic.destroyed && graphic.polygons.length === 5);
  if (wallImage === undefined) expect(drawnWalls, 'exactly one actual five-face fallback wall display object').toHaveLength(1);
  const fallbackWall = drawnWalls[0];
  expect(actorImage ?? actorGraphic, 'actual actor display object exists').toBeDefined();
  return { actor: (actorImage ?? actorGraphic)!.depth, wall: wallImage?.depth ?? fallbackWall!.depth,
    actorMode: actorImage === undefined ? 'fallback' : 'PNG', wallMode: wallImage === undefined ? 'fallback' : 'PNG' };
}
for (const { yaw, elevation } of poses) it.each(controls)('actual scene yaw'+yaw+' elevation'+elevation+' $label', async ({ behind, wall, actor }) => {
  state.wallReady = wall; state.actorReady = actor;
  const { scene, frame, picks, actorY } = await prepare(yaw, elevation, behind);
  const projected = projectObliqueWorldFrame(frame, scene.cameraPose);
  const wallItem = projected.raised.find(item => item.id === 'square-wall:5:5')!;
  const actorItem = projected.raised.find(item => item.kind === 'actor')!;
  expect(wallItem.assetId, 'un-zoned single occupied wall remains full').toBe('wall.square.brick.full');
  if (behind) expect(actorItem.viewDepth).toBeLessThan(wallItem.viewDepth); else expect(actorItem.viewDepth).toBeGreaterThan(wallItem.viewDepth);
  // Independently project the actor's legal ground point. Camera-facing wall
  // decoration must not replace the registered handler's ground-square pick.
  const pose = scene.cameraPose, x = 5.5 * 64, y = (actorY + 0.5) * 64;
  const c = Math.cos(pose.yawRadians), s = Math.sin(pose.yawRadians), h = Math.sin(pose.elevationRadians);
  const point = { x: pose.viewport.width / 2 + ((x - pose.target.x) * c - (y - pose.target.y) * s) * pose.zoom,
    y: pose.viewport.height / 2 + ((x - pose.target.x) * s + (y - pose.target.y) * c) * h * pose.zoom };
  // An independently projected full 1x1 wall roof actually covers the rear
  // actor's legal ground foot at this screen point; sorted depth matters here.
  const roof = [[5,5], [6,5], [6,6], [5,6]].map(([tx,ty]) => ({
    x: pose.viewport.width / 2 + (((tx! * 64) - pose.target.x) * c - ((ty! * 64) - pose.target.y) * s) * pose.zoom,
    y: pose.viewport.height / 2 + ((((tx! * 64) - pose.target.x) * s + ((ty! * 64) - pose.target.y) * c) * h - 0.75 * 64 * Math.cos(pose.elevationRadians)) * pose.zoom,
  }));
  const cross = roof.map((a,index) => { const b = roof[(index+1)%4]!; return (b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x); });
  const insideRoof = cross.every(value => value >= -1e-7) || cross.every(value => value <= 1e-7);
  expect(insideRoof, 'the full wall physically overlaps only the rear ground point').toBe(behind);
  if (!wall) {
    const graphics = state.graphics.filter(graphic => !graphic.destroyed && graphic.polygons.length === 5);
    expect(graphics).toHaveLength(1);
    const paintedRoof = graphics[0]!.polygons.at(-1)!;
    expect(paintedRoof).toHaveLength(4);
    for (let index=0;index<4;index++) {
      expect(paintedRoof[index]!.x).toBeCloseTo(roof[index]!.x, 3);
      expect(paintedRoof[index]!.y).toBeCloseTo(roof[index]!.y, 3);
    }
  }
  state.handlers.get('pointerdown')!({ id: 1, wasTouch: false, button: 0, buttons: 1, ...point });
  expect(picks).toEqual([{ x: 5, y: Math.floor(actorY + 0.5) }]);
  expect(frame.world.getSquareStructureAt(5, 5)).toBe(1);
  expect(frame.world.getSquareStructureAt(5, Math.floor(actorY + 0.5))).toBe(0);
  const actual = depths(scene);
  console.log('PENDING_WALL_DISPLAY_DEPTH', JSON.stringify({ yaw, elevation, behind, wall, actor, sorted: projected.raised.map(item => ({ id: item.id, kind: item.kind, depth: item.viewDepth })), actual, picked: picks }));
  if (behind) expect(actual.actor, 'actor behind a full fallback wall must paint below that wall').toBeLessThan(actual.wall);
  else expect(actual.actor, 'foreground actor remains above the wall').toBeGreaterThan(actual.wall);
});
it.each(poses)('actual loader completion restores correct PNG ordering yaw$yaw elevation$elevation', async ({ yaw, elevation }) => {
  state.wallReady = false; state.actorReady = true;
  const { scene } = await prepare(yaw, elevation, true);
  expect(state.queued.some(key => key.startsWith('oblique:wall.square.brick.full:'))).toBe(true);
  expect(depths(scene).wallMode).toBe('fallback');
  state.wallReady = true; expect(state.completed).toBeDefined(); state.completed!();
  const loaded = depths(scene);
  expect(loaded.wallMode).toBe('PNG'); expect(loaded.actor).toBeLessThan(loaded.wall);
});
