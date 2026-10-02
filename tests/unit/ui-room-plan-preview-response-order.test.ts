import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { RoomTemplateTool, type RoomTemplateCostQuote, type RoomTemplatePlacementRequest, type RoomTemplatePreflight } from '../../src/ui/room-template-tool';
import { installRoomTemplateWorldBridge } from '../../src/ui/room-template-world-bridge';
import { LiveRendererSelection } from '../../src/rendering/scene/live-renderer-selection';

class ElementStub extends EventTarget {
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void { super.addEventListener(type, callback, typeof options === 'boolean' ? { capture: options } : options); }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void { super.removeEventListener(type, callback, typeof options === 'boolean' ? { capture: options } : options); }
  width = 1920; height = 1080; hidden = false; textContent = '';
  namespaceURI = 'http://www.w3.org/2000/svg';
  style: Record<string, string> = {}; dataset: Record<string, string> = {};
  attributes = new Map<string, string>(); children: ElementStub[] = [];
  parentElement = { append: vi.fn() };
  append(...children: ElementStub[]) { this.children.push(...children); }
  remove = vi.fn();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  replaceChildren(...children: ElementStub[]) { this.children = children; }
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
const submissions = [...source.matchAll(/place: async request => (\{ commandSender.submit\(\{ type: 'PlaceRoomTemplate', \.\.\.request \}\); \}),/g)];
if (deactivations.length !== 1 || changes.length !== 1 || submissions.length !== 1) throw Error('Expected unique actual main callbacks');
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function pointer(canvas: ElementStub, kind: string, x: number) {
  const event = new Event(kind, { cancelable: true });
  Object.assign(event, { pointerId: 7, button: 0, buttons: kind === 'pointerdown' ? 1 : 0, clientX: x, clientY: 400 });
  canvas.dispatchEvent(event);
}
afterEach(() => vi.unstubAllGlobals());

for (const initial of ['world', 'oblique'] as const) for (const edit of ['rotation', 'mirror', 'origin', 'card'] as const) {
  for (const currentClear of [false, true]) for (const oldFirst of [false, true]) {
    it(`${initial} replacement / ${edit} / latest ${currentClear ? 'clear' : 'refused'} / old ${oldFirst ? 'first' : 'last'} keeps current geometry, quote and command`, async () => {
      vi.stubGlobal('window', new EventTarget());
            // Capture by class after install instead of predicting document allocation order.
      const nodes: ElementStub[] = [];
      const make = () => { const node = new ElementStub(); nodes.push(node); return node; };
      vi.stubGlobal('document', { createElement: make, createElementNS: make });
      let frames: Array<() => void> = [];
      vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frames.push(callback); });
      const frame = () => { const batch = frames; frames = []; for (const callback of batch) callback(); };
      const canvas = new ElementStub();
      const queries: Array<{ request: RoomTemplatePlacementRequest; reply: ReturnType<typeof deferred<RoomTemplatePreflight>> }> = [];
      const quotes: Array<ReturnType<typeof deferred<RoomTemplateCostQuote>>> = [];
      const submit = vi.fn();
      const actualPlace = new Function('commandSender', `return async request => ${submissions[0]![1]};`)({ submit }) as (request: RoomTemplatePlacementRequest) => Promise<void>;
      let holding = true;
      const tool = new RoomTemplateTool({
        preflight: request => {
          if (!holding) return Promise.resolve(currentClear ? { ok: true } : { ok: false, reason: 'object-occupied', tile: { ...request.origin } });
          const reply = deferred<RoomTemplatePreflight>(); queries.push({ request, reply }); return reply.promise;
        },
        quote: () => { const reply = deferred<RoomTemplateCostQuote>(); quotes.push(reply); return reply.promise; },
        place: actualPlace, objectFootprint: id => ({ width: 1, height: id === 'bed-wooden' ? 2 : 1 }),
      });
      tool.arm();
      let dispose = () => {};
      const install = () => { dispose = installRoomTemplateWorldBridge(canvas as unknown as HTMLCanvasElement, tool, {
        tileSize: 64, pick: p => ({ x: Math.floor(p.x / 64), y: Math.floor(p.y / 64) }), project: p => p,
        objectFootprint: id => tool.objectFootprint(id), label: (quote, verdict) => `${quote?.catalogueCostMinorUnits ?? 'pending'}:${verdict === undefined ? 'checking' : verdict.ok ? 'clear' : 'blocked'}`,
      }); };
      install();
      const oldLayer = nodes[0]!;
      pointer(canvas, 'pointermove', 800); frame();
      expect(queries).toHaveLength(1); expect(quotes).toHaveLength(1);
      const oldSnapshot = JSON.stringify({ label: oldLayer.children[1]!.textContent, ready: oldLayer.dataset.ready, polygons: oldLayer.children[0]!.children.map(n => [...n.attributes]) });
      if (edit === 'rotation') tool.select('cell-basic', false, 1);
      if (edit === 'mirror') tool.select('cell-basic', true);
      if (edit === 'card') tool.select('yard-basic');
      const scene = initial === 'world' ? new SceneStub() : new ObliqueStub();
      const ports = new Function('initialScene', 'withdrawPlanGhost', 'reinstallPlanGhost', 'ObliqueWorldScene', 'phaserGame', 'rendererHudChanged',
        `let worldScene = initialScene; let logicalViewCentre; let productionSceneSelection; const rendererViewMemory = new Map(); return { deactivate: scene => ${deactivations[0]![1]}, changed: selection => ${changes[0]![1]} };`)(
          scene, () => dispose(), install, ObliqueStub, { scene: { stop: vi.fn(), remove: vi.fn() } }, vi.fn()) as {
            deactivate(scene: SceneStub): void; changed(selection: { mode: 'world' | 'oblique'; scene: SceneStub }): void;
          };
      const controller = new LiveRendererSelection({ mode: initial, scene }, {
        ...ports, prepare: async mode => mode === 'world' ? new SceneStub() : new ObliqueStub(), activate: async () => {}, unavailable: vi.fn(),
      });
      try {
        await controller.select(initial === 'world' ? 'oblique' : 'world');
        const x = edit === 'origin' ? 864 : 800;
        pointer(canvas, 'pointermove', x); frame();
        expect(queries).toHaveLength(2); expect(quotes).toHaveLength(2);
        const layer = nodes.find(n => Reflect.get(n, 'className') === 'room-template-world-ghost' && n !== oldLayer)!;
        const current = queries[1]!.request;
        expect(current).toEqual({ templateId: edit === 'card' ? 'yard-basic' : 'cell-basic', origin: { x: edit === 'origin' ? 13 : 12, y: 6 }, ...(edit === 'rotation' ? { quarterTurns: 1 } : {}), ...(edit === 'mirror' ? { mirrorX: true } : {}) });
        const plan = tool.planAt(current.origin);
        const geometry = () => layer.children[0]!.children.map(polygon => [...polygon.attributes]);
        const chosenGeometry = geometry();
        expect(chosenGeometry).toHaveLength(plan.width * plan.height);
        expect(layer.dataset.ready).toBe('checking'); expect(layer.children[1]!.textContent).toBe('pending:checking');
        expect(submit).not.toHaveBeenCalled();
        const releaseOld = async () => {
          queries[0]!.reply.resolve(currentClear ? { ok: false, reason: 'unowned-land', tile: queries[0]!.request.origin } : { ok: true });
          quotes[0]!.resolve({ orderCount: 28, materials: [], catalogueCostMinorUnits: 111 }); await settle(); frame();
        };
        if (oldFirst) { await releaseOld(); expect(layer.dataset.ready).toBe('checking'); expect(layer.children[1]!.textContent).toBe('pending:checking'); }
        queries[1]!.reply.resolve(currentClear ? { ok: true } : { ok: false, reason: 'object-occupied', tile: current.origin });
        quotes[1]!.resolve({ orderCount: plan.width * plan.height, materials: [], catalogueCostMinorUnits: 222 });
        await settle(); frame();
        expect(layer.dataset.ready).toBe(currentClear ? 'clear' : 'blocked');
        expect(layer.children[1]!.textContent).toBe(`222:${currentClear ? 'clear' : 'blocked'}`);
        const latestGeometry = geometry();
        if (!oldFirst) await releaseOld();
        expect(geometry()).toEqual(latestGeometry);
        expect(layer.children[1]!.textContent).toBe(`222:${currentClear ? 'clear' : 'blocked'}`);
        expect(JSON.stringify({ label: oldLayer.children[1]!.textContent, ready: oldLayer.dataset.ready, polygons: oldLayer.children[0]!.children.map(n => [...n.attributes]) })).toBe(oldSnapshot);
        expect(oldLayer.remove).toHaveBeenCalledOnce();
        holding = false;
        pointer(canvas, 'pointerdown', x); pointer(canvas, 'pointerup', x); await settle(); frame();
        if (currentClear) { expect(submit).toHaveBeenCalledExactlyOnceWith({ type: 'PlaceRoomTemplate', ...current }); expect(tool.isArmed()).toBe(false); }
        else { expect(submit).not.toHaveBeenCalled(); expect(tool.isArmed()).toBe(true); }
      } finally { dispose(); }
    });
  }
}
