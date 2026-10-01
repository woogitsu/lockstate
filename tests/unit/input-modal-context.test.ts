import { describe, expect, it } from 'vitest';
import { activeKeyboardContexts, KeyboardInputAdapter, DEFAULT_KEYBOARD_BINDINGS } from '../../src/input';

function documentState(tag = 'BUTTON'): Pick<Document, 'activeElement' | 'querySelector'> & { modal: boolean } {
  const state = { modal: true, activeElement: { tagName: tag } as Element,
    querySelector: ((_selector: string) => state.modal ? { tagName: 'DIALOG' } as Element : null) as Document['querySelector'] };
  return state;
}

describe('native modal keyboard context', () => {
  it('excludes world camera actions while a room card button owns modal focus', () => {
    const doc = documentState();
    const keyboard = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => activeKeyboardContexts(doc));
    expect(keyboard.keyDown({ code: 'ArrowRight' })).toEqual([]);
    expect(keyboard.isActive('camera.right')).toBe(false);
    expect(keyboard.keyDown({ code: 'KeyE' })).toEqual([]);
    expect(keyboard.isActive('camera.rotate.right')).toBe(false);
  });
  it('suppresses an already held world key when a modal opens, and resumes after close', () => {
    const doc = documentState(); doc.modal = false;
    const keyboard = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => activeKeyboardContexts(doc));
    keyboard.keyDown({ code: 'ArrowRight' });
    expect(keyboard.isActive('camera.right')).toBe(true);
    doc.modal = true;
    expect(keyboard.isActive('camera.right')).toBe(false);
    keyboard.keyUp({ code: 'ArrowRight' });
    doc.modal = false;
    expect(keyboard.isActive('camera.right')).toBe(false);
    keyboard.keyDown({ code: 'ArrowRight' });
    expect(keyboard.isActive('camera.right')).toBe(true);
  });
  it('preserves text-entry precedence and the registered modal Escape action', () => {
    const doc = documentState('INPUT');
    expect(activeKeyboardContexts(doc)).toEqual(['text-entry']);
    const keyboard = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => activeKeyboardContexts(documentState()));
    expect(keyboard.keyDown({ code: 'Escape' })).toMatchObject([{ action: 'build.cancel', phase: 'started' }]);
  });
  it('does not arm camera movement from a key first pressed inside a text field or modal', () => {
    let activeTag = 'INPUT';
    let modal = false;
    const doc = {
      get activeElement() { return { tagName: activeTag } as Element; },
      querySelector: ((_selector: string) => modal ? { tagName: 'DIALOG' } as Element : null) as Document['querySelector'],
    };
    const keyboard = new KeyboardInputAdapter(DEFAULT_KEYBOARD_BINDINGS, () => activeKeyboardContexts(doc));
    expect(keyboard.keyDown({ code: 'KeyE' })).toEqual([]);
    activeTag = 'CANVAS';
    expect(keyboard.isActive('camera.rotate.right')).toBe(false);
    keyboard.keyUp({ code: 'KeyE' });
    expect(keyboard.keyDown({ code: 'KeyE' })).toMatchObject([{ action: 'camera.rotate.right', phase: 'started' }]);
    expect(keyboard.isActive('camera.rotate.right')).toBe(true);
    keyboard.keyUp({ code: 'KeyE' });

    modal = true;
    expect(keyboard.keyDown({ code: 'ArrowRight' })).toEqual([]);
    modal = false;
    expect(keyboard.isActive('camera.right')).toBe(false);
  });
});
