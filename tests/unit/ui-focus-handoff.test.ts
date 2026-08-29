import { describe, expect, it, vi } from 'vitest';
import {
  type FocusOwner,
  type FocusableControl,
  ambientFocusOwner,
  canTakeFocus,
  handOffFocus,
  holdsFocus,
  keyboardIsUnclaimed,
} from '../../src/ui/primitives/focus-handoff';

/**
 * The accessibility playtest of 2026-08-29, as arithmetic.
 *
 * Driven keyboard-only against the assembled application, with a
 * `pointerdown`/`mousedown` tripwire proving no trusted pointer event ever
 * reached the page, every command-issuing control in the HUD left
 * `document.activeElement === document.body` after it was pressed. Two
 * mechanisms produced that, and `src/ui/primitives/focus-handoff.ts` is the
 * rule both of them are fixed by: a control the busy group **disabled**, and a
 * control the Rooms panel **hid**. A blurred control is not re-focused by
 * un-blurring it.
 *
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so none of that
 * can be observed from this suite -- which is exactly why the *decisions* were
 * extracted into predicates that take what they inspect as a parameter. What
 * lives here is when focus may be given back and to what; that a real browser
 * really blurs a disabled control, and that the group really is wired to five
 * panels, is `tests/browser/app-shell.spec.ts`'s, per `docs/TESTING.md`.
 */

/** A control that models only the part of the state a case is about. */
function control(state: Partial<FocusableControl> = {}): FocusableControl {
  return { focus: (): void => {}, ...state };
}

describe('holdsFocus: only the control that has the keyboard has it', () => {
  it('is true for the active element and false for every other control', () => {
    const active = control();
    const other = control();
    const owner: FocusOwner = { activeElement: active, body: 'the body' };

    expect(holdsFocus(owner, active)).toBe(true);
    expect(holdsFocus(owner, other)).toBe(false);
  });

  it('is false with no document at all, rather than throwing', () => {
    // The `node` environment this suite runs in has none, and a primitive that
    // threw on import there would be a primitive the unit suite could not reach.
    expect(holdsFocus(undefined, control())).toBe(false);
    expect(ambientFocusOwner()).toBeUndefined();
  });

  it('is false for a control that is not there', () => {
    expect(holdsFocus({ activeElement: null }, undefined)).toBe(false);
    expect(holdsFocus({ activeElement: null }, null)).toBe(false);
  });
});

describe('keyboardIsUnclaimed: focus on the body is focus going spare', () => {
  it('is true when nothing holds focus and when the body does', () => {
    // Both are what a browser leaves behind after blurring a control: `null`
    // in a document that has not been interacted with, and the body element
    // once one has.
    const body = { tag: 'body' };
    expect(keyboardIsUnclaimed({ activeElement: null, body })).toBe(true);
    expect(keyboardIsUnclaimed({ activeElement: body, body })).toBe(true);
  });

  it('is false when any other element holds focus', () => {
    // The player tabbed away while the request was in flight. Taking focus
    // back from them would be a worse bug than the one being fixed, so this
    // is the guard that makes a restore a restore rather than a theft.
    const body = { tag: 'body' };
    expect(keyboardIsUnclaimed({ activeElement: { tag: 'button' }, body })).toBe(false);
  });

  it('is false with no document', () => {
    expect(keyboardIsUnclaimed(undefined)).toBe(false);
  });
});

describe('canTakeFocus: three states in which giving focus back is not possible', () => {
  it('accepts a plain, live, focusable control', () => {
    expect(canTakeFocus(control())).toBe(true);
  });

  it('refuses a control that is still disabled', () => {
    // The Staff panel's *Hire* is disabled until a role row is chosen
    // (`src/ui/hud/staff-panel.ts`). Focusing it would do nothing at all, and
    // the caller needs to know that so it can leave focus where it is.
    expect(canTakeFocus(control({ disabled: true }))).toBe(false);
  });

  it('refuses a hidden control, including `hidden="until-found"`', () => {
    // The Rooms panel hides the control that was pressed as part of the same
    // change (`paintActions`). `until-found` is a real value of
    // `HTMLElement.hidden` and it is hidden too, so anything but `false`
    // counts.
    expect(canTakeFocus(control({ hidden: true }))).toBe(false);
    expect(canTakeFocus(control({ hidden: 'until-found' }))).toBe(false);
    expect(canTakeFocus(control({ hidden: false }))).toBe(true);
  });

  it('refuses a control that has been taken out of the document', () => {
    // The save panel rebuilds its rows from inside its own action, so the
    // button that was pressed is a detached node by the time the gate clears.
    expect(canTakeFocus(control({ isConnected: false }))).toBe(false);
    expect(canTakeFocus(control({ isConnected: true }))).toBe(true);
  });

  it('refuses a control with nothing to focus, and refuses nothing at all', () => {
    expect(canTakeFocus({ focus: undefined })).toBe(false);
    expect(canTakeFocus(undefined)).toBe(false);
  });
});

describe('handOffFocus: focuses what can hold focus and reports which it did', () => {
  it('focuses a usable control exactly once and says so', () => {
    const focus = vi.fn();
    expect(handOffFocus({ focus })).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('declines an unusable control without touching it', () => {
    const focus = vi.fn();
    expect(handOffFocus({ focus, disabled: true })).toBe(false);
    expect(handOffFocus({ focus, hidden: true })).toBe(false);
    expect(handOffFocus({ focus, isConnected: false })).toBe(false);
    expect(handOffFocus(undefined)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });
});
