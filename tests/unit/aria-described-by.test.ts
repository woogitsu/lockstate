import { describe, expect, it } from 'vitest';
import { describeBy, undescribeBy } from '../../src/ui/primitives/dom';

/**
 * `aria-describedby` is a *list*, and two writers share it.
 *
 * The HUD's refusal band marks whichever control was pressed (`hud.ts`,
 * `markControl`); a panel can also describe a control with a standing note of
 * its own -- the Rooms panel does, so a player who reaches a disabled
 * *Designate* is told why rather than only that it is disabled. Before this,
 * both sides called `setAttribute` and the last writer erased the other's
 * sentence, which is invisible to sighted testing: the note stays on screen,
 * it just stops being reachable.
 *
 * Node-environment, and legitimately so. `vitest.config.ts` runs with no
 * jsdom, so nothing here may touch `document` -- but neither function does.
 * They read and write three attribute methods, which is the whole of the
 * algebra being tested, and the fake below implements exactly those three.
 * The *wiring* -- that the Rooms note reaches the Confirm button and that a
 * refusal joins it rather than replacing it -- is a DOM fact and is asserted
 * in `tests/browser/`, where a real element exists.
 */

/** The three attribute methods `describeBy`/`undescribeBy` use, and nothing else. */
function fakeElement(initial?: string): Element {
  const attributes = new Map<string, string>();
  if (initial !== undefined) attributes.set('aria-describedby', initial);
  return {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  } as unknown as Element;
}

const describedBy = (control: Element): string | null => control.getAttribute('aria-describedby');

describe('describeBy', () => {
  it('writes the id when the control had no description', () => {
    const control = fakeElement();
    describeBy(control, 'note-1');
    expect(describedBy(control)).toBe('note-1');
  });

  it('keeps the description already there', () => {
    const control = fakeElement('note-1');
    describeBy(control, 'refusal-2');
    expect(describedBy(control)).toBe('note-1 refusal-2');
  });

  it('is idempotent, so a repaint does not grow the list', () => {
    const control = fakeElement('note-1');
    describeBy(control, 'refusal-2');
    describeBy(control, 'refusal-2');
    describeBy(control, 'note-1');
    expect(describedBy(control)).toBe('note-1 refusal-2');
  });
});

describe('undescribeBy', () => {
  it('removes only its own id', () => {
    const control = fakeElement('note-1 refusal-2');
    undescribeBy(control, 'refusal-2');
    expect(describedBy(control)).toBe('note-1');
  });

  it('removes the attribute outright once nothing is left', () => {
    // `aria-describedby=""` is not the same as absent to every assistive
    // technology, so an empty list must not be written as one.
    const control = fakeElement('refusal-2');
    undescribeBy(control, 'refusal-2');
    expect(describedBy(control)).toBeNull();
  });

  it('is a no-op for an id that is not there', () => {
    const control = fakeElement('note-1');
    undescribeBy(control, 'refusal-2');
    expect(describedBy(control)).toBe('note-1');
  });

  it('leaves a control that was never described alone', () => {
    const control = fakeElement();
    undescribeBy(control, 'refusal-2');
    expect(describedBy(control)).toBeNull();
  });
});

describe('the round trip the HUD actually performs', () => {
  it('returns the control to its own description after a refusal clears', () => {
    // The sequence a player produces: the panel describes Confirm with its
    // note, a refusal marks the same control, the refusal later clears. The
    // note must survive all three, which is the failure this pair exists for.
    const confirm = fakeElement();
    describeBy(confirm, 'hud-rooms-note-1');
    describeBy(confirm, 'hud-refusal-2');
    expect(describedBy(confirm)).toBe('hud-rooms-note-1 hud-refusal-2');
    undescribeBy(confirm, 'hud-refusal-2');
    expect(describedBy(confirm)).toBe('hud-rooms-note-1');
  });
});
