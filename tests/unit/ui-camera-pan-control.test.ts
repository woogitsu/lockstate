import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { createCameraPanControl, type CameraPanDirection } from '../../src/ui/hud/camera-pan-control';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';

class ElementStub extends EventTarget {
  readonly children: ElementStub[] = []; readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {}; className = ''; textContent = '';
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
}
afterEach(() => vi.unstubAllGlobals());
const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });
function dom() { const create = () => new ElementStub(); vi.stubGlobal('document', { createElement: create, createElementNS: create }); }
const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const matches = [...source.matchAll(/onCameraPan: \(direction\) => (\{[\s\S]*?\r?\n    \}),/g)];
if (matches.length !== 1) throw new Error('Expected one actual mounted main pan callback');
function actualCallback(scene: { stepCameraPan: (direction: CameraPanDirection) => void }, changing: boolean, current: unknown) {
  return new Function('worldScene', 'rendererChanging', 'liveRendererSelection',
    `return direction => ${matches[0]![1]};`)(scene, changing, { current }) as (direction: CameraPanDirection) => void;
}
const hudSource = readFileSync(new URL('../../src/ui/hud/hud.ts', import.meta.url), 'utf8');
const mounts = [...hudSource.matchAll(/const panControl = ([^\r\n]+);/g)];
if (mounts.length !== 1) throw new Error('Expected one actual HUD pan mounting producer');
function actualMount(step?: (direction: CameraPanDirection) => void) {
  return new Function('options', 'localizer', 'createCameraPanControl', `return ${mounts[0]![1]};`)
    ({ onCameraPan: step }, localizer, createCameraPanControl) as ElementStub | undefined;
}
it.each(['world', 'oblique'])('actual %s host mount gives four labeled buttons and distinct real click callbacks', mode => {
  dom(); const step = vi.fn(); const main = actualCallback({ stepCameraPan: step }, false, { mode });
  const group = actualMount(main)!;
  expect(group.children).toHaveLength(4);
  const directions = ['left', 'up', 'down', 'right'];
  const labels = ['Pan camera left', 'Pan camera up', 'Pan camera down', 'Pan camera right'];
  group.children.forEach((button, index) => {
    expect(button.className).toContain('ui-icon-button'); expect(button.attributes.get('type')).toBe('button');
    expect(button.attributes.get('title')).toBe(labels[index]);
    expect(button.dataset.cameraPanDirection).toBe(directions[index]);
    expect(button.children[0]!.attributes.get('aria-hidden')).toBe('true');
    expect(button.children[1]!.textContent).toBe(labels[index]);
    button.dispatchEvent(new Event('click'));
  });
  expect(step.mock.calls).toEqual([['left'], ['up'], ['down'], ['right']]);
});
it('omits pan controls when the host provides no active pan capability', () => { dom(); expect(actualMount()).toBeUndefined(); });
it.each(['preparing', 'unavailable'])('actual main callback ignores pan while renderer is %s', state => {
  dom(); const step = vi.fn();
  const callback = actualCallback({ stepCameraPan: step }, state === 'preparing', state === 'unavailable' ? undefined : {});
  const group = actualMount(callback)!; group.children.forEach(button => button.dispatchEvent(new Event('click')));
  expect(step).not.toHaveBeenCalled();
});
