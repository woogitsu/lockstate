import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomTemplateTool } from '../../src/ui/room-template-tool';
import { installRoomTemplateWorldBridge } from '../../src/ui/room-template-world-bridge';

class ElementStub extends EventTarget {
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

function pointer(target: EventTarget, kind: string): void {
  const event = new Event(kind, { cancelable: true });
  Object.assign(event, { pointerId: 7, button: 0, buttons: kind === 'pointerdown' ? 1 : 0, clientX: 800, clientY: 400 });
  target.dispatchEvent(event);
}

function harness(): { canvas: ElementStub; window: EventTarget; tool: RoomTemplateTool; place: ReturnType<typeof vi.fn>; dispose: () => void } {
  const canvas = new ElementStub();
  const window = new EventTarget();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { createElement: () => new ElementStub(), createElementNS: () => new ElementStub() });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const place = vi.fn(async () => {});
  const tool = new RoomTemplateTool({ preflight: async () => ({ ok: true }), place });
  tool.arm();
  const dispose = installRoomTemplateWorldBridge(canvas as unknown as HTMLCanvasElement, tool, {
    tileSize: 32, pick: () => ({ x: 12, y: 8 }), project: p => p,
    objectFootprint: () => undefined, label: () => '',
  });
  return { canvas, window, tool, place, dispose };
}

afterEach(() => vi.unstubAllGlobals());

describe('room plan pointer gesture ownership', () => {
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
