import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';
import { installRoomTemplateWorldBridge } from '../../src/ui/room-template-world-bridge';

class ElementStub extends EventTarget {
  public style: Record<string, string> = {};
  public dataset: Record<string, string> = {};
  public replaceChildren = vi.fn();
  public width = 1920;
  public height = 1080;
  public parentElement = { append: vi.fn() };
  public append = vi.fn();
  public remove = vi.fn();
  public setAttribute = vi.fn();
  public getBoundingClientRect(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }
}

function pointer(target: EventTarget, kind: string, clientX = 800): void {
  const event = new Event(kind, { cancelable: true });
  Object.assign(event, { pointerId: 7, button: 0, buttons: kind === 'pointerdown' ? 1 : 0, clientX, clientY: 400 });
  target.dispatchEvent(event);
}

function harness(preparePreview?: (screen: { x: number; y: number }, physical: boolean) => void): { canvas: ElementStub; window: EventTarget; tool: RoomTemplateTool; place: ReturnType<typeof vi.fn>; dispose: () => void } {
  const canvas = new ElementStub();
  const window = new EventTarget();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { createElement: () => new ElementStub(), createElementNS: () => new ElementStub() });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const place = vi.fn(async () => {});
  const tool = new RoomTemplateTool({ preflight: async () => ({ ok: true }), place });
  tool.arm();
  const dispose = installRoomTemplateWorldBridge(canvas as unknown as HTMLCanvasElement, tool, {
    tileSize: 32, pick: p => ({ x: Math.floor(p.x / 32) - 13, y: Math.floor(p.y / 32) - 4 }), project: p => p,
    objectFootprint: () => undefined, label: () => '', ...(preparePreview === undefined ? {} : { preparePreview }),
  });
  return { canvas, window, tool, place, dispose };
}

afterEach(() => vi.unstubAllGlobals());

describe('room plan pointer gesture ownership', () => {
  it('preserves the armed plan after another UI owner consumes Escape, then accepts an unconsumed Escape', () => {
    const h = harness();
    const consumed = new Event('keydown', { cancelable: true });
    Object.assign(consumed, { key: 'Escape' });
    consumed.preventDefault();
    h.window.dispatchEvent(consumed);
    expect(h.tool.isArmed()).toBe(true);
    const world = new Event('keydown', { cancelable: true });
    Object.assign(world, { key: 'Escape' });
    h.window.dispatchEvent(world);
    expect(h.tool.isArmed()).toBe(false);
    h.dispose();
    h.tool.arm();
    h.window.dispatchEvent(world);
    expect(h.tool.isArmed()).toBe(true);
  });

  it('reports physical movement during camera-button gestures without placing', () => {
    const prepare = vi.fn();
    const h = harness(prepare);
    const event = new Event('pointermove', { cancelable: true });
    Object.assign(event, { pointerId: 7, button: 2, buttons: 2, clientX: 810, clientY: 400 });
    h.canvas.dispatchEvent(event);
    expect(prepare).toHaveBeenCalledWith({ x: 810, y: 400 }, true);
    expect(h.place).not.toHaveBeenCalled();
    h.dispose();
  });

  it('disarms after an accepted placement even if the cursor moved while confirmation was pending', async () => {
    const h = harness();
    let accept!: () => void;
    h.place.mockImplementationOnce(() => new Promise<void>(resolve => { accept = resolve; }));
    pointer(h.canvas, 'pointerdown');
    pointer(h.canvas, 'pointerup');
    await vi.waitFor(() => expect(h.place).toHaveBeenCalledOnce());
    pointer(h.canvas, 'pointermove', 832);
    accept();
    await vi.waitFor(() => expect(h.tool.isArmed()).toBe(false));
    pointer(h.canvas, 'pointerdown', 832);
    pointer(h.canvas, 'pointerup', 832);
    await Promise.resolve(); await Promise.resolve();
    expect(h.place).toHaveBeenCalledOnce();
    h.dispose();
  });

  it('does not disarm a newly armed tool when an older placement confirmation arrives', async () => {
    const h = harness();
    let accept!: () => void;
    h.place.mockImplementationOnce(() => new Promise<void>(resolve => { accept = resolve; }));
    pointer(h.canvas, 'pointerdown');
    pointer(h.canvas, 'pointerup');
    await vi.waitFor(() => expect(h.place).toHaveBeenCalledOnce());
    h.tool.standDown();
    h.tool.select('yard-basic');
    h.tool.arm();
    accept();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.tool.isArmed()).toBe(true);
    h.dispose();
  });

  it.each(['pointercancel', 'lostpointercapture'])('does not place after %s interrupts a press', async kind => {
    const h = harness();
    pointer(h.canvas, 'pointerdown');
    pointer(h.canvas, kind);
    pointer(h.canvas, 'pointerup');
    await Promise.resolve(); await Promise.resolve();
    expect(h.place).not.toHaveBeenCalled();
    h.dispose();
  });

  it('does not reuse a press released outside the map', async () => {
    const h = harness();
    pointer(h.canvas, 'pointerdown');
    pointer(h.window, 'pointerup');
    pointer(h.canvas, 'pointerup');
    await Promise.resolve(); await Promise.resolve();
    expect(h.place).not.toHaveBeenCalled();
    h.dispose();
  });

  it('drops the unfinished press when the game window loses focus', async () => {
    const h = harness();
    pointer(h.canvas, 'pointerdown');
    h.window.dispatchEvent(new Event('blur'));
    pointer(h.canvas, 'pointerup');
    await Promise.resolve(); await Promise.resolve();
    expect(h.place).not.toHaveBeenCalled();
    h.dispose();
  });

  it('requires a fresh press after the selected plan changes', async () => {
    const h = harness();
    pointer(h.canvas, 'pointerdown');
    h.tool.select('yard-basic');
    pointer(h.canvas, 'pointerup');
    await Promise.resolve(); await Promise.resolve();
    expect(h.place).not.toHaveBeenCalled();
    pointer(h.canvas, 'pointerdown');
    pointer(h.canvas, 'pointerup');
    await vi.waitFor(() => expect(h.place).toHaveBeenCalledOnce());
    expect(h.place).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'yard-basic', origin: { x: 12, y: 8 } }));
    h.dispose();
  });
});


it('keeps a mirrored four-cell row under a stationary cursor when the camera picking transform changes', async () => {
  const canvas = new ElementStub();
  const events = new EventTarget();
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { createElement: () => new ElementStub(), createElementNS: () => new ElementStub() });
  let frame!: () => void;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frame = callback; });
  let cameraOffsetTiles = 0;
  const preflight = vi.fn(async () => ({ ok: true as const }));
  const place = vi.fn(async () => {});
  const tool = new RoomTemplateTool({ preflight, place, objectFootprint: id => ({ width: 1, height: id === 'bed-wooden' ? 2 : 1 }) });
  tool.select('cell-row-four', true);
  tool.arm();
  const dispose = installRoomTemplateWorldBridge(canvas as unknown as HTMLCanvasElement, tool, {
    tileSize: 32,
    pick: point => ({ x: Math.floor(point.x / 32) + cameraOffsetTiles, y: Math.floor(point.y / 32) }),
    project: point => ({ x: point.x - cameraOffsetTiles * 32, y: point.y }),
    objectFootprint: id => tool.objectFootprint(id), label: () => '',
  });
  pointer(canvas, 'pointermove');
  await Promise.resolve(); await Promise.resolve();
  frame();
  expect(preflight).toHaveBeenLastCalledWith({ templateId: 'cell-row-four', origin: { x: 25, y: 12 }, mirrorX: true });
  cameraOffsetTiles = 4;
  frame();
  await Promise.resolve(); await Promise.resolve();
  expect(preflight).toHaveBeenLastCalledWith({ templateId: 'cell-row-four', origin: { x: 29, y: 12 }, mirrorX: true });
  frame(); frame(); frame();
  expect(preflight).toHaveBeenCalledTimes(2);
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup');
  await vi.waitFor(() => expect(place).toHaveBeenCalledWith({ templateId: 'cell-row-four', origin: { x: 29, y: 12 }, mirrorX: true }));
  dispose();
});


it('starts and re-arms a keyboard-selected plan from the unchanged map hover', () => {
  const canvas = new ElementStub();
  const events = new EventTarget();
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { createElement: () => new ElementStub(), createElementNS: () => new ElementStub() });
  let frame!: () => void;
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { frame = callback; });
  const preflight = vi.fn(async () => ({ ok: true as const }));
  const tool = new RoomTemplateTool({ preflight, place: async () => {} });
  const dispose = installRoomTemplateWorldBridge(canvas as unknown as HTMLCanvasElement, tool, {
    tileSize: 32, pick: p => ({ x: Math.floor(p.x / 32), y: Math.floor(p.y / 32) }), project: p => p, objectFootprint: () => undefined, label: () => '',
  });
  pointer(canvas, 'pointermove');
  frame();
  expect(preflight).not.toHaveBeenCalled();
  tool.select('cell-row-four', true); tool.arm(); frame();
  expect(preflight).toHaveBeenLastCalledWith({ templateId: 'cell-row-four', origin: { x: 25, y: 12 }, mirrorX: true });
  const escape = new Event('keydown'); Object.assign(escape, { key: 'Escape' }); events.dispatchEvent(escape);
  frame();
  tool.select('yard-basic'); tool.arm(); frame();
  expect(preflight).toHaveBeenLastCalledWith({ templateId: 'yard-basic', origin: { x: 25, y: 12 } });
  events.dispatchEvent(escape); frame();
  const queries = preflight.mock.calls.length;
  pointer(events, 'pointermove', 300); // Physical movement over UI, not the canvas.
  tool.arm(); frame();
  expect(preflight).toHaveBeenCalledTimes(queries);
  pointer(canvas, 'pointermove', 832); frame();
  expect(preflight).toHaveBeenLastCalledWith({ templateId: 'yard-basic', origin: { x: 26, y: 12 } });
  dispose();
});
