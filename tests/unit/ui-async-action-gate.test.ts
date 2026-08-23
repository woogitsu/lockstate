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
 * against a real browser in `tests/browser/save-panel-concurrency.spec.ts`.
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
