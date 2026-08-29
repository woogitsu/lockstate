import { describe, expect, it, vi } from 'vitest';
import {
  type AsyncActionFailure,
  AsyncActionGate,
  createBusyGroup,
  describeActionError,
  runReported,
} from '../../src/ui/primitives/async-action';

/**
 * Issue #65. Two "New prison" taps in quick succession wrote a slot row,
 * blocked for 15s on a simulation worker already busy with the first
 * session, and left a `New Prison (0 gen)` orphan behind while the timeout
 * escaped to the console as an unhandled rejection.
 *
 * `AsyncActionGate` is the UI-side half of the fix, and it is a primitive
 * rather than a save-panel detail because the HUD's transport controls and
 * every later panel need the same discipline. It is pure -- no DOM, no
 * timers, no globals -- so the refusal and rejection-ownership rules are
 * proven in the default `node` Vitest environment, exactly as
 * `ui-save-panel-status.test.ts` proves the panel's status mapping.
 *
 * The panel-level claim ("a second create is refused rather than issued,
 * with nothing leaked") needs a real DOM and real clicks, so it is proven
 * against a real browser by the `save panel concurrency (issue #65)` block
 * in `tests/browser/ui-shell.spec.ts`.
 */

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AsyncActionGate: a second action while one is in flight is refused, not queued', () => {
  it('does not invoke the action a second time while the first is outstanding', async () => {
    const gate = new AsyncActionGate({ onError: () => {} });
    const pending = deferred();
    const action = vi.fn(() => pending.promise);

    expect(gate.run('create', action)).toBe('started');
    // The refused call must not reach the controller at all. Refusing
    // *after* issuing the request is what produced the orphan row.
    expect(gate.run('create', action)).toBe('refused-busy');
    expect(gate.run('save', action)).toBe('refused-busy');
    expect(action).toHaveBeenCalledTimes(1);

    pending.resolve();
    await gate.whenSettled();

    // Once settled the gate is reusable -- refusal is not a latch.
    expect(gate.run('create', action)).toBe('started');
    expect(action).toHaveBeenCalledTimes(2);
    pending.resolve();
    await gate.whenSettled();
  });

  it('reports which action is in flight, so a status line can say what is busy', () => {
    const gate = new AsyncActionGate({ onError: () => {} });
    const pending = deferred();
    expect(gate.busy).toBe(false);
    expect(gate.activeActionId).toBeUndefined();

    gate.run('load', () => pending.promise);
    expect(gate.busy).toBe(true);
    expect(gate.activeActionId).toBe('load');
  });
});

describe('AsyncActionGate: no rejection ever reaches the void', () => {
  it('routes a rejection to onError instead of leaving an unhandled promise', async () => {
    const failures: AsyncActionFailure[] = [];
    const gate = new AsyncActionGate({ onError: (failure) => failures.push(failure) });

    gate.run('create', async () => {
      throw new Error('The simulation worker did not reply within 15000ms');
    });
    await gate.whenSettled();

    expect(failures).toHaveLength(1);
    expect(failures[0]?.actionId).toBe('create');
    expect(describeActionError(failures[0]?.error)).toContain('did not reply within 15000ms');
    // And the gate is open again: a failure must not wedge every control.
    expect(gate.busy).toBe(false);
  });

  it('treats a rejection carrying undefined as a failure rather than a success', async () => {
    // `Promise.reject(undefined)` is still a rejection. Inferring failure
    // from the *value* would silently swallow it.
    const failures: AsyncActionFailure[] = [];
    const gate = new AsyncActionGate({ onError: (failure) => failures.push(failure) });

    gate.run('save', async () => {
      throw undefined; // deliberately a non-Error rejection value
    });
    await gate.whenSettled();

    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toBeUndefined();
  });

  it('clears the gate when the action throws synchronously, before returning a promise', async () => {
    const failures: AsyncActionFailure[] = [];
    const gate = new AsyncActionGate({ onError: (failure) => failures.push(failure) });

    // A synchronous throw never produces a promise to attach to. Without an
    // explicit catch the gate would stay busy and every control would stay
    // disabled for the rest of the session.
    gate.run('export', (): Promise<void> => {
      throw new TypeError('no active save');
    });

    expect(gate.busy).toBe(false);
    expect(failures).toHaveLength(1);
    expect(gate.run('export', async () => {})).toBe('started');
    await gate.whenSettled();
  });

  it('reports a successful action to no one', async () => {
    const onError = vi.fn();
    const gate = new AsyncActionGate({ onError });
    gate.run('save', async () => {});
    await gate.whenSettled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('AsyncActionGate: one busy signal, reported only on transitions', () => {
  it('signals busy exactly once on entry and once on exit', async () => {
    const transitions: boolean[] = [];
    const gate = new AsyncActionGate({
      onBusyChange: (busy) => transitions.push(busy),
      onError: () => {},
    });

    const pending = deferred();
    gate.run('create', () => pending.promise);
    gate.run('create', () => pending.promise); // refused: not a transition
    gate.run('save', () => pending.promise); // refused: not a transition
    pending.resolve();
    await gate.whenSettled();

    expect(transitions).toEqual([true, false]);
  });

  it('after disposal every action is refused and no callback fires', async () => {
    const onError = vi.fn();
    const onBusyChange = vi.fn();
    const gate = new AsyncActionGate({ onBusyChange, onError });

    const pending = deferred();
    gate.run('load', () => pending.promise);
    onBusyChange.mockClear();

    gate.dispose();
    expect(gate.run('load', async () => {})).toBe('refused-disposed');

    // The in-flight action still settles; a teardown must not resurrect the
    // UI it just tore down.
    pending.reject(new Error('cancelled by teardown'));
    await gate.whenSettled();
    expect(onError).not.toHaveBeenCalled();
    expect(onBusyChange).not.toHaveBeenCalled();
  });
});

describe('createBusyGroup: controls cannot drift out of sync with what is in flight', () => {
  function control(): { disabled: boolean; attributes: Record<string, string>; setAttribute(name: string, value: string): void } {
    return {
      disabled: false,
      attributes: {},
      setAttribute(name: string, value: string): void {
        this.attributes[name] = value;
      },
    };
  }

  it('disables every registered control together and marks them aria-busy', () => {
    const group = createBusyGroup();
    const first = control();
    const second = control();
    group.add(first);
    group.add(second);

    group.setBusy(true);
    expect([first.disabled, second.disabled]).toEqual([true, true]);
    expect(first.attributes['aria-busy']).toBe('true');

    group.setBusy(false);
    expect([first.disabled, second.disabled]).toEqual([false, false]);
    expect(second.attributes['aria-busy']).toBe('false');
  });

  it('a control registered while busy is born disabled', () => {
    // The save panel re-renders its list *during* an action, so freshly
    // built row buttons must not come back live mid-request.
    const group = createBusyGroup();
    group.setBusy(true);
    const late = control();
    group.add(late);
    expect(late.disabled).toBe(true);
  });

  it('clear() forgets controls without changing the busy state', () => {
    const group = createBusyGroup();
    const stale = control();
    group.add(stale);
    group.setBusy(true);

    group.clear();
    const fresh = control();
    group.add(fresh);
    expect(fresh.disabled).toBe(true); // busy state preserved

    group.setBusy(false);
    // The discarded control is no longer touched: the group does not retain
    // a reference to every button the panel has ever rendered.
    expect(stale.disabled).toBe(true);
    expect(fresh.disabled).toBe(false);
  });
});

/**
 * The accessibility playtest of 2026-08-29.
 *
 * Driven keyboard-only against the assembled application, with a
 * `pointerdown`/`mousedown` tripwire proving no trusted pointer event reached
 * the page: pressing *Admit* admitted a prisoner -- the count moved 1 -> 2 and
 * `data-action-failed` was `null`, so it was not a masked refusal -- and 300 ms
 * later `document.activeElement` was `document.body`. Every command-issuing
 * control in the HUD shares one of these groups (`src/ui/hud/hud.ts`), so that
 * was every command in the game: Buy, Place order, Designate, Hire, Admit and
 * every transport press, whether the host took the command or refused it.
 *
 * The mechanism is one line: `apply` sets `disabled` on every registered
 * control, a disabled element cannot hold focus, and the browser blurs it. That
 * a browser really does that needs a browser, and the wiring to five panels
 * needs the assembled page -- both are
 * `tests/browser/app-shell.spec.ts`'s, per `docs/TESTING.md`. What is here is
 * the group's side of the contract: *which* control it gives the keyboard back
 * to, and every condition under which it must not.
 */
describe('createBusyGroup: the keyboard comes back to the control that took the command', () => {
  interface FocusControl {
    disabled: boolean;
    hidden: boolean;
    isConnected: boolean;
    focused: number;
    setAttribute(name: string, value: string): void;
    focus(): void;
  }

  function focusControl(state: Partial<FocusControl> = {}): FocusControl {
    return {
      disabled: false,
      hidden: false,
      isConnected: true,
      focused: 0,
      setAttribute(): void {},
      focus(): void {
        this.focused += 1;
      },
      ...state,
    };
  }

  /** A document whose `activeElement` follows `focus()`, as a real one's does. */
  function documentWith(active: unknown): { activeElement: unknown; body: unknown } {
    return { activeElement: active, body: 'the body element' };
  }

  it('gives the keyboard back to the control it disabled', () => {
    const pressed = focusControl();
    const other = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed);
    group.add(other);

    // Disabling blurs it, which is what a browser does and what the group has
    // to assume: it reads who held the keyboard *before* it disables anything.
    group.setBusy(true);
    owner.activeElement = owner.body;

    group.setBusy(false);
    expect(pressed.focused).toBe(1);
    expect(other.focused).toBe(0);
  });

  it('gives it back only once, and not again on the next idle transition', () => {
    const pressed = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed);

    group.setBusy(true);
    owner.activeElement = owner.body;
    group.setBusy(false);
    // A second command, pressed with the pointer this time: nothing in the
    // group held the keyboard, so the group has nothing to give back and must
    // not replay the last control it remembered.
    group.setBusy(true);
    group.setBusy(false);
    expect(pressed.focused).toBe(1);
  });

  it('takes nothing back when no control of its own held the keyboard', () => {
    // The Rooms panel's *Designate* is this case: it hides itself before it
    // dispatches (`paintActions` in `src/ui/hud/rooms-panel.ts`), so it is
    // already blurred by the time the group sees it. That hand-off is the
    // panel's, and a group that guessed would focus a hidden control.
    const registered = focusControl();
    const elsewhere = focusControl();
    const owner = documentWith(elsewhere);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(registered);

    group.setBusy(true);
    owner.activeElement = owner.body;
    group.setBusy(false);

    expect(registered.focused).toBe(0);
  });

  it('does not take focus back from a player who moved it while the command was in flight', () => {
    // Tabbing away during a request is a deliberate act, and the controls this
    // group owns are all disabled at that moment, so wherever focus went is
    // somewhere else on the page. Restoring would be a theft, not a restore.
    const pressed = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed);

    group.setBusy(true);
    owner.activeElement = 'a control outside this group';
    group.setBusy(false);

    expect(pressed.focused).toBe(0);
  });

  it('does not focus a control that the panel hid while the command was in flight', () => {
    // The Build panel's queue rows are pooled and their Cancel buttons are
    // registered once at mount (`src/ui/hud/build-panel.ts`). Cancelling the
    // last order hides the row, so the control the group is about to re-enable
    // is one nothing can focus -- and focusing it would leave the page with a
    // hidden `activeElement` rather than merely a blurred one.
    const pressed = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed);

    group.setBusy(true);
    owner.activeElement = owner.body;
    pressed.hidden = true;
    group.setBusy(false);

    expect(pressed.focused).toBe(0);
  });

  it('does not focus a control that is still disabled for a reason of its own', () => {
    // Modelled with a control the group does not get to enable, because that is
    // what "disabled for a reason of its own" means: the Staff panel's *Hire*
    // is disabled until a role row is chosen (`src/ui/hud/staff-panel.ts`) and
    // the panel is the authority on that, whatever the group last wrote.
    const pressed = focusControl();
    // Defined after construction rather than passed in: an object spread reads
    // an accessor and copies its *value*, so a getter in the literal would
    // have become a plain property the group could then write to -- which is
    // how this case first passed for the wrong reason.
    Object.defineProperty(pressed, 'disabled', {
      get: () => true,
      set: () => {
        /* the panel owns this control's enabled state, whatever the group writes */
      },
    });
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed);

    group.setBusy(true);
    owner.activeElement = owner.body;
    group.setBusy(false);

    expect(pressed.focused).toBe(0);
  });

  it('gives the keyboard to the row that replaced the one the action rebuilt', () => {
    /*
     * The save panel's own case (`src/ui/save-panel.ts`). `requestLoad`
     * refreshes the list from *inside* its action, so the row that was pressed
     * is dropped from the group and detached before the gate clears, and the
     * element the group remembered can never be focused again.
     *
     * The `focusKey` is what carries the keyboard across that: it names the
     * control by what it does and which prison it does it to, so the rebuilt
     * row's own button -- a different node with the same job -- inherits it.
     */
    const pressed = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed, 'load:alpha');

    group.setBusy(true);
    owner.activeElement = owner.body;
    pressed.isConnected = false;
    group.clear();
    const rebuilt = focusControl();
    const neighbour = focusControl();
    group.add(rebuilt, 'load:alpha');
    group.add(neighbour, 'delete:alpha');
    group.setBusy(false);

    expect(rebuilt.focused).toBe(1);
    expect(neighbour.focused).toBe(0);
    expect(pressed.focused).toBe(0);
  });

  it('prefers a live control with the same key over a registered one that can no longer take focus', () => {
    /*
     * `clear()` is deliberately *not* called here, which is the whole
     * difference from the case above. A group whose rows are re-registered
     * without being dropped still holds the control that was pressed, and that
     * one is hidden rather than detached -- so "give it back to the control
     * that held it" has to mean "if it can still hold it", or the key would
     * only ever be consulted for a caller that had happened to call `clear()`
     * first. The key is what says the two are the same control; whether the
     * group was tidied is not part of that.
     */
    const pressed = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed, 'load:alpha');

    group.setBusy(true);
    owner.activeElement = owner.body;
    pressed.hidden = true;
    const rebuilt = focusControl();
    group.add(rebuilt, 'load:alpha');
    group.setBusy(false);

    expect(rebuilt.focused).toBe(1);
    expect(pressed.focused).toBe(0);
  });

  it('focuses nothing when the rebuilt list no longer holds that control at all', () => {
    // `requestDelete` is the case: the prison is gone, so no row replaces the
    // one that was pressed. A control that is really gone is not a control that
    // moved, and there is nothing here that knows what should stand in for it.
    const pressed = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed, 'delete:alpha');

    group.setBusy(true);
    owner.activeElement = owner.body;
    pressed.isConnected = false;
    group.clear();
    const survivor = focusControl();
    group.add(survivor, 'delete:beta');
    group.setBusy(false);

    expect(survivor.focused).toBe(0);
    expect(pressed.focused).toBe(0);
  });

  it('focuses nothing when a keyless control is rebuilt away', () => {
    // A control registered without a key is one built once and kept, so a
    // detached one is a bug elsewhere rather than a row that moved. The group
    // leaves the keyboard where the browser put it rather than guessing.
    const pressed = focusControl();
    const owner = documentWith(pressed);
    const group = createBusyGroup({ focusOwner: owner });
    group.add(pressed);

    group.setBusy(true);
    owner.activeElement = owner.body;
    pressed.isConnected = false;
    group.clear();
    const replacement = focusControl();
    group.add(replacement);
    group.setBusy(false);

    expect(replacement.focused).toBe(0);
    expect(pressed.focused).toBe(0);
  });

  it('works with no document at all, which is what the unit environment is', () => {
    // `vitest.config.ts` runs `environment: 'node'`, so `globalThis.document`
    // is undefined and the default focus owner is too. Nothing here may throw
    // on that path, or every existing caller of `createBusyGroup()` would.
    const group = createBusyGroup();
    const control = focusControl();
    group.add(control);
    expect(() => {
      group.setBusy(true);
      group.setBusy(false);
    }).not.toThrow();
    expect(control.focused).toBe(0);
    expect(control.disabled).toBe(false);
  });
});

describe('runReported: a notification that must not block and must not leak', () => {
  it('owns a rejection from an async notification', async () => {
    const failures: AsyncActionFailure[] = [];
    runReported('select-tab', async () => {
      throw new Error('host is wedged');
    }, (failure) => failures.push(failure));

    await Promise.resolve();
    await Promise.resolve();
    expect(failures).toHaveLength(1);
    expect(failures[0]?.actionId).toBe('select-tab');
  });

  it('owns a synchronous throw too', () => {
    const failures: AsyncActionFailure[] = [];
    runReported('toggle-panel', () => {
      throw new Error('bad handler');
    }, (failure) => failures.push(failure));
    expect(failures).toHaveLength(1);
  });

  it('runs a synchronous handler without allocating a promise', () => {
    // Chrome changes are the common case and must stay free: this is the
    // difference between a tab tap taking effect now and taking effect a
    // microtask later.
    const calls: string[] = [];
    runReported('select-tab', () => {
      calls.push('ran');
    }, () => {});
    expect(calls).toEqual(['ran']);
  });

  it('never refuses, however many times it is called', () => {
    // The opposite of the gate, on purpose: a tab tap is not a command and
    // must not be dropped because an earlier notification is still settling.
    const calls: number[] = [];
    const pending = deferred();
    for (let index = 0; index < 3; index += 1) {
      runReported('select-tab', () => {
        calls.push(index);
        return pending.promise;
      }, () => {});
    }
    expect(calls).toEqual([0, 1, 2]);
    pending.resolve();
  });
});

describe('describeActionError', () => {
  it('prefers an Error message and falls back to a string form', () => {
    expect(describeActionError(new Error('quota exceeded'))).toBe('quota exceeded');
    expect(describeActionError('plain string')).toBe('plain string');
    expect(describeActionError(undefined)).toBe('undefined');
  });
});
