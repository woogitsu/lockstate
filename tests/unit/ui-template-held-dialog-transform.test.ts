import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type Phaser from 'phaser';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { afterEach, expect, it, vi } from 'vitest';
import { WorldScene } from '../../src/rendering/scene/world-scene';
import { ObliqueWorldScene } from '../../src/rendering/scene/oblique-world-scene';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';
import { RoomTemplatePreviewFitController } from '../../src/ui/room-template-preview-fit';
import { installRoomTemplateWorldBridge } from '../../src/ui/room-template-world-bridge';
import { groundToScreen, screenToGround } from '../../src/rendering/camera/oblique-projection';
import { computeObliqueFit } from '../../src/rendering/camera/oblique-fit';
import { createSimulationRoomTemplatePreflight, createSimulationRoomTemplateQuote } from '../../src/ui/simulation-room-template-port';
import { SimulationCommandSender } from '../../src/ui/simulation-commands';
import { SimulationWorkerStateMachine } from '../../src/simulation/worker/state-machine';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, SESSION_SNAPSHOT_SCHEMA_ID, SESSION_SNAPSHOT_SCHEMA_VERSION, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { EMPTY_RENDER_FRAME } from '../../src/rendering/feed/render-feed';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { createRoomTemplatePreview } from '../../src/ui/hud/room-template-preview';
import { formatRoomTemplateQuote } from '../../src/ui/hud/room-template-quote';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import type { RoomTemplateId } from '../../src/content/room-template-catalog';

vi.mock('phaser', () => ({ default: { Scene: class { readonly cameras = { main: {} }; readonly scale = { displayScale: { x: 1, y: 1 } }; } } }));
afterEach(() => vi.unstubAllGlobals());
class ElementStub extends EventTarget {
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    super.addEventListener(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    // Node EventTarget's boolean removal does not model DOM capture matching.
    // Preserve browser capture semantics in the plumbing, not stale listeners.
    super.removeEventListener(type, listener, typeof options === 'boolean' ? { capture: options } : options);
  }
  style: Record<string, string> = {}; dataset: Record<string, string> = {}; hidden = false;
  value = ''; checked = false; disabled = false; tabIndex = 0; id = ''; open = false;
  readonly classes = new Set<string>();
  readonly classList = { add: (name: string) => { this.classes.add(name); }, remove: (name: string) => { this.classes.delete(name); }, contains: (name: string) => this.classes.has(name) };
  children: ElementStub[] = []; attributes = new Map<string, string>(); className = ''; textContent = '';
  namespaceURI = 'http://www.w3.org/2000/svg'; width = 1920; height = 1080; removed = false;
  rect = { x: 0, y: 0, width: 1920, height: 1080 };
  parentElement: ElementStub | undefined;
  append(...nodes: ElementStub[]) { for (const node of nodes) node.parentElement = this; this.children.push(...nodes); }
  after(...nodes: ElementStub[]) { const parent = this.parentElement; if (parent === undefined) return; for (const node of nodes) node.parentElement = parent; parent.children.splice(parent.children.indexOf(this) + 1, 0, ...nodes); }
  focus() { Reflect.set(document, 'activeElement', this); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); if (key === 'value') this.value = value; }
  remove() { this.removed = true; }
  getBoundingClientRect() { const r = this.rect; return { ...r, left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }; }
}
const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const start = source.lastIndexOf('if (roomTemplateTool !== undefined) {');
const end = source.indexOf('// The save panel is laid out', start);
if (start < 0 || end < 0) throw Error('Actual main ghost-install producer missing');
const installBody = stripTypeScriptTypes(source.slice(start, end));
const require = createRequire(import.meta.url);
const phaserSource = resolve(dirname(require.resolve('phaser')), '../src');
const components = require.resolve(resolve(phaserSource, 'gameobjects/components/index.js'));
const cached = require.cache[components];
let Camera: typeof Phaser.Cameras.Scene2D.Camera;
try {
  require.cache[components] = { id: components, filename: components, loaded: true, exports: { FilterList: class {} } } as NodeJS.Module;
  Camera = require(resolve(phaserSource, 'cameras/2d/Camera.js')) as typeof Phaser.Cameras.Scene2D.Camera;
} finally { if (cached === undefined) delete require.cache[components]; else require.cache[components] = cached; }

function worker() {
  const listeners: ((message: WorkerToMainMessage) => void)[] = [];
  const held: WorkerToMainMessage[] = []; const sent: MainToWorkerMessage[] = [];
  let delay = false;
  const machine = new SimulationWorkerStateMachine({ postMessage(message: WorkerToMainMessage) {
    if (delay && message.kind === 'simulation/projection' && message.payload.projectionId === 'world/room-template-preflight') held.push(message);
    else for (const listener of listeners) listener(message);
  } }, 'stationary-renderer-source-audit', () => 0);
  const channel = { addListener: (listener: (message: WorkerToMainMessage) => void) => listeners.push(listener),
    send: (message: MainToWorkerMessage) => { sent.push(message); machine.handleMessage(message); } };
  const commands = new SimulationCommandSender(channel);
  const snapshot = captureSessionSnapshot(createNewSimulationRuntime(73));
  channel.send({ protocolVersion: 1, messageId: 'init', kind: 'simulation/initialize', payload: { sessionId: 'hover-renderer-audit', source: {
    kind: 'snapshot', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: snapshot as unknown as null },
  } } });
  channel.send({ protocolVersion: 1, messageId: 'baseline', kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
  return { channel, commands, held, sent, snapshot() {
    const id = 'read-' + sent.length; let result: SessionSnapshotBundle | undefined;
    const reader = (message: WorkerToMainMessage) => { if (message.kind === 'simulation/snapshot' && message.replyTo === id) result = message.payload.snapshot.data as unknown as SessionSnapshotBundle; };
    listeners.push(reader); channel.send({ protocolVersion: 1, messageId: id, kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    listeners.splice(listeners.indexOf(reader), 1); if (result === undefined) throw Error('Actual worker snapshot missing'); return result;
  }, releaseOne() { const message = held.shift(); if (message !== undefined) for (const listener of listeners) listener(message); }, release() { delay = false; for (const message of held.splice(0)) for (const listener of listeners) listener(message); } };
}

function footprint(id: string) {
  const objectId = BUILDABLE_REGISTRY.get(id)?.placesObjectId;
  const object = objectId === undefined ? undefined : defaultObjectRegistry.getById(objectId);
  return object === undefined ? undefined : { width: object.footprint.width, height: object.footprint.height };
}
function dispatch(canvas: ElementStub, type: string, point: { x: number; y: number }, button = 0, buttons = type === 'pointerdown' ? 1 : 0) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX: point.x, clientY: point.y, pointerId: 7, button, buttons });
  Object.defineProperty(event, 'target', { value: canvas }); window.dispatchEvent(event); canvas.dispatchEvent(event);
}
function inverse(point: { x: number; y: number }, pose: ObliqueWorldScene['cameraPose']) {
  // Independently solve the rotated/compressed ground plane, no production inverse.
  const u = (point.x - pose.viewport.width / 2) / pose.zoom;
  const v = (point.y - pose.viewport.height / 2) / (pose.zoom * Math.sin(pose.elevationRadians));
  return { x: pose.target.x + u * Math.cos(pose.yawRadians) + v * Math.sin(pose.yawRadians),
    y: pose.target.y - u * Math.sin(pose.yawRadians) + v * Math.cos(pose.yawRadians) };
}
function originAt(point: { x: number; y: number }, pose: ObliqueWorldScene['cameraPose']) {
  const p = inverse(point, pose); return { x: Math.floor(p.x / 64), y: Math.floor(p.y / 64) };
}
async function setup(mode: 'world' | 'oblique', templateId: RoomTemplateId, initialTurn: 0 | 1) {
  const frames: FrameRequestCallback[] = [], elements: ElementStub[] = [];
  const canvas = new ElementStub(); canvas.parentElement = new ElementStub(); const layers = canvas.parentElement.children;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { activeElement: null, createElement: () => { const e = new ElementStub(); elements.push(e); return e; }, createElementNS: () => new ElementStub() });
  vi.stubGlobal('HTMLElement', ElementStub);
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => { frames.push(frame); return frames.length; });
  const scene = new (mode === 'world' ? WorldScene : ObliqueWorldScene)({ feed: { readFrame: () => EMPTY_RENDER_FRAME }, keyValueStore: { getItem: () => null, setItem: () => undefined } });
  if (scene instanceof WorldScene) {
    const camera = new Camera(0, 0, 1920, 1080); camera.setScroll(12 * 64 - 960, 12 * 64 - 540).setZoom(1.25); camera.preRender();
    Reflect.set(scene.cameras, 'main', camera);
  } else {
    Reflect.set(scene.cameras, 'main', { width: 1920, height: 1080 });
    Reflect.set(scene, 'pose', { target: { x: 12 * 64, y: 12 * 64 }, viewport: { width: 1920, height: 1080 }, zoom: 1.4, yawRadians: 35 * Math.PI / 180, elevationRadians: 65 * Math.PI / 180 });
  }
  Reflect.set(scene, 'repaint', () => undefined);
  const actors = worker();
  const tool = new RoomTemplateTool({ preflight: createSimulationRoomTemplatePreflight(actors.channel), quote: createSimulationRoomTemplateQuote(actors.channel),
    objectFootprint: footprint, place: async request => actors.commands.submit({ type: 'PlaceRoomTemplate', ...request }) });
  const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
  const preview = createRoomTemplatePreview(localizer, tool);
  const rotation = elements.find(e => e.className === 'hud-template__rotation')!;
  const mirror = elements.find(e => e.attributes.get('type') === 'checkbox')!;
  elements.find(e => e.attributes.get('data-template-id') === templateId)!.dispatchEvent(new Event('click'));
  rotation.value = String(initialTurn); rotation.dispatchEvent(new Event('change'));
  elements.find(e => e.textContent === 'Place on map')!.dispatchEvent(new Event('click'));
  let uiScale = 2;
  const box = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, right: left + width, top, bottom: top + height }) });
  const root = { querySelector: (selector: string) => selector === 'canvas' ? canvas : selector === '.hud__tabs' ? box(0, 130 * uiScale, 350 * uiScale, 200)
    : selector === '.hud__corner' ? box(0, 0, 350 * uiScale, 130 * uiScale) : selector === '.hud__rail' ? box(1920 - 250 * uiScale, 130 * uiScale, 250 * uiScale, 900)
    : selector === '.hud-strip' ? box(0, 0, 1920, 130 * uiScale) : undefined };
  const main = new Function('worldScene', 'roomTemplateTool', 'appRoot', 'WorldScene', 'ObliqueWorldScene', 'RoomTemplatePreviewFitController', 'installRoomTemplateWorldBridge',
    'screenToGround', 'groundToScreen', 'computeObliqueFit', 'renderFeed', 'TILE_SIZE_PX', 'objectFootprintOf', 'localizer', 'formatRoomTemplateQuote',
    `let reinstallPlanGhost = () => {}; let withdrawPlanGhost = () => {}; ${installBody} return { withdraw: () => withdrawPlanGhost() };`)
    (scene, tool, root, WorldScene, ObliqueWorldScene, RoomTemplatePreviewFitController, installRoomTemplateWorldBridge, screenToGround, groundToScreen, computeObliqueFit, { readFrame: () => EMPTY_RENDER_FRAME }, 64, footprint,
      localizer, formatRoomTemplateQuote) as { withdraw: () => void };
  const point = { x: 900, y: 460 };
  const initialOrigin = scene instanceof ObliqueWorldScene ? originAt(point, scene.cameraPose) : (() => {
    const m = scene.cameras.main.matrixCombined, det = m.a * m.d - m.b * m.c;
    const x = point.x - m.e, y = point.y - m.f;
    return { x: Math.floor((m.d * x - m.c * y) / det / 64), y: Math.floor((-m.b * x + m.a * y) / det / 64) };
  })();
  const paint = async () => { for (const frame of frames.splice(0)) frame(0); await new Promise<void>(resolve => setImmediate(resolve)); };
  dispatch(canvas, 'pointermove', point); dispatch(canvas, 'pointerdown', point); await paint();
  await paint(); expect(layers.at(-1)!.dataset.ready).toBe('clear');
  return { canvas, scene, actors, tool, point, initialOrigin, paint, layer: () => layers.at(-1)!, setUiScale: () => { uiScale = 2; },
    preview, rotation, mirror, dialogDiagram: elements.find(e => e.className === 'hud-template__diagram')!,
    dimensions: elements.find(e => e.className === 'hud-template__dimensions')!,
    dialogQuote: elements.find(e => e.className === 'hud-template__quote')!,
    close: () => elements.find(e => e.className === 'hud-template__close')!.dispatchEvent(new Event('click')), dispose: main.withdraw };
}


const authored = {
  'cell-basic': { width: 7, height: 4, doorY: 1, mirrorDoorY: 2, shell: 18, orders: 20, brick: 35, wood: 2, value: 1530,
    normal: [[4,1,2,1],[2,2,1,1]], mirrored: [[4,2,2,1],[2,1,1,1]] },
  'canteen-basic': { width: 8, height: 8, doorY: 3, mirrorDoorY: 4, shell: 28, orders: 34, brick: 54, wood: 15, value: 3135,
    normal: [[5,1,2,3],[5,4,2,3],[4,1,1,2],[4,4,1,2],[2,1,1,2],[2,4,1,2]],
    mirrored: [[5,4,2,3],[5,1,2,3],[4,5,1,2],[4,2,1,2],[2,5,1,2],[2,2,1,2]] },
  'laundry-basic': { width: 6, height: 6, doorY: 2, mirrorDoorY: 3, shell: 20, orders: 22, brick: 42, wood: 1, value: 1745,
    normal: [[4,1,1,2],[4,3,1,2]], mirrored: [[4,3,1,2],[4,1,1,2]] },
} as const;
type Template = keyof typeof authored;
const submitted = (h: Awaited<ReturnType<typeof setup>>) => h.actors.sent.filter(m => m.kind === 'simulation/submit-command');
const key = (x: number, y: number) => x + ':' + y;
function independentlyProjected(h: Awaited<ReturnType<typeof setup>>, x: number, y: number) {
  if (h.scene instanceof WorldScene) { const m = h.scene.cameras.main.matrixCombined; return { x: m.a*x + m.c*y + m.e, y: m.b*x + m.d*y + m.f }; }
  const p = h.scene.cameraPose, dx = x-p.target.x, dy = y-p.target.y;
  return { x: p.viewport.width/2 + p.zoom*(dx*Math.cos(p.yawRadians)-dy*Math.sin(p.yawRadians)),
    y: p.viewport.height/2 + p.zoom*Math.sin(p.elevationRadians)*(dx*Math.sin(p.yawRadians)+dy*Math.cos(p.yawRadians)) };
}
async function checkCurrent(h: Awaited<ReturnType<typeof setup>>, id: Template, mirrored: boolean) {
  const e = authored[id], fixtures = mirrored ? e.mirrored : e.normal;
  const plan = h.tool.planAt(h.initialOrigin);
  expect(plan).toMatchObject({ width: e.width, height: e.height, quarterTurns: 1, origin: h.initialOrigin });
  expect(plan.objects.map(o => [o.x-h.initialOrigin.x,o.y-h.initialOrigin.y,o.width,o.height])).toEqual(fixtures);
  expect(plan.objects.every(o => o.quarterTurns === 1)).toBe(true);
  expect(h.dimensions.textContent).toBe(e.width + ' \u00d7 ' + e.height);
  const markers = h.dialogDiagram.children.filter(c => c.className === 'hud-template__fixture');
  expect(markers.map(c => [c.style.gridColumn,c.style.gridRow])).toEqual(fixtures.map(([x,y,w,height]) => [`${x+1} / span ${w}`,`${y+1} / span ${height}`]));
  const quote = await h.tool.quote();
  expect(quote).toEqual({ orderCount: e.orders, materials: [{ itemId: 'item.brick', quantity: e.brick },{ itemId: 'item.wood-plank', quantity: e.wood }], catalogueCostMinorUnits: e.value });
  expect(h.dialogQuote.textContent).toBe(formatRoomTemplateQuote(new Localizer({ locale:'en',catalogs:[defaultMessageCatalogEn] }), quote));
  expect(h.layer().children[1]!.textContent).toContain(h.dialogQuote.textContent);
  expect(h.layer().dataset.ready).toBe('clear'); expect(h.layer().hidden).toBe(false);
  const polygons = h.layer().children[0]!.children;
  expect(polygons).toHaveLength(e.width*e.height);
  const occupied = new Set<string>();
  for (const [x,y,w,height] of fixtures) for(let sy=0;sy<height;sy++) for(let sx=0;sx<w;sx++) occupied.add(key(x+sx,y+sy));
  const doorY = mirrored ? e.mirrorDoorY : e.doorY;
  for (let y=0;y<e.height;y++) for(let x=0;x<e.width;x++) {
    const polygon = polygons[y*e.width+x]!;
    const door = x === 0 && y === doorY, wall = !door && (x===0||y===0||x===e.width-1||y===e.height-1);
    expect(polygon.attributes.get('fill')).toBe(wall ? '#36b8ba' : door ? '#e9bc52' : occupied.has(key(x,y)) ? '#a794e3' : '#529ddd');
    const points = polygon.attributes.get('points')!.split(' ').map(pair => pair.split(',').map(Number));
    for (const [index,[cx,cy]] of [[x,y],[x+1,y],[x+1,y+1],[x,y+1]].entries()) {
      const expected = independentlyProjected(h,(h.initialOrigin.x+cx!)*64,(h.initialOrigin.y+cy!)*64);
      expect(points[index]![0]).toBeCloseTo(expected.x,7); expect(points[index]![1]).toBeCloseTo(expected.y,7);
    }
  }
}
function checkActualShell(h: Awaited<ReturnType<typeof setup>>, id: Template, mirrored: boolean) {
  const e = authored[id], snapshot = h.actors.snapshot(), origin = h.initialOrigin;
  expect(snapshot.construction.orders).toHaveLength(e.shell);
  const doorY = mirrored ? e.mirrorDoorY : e.doorY;
  const actual = snapshot.construction.orders.map(o => ({ definitionId:o.definitionId, x:o.location.x-origin.x,y:o.location.y-origin.y,
    ...(o.footprint===undefined?{}:{footprint:o.footprint}),...(o.edge===undefined?{}:{edge:o.edge}) }));
  const walls = [];
  for(let y=0;y<e.height;y++) for(let x=0;x<e.width;x++) if((x===0||y===0||x===e.width-1||y===e.height-1)&&!(x===0&&y===doorY)) walls.push({definitionId:'wall-brick',x,y,footprint:'square'});
  const sort = (a:{x:number;y:number},b:{x:number;y:number}) => a.y-b.y||a.x-b.x;
  expect(actual.filter(o=>o.definitionId==='wall-brick').sort(sort)).toEqual(walls.sort(sort));
  expect(actual.filter(o=>o.definitionId==='door-wooden')).toEqual([{definitionId:'door-wooden',x:1,y:doorY,edge:'west'}]);
  expect(snapshot.simulation?.roomTemplates?.pending).toMatchObject([{templateId:id,origin,mirrorX:mirrored,quarterTurns:1}]);
  expect(snapshot.simulation?.economy?.treasury.balanceMinorUnits).toBe(25000);
}
for(const mode of ['world','oblique'] as const) for(const id of ['cell-basic','canteen-basic','laundry-basic'] as const) {
  for(const change of ['rotation','mirror','both'] as const) it(`${mode}/${id}: public dialog ${change} while primary held requires fresh press and matches whole current quote/footprint`,async()=>{
    const h = await setup(mode,id,change==='mirror'?1:0);
    try {
      const before = h.actors.snapshot();
      h.preview.openButton.dispatchEvent(new Event('click'));
      if(change!=='mirror') { h.rotation.value='1';h.rotation.dispatchEvent(new Event('change')); }
      if(change!=='rotation') { h.mirror.checked=true;h.mirror.dispatchEvent(new Event('change')); }
      h.close(); await h.paint(); await h.paint();
      await checkCurrent(h,id,change!=='rotation');
      dispatch(h.canvas,'pointerup',h.point);await h.paint();await h.paint();
      expect(submitted(h),'old held primary must not place the new public selection').toHaveLength(0);
      expect(h.actors.snapshot()).toEqual(before);expect(h.tool.isArmed()).toBe(true);
      dispatch(h.canvas,'pointerdown',h.point);dispatch(h.canvas,'pointerup',h.point);await h.paint();await h.paint();
      expect(submitted(h)).toHaveLength(1);
      expect(submitted(h)[0]!.payload).toMatchObject({command:{data:{type:'PlaceRoomTemplate',templateId:id,origin:h.initialOrigin,quarterTurns:1,...(change==='rotation'?{}:{mirrorX:true})}}});
      checkActualShell(h,id,change!=='rotation');expect(h.tool.isArmed()).toBe(false);
    } finally {h.dispose();}
  });
  it(`${mode}/${id}: unchanged public rotated selection permits the owning primary release`,async()=>{
    const h = await setup(mode,id,1);
    try { await checkCurrent(h,id,false);dispatch(h.canvas,'pointerup',h.point);await h.paint();await h.paint();expect(submitted(h)).toHaveLength(1);checkActualShell(h,id,false); }
    finally {h.dispose();}
  });
}
