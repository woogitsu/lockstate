import { describe, expect, it, vi } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { LifecycleSaveHandler, type LifecycleSaveTrigger } from '../../src/persistence/session/lifecycle';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { SessionController } from '../../src/persistence/session/session-controller';

/** Minimal EventTarget stand-in so this runs in the default `node` Vitest environment (no DOM), per docs/TESTING.md. */
class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  public removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }

  public dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(new Event(type));
      else listener.handleEvent(new Event(type));
    }
  }

  public listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

/**
 * Two doubles, not one, because the production wiring is two targets:
 * `visibilitychange` comes from `document` and `pagehide` from `window`
 * (issue #92). A single shared double would receive whatever a test
 * dispatched at it and so could not tell the two registrations apart --
 * which is how #92 went unnoticed here. These tests pin *which* target each
 * listener lands on; that a real browser-generated `pagehide` reaches the
 * real `window` is only provable a layer up, in
 * `tests/browser/lifecycle-save.spec.ts`.
 */
async function buildHarness(visibility: { value: DocumentVisibilityState }) {
  const store = new MemoryLocalSaveStore();
  const controller = new SessionController(new PrisonSaveRepository(store), new InProcessSessionHost(), { gameVersion: 'test-version' });
  const visibilityTarget = new FakeEventTarget();
  const pageTransitionTarget = new FakeEventTarget();
  const attempts: LifecycleSaveTrigger[] = [];
  const handler = new LifecycleSaveHandler(controller, {
    targets: { visibility: visibilityTarget, pageTransition: pageTransitionTarget },
    visibilityState: () => visibility.value,
    onAttempt: (trigger) => attempts.push(trigger),
  });
  handler.attach();
  return { store, controller, visibilityTarget, pageTransitionTarget, attempts, handler };
}

describe('LifecycleSaveHandler: best-effort, never load-bearing', () => {
  it('saves when the tab becomes hidden', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, visibilityTarget, attempts } = await buildHarness(visibility);
    await controller.createPrison('prison-1');
    const revisionBefore = controller.getActiveSession()!.revision;

    visibility.value = 'hidden';
    visibilityTarget.dispatch('visibilitychange');
    await vi.waitFor(() => expect(controller.getActiveSession()!.revision).toBe(revisionBefore + 1));

    expect(attempts).toEqual(['visibility-hidden']);
  });

  it('ignores a visibilitychange that leaves the tab visible', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, visibilityTarget, attempts } = await buildHarness(visibility);
    await controller.createPrison('prison-1');

    visibilityTarget.dispatch('visibilitychange');
    expect(attempts).toEqual([]);
  });

  it('saves on pagehide', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, pageTransitionTarget, attempts } = await buildHarness(visibility);
    await controller.createPrison('prison-1');
    const revisionBefore = controller.getActiveSession()!.revision;

    pageTransitionTarget.dispatch('pagehide');
    await vi.waitFor(() => expect(controller.getActiveSession()!.revision).toBe(revisionBefore + 1));

    expect(attempts).toEqual(['pagehide']);
  });

  /**
   * Issue #92: both listeners used to go on one target, so in a browser
   * `pagehide` sat on `document` and never fired. This pins each listener to
   * its own target -- the events are not interchangeable, and neither
   * registration may drift onto the other's object.
   */
  it('registers each event on its own target and nowhere else', async () => {
    const visibility = { value: 'hidden' as DocumentVisibilityState };
    const { controller, visibilityTarget, pageTransitionTarget, attempts } = await buildHarness(visibility);
    await controller.createPrison('prison-1');

    expect(visibilityTarget.listenerCount('pagehide')).toBe(0);
    expect(pageTransitionTarget.listenerCount('visibilitychange')).toBe(0);

    // Crossed dispatches reach nothing, so a save is never attempted.
    visibilityTarget.dispatch('pagehide');
    pageTransitionTarget.dispatch('visibilitychange');
    expect(attempts).toEqual([]);
  });

  it('never listens to `unload` -- it blocks bfcache and does not fire on mobile', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { visibilityTarget, pageTransitionTarget } = await buildHarness(visibility);
    for (const target of [visibilityTarget, pageTransitionTarget]) {
      expect(target.listenerCount('unload')).toBe(0);
      expect(target.listenerCount('beforeunload')).toBe(0);
    }
    expect(visibilityTarget.listenerCount('visibilitychange')).toBe(1);
    expect(pageTransitionTarget.listenerCount('pagehide')).toBe(1);
  });

  it('does nothing when there is no active session', async () => {
    const visibility = { value: 'hidden' as DocumentVisibilityState };
    const { visibilityTarget, pageTransitionTarget, attempts } = await buildHarness(visibility);

    visibilityTarget.dispatch('visibilitychange');
    pageTransitionTarget.dispatch('pagehide');
    expect(attempts).toEqual([]);
  });

  /**
   * The whole point of the "best-effort" contract: a lifecycle save that
   * fails must not throw into the page's event handler, and correctness
   * must not depend on it having succeeded.
   */
  it('swallows a failing lifecycle save instead of throwing out of the event handler', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, store, visibilityTarget } = await buildHarness(visibility);
    await controller.createPrison('prison-1');

    const quotaError = new Error('quota');
    quotaError.name = 'QuotaExceededError';
    store.failNextWrite = quotaError;

    visibility.value = 'hidden';
    expect(() => visibilityTarget.dispatch('visibilitychange')).not.toThrow();

    // The failure is still recorded for the UI to surface later.
    await vi.waitFor(() => expect(controller.getLastSaveResult()?.ok).toBe(false));
  });

  it('detach removes every listener', async () => {
    const visibility = { value: 'hidden' as DocumentVisibilityState };
    const { controller, visibilityTarget, pageTransitionTarget, attempts, handler } = await buildHarness(visibility);
    await controller.createPrison('prison-1');

    handler.detach();
    expect(visibilityTarget.listenerCount('visibilitychange')).toBe(0);
    expect(pageTransitionTarget.listenerCount('pagehide')).toBe(0);

    visibilityTarget.dispatch('visibilitychange');
    pageTransitionTarget.dispatch('pagehide');
    expect(attempts).toEqual([]);
  });
});
