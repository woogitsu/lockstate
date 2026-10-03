import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_KEYBOARD_BINDINGS, KeyboardInputAdapter } from '../../src/input';
import { createResizeSeparator } from '../../src/ui/primitives/resize-separator';

class ElementStub extends EventTarget {
  className = '';
  readonly style = {};
  readonly attributes = new Map<string, string>();
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
}
afterEach(() => vi.unstubAllGlobals());

// Node EventTarget has no DOM parent. Deliver the real control listener first,
// then the real scene adapter only if propagation continues. Like the scene,
// this bridge does not treat preventDefault as a keyboard ownership transfer.
function dispatchToScene(node: HTMLElement, keyboard: KeyboardInputAdapter, key: string): Event {
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperties(event, { key: { value: key }, code: { value: key }, shiftKey: { value: false } });
  let stopped = false;
  const stop = event.stopPropagation.bind(event);
  event.stopPropagation = () => { stopped = true; stop(); };
  node.dispatchEvent(event);
  if (!stopped) keyboard.keyDown({ code: key });
  return event;
}

for (const { key, acknowledged, action } of [
  { key: 'ArrowLeft', acknowledged: true, action: 'camera.left' },
  { key: 'ArrowDown', acknowledged: false, action: 'camera.down' },
] as const) {
  it(`${acknowledged ? 'acknowledged' : 'unhandled'} separator ${key} preserves its actual keyboard owner`, () => {
    vi.stubGlobal('document', { createElement: () => new ElementStub() });
    const keyboard = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => ['world']);
    const resize = vi.fn();
    const separator = createResizeSeparator({ label: 'Resize inspector', axis: 'x', growth: -1, size: 300, defaultSize: 300, range: { min: 260, max: 600 }, onResize: resize });
    try {
      const event = dispatchToScene(separator.element, keyboard, key);
      expect(event.defaultPrevented).toBe(acknowledged);
      expect(resize.mock.calls).toEqual(acknowledged ? [[310, 'keyboard']] : []);
      expect(keyboard.isActive(action)).toBe(!acknowledged);
      keyboard.keyUp({ code: key });
      expect(keyboard.isActive(action)).toBe(false);
      expect(keyboard.keyDown({ code: 'KeyW' })).toMatchObject([{ action: 'camera.up', phase: 'started' }]);
      keyboard.keyUp({ code: 'KeyW' });
      expect(keyboard.isActive('camera.up')).toBe(false);
    } finally { separator.destroy(); }
  });
}
