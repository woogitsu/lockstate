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
});
