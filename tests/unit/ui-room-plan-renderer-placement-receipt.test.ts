import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { RoomTemplateTool, type RoomTemplatePreflight, type RoomTemplatePlacementRequest } from '../../src/ui/room-template-tool';
import { installRoomTemplateWorldBridge } from '../../src/ui/room-template-world-bridge';
import { LiveRendererSelection } from '../../src/rendering/scene/live-renderer-selection';

class ElementStub extends EventTarget {
  width = 1920; height = 1080;
  style = {}; dataset = {}; parentElement = { append: vi.fn() };
  append() {} remove() {} setAttribute() {} replaceChildren() {}
  getBoundingClientRect() { return { x: 0, y: 0, width: this.width, height: this.height }; }
}
class SceneStub {
  sys = { isActive: () => true, settings: { key: 'WorldScene' } };
  captureCameraView() { return { centre: { x: 1024, y: 1024 }, zoom: 1 }; }
}
class ObliqueStub extends SceneStub { releaseSessionInput = vi.fn(); }
const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const deactivations = [...source.matchAll(/deactivate: scene => (\{[\s\S]*?\r?\n  \}),\r?\n  activate:/g)];
const changes = [...source.matchAll(/changed: selection => (\{[\s\S]*?\r?\n  \}),\r?\n  unavailable:/g)];
if (deactivations.length !== 1 || changes.length !== 1) throw Error('Expected unique actual renderer lifecycle callbacks');
const submissions = [...source.matchAll(/place: async request => (\{ commandSender.submit\(\{ type: 'PlaceRoomTemplate', \.\.\.request \}\); \}),/g)];
if (submissions.length !== 1) throw Error('Expected unique actual room-plan placement submission callback');

afterEach(() => vi.unstubAllGlobals());
function pointer(canvas: ElementStub, type: string) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 7, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: 800, clientY: 400 });
  canvas.dispatchEvent(event);
}

async function setup(initialMode: 'world' | 'oblique', delayRefusal = false, actualPreflight = false) {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { createElement: () => new ElementStub(), createElementNS: () => new ElementStub() });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const canvas = new ElementStub();
  let accept!: () => void;
  let settlePreflight!: () => void;
  let queries = 0;
  const preflight = vi.fn(async (): Promise<RoomTemplatePreflight> => {
    queries++;
    if ((delayRefusal || actualPreflight) && queries === 2) return new Promise(resolve => {
      settlePreflight = () => resolve(delayRefusal ? { ok: false, reason: 'unowned-land', tile: { x: 12, y: 6 } } : { ok: true });
    });
    return { ok: true };
  });
  const submit = vi.fn();
  const actualSubmit = new Function('commandSender', `return async request => ${submissions[0]![1]};`)({ submit }) as (request: RoomTemplatePlacementRequest) => Promise<void>;
  const place = actualPreflight ? vi.fn(actualSubmit) : vi.fn(() => new Promise<void>(resolve => { accept = resolve; }));
  const tool = new RoomTemplateTool({ preflight, place });
  tool.arm();
  let dispose = () => {};
  const install = () => { dispose = installRoomTemplateWorldBridge(canvas as unknown as HTMLCanvasElement, tool, {
    tileSize: 64, pick: p => ({ x: Math.floor(p.x / 64), y: Math.floor(p.y / 64) }), project: p => p,
    objectFootprint: () => undefined, label: () => '',
  }); };
  install();
  const scene = initialMode === 'world' ? new SceneStub() : new ObliqueStub();
  // Execute main's actual unchanged lifecycle bodies, not a copied disposal
  // sequence. Only engine scene hosting and asset preparation are destinations.
  const ports = new Function('initialScene', 'withdrawPlanGhost', 'reinstallPlanGhost', 'ObliqueWorldScene', 'phaserGame', 'rendererHudChanged',
    `let worldScene = initialScene; let logicalViewCentre; let productionSceneSelection; const rendererViewMemory = new Map();
     return { deactivate: scene => ${deactivations[0]![1]}, changed: selection => ${changes[0]![1]} };`)(
      scene, () => dispose(), install, ObliqueStub, { scene: { stop: vi.fn(), remove: vi.fn() } }, vi.fn()) as {
        deactivate(scene: SceneStub): void;
        changed(selection: { mode: 'world' | 'oblique'; scene: SceneStub }): void;
      };
  const controller = new LiveRendererSelection({ mode: initialMode, scene }, {
    ...ports, prepare: async mode => mode === 'world' ? new SceneStub() : new ObliqueStub(), activate: async () => {}, unavailable: vi.fn(),
  });
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
  if (delayRefusal || actualPreflight) await vi.waitFor(() => expect(preflight).toHaveBeenCalledTimes(2));
  else await vi.waitFor(() => expect(place).toHaveBeenCalledExactlyOnceWith({ templateId: 'cell-basic', origin: { x: 12, y: 6 } }));
  return { tool, place, submit, canvas, controller, settle: () => delayRefusal || actualPreflight ? settlePreflight() : accept(), dispose: () => dispose() };
}

for (const initialMode of ['world', 'oblique'] as const) {
  it(`${initialMode}: accepted unchanged room-plan placement stands down after actual renderer replacement`, async () => {
    const h = await setup(initialMode);
    try {
      const revision = h.tool.revision;
      await h.controller.select(initialMode === 'world' ? 'oblique' : 'world');
      expect(h.tool.revision).toBe(revision);
      expect(h.tool.isArmed()).toBe(true);
      h.settle();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(Reflect.get(h.tool, 'busy')).toBe(false);
      expect(h.place).toHaveBeenCalledOnce();
      expect(h.tool.isArmed()).toBe(false);
    } finally { h.dispose(); }
  });
  it(`${initialMode}: normal accepted placement stands down without replacement`, async () => {
    const h = await setup(initialMode);
    try {
      h.settle(); for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(h.tool.isArmed()).toBe(false);
      expect(h.place).toHaveBeenCalledOnce();
    } finally { h.dispose(); }
  });
  it(`${initialMode}: renderer replacement does not let an old accepted receipt cancel a newly selected plan`, async () => {
    const h = await setup(initialMode);
    try {
      await h.controller.select(initialMode === 'world' ? 'oblique' : 'world');
      h.tool.standDown(); h.tool.select('yard-basic'); h.tool.arm();
      const revision = h.tool.revision;
      h.settle(); for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(h.tool.isArmed()).toBe(true); expect(h.tool.revision).toBe(revision);
      expect(h.tool.planAt({ x: 0, y: 0 }).id).toBe('yard-basic');
      expect(h.place).toHaveBeenCalledOnce();
    } finally { h.dispose(); }
  });
  it(`${initialMode}: a refused placement after replacement leaves the same tool armed without placing`, async () => {
    const h = await setup(initialMode, true);
    try {
      const revision = h.tool.revision;
      await h.controller.select(initialMode === 'world' ? 'oblique' : 'world');
      h.settle(); for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(Reflect.get(h.tool, 'busy')).toBe(false);
      expect(h.tool.isArmed()).toBe(true); expect(h.tool.revision).toBe(revision);
      expect(h.place).not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });
  it(`${initialMode}: actual main submit callback stands down after renderer replacement during accepted preflight`, async () => {
    const h = await setup(initialMode, false, true);
    try {
      const revision = h.tool.revision;
      expect(h.submit).not.toHaveBeenCalled();
      await h.controller.select(initialMode === 'world' ? 'oblique' : 'world');
      expect(h.tool.revision).toBe(revision);
      h.settle(); for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(h.submit).toHaveBeenCalledExactlyOnceWith({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 12, y: 6 } });
      expect(Reflect.get(h.tool, 'busy')).toBe(false);
      expect(h.tool.isArmed()).toBe(false);
    } finally { h.dispose(); }
  });
  it(`${initialMode}: actual accepted preflight without replacement submits and stands down`, async () => {
    const h = await setup(initialMode, false, true);
    try {
      h.settle(); for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(h.submit).toHaveBeenCalledOnce(); expect(h.tool.isArmed()).toBe(false);
    } finally { h.dispose(); }
  });
  it(`${initialMode}: accepted preflight after replacement and rearming cannot submit the old request`, async () => {
    const h = await setup(initialMode, false, true);
    try {
      await h.controller.select(initialMode === 'world' ? 'oblique' : 'world');
      h.tool.standDown(); h.tool.select('yard-basic'); h.tool.arm();
      const revision = h.tool.revision;
      h.settle(); for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(h.submit).not.toHaveBeenCalled(); expect(h.tool.isArmed()).toBe(true); expect(h.tool.revision).toBe(revision);
    } finally { h.dispose(); }
  });
}
